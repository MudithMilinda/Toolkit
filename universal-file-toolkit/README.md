# Universal File Toolkit

A floating background desktop utility for selecting simulated file operations from an SVG radial menu. It does not upload, modify, or convert files in this phase.

## Included

- Transparent, frameless, always-on-top radial window with a premium dark glass appearance
- System tray/menu bar utility; press `CommandOrControl+Shift+Space` to open it near the current pointer. Fallbacks: `Control+Shift+Space` and `CommandOrControl+Alt+Space`.
- File category detection for images, PDFs, video, and audio
- Six contextual SVG radial operations with hover, click, arrow-key navigation, Enter selection, and Escape dismissal
- Clear prototype feedback that never claims a conversion occurred
- Hardened renderer configuration (`contextIsolation`, no renderer Node access, sandbox enabled) and a narrow preload bridge

## Limitations and next steps

Conversion actions are deliberately simulated. A production conversion engine should live in the main process behind narrowly validated IPC, using tools such as `sharp`, `pdf-lib`, and a bundled FFmpeg binary.

## Native Shift + Drag integration (future work)

`globalShortcut` only opens the utility; it does **not** observe system-wide Shift + Drag operations. Finder and Windows Explorer do not expose this workflow to ordinary Electron browser drag events.

- **Windows:** build a signed native companion using shell extension / COM `IDataObject` and drag-drop interfaces, or a low-level input hook with explicit installation and accessibility documentation. Explorer integration requires installer-managed registration and careful compatibility testing across Windows 10/11.
- **macOS:** build a signed native helper using AppKit pasteboard/dragging APIs and likely Accessibility permission for global input observation. A sandboxed Mac App Store build has additional restrictions; notarization and user consent are required.

The present app supports dropping files directly into its visible floating window for safe prototype testing only.

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```
