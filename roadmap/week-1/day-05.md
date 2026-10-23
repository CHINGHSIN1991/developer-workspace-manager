# Day 5 · 建立專案規範與 Repository

## 今日目標

把前四天的成果整理成**容易維護、可重現、可推送到 GitHub** 的專案。今天不加功能。

## 你會學到

- Monorepo 式的根目錄 `.gitignore` 設計
- 為什麼 lockfile 要進版控
- `pnpm typecheck` / `pnpm build` 與裸 `electron-vite build` 的差別
- 寫一份讓別人（或三個月後的你）能一次啟動的 README

---

## Step 1. 確認目錄結構

在根目錄執行：

```bash
cd /Users/chinghsinc/Develop/python-electron
find . -type d \( -name node_modules -o -name .venv -o -name .git -o -name out -o -name __pycache__ \) -prune -o -type f -print | sort
```

應該能對照 [02-tech-stack.md](../02-tech-stack.md) 的目錄結構。模板額外產生的設定、資源與型別檔案保留即可。

## Step 2. 建立根目錄 `.gitignore`

```bash
cat > .gitignore <<'GITIGNORE'
# Node
node_modules/
dist/
out/
dist-electron/
.eslintcache

# Python
.venv/
__pycache__/
*.py[cod]
.pytest_cache/
.ruff_cache/

# Electron
release/

# Logs
*.log*

# OS
.DS_Store
Thumbs.db

# Editor（模板的 desktop/.vscode/ 含 launch.json 除錯設定，刻意納入版控）
.idea/

# Environment
.env
.env.*
!.env.example

# Local data
*.sqlite3
*.db
GITIGNORE
```

**保留** `pnpm-lock.yaml` 和 `uv.lock`。這兩份檔案是依賴版本可重現的基礎，另一台電腦 `pnpm install` / `uv sync` 會裝到一模一樣的版本。

> `pnpm create` 已在 `desktop/` 內生成一份 `.gitignore`（內容：`node_modules`、`dist`、`out`、`.DS_Store`、`.eslintcache`、`*.log*`）。保留即可，與根目錄規則重疊無害。
>
> 模板也生成了 `desktop/.vscode/`（`extensions.json`、`launch.json`、`settings.json`）。`launch.json` 是 VS Code 除錯 Electron Main 的設定，值得進版控，所以根目錄 `.gitignore` 沒有排除 `.vscode/`。

## Step 3. 執行完整的型別檢查與建置

在 `desktop/`：

```bash
cd desktop
pnpm typecheck     # tsc 對 main/preload（node）與 renderer（web）各跑一次
pnpm build         # typecheck + electron-vite build，產出 out/
cd ..
```

| 指令 | 檢查什麼 |
| --- | --- |
| `pnpm typecheck` | 完整的 TypeScript 型別檢查，包含 `devspace.d.ts` 是否被 renderer 看到 |
| `pnpm build` | 上面 + 真的用 Vite/esbuild 打包三個目標，確認 import 路徑、`?asset` 等在建置期都正確 |
| 裸 `pnpm exec electron-vite build` | **只有**建置，esbuild 不做型別檢查，型別錯誤會被放過 |

所以第一週起就養成用 `pnpm build` 的習慣。

在 `backend/`：

```bash
cd backend
uv run pytest
cd ..
```

## Step 4. 寫根目錄 README

建立 `README.md`（根目錄）：

````bash
cat > README.md <<'README'
# DevSpace

Local-first Developer Workspace Manager.
Electron + React + TypeScript (desktop/) · Python FastAPI (backend/)

## Requirements

- Node.js >= 22.12 (tested with 24.x)
- pnpm 10
- uv (manages Python 3.12 automatically)

## Development

Two terminals:

```bash
# Terminal A — backend
cd backend
uv sync
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8765

# Terminal B — desktop
cd desktop
pnpm install
pnpm dev
```

Backend API docs: http://127.0.0.1:8765/docs

## Checks

```bash
cd backend && uv run pytest
cd desktop && pnpm typecheck && pnpm lint
```

## Roadmap

See [roadmap/](roadmap/).
README
````

這份 README 就是 Definition of Done 裡的「可重現的開發啟動步驟」。

## Step 5. 初始化 Git 與第一個 Commit

```bash
cd /Users/chinghsinc/Develop/python-electron
git init -b main
git add .
git status          # 確認 node_modules、.venv、out 都沒被加進來
git commit -m "feat: initialize Electron React and FastAPI workspace"
```

`git status` 若看到 `node_modules/` 或 `.venv/`，表示 `.gitignore` 沒生效，先修好再 commit。

## Step 6. 推送到 GitHub

若有安裝 GitHub CLI：

```bash
gh repo create devspace --private --source=. --remote=origin --push
```

沒有的話：到 GitHub 建立空的 private repo `devspace`，然後

```bash
git remote add origin git@github.com:<你的帳號>/devspace.git
git push -u origin main
```

## Step 7.（選做）Commit 慣例

之後的 commit 建議用 Conventional Commits 前綴，方便回顧：

| 前綴 | 用途 |
| --- | --- |
| `feat:` | 新功能 |
| `fix:` | 修 bug |
| `docs:` | 文件（含 roadmap） |
| `chore:` | 設定、依賴、工具 |
| `refactor:` | 不改行為的重構 |
| `test:` | 測試 |

---

## 驗收

- [ ] 根目錄有 `.gitignore`，`git status` 看不到 `node_modules`、`.venv`、`out`
- [ ] `pnpm-lock.yaml` 與 `uv.lock` 有進版控
- [ ] `pnpm build` 成功，`desktop/out/` 有 `main/`、`preload/`、`renderer/`
- [ ] `uv run pytest` 通過
- [ ] 根目錄 `README.md` 寫明兩個 Terminal 的啟動步驟
- [ ] 第一個 commit 完成並推送到 GitHub

到這裡，你已經做出一個具備 **Frontend、Desktop Runtime、Backend、IPC、HTTP、API Test** 的小型 Full-stack 應用。

## 常見問題

**Q：`pnpm build` 在 typecheck 階段報 `devspace.d.ts` 相關錯誤？**
確認 `tsconfig.web.json` 的 `include` 含 `src/renderer/src/**/*`（模板預設有）。若你把 `devspace.d.ts` 放到別的位置，要加進 include。

**Q：`pnpm build` 最後抱怨 electron-builder 或簽章？**
`pnpm build` 只跑到 `electron-vite build`，不會跑 electron-builder。若你跑的是 `build:mac`，那是 Week 4 的事，現在不用。

## 學習筆記

（寫下今天的心得、卡關點、想問的問題）
