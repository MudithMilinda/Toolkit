export interface NativeIntegrationStatus {
  platform: 'darwin' | 'win32' | 'unsupported'
  shiftDragSupported: boolean
  detail: string
}

/** OS-specific integrations must expose only this narrow lifecycle contract. */
export interface NativeIntegration {
  readonly status: NativeIntegrationStatus
  start(callbacks: NativeIntegrationCallbacks): void
  stop(): void
}

export interface NativeIntegrationCallbacks {
  onModifierDragCandidate(modifier: 'shift' | 'command', fileName?: string): void
  onModifierChanged(modifier: 'shift' | 'command'): void
  onOutsideClick(point: { x: number; y: number }): void
  onGestureEnded(): void
  onStatus?(status: NativeIntegrationStatus): void
}
