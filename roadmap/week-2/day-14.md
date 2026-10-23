# Day 14 · Week 2 驗收與 Week 3 規劃

## 今日目標

驗收第二週成果，做回顧，讀懂第三週要做什麼。

---

## Week 2 Checklist

| # | 項目 | 驗證方式 | 完成 |
| --- | --- | --- | --- |
| 1 | `git_scanner` service 有 8 個單元測試 | `uv run pytest tests/test_git_scanner.py -q` | [ ] |
| 2 | `/projects/*` 四個 endpoint 都要 Token | 不帶 header 全部 401 | [ ] |
| 3 | 沒設 `DEVSPACE_TOKEN` Python 拒絕啟動 | 直接 `uv run uvicorn ...` 看到 RuntimeError | [ ] |
| 4 | 相對路徑 422、不存在目錄 404 | curl 或 Day 12 測試矩陣 | [ ] |
| 5 | Electron 能開原生資料夾對話框 | Scan folder 按鈕 | [ ] |
| 6 | 掃描結果顯示名稱、路徑、branch、dirty、技術 | 真實資料夾 | [ ] |
| 7 | Refresh 反映 dirty 變化 | 改檔案 → Refresh | [ ] |
| 8 | Python 停掉時 UI 顯示錯誤並可 Retry | 停 uvicorn | [ ] |
| 9 | TypeScript 型別由 OpenAPI 產生 | `pnpm gen:api` 後 `pnpm typecheck` 通過 | [ ] |
| 10 | Renderer 只有 `window.devspace` | DevTools `window.electron === undefined` | [ ] |
| 11 | `pnpm build` / `pnpm lint` / `uv run pytest` 全綠 | 三個指令 | [ ] |
| 12 | 全部 commit 並推送 | `git status` 乾淨，GitHub 可見 | [ ] |

全部打勾後，到 [PROGRESS.md](../PROGRESS.md) 把 Week 2 標記完成。

## 冷啟動演練（含型別產生）

```bash
cd /Users/chinghsinc/Develop
rm -rf devspace-clone && git clone <你的 GitHub repo> devspace-clone && cd devspace-clone

cd backend && uv sync && uv run pytest -q && uv run python -m scripts.export_openapi && cd ..
git status --short        # openapi.json 不應有變化（代表 commit 的快照是最新的）
cd desktop && pnpm install && pnpm gen:api && pnpm typecheck && pnpm lint && cd ..
git status --short        # api.generated.ts 也不應有變化
```

兩次 `git status` 都乾淨，代表契約快照與程式碼同步。演練完刪掉 `devspace-clone`。

## 回顧（寫下來）

**這週最有收穫的概念？**

>

**Token 這條線：Python 驗證、Main 帶 Token、Renderer 完全不知道 Token 存在。你能解釋為什麼 Renderer 不該知道嗎？**

>

**Day 13 的「改名欄位 → typecheck 失敗」實驗，如果沒有產生型別會發生什麼？什麼時候才會發現？**

>

**目前最不確定的概念？**

>

## 技術債盤點（Week 2 結束時）

| 項目 | 狀態 |
| --- | --- |
| 三處手寫型別 | ✅ 已還（Day 13） |
| `window.electron` 任意 channel | ✅ 已還（Day 13） |
| 無 API 授權 | ✅ 已還（Day 9，固定 Token 版本） |
| 記憶體 store 隨 `--reload` 消失 | ⏳ Week 3 SQLite |
| Python 手動啟動、固定 port、固定 Token | ⏳ Week 4 |
| 掃描是同步請求，大目錄只能靠拉長逾時 | ⏳ Week 4 之後（背景任務） |
| 所有錯誤在 UI 都是一樣的紅字 | ⏳ Week 3 可依 `BackendError.status` 分類 |

## Week 3 預覽

| 目標 | 牽涉的層 |
| --- | --- |
| SQLite 持久化專案與掃描根目錄 | Python：`sqlite3` 標準庫、repository pattern、DB 路徑由環境變數決定 |
| 重開 App 專案還在 | Electron：`app.getPath('userData')` 當 DB 目錄，透過環境變數交給 Python |
| 使用者設定（預設編輯器） | Python：settings table；React：設定面板 |
| 用 VS Code / Zed 開啟專案 | Electron Main：`child_process.spawn('code', [path])`，這是桌面能力，放 Main 不放 Python |
| 錯誤分類 | Main 把 `BackendError.status` 傳到 Renderer，UI 對 401 / 404 / 逾時給不同提示 |

詳細每日大綱見 [week-3-outline.md](../week-3-outline.md)。

---

## 驗收

- [ ] 12 項 checklist 全部完成
- [ ] 冷啟動演練兩次 `git status` 都乾淨
- [ ] 回顧四題都有寫
- [ ] 讀完 week-3-outline.md

## 學習筆記

（寫下這週的總結）
