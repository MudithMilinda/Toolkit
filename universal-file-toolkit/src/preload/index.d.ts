declare global {
  interface Window {
    api: {
      closeRadialMenu: () => Promise<void>
      notifyDropReceived: () => void
      simulateOperation: (payload: {
        name: string
        size: number
        type: string
        operationId: string
      }) => Promise<{ accepted: boolean; simulated: boolean }>
      onRadialMenuOpened: (listener: () => void) => () => void
      onSettingsRequested: (listener: () => void) => () => void
    }
  }
}

export {}
