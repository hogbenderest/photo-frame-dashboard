#!/bin/zsh
# Installs the hourly launchd job for frame-google-sync.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PLIST=~/Library/LaunchAgents/au.id.hogben.frame-google-sync.plist
NODE=$(command -v node)

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>au.id.hogben.frame-google-sync</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$HERE/sync.mjs</string>
    <string>sync</string>
  </array>
  <key>StartCalendarInterval</key><array>
    <dict><key>Minute</key><integer>7</integer></dict>
  </array>
  <key>StandardOutPath</key><string>$HERE/sync.log</string>
  <key>StandardErrorPath</key><string>$HERE/sync-error.log</string>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "Installed $PLIST (runs hourly at :07, and once now via RunAtLoad)."
echo "Logs: $HERE/sync.log / sync-error.log"
