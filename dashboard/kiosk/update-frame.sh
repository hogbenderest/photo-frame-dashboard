#!/usr/bin/env zsh
# Rebuild the dashboard, rebundle it into the kiosk APK, and install to a frame.
# Usage:
#   ./update-frame.sh <frame-name>     # from frames.json; requires the
#                                      # per-frame ha.json at ~/.config/frame-ha/<name>.json
#   ./update-frame.sh <ip:port>        # legacy direct mode (uses the ha.json
#                                      # currently sitting in kiosk/assets/, if any)
#
# SAFETY: in frame-name mode the script FAILS HARD if the per-frame ha.json is
# missing - it never silently rebundles a previous frame's token into the APK.
set -e
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export PATH=$JAVA_HOME/bin:$PATH
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"  # script lives in <repo>/dashboard/kiosk/
TARGET="${1:-}"

# ---------------------------------------------------------------------------
# Resolve target + per-frame ha.json
HA_JSON=""
if [[ -n "$TARGET" && "$TARGET" != *:* ]]; then
  FRAME_NAME="$TARGET"
  FRAMES_FILE="$ROOT/frames.json"
  if [[ ! -f "$FRAMES_FILE" ]]; then echo "ERROR: frames.json missing at $FRAMES_FILE"; exit 1; fi
  IP=$(node -e "const f=require('$FRAMES_FILE'); console.log(f['$FRAME_NAME'] ? f['$FRAME_NAME'].ip : 'MISSING')")
  PROFILE=$(node -e "const f=require('$FRAMES_FILE'); const e=f['$FRAME_NAME']; console.log(e ? e.profile : 'MISSING')")
  if [[ "$IP" == "MISSING" || "$IP" == "undefined" ]]; then echo "ERROR: frame '$FRAME_NAME' not in frames.json"; exit 1; fi
  if [[ "$IP" == "TBD" ]]; then echo "ERROR: frame '$FRAME_NAME' has no IP yet (TBD in frames.json) - take the unit over first"; exit 1; fi
  SRC_HA="$HOME/.config/frame-ha/$FRAME_NAME.json"
  if [[ ! -f "$SRC_HA" ]]; then
    echo "ERROR: per-frame ha.json missing: $SRC_HA"
    echo "Create it: {\"url\":\"http://192.168.86.109:8123\",\"token\":\"<long-lived token for $FRAME_NAME>\",\"frame\":\"$PROFILE\"}"
    exit 1
  fi
  HA_JSON="$SRC_HA"
  echo "Deploying frame '$FRAME_NAME' (profile $PROFILE) to $IP using $SRC_HA"
else
  IP="${TARGET:-192.168.86.197:5555}"
  echo "Direct mode: deploying to $IP with the ha.json currently in kiosk/assets/ (if any)"
fi

# ---------------------------------------------------------------------------
echo "Building dashboard..."
cd "$ROOT/dashboard"
npm install --silent
npm run build

echo "Rebundling kiosk..."
rm -rf "$ROOT/dashboard/kiosk/assets/dashboard"
cp -r "$ROOT/dashboard/dist" "$ROOT/dashboard/kiosk/assets/dashboard"

# Per-frame ha.json: copy in AFTER the dist wipe, BEFORE the build. Never
# committed; assets/ha.json stays gitignored.
if [[ -n "$HA_JSON" ]]; then
  cp "$HA_JSON" "$ROOT/dashboard/kiosk/assets/ha.json"
  echo "Per-frame ha.json installed for profile $PROFILE."
fi

"$ROOT/dashboard/kiosk/build.sh"

echo "Installing to $IP ..."
adb connect "$IP" >/dev/null 2>&1 || true
adb -s "$IP" install -r "$ROOT/dashboard/kiosk/build/homehq.apk"
adb -s "$IP" shell am force-stop com.wesbos.homehq
sleep 1
adb -s "$IP" shell am start -n com.wesbos.homehq/.MainActivity
echo "Done - dashboard updated on $IP."
