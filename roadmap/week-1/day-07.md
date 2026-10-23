# Day 7 · 驗收與下週規劃

## 今日目標

用清單檢查第一週成果，做一次小回顧，然後讀懂第二週要做什麼。

---

## Week 1 Checklist

| # | 項目 | 驗證方式 | 完成 |
| --- | --- | --- | --- |
| 1 | 可以使用 `pnpm dev` 啟動 Electron | 視窗開啟 | [ ] |
| 2 | React 首頁正確顯示 | 看到 DevSpace Dashboard | [ ] |
| 3 | Python FastAPI 的 `/health` 回傳 JSON | `curl http://127.0.0.1:8765/health` | [ ] |
| 4 | FastAPI Swagger UI 可使用 | 開 `http://127.0.0.1:8765/docs` 並 Execute | [ ] |
| 5 | React 成功透過 IPC 取得 Backend 狀態 | 畫面顯示 Connected 與 Backend 資訊 | [ ] |
| 6 | 停止 Python 後，React 顯示 Disconnected | Ctrl+C Python → 按鈕 → 紅色狀態、無白畫面 | [ ] |
| 7 | Python pytest 測試通過 | `uv run pytest` → `1 passed` | [ ] |
| 8 | TypeScript 型別檢查通過 | `pnpm typecheck` 無錯誤 | [ ] |
| 9 | Git Commit 完成並推送 GitHub | `git log` 有 commit，GitHub 看得到 | [ ] |

全部打勾後，到 [PROGRESS.md](../PROGRESS.md) 把 Week 1 標記完成。

## 一次完整的「冷啟動」演練

模擬「換一台電腦」：

```bash
cd /Users/chinghsinc/Develop
git clone <你的 GitHub repo> devspace-clone
cd devspace-clone

# 只照 README.md 的步驟做，不看 roadmap
cd backend && uv sync && uv run pytest && cd ..
cd desktop && pnpm install && pnpm typecheck && cd ..
```

如果任何一步卡住，代表 README 或 lockfile 有缺漏，回去補。演練完刪掉 `devspace-clone`。

## 回顧（寫下來）

**最有收穫的一天是哪天？為什麼？**

>

**卡最久的地方？最後怎麼解的？**

>

**如果重做一次第一週，會先做什麼？**

>

**目前最不確定的概念？（這會變成 Week 2 的學習重點）**

>

## 第二週預覽

第一週的 `/health` 是刻意選擇的最小 API，目的是把三層通訊打通。第二週開始加入真正的 Developer Workspace 功能：

| 目標 | 牽涉的層 |
| --- | --- |
| 選擇本地資料夾 | Electron Main 的 `dialog.showOpenDialog` + 新 IPC channel |
| 掃描該資料夾下的 Git repository | Python：`os.walk` / `pathlib`、找 `.git` 目錄 |
| 取得 branch、dirty 狀態 | Python：`subprocess.run(['git', ...])` |
| 偵測技術棧 | Python：看 `package.json`、`pyproject.toml`、`Cargo.toml` 等 |
| 顯示專案列表 | React：列表元件、空狀態、loading 狀態 |
| 三層資料契約 | Pydantic `Project` model ↔ TypeScript `Project` interface |

詳細的 API 設計與資料模型見 [week-2/README.md](../week-2/README.md)。

## Week 2 前要先想好的兩件事

1. **安全**：Week 2 的 API 會讀檔案系統。只監聽 127.0.0.1 不夠，要開始考慮本機 Token、限制可掃描的根目錄、路徑正規化。
2. **錯誤分類**：Day 6 問題 5 發現三種失敗長得不一樣。Week 2 掃描可能很慢（大目錄），逾時要拉長或改成非同步任務，UI 也要有進度回饋。

---

## 驗收

- [ ] 9 項 checklist 全部完成
- [ ] 冷啟動演練成功
- [ ] 回顧四題都有寫
- [ ] 讀完 week-2/README.md，知道下週第一天要做什麼

## 學習筆記

（寫下這週的總結）
