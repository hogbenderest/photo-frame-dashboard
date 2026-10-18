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

## Session 5 (2026-10-17): frame dashboard v1 (live HA, demo until token)

- **Frame -> HA reachability verified**: `192.168.86.197 -> 192.168.86.109:8123 ESTABLISHED`
  (via `/proc/net/tcp` after loading the URL in the stock browser; the little-endian hex of the
  remote address is `6D56A8C0:1FBB`, first attempt grepped the wrong byte order and found nothing).
- **Baselines taken** before any change: working APK pulled to
  `backups/kiosk-apks/20261017-pre-frame-dashboard-base.apk` (SHA-256 `af6fa778...`),
  pm-state snapshot (homehq HOME, fota + frameo + systemui disabled), screenshot
  `backups/screenshots/20261017-baseline-wesbos.png`; git commit `9a0423b` + tag
  `takeover-baseline-20261017`, work on branch `frame-dashboard`.
- **Dashboard rewritten end-to-end** for this house (10 rail tabs, live HA data layer,
  token-out-of-bundle). Details: `docs/frame-dashboard.md`. Deployed and verified on-frame
  (demo mode; white-screen incident below). Rollback = archived APK.
- **White-screen root cause (new gotcha, fixed in AssetServer)**: the server read only the
  request line and closed; the unread remainder of Chromium's request made the kernel send
  RST, which raced the response body. curl (small headers) won the race; the larger new
  index.html lost it almost always -> `ERR_CONNECTION_RESET` on the document, pure-white
  5.9 KB screenshots, self-healing reload loop. Fix: `drain()` the request before close.
  Diagnosis was via DevTools over `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`
  with `--ez debug true` (Android 6 `pidof` is useless; use `ps | grep`).
- **update-frame.sh path bug found**: ROOT resolved three levels up; only worked when the steps
  were run by hand. Fixed to two levels (script lives in `<repo>/dashboard/kiosk/`).
- **HA changes (via ha-mcp, fetched back and validated)**: created
  `script.retic_frame_test_zone` (mode single) and `script.retic_frame_test_valve` (mode
  restart), both capping duration at 120 s for the WaterCorp 2-minute testing allowance; only
  the frame calls them. Deliberate, surfaced deviation from review advice: no roster-day gate,
  because the testing allowance is an any-day carve-out. To-do helpers could NOT be created
  via MCP (`Unknown helper_type 'todo'` - only storage helpers) -> the seven chores lists are
  on the owner checklist in `docs/frame-dashboard.md`.
- **Verified on-frame**: boot to demo, all subresources 200, `input tap` navigation
  (Watering/Today), pixel-verified render (160 KB screenshot, paper/ink palette).
- Note: the frame is being touched by household members during sessions - always read
  `App.current` before diagnosing a "wrong view".

## Session 6 (2026-10-18): live token in, CORS saga, http YAML is dead config

- User created the limited HA user + token and `assets/ha.json`; deployed.
- **Live verified on-frame**: `STATE ha: live` - the WebSocket path (auth, `get_states`,
  `subscribe_entities`) works end-to-end with the limited user. DevTools probe had to be
  re-forwarded (pid unchanged; stale forward after several hours).
- **REST calls failed at CORS preflight** (`403` + `net::ERR_FAILED` on /api/wine_cellar,
  /api/calendars, and by extension camera stills + service calls). The assumption "HA /api is
  CORS-open" does not hold on 2026.10: browsers preflight Authorization-header requests and HA
  rejects unlisted origins.
- **First fix attempt was wrong**: added `http: cors_allowed_origins` to configuration.yaml +
  restarted HA (00:05, clear of the watering window; HA came back RUNNING). CORS still 403.
  Root cause per HA 2026.10.1 source: the http integration is storage-managed since 2026.8 -
  `.storage/http` shows `yaml_migration_done: true`; YAML is migrated once then ignored
  (repair issue only). No config entry exists for it, so MCP integration tools can't drive it.
- **Correct path (docs + HA integration page)**: Settings -> System -> Network -> HTTP server ->
  CORS allowed origins -> add `http://127.0.0.1:8123`; save restarts HA; confirm within the
  5-minute promotion window. The pending/stable store auto-reverts unconfirmed changes.
- **YAML reverted** from `configuration.yaml.bak-20261017-frame-cors` (left in place as the
  rollback record); the repair issue clears on the next HA boot.
- Frame remains functional meanwhile: WS state layer live; REST-dependent features (calendar,
  wine, camera stills, service calls) blocked until the CORS origin is added in the UI.

- **CORS origin added via the UI and promoted** (Settings > System > Network; confirmed inside
  the 5-minute window; `.storage/http` shows both origins, `pending: null`). Everything that
  follows is verified ON-FRAME end-to-end (tour script `scripts/frame-tour.mjs`):
  - `/api/calendars/...` 200, **28 irrigation events rendered** on the Calendar tab.
  - `/api/wine_cellar/wines` 200, **141 bottles** in the Cellar view. Required a one-line fix in
    the Cork Dork integration: `GET_WINES_SCHEMA` rejected `cabinet_id=None`, so **every bare
    call to the endpoint had always 400'd** (`http_api.py` always passes the key). Fixed in
    `wine_response.py` (`vol.Any(cv.string, None)`), backup
    `wine_response.py.backup.20261018_0037_cabinet_none`, HA restarted to load it. Verified:
    `?cabinet_id=x` 200 before the fix (isolation), bare 200 after.
  - `/api/camera_proxy/*` 200, images render (981 KB screenshot of the Cameras tab).
  - todo round-trip: add + remove 200, test item cleaned up.
- **HA 2026.10 todo API is summary-based**: `remove_item`/`update_item` take `item` (the text,
  required); `item_uid` does not exist in this version's service schema (400). Items are NOT in
  entity attributes; fetch via `todo.get_items?return_response` with an explicit status list
  (default is needs_action only). Views reworked accordingly (js/ha.js `HA.todoItems`).
- **Prebuilt-view resume bug class**: the shell prebuilds hidden views (show+hide); views that
  stop timers in hide() must restart them in resume(), or the tab looks dead on entry. All views
  now have resume() repaint/restart.
- Camera tiles: fetched stills were assigned to the container div's `.src` (no-op); now inserted
  as `<img>` children.
- Final state: `ha: live`, kiosk focused, all 10 tabs rendering live data. Remaining owner
  checklist items: chores to-do helpers, Google Calendar, CalDAV, Photos sync pipeline.

## Session 7 (2026-10-18): challenger review applied - calendar, mail, chores, photos

- **Challenger review of the four-workstream plan** found two criticals (both verified before
  trusting them): (C1) HA's `google_mail` integration CANNOT provide unread mail - it only has
  a vacation sensor + set_vacation + notify (verified against HA source + docs; the "INBOX
  label" instruction was wrong - that's a HACS custom component's feature). (C2) email metadata
  must never touch `/local/` (unauthenticated LAN-readable) - the manifest fallback is dead.
  Also corrected an earlier misdiagnosis: `todo.update_item`/`remove_item` take a single `item`
  field that accepts **uid OR summary** (the `item_uid` key 400s; uid-in-`item` verified 200
  on-frame). Mutations are now uid-keyed (duplicate-safe).
- **Calendar** (done): all four calendars wired with colours; Calendar tab renders 31 events
  (irrigation + family, incl. multi-day all-day); Today gained a Family card whose event row
  shows the next strip-calendar event (irrigation suppressed from the strip; ongoing multi-day
  events included).
- **Boot-race + two UI bugs found on-frame**: Today's event fetch ran before /ha.json resolved
  and cached empty; the data-event repaint path didn't refetch (row stuck on "Loading\u2026");
  nested `<button>` inside the Family card button made the parser eject the second row. All
  fixed: fetch guard on `HA.url`, refetch on data/ha-status, honest Loading state, div wrapper.
  Verified: cold boot shows "Connor and Marcus with Ian - Friday" within 20 s.
- **Mail** (architecture change per review): Mac-side Gmail fetch in
  `scripts/frame-google-sync/sync.mjs` -> `POST /api/states/sensor.frame_mail_unread`
  (authenticated; the frame reads it over its existing WS subscription). The Today Family card
  shows unread count + deduped senders; tap opens a sheet with sender/subject/date for all
  unread. Nothing email-related ever goes to `/local/`.
- **Photos** (per review): same sync script pulls shared albums + a curated "Frame" album into
  `www/frame-photos/` with a JS manifest; per-URL `?v=` cache-busters (review m4), pagination,
  mediaItemId dedupe, Perth dates, video skip, album-title collision check, rotation cap,
  needs_reauth flag into manifest + sensor. launchd installer included. OAuth ops decision
  (Testing = 7-day tokens vs Publish) is documented as an explicit user choice.
- **Chores** (per review): definitions now live in the `Chore Definitions` to-do list
  (`Who | Chore | Day [| stars]`, tick = pause, delete = remove, parse errors shown on the
  frame); once-daily `remove_completed_items` cleanup makes summary-keyed rows unambiguous;
  uid-keyed ticks. Reconcile engine + parse error display built; waiting on the 8 helpers.
- Remaining owner actions (docs/frame-dashboard.md checklist): 8 to-do helpers + allowlist,
  Google Cloud OAuth setup + HA token for the sync script, Testing-vs-Publish decision,
  optionally a "Frame" album. The HA-native `google_photos` integration is unused by the
  frame (it cannot serve photos to it); our own OAuth client is the data path.

## Session 8 (2026-10-18, later): Photos API is dead; Drive pivot; photos + launchd live

- **Photos Library API closed to personal apps**: verified with a live token -
  `albums.list` and `sharedAlbums.list` both 403 "insufficient authentication
  scopes" even with `photoslibrary.readonly` granted. Google removed
  library-wide read for non-partner apps on 2025-03-31. Re-authorizing with
  wider scopes cannot fix policy. (The challenger's M4 flagged OAuth friction;
  reality was stricter than that.)
- **Pivot (user-approved)**: the photo source is now a Google Drive folder
  ("Frame Photos") read via `drive.readonly`. 19 photos downloaded on the
  first run; images resize to 1280px via sips; rotation cap 200 on HA side.
  Per-photo `?v=` cache-busters were dropped after the first run - filenames
  embed unique Drive ids, so URLs are immutable and the WebView caches each
  photo once instead of re-downloading the pool after every hourly sync.
- **mail + photos both verified on-frame**: Family card shows live unread
  counts (19) + deduped senders; Photos tab renders the pool (1280x960 test
  image loaded from the HA host).
- **Two real bugs found on-frame during photo verification**: (1) the manifest's
  relative `/local/...` URLs resolved against the PAGE origin (the loopback
  kiosk, 404) - the Slideshow refills from `pool()` (raw manifest objects),
  not the view's mapped array, so the fix belongs in `slideshow.js` `pool()`;
  (2) the Photos view's `resume()` never retried the manifest and a loaded
  pool never refreshed, so pre-manifest 404s and stale pools would stick for
  the life of a session - now load() retries hourly (frames run for weeks).
- **OAuth loopback fix**: the authorize URL must use `http://127.0.0.1:8399/`,
  not `localhost` (redirect_uri_mismatch otherwise). Web application client
  with the redirect registered; consent screen published (In production).
- **launchd installed and self-verified**: hourly at :07, RunAtLoad run clean,
  logs in the script directory.
- **macOS LNP gotcha extended**: node (like python) is blocked from LAN IPs
  (EHOSTUNREACH) while Apple tools (curl) pass - the sync's `ha_url` must be
  the Nabu Casa relay, never the LAN IP, for the launchd job to work.
- **Frame storage posture** (user asked): /data 26.7G with 565M used (2%).
  The frame stores no photos - they stream from HA; its only growth surface
  is Chromium's bounded, self-evicting HTTP cache plus bytes of localStorage.
  Session screenshots on /sdcard are pulled to backups/ then deleted (1.7 MB
  cleaned today). Disk check added to the runbook maintenance list.

## Session 9 (2026-10-18): retic map + cellar racks (challenger-reviewed)

- **Zone-map sign-off done before shipping** (review amendment 2): polygon-to-zone mapping
  verified point-by-point against the known-good HA Watering dashboard clip-paths - all 9 zones
  match (centroid/area); the frame ships the dashboard's own refined clip-paths as
  `public/retic/zone_polygons.json` + a 95 KB `layout.jpg` (review wanted <=200 KB), so no
  /local/ 31-day-cache dependency. Render order per gotcha 3 (hedge below lawns).
- **Map verified on-frame**: 9 polygon groups in order 1,2,3,4,7,5,6,8,9; zone sheet opens with
  the right name (zone 5 -> "Letterbox Lawn", run + stop-all buttons).
- **Per-zone stop proven live** (review amendment 5): started station 1 via the capped frame
  script (map pulsed), stopped it via `opensprinkler.stop` on the station entity (source shows
  per-station `/cm sid=en=0`), zone 2 untouched throughout.
- **Cellar racks**: one cabinet at a time (review amendment 3 - 3x12 side-by-side would give
  ~33px cells, under the ~44px touch target); tabs Shelf 1/2/3, 4x12 grid, 47+1/47/47 slots,
  colour by peak_status including `past_due` + `unknown` (review amendment 4). Geometry from
  the `wine_cellar/get_cabinets` WS command (works for the limited user; note it wraps the
  array as `{cabinets:[...]}`) with derive-from-bottles fallback; `HA.callWS` added to ha.js.
- **"Drank it" proven non-destructively**: admin-added test bottle -> appeared in rack -> tap
  opened correct sheet -> removed via the frame's limited-user
  `HA.callService('wine_cellar.remove_wine')` -> gone from inventory and rack. The remove
  button hold-to-confirms, then forces `HA.wineInventory(true)`.
- Bugs found during verification: rack tabs rendered before cabinets loaded (null guard added);
  the view kept a stale `V.wine` cache beside the `HA.wine` cache (view now reads `HA.wine`
  as the single source).

## Open questions

- Why did the frame drop off USB mid-session? (FOTA reboot suspected but unverified - check uptime and Frameo version when it returns.)
- Which Android Settings activities are reachable without a launcher hack (for brightness/sleep config later)?
- Recovery entry method on this board (button combo unknown; Allwinner FEL via SD possible per repo docs if ever needed).
