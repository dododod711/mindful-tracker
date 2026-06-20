#!/bin/bash
# Builds dist/Mindful.app — a native macOS wrapper around the web app.
# Requires only the Xcode Command Line Tools (swiftc, sips, iconutil, codesign).
set -euo pipefail
cd "$(dirname "$0")"

APP=dist/Mindful.app
rm -rf dist build
mkdir -p build "$APP/Contents/MacOS" "$APP/Contents/Resources/web"

swiftc -O -o "$APP/Contents/MacOS/Mindful" main.swift
cp Info.plist "$APP/Contents/"
cp "../Mental Health Tracker/index.html" \
   "../Mental Health Tracker/today.html" \
   "../Mental Health Tracker/insights.html" \
   "../Mental Health Tracker/galaxy.html" \
   "../Mental Health Tracker/styles.css" \
   "../Mental Health Tracker/galaxy.css" \
   "../Mental Health Tracker/app.js" \
   "../Mental Health Tracker/ui.js" \
   "../Mental Health Tracker/galaxy.js" \
   "../Mental Health Tracker/handtracking.js" \
   "../Mental Health Tracker/manifest.webmanifest" \
   "../Mental Health Tracker/sw.js" \
   "$APP/Contents/Resources/web/"
cp -R "../Mental Health Tracker/icons" "$APP/Contents/Resources/web/"

if swift makeicon.swift build/icon_1024.png; then
  mkdir -p build/Mindful.iconset
  for s in 16 32 128 256 512; do
    sips -z "$s" "$s" build/icon_1024.png \
      --out "build/Mindful.iconset/icon_${s}x${s}.png" >/dev/null
    sips -z "$((s * 2))" "$((s * 2))" build/icon_1024.png \
      --out "build/Mindful.iconset/icon_${s}x${s}@2x.png" >/dev/null
  done
  iconutil -c icns build/Mindful.iconset -o "$APP/Contents/Resources/AppIcon.icns"
else
  echo "warning: icon generation failed; building without an icon" >&2
fi

codesign --force --deep -s - "$APP"
echo "Built $APP"
