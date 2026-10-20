# Universal File Toolkit

A standalone macOS/Windows-oriented desktop utility with a floating SVG radial menu. Files remain local; conversion operations are deliberately simulated in this prototype.

## Included

- Transparent, frameless, always-on-top radial window with a premium dark glass appearance
- System tray/menu bar utility; press `CommandOrControl+Shift+Space` to open it near the current pointer. Fallbacks: `Control+Shift+Space` and `CommandOrControl+Alt+Space`.
- File category detection for images, PDFs, video, and audio
- Six contextual SVG radial operations with hover, click, arrow-key navigation, Enter selection, and Escape dismissal
- Clear prototype feedback that never claims a conversion occurred
- Hardened renderer configuration (`contextIsolation`, no renderer Node access, sandbox enabled) and a narrow preload bridge
- macOS packaging configuration for a Finder-launchable Apple Silicon `.app` inside a `.dmg`

## Limitations and next steps

Conversion actions are deliberately simulated. A production conversion engine should live in the main process behind narrowly validated IPC, using tools such as `sharp`, `pdf-lib`, and a bundled FFmpeg binary.

## Build and install

Development requires Node.js and runs from the repository:

```bash
npm install
npm run dev
```

Create a local Apple Silicon disk image and application bundle:

```bash
npm run build:mac
```

The output is written to `dist/`. Open the generated DMG and move **Universal File Toolkit.app** into Applications. It then starts independently from Finder, without VS Code or a terminal. An Intel build is also available where Electron supports it:

```bash
npm run build:mac:x64
```

The local builds are unsigned. macOS may show a Gatekeeper warning the first time an unsigned app is opened. For distribution, use an Apple Developer signing identity, hardened runtime, and notarization. Do not disable Gatekeeper system-wide.

## Native Shift + Drag feasibility

`globalShortcut` only opens the utility; it does **not** observe system-wide Shift + Drag operations. Finder and Windows Explorer do not expose this workflow to ordinary Electron browser drag events. The included [Swift feasibility source](native/macos/ShiftDragPrototype.swift) documents an AppKit global-event monitor, but is not compiled or bundled as a helper.

- **Windows:** build a signed native companion using shell extension / COM `IDataObject` and drag-drop interfaces, or a low-level input hook with explicit installation and accessibility documentation. Explorer integration requires installer-managed registration and careful compatibility testing across Windows 10/11.
- **macOS:** a signed native helper can use AppKit global-event monitoring only after Accessibility consent. A global monitor supplies modifier/mouse information, not dragged file URLs. File URLs must arrive via a legitimate `NSDraggingDestination` drop. Opening a floating window during an active Finder drag is not a verified, reliable way to acquire that session; a persistent drop target or Finder Quick Action is the safer next investigation.

The present app supports dropping files directly into its visible floating window for safe prototype testing only. No Full Disk Access is requested or required.

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

### Other platform builds

```bash
# For windows
$ npm run build:win

# For Linux
$ npm run build:linux
```
