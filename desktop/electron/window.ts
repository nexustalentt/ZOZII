import { app, BrowserWindow, desktopCapturer, ipcMain, screen, session, shell } from 'electron'
import path from 'node:path'
import { registerGroqIpc } from './groq'
import { registerGeminiIpc } from './gemini'
import { registerAiProviderIpc } from './aiProvider'
import { registerAuthIpc } from './authIpc'
import { registerSpeechIpc } from './speech'
import { getScreenStealthManager } from './screenStealth'

const DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'] ?? 'http://127.0.0.1:5174'

// Floating assistant geometry: ~60% of the desktop width, compact height.
const WIDTH_RATIO = 0.6
const MIN_WIDTH = 520
const MAX_WIDTH = 1180
const COMPACT_HEIGHT = 350
const MIN_HEIGHT = 52
const MAX_HEIGHT_RATIO = 0.62

let mainWindow: BrowserWindow | null = null
let loopbackHandlerRegistered = false

// Auto-approve system-audio (loopback) capture for the renderer. On Windows
// `audio: 'loopback'` captures whatever is playing through the current output
// device (speakers or headphones) — Teams/Zoom/Meet audio included — without
// showing a source picker. The video payload is discarded by the renderer.
function registerLoopbackHandler(): void {
  if (loopbackHandlerRegistered) return
  loopbackHandlerRegistered = true
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer
      .getSources({ types: ['screen'] })
      .then((sources) => {
        // Grant the primary screen for the required video track; `audio:
        // 'loopback'` captures the system output mix (Windows only). The
        // renderer discards the video track and keeps only audio.
        const primary = sources[0]
        if (primary) {
          callback({ video: primary, audio: 'loopback' })
        } else {
          callback({})
        }
      })
      .catch(() => callback({}))
  })
}

let permissionHandlersRegistered = false

function registerPermissionHandlers(): void {
  if (permissionHandlersRegistered) return
  permissionHandlersRegistered = true

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true)
    } else {
      callback(false)
    }
  })

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    if (permission === 'media') {
      return true
    }
    return false
  })
}

function isAllowedNavigationUrl(url: string): boolean {
  return app.isPackaged ? url.startsWith('file://') : url.startsWith(DEV_SERVER_URL)
}

function applyProductionSecurityHeaders(): void {
  // CSP is injected at runtime so the dev server (React refresh) stays unaffected.
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'none'",
  ].join('; ')

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } })
  })
}

function getWorkArea(win: BrowserWindow): Electron.Rectangle {
  return screen.getDisplayMatching(win.getBounds()).workArea
}

function computeInitialBounds(): { width: number; height: number; x: number; y: number } {
  const workArea = screen.getPrimaryDisplay().workArea
  const width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(workArea.width * WIDTH_RATIO)))
  const height = Math.min(COMPACT_HEIGHT, workArea.height)
  // Sit slightly above vertical center so expanding downward stays on screen.
  const x = workArea.x + Math.round((workArea.width - width) / 2)
  const y = workArea.y + Math.round((workArea.height - height) * 0.24)
  return { width, height, x, y }
}

export function createMainWindow(): BrowserWindow {
  const bounds = computeInitialBounds()
  const win = new BrowserWindow({
    ...bounds,
    useContentSize: true,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    maximizable: false,
    backgroundColor: '#00000000',
    title: 'DTDC Service',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })

  mainWindow = win

  registerLoopbackHandler()
  registerPermissionHandlers()

  // Always-on screen-share stealth: the window is excluded from any screen
  // capture (Teams/Zoom/Meet shares, screenshots) while staying visible to
  // the local user. See electron/screenStealth.ts.
  getScreenStealthManager(getMainWindow).apply()

  // NOTE: setBackgroundMaterial('acrylic') is disabled — it breaks painting
  // when the DWM material is unavailable (e.g. RDP sessions).
  // if (process.platform === 'win32' && typeof win.setBackgroundMaterial === 'function') {
  //   try { win.setBackgroundMaterial('acrylic') } catch { /* older Windows */ }
  // }

  // Transparent windows occasionally never emit ready-to-show, so fall back to a timer.
  const showWindow = (): void => {
    if (!win.isDestroyed() && !win.isVisible()) {
      win.show()
      if (!app.isPackaged) console.log('[zozii] main window ready')
    }
  }
  win.once('ready-to-show', showWindow)
  setTimeout(showWindow, 2000)

  win.on('closed', () => {
    mainWindow = null
  })

  // Block any window.open / target=_blank attempts.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  // Prevent in-app navigation away from the app itself.
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigationUrl(url)) event.preventDefault()
  })

  win.webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })

  registerWindowIpc(win)
  registerGroqIpc(() => getMainWindow())
  registerGeminiIpc(() => getMainWindow())
  registerAiProviderIpc()
  registerAuthIpc()
  registerSpeechIpc()

  if (app.isPackaged) {
    applyProductionSecurityHeaders()
    void win.loadFile(path.join(__dirname, '../dist/index.html'))
  } else {
    void win.loadURL(DEV_SERVER_URL)
  }

  return win
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

function resizeAssistantWindow(
  win: BrowserWindow,
  requestedWidth: unknown,
  requestedHeight: unknown,
): { width: number; height: number; x: number; y: number } {
  if (win.isDestroyed()) return win.getBounds()

  const workArea = getWorkArea(win)
  const current = win.getBounds()

  const maxWidth = Math.max(MIN_WIDTH, Math.round(workArea.width * WIDTH_RATIO))
  const maxHeight = Math.max(MIN_HEIGHT, Math.round(workArea.height * MAX_HEIGHT_RATIO))

  const width =
    typeof requestedWidth === 'number' && Number.isFinite(requestedWidth)
      ? Math.round(Math.max(MIN_WIDTH, Math.min(requestedWidth, Math.min(maxWidth, workArea.width))))
      : current.width

  let height =
    typeof requestedHeight === 'number' && Number.isFinite(requestedHeight)
      ? Math.round(Math.max(MIN_HEIGHT, Math.min(requestedHeight, maxHeight)))
      : current.height

  // Expand downward; only shift up when there is no room left below.
  let y = current.y
  const roomBelow = workArea.y + workArea.height - y
  if (height > roomBelow && height <= workArea.height) {
    y = Math.max(workArea.y, workArea.y + workArea.height - height)
  }
  if (y + height > workArea.y + workArea.height) {
    height = workArea.y + workArea.height - y
  }

  win.setBounds({ x: current.x, y, width, height })

  const bounds = win.getBounds()
  return { width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y }
}

export function registerWindowIpc(win: BrowserWindow): void {
  ipcMain.handle('zozii:minimize', () => {
    win.minimize()
  })

  ipcMain.handle('zozii:close', () => {
    win.close()
  })

  ipcMain.handle('zozii:get-version', () => app.getVersion())

  ipcMain.handle('zozii:open-external', (_event, url: unknown) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      // Only http(s) links are ever opened, and only via the user's default
      // browser — never in the app window.
      void shell.openExternal(url)
      return true
    }
    return false
  })

  ipcMain.handle('zozii:set-on-top', (_event, enabled: unknown) => {
    if (typeof enabled === 'boolean') win.setAlwaysOnTop(enabled, 'floating')
    return win.isAlwaysOnTop()
  })

  ipcMain.handle('zozii:get-display-info', () => {
    if (win.isDestroyed()) return { width: 1280, height: 720 }
    const workArea = getWorkArea(win)
    return {
      width: workArea.width,
      height: workArea.height,
      maxWidth: Math.max(MIN_WIDTH, Math.round(workArea.width * WIDTH_RATIO)),
      maxHeight: Math.max(MIN_HEIGHT, Math.round(workArea.height * MAX_HEIGHT_RATIO)),
      compactHeight: Math.min(COMPACT_HEIGHT, workArea.height),
      minHeight: MIN_HEIGHT,
    }
  })

  ipcMain.handle(
    'zozii:set-window-size',
    (_event, width: unknown, height: unknown) => resizeAssistantWindow(win, width, height),
  )
}
