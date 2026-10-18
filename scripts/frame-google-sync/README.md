# frame-google-sync

One Mac-side tool that pulls `2lawlerst@gmail.com` data onto the frame display.
Runs hourly via launchd. Credentials live only on the Mac, never in the repo
and never on the frame.

## What it moves

| Data | Path | Why |
|---|---|---|
| Unread mail (senders, subjects, dates) | `POST /api/states/sensor.frame_mail_unread` on HA (authenticated) | Email metadata must never touch `www/` (`/local/` is unauthenticated). The frame reads the sensor over its existing WebSocket subscription. |
| Photos in the **Frame Photos** Drive folder | `~/ha-config/www/frame-photos/` + `frame-photos.js` manifest (HA `/local/`) | The Google Photos Library API has been closed to personal (non-partner) apps since 2025-03-31 - `albums.list`/`sharedAlbums.list` 403 even with `photoslibrary.readonly` granted (verified with a live token). A Drive folder is the photo source instead. |

## One-time setup (already done for this Mac, 2026-10-18)

1. Google Cloud project, **Gmail API** + **Google Drive API** enabled, OAuth
   consent screen External and **published** (In production -> refresh tokens
   do not die after 7 days; the "unverified app" warning on your own sign-in
   is safe to accept), Web application client with redirect URI
   `http://127.0.0.1:8399/`.
2. `~/.config/frame-google-sync/config.json` (chmod 600): client id/secret,
   `ha_url` = `https://home.hogben.id.au` (the relay - NOT the LAN IP: macOS
   Local Network privacy blocks node/python from LAN IPs, EHOSTUNREACH, and
   the launchd job has no Terminal to inherit permission from; external HTTPS
   is unaffected), `ha_token` (HA Profile -> Security -> Long-Lived Access
   Token), `frame_folder` = "Frame Photos".
3. `node sync.mjs authorize` - browser opens, sign in as 2lawlerst@gmail.com.
4. Create the **Frame Photos** folder in that Drive, drop photos in.
5. `./install.sh` - hourly launchd job (logs: sync.log / sync-error.log).

Photos you see on the frame: put them in the Frame Photos folder (any phone's
Drive app, or save shared photos into it). New photos appear within the hour;
the frame picks them up when the Photos tab is opened or ambient re-enters.

## Frame-side (no code changes needed)

- Allowlist `sensor.frame_mail_unread` for the `frame-dashboard` user (turns
  out that user has broad entity access; new entities work without changes).
- The Photos tab + ambient slideshow light up from the manifest.
- If Google auth ever dies, the manifest and sensor get `needs_reauth` flags.

## Undo

`launchctl unload ~/Library/LaunchAgents/au.id.hogben.frame-google-sync.plist`,
delete the plist, `rm -rf ~/.config/frame-google-sync ~/ha-config/www/frame-photos`,
revoke the HA token and the Google OAuth client.
