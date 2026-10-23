# 00 · 產品概述與 MVP 規格

## 專案資訊

| 項目 | 內容 |
| --- | --- |
| 專案名稱 | DevSpace |
| 定位 | Local-first Developer Workspace Manager |
| 平台 | macOS / Windows |
| 架構 | Local-first（所有資料留在本機，不需要帳號） |
| 第一版時程 | 4–6 週 |
| 主要學習目標 | Full-stack 架構：Renderer / Main / Backend 三層的責任與通訊 |

## 產品核心功能

開啟 DevSpace 後，你可以快速找到電腦裡的所有開發專案，查看它們使用的技術、Git 狀態，並直接開啟編輯器。

### 目標介面（概念示意，非第一週成果）

```
┌─────────────────────────────────────────────────────────────┐
│  DevSpace                                                   │
│  Workspace Overview                                         │
│                                                             │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│   │   12     │  │   03     │  │   08     │                  │
│   │ Projects │  │ Modified │  │ Recent   │                  │
│   └──────────┘  └──────────┘  └──────────┘                  │
│                                                             │
│   [ Search projects...                                  ]   │
│                                                             │
│   Recent projects                              View all →   │
│   ───────────────────────────────────────────────────────   │
│   astro-seo-test         Astro · TypeScript        main     │
│   workspace-manager      React · Electron       develop     │
│   python-playground      Python · FastAPI          main     │
└─────────────────────────────────────────────────────────────┘
```

第一週只會完成「Backend 健康檢查 + 基本 Dashboard 骨架」，Projects 區塊是空狀態。

## MVP 功能優先級

| 功能 | 內容 | 階段 |
| --- | --- | --- |
| App 啟動 | 開啟桌面視窗，啟動 React | Week 1 |
| Backend 溝通 | Electron 與 Python API 通訊 | Week 1 |
| Backend 狀態 | 顯示服務是否正常 | Week 1 |
| 掃描 Git 專案 | 選擇資料夾並尋找 Repository | Week 2 |
| 專案資訊 | 取得名稱、路徑、Branch、Dirty 狀態 | Week 2 |
| 本地資料庫 | SQLite 儲存專案與使用者設定 | Week 3 |
| 開啟編輯器 | 使用 VS Code / Zed 開啟專案 | Week 3 |
| 桌面安裝檔 | 整合 Python 執行檔及 Electron | Week 4–6 |

## 第一版暫時不做

- 帳號登入
- 雲端同步
- AI 助理
- Docker 管理
- 自動更新（建立模板時「Add Electron updater plugin?」請選 **No**）

這些功能都會增加架構複雜度，對第一階段學習不是必要的。先把三個 Process 之間的資料流做對、做穩，再談功能。

## 四到六週的里程碑

| 週次 | 里程碑 | 可驗證的成果 |
| --- | --- | --- |
| Week 1 | 三層通訊打通 | 按下按鈕 → Electron → Python → 回到 UI 顯示 Connected |
| Week 2 | 掃描 Git 專案 | 選資料夾 → 列出該目錄下所有 Git repo 與 branch |
| Week 3 | 持久化與開啟編輯器 | 重開 App 專案還在；點一下用 VS Code 開啟 |
| Week 4–6 | 可安裝的桌面 App | 產出 .dmg / .exe，Electron 自動管理 Python 子行程 |
