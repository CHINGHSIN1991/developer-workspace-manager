# DevSpace Roadmap

> **DevSpace** — Local-first Developer Workspace Manager
> Electron + React + TypeScript + Python FastAPI｜Full-stack 學習型 Side Project

這個資料夾是整個專案的「學習與開發路線圖」。每一天都有一份文件，包含：目標、指令、程式碼、背後原理、驗收方式。

## 文件索引

| 檔案 | 內容 |
| --- | --- |
| [00-mvp-spec.md](00-mvp-spec.md) | 產品概述、MVP 功能優先級、第一版不做的事 |
| [01-architecture.md](01-architecture.md) | 三個 Process 的責任與通訊方式、安全邊界、開發版 vs 正式版決策 |
| [02-tech-stack.md](02-tech-stack.md) | 技術規格、本機環境版本、目錄結構、常用指令 |
| [week-1/](week-1/) | 第一週每日實作（Day 1 – Day 7）：三層通訊打通 |
| [week-2/](week-2/) | 第二週每日實作（Day 8 – Day 14）：掃描 Git 專案、Token、OpenAPI 型別 |
| [week-3-outline.md](week-3-outline.md) | 第三週大綱：SQLite 持久化、開啟編輯器 |
| [week-4-6-outline.md](week-4-6-outline.md) | 第四到六週大綱：子行程管理、打包、安裝檔 |
| [PROGRESS.md](PROGRESS.md) | 進度追蹤 checklist |
| [learning-resources.md](learning-resources.md) | 推薦學習資源 |

## 第一週日程

| Day | 主題 | 文件 |
| --- | --- | --- |
| Day 1 | 安裝環境、建立 Electron 專案 | [day-01.md](week-1/day-01.md) |
| Day 2 | 建立 Python FastAPI 與第一個測試 | [day-02.md](week-1/day-02.md) |
| Day 3 | Electron ↔ Python 通訊（IPC + HTTP） | [day-03.md](week-1/day-03.md) |
| Day 4 | React Dashboard 與連線狀態管理 | [day-04.md](week-1/day-04.md) |
| Day 5 | 專案規範、Git Repository、型別檢查 | [day-05.md](week-1/day-05.md) |
| Day 6 | 理解與測試 Full-stack 通訊（概念複習） | [day-06.md](week-1/day-06.md) |
| Day 7 | 驗收與下週規劃 | [day-07.md](week-1/day-07.md) |

## 第二週日程

| Day | 主題 | 文件 |
| --- | --- | --- |
| Day 8 | Python Git 掃描 Service 與測試 | [day-08.md](week-2/day-08.md) |
| Day 9 | Projects API、Token 驗證與測試 | [day-09.md](week-2/day-09.md) |
| Day 10 | Electron Main 重構：共用型別、Token、原生對話框 | [day-10.md](week-2/day-10.md) |
| Day 11 | Preload 契約、useProjects Hook 與專案列表 | [day-11.md](week-2/day-11.md) |
| Day 12 | 列表樣式、狀態體驗與手動測試矩陣 | [day-12.md](week-2/day-12.md) |
| Day 13 | 從 OpenAPI 產生 TypeScript 型別、收緊 Preload | [day-13.md](week-2/day-13.md) |
| Day 14 | Week 2 驗收與 Week 3 規劃 | [day-14.md](week-2/day-14.md) |

第三週起為大綱形式（[week-3-outline.md](week-3-outline.md)、[week-4-6-outline.md](week-4-6-outline.md)），完整每日文件會依前兩週實際進度再補。

一天一份文件，但不綁定日曆：沒時間就順延，順序比進度表重要。

## 文件的可信度

Week 1 與 Week 2 的每一段程式碼都在撰寫時實際驗證過：Python 部分在 uv 專案中 `pytest` 全綠（15 個測試），TypeScript 部分套進 `@quick-start/electron` 1.0.31 的 `react-ts` 模板後 `pnpm typecheck`、`pnpm lint`、`pnpm build` 全綠。唯一無法在撰寫時驗證的是實際開啟 Electron 視窗的畫面與原生對話框行為。

## Repository 根目錄的決定

本機工作目錄 `developer-workspace-manager/` 就是 Git Repository 的根目錄。第一週完成後的結構：

```
developer-workspace-manager/  ← Git repo root
├── roadmap/                  ← 本資料夾（學習路線圖）
├── desktop/                  ← Electron + React + TypeScript
├── backend/                  ← Python FastAPI
└── .gitignore
```

原始教學裡的 `mkdir devspace && cd devspace` 這一步**不需要做**，所有指令都以 `developer-workspace-manager/` 為起點。

## 第一週的 Definition of Done

- [ ] Electron 可以正常開啟 React 視窗
- [ ] Python FastAPI 可以單獨啟動
- [ ] Python API 可以透過瀏覽器（Swagger UI）測試
- [ ] React 可以透過安全的 Electron IPC 取得 Backend 狀態
- [ ] Backend 離線時，UI 不會崩潰，能顯示錯誤並重新嘗試
- [ ] Git 專案可以推送至 GitHub，具備可重現的開發啟動步驟

## 每天的工作節奏建議

1. 先讀當天文件的「今日目標」與「你會學到」
2. 照 Step 操作，遇到卡關先看「常見問題」
3. 完成「驗收」清單，再到 [PROGRESS.md](PROGRESS.md) 打勾
4. 在當天文件最底下的「學習筆記」留一兩句心得（這是給未來的你看的）
