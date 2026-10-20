declare global {
  interface Window {
    api: {
      closeRadialMenu: () => Promise<void>
      onRadialMenuOpened: (listener: () => void) => () => void
      onSettingsRequested: (listener: () => void) => () => void
    }
  }
}

export {}
