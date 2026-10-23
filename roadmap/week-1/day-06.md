# Day 6 · 理解與測試 Full-stack 通訊

## 今日目標

不寫新功能。透過回答問題與動手實驗，把前五天「做出來的東西」變成「理解的東西」。這些都是從 Frontend 轉向 Full-stack 很值得練習的系統設計觀念。

建議方式：先自己寫答案，再做對應實驗驗證，最後對照提示。

---

## 問題 1. 為什麼 React 不能直接使用 Electron 的完整 Node.js API？

**你的答案：**

>

**實驗：** 在 DevTools Console 執行

```js
typeof require          // 'undefined'
typeof process          // 'undefined'
```

再把 `src/main/index.ts` 的 `nodeIntegration` 暫時改成 `true`、`contextIsolation` 改成 `false`，重啟後再試一次。看到差別後**改回來**。

<details>
<summary>提示</summary>

Renderer 載入的是網頁內容。即使今天都是自己寫的程式碼，依賴的 npm 套件、未來可能顯示的外部資料（README、專案名稱、Git log）都是潛在的 XSS 入口。一旦 Renderer 能用 `require('child_process')`，任何 XSS 都等於遠端執行任意程式。`contextIsolation` + `nodeIntegration: false` + `sandbox` 把爆炸半徑限縮到「只能呼叫 preload 明確暴露的幾個方法」。

</details>

## 問題 2. IPC 和 HTTP 有什麼不同？

**你的答案：**

>

**實驗：**

```bash
# 任何程式都能打 Backend
curl http://127.0.0.1:8765/health

# 但沒有任何外部程式能呼叫 ipcMain.handle('backend:health')
```

在 Main 的 `checkBackend()` 裡加一行 `console.log('health requested')`，觀察它出現在 **Terminal B**（Main 的 stdout），而不是 DevTools Console（Renderer）。

<details>
<summary>提示</summary>

| | IPC | HTTP |
| --- | --- | --- |
| 邊界 | 同一個 App 的 Process 之間 | 任何能連 socket 的程式 |
| 資料 | structured clone，可傳 Date、Map 等 | 純文字 JSON |
| 錯誤 | Error 物件（訊息會被包一層） | status code + body |
| 可測試性 | 要起 Electron | curl / pytest |

兩者的用途不同：IPC 是「把能力限縮給 UI」，HTTP 是「讓 Backend 成為獨立服務」。

</details>

## 問題 3. 為什麼 FastAPI 不應直接寫死在 React 裡呼叫？

**你的答案：**

>

**實驗：** 在 `App.tsx` 暫時加一行

```ts
fetch('http://127.0.0.1:8765/health').then(r => r.json()).then(console.log)
```

看 DevTools Console 的錯誤。這是 `index.html` 裡 CSP 的 `default-src 'self'` 在擋。試完**刪掉**。

<details>
<summary>提示</summary>

1. **安全**：讓 Renderer 能發任意 HTTP，就是給它一條繞過 IPC 白名單的路。
2. **耦合**：Renderer 不該知道 port、host、甚至 Backend 是 HTTP。明天改成 Unix socket 或動態 port，只需改 Main。
3. **生命週期**：未來 Main 要負責啟動 / 重啟 Python 子行程，Main 知道 Backend 什麼時候 ready，Renderer 不知道。
4. **CORS / CSP**：桌面 App 不該為了讓 Renderer 直連而放寬 CSP 或在 Backend 開 CORS。

</details>

## 問題 4. 為什麼需要 `response_model`？

**你的答案：**

>

**實驗：** 在 `health_check()` 回傳的 `HealthResponse` 多傳一個 `secret="abc"` 參數（Pydantic 預設會忽略多餘欄位，先把 model 加上 `model_config = ConfigDict(extra="allow")` 再試），然後看 `curl` 回應裡有沒有 `secret`。再觀察 Swagger UI 的 schema 有沒有變。試完還原。

<details>
<summary>提示</summary>

- **文件**：Swagger / OpenAPI 的 response schema 就是從它來的。這份 schema 將來可以自動產生 TypeScript 型別，消除「三處手寫同一個 interface」的重複。
- **過濾**：`response_model` 會以該 model 的欄位為準序列化輸出，意外多出的欄位（例如資料庫的內部欄位、密碼 hash）不會洩漏。
- **驗證**：回傳值不符合 schema 時 FastAPI 直接 500，而不是把壞資料送到前端。
- **契約**：它把「Backend 承諾回什麼」寫成程式碼，而不是口頭約定。

</details>

## 問題 5. 如果 Python 停止運作會怎樣？

**你的答案：**

>

**實驗 A：** 停掉 Python，點 Check connection。觀察錯誤訊息文字。

**實驗 B：** 不停 Python，但在 `health_check()` 開頭加 `import time; time.sleep(5)`。點 Check connection，觀察 3 秒後出現什麼錯誤（`AbortSignal.timeout(3000)` 的效果）。試完還原。

**實驗 C：** 讓 Python 回 500：在 `health_check()` 裡 `raise RuntimeError("boom")`。觀察 Main 的 `response.ok` 檢查如何把它轉成 `Backend returned HTTP 500`。試完還原。

<details>
<summary>提示</summary>

三種失敗長得不一樣：**連不上**（ECONNREFUSED）、**逾時**（TimeoutError）、**連上但回錯**（HTTP 5xx / 格式錯誤）。Day 3 的 `checkBackend()` 把三種都轉成 `throw Error`，Day 4 的 UI 把所有 Error 都呈現成 `disconnected`。第一週這樣夠用；正式版會需要區分它們，例如逾時可以自動重試、ECONNREFUSED 可能要觸發「重啟 Python 子行程」。

</details>

## 加碼問題（選做）

6. `useCallback` 的依賴陣列是空的，為什麼 `setStatus`、`setError` 不用列進去？
7. 如果同時有兩個 Renderer 視窗（Electron 可以開多個 `BrowserWindow`），`ipcMain.handle` 要怎麼知道是誰呼叫的？（提示：handler 的第一個參數 `event.sender`）
8. 現在 `BACKEND_URL` 是寫死的常數。如果要改成啟動時從環境變數讀，應該改哪一層？為什麼 Renderer 完全不用動？

---

## 驗收

- [ ] 五個問題都寫了自己的答案
- [ ] 至少完成問題 1、3、5 的實驗，並把程式碼還原（`git status` 乾淨或只有 roadmap 筆記）
- [ ] 能用三句話對別人解釋「為什麼要三層」

## 學習筆記

（今天的收穫、還沒想通的地方）
