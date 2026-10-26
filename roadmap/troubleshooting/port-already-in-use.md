# 排錯 · `[Errno 48] Address already in use`

## 症狀

啟動 FastAPI 時出現：

```bash
uv run uvicorn app.main:app --reload
```

```text
INFO:     Will watch for changes in these directories: [...]
ERROR:    [Errno 48] Address already in use
```

## 這代表什麼

uvicorn 預設要監聽 `127.0.0.1:8000`。同一個位址、同一個埠號（port）同時只能有一個程式監聽。`Errno 48` 是 macOS 的錯誤碼，意思是 **8000 已經被別的程式佔走了**。在 Linux 上同樣的錯誤是 `Errno 98`。

所以要做的就是三件事：**找出是誰 → 判斷它是什麼 → 決定關掉它還是換埠號**。

---

## Step 1. 找出誰在監聽 8000

```bash
lsof -nP -iTCP:8000 -sTCP:LISTEN
```

參數說明：

- `lsof`：list open files。在 Unix 裡網路連線也算「檔案」，所以可以用它查。
- `-iTCP:8000`：只看 TCP 埠號 8000。
- `-sTCP:LISTEN`：只看「正在監聽」的那一方。不加的話，連到 8000 的客戶端連線（例如瀏覽器）也會列出來，容易看錯。
- `-n`：不把 IP 反查成主機名稱，`-P`：不把埠號轉成服務名稱。兩個都是為了輸出更快、更直接。

範例輸出：

```text
COMMAND     PID       USER   FD   TYPE  DEVICE  SIZE/OFF NODE NAME
python3.1 29221 chinghsinc    6u  IPv4  0x...        0t0  TCP 127.0.0.1:8000 (LISTEN)
```

重點只看兩欄：

| 欄位 | 意思 |
| --- | --- |
| `COMMAND` | 程式名稱（會被截斷，`python3.1` 其實是 `python3.12`） |
| `PID` | 程序編號，後面所有操作都靠它 |

> 如果**沒有任何輸出**，代表現在沒人佔用，可能剛好已經結束了，直接重新啟動即可。

---

## Step 2. 看清楚它是什麼程式

`COMMAND` 只告訴你「是 Python」，不知道是哪個專案。用 `ps` 看完整指令：

```bash
ps -o pid,ppid,command -p 29221
```

（把 `29221` 換成你在 Step 1 看到的 PID。）

範例輸出：

```text
  PID  PPID COMMAND
29221     1 /Users/chinghsinc/Develop/picture-to-model/.venv/bin/python3 -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

怎麼讀：

- `COMMAND` 的路徑：`.../picture-to-model/.venv/...` 表示這是**另一個專案** `picture-to-model` 的 uvicorn，不是 DevSpace 的。
- `PPID`（父程序 ID）是 `1`：父程序是系統的 `launchd`。代表當初啟動它的終端機已經關掉了，它變成「孤兒程序」，自己留在背景繼續跑。這就是為什麼你看不到它、卻佔著埠號。

### 小技巧：Step 1 + Step 2 一次做完

```bash
for p in $(lsof -tiTCP:8000 -sTCP:LISTEN); do ps -o pid,ppid,command -p $p; done
```

`-t` 讓 `lsof` 只輸出 PID，方便丟給其他指令用。

---

## Step 3. 判斷該怎麼處理

先問自己：**這個程式我還需要嗎？**

| 情況 | 建議 |
| --- | --- |
| 是自己之前開的 DevSpace uvicorn，忘了關 | 關掉它（做法 A） |
| 是別的專案、已經不用了 | 關掉它（做法 A） |
| 是別的專案、還在用 | 不要動它，換埠號（做法 B） |
| 看不出來是什麼（例如系統服務、其他公司軟體） | 不要亂關，換埠號（做法 B） |

### 做法 A：關掉佔用的程式

```bash
kill 29221
```

`kill` 預設送出 `SIGTERM`，是「請你結束」的禮貌請求。uvicorn 收到後會正常關閉連線再離開。

確認它真的結束了：

```bash
lsof -nP -iTCP:8000 -sTCP:LISTEN
```

沒有輸出就代表埠號已經釋放。

如果等幾秒還在，才用強制結束：

```bash
kill -9 29221
```

`-9` 是 `SIGKILL`，程式沒有機會清理，所以只當最後手段。

> **注意 `--reload` 模式**：用 `--reload` 啟動的 uvicorn 會有兩個程序，一個「監看檔案的父程序」和一個「真正處理請求的子程序」。如果只殺子程序，父程序會馬上再生一個新的。這時要看 Step 2 的 `PPID`，往上找到父程序並關掉它：
>
> ```bash
> ps -o pid,ppid,command -p <PPID>
> kill <PPID>
> ```

### 做法 B：換一個埠號啟動

不動別人的程式，自己讓開：

```bash
uv run uvicorn app.main:app --reload --port 8001
```

之後網址也要跟著換成 `http://127.0.0.1:8001/health`。之後如果 Electron 要呼叫這支 API，也記得用同一個埠號。

---

## Step 4. 驗證

重新啟動：

```bash
uv run uvicorn app.main:app --reload
```

看到這行就成功了：

```text
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

再用另一個終端機確認：

```bash
curl http://127.0.0.1:8000/health
```

應該回傳 `{"status":"ok","service":"devspace-backend",...}`。

---

## 預防

- 停止 uvicorn 時用 **`Ctrl+C`**，不要直接關掉終端機分頁或 VS Code 的 terminal。直接關掉時，程式有可能留在背景變成孤兒程序。
- 多個專案同時開發時，各自固定一個埠號，例如 DevSpace 用 8000、其他專案用 8001、8002，就不會互相搶。

## 速查表

```bash
# 誰在佔 8000？
lsof -nP -iTCP:8000 -sTCP:LISTEN

# 它是什麼？
ps -o pid,ppid,command -p <PID>

# 關掉它
kill <PID>        # 先禮貌地請它結束
kill -9 <PID>     # 不理你才強制

# 或者自己換埠號
uv run uvicorn app.main:app --reload --port 8001
```
