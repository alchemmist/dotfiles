#!/bin/zsh -f
# Build the menu bar app and load its launch agent. Secrets stay in
# ~/.config/homelab/nightnode and are not part of this repo.
set -euo pipefail

repo_root="${0:A:h:h:h}"
src="$HOME/.local/lib/nightnode"
if [[ ! -f "$src/menubar.swift" ]]; then
    src="$repo_root/macos/nightnode"
fi

if ! command -v swiftc >/dev/null 2>&1; then
    print -u2 -- 'nightnode: swiftc is not installed, skipping the menu bar app'
    exit 0
fi

app="$HOME/Applications/SocratNight.app"
mkdir -p "$app/Contents/MacOS"
cat > "$app/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleExecutable</key><string>SocratNight</string>
  <key>CFBundleIdentifier</key><string>xyz.alchemmist.socrat-night</string>
  <key>CFBundleName</key><string>SocratNight</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSUIElement</key><true/>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
</dict></plist>
PLIST

swiftc -O -parse-as-library -framework Cocoa \
    "$src/menubar.swift" \
    -o "$app/Contents/MacOS/SocratNight"

plist="$HOME/Library/LaunchAgents/org.alchemmist.socrat-night.plist"
mkdir -p "${plist:h}"
cat > "$plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>org.alchemmist.socrat-night</string>
  <key>ProgramArguments</key>
  <array>
    <string>${app}/Contents/MacOS/SocratNight</string>
  </array>
  <key>RunAtLoad</key><true/>
</dict></plist>
PLIST

uid="$(id -u)"
launchctl bootout "gui/${uid}" "$plist" 2>/dev/null || true
launchctl bootstrap "gui/${uid}" "$plist"
