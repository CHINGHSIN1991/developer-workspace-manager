# 第三週大綱 · SQLite 持久化與開啟編輯器

> **這是大綱，不是完整教學。** 每天列出目標、關鍵步驟與驗收，程式碼只給骨架。完整的每日文件（含驗證過的程式碼）會在 Week 2 Day 14 回顧後，依實際進度補寫成 `week-3/`。

## 本週目標

1. 掃描結果與掃描根目錄存進 SQLite，重開 App、重啟 Python 都還在。
2. DB 檔案放在 Electron 的 userData 目錄，路徑由 Electron 透過環境變數告訴 Python。
3. 使用者設定（預設編輯器）持久化。
4. 一鍵用 VS Code / Zed 開啟專案。
5. UI 依錯誤類型（401 / 404 / 逾時 / 連不上）顯示不同提示。

## 架構決定

| 問題 | 決定 | 理由 |
| --- | --- | --- |
| ORM 還是裸 `sqlite3`？ | 標準庫 `sqlite3` + 自己寫 repository class | 學習目標是理解 SQL 與 schema migration，不是學 ORM；表只有 3 張 |
| DB 路徑誰決定？ | Electron Main 用 `app.getPath('userData')`，以 `DEVSPACE_DB_PATH` 環境變數交給 Python | Python 不該知道 Electron 的目錄結構；Week 4 Electron spawn Python 時就是這樣傳 |
| Week 3 手動啟動 Python 時 DB 放哪？ | 沒有環境變數就退回 `backend/data/devspace.sqlite3`（已在 `.gitignore`） | 開發方便 |
| 「開啟編輯器」放 Python 還是 Main？ | Electron Main | 這是桌面能力（spawn 外部程式），且 Main 已有視窗情境；Python 保持純業務邏輯 |
| Migration 怎麼做？ | `schema_version` 表 + 有序的 SQL 腳本 list | 最小可行的 migration；夠用到 Week 6 |

## 每日大綱

### Day 15 · SQLite 層與 migration

- 新增 `app/db.py`：`get_connection(path)`、`run_migrations(conn)`、`MIGRATIONS: list[str]`。
- Schema v1：

```sql
CREATE TABLE schema_version (version INTEGER NOT NULL);
CREATE TABLE scan_roots (path TEXT PRIMARY KEY, added_at TEXT NOT NULL);
CREATE TABLE projects (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL UNIQUE,
  branch TEXT, is_dirty INTEGER NOT NULL, technologies TEXT NOT NULL,  -- JSON array
  root_path TEXT NOT NULL REFERENCES scan_roots(path),
  scanned_at TEXT NOT NULL
);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
```

- 測試：`tmp_path / "test.sqlite3"`，驗證 migration 可重複執行（idempotent）。
- 驗收：`uv run pytest` 綠；`sqlite3 backend/data/devspace.sqlite3 .schema` 看得到四張表。

### Day 16 · Repository 取代記憶體 store

- `app/repositories/projects.py`：`upsert_many`、`list`、`get`、`allowed_roots`，介面與 Day 9 的 `ProjectStore` 一致。
- FastAPI dependency `get_repo()` 從 `DEVSPACE_DB_PATH` 建連線；測試用 `app.dependency_overrides` 換成臨時 DB。
- `/projects/scan` 寫入 DB；`GET /projects` 從 DB 讀。
- 驗收：改一行 Python 讓 `--reload` 重啟後，`GET /projects` 仍有資料（Week 2 的痛點解除）。

### Day 17 · Electron 決定 DB 路徑

- Main：`const dbPath = join(app.getPath('userData'), 'devspace.sqlite3')`。
- Week 3 仍手動啟動 Python，所以 Terminal A 改成 `DEVSPACE_DB_PATH=$(...)`；寫一個 `backend/scripts/dev.sh` 包起來，或在 README 說明。
- Main 新增 IPC `app:info` 回傳 `{ userDataPath, dbPath }`，UI 顯示在 Backend 面板（除錯用）。
- 驗收：關掉 Electron 與 Python 再開，專案列表直接出現，不用重新掃描。

### Day 18 · Settings API 與設定面板

- Python：`GET /settings`、`PUT /settings`（Pydantic model：`editor: Literal["code", "zed", "cursor"]`）。
- Desktop：`window.devspace.getSettings()` / `updateSettings()`；React `SettingsPanel` 元件（下拉選單）。
- `pnpm gen:api` 重新產生型別，體驗 Day 13 的流程第二次。
- 驗收：改設定 → 重開 App → 設定還在。

### Day 19 · 開啟編輯器

- Main：`ipcMain.handle('projects:open', ...)`，讀 settings 的 editor，`spawn(editorBinary, [projectPath], { detached: true, stdio: 'ignore' }).unref()`。
- 找不到執行檔（`ENOENT`）時回傳結構化錯誤，UI 提示「請先安裝 VS Code 的 `code` 指令」。
- `ProjectCard` 加 Open 按鈕；雙擊卡片也能開。
- 安全：Main 只接受 DB 裡存在的 project id，再從 DB 取路徑，**不接受 Renderer 傳路徑**。
- 驗收：點 Open，VS Code 開啟該專案。

### Day 20 · 錯誤分類與 UI 回饋

- Main：IPC 回傳時把 `BackendError.status` 與 `TimeoutError` 編碼進 message 或改用 `{ ok, error }` 結構。
- Renderer：401 → 「Token 設定不一致」、404 → 「路徑已不存在，是否移除？」、逾時 → 「掃描時間過長，試試較小的資料夾」、連不上 → 「Backend 未啟動」。
- 新增 `DELETE /projects/{id}` 與對應 UI（移除失效專案）。
- 驗收：Day 12 測試矩陣的每個 error 格都有專屬訊息。

### Day 21 · 驗收與 Week 4 規劃

- Checklist、冷啟動演練（含 DB 建立）、回顧。
- 讀 [week-4-6-outline.md](week-4-6-outline.md)。

## Week 3 Definition of Done

- [ ] 重啟 Python 與 Electron 後專案列表仍在
- [ ] DB 位於 userData（透過 `app:info` 可見路徑）
- [ ] 設定可持久化
- [ ] 可用設定的編輯器開啟專案
- [ ] 四種錯誤有不同提示
- [ ] 所有新 endpoint 有測試；`pnpm gen:api` 後 typecheck 通過
