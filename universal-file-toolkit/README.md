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

`globalShortcut` remains the reliable way to open the utility. Finder and Windows Explorer do not expose their drag payloads to ordinary Electron browser drag events.

The macOS proof of concept is an event-driven Swift/AppKit helper: [ShiftDragMonitor.swift](native/macos/ShiftDragMonitor.swift). Build it with:

```bash
npm run build:native:mac
```

The helper is bundled by `npm run build:mac`. It observes a **Shift + left-mouse-drag candidate** via `NSEvent.addGlobalMonitorForEvents`, sends newline-delimited JSON to Electron over a managed child-process pipe, and Electron shows the existing menu without focusing it. Electron uses its own `screen.getCursorScreenPoint()` for correct Retina and multi-display placement.

This is deliberately not a Finder file-drag detector: an `NSEvent` contains no legitimate Finder file URLs. The helper does not read pasteboards, synthesize input, or bypass privacy protections. The menu only accepts file information from an actual drop into its Electron drop target.

The exact Tangerine-style flow remains experimental. A window that appears after a Finder drag has already begun is not verified to join that active `NSDraggingSession`; manual Finder-to-menu testing is required. If it is unreliable, the supported alternative remains opening the menu first (shortcut/tray) and then dropping directly into it. A persistent native drop target or Finder Quick Action is the next reliable design to investigate.

- **Windows:** build a signed native companion using shell extension / COM `IDataObject` and drag-drop interfaces, or a low-level input hook with explicit installation and accessibility documentation. Explorer integration requires installer-managed registration and careful compatibility testing across Windows 10/11.
- **macOS permissions:** Accessibility consent may be needed for complete global event observation, depending on macOS privacy state. The helper reports its current `AXIsProcessTrusted()` status and works gracefully with limited events; it does not request Full Disk Access.
- **Windows:** the `NativeIntegration` interface keeps a future Win32/OLE `IDropTarget` implementation separate. No Windows event hook or Explorer interception is included yet.

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
