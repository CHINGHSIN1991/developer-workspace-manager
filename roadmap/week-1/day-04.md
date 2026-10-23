# Day 4 · React Dashboard 與 Backend 狀態管理

## 今日目標

做出可以互動的 React 介面：顯示 Backend 連線狀態，提供「Check connection」按鈕，Backend 離線時顯示錯誤而不是白畫面。

## 你會學到

- `useState` 管理 UI 狀態
- `useEffect` 處理初始化資料讀取，以及 React 19 新 lint 規則 `react-hooks/set-state-in-effect` 要求的寫法
- `useCallback` 讓函式參考穩定，配合 `useEffect` 依賴
- TypeScript Union Type 表達「有限狀態」
- Loading / Success / Error 三種 API 狀態的標準寫法
- 如何透過 `window.devspace` 使用 Electron 提供的功能

---

## Step 1. 建立 Dashboard

**覆寫** `desktop/src/renderer/src/App.tsx`：

```tsx
import { useCallback, useEffect, useState } from 'react'
import './App.css'
import type { HealthResponse } from './types/devspace'

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

      <section className="panel">
        <h2>Projects</h2>
        <p>Git repository scanning will be available in Week 2.</p>

        <div className="empty-state">No projects added yet.</div>
      </section>
    </main>
  )
}

export default App
```

### 程式碼解讀

| 片段 | 為什麼這樣寫 |
| --- | --- |
| `type ConnectionState = 'loading' \| 'connected' \| 'disconnected'` | 用 Union Type 把狀態限制成三種，不會出現 `isLoading && isError` 同時為真的矛盾 |
| `useState<BackendInfo \| null>(null)` | 還沒拿到資料前是 `null`，JSX 用 `{backend && ...}` 守住 |
| `applyHealth` / `applyFailure` 兩個 `useCallback` | 把「收到結果後怎麼更新 state」抽成函式，掛載時與按按鈕時共用 |
| `window.devspace.checkBackend().then(applyHealth, applyFailure)` | `.then(onFulfilled, onRejected)` 兩個參數形式，成功與失敗各走一條路 |
| `useEffect` 裡**沒有**直接呼叫任何 `setXxx` | 見下方「為什麼不能在 effect 裡直接 setState」 |
| `checkConnection` 先 `setStatus('loading')` 再發請求 | 這是事件處理函式（按鈕 onClick），不受 effect 規則限制，可以同步 setState |
| `err instanceof Error ? err.message : '...'` | `catch` / `onRejected` 拿到的 `err` 型別是 `unknown`，要先縮窄才能讀 `.message` |
| `disabled={status === 'loading'}` | 避免使用者連點造成多個並行請求 |
| 回傳型別 `React.JSX.Element` | 與模板 `App.tsx` 一致；模板的 tsconfig 讓 `React` 命名空間在型別層可直接使用 |

### 為什麼不能在 effect 裡直接 setState

模板使用 eslint-plugin-react-hooks 7，內含 React Compiler 的新規則 `react-hooks/set-state-in-effect`。它會擋下這種寫法：

```tsx
// ❌ pnpm lint 會報錯：Calling setState synchronously within an effect
const checkConnection = useCallback(async () => {
  setStatus('loading')          // ← 同步呼叫
  const response = await window.devspace.checkBackend()
  ...
}, [])

useEffect(() => {
  void checkConnection()        // ← effect 同步呼叫到上面的 setStatus
}, [checkConnection])
```

規則的邏輯：effect 本體（以及它同步呼叫到的函式）裡的 `setState` 會在 render 後立刻觸發另一次 render，形成 cascading render。注意 **`async` 函式在第一個 `await` 之前的程式碼仍是同步執行的**，所以 `setStatus('loading')` 會被抓到。

通過的寫法是：初始 state 直接設成 `'loading'`（不需要在 effect 裡再設一次），`setState` 只放在 Promise 的 callback 裡。這也是 React 官方「You Might Not Need an Effect」的精神：effect 負責啟動與外部系統的互動，state 更新在回呼裡發生。

> React 19 的 `StrictMode`（模板 `main.tsx` 已開）在開發模式會讓 `useEffect` 跑兩次。你可能在 Terminal A 看到 Electron 一啟動就打了兩次 `/health`。這是刻意的開發期行為，正式 build 不會。

## Step 2. 加入 CSS

**覆寫** `desktop/src/renderer/src/App.css`：

```css
:root {
  font-family:
    Inter,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
  color: #e5e7eb;
  background: #10151d;
  font-synthesis: none;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
}

button {
  font: inherit;
}

.app {
  max-width: 1100px;
  margin: 0 auto;
  padding: 48px;
}

.header {
  margin-bottom: 32px;
}

.eyebrow {
  color: #93b4f9;
  font-size: 12px;
  letter-spacing: 2px;
  font-weight: 600;
}

h1 {
  font-size: 38px;
  margin: 12px 0;
}

h2 {
  font-size: 18px;
  margin: 0 0 6px;
}

p {
  color: #94a3b8;
  line-height: 1.6;
}

.panel {
  background: #1b2431;
  border: 1px solid #303c4f;
  border-radius: 14px;
  padding: 24px;
  margin-bottom: 20px;
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.panel-header p {
  margin: 0;
}

.status {
  border-radius: 20px;
  padding: 6px 12px;
  font-size: 12px;
  white-space: nowrap;
}

.status.connected {
  color: #86efac;
  background: #17452d;
}

.status.disconnected {
  color: #fca5a5;
  background: #562a35;
}

.status.loading {
  color: #fcd34d;
  background: #514321;
}

.details {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin: 24px 0;
}

.details > div {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  overflow-wrap: anywhere;
}

.details span {
  color: #94a3b8;
  font-size: 12px;
}

.details strong {
  font-size: 14px;
}

button {
  background: #3b82f6;
  border: none;
  border-radius: 8px;
  padding: 10px 16px;
  color: white;
  cursor: pointer;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error-message {
  color: #fca5a5;
}

.empty-state {
  border: 1px dashed #415068;
  border-radius: 8px;
  margin-top: 16px;
  padding: 40px;
  text-align: center;
  color: #94a3b8;
}

@media (max-width: 650px) {
  .app {
    padding: 24px;
  }

  .details {
    grid-template-columns: 1fr;
  }
}
```

## Step 3. 移除模板的預設樣式

模板的 `assets/main.css` 會把 `body` 設成 flex 置中並鋪背景圖，會干擾我們的版面。修改 `desktop/src/renderer/src/main.tsx`，**刪掉第一行** `import './assets/main.css'`：

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

`assets/` 資料夾與 `components/Versions.tsx` 可以先留著或刪掉，不影響。若要刪，記得確認沒有地方 import 它們。

順手把 `desktop/src/renderer/index.html` 的 `<title>Electron</title>` 改成 `<title>DevSpace</title>`。

## Step 4. 啟動完整系統

現在需要兩個 Terminal。

**Terminal A — Python Backend**

```bash
cd /Users/chinghsinc/Develop/python-electron/backend
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8765
```

**Terminal B — Electron + React**

```bash
cd /Users/chinghsinc/Develop/python-electron/desktop
pnpm dev
```

預期 Electron 開啟後，Python Backend 面板右上角顯示綠色 **Connected**，下方三欄顯示 `devspace-backend`、`0.1.0`、本地時間。

## Step 5. 測試錯誤處理

刻意停止 Python Backend：

1. 在 Terminal A 按 `Ctrl+C`。
2. 回到 Electron，點擊「Check connection」。

預期：

| 時間點 | 畫面 |
| --- | --- |
| 點擊瞬間 | Status 變成黃色 **Checking...**，按鈕 disabled |
| 連線失敗後（通常立即，最多 3 秒） | Status 變成紅色 **Disconnected**，三欄資訊消失，下方出現 `Connection failed: ...` |
| 整個過程 | React **沒有**白畫面、沒有 uncaught error |

再重新啟動 Python，點擊按鈕，應該恢復 **Connected**。

這個測試很重要：在真實桌面應用中，Backend Process 可能會停止、啟動失敗或逾時。UI 必須把這當作**正常狀態之一**來設計，而不是例外。

## Step 6. 檢查品質工具

```bash
pnpm typecheck
pnpm lint
```

兩個都要是乾淨的。若 lint 抱怨 `Versions.tsx` 未使用，直接刪掉那個檔案。

---

## 驗收

- [ ] Electron 開啟後自動顯示 Connected 與 Backend 資訊
- [ ] 停掉 Python → 點按鈕 → 顯示 Disconnected 與錯誤訊息，無白畫面
- [ ] 重啟 Python → 點按鈕 → 恢復 Connected
- [ ] Checking 期間按鈕 disabled
- [ ] `pnpm typecheck` 與 `pnpm lint` 通過
- [ ] 能解釋為什麼用 Union Type 而不是三個 boolean

## 常見問題

**Q：畫面上方有奇怪的置中與背景圖？**
`main.tsx` 的 `import './assets/main.css'` 沒刪乾淨。

**Q：`toLocaleString()` 顯示的時間和 Python 回傳的差 8 小時？**
正常。Python 回傳 UTC，瀏覽器 `Date` 會轉成本地時區（台北 UTC+8）顯示。這正是「存 UTC、顯示本地」的標準做法。

**Q：ESLint 說 `React` 未定義（`React.JSX.Element`）？**
`tsconfig.web.json` 已設 `"jsx": "react-jsx"`，`React` 命名空間在型別層可直接用。若仍報錯，可改成 `import type { JSX } from 'react'` 後寫 `JSX.Element`。

## 學習筆記

（寫下今天的心得、卡關點、想問的問題）
