declare global {
  interface Window {
    api: {
      closeRadialMenu: () => Promise<void>
      onRadialMenuOpened: (listener: () => void) => () => void
    }
  }
}

export {}
