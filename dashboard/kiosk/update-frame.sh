#!/bin/zsh
# Rebuild the dashboard, rebundle it into the kiosk APK, and install to the frame.
# Usage: ./update-frame.sh [frame-ip:port]   (default 192.168.86.197:5555)
set -e
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export PATH=$JAVA_HOME/bin:$PATH
FRAME=${1:-192.168.86.197:5555}
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

echo "Building dashboard..."
cd "$ROOT/dashboard"
npm install --silent
npm run build

echo "Rebundling kiosk..."
rm -rf "$ROOT/dashboard/kiosk/assets/dashboard"
cp -r "$ROOT/dashboard/dist" "$ROOT/dashboard/kiosk/assets/dashboard"
"$ROOT/dashboard/kiosk/build.sh"

echo "Installing to $FRAME ..."
adb connect "$FRAME" >/dev/null 2>&1 || true
adb -s "$FRAME" install -r "$ROOT/dashboard/kiosk/build/homehq.apk"
adb -s "$FRAME" shell am force-stop com.wesbos.homehq
sleep 1
adb -s "$FRAME" shell am start -n com.wesbos.homehq/.MainActivity
echo "Done - dashboard updated on the frame."
