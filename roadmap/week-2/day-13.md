# Day 13 · 從 OpenAPI 產生 TypeScript 型別、收緊 Preload

## 今日目標

消除「同一個資料結構在 Python、Main、Renderer 寫三次」的技術債：由 FastAPI 匯出 OpenAPI schema，用 openapi-typescript 產生 TypeScript 型別，`src/shared/types.ts` 改成別名。接著移除模板暴露的 `window.electron` 與 `window.api`，讓 Renderer 只剩 `window.devspace`。

## 你會學到

- OpenAPI 不只是文件，它是可以產生程式碼的契約
- 單一真相來源：Pydantic model 改了，TypeScript 編譯就會告訴你哪裡壞
- 為什麼要把產生的檔案排除在 lint / format 之外，但**要**進版控
- 收斂 Preload 暴露面：最小權限原則的實作

---

## Step 1. Backend 匯出 OpenAPI

新增 `backend/scripts/__init__.py`（空檔案）與 `backend/scripts/export_openapi.py`：

```python
"""將 FastAPI 的 OpenAPI schema 匯出成 backend/openapi.json，供 desktop 產生 TypeScript 型別。

用法（在 backend/ 目錄）：uv run python -m scripts.export_openapi
"""

import json
from pathlib import Path

from app.main import app


def main() -> None:
    output = Path(__file__).resolve().parent.parent / "openapi.json"
    output.write_text(json.dumps(app.openapi(), indent=2) + "\n", encoding="utf-8")
    print(f"wrote {output}")


if __name__ == "__main__":
    main()
```

執行（在 `backend/`）：

```bash
cd /Users/chinghsinc/Develop/developer-workspace-manager/backend
uv run python -m scripts.export_openapi
```

> 用 `-m scripts.export_openapi` 而不是 `python scripts/export_openapi.py`：前者把目前目錄（`backend/`）放進 `sys.path`，`from app.main import app` 才找得到。這和 Day 2 `tests/__init__.py` 是同一個原理。
>
> 這個腳本不需要 `DEVSPACE_TOKEN`，因為 `app.openapi()` 只讀 schema，不會觸發 lifespan。

產出的 `backend/openapi.json` 約 10 KB，**要進版控**，它是前後端契約的快照，code review 時 diff 一目了然。

## Step 2. Desktop 產生型別

```bash
cd /Users/chinghsinc/Develop/developer-workspace-manager/desktop
pnpm add -D openapi-typescript@7.13.0
```

在 `desktop/package.json` 的 `scripts` 加入：

```json
"gen:api": "openapi-typescript ../backend/openapi.json -o src/shared/api.generated.ts"
```

執行：

```bash
pnpm gen:api
```

打開 `src/shared/api.generated.ts`，找到 `components.schemas.Project`，長這樣：

```ts
Project: {
    /** Id */
    id: string;
    /** Name */
    name: string;
    /** Path */
    path: string;
    /** Branch */
    branch: string | null;
    /** Is Dirty */
    is_dirty: boolean;
    /** Technologies */
    technologies: string[];
};
```

注意 `branch: string | null` 和 `status: "ok"`（Pydantic 的 `Literal["ok"]`）都被正確翻譯了。

## Step 3. `types.ts` 改成別名

**覆寫** `desktop/src/shared/types.ts`：

```ts
import type { components } from './api.generated'

export type HealthResponse = components['schemas']['HealthResponse']
export type Project = components['schemas']['Project']
export type ScanResponse = components['schemas']['ScanResponse']
```

`pnpm typecheck` 應該仍然通過，因為產生的型別與手寫的結構一致。整個 Renderer 與 Main 沒有任何其他檔案需要改，這就是把 import 路徑集中在 `shared/types.ts` 的好處。

## Step 4. 排除產生檔的 lint 與 format

產生的檔案排版不符合 Prettier 規則，會產生三百多個警告。修改 `desktop/eslint.config.mjs` 的第一個物件：

```js
{ ignores: ['**/node_modules', '**/dist', '**/out', 'src/shared/api.generated.ts'] },
```

在 `desktop/.prettierignore` 加一行：

```
src/shared/api.generated.ts
```

```bash
pnpm lint    # 應該 0 錯誤 0 警告
```

## Step 5. 試一次「契約變更」

這是今天最有價值的 10 分鐘。在 `backend/app/models.py` 的 `Project` 加一個欄位：

```python
    last_commit: str | None = None
```

然後：

```bash
cd ../backend && uv run python -m scripts.export_openapi
cd ../desktop && pnpm gen:api && pnpm typecheck
```

typecheck 仍通過（多一個欄位不會壞）。現在反過來，把 `Project.branch` 改名成 `current_branch`，重跑同樣三個指令：

```
src/renderer/src/components/ProjectCard.tsx: Property 'branch' does not exist on type ...
```

TypeScript 在**編譯期**告訴你 Renderer 哪裡壞了。這就是契約自動化的價值。試完把 `models.py` 改回來，重新匯出與產生。

## Step 6. 收緊 Preload

**覆寫** `desktop/src/preload/index.ts`：

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { DevSpaceAPI } from '../shared/devspace-api'

// 型別註記讓 TypeScript 檢查：這裡實作的方法必須與 shared/devspace-api.ts 的契約一致
const devspaceApi: DevSpaceAPI = {
  checkBackend: () => ipcRenderer.invoke('backend:health'),
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),
  scanProjects: (root) => ipcRenderer.invoke('projects:scan', root),
  listProjects: () => ipcRenderer.invoke('projects:list'),
  refreshProject: (id) => ipcRenderer.invoke('projects:refresh', id)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('devspace', devspaceApi)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.devspace = devspaceApi
}
```

**覆寫** `desktop/src/preload/index.d.ts`：

```ts
import type { DevSpaceAPI } from '../shared/devspace-api'

declare global {
  interface Window {
    devspace: DevSpaceAPI
  }
}
```

刪除模板殘留：

```bash
rm -f src/renderer/src/components/Versions.tsx
```

（`Versions.tsx` 用到 `window.electron.process.versions`，Day 4 覆寫 App.tsx 後就沒人 import 它了。）

`@electron-toolkit/preload` 現在沒有任何地方使用，可以 `pnpm remove @electron-toolkit/preload`。

驗證：

```bash
pnpm typecheck && pnpm lint && pnpm dev
```

DevTools Console：

```js
window.electron    // undefined ← Day 10 那條「任意 channel」的路關掉了
window.api         // undefined
window.devspace    // {checkBackend, selectDirectory, scanProjects, listProjects, refreshProject}
```

## Step 7. 在根目錄 README 記錄流程

在 `README.md` 加一節：

````markdown
## Regenerate API types

When a Pydantic model or endpoint changes:

```bash
cd backend && uv run python -m scripts.export_openapi
cd ../desktop && pnpm gen:api && pnpm typecheck
```
````

Commit：

```bash
cd /Users/chinghsinc/Develop/developer-workspace-manager
git add . && git commit -m "feat: generate TypeScript types from OpenAPI, restrict preload to devspace API"
```

---

## 驗收

- [ ] `backend/openapi.json` 已產生並進版控
- [ ] `pnpm gen:api` 可重複執行，`pnpm lint` 0 警告
- [ ] 做過一次「改名欄位 → typecheck 失敗」的實驗並還原
- [ ] `window.electron` 與 `window.api` 在 DevTools 是 `undefined`
- [ ] Commit 完成

## 常見問題

**Q：為什麼不直接讓 openapi-typescript 連 `http://127.0.0.1:8765/openapi.json`？**
可以，但那要求 Backend 正在跑，CI 或新同事 clone 下來就不能直接產生。檔案快照讓流程可重現，也讓 schema 變更出現在 git diff。

**Q：產生的檔案要 commit 嗎？**
要。理由同上：clone 下來 `pnpm typecheck` 就能過，不需要先裝 Python。缺點是 diff 較大，用 `.gitattributes` 標 `linguist-generated=true` 可以讓 GitHub 預設摺疊。

**Q：`HealthResponse` 也走產生的型別了，Day 3 的 runtime 檢查還需要嗎？**
需要。型別是編譯期的承諾，runtime 檢查防的是「Backend 版本不對」或「連到別的服務」。兩者互補。

## 學習筆記

（寫下今天的心得、卡關點、想問的問題）
