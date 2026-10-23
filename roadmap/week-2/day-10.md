# Day 10 · Electron Main 重構：共用型別、Token、原生對話框

## 今日目標

把 Day 3 全部塞在 `main/index.ts` 的程式碼拆成三個檔案，加入 Token、可調整的逾時、結構化的錯誤，並新增「選擇資料夾」的原生對話框 IPC。今天 Renderer 不動，仍用 DevTools 驗證。

## 你會學到

- 為什麼需要 `src/shared/`：Main 與 Renderer 共用型別，但兩邊的 tsconfig 不同
- HTTP client 的抽象：一個 `request<T>()` 處理 Token、逾時、錯誤解析
- 自訂 Error class 保留 HTTP status
- Electron `dialog.showOpenDialog` 只能在 Main 用，這是 IPC 的另一個典型用途
- IPC handler 要驗證 Renderer 傳來的參數（它是 `unknown`，不是你以為的 `string`）

## 前置

Backend 以 Token 啟動（Terminal A）：

```bash
cd /Users/chinghsinc/Develop/python-electron/backend
DEVSPACE_TOKEN=dev-token uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8765
```

---

## Step 1. 建立 `src/shared/` 並讓兩個 tsconfig 都看到它

模板有兩份 tsconfig：`tsconfig.node.json`（main + preload）與 `tsconfig.web.json`（renderer）。`Project` 這種型別兩邊都要用，但目前沒有任何一個資料夾同時被兩邊 include。

建立 `desktop/src/shared/types.ts`：

```ts
export interface HealthResponse {
  status: 'ok'
  service: string
  version: string
  timestamp: string
}

export interface Project {
  id: string
  name: string
  path: string
  branch: string | null
  is_dirty: boolean
  technologies: string[]
}

export interface ScanResponse {
  root: string
  projects: Project[]
  scanned_at: string
}
```

修改 `desktop/tsconfig.node.json`，在 `include` 加入 `"src/shared/**/*"`：

```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.node.json",
  "include": [
    "electron.vite.config.*",
    "src/main/**/*",
    "src/preload/**/*",
    "src/shared/**/*"
  ],
  "compilerOptions": {
    "composite": true,
    "types": ["electron-vite/node"]
  }
}
```

修改 `desktop/tsconfig.web.json`，同樣加入：

```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.web.json",
  "include": [
    "src/renderer/src/env.d.ts",
    "src/renderer/src/**/*",
    "src/renderer/src/**/*.tsx",
    "src/preload/*.d.ts",
    "src/shared/**/*"
  ],
  "compilerOptions": {
    "composite": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@renderer/*": ["src/renderer/src/*"]
    }
  }
}
```

> `src/shared/` 的檔案會被兩種環境編譯，所以**只能放純型別或純函式**，不能 import `electron`、`node:*` 或 DOM API。

## Step 2. HTTP Client：`src/main/backend.ts`

新增 `desktop/src/main/backend.ts`：

```ts
import { is } from '@electron-toolkit/utils'
import type { HealthResponse, Project, ScanResponse } from '../shared/types'

const BACKEND_URL = process.env['DEVSPACE_BACKEND_URL'] ?? 'http://127.0.0.1:8765'

// Week 2：開發模式退回固定 Token，與 Python 端的 DEVSPACE_TOKEN=dev-token 對應。
// Week 4：Electron 啟動 Python 子行程時會改成每次隨機產生。
const TOKEN = process.env['DEVSPACE_TOKEN'] ?? (is.dev ? 'dev-token' : undefined)

export class BackendError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message)
    this.name = 'BackendError'
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
  timeoutMs?: number
}

async function request<T>(
  path: string,
  { method = 'GET', body, timeoutMs = 3000 }: RequestOptions = {}
): Promise<T> {
  if (!TOKEN) {
    throw new BackendError('DEVSPACE_TOKEN is not set for the Electron process')
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${TOKEN}` }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs)
  })

  if (!response.ok) {
    let detail = `Backend returned HTTP ${response.status}`
    try {
      const data: unknown = await response.json()
      if (typeof data === 'object' && data !== null && 'detail' in data) {
        const d = (data as { detail: unknown }).detail
        if (typeof d === 'string') detail = d
      }
    } catch {
      // body 不是 JSON，保留預設訊息
    }
    throw new BackendError(detail, response.status)
  }

  return (await response.json()) as T
}

export const backend = {
  async health(): Promise<HealthResponse> {
    const result = await request<unknown>('/health')
    if (
      typeof result !== 'object' ||
      result === null ||
      !('status' in result) ||
      result.status !== 'ok'
    ) {
      throw new BackendError('Invalid backend response')
    }
    return result as HealthResponse
  },

  scanProjects(root: string): Promise<ScanResponse> {
    // 掃描大目錄可能需要數十秒，不能沿用 3 秒的預設逾時
    return request<ScanResponse>('/projects/scan', {
      method: 'POST',
      body: { root },
      timeoutMs: 60_000
    })
  },

  listProjects(): Promise<Project[]> {
    return request<Project[]>('/projects')
  },

  refreshProject(id: string): Promise<Project> {
    return request<Project>(`/projects/${encodeURIComponent(id)}/refresh`, {
      method: 'POST',
      timeoutMs: 10_000
    })
  }
}
```

### 設計重點

| 片段 | 為什麼 |
| --- | --- |
| `process.env['DEVSPACE_TOKEN'] ?? (is.dev ? 'dev-token' : undefined)` | 開發模式退回固定值，與 Python 的 `DEVSPACE_TOKEN=dev-token` 對應；正式版沒有退路 |
| 用 `process.env` 而不是 `import.meta.env` | electron-vite 只把 `MAIN_VITE_*` 前綴的變數注入 `import.meta.env`；真正的作業系統環境變數要用 `process.env` |
| `timeoutMs` 參數，預設 3000 | `/health` 要快；`/projects/scan` 掃大目錄可能要幾十秒，Week 1 寫死 3 秒會害掃描永遠逾時 |
| `BackendError` 帶 `status` | 之後 UI 可以區分 401（設定問題）、404（路徑不見了）、逾時（`TimeoutError`） |
| 解析 FastAPI 的 `{"detail": "..."}` | 讓 UI 顯示「root must be an absolute path」而不是「HTTP 422」 |
| `encodeURIComponent(id)` | 永遠對放進 URL 的值做編碼，即使你知道它只是 12 碼 hex |

## Step 3. IPC Handlers：`src/main/ipc.ts`

新增 `desktop/src/main/ipc.ts`：

```ts
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { backend } from './backend'

function assertNonEmptyString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`)
  }
}

export function registerIpcHandlers(): void {
  ipcMain.handle('backend:health', () => backend.health())

  ipcMain.handle('dialog:select-directory', async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'Select a folder to scan for Git projects',
      properties: ['openDirectory']
    }
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  ipcMain.handle('projects:scan', (_event, root: unknown) => {
    assertNonEmptyString(root, 'root')
    return backend.scanProjects(root)
  })

  ipcMain.handle('projects:list', () => backend.listProjects())

  ipcMain.handle('projects:refresh', (_event, id: unknown) => {
    assertNonEmptyString(id, 'id')
    return backend.refreshProject(id)
  })
}
```

### 設計重點

| 片段 | 為什麼 |
| --- | --- |
| `root: unknown` + `assertNonEmptyString` | IPC 參數來自 Renderer，Main 必須把它當不可信輸入；TypeScript 的 `asserts` 讓檢查後自動縮窄型別 |
| `BrowserWindow.fromWebContents(event.sender)` | 讓對話框附屬於發出請求的視窗（macOS 會變成 sheet），而不是一個獨立飄著的視窗 |
| `properties: ['openDirectory']` | 只能選資料夾，不能選檔案 |
| 回傳 `null` 表示取消 | 「使用者取消」是正常路徑，不是錯誤，不要用 throw |

## Step 4. 瘦身後的 `src/main/index.ts`

**覆寫** `desktop/src/main/index.ts`：

```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerIpcHandlers } from './ipc'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 550,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({
    action: 'deny'
  }))

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.example.devspace')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
```

現在 `index.ts` 只負責 App 生命週期與視窗，所有「能力」都在 `ipc.ts`，所有「跟 Python 講話」都在 `backend.ts`。

## Step 5. 驗證

```bash
cd /Users/chinghsinc/Develop/python-electron/desktop
pnpm typecheck && pnpm lint
pnpm dev
```

DevTools Console：

```js
await window.devspace.checkBackend()
// 仍然成功（Day 3 的 preload 還沒改，只有 checkBackend）

// 用模板暫時還暴露的受限版 ipcRenderer 試新 handler：
await window.electron.ipcRenderer.invoke('dialog:select-directory')
// 會跳出原生資料夾選擇器；選一個 → 回傳路徑字串；取消 → null

await window.electron.ipcRenderer.invoke('projects:scan', '/Users/chinghsinc/Develop')
// 回傳 {root, projects: [...], scanned_at}

await window.electron.ipcRenderer.invoke('projects:scan', 123)
// Error: root must be a non-empty string  ← 參數驗證生效

await window.electron.ipcRenderer.invoke('projects:scan', 'relative/path')
// Error: root must be an absolute path  ← 這是 Python 的 422 detail 被轉成訊息
```

最後一組實驗很重要：你剛剛用 `window.electron.ipcRenderer` 呼叫了**任何**channel。這就是 Day 3 提過的風險，Day 13 會把它拿掉。

Commit：

```bash
cd /Users/chinghsinc/Develop/python-electron
git add . && git commit -m "feat(desktop): split main into backend client and ipc handlers, add directory dialog"
```

---

## 驗收

- [ ] `pnpm typecheck` 與 `pnpm lint` 通過
- [ ] `checkBackend()` 仍正常
- [ ] `dialog:select-directory` 能開啟原生對話框，取消回 `null`
- [ ] `projects:scan` 傳非字串會被 Main 擋下；傳相對路徑會收到 Python 的 422 訊息
- [ ] 能解釋為什麼 `src/shared/` 要同時加進兩個 tsconfig
- [ ] Commit 完成

## 常見問題

**Q：typecheck 說找不到 `../shared/types`？**
確認兩個 tsconfig 的 `include` 都加了 `src/shared/**/*`，並重啟 VS Code 的 TS server（Cmd+Shift+P → Restart TS Server）。

**Q：`Electron.OpenDialogOptions` 型別從哪來？**
`electron` 套件的全域命名空間 `Electron`，在 main/preload 的 tsconfig 下可直接使用。

**Q：對話框跳出來但 Electron 視窗沒有變暗/沒有 sheet 效果？**
`BrowserWindow.fromWebContents` 回傳 `null` 時會退回無父視窗的對話框。在 DevTools 以外的正常流程（Day 11）不會發生。

## 學習筆記

（寫下今天的心得、卡關點、想問的問題）
