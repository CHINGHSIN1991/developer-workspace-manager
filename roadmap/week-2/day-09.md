# Day 9 · Projects API、Token 驗證與測試

## 今日目標

把 Day 8 的 service 包成四個 REST endpoint，加上本機 Bearer Token 驗證，全部有測試。完成後可以在 Swagger UI 帶 Token 掃描真實資料夾。

## 你會學到

- `APIRouter`：把 endpoint 從 `main.py` 拆到獨立模組
- FastAPI Dependency Injection：用 `Depends` 做授權檢查
- Lifespan：啟動時檢查設定，沒設好直接失敗
- HTTP 狀態碼的語意：401 / 404 / 422 各代表什麼
- 為什麼「只聽 127.0.0.1」不夠，以及 Token 怎麼補這個洞
- pytest 的 `conftest.py`、`monkeypatch`、fixture 共用

## Token 的設計（Week 2 版本）

[01-architecture.md](../01-architecture.md) 提過：同一台電腦上的其他程式也能連 127.0.0.1:8765。從今天起 `/projects/*` 會讀檔案系統並執行 `git`，所以每個請求都要帶 Token。

| | Week 2（Python 手動啟動） | Week 4（Electron 啟動 Python） |
| --- | --- | --- |
| Token 來源 | 你在兩個 Terminal 都 `export DEVSPACE_TOKEN=...` | Electron 每次啟動產生隨機值，透過環境變數交給子行程 |
| Python 沒拿到 Token | **拒絕啟動** | 同左 |
| Electron 沒拿到 Token | 開發模式退回固定值 `dev-token`（Day 10） | 不可能發生，因為是它產生的 |

Week 2 的做法安全性有限（固定字串），但**架構已經是對的**：Python 永遠驗證、Electron 永遠帶 Token。Week 4 只是換掉 Token 的來源。

---

## Step 1. 授權 Dependency

新增 `backend/app/auth.py`：

```python
import os
import secrets
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status

TOKEN_ENV = "DEVSPACE_TOKEN"


def get_expected_token() -> str:
    token = os.environ.get(TOKEN_ENV)
    if not token:
        raise RuntimeError(
            f"{TOKEN_ENV} is not set. Start the backend with {TOKEN_ENV}=<secret> ..."
        )
    return token


def require_token(
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    expected = get_expected_token()
    scheme, _, provided = (authorization or "").partition(" ")

    if scheme.lower() != "bearer" or not secrets.compare_digest(provided, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing bearer token",
        )


Authorized = Annotated[None, Depends(require_token)]
```

| 片段 | 為什麼 |
| --- | --- |
| `Annotated[str \| None, Header()]` | FastAPI 會自動從 `Authorization` header 取值（參數名 `authorization` 對應 header 名） |
| `secrets.compare_digest` | 常數時間比較，避免 timing attack。本機 App 風險低，但這是正確習慣 |
| `Authorized = Annotated[None, Depends(...)]` | 把 dependency 包成型別別名，endpoint 簽名寫 `_: Authorized` 就好 |

## Step 2. 記憶體儲存

新增 `backend/app/store.py`：

```python
from app.models import Project


class ProjectStore:
    """Week 2 的記憶體儲存。uvicorn --reload 會在每次重載時清空；Week 3 改為 SQLite。"""

    def __init__(self) -> None:
        self._projects: dict[str, Project] = {}
        self.allowed_roots: set[str] = set()

    def upsert_many(self, projects: list[Project]) -> None:
        for project in projects:
            self._projects[project.id] = project

    def list(self) -> list[Project]:
        return sorted(self._projects.values(), key=lambda p: p.name.lower())

    def get(self, project_id: str) -> Project | None:
        return self._projects.get(project_id)


store = ProjectStore()
```

> **重要**：這個 dict 活在 Python process 的記憶體裡。你每次改 Python 檔案，`--reload` 就會重啟 process，**掃描結果會消失**。這不是 bug，是 Week 3 要做 SQLite 的原因。

`allowed_roots` 記錄「使用者掃描過哪些根目錄」。`refresh` 只允許重新讀取這些目錄底下的 repo，避免有人拿 API 去探測任意路徑。

## Step 3. Projects Router

新增 `backend/app/routers/__init__.py`（空檔案）與 `backend/app/routers/projects.py`：

```python
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, status

from app.auth import Authorized
from app.models import Project, ScanRequest, ScanResponse
from app.services import git_scanner
from app.store import store

router = APIRouter(prefix="/projects", tags=["projects"])


def _validate_root(raw: str) -> Path:
    root = Path(raw).expanduser()
    if not root.is_absolute():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="root must be an absolute path",
        )
    root = root.resolve()
    if not root.is_dir():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Directory not found: {root}",
        )
    return root


@router.post("/scan", response_model=ScanResponse)
def scan_projects(body: ScanRequest, _: Authorized) -> ScanResponse:
    root = _validate_root(body.root)
    projects = git_scanner.scan(root, max_depth=body.max_depth)

    store.allowed_roots.add(str(root))
    store.upsert_many(projects)

    return ScanResponse(
        root=str(root),
        projects=projects,
        scanned_at=datetime.now(timezone.utc).isoformat(),
    )


@router.get("", response_model=list[Project])
def list_projects(_: Authorized) -> list[Project]:
    return store.list()


@router.get("/{project_id}", response_model=Project)
def get_project(project_id: str, _: Authorized) -> Project:
    project = store.get(project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.post("/{project_id}/refresh", response_model=Project)
def refresh_project(project_id: str, _: Authorized) -> Project:
    project = store.get(project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    repo = Path(project.path)
    allowed = any(repo.is_relative_to(root) for root in store.allowed_roots)
    if not allowed or not repo.is_dir():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project path no longer available"
        )

    refreshed = git_scanner.inspect_repo(repo)
    store.upsert_many([refreshed])
    return refreshed
```

### 狀態碼的語意

| 狀態碼 | 何時 | 誰的錯 |
| --- | --- | --- |
| 401 Unauthorized | Token 錯或沒帶 | 呼叫端 |
| 404 Not Found | 目錄不存在、project id 不存在、路徑已不可用 | 呼叫端（或世界變了） |
| 422 Unprocessable Content | 相對路徑、`max_depth` 超出範圍、JSON 缺欄位 | 呼叫端（請求格式） |
| 500 | 我們沒預期到的例外 | 我們 |

`422` 中 Pydantic 自動處理的部分（`max_depth` 範圍、缺欄位）不用寫程式；只有「是不是絕對路徑」這種需要邏輯判斷的才自己丟。

## Step 4. 組裝 main.py

**覆寫** `backend/app/main.py`：

```python
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel

from app.auth import get_expected_token
from app.routers import projects


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # 啟動時就確認 Token 已設定，沒設定直接失敗，而不是等到第一個請求才 500
    get_expected_token()
    yield


app = FastAPI(title="DevSpace API", version="0.2.0", lifespan=lifespan)
app.include_router(projects.router)


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
        version="0.2.0",
        timestamp=datetime.now(timezone.utc),
    )
```

`/health` **刻意不加 Token**：它是「服務活著嗎」的探針，Electron 在拿不到 Token 的異常情況下仍要能分辨「Python 沒開」和「Token 錯」。版本號升到 `0.2.0`，Day 2 的測試要跟著改（下一步）。

## Step 5. 測試

新增 `backend/tests/conftest.py`：

```python
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.store import store

TEST_TOKEN = "test-token"


@pytest.fixture(autouse=True)
def _token_env(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("DEVSPACE_TOKEN", TEST_TOKEN)
    store._projects.clear()
    store.allowed_roots.clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {TEST_TOKEN}"}
```

`conftest.py` 裡的 fixture 自動對同目錄所有測試可用。`autouse=True` 讓每個測試前都設好 Token、清空 store，測試之間不互相影響。

**覆寫** `backend/tests/test_health.py`（改用 fixture、移除寫死的版本號）：

```python
from fastapi.testclient import TestClient


def test_health_check(client: TestClient):
    response = client.get("/health")

    assert response.status_code == 200

    data = response.json()

    assert data["status"] == "ok"
    assert data["service"] == "devspace-backend"
    assert "timestamp" in data
```

新增 `backend/tests/test_projects_api.py`：

```python
from pathlib import Path

from fastapi.testclient import TestClient

from tests.test_git_scanner import make_repo


def test_scan_requires_token(client: TestClient, tmp_path: Path):
    response = client.post("/projects/scan", json={"root": str(tmp_path)})
    assert response.status_code == 401

    response = client.post(
        "/projects/scan",
        json={"root": str(tmp_path)},
        headers={"Authorization": "Bearer wrong"},
    )
    assert response.status_code == 401


def test_scan_rejects_relative_root(client: TestClient, auth_headers: dict[str, str]):
    response = client.post("/projects/scan", json={"root": "relative/path"}, headers=auth_headers)
    assert response.status_code == 422


def test_scan_missing_dir_returns_404(
    client: TestClient, auth_headers: dict[str, str], tmp_path: Path
):
    response = client.post(
        "/projects/scan", json={"root": str(tmp_path / "nope")}, headers=auth_headers
    )
    assert response.status_code == 404


def test_scan_then_list_get_refresh(
    client: TestClient, auth_headers: dict[str, str], tmp_path: Path
):
    repo = make_repo(tmp_path / "alpha")

    response = client.post("/projects/scan", json={"root": str(tmp_path)}, headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["root"] == str(tmp_path.resolve())
    assert [p["name"] for p in body["projects"]] == ["alpha"]
    project_id = body["projects"][0]["id"]

    response = client.get("/projects", headers=auth_headers)
    assert [p["id"] for p in response.json()] == [project_id]

    response = client.get(f"/projects/{project_id}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["is_dirty"] is False

    (repo / "dirty.txt").write_text("x")
    response = client.post(f"/projects/{project_id}/refresh", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["is_dirty"] is True


def test_rescan_does_not_duplicate(
    client: TestClient, auth_headers: dict[str, str], tmp_path: Path
):
    make_repo(tmp_path / "alpha")

    for _ in range(2):
        client.post("/projects/scan", json={"root": str(tmp_path)}, headers=auth_headers)

    response = client.get("/projects", headers=auth_headers)
    assert len(response.json()) == 1


def test_get_unknown_project(client: TestClient, auth_headers: dict[str, str]):
    response = client.get("/projects/doesnotexist", headers=auth_headers)
    assert response.status_code == 404
```

執行：

```bash
cd /Users/chinghsinc/Develop/python-electron/backend
uv run pytest -q
```

預期：

```
...............                                          [100%]
15 passed
```

## Step 6. 啟動並用 Swagger 測試

從今天起 Backend 的啟動指令要帶 Token：

```bash
cd /Users/chinghsinc/Develop/python-electron/backend
DEVSPACE_TOKEN=dev-token uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8765
```

試試看**不帶** Token 啟動，應該看到 `RuntimeError: DEVSPACE_TOKEN is not set...` 然後 process 結束。這是 lifespan 在保護你。

開 <http://127.0.0.1:8765/docs>：

1. `POST /projects/scan` → Try it out → body 填 `{"root": "/Users/chinghsinc/Develop", "max_depth": 3}` → Execute。預期 **401**。
2. 用 curl 帶 header：

```bash
curl -s -X POST http://127.0.0.1:8765/projects/scan \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{"root": "/Users/chinghsinc/Develop", "max_depth": 3}' | python3 -m json.tool | head -40

curl -s http://127.0.0.1:8765/projects -H "Authorization: Bearer dev-token" | python3 -m json.tool
```

> Swagger UI 要帶 Bearer Token 需要在 FastAPI 設定 security scheme（`HTTPBearer`）。這是選做的改良，見常見問題。

## Step 7. 更新根目錄 README

把 `README.md` 的 Terminal A 指令改成：

```bash
cd backend
uv sync
DEVSPACE_TOKEN=dev-token uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8765
```

並在 Requirements 下補一句：「`DEVSPACE_TOKEN` 在開發期固定為 `dev-token`，Electron 開發模式會自動使用同一個值。」

Commit：

```bash
cd /Users/chinghsinc/Develop/python-electron
git add . && git commit -m "feat(backend): add git scanner service and projects API with token auth"
```

---

## 驗收

- [ ] `uv run pytest -q` 顯示 `15 passed`
- [ ] 不帶 `DEVSPACE_TOKEN` 啟動會被拒絕
- [ ] Swagger 不帶 Token 得到 401；curl 帶 Token 能掃到真實專案
- [ ] 改一行 Python 存檔後，`GET /projects` 變成空陣列（理解 `--reload` 清空記憶體）
- [ ] 能說出 401 / 404 / 422 分別在哪裡被丟出
- [ ] Commit 完成

## 常見問題

**Q：想在 Swagger UI 直接帶 Token？**
在 `auth.py` 改用 `fastapi.security.HTTPBearer`：

```python
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

bearer = HTTPBearer(auto_error=False)

def require_token(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)] = None,
) -> None:
    expected = get_expected_token()
    provided = credentials.credentials if credentials else ""
    if not secrets.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="Invalid or missing bearer token")
```

Swagger UI 右上角會出現 Authorize 按鈕。測試不用改。

**Q：`tests/test_projects_api.py` 從 `tests.test_git_scanner` import `make_repo`，這樣好嗎？**
Week 2 夠用。測試多了之後把 `make_repo` 搬到 `conftest.py` 當 fixture 更乾淨。

**Q：`is_relative_to` 是什麼？**
Python 3.9+ 的 `Path` 方法，判斷一個路徑是否在另一個路徑底下，比字串 `startswith` 嚴謹（`/foo` 不會誤判 `/foobar`）。

## 學習筆記

（寫下今天的心得、卡關點、想問的問題）
