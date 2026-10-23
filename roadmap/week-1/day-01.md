# Day 1 · 安裝環境並建立 Electron 專案

## 今日目標

在桌面開啟一個由 Electron 承載的 React 視窗，修改 React 畫面後能看到 Hot Reload。

## 你會學到

- Electron 專案的三個建置目標：`main` / `preload` / `renderer`
- electron-vite 如何同時處理這三個目標並提供 HMR
- pnpm 10 的 build script 政策，以及 Electron 怎麼下載執行檔

---

## Step 1. 確認開發工具

```bash
node -v        # 預期 v24.11.1
pnpm -v        # 預期 10.24.0
python3 --version   # 3.14.2（系統 Python，專案不會用它）
git --version
uv --version   # 0.12.5
```

你的機器已全部就緒（實測見 [02-tech-stack.md](../02-tech-stack.md)）。以下安裝步驟只在缺工具時才需要：

<details>
<summary>若缺少工具時的安裝指令（本機已不需要）</summary>

```bash
# uv
brew install uv

# Node.js（透過 fnm）
brew install fnm
# 在 ~/.zshrc 加入：eval "$(fnm env --use-on-cd)"
fnm install 22
fnm use 22

# pnpm
corepack enable pnpm
```

</details>

## Step 2. 建立 Electron 專案

從 Repository 根目錄 `developer-workspace-manager/` 開始（**不要**另外 `mkdir devspace`）：

```bash
cd /Users/chinghsinc/Develop/developer-workspace-manager

pnpm create @quick-start/electron@latest desktop --template react-ts
```

互動式提問時的建議回答：

| 提問 | 回答 |
| --- | --- |
| Add TypeScript? | 模板已含，不會問或選 Yes |
| Add Electron updater plugin? | **No**（第一週不做自動更新） |
| Enable Electron download mirror proxy? | No（台灣網路直連即可） |

完成後會多出 `desktop/` 資料夾。

## Step 3. 安裝依賴並啟動

```bash
cd desktop
pnpm install
pnpm dev
```

此時應該看到 Electron 開啟一個包含 React 的桌面視窗，中間顯示 Electron logo 與版本資訊。

### 關於 pnpm 10 與 Electron 下載

pnpm 10 預設**不執行**依賴套件的 `postinstall` script。Electron 執行檔是靠 postinstall 下載的，所以理論上會被擋住。

這個模板已經處理好了：`desktop/package.json` 自己的 `postinstall` 寫著 `install-electron && electron-builder install-app-deps`，而 `install-electron` 是 Electron 44 自帶的指令，專案自己的 script 不受封鎖。所以你應該不會遇到問題。

**萬一** `pnpm dev` 出現 `Electron failed to install correctly, please delete node_modules/electron and try installing again`：

```bash
pnpm approve-builds        # 互動式選擇 electron、esbuild 等允許執行 build script
pnpm install
```

## Step 4. 體驗 Hot Reload

保持 `pnpm dev` 執行，打開 `desktop/src/renderer/src/App.tsx`，隨便改一段文字並存檔。Electron 視窗應該在一秒內更新，**不需重啟**。

然後故意在 `desktop/src/main/index.ts` 改一個字（例如視窗 `width`），存檔。你會發現 Main Process 的修改會讓整個 Electron **重新啟動**，而不是 Hot Reload。這就是 Renderer 與 Main 的第一個差異：Renderer 是網頁，可以熱更新；Main 是 Node.js 程式，要重跑。

## Step 5. 看一眼模板給了什麼

花 10 分鐘讀這三個檔案，不用全懂，先知道它們存在：

| 檔案 | 它在做什麼 |
| --- | --- |
| `src/main/index.ts` | 建立 `BrowserWindow`、載入 renderer、註冊一個 `ping` IPC 範例 |
| `src/preload/index.ts` | 用 `contextBridge` 暴露 `window.electron` 與 `window.api` |
| `src/renderer/src/main.tsx` | React 進入點，import 了 `assets/main.css` |

注意模板的 `BrowserWindow` 設定是 `sandbox: false`，Day 3 我們會改。

---

## 驗收

- [ ] `pnpm dev` 可以開啟 Electron 視窗並看到 React 畫面
- [ ] 修改 `App.tsx` 後視窗自動更新（Hot Reload）
- [ ] 修改 `src/main/index.ts` 後 Electron 重新啟動（理解 Main 與 Renderer 的差異）
- [ ] 知道 `main` / `preload` / `renderer` 三個資料夾分別對應哪個 Process

## 常見問題

**Q：`pnpm create` 卡在下載 Electron 很久？**
Electron 執行檔約 100 MB，第一次下載需要時間。若超過 10 分鐘，Ctrl+C 後重跑 `pnpm install`。

**Q：出現 `ERR_PNPM_...` 相關 build script 警告？**
看 Step 3 的 `pnpm approve-builds`。

**Q：macOS 跳出「無法驗證開發者」？**
開發模式的 Electron 是未簽章的，第一次可能需要在「系統設定 → 隱私權與安全性」允許。

## 學習筆記

（寫下今天的心得、卡關點、想問的問題）
