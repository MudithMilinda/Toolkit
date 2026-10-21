import ApplicationServices
import AppKit
import Foundation

/// A minimal, event-driven helper. It checks only the public pasteboard type declaration
/// to distinguish Finder file drags from ordinary modifier drags; it never reads file URLs.
final class ShiftDragMonitor {
    private var eventTap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?
    private var gestureActive = false
    private var activeModifier: String?

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
        if type == .leftMouseDown && !gestureActive {
            let location = event.location
            emit(["type": "outside-click", "x": location.x, "y": location.y])
        }
        let modifier = dragModifier(for: event.flags)
        if type == .leftMouseDragged || (type == .flagsChanged && gestureActive) {
            if type == .leftMouseDragged && !gestureActive && !hasFileDragPasteboard() {
                return
            }
            guard let modifier else {
                if gestureActive { emit(["type": "gesture-ended"]) }
                gestureActive = false
                activeModifier = nil
                return
            }
            if !gestureActive {
                gestureActive = true
                activeModifier = modifier
                emit(["type": "modifier-drag-candidate", "modifier": modifier])
            } else if activeModifier != modifier {
                activeModifier = modifier
                emit(["type": "modifier-changed", "modifier": modifier])
            }
        }
        if type == .leftMouseUp {
            if gestureActive { emit(["type": "gesture-ended"]) }
            gestureActive = false
            activeModifier = nil
        }
    }

    private func dragModifier(for flags: CGEventFlags) -> String? {
        if flags.contains(.maskCommand) { return "command" }
        if flags.contains(.maskShift) { return "shift" }
        return nil
    }

    private func hasFileDragPasteboard() -> Bool {
        let types = NSPasteboard(name: .drag).types ?? []
        return types.contains(.fileURL) || types.contains { type in
            type.rawValue == "NSFilenamesPboardType"
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
