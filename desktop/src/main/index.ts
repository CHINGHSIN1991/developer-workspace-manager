import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

const BACKEND_URL = 'http://127.0.0.1:8765'

interface HealthResponse {
  status: 'ok'
  service: string
  version: string
  timestamp: string
}

async function checkBackend(): Promise<HealthResponse> {
  const response = await fetch(`${BACKEND_URL}/health`, {
    signal: AbortSignal.timeout(3000)
  })

  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`)
  }

  const result: unknown = await response.json()

  if (
    typeof result !== 'object' ||
    result === null ||
    !('status' in result) ||
    result.status !== 'ok'
  ) {
    throw new Error('Invalid backend response')
  }

  return result as HealthResponse
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 550,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // 第一週不允許任何新視窗（外部連結）開啟
  mainWindow.webContents.setWindowOpenHandler(() => ({
    action: 'deny'
  }))

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.example.devspace')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC Handler：Renderer 透過 preload 呼叫 'backend:health'，Main 代為向 Python 發 HTTP
  ipcMain.handle('backend:health', async () => {
    return checkBackend()
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})