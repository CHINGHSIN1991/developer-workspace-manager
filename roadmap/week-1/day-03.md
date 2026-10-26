# Day 3 · 建立 Electron 與 Python 的通訊

## 今日目標

這是整個專案**最核心的一天**。完成後，Renderer 可以呼叫 `window.devspace.checkBackend()`，由 Electron Main 向 Python 發送 HTTP Request，再把結果傳回 Renderer。

今天先不做 UI，只用 DevTools Console 驗證通訊成功。UI 留到 Day 4。

## 你會學到

- `ipcMain.handle` / `ipcRenderer.invoke` 的 Request/Response 式 IPC
- `contextBridge.exposeInMainWorld` 怎麼安全地暴露功能
- 為什麼 HTTP 請求要在 Main 發，而不是 Renderer
- TypeScript Global Declaration（`declare global`）
- `sandbox: true` 的意義與限制

## 前置

Day 2 的 Backend 要先跑起來（Terminal A）：

```bash
cd /Users/chinghsinc/Develop/developer-workspace-manager/backend
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8765
```

---

## Step 1. 修改 Electron Main

把 `desktop/src/main/index.ts` **整個覆寫**為：

```ts
import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

const BACKEND_URL = 'http://127.0.0.1:8765'

interface HealthResponse {
  status: 'ok'
  service: string
  version: string
  timestamp: string
}

async function checkBackend(): Promise<HealthResponse> {
  const response = await fetch(`${BACKEND_URL}/health`, {
    signal: AbortSignal.timeout(3000)
  })

  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`)
  }

  const result: unknown = await response.json()

  if (
    typeof result !== 'object' ||
    result === null ||
    !('status' in result) ||
    result.status !== 'ok'
  ) {
    throw new Error('Invalid backend response')
  }

  return result as HealthResponse
}

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

  // 第一週不允許任何新視窗（外部連結）開啟
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

  // IPC Handler：Renderer 透過 preload 呼叫 'backend:health'，Main 代為向 Python 發 HTTP
  ipcMain.handle('backend:health', async () => {
    return checkBackend()
  })

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

### 與模板原檔的差異

| 模板原本 | 改成 | 原因 |
| --- | --- | --- |
| `sandbox: false` | `sandbox: true` + 明確寫出 `contextIsolation: true`、`nodeIntegration: false` | Electron 官方安全建議。前兩者其實是預設值，但寫出來讓意圖明確 |
| `setWindowOpenHandler` 用 `shell.openExternal` 開連結 | 一律 `deny` | 第一週沒有外部連結需求，先關起來 |
| `ipcMain.on('ping', ...)` | `ipcMain.handle('backend:health', ...)` | `on` 是單向；`handle` 是有回傳值的 Request/Response |
| 無 | `checkBackend()` 與 `BACKEND_URL` | 今天的主角 |
| `import { join } from 'path'` | `'node:path'` | 明確標示是 Node 內建模組 |

保留了 `icon` import 與 `resources/icon.png` 的用法，這樣 Linux 打包時不會壞。

### `checkBackend()` 的三道防線

1. **逾時**：`AbortSignal.timeout(3000)`，Backend 掛了不會讓 Promise 永遠 pending。
2. **HTTP 狀態**：非 2xx 就丟 Error。
3. **回應形狀**：即使是自己寫的 Backend，也用 `unknown` 接再檢查 `status === 'ok'`。這是「不信任輸入」的習慣。

### 為什麼 `ipcMain.handle` 而不是把 fetch 能力給 Renderer？

我們**沒有**直接把 Node.js 或「任意 HTTP 請求」的能力交給 React，而是提供一個**特定用途的操作**：「幫我檢查 Backend 健康」。Renderer 不知道、也不需要知道 Backend 在哪個 port。未來即使 Backend 改成 Unix socket 或動態 port，Renderer 程式碼不用動。

## Step 2. 修改 Preload

把 `desktop/src/preload/index.ts` **整個覆寫**為：

```ts
import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// 模板原本就有的（保留，之後可能用到 process.versions 等資訊）
const api = {}

// DevSpace 專用 API：只暴露具名、特定用途的功能
const devspaceApi = {
  checkBackend: () => {
    return ipcRenderer.invoke('backend:health')
  }
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

重點：`contextBridge` 用來暴露**經過控制**的 API 給 React。這是 Electron 官方建議的隔離做法；**不應直接暴露整個 `ipcRenderer`**，否則 Renderer 就能呼叫任何 channel。

### Step 2-1. 讓 electron-vite 把 `@electron-toolkit/preload` 打包進 preload

Sandbox 下的 preload 不能 `require` 任意 npm 套件，只能用 Electron 提供的少數 API（`contextBridge`、`ipcRenderer` 等）。但 electron-vite 6 預設**不會**把 `dependencies` 打包進輸出，而是留成 `require("@electron-toolkit/preload")`，在沙箱裡會直接失敗，導致 `window.devspace` 是 `undefined`。

編輯 `desktop/electron.vite.config.ts`，把 `preload: {}` 改成：

```ts
preload: {
  // sandbox: true 的 preload 只能 require('electron') 等少數內建模組，
  // 所以第三方套件必須打包進 preload，不能留成外部 require
  build: {
    externalizeDeps: { exclude: ['@electron-toolkit/preload'] }
  }
},
```

詳細原因與驗證方式見 [troubleshooting/preload-sandbox-module-not-found.md](../troubleshooting/preload-sandbox-module-not-found.md)。

## Step 3. 宣告 TypeScript 介面

建立 `desktop/src/renderer/src/types/devspace.d.ts`：

```ts
export interface HealthResponse {
  status: 'ok'
  service: string
  version: string
  timestamp: string
}

export interface DevSpaceAPI {
  checkBackend(): Promise<HealthResponse>
}

declare global {
  interface Window {
    devspace: DevSpaceAPI
  }
}
```

### 為什麼需要這個檔案？

瀏覽器原本不知道 `window.devspace` 是什麼。透過 TypeScript 的 Global Declaration，讓 TypeScript 能檢查它的呼叫方式和回傳資料。

`tsconfig.web.json` 的 `include` 已包含 `src/renderer/src/**/*`，所以這個檔案會被自動納入，不用改設定。

未來擴充時，在同一個 interface 加方法：

```ts
export interface DevSpaceAPI {
  checkBackend(): Promise<HealthResponse>

  // Week 2
  // selectDirectory(): Promise<string | null>
  // scanProjects(root: string): Promise<Project[]>

  // Week 3
  // openInEditor(id: string): Promise<void>
}
```

**目前不要加入尚未實作的方法**，以免型別宣告與真正可用的 API 不一致。型別說有、執行時卻是 `undefined`，是最難追的 bug 之一。

## Step 4. 用 DevTools 驗證通訊

啟動 Electron（Terminal B）：

```bash
cd /Users/chinghsinc/Develop/developer-workspace-manager/desktop
pnpm dev
```

Electron 視窗開啟後，按 **F12**（或 macOS 的 `Cmd+Option+I`）打開 DevTools，在 Console 輸入：

```js
await window.devspace.checkBackend()
```

預期看到：

```js
{status: 'ok', service: 'devspace-backend', version: '0.1.0', timestamp: '2026-10-25T...Z'}
```

**恭喜，資料走完了 React → Preload → Main → HTTP → Python → 原路回來。**

再試這兩件事，確認安全邊界有效：

```js
window.require          // undefined（nodeIntegration: false）
window.devspace         // {checkBackend: ƒ}，只有一個方法
window.electron.ipcRenderer.invoke('backend:health')  // 這個也會成功 — 見下方說明
```

> 最後一行能成功，是因為模板的 `@electron-toolkit/preload` 暴露了一個受限版 `ipcRenderer`（只有 `invoke`/`send`/`on` 等，且無法存取 Node）。這是模板的便利設計，但**也代表 Renderer 可以呼叫任何 channel 名稱**。Week 2 開始有敏感 API 時，建議移除 `window.electron` 的暴露，只留 `window.devspace`。先記在心裡。

## Step 5. 測試失敗路徑

在 Terminal A 按 `Ctrl+C` 停掉 Python，回到 DevTools Console 再執行一次：

```js
await window.devspace.checkBackend()
```

預期：約 3 秒內（或立即）拋出 Error，訊息類似：

```
Error: Error invoking remote method 'backend:health': TypeError: fetch failed
```

重新啟動 Python 後再試，應該恢復成功。這就是 Day 4 要處理的 `disconnected` 狀態。

## 完整呼叫流程回顧

| 步驟 | 執行環境 | 動作 |
| --- | --- | --- |
| 1 | React | `window.devspace.checkBackend()` |
| 2 | Preload | `ipcRenderer.invoke('backend:health')` |
| 3 | Electron Main | `ipcMain.handle('backend:health')` |
| 4 | HTTP Client（Main） | `GET http://127.0.0.1:8765/health` |
| 5 | Python FastAPI | `return HealthResponse(...)` |
| 6 | React | Promise resolve，拿到 JSON |

---

## 驗收

- [ ] `pnpm typecheck` 通過（沒有紅字）
- [ ] DevTools Console 執行 `await window.devspace.checkBackend()` 回傳 `{status: 'ok', ...}`
- [ ] 停掉 Python 後同一指令拋出 Error，Electron 沒有崩潰
- [ ] `window.require` 是 `undefined`
- [ ] 能用自己的話說出 IPC 和 HTTP 在這條路徑裡各負責哪一段

## 常見問題

**Q：Console 說 `window.devspace is undefined`？**
1. 往 Console 上方找 `Unable to load preload script` / `module not found`。有的話，就是 Step 2-1 的設定沒加或沒生效，見 [troubleshooting/preload-sandbox-module-not-found.md](../troubleshooting/preload-sandbox-module-not-found.md)。
2. preload 有沒有存檔並讓 electron-vite 重新 build（Terminal B 會有 log）。
3. `pnpm dev` 重啟一次。Preload 和 `electron.vite.config.ts` 的改動不一定會熱更新。

**Q：`fetch` 在 Main 可以用嗎？**
可以。Electron 44 內含的 Node.js 版本有全域 `fetch`，不需額外套件。

**Q：typecheck 說 `icon.png?asset` 型別錯誤？**
模板的 `tsconfig.node.json` 已設 `"types": ["electron-vite/node"]`，那裡定義了 `?asset` 的型別。確認你沒有改掉這行。

**Q：改成 `sandbox: true` 後畫面空白？**
看 DevTools Console 有沒有 preload 錯誤。常見原因是 preload 裡 import 了 Node 模組（例如 `fs`、`path`），或 npm 套件沒有被打包進 preload（見 Step 2-1）。

## 學習筆記

（寫下今天的心得、卡關點、想問的問題）
