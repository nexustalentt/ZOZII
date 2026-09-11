import { app, BrowserWindow, Menu, globalShortcut } from 'electron'
import { createMainWindow, getMainWindow } from './window'

app.name = 'DTDC Service'

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    createMainWindow()

    globalShortcut.register('Ctrl+Z', () => {
      const win = getMainWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send('zozii:toggle-listening')
      }
    })

    globalShortcut.register('Ctrl+Shift+H', () => {
      const win = getMainWindow()
      if (win && !win.isDestroyed()) {
        if (win.isMinimized()) {
          win.restore()
          win.focus()
        } else {
          win.minimize()
        }
      }
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}
