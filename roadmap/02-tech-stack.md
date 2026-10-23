# 02 · 技術規格與本機環境

## 技術選型

| 層 | 技術 | 為什麼 |
| --- | --- | --- |
| Desktop Runtime | Electron 44 | 跨平台桌面、成熟的 IPC 與安全模型 |
| 專案腳手架 | electron-vite 6（`@quick-start/electron` 模板 `react-ts`） | 一次設定好 main / preload / renderer 三個建置目標、HMR |
| UI | React 19 + TypeScript 5.9 | 你已熟悉；TypeScript 讓跨層資料契約有型別保護 |
| JS 套件管理 | pnpm 10 | 快、省空間、lockfile 可重現 |
| Backend | Python 3.12 + FastAPI | 自動 OpenAPI 文件、Pydantic 驗證、非常適合學 REST |
| ASGI Server | uvicorn（`fastapi[standard]` 內含） | 開發用 `--reload` |
| Python 套件管理 | uv | 自動管理 .venv、lockfile、速度快 |
| Python 測試 | pytest + httpx（FastAPI TestClient 依賴） | 不需啟動真正的 server 即可測 API |
| 資料庫（Week 3） | SQLite | 零設定、單檔、Local-first 的天然選擇 |

## 本機環境（撰寫時實測）

| 工具 | 本機版本 | 需求 | 狀態 |
| --- | --- | --- | --- |
| Node.js | v24.11.1 | electron-vite 6 要求 `^20.19.0 \|\| >=22.12.0` | ✅ |
| pnpm | 10.24.0 | 任一 pnpm 10 | ✅ |
| Python（系統 `python3`） | 3.14.2 | 專案用 3.12，**由 uv 管理，不用系統版** | ✅（不影響） |
| uv | 0.12.5 | 最新穩定版 | ✅ |
| uv 已安裝的 Python | cpython 3.12.14 | `uv init --python 3.12` 可直接使用，不需下載 | ✅ |
| Git | 2.39.5 (Apple Git) | 任一近期版本 | ✅ |
| fnm | 1.39.0 | 非必要，Node 已就緒 | — |

> `python3 --version` 顯示 3.14 是正常的，那是系統 Python。專案會透過 `uv run` 使用 3.12 的虛擬環境，兩者互不干擾。

## 已確認的模板行為（@quick-start/create-electron 1.0.31）

這些是直接讀模板原始碼確認的，會影響 Day 1 與 Day 3 的做法：

| 項目 | 模板實際狀況 | 對我們的影響 |
| --- | --- | --- |
| Preload 輸出 | CommonJS，`out/preload/index.js` | Main 裡 `join(__dirname, '../preload/index.js')` 是正確的 |
| `sandbox` | 預設 `sandbox: false` | Day 3 我們會改成 `true`（preload 是 CJS 且不 import Node 模組，可以開 sandbox） |
| Preload 內容 | 已用 `@electron-toolkit/preload` 暴露 `window.electron` 與 `window.api` | 我們**新增** `window.devspace`，不要刪掉原本的 |
| 全域型別 | `src/preload/index.d.ts` 宣告 `Window.electron` / `Window.api` | `tsconfig.web.json` 已 include `src/preload/*.d.ts` 和 `src/renderer/src/**/*`，所以 `devspace.d.ts` 放 renderer 下會被看到 |
| `postinstall` | `install-electron && electron-builder install-app-deps` | Electron 44 自帶 `install-electron`，所以 pnpm 10 封鎖依賴套件 build script 不會卡住 Electron 下載 |
| pnpm 偵測 | 用 pnpm 建立時會寫入 `.npmrc` 的 `shamefully-hoist=true` | 保留即可 |
| 預設 CSS | `assets/main.css` 把 `body` 設成 flex 置中 + 背景圖 | Day 4 會移除對 `main.css` 的 import |
| CSP | `index.html` 有 `connect-src` 未設定的 CSP | 不影響，因為 HTTP 請求在 Main 發出，不在 Renderer |
| Typecheck 腳本 | `pnpm typecheck`（node + web）、`pnpm build` 會先 typecheck 再 build | Day 5 用這些，不要用裸的 `electron-vite build` |

## 目錄結構（Week 1 完成時）

```
developer-workspace-manager/
├── roadmap/                        ← 本路線圖
├── desktop/
│   ├── src/
│   │   ├── main/
│   │   │   └── index.ts            ← Electron Main：視窗、IPC handler、HTTP client
│   │   ├── preload/
│   │   │   ├── index.ts            ← contextBridge：暴露 window.devspace
│   │   │   └── index.d.ts          ← 模板原有的 Window.electron / Window.api 型別
│   │   └── renderer/
│   │       ├── index.html
│   │       └── src/
│   │           ├── types/
│   │           │   └── devspace.d.ts   ← Window.devspace 型別宣告
│   │           ├── assets/             ← 模板資源（可保留）
│   │           ├── App.tsx             ← Dashboard
│   │           ├── App.css
│   │           ├── env.d.ts
│   │           └── main.tsx
│   ├── resources/                  ← 模板的 icon.png（main/index.ts 會 import）
│   ├── build/                      ← electron-builder 用的圖示資源（Week 4 才會用到）
│   ├── .vscode/                    ← 模板產生的編輯器設定
│   ├── .gitignore                  ← 模板產生（與根目錄 .gitignore 規則重疊，保留即可）
│   ├── .npmrc                      ← 用 pnpm 建立時產生：shamefully-hoist=true
│   ├── .editorconfig / .prettierrc.yaml / .prettierignore
│   ├── electron-builder.yml
│   ├── electron.vite.config.ts
│   ├── eslint.config.mjs
│   ├── tsconfig.json / tsconfig.node.json / tsconfig.web.json
│   ├── package.json
│   └── pnpm-lock.yaml
│
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   └── main.py                 ← FastAPI app、/health
│   ├── tests/
│   │   ├── __init__.py             ← 必要，讓 pytest 把 backend/ 加進 sys.path
│   │   └── test_health.py
│   ├── pyproject.toml
│   ├── uv.lock
│   └── .python-version             ← 由 uv python pin 3.12 產生（--bare 不會自動建立）
│
└── .gitignore
```

## 常用指令速查

### Backend（在 `backend/`）

```bash
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8765   # 啟動
uv run pytest                                                       # 測試
uv add <package>                                                    # 新增依賴
uv add --dev <package>                                              # 新增開發依賴
```

### Desktop（在 `desktop/`）

```bash
pnpm dev          # 開發模式（HMR）
pnpm typecheck    # TypeScript 型別檢查（main/preload + renderer）
pnpm lint         # ESLint
pnpm format       # Prettier
pnpm build        # typecheck + electron-vite build
```

### 兩個 Terminal 的標準開發流程

```
Terminal A                                  Terminal B
cd backend                                  cd desktop
uv run uvicorn app.main:app --reload \      pnpm dev
  --host 127.0.0.1 --port 8765
```

## 固定的契約（Contract）

Backend Port 固定為 **8765**，`/health` 的回應 schema 在 Python（Pydantic）、Electron Main（runtime check）、Renderer（`devspace.d.ts`）三處各寫一次。**三處必須一致**，這是第一週要體會的「跨層資料契約」問題；之後可以考慮用 OpenAPI 自動產生 TypeScript 型別來消除重複。
