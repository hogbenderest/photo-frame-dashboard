# Frame dashboard: architecture, setup, and rollback

The live dashboard that runs on the Fangor 114K kiosk (see `docs/fangor-114k.md` for the device).
Everything here is the "what and why" for this dashboard; the frame-takeover part of any second
frame is generalized in `docs/frame-takeover-runbook.md`.

## Current state (2026-10-17)

- Deployed to the frame: the full 10-tab dashboard running on **demo data** (no `ha.json` yet).
- Live HA verified reachable from the frame: `192.168.86.197 -> 192.168.86.109:8123 ESTABLISHED`
  (plain HTTP over LAN; the frame cannot validate modern TLS, see fangor doc Session 4).
- HA-side additions done: `script.retic_frame_test_zone` and `script.retic_frame_test_valve`
  (fetched back and validated; 120 s hard cap = WaterCorp 2-minute testing allowance).
- Not yet done (owner actions, see checklist): limited HA user + token, `ha.json`, six chores
  to-do helpers, Google Calendar integration, CalDAV/iCloud, Google Photos sync.

## Architecture

```
frame (Android 6 kiosk, untrusted: rootable)
  WebView 106 -> http://127.0.0.1:8123/index.html
                  |-> AssetServer serves assets/dashboard/ (the Vite dist)
                  |-> AssetServer serves /ha.json from assets/ha.json (APK asset)
                      { url: "http://192.168.86.109:8123", token: "<long-lived>" }
  js/ha.js:
    WS  ws://192.168.86.109:8123/api/websocket   auth -> get_states -> subscribe_entities
    REST /api/services/* (control), /api/camera_proxy/* (stills, CORS *),
         /api/calendars/* (agenda), /api/wine_cellar/wines (Cork Dork)
    Photos: cross-origin <script> tag loads http://<ha>/local/frame-photos/frame-photos.js
            (a JS manifest; JSON fetch would be CORS-blocked)
```

Security model:

- The token lives ONLY in `assets/ha.json`, which is bundled into the APK and is **not** part of
  `dashboard/dist` (the dist deploys to the public Cloudflare Worker). `assets/ha.json` is
  gitignored; `assets/ha.example.json` is the committed template.
- The real blast-radius control is the **limited HA user**: create `frame-dashboard` as a limited
  user and allowlist exactly the entities in `js/ha-config.js` (`HACONFIG.allEntities()` is the
  canonical list; the docs table below mirrors it). If the frame is ever compromised, revoke the
  token (Profile -> Security -> Long-Lived Access Tokens) and the user has no other rights.
- Service calls the dashboard can make: lights, cover open/close/stop (garage), input_boolean
  (guest mode, patio hold), script.turn_on (house modes, retic frame test scripts, stop all,
  rain delay), todo add/update/remove, calendar read, camera_proxy read, wine REST read.
  Sirens are display-only. No lock entities exist in this house.

## Setup checklist (owner actions)

Each step has an undo. Do them in this order.

1. **Limited HA user + token**
   HA UI: Settings -> People -> Add Person: name `Frame Dashboard`, user type **Limited user**.
   In the user's permissions, allow devices/areas so you can tick the allowlist; the entities to
   allow are everything in the table below (or per view as you enable them). Then, while logged
   in as that user (or via the user's own session - long-lived tokens are created in the
   profile of the account that owns them): Profile (bottom bar) -> Security -> Long-Lived Access
   Tokens -> Create Token, name it `frame`.
   *Undo:* revoke the token (instant), delete the person.
2. **ha.json**
   `cp dashboard/kiosk/assets/ha.example.json dashboard/kiosk/assets/ha.json`, fill in the token,
   then `./dashboard/kiosk/update-frame.sh` (or just build+install: the file is bundled by
   build.sh's `-A assets`). Never commit it.
   *Undo:* delete the file and re-deploy; the dashboard falls back to demo mode.
3. **Chores to-do helpers** (MCP cannot create these; UI only)
   Settings -> Devices & Services -> Helpers -> Create Helper -> **Local to-do list**, once per
   name: `Chores Ian`, `Chores Helen`, `Chores Marcus`, `Chores Alexa`, `Chores Connor`,
   `Chores Kyle`, and optionally `Chores HIMACK` (group items). Entity IDs land as
   `todo.chores_ian` ... `todo.chores_himack` - keep exactly those slugs (the config depends on
   them). Then define recurring chores in `dashboard/js/ha-config.js` -> `chores.recurrences`.
   *Undo:* delete each helper.
4. **Google Calendar (2lawlerst@gmail.com)**
   HA UI: Settings -> Devices & Services -> Add Integration -> Google Calendar; authorize the
   account. Add each calendar entity ID you want on the frame to
   `ha-config.js` -> `calendar.entities` (name + colour). Note: HA exposes no attendee data,
   so per-person event colouring needs a title convention if you want it.
   *Undo:* remove the integration; remove the entries from ha-config.js.
5. **Apple Reminders shared lists**
   Settings -> Devices & Services -> Add Integration -> CalDAV; host the iCloud CalDAV endpoint
   with an app-specific password, enable to-do (VTODO) support. Shared Reminders lists shared
   with that account appear as `todo.*` entities. Add them to `ha-config.js` -> `lists.lists`
   (Shopping first). Verify which account hosts the shared lists before generating the password.
   *Undo:* remove the integration; entries in ha-config.js.
6. **Google Photos sync pipeline** (recommended: curated album "Frame")
   OAuth credentials with read-only Photos scope live on the sync host (Mac or server111),
   never in the repo and never on the frame. The sync downloads the album into the HA config
   share at `www/frame-photos/` (use the existing `~/mount-ha-config` mount) and writes
   `frame-photos.js`: `window.FRAME_PHOTOS = { photos: [{ url, date, place, from, w, h }] }`
   (url relative to `/local/frame-photos/`; the dashboard prefixes the HA base).
   Run it hourly-ish (launchd or cron). Cache-busting is automatic (`?v=Date.now()`).
   *Undo:* stop the job, delete `www/frame-photos/`.

## Entity map / allowlist mirror

| View | Entities (config key in `js/ha-config.js`) |
|---|---|
| Today | `weather.north_perth`, `weather.north_perth_hourly`, `sensor.sun_next_rising/setting`, `climate.front_lounge`, `sensor.power_production_now`, `sensor.energy_production_today`, `sensor.energy_production_today_remaining`, `sensor.energy_production_tomorrow`, all `person.*` present |
| Lights | the 13 lights across `lights.areas` |
| Security | `input_select.home_away_mode`, `input_boolean.guest_mode`, 4 door contacts, garage cover + problem, 4 leak sensors + `binary_sensor.water_leak_detected`, 6 activity sensors, 3 sirens (read) |
| Cameras | 7 `camera.*` + their event sensors; stills via `/api/camera_proxy` |
| Watering | program running, next/last run, rain delay pair, paused, weather restriction, seasonal level, patio hold, heat boost timer, pump running/enabled, 7 station pairs + 2 patio valve switches, 9 soil moisture sensors |
| Cellar | `sensor.cork_dork_*` (4), cellar door, cellar light, 2 battery sensors; REST `/api/wine_cellar/wines` |
| Calendar | `calendar.opensprinkler_schedule` + Google calendars once configured; REST `/api/calendars/<id>` |
| Chores | `todo.chores_ian/helen/marcus/alexa/connor/kyle/himack` |
| Lists | `todo.shopping_list` + CalDAV lists once configured |
| Photos | no HA entities; `/local/frame-photos/frame-photos.js` via `<script>` |

`HACONFIG.allEntities()` in the browser console prints the exact current list.

## Compliance guardrails

- Frame watering runs go ONLY through `script.retic_frame_test_zone` / `retic_frame_test_valve`:
  duration field clamped server-side to 120 s (WaterCorp 2-minute-per-station testing allowance).
  The unguarded `retic_run_zone` / `retic_run_valve` are never called by the frame.
- Deliberate deviation from the review recommendation (surfaced): no roster-day/season gate on
  test runs, because the testing allowance is an any-day carve-out and day-gating would break
  mid-week repairs. Scheduling itself stays in OpenSprinkler/HA; the panel only runs tests,
  Stop All, rain-delay toggle, and the patio hold checkbox.
- Stop All and rain delay are hold-to-confirm; house modes and garage open/close too.

## Build, deploy, rollback

```sh
./dashboard/kiosk/update-frame.sh 192.168.86.197:5555   # build -> rebundle -> APK -> install -> restart
```

Rollback layers (all verified present):

| Layer | Where | Undo |
|---|---|---|
| Frame firmware | `backups/fangor-114k/20261016/` (15 partitions + SHA256SUMS) | FEL flash if ever needed; never needed so far |
| Kiosk APK | `backups/kiosk-apks/20261017-pre-frame-dashboard-base.apk` (`af6fa778...`) | `adb install -r <apk>` |
| Dashboard source | git: `takeover-baseline-20261017` tag, branch `frame-dashboard`, commit per step | `git revert` / checkout tag |
| Worker | wrangler history | `wrangler rollback` (frame never uses it) |
| HA scripts/helpers | created 2026-10-17 via MCP, fetched back and validated | delete script / helper in UI |
| www/frame-photos/ | new directory, nothing else touched | stop sync, delete dir |

On-frame verification after any deploy:

```sh
adb shell dumpsys window \| grep mCurrentFocus          # com.wesbos.homehq
adb shell screencap -p /sdcard/f.png && adb pull /sdcard/f.png   # pixel-check: not white
# deeper: enable debugging, forward DevTools, run the probe
adb shell am start -n com.wesbos.homehq/.MainActivity --ez debug true
PID=$(adb shell "ps \| grep homehq" | awk '{print $2}')
adb forward tcp:9222 localabstract:webview_devtools_remote_$PID
node scripts/frame-devtools.mjs          # reload + capture console/network/state
```

## Gotchas learned on this build

1. **AssetServer RST race (fixed)**: the server read only the request line; closing with the
   rest of the request still unread made the kernel send RST, which raced the response body.
   Old 4.5 KB index.html won the race; the new 5.8 KB one lost it ~always -> white screen with
   `ERR_CONNECTION_RESET` on the document request while curl (tiny headers) kept working.
   Fix: `drain()` the request before close. If a second frame shows white screen + resets,
   this is the first thing to check.
2. **`?demo=1`**: the frame URL has no query param; demo mode happens automatically when
   `/ha.json` is absent or has no token. Add `?demo=1` only to force it (Mac-side dev).
3. **Boot order matters**: `ha.js` initializes at module scope (before the shell's first
   `App.go`); otherwise the landing view renders against empty states and the cellar caches a
   wine error permanently (that exact bug shipped to the frame once - fixed by init ordering
   plus error-cache invalidation).
4. **Android 6 `pidof`** returns all PIDs; use `ps | grep <pkg>`.
5. **Idle auto-home**: 60 s without touches navigates to Today; 120 s starts ambient/night.
   Account for it when testing taps on a running frame (a stray 60 s can undo your navigation).
6. **update-frame.sh path bug (fixed)**: ROOT was resolved three levels up; only worked when the
   steps were run by hand. Now two levels (script lives in `<repo>/dashboard/kiosk/`).
7. The frame *is* being touched by household members during testing - assume non-deterministic
   navigation state; always read `location.hash`/`App.current` before diagnosing "wrong view".
