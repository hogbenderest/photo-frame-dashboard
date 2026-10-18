#!/usr/bin/env node
// frame-google-sync: pulls 2lawlerst@gmail.com data onto the frame display.
//
//   node sync.mjs authorize   one-time OAuth (opens a browser, needs you)
//   node sync.mjs sync        fetch unread Gmail + photos, push to HA
//   node sync.mjs status      show what the last sync wrote
//
// Data paths (security model, see docs/frame-dashboard.md):
//   Mail   -> POST /api/states/sensor.frame_mail_unread on HA (authenticated;
//             the frame reads it over its existing WebSocket subscription).
//             NEVER write email metadata to www/ (/local/ is unauthenticated).
//   Photos -> ~/ha-config/www/frame-photos/ (HA /local/, SMB mount) plus a
//             JS manifest the frame loads via cross-origin <script>. Family
//             photos on /local/ is accepted (they are on display anyway);
//             every URL carries a ?v= cache-buster because /local/ caches hard.
//
// Config: ~/.config/frame-google-sync/config.json (chmod 600, gitignored by
// design - never inside this repo):
//   {
//     "client_id": "...", "client_secret": "...",
//     "ha_url": "http://192.168.86.109:8123", "ha_token": "<long-lived HA token>",
//     "frame_album": "Frame", "max_photos": 200, "photo_width": 1280
//   }
// Tokens: ~/.config/frame-google-sync/tokens.json (refresh token, 600).
// State:  ~/.config/frame-google-sync/state.json (synced media item ids/files).
//
// OAuth ops warning (deliberate, from the HA Google integration docs):
// if the Google Cloud consent screen stays in "Testing", refresh tokens DIE
// AFTER 7 DAYS and you must re-run `authorize`. Publishing the app avoids it.
// On auth failure the script flags needs_reauth in the HA sensor + manifest so
// the frame shows it. Decide the ops model once and document it.

import { access, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

const DIR = path.join(homedir(), '.config', 'frame-google-sync');
const CONFIG = path.join(DIR, 'config.json');
const TOKENS = path.join(DIR, 'tokens.json');
const WWW_PHOTOS = path.join(homedir(), 'ha-config', 'www', 'frame-photos');
const MAIL_SENSOR = 'sensor.frame_mail_unread';
// Google closed the Photos Library API to personal (non-partner) apps on
// 2025-03-31: photoslibrary.readonly 403s on albums.list/sharedAlbums.list
// (verified with a live token). The frame's photo source is therefore a
// Google Drive folder - full read via drive.readonly, which personal apps
// in production may use (the Gmail half proves the pattern).
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/drive.readonly'];
const REDIRECT_PORT = 8399;

async function readJson(p) { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; } }
async function writeJson(p, obj) { await mkdir(path.dirname(p), { recursive: true }); await writeFile(p, JSON.stringify(obj, null, 2), { mode: 0o600 }); }

function fail(msg) { console.error('frame-google-sync: ' + msg); process.exit(1); }

async function main() {
  const cmd = process.argv[2] || 'sync';
  const cfg = await readJson(CONFIG);
  if (cmd !== 'status' && !cfg) fail('missing ' + CONFIG + ' (see config.example.json in this directory)');

  if (cmd === 'authorize') return authorize(cfg);
  if (cmd === 'status') return status();
  if (cmd === 'sync') return sync(cfg);
  fail('unknown command: ' + cmd);
}

// ---------------------------------------------------------------- google auth
async function accessToken(cfg, tokens) {
  const now = Date.now();
  if (tokens && tokens.access_token && tokens.expires_at > now + 60000) return tokens.access_token;
  if (!tokens || !tokens.refresh_token) return null;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.client_id, client_secret: cfg.client_secret,
      refresh_token: tokens.refresh_token, grant_type: 'refresh_token'
    })
  });
  if (r.status === 400 || r.status === 401) return { dead: true }; // invalid_grant etc.
  if (!r.ok) fail('token refresh HTTP ' + r.status);
  const j = await r.json();
  tokens.access_token = j.access_token;
  tokens.expires_at = now + (j.expires_in || 3600) * 1000;
  await writeJson(TOKENS, tokens);
  return tokens.access_token;
}

async function authorize(cfg) {
  // Google's loopback rule: desktop/web clients must register the literal
  // 127.0.0.1 form; "localhost" is a different URI and 400s with
  // redirect_uri_mismatch.
  const redirect = `http://127.0.0.1:${REDIRECT_PORT}/`;
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: cfg.client_id, redirect_uri: redirect, response_type: 'code',
    access_type: 'offline', prompt: 'consent',
    scope: SCOPES.join(' '),
    login_hint: '2lawlerst@gmail.com'
  });
  const code = await new Promise((resolve, reject) => {
    const srv = createServer((req, res) => {
      const q = new URL(req.url, redirect).searchParams;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      if (q.get('code')) { res.end('Authorized. You can close this tab and go back to the terminal.'); srv.close(() => resolve(q.get('code'))); }
      else { res.end('No code received.'); srv.close(() => reject(new Error('no code'))); }
    });
    srv.listen(REDIRECT_PORT, '127.0.0.1', () => {
      console.log('Open this in a browser and sign in as 2lawlerst@gmail.com:\n\n' + url + '\n');
    });
    setTimeout(() => reject(new Error('authorize timeout (10 min)')), 600000);
  });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.client_id, client_secret: cfg.client_secret,
      code, grant_type: 'authorization_code', redirect_uri: redirect
    })
  });
  if (!r.ok) fail('code exchange HTTP ' + r.status + ' ' + (await r.text()));
  const j = await r.json();
  if (!j.refresh_token) fail('Google returned no refresh_token (re-run authorize; consent screen may need prompt=consent).');
  await writeJson(TOKENS, { refresh_token: j.refresh_token, access_token: j.access_token, expires_at: Date.now() + (j.expires_in || 3600) * 1000 });
  console.log('Refresh token stored in ' + TOKENS);
}

// ---------------------------------------------------------------- gmail
async function gmailFetchMeta(tok, query, max) {
  const h = { Authorization: 'Bearer ' + tok };
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=' + max + '&q=' + encodeURIComponent(query), { headers: h });
  if (!r.ok) fail('gmail list HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const j = await r.json();
  const ids = (j.messages || []).map(m => m.id);
  const out = [];
  for (const id of ids) {
    const m = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + id + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date', { headers: h });
    if (!m.ok) continue; // individual failure: skip, next sync retries
    const d = await m.json();
    const get = k => { const x = (d.payload && d.payload.headers || []).find(v => v.name.toLowerCase() === k); return x ? x.value : ''; };
    out.push({ from: get('from'), subject: get('subject'), date: get('date') });
  }
  return out;
}
async function gmailUnread(tok) {
  return gmailFetchMeta(tok, 'is:unread in:inbox', 100);
}
// Starred = the user-curated "important" set (bills etc); stars persist after
// the mail is read, so this is independent of the unread list.
async function gmailStarred(tok) {
  return gmailFetchMeta(tok, 'is:starred in:inbox', 30);
}

async function pushMail(cfg, messages, starred, needsReauth) {
  if (!cfg.ha_url || !cfg.ha_token) { console.error('mail: skipped (no ha_url/ha_token in config)'); return false; }
  const body = {
    state: needsReauth ? '0' : String(messages.length),
    attributes: {
      friendly_name: 'Frame Mail Unread',
      icon: 'mdi:email-alert',
      messages: needsReauth ? [] : messages,
      starred: needsReauth ? [] : (starred || []),
      needs_reauth: needsReauth || false,
      updated_at: new Date().toISOString()
    }
  };
  const r = await fetch(cfg.ha_url.replace(/\/$/, '') + '/api/states/' + MAIL_SENSOR, {
    method: 'POST', headers: { Authorization: 'Bearer ' + cfg.ha_token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) { console.error('mail: HA POST HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200)); return false; }
  console.log('mail: ' + (needsReauth ? 'needs_reauth flag set'
    : messages.length + ' unread, ' + (starred || []).length + ' starred pushed to ' + MAIL_SENSOR));
  return true;
}

// ---------------------------------------------------------------- photos (Drive)
async function driveGet(tok, params) {
  const url = 'https://www.googleapis.com/drive/v3/files?' + new URLSearchParams(params);
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + tok } });
  if (!r.ok) fail('drive list HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.json();
}
// Find the frame folder: owned by the account OR shared with it. Fail loudly
// on zero (user must create it) and on duplicates (ambiguous source).
async function findFrameFolder(tok, name) {
  const FOLDER = "mimeType='application/vnd.google-apps.folder' and trashed=false";
  const [own, shared] = await Promise.all([
    driveGet(tok, { q: "name='" + name + "' and " + FOLDER, fields: 'files(id,name,modifiedTime)', pageSize: 50 }),
    driveGet(tok, { q: "sharedWithMe=true and name='" + name + "' and " + FOLDER, fields: 'files(id,name,modifiedTime)', pageSize: 50 })
  ]);
  const all = (own.files || []).concat(shared.files || []);
  if (all.length === 0) return null;
  if (all.length > 1) fail('multiple Drive folders named "' + name + '" (' + all.length + ') - rename all but one');
  return all[0].id;
}
async function listFolderImages(tok, folderId) {
  const files = [];
  let pageToken = '';
  for (;;) {
    const j = await driveGet(tok, {
      q: "'" + folderId + "' in parents and trashed=false",
      fields: 'nextPageToken,files(id,name,mimeType,createdTime,modifiedTime)',
      pageSize: 200, pageToken
    });
    (j.files || []).forEach(function (f) { if ((f.mimeType || '').startsWith('image/')) files.push(f); });
    if (!j.nextPageToken) break;
    pageToken = j.nextPageToken;
  }
  return files;
}
function perthDate(creationTime) {
  // RFC3339 UTC in; the frame shows Perth dates.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Perth', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(creationTime));
}
async function syncPhotosRoom(cfg, tok, needsReauth, folderName, room) {
  // Per-room state + manifest. Living keeps the legacy un-suffixed paths so
  // the deployed frame never breaks; other rooms use www/frame-photos/<room>/.
  const suffix = room === 'living' ? '' : '/' + room;
  const ROOM_DIR = WWW_PHOTOS + suffix;
  const MANIFEST = path.join(ROOM_DIR, 'frame-photos.js');
  const STATE = path.join(DIR, 'state-' + room + '.json');
  await mkdir(ROOM_DIR, { recursive: true });
  const state = (await readJson(STATE)) || { synced: {} };   // driveFileId -> {file, date, place}
  if (needsReauth) {
    if (await exists(MANIFEST)) {
      const src = await readFile(MANIFEST, 'utf8');
      await writeFile(MANIFEST, src.replace(/\);?\s*$/, '').replace('window.FRAME_PHOTOS = ', 'window.FRAME_PHOTOS_REAUTH = ') + '\nwindow.FRAME_PHOTOS = Object.assign({}, window.FRAME_PHOTOS_REAUTH, { needs_reauth: true });');
    }
    console.error('photos[' + room + ']: needs reauth; last manifest kept with needs_reauth flag');
    return;
  }
  const folderId = await findFrameFolder(tok, folderName);
  if (!folderId) {
    console.error('photos[' + room + ']: no Drive folder named "' + folderName + '" (owned or shared with 2lawlerst@gmail.com). Create it and drop photos in.');
    if (!await exists(MANIFEST)) {
      await writeFile(MANIFEST, 'window.FRAME_PHOTOS = { photos: [], updated_at: ' + JSON.stringify(new Date().toISOString()) + ' };\n');
    }
    return; // one missing room must not block the others
  }
  const images = await listFolderImages(tok, folderId);
  let downloaded = 0;
  for (const f of images) {
    if (state.synced[f.id]) continue;
    const dl = await fetch('https://www.googleapis.com/drive/v3/files/' + f.id + '?alt=media', { headers: { Authorization: 'Bearer ' + tok } });
    if (!dl.ok) continue; // individual failure: skip, next sync retries
    const buf = Buffer.from(await dl.arrayBuffer());
    const file = f.id + '.jpg';
    await writeFile(path.join(ROOM_DIR, file), buf);
    try { execFileSync('sips', ['-s', 'format', 'jpeg', '-Z', String(cfg.photo_width || 1280), path.join(ROOM_DIR, file), '--out', path.join(ROOM_DIR, file)], { stdio: 'ignore' }); } catch { }
    state.synced[f.id] = { file, date: perthDate(f.createdTime || f.modifiedTime || Date.now()), place: folderName };
    downloaded++;
  }
  const entries = Object.entries(state.synced);
  if (entries.length > (cfg.max_photos || 200)) {
    entries.sort((a, b) => (a[1].date < b[1].date ? -1 : 1));
    const drop = entries.slice(0, entries.length - (cfg.max_photos || 200));
    for (const [id, rec] of drop) {
      await rm(path.join(ROOM_DIR, rec.file), { force: true });
      delete state.synced[id];
    }
  }
  await writeJson(STATE, state);
  const photos = Object.values(state.synced).map(rec => ({ url: '/local/frame-photos' + suffix + '/' + rec.file, date: rec.date, place: rec.place }));
  await writeFile(MANIFEST, 'window.FRAME_PHOTOS = ' + JSON.stringify({ photos, updated_at: new Date().toISOString() }) + ';\n');
  console.log('photos[' + room + ']: ' + images.length + ' image(s) in "' + folderName + '", ' + downloaded + ' downloaded, ' + photos.length + ' in manifest');
}

async function syncPhotos(cfg, tok, needsReauth) {
  // folders: { "Frame Photos": "living", "Frame Photos Alexa": "alexa", ... }
  // Missing folders log + skip; a legacy single-folder config still works.
  const folders = cfg.folders || { [cfg.frame_folder || cfg.frame_album || 'Frame Photos']: 'living' };
  for (const [name, room] of Object.entries(folders)) {
    await syncPhotosRoom(cfg, tok, needsReauth, name, room);
  }
}

async function sync(cfg) {
  const tokens = await readJson(TOKENS);
  const tok = await accessToken(cfg, tokens || {});
  const needsReauth = tok === null || (tok && tok.dead);
  if (needsReauth) {
    console.error('Google auth: refresh token missing or expired. Re-run: node sync.mjs authorize');
    console.error('(If the consent screen is in Testing mode, tokens die after 7 days - publish the app or re-authorize weekly.)');
  }
  let mail = [];
  if (!needsReauth) mail = await gmailUnread(tok);
  let starred = [];
  if (!needsReauth) starred = await gmailStarred(tok).catch(function () { return []; });
  await pushMail(cfg, mail, starred, needsReauth);
  await syncPhotos(cfg, tok || '', needsReauth);
}

async function status() {
  const tokens = await readJson(TOKENS);
  console.log('tokens: ' + (tokens ? 'present (access expires ' + (tokens.expires_at ? new Date(tokens.expires_at).toISOString() : '?') + ')' : 'NONE - run authorize'));
  const { stat: statFn } = await import('node:fs/promises');
  const entries = await readdir(WWW_PHOTOS).catch(() => []);
  const rooms = [];
  for (const e of entries) {
    try { if ((await statFn(path.join(WWW_PHOTOS, e))).isDirectory()) rooms.push(e); } catch { }
  }
  for (const room of rooms.length ? rooms : [null]) {
    const rn = room || 'living';
    const suffix = room ? '/' + room : '';
    const st = await readJson(path.join(DIR, 'state-' + rn + '.json'));
    let n = 0;
    try { n = (await readdir(WWW_PHOTOS + suffix)).filter(f => f.endsWith('.jpg')).length; } catch { }
    console.log('photos[' + rn + ']: tracked ' + (st ? Object.keys(st.synced).length : 0) + ', jpg files ' + n);
  }
}

main().catch(e => { console.error(e && e.stack || e); process.exit(1); });
