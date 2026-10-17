# Frame takeover runbook (device-agnostic)

Distilled from the BIUFRAME (RK3126), Fangor 114K (Allwinner A33), and Skylight (RK3566)
sessions, plus the frame-dashboard build. Written so a future opencode skill for repeat frame
purchases can be generated from it: phase, verified command, failure mode, fix, rollback.

## Phase 0: identify before anything

| Verify | Command | Stop if |
|---|---|---|
| SoC / Android | `adb shell getprop ro.board.platform; getprop ro.build.version.release` | unknown board |
| Build identity | `getprop ro.build.display.id` | differs from prior units: new doc file |
| Root path | `adb shell su 0 id` (A33) vs `su -c id` (others) | no su -> ramdisk route, see repo docs |
| ADB transport | USB? `adb devices`; network? `getprop persist.adb.tcp.port` | |
| WebView | `dumpsys package com.android.webview \| grep version` | old WebView needs the swap (BIUFRAME doc) |

One unit's record is not a universal guide. Same-name frames can differ. Per-device doc in
`docs/`, observations separate from guesses (repo rule 8).

## Phase 1: ADB acquisition

- Vendor app settings sometimes hide an ADB toggle (Frameo: About -> Beta Program -> ADB Access).
- If WiFi ADB: `persist.adb.tcp.port=5555` (needs root; USB-only frames use the dock topology).
- Power: 10 W wall adapter, never a Mac USB-C port or a hub data port (browned out both).
- Radio quirks: Xradio XR819 misses broadcast ARP when idle -> `adb connect` only works in the
  post-boot window (~3 min) or while transmitting. Fix for good: DHCP reservation by wlan0 MAC
  (stable across boots, unlike `ro.boot.mac`).

## Phase 2: backup before any write (repo rules 1-2)

- Whole-disk reads bypass some partition denials: `dd if=/dev/block/mmcblk0 bs=512 skip=<start> count=<sectors>`.
- adbd on Android 6 merges stderr into exec-out: `su 0 sh -c 'dd ... 2>/dev/null'`.
- Exact sizes from `/proc/partitions`; SHA-256 everything (`SHA256SUMS.txt`); independent
  re-read of 2-3 partitions must match; check for `0xCC` filler (Skylight loader reads).
- Refusing partitions: try the whole-disk path (misc/frp on the A33); if a vendor kernel hook
  still denies, record it and move on.

## Phase 3: neutralize vendor update channels

`pm disable-user --user 0 com.adups.fota` (ADUPS FOTA auto-updates vendor apps over WiFi).
Verify: package appears in `pm list packages -d`.

## Phase 4: kiosk + content

Build loop (`dashboard/`):

```sh
cd dashboard && npm install && npm run build
cp -r dist/* ../kiosk/assets/dashboard/     # update-frame.sh does this end-to-end
./kiosk/build.sh && adb -s <frame> install -r kiosk/build/homehq.apk
```

- Vite: `build.target` = the device WebView's Chromium major; `cssTarget` older than you think
  (BIUFRAME-class devices rejected 4/8-digit hex even on a Chromium-106 WebView).
- Content path on TLS-broken frames: **loopback HTTP from APK assets**, not the Worker URL, not
  `file://` (CORS), not `onReceivedSslError` overrides (WebView 106 build ignored them).
- Serve a kiosk-only config route (e.g. `/ha.json`) from APK assets so secrets stay out of the
  public Worker deployment.
- **AssetServer RST race**: drain the HTTP request before close (see frame-dashboard.md gotcha
  1). Symptom: white screen, `ERR_CONNECTION_RESET` on the document, curl works fine.
- Launch as HOME: `cmd package set-home-activity com.wesbos.homehq/.MainActivity` then
  `pm disable net.frameo.frame`. Rollback: `pm enable` + set-home-activity back, or
  `adb uninstall com.wesbos.homehq`.

## Phase 5: verification (never claim done without it)

1. `dumpsys window | grep mCurrentFocus` -> kiosk activity.
2. `screencap` + pixel check (flat white or flat black = not rendering). A tiny PNG file is a
   strong white-screen signal.
3. DevTools probe (works without a desktop browser): `--ez debug true`, `adb forward tcp:9222
   localabstract:webview_devtools_remote_<pid>` (get the pid with `ps | grep`, Android 6
   `pidof` is useless), then a small WS client (`scripts/frame-devtools.mjs`) to read console
   errors, network failures, and page state.
4. Touch loop: `input tap <x> <y>` on a rail item, then read `location.hash`.
5. Watch the 60 s idle-to-home timer during interactive tests.

## Rollback matrix (per layer)

| Layer | Checkpoint | Undo |
|---|---|---|
| Firmware | partition dumps + SHA256SUMS in `backups/` | FEL/recovery flash (last resort) |
| Installed APK | pull the working APK + SHA-256 into `backups/kiosk-apks/` BEFORE each install | `adb install -r <old>.apk` |
| pm-state | `pm list packages -d`, `pm path <kiosk>`, mCurrentFocus, IP, uptime -> device doc | reverse each pm change; vendor app rollback path recorded per device |
| Dashboard source | git commit per step; tag known-good states | `git revert` / checkout |
| HA-facing changes | one object at a time; fetch back after create; document the undo in the config doc | delete script/helper/integration; revoke token |
| Public Worker | wrangler deployment history | `wrangler rollback` |

## Security hand-off (phase 9, every unit)

- These are untrusted LAN devices: old patches, permissive SELinux, promptless or
  near-promptless root for every app. Guest SSID recommended.
- No primary accounts on them; scoped credentials only (limited HA users, read-only OAuth
  scopes on the sync host).
- Tokens bundled in APK assets live in `backups/` copies - treat those like flash dumps
  (gitignored, private).

## Skill-readiness notes

Structure for the future skill (when frame #3 lands or sooner): phases as above; per-device
delta docs (gotcha lists are device-specific); this runbook as the decision tree; the
frame-dashboard doc as the reference for the content layer; checklists: identity, backup,
rollback, verification. Trigger phrases: photo frame takeover, kiosk WebView dashboard,
Frameo/AiMOR replacement, wall dashboard on Android 6.
