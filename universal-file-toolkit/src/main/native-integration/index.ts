import type { NativeIntegration, NativeIntegrationStatus } from './types'

class DocumentedIntegration implements NativeIntegration {
  constructor(readonly status: NativeIntegrationStatus) {}
  start(): void {
    void this.status
  }
  stop(): void {
    void this.status
  }
}

/**
 * Native Finder/Explorer drag capture is deliberately not emulated with web drag events.
 * A compiled, signed helper can replace the appropriate implementation later.
 */
export function createNativeIntegration(platform = process.platform): NativeIntegration {
  if (platform === 'darwin') {
    return new DocumentedIntegration({
      platform: 'darwin',
      shiftDragSupported: false,
      detail: 'The AppKit feasibility source is included, but no signed helper is bundled.'
    })
  }
  if (platform === 'win32') {
    return new DocumentedIntegration({
      platform: 'win32',
      shiftDragSupported: false,
      detail:
        'Windows OLE IDropTarget integration is planned; Electron receives only in-window drops.'
    })
  }
  return new DocumentedIntegration({
    platform: 'unsupported',
    shiftDragSupported: false,
    detail: 'No native drag integration is provided for this platform.'
  })
}
