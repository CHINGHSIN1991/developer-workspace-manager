# 推薦學習資源

依第一週用到的順序排列。每個連結旁註明「什麼時候讀」。

## Electron

| 資源 | 何時讀 |
| --- | --- |
| [Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model) | Day 1 之後，理解 Main / Renderer / Preload |
| [Inter-Process Communication](https://www.electronjs.org/docs/latest/tutorial/ipc) | Day 3，特別是 Pattern 2「Renderer to main (two-way)」 |
| [Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation) | Day 3 |
| [Security Checklist](https://www.electronjs.org/docs/latest/tutorial/security) | Day 6，對照我們做了哪幾項 |
| [Process Sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox) | Day 3 遇到 `sandbox: true` 疑問時 |

## electron-vite

| 資源 | 何時讀 |
| --- | --- |
| [Getting Started](https://electron-vite.org/guide/) | Day 1 |
| [Development](https://electron-vite.org/guide/dev) | Day 1，理解 HMR 與 Main 重啟的差異 |
| [Asset Handling](https://electron-vite.org/guide/assets) | Day 3 看到 `?asset` 時 |
| [Building](https://electron-vite.org/guide/build) | Day 5 |

## FastAPI

| 資源 | 何時讀 |
| --- | --- |
| [First Steps](https://fastapi.tiangolo.com/tutorial/first-steps/) | Day 2 |
| [Response Model](https://fastapi.tiangolo.com/tutorial/response-model/) | Day 2 / Day 6 問題 4 |
| [Testing](https://fastapi.tiangolo.com/tutorial/testing/) | Day 2 |
| [Bigger Applications (APIRouter)](https://fastapi.tiangolo.com/tutorial/bigger-applications/) | Week 2 |
| [Dependencies](https://fastapi.tiangolo.com/tutorial/dependencies/) | Week 2（Token 驗證） |

## Pydantic

| 資源 | 何時讀 |
| --- | --- |
| [Models](https://docs.pydantic.dev/latest/concepts/models/) | Day 2 |
| [Fields & Literal](https://docs.pydantic.dev/latest/concepts/fields/) | Day 2 看到 `Literal["ok"]` 時 |

## uv

| 資源 | 何時讀 |
| --- | --- |
| [Working on projects](https://docs.astral.sh/uv/guides/projects/) | Day 2 |
| [Python versions](https://docs.astral.sh/uv/concepts/python-versions/) | Day 2，理解系統 3.14 與專案 3.12 共存 |

## React / TypeScript

| 資源 | 何時讀 |
| --- | --- |
| [Synchronizing with Effects](https://react.dev/learn/synchronizing-with-effects) | Day 4 |
| [useCallback](https://react.dev/reference/react/useCallback) | Day 4 |
| [TypeScript: Declaration Merging (global)](https://www.typescriptlang.org/docs/handbook/declaration-merging.html) | Day 3 的 `declare global` |
| [TypeScript: Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html) | Day 4 的 `err instanceof Error` |

## pnpm

| 資源 | 何時讀 |
| --- | --- |
| [Settings: onlyBuiltDependencies](https://pnpm.io/settings#onlybuiltdependencies) | Day 1 若遇到 build script 被擋 |

---

這個專案的第一個里程碑不是完成漂亮的 Dashboard，而是**讓三個獨立的執行環境可靠、安全地交換資料**。完成第一週後，你會有一個真正可執行、可測試、能繼續擴充的 Full-stack Desktop App 基礎。
