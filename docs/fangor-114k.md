# Fangor 114K (Frameo 10.1" WiFi frame) - device notes

Per repo rule 8: observations kept separate from guesses. One unit's record, not a universal guide.

## Goal

Run the wesbos-style family dashboard on this frame: deploy `dashboard/` to Cloudflare Workers, sideload the kiosk WebView app, replace `net.frameo.frame` entirely.

## Device identity (verified via getprop, 2026-10-16)

- SoC: **Allwinner A33** (`ro.board.platform=astar`, `ro.boot.hardware=sun8i`, `ro.sys.cputype=QuadCore-A33`), quad Cortex-A7, 32-bit armeabi-v7a
- Android: **6.0.1** (SDK 23), MOB30R, security patch 2016-07-05, user build, **test-keys**, `ro.secure=1`, `ro.adb.secure=1`, `ro.debuggable=0`
- Build: `ro.build.display.id=114119_HK9365_SWM0810_frameo_v1.29.13_20260114`, brand `ALONG`, OEM software Zeasn (`ro.zeasn.supportemail=114kz@eitack.com`)
- RAM: 512MB (`ro.config.512m=true`, `low_ram=true`), zram 320MB
- Flash: mmcblk0 30,539,776 blocks (~29.1 GiB), UDISK ~27.1 GiB user data
- WiFi: Xradio XR819 (`persist.vendor.bluetooth_vendor=xradio`, platform `astar_xr819`), 2.4GHz
- Screen: 1280x800, density 160, `ro.sf.rotation=90`
- Timezone set to Australia/Perth
- USB IDs: **idVendor 0x1F3A (Allwinner)**, product "Android", serial `9c802d27b8c700000000`
- ADB: authorized with "always allow" from the Mac

## Key capabilities (verified)

- **Root: YES.** Ships with softwinner-style `su`. Syntax is `su 0 <command>`; the usual `su -c` fails with `invalid uid/gid '-c'`. Confirmed `uid=0(root)`.
- **WebView: 106.0.5249.126** (versionCode 524912603, targetSdk 33) - the exact WebView family the wesbos kiosk targets. No WebView swap needed.
- Frameo app: base `v1.29.13` plus an **OTA-updated `v1.32.12_-_OTA_test`** already installed over it. ADUPS FOTA (`com.adups.fota`, `ro.fota.oem=alongA33_6.0`) is present and has already auto-updated the vendor app over WiFi. Needs disabling early.
- Useful packages present: `com.android.launcher`, `com.android.browser`, `com.android.settings` (full Android Settings reachable), `com.softwinner.*` tools, `com.along.factorytest`. No GApps.

## Partition map (verified via /proc/partitions and /dev/block/by-name)

Blocks (1 block = 1 KiB):

| Partition | Device | Size | Notes |
|---|---|---|---|
| UDISK (p1) | /dev/block/mmcblk0p1 | 28,405,760 KiB | user data / photos, label PRIVATE |
| bootloader (p2) | mmcblk0p2 | 32,768 KiB | |
| env (p5) | mmcblk0p5 | 16,384 KiB | |
| boot (p6) | mmcblk0p6 | 16,384 KiB | |
| system (p7) | mmcblk0p7 | 1,048,576 KiB (1 GiB) | |
| misc (p8) | mmcblk0p8 | 16,384 KiB | |
| recovery (p9) | mmcblk0p9 | 32,768 KiB | |
| cache (p10) | mmcblk0p10 | 786,432 KiB (768 MiB) | |
| metadata (p11) | mmcblk0p11 | 16,384 KiB | |
| private (p12) | mmcblk0p12 | 16,384 KiB | |
| frp (p13) | mmcblk0p13 | 512 KiB | |
| empty (p14) | mmcblk0p14 | 15,872 KiB | |
| alog (p15) | mmcblk0p15 | 81,920 KiB | |
| media_data (p16) | mmcblk0p16 | 16,384 KiB | |
| mmcblk0boot0/1 | - | 4,096 KiB each | eMMC hidden boot partitions |

## Session 1 (2026-10-11)

- ADB toggled on in Frameo settings (Settings, About, Beta Program, ADB Access).
- WiFi: frame reachable (192.168.86.195) but zero open TCP ports 1-20000: no network ADB. USB-only.
- Charge-only dock ports were the USB trap: frame booted fine but never enumerated. Mac USB-C direct via C-to-C browned out the frame (logo then shutdown; likely ~7.5W CC limit vs 10W needed).
- Recovery menu was offered once during boot (declined). Entry method not identified.

## Session 2 (2026-10-16)

- Working topology: Mac USB-C port -> dock upstream -> dock data port -> A-to-C cable -> frame USB-C. Frame enumerated immediately; RSA prompt accepted.
- Pulled full identity (above), package list, WebView info, partition map. All read-only.
- **Event: the frame dropped off USB mid-session** right after the partition reads (hub stayed on the bus, frame vanished). Suspects: spontaneous reboot, FOTA-triggered restart, or power blip at the dock. Monitoring for return.

## Session 2 additions (2026-10-16, continued)

- **USB topology that works**: frame USB-C -> A-to-C cable -> UGREEN Revodok (externally powered by a 96W Apple supply) -> Mac. Data ports on the Revodok still cap around 900mA, so the frame (needs up to 10W, no battery) browns out on this port every few minutes. WiFi off (`su 0 svc wifi disable`, shell-user svc is ignored on this build) plus screen off lengthens survival to several minutes per boot. **The permanent fix (planned): root-set `persist.adb.tcp.port=5555` and talk to the frame over WiFi at full wall-adapter power.**
- **Link speed measured at ~8.9 MB/s** (dd stderr report over exec-out). Full backup incl. 1GiB system is a few minutes of transfer.
- **adbd quirk**: this Android 6.0.1 adbd merges device stderr into the `exec-out` stream. Any binary dump must suppress stderr on the device: `adb exec-out "su 0 sh -c 'dd ... 2>/dev/null'"`. First backup attempt produced images 98 bytes too long (dd's summary text appended).
- **misc partition read**: `dd if=/dev/block/by-name/misc` as uid 0 returned "Permission denied" while env/boot/recovery read fine. Unresolved: suspect node labeling or an SELinux quirk (su gives uid 0 but stays in `u:r:shell:s0` context). Backup script falls back to the raw node `/dev/block/mmcblk0p8`.
- Backup scripts live in `~/photo-frame-dashboard/scripts-backup/`, images in `~/photo-frame-dashboard/backups/fangor-114k/20261016/` (gitignored). Verified sizes are hardcoded from `/proc/partitions`.

## Session 3 (2026-10-17): backup complete, TCP adb, dashboard deployed

- **Backup: 15/15 partitions, verified.** All dumps exact-size, SHA-256'd (`SHA256SUMS.txt`); independent re-reads of `boot` and `alog` match. `misc` and `frp` refuse direct reads via their partition nodes (vendor kernel hook; SELinux is Permissive, so it is not MAC) but read fine through the whole-disk device: `dd if=/dev/block/mmcblk0 bs=512 skip=<start> count=<sectors>` (misc start 2301952, frp start 4038656).
- **adbd stderr quirk**: this Android 6 adbd merges device stderr into the exec-out stream; every binary dump needs `su 0 sh -c 'dd ... 2>/dev/null'` on-device.
- **Persistent network adb**: `persist.adb.tcp.port=5555` set (survives reboots); adbd listens on 0.0.0.0:5555 (confirmed via netstat + /proc/net/tcp). USB adb continues to work alongside.
- **FOTA neutralized**: `pm disable-user --user 0 com.adups.fota` (confirmed in `pm list packages -d`).
- **WiFi radio quirk**: XR819 misses broadcast ARP when idle (Mac cannot initiate connections; frame-initiated traffic works fine). No PS disable tool exists on-frame (no iw/iwconfig/iwpriv, no module parameter). Connect during the post-boot awake window, or keep a static ARP entry on the client.
- **MAC stable across boots**: wlan0 `80:74:84:dd:b6:94` (ro.boot.mac `9c:80:41:c7:b8:27` is unrelated). IP wandering (.195/.197) is DHCP lease behavior. **Recommend: router DHCP reservation for 80:74:84:dd:b6:94.**
- **Mac harness LAN blockage**: this harness's processes lost all LAN reachability mid-session (even the router; user's terminal unaffected) - likely the utun4 VPN or macOS per-app Local Network privacy. **Workaround for future sessions: the user runs `adb kill-server` then `adb connect 192.168.86.197:5555` in their own terminal; the shared adb server (localhost:5037) then has the user's network context and the harness drives the frame through it.**
- **Frame relocated to its own 5V/2A wall adapter** - stable power, no more brownout flapping. USB dock sessions are a thing of the past; TCP adb is the maintenance path.
- **Dashboard deployed**: https://home-dashboard.ian-48f.workers.dev (Worker `home-dashboard`, account Ian@hogben.id.au, first deploy 2026-10-17, version 96bb3329). Vite targets chrome106/cssTarget chrome61 - matches this frame's WebView 106 exactly.
- **Kiosk**: `DEFAULT_URL` in `dashboard/kiosk/src/com/wesbos/homehq/MainActivity.java` repointed to the deployment above. Build tooling installed via Homebrew: temurin@17, android-commandlinetools, build-tools;34.0.0, platforms;android-34 (build.sh expects ANDROID_HOME=/opt/homebrew/share/android-commandlinetools).

## Next steps

1. `dashboard/kiosk/build.sh` -> `build/homehq.apk`
2. `adb -s 192.168.86.197:5555 install` the APK, launch, verify the dashboard renders (frame's outbound HTTPS works despite the radio quirk)
3. Set kiosk as HOME app, then `pm disable net.frameo.frame` (approved), disable display sleep for always-on use
4. Document rollback: `pm enable net.frameo.frame`

## Session 4 (2026-10-17): TAKEOVER COMPLETE

**Final architecture (all steps verified on device):**

- The kiosk APK (`com.wesbos.homehq`, label "Home HQ") is **HOME**, auto-starting from cold boot.
  Verified: after `adb reboot`, `mCurrentFocus=com.wesbos.homehq/.MainActivity` at 1m38s uptime.
- **Frameo (`net.frameo.frame`) disabled** ("fully replace" decision) along with `com.adups.fota`.
  Note: the vendor itself ships with `com.android.systemui` disabled - no status/nav bar by design.
- Dashboard content is the wesbos Vite app, deployed to https://home-dashboard.ian-48f.workers.dev
  (Worker `home-dashboard`) AND bundled into the APK at `assets/dashboard/`. The frame serves it
  to its own WebView via a loopback-only HTTP server (`AssetServer.java`, 127.0.0.1:8123).
  The `DEFAULT_URL` is `http://127.0.0.1:8123/index.html`.

**Why the local server instead of the Workers URL (the TLS saga):**

- Android 6.0.1's 2016-era CA store predates Let's Encrypt/GTS roots; chromium logs
  `net_error -202 ERR_CERT_AUTHORITY_INVALID` against the workers.dev cert.
- The restricted su (CapEff `ffffffe0000000c0`: setuid/setgid only - no CAP_SYS_ADMIN,
  no CAP_DAC_OVERRIDE) means no `/system` remount, so the repo's CA-root install is impossible.
  The capability mask also retroactively explains the misc/frp read denials.
- The vendor's CertInstaller is odex'ed and its file picker finds nothing; `CertInstaller` takes
  cert bytes via intent extras but every indirect install attempt (extra-key `cfk`, the
  `android.credentials.INSTALL` action with KeyChain extras via the `seedca` kiosk branch) showed
  windows that silently finished without writing to `/data/misc/keychain/cacerts-added/`.
- The `onReceivedSslError` override (compile-time stub trick for the hidden `android.webkit.SslError`)
  compiled and installed fine but the WebView 106 build never honors it.
- `file://` is a dead end in modern WebView: subresources CORS-blocked (`origin 'null'`), and
  `READ_EXTERNAL_STORAGE` would also be needed for `/sdcard` paths.
- Conclusion: `http://127.0.0.1` served from the APK is the only fully reliable content path on
  this hardware. The Workers deployment remains the upstream source (update flow: build, copy
  `dist/` into `kiosk/assets/dashboard/`, rebuild, `adb install -r`).

**Content updates:** `dashboard/kiosk/update-frame.sh [ip:port]` does the whole cycle:
vite build -> rebundle assets -> build APK -> install -> restart kiosk.

**Maintenance access (read this before the next session):**

- adbd listens on `:5555` on WiFi (persistent across reboots). The Mac harness's LAN access was
  broken by a per-app network block this session (likely VPN/LNE); the working pattern is to have
  the user's terminal spawn the adb server (`adb kill-server && adb connect <ip>:5555`), then the
  harness drives via localhost:5037.
- The XRadio wifi chip misses broadcast ARP when idle, so `adb connect` only works during the
  post-boot awake window or while the frame is otherwise transmitting. Practical procedure:
  power-cycle the frame, run `adb connect 192.168.86.197:5555` repeatedly for the first ~3 minutes
  after boot.
- **Recommended**: DHCP reservation on the router for `80:74:84:dd:b6:94` (stable across reboots,
  unlike `ro.boot.mac`), and optionally `sudo arp -S <ip> 80:74:84:dd:b6:94` on the Mac.

**Rollback (restoring the photo frame):**

1. `adb -s <ip>:5555 shell su 0 pm enable net.frameo.frame` (and `com.adups.fota` if wanted)
2. Press Home, pick Frameo, Always. Or `adb uninstall com.wesbos.homehq`.
3. Full firmware restore: images + SHA256SUMS in `~/photo-frame-dashboard/backups/fangor-114k/20261016/`
   (15 partitions incl. system, verified). Flash via Allwinner FEL/recovery - see the repo's
   allwinner-a33 docs. No flashing has been needed: all changes are pm-state or user-installed APKs.

**Security posture (repo phase 9):** Android 6.0.1, patches 2016-07-05, SELinux Permissive,
promptless restricted-root su available to every app. Do not sign into primary accounts on it.
The AssetServer binds loopback only. FOTA and the Frameo cloud are disabled. Treat it as an
untrusted IoT device on the LAN (guest SSID would be reasonable).

**Leftovers in the kiosk:** the `onReceivedSslError` override and `seedca` branch remain in
MainActivity (harmless; seedca only runs with `--ez seedca true`). The `usesCleartextTraffic`
flag serves the loopback HTTP origin.

## Open questions

- Why did the frame drop off USB mid-session? (FOTA reboot suspected but unverified - check uptime and Frameo version when it returns.)
- Which Android Settings activities are reachable without a launcher hack (for brightness/sleep config later)?
- Recovery entry method on this board (button combo unknown; Allwinner FEL via SD possible per repo docs if ever needed).
