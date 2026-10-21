import ApplicationServices
import Foundation

/// A minimal, event-driven feasibility helper. It observes candidate gestures only.
/// It does not inspect Finder drag payloads, read file URLs, synthesize input, or use private APIs.
final class ShiftDragMonitor {
    private var eventTap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?
    private var gestureActive = false

    func start() {
        let promptOption = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        let accessibilityTrusted = AXIsProcessTrustedWithOptions([promptOption: true] as CFDictionary)

        // CGEventTap is governed by Input Monitoring on current macOS releases.
        // This public permission is required to reliably observe a Finder drag.
        let inputMonitoringTrusted = CGPreflightListenEventAccess()
        if !inputMonitoringTrusted {
            CGRequestListenEventAccess()
        }

        emit([
            "type": "status",
            "accessibility": accessibilityTrusted,
            "inputMonitoring": inputMonitoringTrusted
        ])

        let eventTypes: [CGEventType] = [.leftMouseDown, .leftMouseDragged, .leftMouseUp, .flagsChanged]
        let eventMask = eventTypes.reduce(CGEventMask(0)) { partialResult, eventType in
            partialResult | (CGEventMask(1) << CGEventMask(eventType.rawValue))
        }
        let context = Unmanaged.passUnretained(self).toOpaque()
        guard let tap = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .listenOnly,
            eventsOfInterest: eventMask,
            callback: { _, type, event, userInfo in
                guard let userInfo else { return Unmanaged.passUnretained(event) }
                let monitor = Unmanaged<ShiftDragMonitor>.fromOpaque(userInfo).takeUnretainedValue()
                monitor.handle(type: type, event: event)
                return Unmanaged.passUnretained(event)
            },
            userInfo: context
        ) else {
            emit(["type": "status", "accessibility": accessibilityTrusted, "inputMonitoring": false, "eventTap": false])
            RunLoop.main.run()
            return
        }

        eventTap = tap
        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        runLoopSource = source
        CFRunLoopAddSource(CFRunLoopGetCurrent(), source, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
        RunLoop.main.run()
    }

    private func handle(type: CGEventType, event: CGEvent) {
        let shiftHeld = event.flags.contains(.maskShift)
        if type == .leftMouseDragged && shiftHeld && !gestureActive {
            gestureActive = true
            emit(["type": "shift-drag-candidate"])
        }
        if type == .leftMouseUp || (type == .flagsChanged && !shiftHeld && gestureActive) {
            if gestureActive { emit(["type": "gesture-ended"]) }
            gestureActive = false
        }
    }

    private func emit(_ value: [String: Any]) {
        guard JSONSerialization.isValidJSONObject(value),
              let data = try? JSONSerialization.data(withJSONObject: value),
              let line = String(data: data, encoding: .utf8) else { return }
        print(line)
        fflush(stdout)
    }
}

let monitor = ShiftDragMonitor()
monitor.start()
