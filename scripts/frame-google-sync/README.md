# frame-google-sync

One Mac-side tool that pulls `2lawlerst@gmail.com` data onto the frame display.
Runs hourly via launchd. Credentials live only on the Mac, never in the repo
and never on the frame.

## What it moves

| Data | Path | Why |
|---|---|---|
| Unread mail (senders, subjects, dates) | `POST /api/states/sensor.frame_mail_unread` on HA (authenticated) | Email metadata must never touch `www/` (`/local/` is unauthenticated). The frame reads the sensor over its existing WebSocket subscription. |
| Photos (shared albums + curated "Frame" album) | `~/ha-config/www/frame-photos/` + `frame-photos.js` manifest (HA `/local/`) | Family photos are on display anyway; every URL carries a `?v=` cache-buster because `/local/` caches hard. Videos skipped in v1. |

## One-time setup

1. **Google Cloud** (console.cloud.google.com): pick or create a project.
2. **Enable APIs**: Gmail API and Photos Library API.
3. **OAuth consent screen**: External. Add `2lawlerst@gmail.com` as a test user.
   - **Ops decision (make it once):** leave the app in *Testing* and refresh
     tokens die after 7 days (weekly re-auth, the frame will show it), or
     *Publish* the app for long-lived tokens. Publishing an app with these
     scopes may show an "unverified app" warning during your own sign-in,
     which you can accept.
4. **Credentials**: Create an OAuth client (type: Desktop app). Put the client
   ID/secret in the config file.
5. `cp config.example.json ~/.config/frame-google-sync/config.json`, fill it
   in, `chmod 600` it. `ha_token`: your HA Profile -> Security -> Long-Lived
   Access Tokens (needs state-write; the frame's limited user token is NOT
   used here).
6. `node sync.mjs authorize` - browser opens; sign in as 2lawlerst@gmail.com.
7. `node sync.mjs sync` - verify a full run, then install the hourly job:
   `./install.sh` (launchd).

Note: the Google Photos API exposes *albums*. A single photo shared outside an
album (a "sharing conversation") may not appear; put shared photos in a shared
album, or add them to the curated "Frame" album.

## Frame-side (no code changes needed)

- Allowlist `sensor.frame_mail_unread` for the `frame-dashboard` limited user.
- The Photos tab + ambient slideshow light up once the manifest exists.
- If Google auth dies, the manifest and sensor get a `needs_reauth` flag and
  the Today Family card shows "waiting for first sync" / a re-auth hint.

## Undo

`launchctl unload ~/Library/LaunchAgents/au.id.hogben.frame-google-sync.plist`,
delete the plist, `rm -rf ~/ha-config/www/frame-photos ~/`.config/frame-google-sync`,
revoke the HA token and the Google OAuth client.
