import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// 模板原本就有的（保留，之後可能用到 process.versions 等資訊）
const api = {}

// DevSpace 專用 API：只暴露具名、特定用途的功能
const devspaceApi = {
  checkBackend: () => {
    return ipcRenderer.invoke('backend:health')
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('devspace', devspaceApi)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.devspace = devspaceApi
}
