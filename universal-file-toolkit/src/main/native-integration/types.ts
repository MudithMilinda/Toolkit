export interface NativeIntegrationStatus {
  platform: 'darwin' | 'win32' | 'unsupported'
  shiftDragSupported: boolean
  detail: string
}

/** OS-specific integrations must expose only this narrow lifecycle contract. */
export interface NativeIntegration {
  readonly status: NativeIntegrationStatus
  start(): void
  stop(): void
}
