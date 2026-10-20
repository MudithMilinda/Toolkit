import AppKit

/// Feasibility-only source for a future, separately signed macOS helper.
/// It deliberately does not read Finder file URLs or synthesize drag events.
/// File URLs may only be accepted from a legitimate NSDraggingDestination drop.
final class ShiftDragPrototype {
    private var eventMonitor: Any?

    func start() {
        // A global monitor observes modifier/mouse events only when macOS grants
        // the required Accessibility permission. It cannot turn an existing
        // Finder drag into a drop owned by another application.
        eventMonitor = NSEvent.addGlobalMonitorForEvents(
            matching: [.leftMouseDragged, .flagsChanged]
        ) { event in
            guard event.modifierFlags.contains(.shift) else { return }
            // Future: notify the helper UI that a candidate gesture occurred.
            // Do not access file paths here; none are available from NSEvent.
        }
    }

    func stop() {
        if let eventMonitor { NSEvent.removeMonitor(eventMonitor) }
        eventMonitor = nil
    }
}
