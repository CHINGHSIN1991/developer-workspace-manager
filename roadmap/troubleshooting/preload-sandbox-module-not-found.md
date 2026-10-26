# 排錯 · `window.devspace` 是 `undefined`（sandbox 下 preload 載入失敗）

## 症狀

Day 3 把 `sandbox` 改成 `true` 之後，在 DevTools Console 執行：

```js
await window.devspace.checkBackend()
```

出現：

```text
Uncaught TypeError: Cannot read properties of undefined (reading 'checkBackend')
```

往 Console 上方捲，通常還會看到 preload 的錯誤：

```text
Unable to load preload script: .../desktop/out/preload/index.js
Error: module not found: @electron-toolkit/preload
```

## 這代表什麼

`window.devspace` 是 preload 用 `contextBridge.exposeInMainWorld('devspace', ...)` 放上去的。它是 `undefined`，代表 **preload 根本沒跑到那一行**：腳本在更前面就出錯停掉了。

原因是兩件事同時發生：

1. **`sandbox: true` 的 preload 只能 `require` 很少的模組**：`electron`（裡面的 `contextBridge`、`ipcRenderer` 等）和少數 Node 內建模組。npm 套件一律不行。
2. **electron-vite 6 預設不會把 `dependencies` 打包進輸出**，而是留成執行時的 `require(...)`。`@electron-toolkit/preload` 正好列在 `package.json` 的 `dependencies`。

所以建置出來的 `out/preload/index.js` 長這樣：

```js
let electron = require("electron");
let _electron_toolkit_preload = require("@electron-toolkit/preload"); // ← 沙箱裡會失敗
```

第二行一失敗，整支 preload 就停了，`window.electron`、`window.api`、`window.devspace` 一個都不會出現。

> 用 `sandbox: false` 時一切正常，是因為沒開沙箱的 preload 可以 `require` 任何 npm 套件。所以這個問題要等到開了沙箱才會冒出來。

---

## Step 1. 確認是這個原因

```bash
cd /Users/chinghsinc/Develop/developer-workspace-manager/desktop
grep -n "require(" out/preload/index.js
```

除了 `require("electron")` 之外，如果還看到其他 `require("某個 npm 套件")`，就是這個問題。

---

## Step 2. 讓 electron-vite 把套件打包進 preload

編輯 `desktop/electron.vite.config.ts`，把 `preload: {}` 改成：

```ts
preload: {
  // sandbox: true 的 preload 只能 require('electron') 等少數內建模組，
  // 所以第三方套件必須打包進 preload，不能留成外部 require
  build: {
    externalizeDeps: { exclude: ['@electron-toolkit/preload'] }
  }
},
```

`externalizeDeps.exclude` 的意思是：「這些套件**不要**當成外部模組，直接把程式碼打包進來」。打包之後，preload 執行時就不需要去 `require` 它了。

### 這樣安全嗎？

安全。沙箱限制的是 preload **執行時能載入什麼**，用意是讓它拿不到 `fs`、`child_process` 這類能碰到系統的功能。打包進來的程式碼一樣跑在沙箱裡，權限完全相同。

真正影響安全的是 preload **暴露了什麼給網頁**，這部分見 Day 3 Step 4 關於 `window.electron` 的說明。

### 另一種修法

把 `@electron-toolkit/preload` 從 `dependencies` 移到 `devDependencies`，electron-vite 也會把它打包進去。效果一樣，但寫在 config 裡比較看得出來是為了 sandbox，所以這裡採用 config 的寫法。

---

## Step 3. 重啟並驗證

**改 config 一定要重啟 `pnpm dev`**，熱更新不會套用設定檔的修改。

```bash
pnpm dev
```

先確認輸出只剩 `electron` 一個 `require`：

```bash
grep -n "require(" out/preload/index.js
```

```text
1:let electron = require("electron");
```

再到 DevTools Console：

```js
await window.devspace.checkBackend()
```

應該回傳 `{status: 'ok', service: 'devspace-backend', ...}`。

如果改成出現 `Error invoking remote method 'backend:health': TypeError: fetch failed`，代表 preload 和 IPC 已經正常，只是 Python 後端沒開。先把 backend 跑在 `127.0.0.1:8765`。

---

## 預防

- 以後 preload 要用任何 npm 套件，都要加進 `externalizeDeps.exclude` 清單。
- 更好的做法是 preload 只 import `electron`，不用其他套件。Week 2 移除 `window.electron` 之後，preload 就不需要 `@electron-toolkit/preload`，這個設定也可以一起拿掉。
- 看到 `window.xxx is undefined` 時，先往 Console 上方找 `Unable to load preload script`。preload 的錯誤不會讓視窗崩潰，很容易漏看。

## 速查表

```bash
# preload 輸出裡有沒有不該出現的 require？
grep -n "require(" desktop/out/preload/index.js
```

```ts
// electron.vite.config.ts
preload: {
  build: {
    externalizeDeps: { exclude: ['@electron-toolkit/preload'] }
  }
},
```
