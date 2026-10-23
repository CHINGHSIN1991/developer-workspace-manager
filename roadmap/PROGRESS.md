# 進度追蹤

## 總覽

| 週次 | 主題 | 狀態 |
| --- | --- | --- |
| Week 1 | 三層通訊打通（Electron ↔ Python ↔ React） | 🟡 進行中 |
| Week 2 | 掃描 Git 專案、Token、OpenAPI 型別 | ⚪ 未開始 |
| Week 3 | SQLite 持久化、開啟編輯器（大綱） | ⚪ 未開始 |
| Week 4–6 | 子行程管理、打包、安裝檔（大綱） | ⚪ 未開始 |

狀態：⚪ 未開始 · 🟡 進行中 · 🟢 完成 · 🔴 卡關

## Week 1

| Day | 主題 | 狀態 | 備註 |
| --- | --- | --- | --- |
| 1 | 安裝環境、建立 Electron 專案 | ⚪ |  |
| 2 | 建立 Python FastAPI | ⚪ |  |
| 3 | Electron ↔ Python 通訊 | ⚪ |  |
| 4 | React Dashboard | ⚪ |  |
| 5 | 專案規範、Git、GitHub | ⚪ |  |
| 6 | 概念複習與實驗 | ⚪ |  |
| 7 | 驗收與下週規劃 | ⚪ |  |

### Week 1 Definition of Done

- [ ] Electron 可以正常開啟 React 視窗
- [ ] Python FastAPI 可以單獨啟動
- [ ] Python API 可以透過瀏覽器測試
- [ ] React 可以透過安全的 Electron IPC 取得 Backend 狀態
- [ ] Backend 離線時，UI 不會崩潰，能顯示錯誤並重新嘗試
- [ ] Git 專案可以推送至 GitHub，具備可重現的開發啟動步驟

## Week 2

| Day | 主題 | 狀態 | 備註 |
| --- | --- | --- | --- |
| 8 | Git 掃描 Service 與測試 | ⚪ |  |
| 9 | Projects API、Token 驗證 | ⚪ |  |
| 10 | Main 重構、原生對話框 | ⚪ |  |
| 11 | Preload 契約、useProjects、列表 | ⚪ |  |
| 12 | 樣式、狀態體驗、測試矩陣 | ⚪ |  |
| 13 | OpenAPI 型別產生、收緊 Preload | ⚪ |  |
| 14 | 驗收與 Week 3 規劃 | ⚪ |  |

### Week 2 Definition of Done

- [ ] 選擇本地資料夾後，Python 能找出其中所有 Git repository
- [ ] 每個專案顯示名稱、路徑、branch、dirty 狀態、技術棧
- [ ] 所有 `/projects/*` 請求都需要 Bearer Token
- [ ] TypeScript 型別由 OpenAPI 產生，Renderer 只暴露 `window.devspace`
- [ ] Backend 與 Desktop 的測試、型別檢查、lint 全綠

## 卡關紀錄

| 問題 | 解法 / 狀態 |
| --- | --- |
|  |  |

## 技術債（第一週刻意簡化、之後要還的）

| 項目 | 目前做法 | 預計處理 |
| --- | --- | --- |
| Python 手動啟動 | 兩個 Terminal | Week 4：Electron spawn 子行程 |
| 固定 port 8765 | 寫死常數 | Week 4：動態 port |
| 無 API 授權 | 任何本機程式可連 | Week 2 Day 9：固定 Token；Week 4：隨機 Token |
| `window.electron` 暴露受限版 ipcRenderer | 模板預設 | Week 2 Day 13：移除，只留 `window.devspace` |
| 三處手寫 HealthResponse 型別 | Python / Main / Renderer | Week 2 Day 13：OpenAPI 產生 TS 型別 |
| 記憶體 store 隨 `--reload` 消失 | Week 2 刻意簡化 | Week 3：SQLite |
| 所有錯誤都是一樣的紅字 | 不分類 | Week 3 Day 20：依 `BackendError.status` 分類 |
| 掃描是同步請求 | 60 秒逾時 | Week 4 Day 27：背景任務 + 進度 |
