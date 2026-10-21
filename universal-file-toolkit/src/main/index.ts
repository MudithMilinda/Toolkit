import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  Notification,
  screen,
  shell,
  Tray
} from 'electron'
import { execFile } from 'node:child_process'
import { basename, join } from 'path'
import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import sharp from 'sharp'
import { promisify } from 'node:util'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { createNativeIntegration } from './native-integration'
import { ConversionManager } from './services/conversion/ConversionManager'
import type {
  ImageCompressionRequest,
  ImageCropRequest,
  ImageEditRequest,
  ImageConversionRequest,
  ImagesToPdfRequest,
  ImageResizeRequest
} from './services/conversion/types'

let radialWindow: BrowserWindow | null = null
let tray: Tray | null = null
const nativeIntegration = createNativeIntegration()
const conversionManager = new ConversionManager()
const execFileAsync = promisify(execFile)
let nativeDismissTimer: ReturnType<typeof setTimeout> | null = null
let nativeDragCandidateVisible = false
// The crop editor needs room for a comfortably sized preview and its controls.
const MENU_SIZE = 660
const shortcuts =
  process.platform === 'darwin'
    ? ['CommandOrControl+Shift+Space', 'Control+Shift+Space', 'CommandOrControl+Alt+Space']
    : ['CommandOrControl+Shift+Space', 'CommandOrControl+Alt+Space']
function isImageConversionRequest(value: unknown): value is ImageConversionRequest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.inputPath === 'string' &&
    candidate.inputPath.length > 0 &&
    candidate.inputPath.length <= 16_384 &&
    !candidate.inputPath.includes('\0') &&
    ['png', 'jpg', 'webp', 'pdf', 'heic', 'tiff', 'avif', 'bmp'].includes(
      String(candidate.targetFormat)
    ) &&
    (candidate.options === undefined || typeof candidate.options === 'object')
  )
}

async function composeEmailWithAttachment(inputPath: string): Promise<void> {
  const attachmentName = basename(inputPath)
  if (process.platform !== 'darwin') {
    await shell.openExternal(
      `mailto:?subject=${encodeURIComponent(`Sharing ${attachmentName}`)}&body=${encodeURIComponent(`Please find ${attachmentName} attached.`)}`
    )
    return
  }
  const script = `on run argv
set attachmentPath to item 1 of argv
set attachmentName to item 2 of argv
tell application "Mail"
  set newMessage to make new outgoing message with properties {visible:true, subject:("Sharing " & attachmentName), content:("Please find " & attachmentName & " attached.")}
  tell newMessage
    make new attachment with properties {file name:POSIX file attachmentPath} at after the last paragraph
  end tell
  activate
end tell
end run`
  await execFileAsync('osascript', ['-e', script, '--', inputPath, attachmentName])
}

function isImagesToPdfRequest(value: unknown): value is ImagesToPdfRequest {
  if (!value || typeof value !== 'object') return false
  const inputPaths = (value as Record<string, unknown>).inputPaths
  return (
    Array.isArray(inputPaths) &&
    inputPaths.length >= 1 &&
    inputPaths.length <= 100 &&
    inputPaths.every(
      (inputPath) =>
        typeof inputPath === 'string' &&
        inputPath.length > 0 &&
        inputPath.length <= 16_384 &&
        !inputPath.includes('\0')
    )
  )
}

function hasSafeInputPath(value: Record<string, unknown>): value is Record<string, unknown> & {
  inputPath: string
} {
  return (
    typeof value.inputPath === 'string' &&
    value.inputPath.length > 0 &&
    value.inputPath.length <= 16_384 &&
    !value.inputPath.includes('\0')
  )
}

function isImageResizeRequest(value: unknown): value is ImageResizeRequest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  const dimension = (item: unknown): boolean =>
    item === undefined ||
    (typeof item === 'number' && Number.isInteger(item) && item >= 1 && item <= 16_384)
  return (
    hasSafeInputPath(candidate) &&
    candidate.operation === 'resize' &&
    dimension(candidate.width) &&
    dimension(candidate.height) &&
    (candidate.width !== undefined || candidate.height !== undefined) &&
    ['inside', 'cover', 'fill'].includes(String(candidate.fit)) &&
    typeof candidate.withoutEnlargement === 'boolean'
  )
}

function isImageCompressionRequest(value: unknown): value is ImageCompressionRequest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    hasSafeInputPath(candidate) &&
    candidate.operation === 'compress' &&
    typeof candidate.quality === 'number' &&
    Number.isInteger(candidate.quality) &&
    candidate.quality >= 1 &&
    candidate.quality <= 100 &&
    (candidate.maxDimension === undefined ||
      (typeof candidate.maxDimension === 'number' &&
        Number.isInteger(candidate.maxDimension) &&
        candidate.maxDimension >= 1 &&
        candidate.maxDimension <= 16_384))
  )
}
function isImageCropRequest(value: unknown): value is ImageCropRequest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    hasSafeInputPath(candidate) &&
    candidate.operation === 'crop' &&
    ['left', 'top', 'width', 'height'].every(
      (key) =>
        typeof candidate[key] === 'number' &&
        Number.isInteger(candidate[key]) &&
        (candidate[key] as number) >= 0
    ) &&
    (candidate.width as number) > 0 &&
    (candidate.height as number) > 0
  )
}
function isImageEditRequest(value: unknown): value is ImageEditRequest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    hasSafeInputPath(candidate) &&
    candidate.operation === 'edit' &&
    [
      'rotation',
      'exposure',
      'brightness',
      'contrast',
      'highlights',
      'shadows',
      'whites',
      'blacks',
      'saturation',
      'vibrance',
      'hue',
      'temperature',
      'tint',
      'gamma'
    ].every((key) => typeof candidate[key] === 'number' && Number.isFinite(candidate[key]))
  )
}

function showRadialMenu(focus = true): void {
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
  if (focus) {
    radialWindow.show()
    radialWindow.focus()
  } else {
    radialWindow.showInactive()
  }
  radialWindow.webContents.send('radial-menu:opened')
}

function showNativeDragCandidate(modifier: 'shift' | 'command'): void {
  if (nativeDismissTimer) clearTimeout(nativeDismissTimer)
  nativeDragCandidateVisible = true
  // Experimental: a newly shown window may not join a Finder drag already in progress.
  showRadialMenu(false)
  radialWindow?.webContents.send('radial-menu:modifier', modifier)
}

function showSettings(): void {
  showRadialMenu()
  radialWindow?.webContents.send('radial-menu:settings')
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
  radialWindow.on('blur', () => {
    if (!nativeDragCandidateVisible) radialWindow?.hide()
  })
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
        click: () => showRadialMenu()
      },
      {
        label: 'Open radial menu (fallback)',
        accelerator: 'CommandOrControl+Alt+Space',
        click: () => showRadialMenu()
      },
      { label: 'Settings', click: showSettings },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  )
  tray.on('click', () => showRadialMenu())
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
  nativeIntegration.start({
    onModifierDragCandidate: showNativeDragCandidate,
    onModifierChanged: (modifier) =>
      radialWindow?.webContents.send('radial-menu:modifier', modifier),
    onOutsideClick: ({ x, y }) => {
      if (!radialWindow?.isVisible()) return
      const bounds = radialWindow.getBounds()
      const clickedInside =
        x >= bounds.x &&
        x <= bounds.x + bounds.width &&
        y >= bounds.y &&
        y <= bounds.y + bounds.height
      if (!clickedInside) {
        nativeDragCandidateVisible = false
        radialWindow.hide()
      }
    },
    onGestureEnded: () => {
      if (!nativeDragCandidateVisible) return
      if (nativeDismissTimer) clearTimeout(nativeDismissTimer)
      nativeDismissTimer = setTimeout(() => {
        nativeDragCandidateVisible = false
        radialWindow?.hide()
      }, 160)
    },
    onStatus: (status) => console.info(`[native integration] ${status.detail}`)
  })
  for (const shortcut of shortcuts) {
    if (!globalShortcut.register(shortcut, showRadialMenu)) {
      console.error(`Unable to register ${shortcut}; it may be used by another application.`)
    }
  }
  ipcMain.handle('radial-menu:close', () => {
    nativeDragCandidateVisible = false
    radialWindow?.hide()
  })
  ipcMain.handle('email:compose', async (_, inputPathValue: unknown) => {
    if (typeof inputPathValue !== 'string' || !isAbsolute(inputPathValue))
      throw new Error('Invalid attachment path.')
    const inputPath = resolve(inputPathValue)
    const details = await stat(inputPath)
    if (!details.isFile()) throw new Error('The selected attachment is not a regular file.')
    await composeEmailWithAttachment(inputPath)
  })
  ipcMain.on('radial-menu:drop-received', () => {
    if (nativeDismissTimer) clearTimeout(nativeDismissTimer)
    nativeDragCandidateVisible = false
    // The menu was deliberately shown inactive while Finder owned the drag.
    // Once the file is dropped, editor inputs (such as Text) must receive keys.
    radialWindow?.focus()
  })
  ipcMain.handle('conversion:image', async (_, payload: unknown) => {
    if (!isImageConversionRequest(payload)) throw new Error('Invalid image conversion request.')
    const result = await conversionManager.convertImage(payload)
    if (Notification.isSupported()) {
      new Notification({
        title: 'Conversion Complete',
        body: `${result.inputPath.split(/[\\/]/).pop()} converted to ${result.outputPath.split(/[\\/]/).pop()}.`
      }).show()
    }
    return result
  })
  ipcMain.handle('conversion:images-to-pdf', async (_, payload: unknown) => {
    if (!isImagesToPdfRequest(payload)) throw new Error('Invalid PDF conversion request.')
    const result = await conversionManager.convertImagesToPdf(payload)
    if (Notification.isSupported()) {
      new Notification({
        title: 'PDF Created',
        body: `${payload.inputPaths.length} image${payload.inputPaths.length === 1 ? '' : 's'} saved as ${result.outputPath.split(/[\\/]/).pop()}.`
      }).show()
    }
    return result
  })
  ipcMain.handle('conversion:image-resize', async (_, payload: unknown) => {
    if (!isImageResizeRequest(payload)) throw new Error('Invalid image resize request.')
    return conversionManager.resizeImage(payload)
  })
  ipcMain.handle('conversion:image-compress', async (_, payload: unknown) => {
    if (!isImageCompressionRequest(payload)) throw new Error('Invalid image compression request.')
    return conversionManager.compressImage(payload)
  })
  ipcMain.handle('conversion:image-crop', async (_, payload: unknown) => {
    if (!isImageCropRequest(payload)) throw new Error('Invalid image crop request.')
    return conversionManager.cropImage(payload)
  })
  ipcMain.handle('conversion:image-edit', async (_, payload: unknown) => {
    if (!isImageEditRequest(payload)) throw new Error('Invalid image edit request.')
    return conversionManager.editImage(payload)
  })
  ipcMain.handle('image:preview', async (_, inputPath: unknown) => {
    if (typeof inputPath !== 'string' || !isAbsolute(inputPath))
      throw new Error('Invalid preview path.')
    const path = resolve(inputPath)
    const details = await stat(path)
    if (!details.isFile() || details.size > 20 * 1024 * 1024)
      throw new Error('Preview is unavailable for this file.')
    const metadata = await sharp(path, { failOn: 'warning' }).metadata()
    if (!metadata.format) throw new Error('Preview is not a valid image.')
    const bytes = await readFile(path)
    const mime = metadata.format === 'jpeg' ? 'image/jpeg' : `image/${metadata.format}`
    return `data:${mime};base64,${bytes.toString('base64')}`
  })
  ipcMain.handle('image:metadata', async (_, inputPath: unknown) => {
    if (typeof inputPath !== 'string' || !isAbsolute(inputPath))
      throw new Error('Invalid metadata path.')
    const metadata = await sharp(resolve(inputPath), { failOn: 'warning' }).metadata()
    return Object.entries({
      Format: metadata.format?.toUpperCase(),
      Width: metadata.width,
      Height: metadata.height,
      'Color space': metadata.space,
      'Bits per sample': metadata.depth,
      Orientation: metadata.orientation,
      Density: metadata.density,
      'Has alpha': metadata.hasAlpha ? 'Yes' : 'No',
      'ICC profile': metadata.icc ? 'Present' : undefined,
      EXIF: metadata.exif ? 'Present' : undefined
    })
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => ({ key, value: String(value) }))
  })

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

app.on('will-quit', () => {
  nativeIntegration.stop()
  if (nativeDismissTimer) clearTimeout(nativeDismissTimer)
  globalShortcut.unregisterAll()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
