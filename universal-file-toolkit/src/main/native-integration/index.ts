import { existsSync } from 'node:fs'
import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { app } from 'electron'
import type {
  NativeIntegration,
  NativeIntegrationCallbacks,
  NativeIntegrationStatus
} from './types'

class DocumentedIntegration implements NativeIntegration {
  constructor(readonly status: NativeIntegrationStatus) {}
  start(callbacks: NativeIntegrationCallbacks): void {
    callbacks.onStatus?.(this.status)
  }
  stop(): void {
    void this.status
  }
}

type HelperMessage = {
  type: 'shift-drag-candidate' | 'gesture-ended' | 'status'
  accessibility?: boolean
  inputMonitoring?: boolean
  eventTap?: boolean
}

class MacShiftDragIntegration implements NativeIntegration {
  private helper: ChildProcess | null = null
  private buffer = ''
  private currentStatus: NativeIntegrationStatus = {
    platform: 'darwin',
    shiftDragSupported: false,
    detail: 'Native helper has not started.'
  }

  get status(): NativeIntegrationStatus {
    return this.currentStatus
  }

  start(callbacks: NativeIntegrationCallbacks): void {
    const helperPath = app.isPackaged
      ? join(process.resourcesPath, 'native', 'shift-drag-monitor')
      : join(app.getAppPath(), 'native', 'macos', 'bin', 'shift-drag-monitor')
    if (!existsSync(helperPath)) {
      this.currentStatus = {
        platform: 'darwin',
        shiftDragSupported: false,
        detail: 'Native helper is not built. Run npm run build:native:mac.'
      }
      callbacks.onStatus?.(this.currentStatus)
      return
    }
    const helper = spawn(helperPath, [], { stdio: ['ignore', 'pipe', 'pipe'] })
    this.helper = helper
    helper.stdout?.setEncoding('utf8')
    helper.stdout?.on('data', (chunk: string) => {
      this.buffer = `${this.buffer}${chunk}`
      const lines = this.buffer.split('\n')
      this.buffer = lines.pop() ?? ''
      for (const line of lines) this.handleMessage(line, callbacks)
    })
    helper.on('error', () => {
      this.currentStatus = {
        platform: 'darwin',
        shiftDragSupported: false,
        detail: 'Native helper could not start.'
      }
      callbacks.onStatus?.(this.currentStatus)
    })
  }

  stop(): void {
    this.helper?.kill()
    this.helper = null
    this.buffer = ''
  }

  private handleMessage(line: string, callbacks: NativeIntegrationCallbacks): void {
    let message: HelperMessage
    try {
      message = JSON.parse(line) as HelperMessage
    } catch {
      return
    }
    if (message.type === 'status') {
      this.currentStatus = !message.accessibility
        ? {
            platform: 'darwin',
            shiftDragSupported: false,
            detail: 'Accessibility permission was not granted; helper may receive limited events.'
          }
        : message.inputMonitoring === false || message.eventTap === false
          ? {
              platform: 'darwin',
              shiftDragSupported: false,
              detail:
                'Input Monitoring is required for global drag observation. Enable the app or its launcher in System Settings.'
            }
          : {
              platform: 'darwin',
              shiftDragSupported: false,
              detail:
                'Helper is observing candidate gestures; Finder drag hand-off is experimental.'
            }
      callbacks.onStatus?.(this.currentStatus)
    }
    if (message.type === 'shift-drag-candidate') callbacks.onShiftDragCandidate()
    if (message.type === 'gesture-ended') callbacks.onGestureEnded()
  }
}

/**
 * Native Finder/Explorer drag capture is deliberately not emulated with web drag events.
 * A compiled, signed helper can replace the appropriate implementation later.
 */
export function createNativeIntegration(platform = process.platform): NativeIntegration {
  if (platform === 'darwin') {
    return new MacShiftDragIntegration()
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
