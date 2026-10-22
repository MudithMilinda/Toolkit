#!/bin/sh
set -eu
mkdir -p native/macos/bin
swiftc native/macos/ShiftDragMonitor.swift -o native/macos/bin/shift-drag-monitor
swiftc native/macos/BackgroundRemoval.swift -o native/macos/bin/background-removal
