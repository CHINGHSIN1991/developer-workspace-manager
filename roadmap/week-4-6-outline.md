# 第四到六週大綱 · 打包成可安裝的桌面 App

> **這是大綱。** 這三週的細節高度依賴 Week 1–3 的實際狀態與你的機器（簽章憑證、Windows 測試環境），每日文件會在 Week 3 結束後再寫。

## 總目標

把「兩個 Terminal 手動啟動」變成「雙擊 App 圖示就能用」：Electron 自動啟動與關閉 Python 子行程、動態 port、隨機 Token、Python 打包成單一執行檔、產出 macOS `.dmg` 與 Windows `.exe`。

## 還技術債的順序

| 週 | 技術債 | 做法 |
| --- | --- | --- |
| Week 4 | Python 手動啟動 | Electron Main 用 `child_process.spawn` 啟動 uvicorn，`before-quit` 時 kill |
| Week 4 | 固定 Token | Main 每次啟動 `crypto.randomBytes(32).toString('hex')`，以環境變數傳給子行程 |
| Week 4 | 固定 port 8765 | Main 先用 `net.createServer().listen(0)` 找空 port，傳給 Python；或 Python 自己選後印到 stdout 由 Main 解析 |
| Week 4 | Backend 故障無處理 | Main 監聽子行程 `exit`，UI 顯示「Backend 已停止」與 Restart 按鈕；啟動時輪詢 `/health` 直到 ready |
| Week 5 | uv 虛擬環境 | PyInstaller 把 `app` 打成單一執行檔，放進 `desktop/resources/backend/` |
| Week 5 | Development Mode | electron-builder `extraResources` 帶入 Python 執行檔；`is.dev` 決定跑 `uv run` 還是打包的執行檔 |
| Week 6 | 無安裝檔 | `pnpm build:mac` / `build:win`；macOS 簽章與 notarization；Windows 以未簽章版本先測 |

## Week 4 · 子行程生命週期

| Day | 主題 |
| --- | --- |
| 22 | `src/main/python-process.ts`：`startBackend()` 回傳 `{ port, token, process }`；開發模式 spawn `uv run uvicorn ...` |
| 23 | 隨機 Token 與動態 port；`backend.ts` 改成讀 `startBackend()` 的結果而不是常數 |
| 24 | 啟動等待：輪詢 `/health` 最多 10 秒；UI 顯示「Starting backend...」狀態 |
| 25 | 關閉：`app.on('before-quit')` 送 SIGTERM，逾時再 SIGKILL；Windows 用 `taskkill /T` |
| 26 | 故障處理：子行程非預期退出 → UI 通知 + Restart；stdout/stderr 寫入 `userData/logs/` |
| 27 | 掃描改為背景任務：`POST /projects/scan` 立即回 `task_id`，`GET /tasks/{id}` 輪詢進度；UI 進度列 |
| 28 | 驗收：`pnpm dev` 只需一個 Terminal；Week 4 回顧 |

## Week 5 · 打包 Python 與整合

| Day | 主題 |
| --- | --- |
| 29 | `uv add --dev pyinstaller`；`pyinstaller --onefile --name devspace-backend app/__main__.py`；處理 uvicorn 的動態 import（`--hidden-import`） |
| 30 | `app/__main__.py`：從環境變數讀 port / token / db path，`uvicorn.run(app, host="127.0.0.1", port=...)` |
| 31 | 執行檔放到 `desktop/resources/backend/<platform>/`；`python-process.ts` 依 `is.dev` 與 `process.platform` 選路徑 |
| 32 | `electron-builder.yml`：`extraResources`、`asarUnpack`；`process.resourcesPath` 取得打包後路徑 |
| 33 | `pnpm build:unpack` 產出未壓縮版，直接執行驗證三層仍通 |
| 34 | 啟動時間量測與優化：PyInstaller `--onedir` vs `--onefile`、首次解壓延遲 |
| 35 | 驗收：未壓縮版 App 在沒有 uv、沒有 Node 的環境（新 macOS 使用者帳號）能跑 |

## Week 6 · 安裝檔與發布

| Day | 主題 |
| --- | --- |
| 36 | macOS：`pnpm build:mac` 產 `.dmg`；App icon（`build/icon.icns` 已由模板準備位置） |
| 37 | macOS 簽章：Apple Developer 憑證、`hardenedRuntime`、`entitlements.mac.plist`（模板已附）；無憑證則記錄 Gatekeeper 繞過步驟 |
| 38 | macOS notarization（有憑證才做）：`notarize` 設定、`APPLE_ID` 等環境變數 |
| 39 | Windows：在 Windows 機器或 VM 執行 `pnpm build:win`；PyInstaller 需在 Windows 上重新打包 Python |
| 40 | Windows 特有問題：路徑分隔符、`taskkill`、Defender 對 PyInstaller 執行檔的誤判 |
| 41 | GitHub Release：手動上傳 `.dmg` / `.exe`；寫 CHANGELOG |
| 42 | 總驗收與回顧：對照 [00-mvp-spec.md](00-mvp-spec.md) 的 MVP 表，逐項確認 |

## 第一版 Definition of Done

- [ ] 雙擊 App 即可使用，不需任何 Terminal
- [ ] 關閉 App 後沒有殘留的 Python process（`ps aux | grep devspace-backend`）
- [ ] 每次啟動 Token 與 port 都不同
- [ ] Backend 崩潰時 UI 有提示且可重啟
- [ ] macOS `.dmg` 可在另一台 Mac 安裝執行
- [ ] Windows `.exe` 可安裝執行（至少未簽章版本）
- [ ] MVP 表中 Week 1–3 的所有功能在打包版本都正常

## 第一版之後（不在 4–6 週範圍）

自動更新（electron-updater）、CI 自動打包（GitHub Actions matrix: macos / windows）、檔案系統監聽即時更新 dirty 狀態、多個掃描根目錄管理、專案標籤與搜尋。
