#!/bin/sh
set -eu
mkdir -p native/macos/bin
swiftc native/macos/ShiftDragMonitor.swift -o native/macos/bin/shift-drag-monitor
swiftc native/macos/BackgroundRemoval.swift -o native/macos/bin/background-removal
swiftc -parse-as-library native/macos/VideoConverter.swift -framework AVFoundation -o native/macos/bin/video-converter
