# Day 11 · Preload 契約、useProjects Hook 與專案列表

## 今日目標

把 Day 10 的四個新 IPC handler 透過 Preload 暴露給 React，寫一個管理專案狀態的自訂 Hook，做出可以「選資料夾 → 掃描 → 列出專案 → 重新整理」的列表。今天先不管樣式，Day 12 再加 CSS。

## 你會學到

- 用一個 `DevSpaceAPI` interface 同時約束 Preload 的實作與 Renderer 的呼叫
- 「型別宣告跟著 Preload 走」：把 `Window` 的全域宣告統一放在 `src/preload/index.d.ts`
- 自訂 Hook 把資料流程從元件抽出來
- 四態狀態機：`loading` / `ready` / `scanning` / `error`
- 元件拆分：容器（`ProjectList`）與項目（`ProjectCard`）

---

## Step 1. 契約：`src/shared/devspace-api.ts`

新增 `desktop/src/shared/devspace-api.ts`：

```ts
import type { HealthResponse, Project, ScanResponse } from './types'

export interface DevSpaceAPI {
  checkBackend(): Promise<HealthResponse>
  selectDirectory(): Promise<string | null>
  scanProjects(root: string): Promise<ScanResponse>
  listProjects(): Promise<Project[]>
  refreshProject(id: string): Promise<Project>
}
```

這個 interface 是**唯一的真相來源**：Preload 實作它、Renderer 透過 `window.devspace` 呼叫它。任一邊不一致，`pnpm typecheck` 就會失敗。

## Step 2. Preload 實作契約

**覆寫** `desktop/src/preload/index.ts`：

```ts
import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { DevSpaceAPI } from '../shared/devspace-api'

// 模板原本就有的（Day 13 會移除）
const api = {}

// 型別註記讓 TypeScript 檢查：這裡實作的方法必須與 shared/devspace-api.ts 的契約一致
const devspaceApi: DevSpaceAPI = {
  checkBackend: () => ipcRenderer.invoke('backend:health'),
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),
  scanProjects: (root) => ipcRenderer.invoke('projects:scan', root),
  listProjects: () => ipcRenderer.invoke('projects:list'),
  refreshProject: (id) => ipcRenderer.invoke('projects:refresh', id)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('devspace', devspaceApi)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.devspace = devspaceApi
}
```

`const devspaceApi: DevSpaceAPI = {...}` 這個型別註記是重點。`ipcRenderer.invoke` 回傳 `Promise<any>`，沒有註記的話任何錯字都不會被抓到。

## Step 3. 全域型別宣告搬家

**覆寫** `desktop/src/preload/index.d.ts`：

```ts
import type { ElectronAPI } from '@electron-toolkit/preload'
import type { DevSpaceAPI } from '../shared/devspace-api'

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    devspace: DevSpaceAPI
  }
}
```

**刪除** Day 3 建立的 `desktop/src/renderer/src/types/devspace.d.ts`（`rm -r desktop/src/renderer/src/types`）。

為什麼搬？模板本來就把 `Window.electron` / `Window.api` 宣告在 `src/preload/index.d.ts`，而 `tsconfig.web.json` 已經 include `src/preload/*.d.ts`。「誰暴露、誰宣告」比較好維護，Renderer 不用自己猜 Preload 給了什麼。

## Step 4. 自訂 Hook：`useProjects`

新增 `desktop/src/renderer/src/hooks/useProjects.ts`：

```ts
import { useCallback, useEffect, useState } from 'react'
import type { Project } from '../../../shared/types'

export type ProjectsStatus = 'loading' | 'ready' | 'scanning' | 'error'

export interface UseProjectsResult {
  projects: Project[]
  status: ProjectsStatus
  error: string | null
  lastRoot: string | null
  scan: () => void
  refresh: (id: string) => void
  reload: () => void
}

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error'
}

export function useProjects(): UseProjectsResult {
  const [projects, setProjects] = useState<Project[]>([])
  const [status, setStatus] = useState<ProjectsStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [lastRoot, setLastRoot] = useState<string | null>(null)

  const applyList = useCallback((list: Project[]) => {
    setProjects(list)
    setError(null)
    setStatus('ready')
  }, [])

  const applyFailure = useCallback((err: unknown) => {
    setError(toMessage(err))
    setStatus('error')
  }, [])

  // 掛載時載入：setState 只在 Promise callback 裡發生，符合 react-hooks/set-state-in-effect
  useEffect(() => {
    window.devspace.listProjects().then(applyList, applyFailure)
  }, [applyList, applyFailure])

  const reload = useCallback(() => {
    setStatus('loading')
    setError(null)
    window.devspace.listProjects().then(applyList, applyFailure)
  }, [applyList, applyFailure])

  const scan = useCallback(() => {
    window.devspace.selectDirectory().then((root) => {
      if (root === null) return

      setStatus('scanning')
      setError(null)
      setLastRoot(root)
      window.devspace.scanProjects(root).then((result) => applyList(result.projects), applyFailure)
    }, applyFailure)
  }, [applyList, applyFailure])

  const refresh = useCallback(
    (id: string) => {
      window.devspace.refreshProject(id).then((updated) => {
        setProjects((current) => current.map((p) => (p.id === id ? updated : p)))
      }, applyFailure)
    },
    [applyFailure]
  )

  return { projects, status, error, lastRoot, scan, refresh, reload }
}
```

### 設計重點

| 片段 | 為什麼 |
| --- | --- |
| 四態 `ProjectsStatus` | `scanning` 與 `loading` 分開，UI 才能顯示「正在掃描 X 目錄」而不是通用的轉圈 |
| `applyList` / `applyFailure` 共用 | 掛載載入、Retry、掃描完成三條路都用同一組 state 更新邏輯 |
| `useEffect` 裡只有 `.then(...)` | 遵守 Day 4 學到的 `react-hooks/set-state-in-effect` 規則 |
| `scan` 先 `selectDirectory()`，`null` 就直接 return | 使用者按取消不是錯誤，不改變任何 state |
| `refresh` 用 `setProjects((current) => current.map(...))` | 函式式更新，避免拿到過期的 `projects` |
| 回傳的 `scan` / `refresh` / `reload` 都是 `() => void` | 呼叫端不需要 `await`，也不會有 floating promise 警告 |

## Step 5. 元件

新增 `desktop/src/renderer/src/components/ProjectCard.tsx`：

```tsx
import type { Project } from '../../../shared/types'

interface ProjectCardProps {
  project: Project
  onRefresh: (id: string) => void
}

export function ProjectCard({ project, onRefresh }: ProjectCardProps): React.JSX.Element {
  return (
    <li className="project-card">
      <div className="project-main">
        <div className="project-title">
          <strong>{project.name}</strong>
          {project.is_dirty && (
            <span className="dirty-dot" title="Uncommitted changes">
              ●
            </span>
          )}
        </div>
        <code className="project-path">{project.path}</code>
        <div className="tech-list">
          {project.technologies.length === 0 ? (
            <span className="tech-badge muted">Unknown</span>
          ) : (
            project.technologies.map((tech) => (
              <span key={tech} className="tech-badge">
                {tech}
              </span>
            ))
          )}
        </div>
      </div>
      <div className="project-side">
        <span className="branch">{project.branch ?? 'detached'}</span>
        <button className="ghost" onClick={() => onRefresh(project.id)}>
          Refresh
        </button>
      </div>
    </li>
  )
}
```

新增 `desktop/src/renderer/src/components/ProjectList.tsx`：

```tsx
import type { Project } from '../../../shared/types'
import type { ProjectsStatus } from '../hooks/useProjects'
import { ProjectCard } from './ProjectCard'

interface ProjectListProps {
  projects: Project[]
  status: ProjectsStatus
  error: string | null
  lastRoot: string | null
  onScan: () => void
  onRefresh: (id: string) => void
  onRetry: () => void
}

export function ProjectList({
  projects,
  status,
  error,
  lastRoot,
  onScan,
  onRefresh,
  onRetry
}: ProjectListProps): React.JSX.Element {
  const busy = status === 'loading' || status === 'scanning'

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Projects</h2>
          <p>
            {lastRoot ? `Last scanned: ${lastRoot}` : 'Pick a folder to find Git repositories.'}
          </p>
        </div>
        <button onClick={onScan} disabled={busy}>
          {status === 'scanning' ? 'Scanning...' : 'Scan folder'}
        </button>
      </div>

      {error && (
        <p className="error-message">
          {error}{' '}
          <button className="ghost" onClick={onRetry}>
            Retry
          </button>
        </p>
      )}

      {status === 'loading' && <div className="empty-state">Loading projects...</div>}

      {status === 'scanning' && (
        <div className="empty-state">Scanning {lastRoot}... this can take a while.</div>
      )}

      {status === 'ready' && projects.length === 0 && (
        <div className="empty-state">No projects yet. Scan a folder to get started.</div>
      )}

      {projects.length > 0 && status !== 'scanning' && (
        <ul className="project-list">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} onRefresh={onRefresh} />
          ))}
        </ul>
      )}
    </section>
  )
}
```

`ProjectList` 是「容器」：根據 `status` 決定顯示哪一塊。`ProjectCard` 是「項目」：只負責畫一筆資料。兩者都不碰 `window.devspace`，所有副作用都在 Hook 裡，元件純粹接 props。

## Step 6. 接進 App.tsx

**覆寫** `desktop/src/renderer/src/App.tsx`：

```tsx
import { useCallback, useEffect, useState } from 'react'
import './App.css'
import type { HealthResponse } from '../../shared/types'
import { ProjectList } from './components/ProjectList'
import { useProjects } from './hooks/useProjects'

type ConnectionState = 'loading' | 'connected' | 'disconnected'

interface BackendInfo {
  service: string
  version: string
  timestamp: string
}

function App(): React.JSX.Element {
  const [status, setStatus] = useState<ConnectionState>('loading')
  const [backend, setBackend] = useState<BackendInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const projects = useProjects()

  const applyHealth = useCallback((response: HealthResponse) => {
    setBackend({
      service: response.service,
      version: response.version,
      timestamp: response.timestamp
    })
    setError(null)
    setStatus('connected')
  }, [])

  const applyFailure = useCallback((err: unknown) => {
    setBackend(null)
    setError(err instanceof Error ? err.message : 'Unknown connection error')
    setStatus('disconnected')
  }, [])

  // 使用者點按鈕：先切到 loading，再發請求
  const checkConnection = useCallback(() => {
    setStatus('loading')
    setError(null)
    window.devspace.checkBackend().then(applyHealth, applyFailure)
  }, [applyHealth, applyFailure])

  // 掛載時：初始 state 已是 'loading'，setState 只發生在 Promise callback 裡
  useEffect(() => {
    window.devspace.checkBackend().then(applyHealth, applyFailure)
  }, [applyHealth, applyFailure])

  return (
    <main className="app">
      <header className="header">
        <div>
          <span className="eyebrow">DEVELOPER WORKSPACE</span>
          <h1>DevSpace</h1>
          <p>Manage your local development environment.</p>
        </div>
      </header>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Python Backend</h2>
            <p>FastAPI connection status</p>
          </div>

          <span className={`status ${status}`}>
            {status === 'loading' && 'Checking...'}
            {status === 'connected' && 'Connected'}
            {status === 'disconnected' && 'Disconnected'}
          </span>
        </div>

        {backend && (
          <div className="details">
            <div>
              <span>Service</span>
              <strong>{backend.service}</strong>
            </div>
            <div>
              <span>Version</span>
              <strong>{backend.version}</strong>
            </div>
            <div>
              <span>Last response</span>
              <strong>{new Date(backend.timestamp).toLocaleString()}</strong>
            </div>
          </div>
        )}

        {error && <p className="error-message">Connection failed: {error}</p>}

        <button onClick={checkConnection} disabled={status === 'loading'}>
          {status === 'loading' ? 'Checking...' : 'Check connection'}
        </button>
      </section>

      <ProjectList
        projects={projects.projects}
        status={projects.status}
        error={projects.error}
        lastRoot={projects.lastRoot}
        onScan={projects.scan}
        onRefresh={projects.refresh}
        onRetry={projects.reload}
      />
    </main>
  )
}

export default App
```

與 Day 4 相比的差異：`HealthResponse` 改從 `../../shared/types` import，Projects 區塊換成 `<ProjectList />`，多了一行 `useProjects()`。Backend 面板的邏輯完全沒變。

## Step 7. 端對端驗證

兩個 Terminal 都啟動後：

1. Electron 開啟，Projects 區塊顯示「Loading projects...」然後變成「No projects yet」（Backend 記憶體是空的）。
2. 點 **Scan folder** → 原生對話框 → 選你放專案的資料夾。
3. 按鈕變 **Scanning...**，區塊顯示「Scanning /path... this can take a while.」
4. 完成後列出專案，每筆有名稱、路徑、技術標籤（還沒有樣式，先確認資料對）。
5. 在某個專案裡隨便改個檔案，點該專案的 **Refresh**，應該出現 ● dirty 標記。
6. 停掉 Python，點 Scan folder 選一個資料夾 → 顯示錯誤訊息與 Retry。

```bash
pnpm typecheck && pnpm lint
cd /Users/chinghsinc/Develop/developer-workspace-manager
git add . && git commit -m "feat(desktop): expose projects API via preload, add useProjects hook and project list"
```

---

## 驗收

- [ ] `pnpm typecheck` 與 `pnpm lint` 通過
- [ ] 選資料夾 → 掃描 → 列表出現真實專案
- [ ] Refresh 能反映 dirty 狀態變化
- [ ] 取消對話框不會改變畫面
- [ ] Python 停掉時出現錯誤訊息，Retry 在 Python 恢復後能載入
- [ ] 刻意在 `preload/index.ts` 把 `scanProjects` 拼錯，看 typecheck 怎麼抓到（改回來）

## 常見問題

**Q：掃描結束 Electron 一重啟就變空？**
記憶體 store 隨 Python process 消失。Week 3 的 SQLite 會解決。

**Q：`React.JSX.Element` 的 `React` 沒 import 會不會錯？**
不會，模板 `App.tsx` 本來就這樣寫。Day 4 常見問題有說明。

**Q：Hook 裡的 `.then(a, b)` 和 `.then(a).catch(b)` 差在哪？**
`.then(a, b)` 的 `b` 只接「原 Promise 的失敗」，不會接 `a` 自己丟出的錯。這裡 `applyList` 只做 setState 不會丟錯，所以兩參數形式更精準。

## 學習筆記

（寫下今天的心得、卡關點、想問的問題）
