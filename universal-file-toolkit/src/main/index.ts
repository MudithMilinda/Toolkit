import { app, BrowserWindow, globalShortcut, ipcMain, Menu, screen, Tray } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

let radialWindow: BrowserWindow | null = null
let tray: Tray | null = null
const MENU_SIZE = 390
const shortcuts =
  process.platform === 'darwin'
    ? ['CommandOrControl+Shift+Space', 'Control+Shift+Space', 'CommandOrControl+Alt+Space']
    : ['CommandOrControl+Shift+Space', 'CommandOrControl+Alt+Space']

function showRadialMenu(): void {
  if (!radialWindow) return
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const { x, y, width, height } = display.workArea
  const padding = 12
  radialWindow.setPosition(
    Math.round(
      Math.min(Math.max(cursor.x - MENU_SIZE / 2, x + padding), x + width - MENU_SIZE - padding)
    ),
    Math.round(
      Math.min(Math.max(cursor.y - MENU_SIZE / 2, y + padding), y + height - MENU_SIZE - padding)
    )
  )
  radialWindow.show()
  radialWindow.focus()
  radialWindow.webContents.send('radial-menu:opened')
}

function createWindow(): void {
  radialWindow = new BrowserWindow({
    width: MENU_SIZE,
    height: MENU_SIZE,
    show: false,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    hasShadow: false,
    ...(process.platform === 'linux' ? { icon } : { icon }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  radialWindow.setAlwaysOnTop(true, 'floating')
  radialWindow.on('blur', () => radialWindow?.hide())
  radialWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    radialWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    radialWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createTray(): void {
  tray = new Tray(icon)
  tray.setToolTip('Universal File Toolkit')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open radial menu',
        accelerator: 'CommandOrControl+Shift+Space',
        click: showRadialMenu
      },
      {
        label: 'Open radial menu (fallback)',
        accelerator: 'CommandOrControl+Alt+Space',
        click: showRadialMenu
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  )
  tray.on('click', showRadialMenu)
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')
  if (process.platform === 'darwin') app.dock?.hide()

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
  createTray()
  for (const shortcut of shortcuts) {
    if (!globalShortcut.register(shortcut, showRadialMenu)) {
      console.error(`Unable to register ${shortcut}; it may be used by another application.`)
    }
  }
  ipcMain.handle('radial-menu:close', () => radialWindow?.hide())

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    showRadialMenu()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  // The tray utility remains active without an open radial window.
})

app.on('will-quit', () => globalShortcut.unregisterAll())

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
