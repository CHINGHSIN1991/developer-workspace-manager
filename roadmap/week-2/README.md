# Week 2 · 掃描 Git 專案

第一週的 `/health` 是刻意選擇的最小 API。第二週才會開始加入真正的 Developer Workspace 功能：**選擇本地資料夾 → Python 掃描 Git Repository → React 顯示專案列表**。

每日文件在本資料夾，程式碼都已在實際的 electron-vite 模板與 uv 專案中跑過 typecheck / lint / pytest。

## 每日日程

| Day | 主題 | 文件 |
| --- | --- | --- |
| Day 8 | Python Git 掃描 Service 與測試 | [day-08.md](day-08.md) |
| Day 9 | Projects API、Token 驗證與測試 | [day-09.md](day-09.md) |
| Day 10 | Electron Main 重構：共用型別、Token、原生對話框 | [day-10.md](day-10.md) |
| Day 11 | Preload 契約、useProjects Hook 與專案列表 | [day-11.md](day-11.md) |
| Day 12 | 列表樣式、狀態體驗與手動測試矩陣 | [day-12.md](day-12.md) |
| Day 13 | 從 OpenAPI 產生 TypeScript 型別、收緊 Preload | [day-13.md](day-13.md) |
| Day 14 | Week 2 驗收與 Week 3 規劃 | [day-14.md](day-14.md) |

## Week 2 Definition of Done

- [ ] 選擇本地資料夾後，Python 能找出其中所有 Git repository
- [ ] 每個專案顯示名稱、路徑、branch、dirty 狀態、技術棧
- [ ] 所有 `/projects/*` 請求都需要 Bearer Token
- [ ] TypeScript 型別由 OpenAPI 產生，Renderer 只暴露 `window.devspace`
- [ ] Backend 與 Desktop 的測試、型別檢查、lint 全綠

## 預計的 API 設計

| Method | Endpoint | 功能 |
| --- | --- | --- |
| GET | `/health` | Backend 狀態（已完成） |
| POST | `/projects/scan` | 掃描指定根目錄中的 Git 專案 |
| GET | `/projects` | 取得已記錄的專案 |
| GET | `/projects/{id}` | 取得單一專案資訊 |
| POST | `/projects/{id}/refresh` | 重新讀取 Git 狀態 |

## Project Model

Python（Pydantic）：

```python
from pydantic import BaseModel


class Project(BaseModel):
    id: str
    name: str
    path: str
    branch: str | None
    is_dirty: bool
    technologies: list[str]
```

TypeScript（`devspace.d.ts`，與上面必須一致）：

```ts
export interface Project {
  id: string
  name: string
  path: string
  branch: string | null
  is_dirty: boolean
  technologies: string[]
}
```

回傳資料範例：

```json
{
  "id": "project-001",
  "name": "astro-seo-test",
  "path": "/Users/example/projects/astro-seo-test",
  "branch": "main",
  "is_dirty": false,
  "technologies": ["Astro", "TypeScript"]
}
```

## 新增的 IPC channel

| channel | Renderer 呼叫 | Main 做什麼 |
| --- | --- | --- |
| `dialog:select-directory` | `window.devspace.selectDirectory()` | `dialog.showOpenDialog({ properties: ['openDirectory'] })`，回傳路徑或 `null` |
| `projects:scan` | `window.devspace.scanProjects(root)` | `POST /projects/scan` 帶 `{ root }`，逾時 60 秒 |
| `projects:list` | `window.devspace.listProjects()` | `GET /projects` |
| `projects:refresh` | `window.devspace.refreshProject(id)` | `POST /projects/{id}/refresh` |

## 本週程式碼的落點

```
backend/app/
├── models.py                 ← Project / ScanRequest / ScanResponse（Day 8）
├── services/git_scanner.py   ← os.walk + git subprocess（Day 8）
├── auth.py                   ← Bearer Token dependency（Day 9）
├── store.py                  ← 記憶體 store，Week 3 換 SQLite（Day 9）
├── routers/projects.py       ← 四個 endpoint（Day 9）
└── main.py                   ← lifespan 檢查 Token、include_router（Day 9）
backend/scripts/export_openapi.py          ← 匯出 openapi.json（Day 13）

desktop/src/
├── shared/types.ts           ← 共用型別，Day 13 改為 OpenAPI 產生的別名（Day 10）
├── shared/devspace-api.ts    ← Preload ↔ Renderer 契約（Day 11）
├── main/backend.ts           ← HTTP client：Token、逾時、BackendError（Day 10）
├── main/ipc.ts               ← IPC handlers 與參數驗證（Day 10）
├── preload/index.ts          ← 實作 DevSpaceAPI（Day 11，Day 13 收緊）
└── renderer/src/
    ├── hooks/useProjects.ts
    └── components/ProjectList.tsx · ProjectCard.tsx
```

## 第二週的學習重點

| 主題 | 內容 |
| --- | --- |
| 檔案系統操作 | `pathlib.Path.rglob` / `os.walk`，如何跳過 `node_modules`、`.venv` 等大目錄 |
| Git Subprocess | `subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=path)`、`git status --porcelain` |
| Python Service Layer | 把掃描邏輯從 router 抽到 `app/services/git_scanner.py`，讓它可以單獨測試 |
| FastAPI Router | `APIRouter` 拆 `app/routers/projects.py`，`main.py` 只做組裝 |
| 前後端資料模型一致性 | 手寫兩份 vs 用 OpenAPI 產生 TypeScript 型別（`openapi-typescript`） |
| 原生對話框 | Electron `dialog` 只能在 Main 用，這是 IPC 的另一個典型用途 |
| React 列表 | `key`、空狀態、loading skeleton、錯誤重試 |

## 第二週就要開始面對的安全議題

Week 2 的 API 會讀取檔案系統與執行 `git` 指令。**只監聽 127.0.0.1 並不代表 Backend 已受到完整保護**，同一台電腦上的其他程式仍可能連線。所以 Week 2 至少要做：

1. **本機授權 Token**：Main 啟動時產生隨機 token，透過環境變數或啟動參數交給 Python；每個請求帶 `Authorization` header。
2. **可存取路徑限制**：`/projects/scan` 只接受使用者透過原生對話框選過的目錄；Python 端 `Path.resolve()` 後檢查是否在允許清單內。
3. **輸入驗證**：Pydantic request model 限制 `root` 必須是絕對路徑、長度上限等。
4. **Subprocess 安全**：永遠用 list 形式呼叫 `subprocess.run`，不組字串、不 `shell=True`。
