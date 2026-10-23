# 01 · 系統架構設計

這個專案最重要的學習目標是：**了解不同 Process 的責任，以及它們如何溝通。**

## 三層架構總覽

```
┌──────────────────────────────────────────────────────────────┐
│  React Renderer Process                                      │
│  React · TypeScript · UI State                               │
│  只能透過 window.devspace.* 這組受控 API 與外界溝通           │
└──────────────────────────────┬───────────────────────────────┘
                               │  window.devspace API
┌──────────────────────────────▼───────────────────────────────┐
│  Electron Preload                                            │
│  contextBridge + ipcRenderer                                 │
│  把「少數、具名、特定用途」的功能暴露給 Renderer               │
└──────────────────────────────┬───────────────────────────────┘
                               │  IPC: ipcRenderer.invoke / ipcMain.handle
┌──────────────────────────────▼───────────────────────────────┐
│  Electron Main Process                                       │
│  Window · Native Dialog · HTTP Client                        │
│  桌面應用的控制中心，擁有 Node.js 與作業系統能力               │
└──────────────────────────────┬───────────────────────────────┘
                               │  HTTP / JSON over 127.0.0.1:8765
┌──────────────────────────────▼───────────────────────────────┐
│  Python FastAPI Process                                      │
│  REST API · Business Logic · Git Services                    │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│  SQLite / File System / Git                                  │
│  Persistence · Repository Discovery                          │
└──────────────────────────────────────────────────────────────┘
```

## 為什麼分成三個主要 Process？

### React Renderer

就像一般瀏覽器裡的前端。你負責顯示畫面和處理使用者操作，**不應直接取得任意作業系統權限**。如果 Renderer 被 XSS 或惡意套件攻破，攻擊者能做的事應該被限制在「呼叫幾個我們明確允許的功能」。

### Electron Main

桌面應用的控制中心。它可以操作原生視窗、檔案選擇器，負責**安全地橋接 UI 與 Python**。它是唯一能同時碰到 Node.js、作業系統和 HTTP 的地方。

### Python Backend

應用程式的業務邏輯層。未來 Git 掃描、資訊解析、資料儲存都在這裡執行。Python 在檔案系統操作、subprocess、資料處理上非常順手，也讓你實際練習 Backend API、JSON、Request/Response、錯誤處理。

> 第一週採用 FastAPI 的 HTTP 模式，是為了把「Backend」這件事具體化、可以用瀏覽器測試。正式桌面 App 之後會改成由 Electron 管理 Python 子行程的生命週期（見下方決策表）。

## 一次完整呼叫的流程（Week 1 的 /health）

| 步驟 | 執行環境 | 動作 |
| --- | --- | --- |
| 1 | React | `window.devspace.checkBackend()` |
| 2 | Preload | `ipcRenderer.invoke('backend:health')` |
| 3 | Electron Main | `ipcMain.handle('backend:health', …)` 接到請求 |
| 4 | Electron Main（HTTP Client） | `GET http://127.0.0.1:8765/health` |
| 5 | Python FastAPI | `return HealthResponse(...)` → JSON |
| 6 | React | 收到 Promise resolve，更新 UI 狀態 |

這就是你第一個**跨三種執行環境**的完整 Request/Response 流程。

## IPC vs HTTP：兩種通訊，不同用途

| | IPC（Renderer ↔ Main） | HTTP（Main ↔ Python） |
| --- | --- | --- |
| 機制 | Electron 內建，結構化複製（structured clone） | TCP socket，JSON 序列化 |
| 誰能呼叫 | 只有同一個 Electron App 的 Renderer | 本機任何程式都能連 127.0.0.1:8765 |
| 錯誤型態 | Handler 丟出的 Error 會被包成 Error 傳回 Renderer | 連線失敗、逾時、非 2xx 狀態碼、JSON 格式錯誤 |
| 可測試方式 | 需要 Electron 環境 | curl、瀏覽器、pytest TestClient |
| 為什麼需要它 | 把「能力」限縮成具名 channel | 讓 Backend 成為獨立、可替換、可單獨測試的服務 |

## 安全邊界（第一週就要養成的習慣）

Electron 官方安全建議中，第一週就要做對的三件事：

1. **`contextIsolation: true`**：Renderer 的 JavaScript 與 Preload 的 JavaScript 跑在不同的 context，Renderer 拿不到 Node.js API。
2. **只暴露具名功能**：Preload 用 `contextBridge.exposeInMainWorld('devspace', { checkBackend })`，而**不是**把整個 `ipcRenderer` 丟出去。
3. **Main 端驗證回應**：即使是自己的 Backend，Main 也要檢查 HTTP status 與 JSON 形狀，不信任任何輸入。

> **注意：只監聽 127.0.0.1 並不代表 Backend 已受到完整保護。** 同一台電腦上的其他程式仍可能連線。第二週加入可讀取檔案系統的 API 時，就要開始規劃身份驗證（本機 Token）、可存取路徑限制與輸入驗證。

## 架構決策：第一週做法 vs 正式版本

| 問題 | 第一週做法 | 正式版本 |
| --- | --- | --- |
| Python 啟動 | 手動開啟 Terminal | Electron 自動啟動及關閉子行程 |
| Backend Port | 固定 8765 | 動態分配或使用其他本機 IPC 機制 |
| API 安全 | 本機開發用 Health Endpoint | 加入本機授權 Token、Request 驗證 |
| Backend 故障 | 顯示錯誤並重新連線 | 加入生命週期管理和必要的重新啟動機制 |
| 資料儲存 | 暫不持久化 | SQLite 放在 App User Data 目錄 |
| Python 執行環境 | uv 虛擬環境 | 打包 Python 執行檔（PyInstaller 等） |
| 發布 | Development Mode | macOS / Windows Installer |

這張表的意義：**第一週的簡化是刻意的**，每一列都標明了「之後要還的技術債」。
