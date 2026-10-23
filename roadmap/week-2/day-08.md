# Day 8 · Python Git 掃描 Service 與測試

## 今日目標

寫出一個**不依賴 FastAPI、可以單獨測試**的 Python 模組：給它一個資料夾，它回傳底下所有 Git repository 的名稱、路徑、branch、是否有未提交變更、使用的技術。今天不碰 API，也不碰 Electron。

## 你會學到

- Service Layer：把「業務邏輯」和「HTTP 介面」分開，先寫邏輯再接 API
- `os.walk` 的目錄剪枝（pruning），避免掃進 `node_modules`
- `subprocess.run` 呼叫 `git` 的正確姿勢（list 形式、`cwd`、`timeout`、不 `shell=True`）
- 用 pytest 的 `tmp_path` 建立真實的臨時 Git repo 來測試
- 用路徑的 hash 當穩定 ID，讓重複掃描不會產生重複資料

## 前置：先用 git 試三個情境

這三個行為決定了程式怎麼寫。在任意臨時資料夾試：

```bash
mkdir /tmp/gt && cd /tmp/gt && git init -q empty && cd empty

git rev-parse --abbrev-ref HEAD      # 空 repo：fatal，exit 128
git symbolic-ref --short -q HEAD     # 空 repo：印出 main，exit 0 ← 我們用這個
git status --porcelain               # 乾淨時沒有輸出

echo hi > a.txt
git status --porcelain               # ?? a.txt  ← 有輸出就代表 dirty

git add . && git -c user.name=t -c user.email=t@t commit -qm init
git checkout -q --detach
git symbolic-ref --short -q HEAD     # detached：沒輸出，exit 1 ← 我們回傳 None
```

| 結論 | 對程式的影響 |
| --- | --- |
| `rev-parse` 在空 repo 會失敗 | 改用 `symbolic-ref --short -q HEAD` |
| detached HEAD 時 `symbolic-ref` 回 exit 1 | `branch` 設計成 `str \| None` |
| `status --porcelain` 有任何輸出就是 dirty | 包含 untracked 檔案，這正是我們要的 |
| git worktree / submodule 的 `.git` 是**檔案**不是目錄 | 判斷用 `.exists()` 而不是 `.is_dir()` |

---

## Step 1. 建立資料模型

新增 `backend/app/models.py`：

```python
from pydantic import BaseModel, Field


class Project(BaseModel):
    id: str
    name: str
    path: str
    branch: str | None
    is_dirty: bool
    technologies: list[str]


class ScanRequest(BaseModel):
    root: str = Field(min_length=1, max_length=4096)
    max_depth: int = Field(default=4, ge=1, le=8)


class ScanResponse(BaseModel):
    root: str
    projects: list[Project]
    scanned_at: str
```

`ScanRequest` 和 `ScanResponse` 今天還用不到，明天的 router 會用。先放在一起是因為它們是同一組「契約」。`Field(ge=1, le=8)` 讓 FastAPI 在進 router 之前就擋掉 `max_depth=999` 這種請求。

## Step 2. 撰寫掃描 Service

新增 `backend/app/services/__init__.py`（空檔案）與 `backend/app/services/git_scanner.py`：

```python
import hashlib
import json
import os
import subprocess
from pathlib import Path

from app.models import Project

IGNORED_DIRS = {
    "node_modules",
    ".venv",
    "venv",
    ".git",
    "dist",
    "out",
    "build",
    "target",
    "__pycache__",
    ".cache",
    "Library",
}

TECH_MARKERS: list[tuple[str, str]] = [
    ("package.json", "Node.js"),
    ("tsconfig.json", "TypeScript"),
    ("pyproject.toml", "Python"),
    ("requirements.txt", "Python"),
    ("Cargo.toml", "Rust"),
    ("go.mod", "Go"),
    ("Gemfile", "Ruby"),
    ("pom.xml", "Java"),
    ("Dockerfile", "Docker"),
]

PACKAGE_JSON_DEPS: list[tuple[str, str]] = [
    ("react", "React"),
    ("vue", "Vue"),
    ("svelte", "Svelte"),
    ("astro", "Astro"),
    ("next", "Next.js"),
    ("electron", "Electron"),
]


def _run_git(args: list[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )


def project_id_for(path: Path) -> str:
    digest = hashlib.sha1(str(path.resolve()).encode("utf-8")).hexdigest()
    return digest[:12]


def find_git_repos(root: Path, max_depth: int = 4) -> list[Path]:
    root = root.resolve()
    if not root.is_dir():
        raise NotADirectoryError(str(root))

    found: list[Path] = []
    root_depth = len(root.parts)

    for current, dirs, _files in os.walk(root):
        current_path = Path(current)

        if (current_path / ".git").exists():
            found.append(current_path)
            dirs[:] = []  # 找到 repo 就不再往下走（不掃 nested repo）
            continue

        depth = len(current_path.parts) - root_depth
        if depth >= max_depth:
            dirs[:] = []
            continue

        # 原地修改 dirs，os.walk 才會真的跳過這些目錄
        dirs[:] = sorted(
            d for d in dirs if d not in IGNORED_DIRS and not d.startswith(".")
        )

    return found


def get_branch(repo: Path) -> str | None:
    result = _run_git(["symbolic-ref", "--short", "-q", "HEAD"], cwd=repo)
    if result.returncode != 0:
        return None  # detached HEAD
    return result.stdout.strip() or None


def is_dirty(repo: Path) -> bool:
    result = _run_git(["status", "--porcelain"], cwd=repo)
    if result.returncode != 0:
        return False
    return bool(result.stdout.strip())


def detect_technologies(repo: Path) -> list[str]:
    techs: list[str] = []

    for filename, label in TECH_MARKERS:
        if (repo / filename).exists() and label not in techs:
            techs.append(label)

    package_json = repo / "package.json"
    if package_json.exists():
        try:
            data = json.loads(package_json.read_text(encoding="utf-8"))
            deps = {**data.get("dependencies", {}), **data.get("devDependencies", {})}
            for dep, label in PACKAGE_JSON_DEPS:
                if dep in deps and label not in techs:
                    techs.append(label)
        except (OSError, ValueError):
            pass  # 壞掉的 package.json 不應讓整個掃描失敗

    return techs


def inspect_repo(repo: Path) -> Project:
    repo = repo.resolve()
    return Project(
        id=project_id_for(repo),
        name=repo.name,
        path=str(repo),
        branch=get_branch(repo),
        is_dirty=is_dirty(repo),
        technologies=detect_technologies(repo),
    )


def scan(root: Path, max_depth: int = 4) -> list[Project]:
    return [inspect_repo(repo) for repo in find_git_repos(root, max_depth=max_depth)]
```

### 程式碼解讀

| 片段 | 為什麼 |
| --- | --- |
| `["git", *args]` list 形式、沒有 `shell=True` | 路徑含空格或特殊字元也不會被 shell 解讀；這是 subprocess 安全的第一條 |
| `timeout=10` | 掛掉的 git（例如網路磁碟）不會讓整個 API 卡死 |
| `check=False` + 自己看 `returncode` | 我們預期某些指令會失敗（detached HEAD），不要讓它丟例外 |
| `dirs[:] = [...]` 而不是 `dirs = [...]` | `os.walk` 看的是同一個 list 物件；重新賦值不會影響它的遍歷 |
| 找到 `.git` 就 `dirs[:] = []` | 不掃 repo 裡面的 repo（submodule、vendored 程式碼），也大幅加速 |
| `sha1(resolved path)[:12]` 當 ID | 同一個路徑永遠得到同一個 ID，重複掃描不會重複建資料；12 碼對本機規模已足夠 |
| `TECH_MARKERS` 先看檔案，再看 `package.json` 內容 | 兩階段：便宜的檔案存在檢查 → 需要讀檔解析的框架偵測 |

## Step 3. 撰寫測試

新增 `backend/tests/test_git_scanner.py`：

```python
import subprocess
from pathlib import Path

import pytest

from app.services import git_scanner


def make_repo(path: Path, *, commit: bool = True) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    subprocess.run(["git", "init", "-q", "-b", "main", str(path)], check=True)
    if commit:
        (path / "README.md").write_text("# test\n")
        subprocess.run(["git", "add", "."], cwd=path, check=True)
        subprocess.run(
            [
                "git",
                "-c", "user.name=Test",
                "-c", "user.email=test@example.com",
                "commit", "-qm", "init",
            ],
            cwd=path,
            check=True,
        )
    return path


def test_find_git_repos_skips_ignored_dirs(tmp_path: Path):
    make_repo(tmp_path / "projects" / "alpha")
    make_repo(tmp_path / "projects" / "node_modules" / "should-skip")
    make_repo(tmp_path / "projects" / "alpha" / "nested-should-skip")

    found = git_scanner.find_git_repos(tmp_path)

    assert [p.name for p in found] == ["alpha"]


def test_find_git_repos_respects_max_depth(tmp_path: Path):
    make_repo(tmp_path / "a" / "b" / "c" / "deep")

    assert git_scanner.find_git_repos(tmp_path, max_depth=2) == []
    assert [p.name for p in git_scanner.find_git_repos(tmp_path, max_depth=4)] == ["deep"]


def test_find_git_repos_rejects_missing_root(tmp_path: Path):
    with pytest.raises(NotADirectoryError):
        git_scanner.find_git_repos(tmp_path / "nope")


def test_branch_on_empty_repo(tmp_path: Path):
    repo = make_repo(tmp_path / "empty", commit=False)

    assert git_scanner.get_branch(repo) == "main"
    assert git_scanner.is_dirty(repo) is False


def test_branch_is_none_when_detached(tmp_path: Path):
    repo = make_repo(tmp_path / "detached")
    subprocess.run(["git", "checkout", "-q", "--detach"], cwd=repo, check=True)

    assert git_scanner.get_branch(repo) is None


def test_is_dirty_detects_untracked_and_modified(tmp_path: Path):
    repo = make_repo(tmp_path / "dirty")
    assert git_scanner.is_dirty(repo) is False

    (repo / "new.txt").write_text("x")
    assert git_scanner.is_dirty(repo) is True


def test_detect_technologies(tmp_path: Path):
    repo = make_repo(tmp_path / "web")
    (repo / "package.json").write_text(
        '{"dependencies": {"react": "^19"}, "devDependencies": {"electron": "^44"}}'
    )
    (repo / "tsconfig.json").write_text("{}")
    (repo / "pyproject.toml").write_text("")

    assert git_scanner.detect_technologies(repo) == [
        "Node.js", "TypeScript", "Python", "React", "Electron",
    ]


def test_inspect_repo_builds_project(tmp_path: Path):
    repo = make_repo(tmp_path / "alpha")

    project = git_scanner.inspect_repo(repo)

    assert project.name == "alpha"
    assert project.path == str(repo.resolve())
    assert project.branch == "main"
    assert project.is_dirty is False
    assert len(project.id) == 12
    assert project.id == git_scanner.project_id_for(repo)
```

### 測試的設計重點

- **`git init -b main`**：不依賴使用者的 `init.defaultBranch` 設定，測試在任何機器都一致。
- **`-c user.name=... -c user.email=...` 內嵌在 commit 指令**：不依賴、也不汙染全域 git config。
- **真的建 repo 而不是 mock `subprocess`**：這一層的價值就在於「跟真實 git 的互動」，mock 掉就等於沒測。
- `tmp_path` 是 pytest 內建 fixture，每個測試拿到獨立的臨時資料夾，結束自動清掉。

執行：

```bash
cd /Users/chinghsinc/Develop/developer-workspace-manager/backend
uv run pytest -q
```

預期：

```
.........                                                [100%]
9 passed
```

（Day 2 的 1 個 + 今天的 8 個）

## Step 4. 用真實資料夾試跑

```bash
uv run python -c "
from pathlib import Path
from app.services import git_scanner
for p in git_scanner.scan(Path('~/Develop').expanduser(), max_depth=3):
    print(f'{p.name:30} {p.branch or \"(detached)\":15} {\"*\" if p.is_dirty else \" \"}  {\", \".join(p.technologies)}')
"
```

把 `~/Develop` 換成你放專案的資料夾。觀察：速度如何？有沒有漏掉的 repo？有沒有不該出現的技術標籤？把發現記到學習筆記。

---

## 驗收

- [ ] `uv run pytest -q` 顯示 `9 passed`
- [ ] 對真實資料夾試跑，結果合理
- [ ] 能解釋為什麼 `dirs[:] = [...]` 不能寫成 `dirs = [...]`
- [ ] 能解釋為什麼 ID 用路徑 hash 而不是流水號

## 常見問題

**Q：測試說 `git: 'init' is not a git command` 或找不到 git？**
Terminal 的 `PATH` 問題。`which git` 確認。

**Q：掃描很慢？**
通常是 `max_depth` 太大，或某個目錄沒進 `IGNORED_DIRS`（例如 `.Trash`、`Pictures`）。先用小一點的根目錄。Day 12 的 UI 會加 loading 狀態，Week 4 之後可以考慮改成背景任務。

**Q：為什麼不用 GitPython 之類的套件？**
可以，但 Week 2 的學習目標之一就是 `subprocess`。直接呼叫 git 沒有額外依賴，也更容易理解輸出。

## 學習筆記

（寫下今天的心得、卡關點、想問的問題）
