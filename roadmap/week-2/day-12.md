# Day 12 · 列表樣式、狀態體驗與手動測試矩陣

## 今日目標

把 Day 11 的「能動」變成「好用」：加上專案卡片樣式，逐一驗證四種狀態的畫面，處理慢速掃描與錯誤的體驗，最後讓 `pnpm build` 全綠。今天不加新 API。

## 你會學到

- 用 CSS class 對應狀態機（`status` 決定顯示哪一塊）
- 手動測試矩陣：列出所有狀態 × 所有入口，一格一格打勾
- `StrictMode` 雙重執行對資料請求的影響
- 逾時值怎麼選：從實際量測回推

---

## Step 1. 加入專案列表樣式

在 `desktop/src/renderer/src/App.css` **最後面追加**（放在原本的 `@media` 之後也可以）：

```css
.project-list {
  list-style: none;
  margin: 20px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.project-card {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  border: 1px solid #303c4f;
  border-radius: 10px;
  background: #141b26;
}

.project-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.project-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
}

.dirty-dot {
  color: #fbbf24;
  font-size: 10px;
}

.project-path {
  color: #94a3b8;
  font-size: 12px;
  overflow-wrap: anywhere;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.tech-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tech-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #1e3a5f;
  color: #93c5fd;
}

.tech-badge.muted {
  background: #2a3444;
  color: #94a3b8;
}

.project-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  flex-shrink: 0;
}

.branch {
  font-size: 12px;
  color: #c4b5fd;
  background: #312e81;
  padding: 4px 10px;
  border-radius: 999px;
}

button.ghost {
  background: transparent;
  border: 1px solid #415068;
  color: #cbd5e1;
  padding: 6px 12px;
  font-size: 12px;
}

button.ghost:hover {
  border-color: #93b4f9;
}

@media (max-width: 650px) {
  .project-card {
    flex-direction: column;
  }

  .project-side {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}
```

說明：`button.ghost` 的選擇器比全域 `button` 更具體，所以能覆蓋 Day 4 的藍色按鈕樣式。`.project-path` 用 `overflow-wrap: anywhere` 讓長路徑在窄視窗能折行而不是撐破卡片。

## Step 2. 手動測試矩陣

兩個 Terminal 都啟動後，逐格驗證。這張表本身就是 Week 2 的驗收標準：

| 狀態 | 怎麼進入 | 預期畫面 | ✓ |
| --- | --- | --- | --- |
| `loading` | 剛開啟 Electron | Projects 區塊顯示 Loading projects...，Scan 按鈕 disabled | [ ] |
| `ready` + 空 | Backend 剛啟動，還沒掃描 | No projects yet. Scan a folder to get started. | [ ] |
| 取消對話框 | 點 Scan folder → 按 Cancel | 畫面完全不變 | [ ] |
| `scanning` | 選一個大資料夾 | 按鈕變 Scanning...、區塊顯示 Scanning /path... | [ ] |
| `ready` + 有資料 | 掃描完成 | 卡片列表：名稱、dirty ●、路徑、技術 badge、branch、Refresh | [ ] |
| detached HEAD | 在某 repo 執行 `git checkout --detach`，Refresh | branch 顯示 detached | [ ] |
| dirty 切換 | 改檔案 → Refresh → `git stash` → Refresh | ● 出現再消失 | [ ] |
| `error`（Python 停） | 停掉 uvicorn → Scan folder → 選資料夾 | 紅字 fetch failed + Retry；舊列表仍在 | [ ] |
| Retry 恢復 | 重啟 uvicorn → Retry | 回到 ready；但列表變空（記憶體被清） | [ ] |
| `error`（422） | 暫時把 `backend.ts` 的 `body: { root }` 改成 `body: { root: 'x' }` | 顯示 root must be an absolute path（改回來） | [ ] |
| Backend 面板獨立 | 停掉 Python → Check connection | Backend 面板 Disconnected，Projects 區塊不受影響 | [ ] |

把這張表複製到學習筆記，打完勾。

## Step 3. 兩個值得觀察的現象

**StrictMode 雙重請求。** 打開 Terminal A 看 uvicorn log，Electron 一啟動會看到兩次 `GET /projects` 與兩次 `GET /health`。這是 React 19 開發模式刻意的（mount → unmount → mount），正式 build 不會。對只讀 API 無害；Week 3 若有「寫入」API 要特別注意不能放在 effect 裡。

**逾時值。** 在 Terminal A 觀察一次掃描 `~/Develop` 花多久（uvicorn 會印 request 時間，或在 Python 加 `time.perf_counter()`）。Day 10 設 60 秒是估的；如果你的資料夾 5 秒就掃完，60 秒是合理的安全邊際；如果要 90 秒，就要考慮 Week 4 之後改成背景任務 + 進度回報，而不是一直拉長逾時。

## Step 4. 品質檢查與 Commit

```bash
cd /Users/chinghsinc/Develop/python-electron/desktop
pnpm build          # typecheck + electron-vite build
pnpm lint
pnpm format         # Prettier 統一排版

cd ../backend
uv run pytest -q

cd ..
git add . && git commit -m "feat(desktop): style project list and polish scan states"
```

---

## 驗收

- [ ] 測試矩陣 11 格全部打勾
- [ ] `pnpm build`、`pnpm lint`、`uv run pytest` 全部通過
- [ ] 知道你的機器掃描主要資料夾要幾秒
- [ ] Commit 完成

## 常見問題

**Q：卡片在窄視窗會爆版？**
確認 `.project-main` 有 `min-width: 0`。flex 子元素預設 `min-width: auto`，長文字會撐開父層。

**Q：想讓 Scan 期間也能看到舊列表？**
把 `ProjectList.tsx` 的 `projects.length > 0 && status !== 'scanning'` 改成 `projects.length > 0`，再把 scanning 的提示改成列表上方的一行文字。這是產品決策，兩種都合理。

**Q：`pnpm format` 改了很多檔案？**
模板的 Prettier 設定是 `singleQuote: true`、`semi: false`、`printWidth: 100`。本路線圖的程式碼已照這個格式，若有差異以 Prettier 為準。

## 學習筆記

（貼上打完勾的測試矩陣，寫下觀察到的掃描秒數）
