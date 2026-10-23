# Day 2 · 建立 Python FastAPI

## 今日目標

建立一個**獨立、可用瀏覽器測試、有自動化測試**的 Python API。今天完全不碰 Electron。

## 你會學到

- uv 如何管理虛擬環境與依賴（不用手動 `source .venv/bin/activate`）
- FastAPI 的 App、Endpoint、Pydantic Model、`response_model`
- uvicorn 的 `--reload` / `--host` / `--port` 代表什麼
- 用 `TestClient` 不啟動 server 就測 API

---

## Step 1. 初始化 Backend

另外開一個 Terminal，從 Repository 根目錄開始：

```bash
cd /Users/chinghsinc/Develop/python-electron

uv init backend --bare --python 3.12
cd backend
uv python pin 3.12

uv add "fastapi[standard]"
uv add --dev pytest httpx
```

說明：

- `--bare` 只產生 `pyproject.toml`，不會多出範例 `main.py`、README，**也不會產生 `.python-version`**。
- `uv python pin 3.12` 補寫 `.python-version`。沒有這個檔案時，uv 只靠 `requires-python = ">=3.12"` 挑直譯器，系統的 3.14 也符合條件，結果可能因環境而異。pin 之後每台機器都固定用 3.12。
- 本機 uv 已安裝 cpython 3.12.14，不需下載。
- `fastapi[standard]` 內含 uvicorn、httpx 等常用套件。
- `uv add` 會自動建立 `.venv/` 與 `uv.lock`。之後所有 Python 指令都用 `uv run ...` 執行，uv 會自動用對的虛擬環境。

確認：

```bash
uv run python --version    # Python 3.12.14
```

> 系統 `python3` 是 3.14，但專案裡 `uv run python --version` 會顯示 3.12.x。這是正常的。

建立 Python package：

```bash
mkdir -p app
touch app/__init__.py
touch app/main.py
```

## Step 2. 撰寫第一個 API

檔案：`backend/app/main.py`

```python
from datetime import datetime, timezone
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(
    title="DevSpace API",
    version="0.1.0",
)


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str
    version: str
    timestamp: datetime


@app.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="devspace-backend",
        version="0.1.0",
        timestamp=datetime.now(timezone.utc),
    )
```

### 幾個重要觀念

| 程式碼 | 意義 |
| --- | --- |
| `FastAPI()` | 建立應用程式實例，uvicorn 會載入它 |
| `@app.get("/health")` | 宣告一個 GET Endpoint |
| `BaseModel` | Pydantic 資料模型，負責驗證與序列化 |
| `Literal["ok"]` | 限制 `status` 只能是字串 `"ok"`，OpenAPI 文件也會顯示為 enum |
| `response_model=HealthResponse` | 告訴 FastAPI 回應的 schema，會出現在 Swagger UI，並在回傳時過濾/驗證欄位 |
| `datetime.now(timezone.utc)` | UTC 時間戳，避免未來跨時區問題；Pydantic 會序列化成 ISO 8601 字串 |

## Step 3. 啟動 Backend

在 `backend/` 目錄下：

```bash
uv run uvicorn app.main:app \
  --reload \
  --host 127.0.0.1 \
  --port 8765
```

| 參數 | 意義 |
| --- | --- |
| `app.main:app` | 匯入 Python 模組 `app.main`，取得其中的 `app` 變數 |
| `--reload` | 修改 Python 程式碼後自動重新載入，**僅用於開發** |
| `--host 127.0.0.1` | 只接受本機連線，不會公開到區域網路 |
| `--port 8765` | 與 Electron Main 的 `BACKEND_URL` 約定一致 |

## Step 4. 測試 Python API

**瀏覽器**：

- Swagger UI：<http://127.0.0.1:8765/docs>
- ReDoc：<http://127.0.0.1:8765/redoc>
- OpenAPI JSON：<http://127.0.0.1:8765/openapi.json>

在 Swagger UI 展開 `GET /health` → Try it out → Execute，看回應。

**另一個 Terminal**：

```bash
curl http://127.0.0.1:8765/health
```

預期格式：

```json
{
  "status": "ok",
  "service": "devspace-backend",
  "version": "0.1.0",
  "timestamp": "2026-10-24T05:00:00.123456Z"
}
```

實際 `timestamp` 會是當下的 UTC 時間。

## Step 5. 建立第一個 Python 測試

建立測試資料夾，**`tests/__init__.py` 是必要的**：

```bash
mkdir -p tests
touch tests/__init__.py
```

為什麼必要：`--bare` 建立的是 application 專案，沒有 `[build-system]`，所以 `app` 套件**不會**被安裝進 `.venv`。pytest 收集到 `tests/test_health.py` 時，若 `tests/` 沒有 `__init__.py`，會把 `tests/` 本身插進 `sys.path`，`from app.main import app` 就找不到；有了 `__init__.py`，pytest 改把 `tests/` 的上一層（也就是 `backend/`）插進 `sys.path`，`app` 就找得到了。這是實際跑過確認的行為。

新增 `backend/tests/test_health.py`：

```python
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/health")

    assert response.status_code == 200

    data = response.json()

    assert data["status"] == "ok"
    assert data["service"] == "devspace-backend"
    assert data["version"] == "0.1.0"
    assert "timestamp" in data
```

執行：

```bash
uv run pytest
```

預期輸出結尾：

```
1 passed in 0.xx s
```

這是你的第一個 Backend API Test。它**不需要啟動真正的 HTTP Server**，因為 FastAPI 的 `TestClient` 直接呼叫 ASGI 應用程式。這也代表 Day 3 之後即使 uvicorn 沒開，`pytest` 仍能跑。

> 若仍出現 `ModuleNotFoundError: No module named 'app'`，確認 `tests/__init__.py` 存在，且你是在 `backend/` 目錄執行。

## Step 6. 小實驗（選做，10 分鐘）

1. 把 `status="ok"` 改成 `status="fine"`，存檔，用 curl 打一次。你會看到 500 錯誤與 Pydantic 的驗證訊息。這就是 `Literal["ok"]` 在保護你。改回來。
2. 在 Swagger UI 看 `HealthResponse` 的 schema，對照 `Literal` 與 `datetime` 各被描述成什麼。

---

## 驗收

- [ ] `uv run uvicorn ...` 可以啟動，Terminal 顯示 `Uvicorn running on http://127.0.0.1:8765`
- [ ] `curl http://127.0.0.1:8765/health` 回傳 JSON
- [ ] Swagger UI（`/docs`）可開啟且能執行 `/health`
- [ ] `uv run pytest` 顯示 `1 passed`
- [ ] `backend/.python-version` 存在且內容是 `3.12`
- [ ] 知道 `app.main:app` 這個字串的意思

## 常見問題

**Q：`uv init` 說找不到 Python 3.12？**
執行 `uv python install 3.12` 再重試。本機已有 3.12.14，理論上不會發生。

**Q：Port 8765 被占用？**
`lsof -i :8765` 找出佔用的程式。如果一定要換 port，記得 Day 3 的 `BACKEND_URL` 也要改。

**Q：為什麼不用 `pip` + `venv`？**
可以，但 uv 把「建 venv、裝套件、鎖版本、用對的 Python 執行」收斂成一組指令，而且有 lockfile 可重現。

## 學習筆記

（寫下今天的心得、卡關點、想問的問題）
