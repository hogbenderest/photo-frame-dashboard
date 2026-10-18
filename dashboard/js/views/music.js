// Music: Spotify presets on the Sonos speakers. The selected speaker persists
// on this frame (localStorage); presets are plain-text rows in the HA "Music
// Presets" to-do list ("Name | spotify:playlist:..."), edited from any phone.
// Tap a tile to play on the selected speaker; transport + volume control it.
//
// Live-verified behaviours baked in (2026-10-18):
// - play_media with a spotify:playlist URI loads the queue, but a PAUSED Sonos
//   does not auto-start: always follow play_media with media_player.media_play.
// - The hero repaints on a signature of meaningful attributes, not on every
//   state push: Sonos emits media_position diffs about every second while
//   playing, and a full repaint per second would fight the volume slider.
(function () {
  'use strict';
  var C = window.HACONFIG, HA = window.HA, V = { el: null, items: null, sig: null, dragging: false };

  var SPOTIFY_LINK = /^https?:\/\/open\.spotify\.com\/(playlist|album|track|artist|episode|show)\//i;

  function byId(id) { for (var i = 0; i < C.music.speakers.length; i++) if (C.music.speakers[i].id === id) return C.music.speakers[i]; return null; }

  function selected() {
    var saved = null;
    try { saved = localStorage.getItem('music-speaker'); } catch (e) {}
    if (!saved || !byId(saved)) saved = C.music.defaultSpeaker;
    return saved;
  }

  // Preset rows: "Name | URI". Both spotify:* URIs and open.spotify.com links
  // are accepted (Sonos plays either; the docs use "playlist" type for URIs
  // and "music" for links). Tick a row on a phone to hide it from the frame.
  function parsePreset(it) {
    var t = String(it.summary || '').split('|');
    if (t.length < 2) return null;
    var name = t[0].trim();
    var uri = t.slice(1).join('|').trim();
    if (!name || !uri) return null;
    var isUri = uri.indexOf('spotify:') === 0;
    if (!isUri && !SPOTIFY_LINK.test(uri)) return null;
    return { name: name, uri: uri, isUri: isUri };
  }

  function presets() {
    var e = C.music.presets;
    if (HA.unavailable(e)) return null;
    if (V.items === null) return { loading: true, tiles: [], hidden: 0, bad: 0 };
    var out = [], hidden = 0, bad = 0;
    V.items.forEach(function (it) {
      if (it.status === 'completed') { hidden++; return; }
      var p = parsePreset(it);
      if (p) out.push(p); else bad++;
    });
    return { tiles: out, hidden: hidden, bad: bad };
  }

  function fetchPresets() {
    return HA.todoItems(C.music.presets).then(function (items) {
      V.items = items;
    }).catch(function () {
      V.items = V.items || [];
    });
  }

  // Artwork comes from the HA host; the proxy path embeds its own token.
  function artUrl(id) {
    var a = HA.attr(id, 'entity_picture');
    if (!a || !HA.url) return null;
    return a.indexOf('http') === 0 ? a : HA.url + a;
  }

  function stateLabel(s) {
    if (s === 'playing') return 'Playing';
    if (s === 'paused') return 'Paused';
    if (s === 'idle') return 'Idle';
    if (s === 'off') return 'Off';
    if (s === 'unavailable' || s === 'unknown' || s === null) return 'Unreachable';
    return s;
  }

  function sig() {
    var id = selected();
    var e = HA.get(id);
    var a = e ? e.attributes : {};
    return [HA.state(id), a.media_title, a.media_artist, a.media_album_name, a.entity_picture || '',
      a.volume_level, a.is_volume_muted, HA.state(C.music.presets), (V.items || []).length].join('|');
  }

  function speakerChip(s) {
    var id = s.id, sel = id === selected();
    var st = HA.state(id), un = HA.unavailable(id);
    var vol = HA.attr(id, 'volume_level');
    var sub = un ? 'Unreachable' : stateLabel(st) + (vol !== null && st !== 'off' ? ' \u00B7 ' + Math.round(vol * 100) + '%' : '');
    return '<button class="mu-chip' + (sel ? ' is-sel' : '') + (un ? ' is-dead' : '') + '" data-speaker="' + id + '"' + (un ? ' disabled' : '') + '>' +
      '<span class="mu-chip-dot' + (st === 'playing' ? ' is-live' : '') + '"></span>' +
      '<span class="mu-chip-names"><span class="mu-chip-name">' + App.esc(s.name) + '</span>' +
      '<span class="mu-chip-sub num">' + App.esc(sub) + '</span></span>' +
      '<small class="mu-chip-room">' + App.esc(s.room) + '</small>' +
      '</button>';
  }

  function hero() {
    var id = selected(), cfg = byId(id);
    var st = HA.state(id), un = HA.unavailable(id);
    var title = HA.attr(id, 'media_title');
    var artist = HA.attr(id, 'media_artist');
    var album = HA.attr(id, 'media_album_name');
    var vol = HA.attr(id, 'volume_level');
    var muted = HA.attr(id, 'is_volume_muted');
    var art = artUrl(id);
    var name = cfg ? cfg.name : id;
    var body;
    if (un) {
      body = '<div class="mu-empty">' + App.icon('volume', 44) +
        '<div class="serif">' + App.esc(name) + ' isn\u2019t reachable</div>' +
        '<small>Check the speaker is powered and on the network.</small></div>';
    } else if (!title) {
      body = '<div class="mu-empty">' + App.icon('music', 44) +
        '<div class="serif">Nothing playing</div>' +
        '<small>Tap a playlist to start it on ' + App.esc(name) + '.</small></div>';
    } else {
      body = '<div class="mu-np">' +
        '<div class="mu-art">' + (art ? '<img src="' + App.esc(art) + '" alt="" onerror="this.style.display=\'none\'">' : App.icon('music', 44)) + '</div>' +
        '<div class="mu-np-text">' +
        '<div class="mu-np-title serif">' + App.esc(title) + '</div>' +
        (artist ? '<div class="mu-np-artist">' + App.esc(artist) + '</div>' : '') +
        (album ? '<div class="mu-np-album">' + App.esc(album) + '</div>' : '') +
        '</div></div>';
    }
    var v = (vol === null || vol === undefined) ? 30 : Math.round(vol * 100);
    var shown = muted ? 0 : v;
    return '<div class="mu-hero' + (st === 'playing' ? ' is-live' : '') + '">' +
      '<div class="mu-hero-head"><span class="label">Now playing on ' + App.esc(name) + '</span>' +
      '<span class="pill' + (st === 'playing' ? ' pill--soon' : '') + '">' + App.esc(stateLabel(un ? 'unavailable' : st)) + '</span></div>' +
      body +
      '<div class="mu-transport">' +
      '<button class="mu-btn" data-ctrl="prev" aria-label="Previous track"' + (un ? ' disabled' : '') + '>' + App.icon('prev', 26) + '</button>' +
      '<button class="mu-btn mu-btn--main" data-ctrl="toggle" aria-label="Play or pause"' + (un ? ' disabled' : '') + '>' + App.icon(st === 'playing' ? 'pause' : 'play', 34) + '</button>' +
      '<button class="mu-btn" data-ctrl="next" aria-label="Next track"' + (un ? ' disabled' : '') + '>' + App.icon('next', 26) + '</button>' +
      '<button class="mu-btn" data-mute="1" aria-label="Mute"' + (un ? ' disabled' : '') + '>' + App.icon(muted ? 'x' : 'volume', 22) + '</button>' +
      '</div>' +
      '<div class="mu-vol' + (un ? ' is-dead' : '') + '">' +
      '<span class="mu-vol-ic">' + App.icon('volume', 18) + '</span>' +
      '<input type="range" min="0" max="100" step="5" value="' + shown + '" class="mu-range"' + (un ? ' disabled' : '') + '>' +
      '<span class="mu-vol-val num">' + shown + '%</span>' +
      '</div>' +
      '</div>';
  }

  function tile(p, i) {
    return '<button class="mu-tile" data-play="' + i + '">' +
      '<span class="mu-tile-top"><span class="mu-tile-icon">' + App.icon('music', 26) + '</span>' +
      '<span class="mu-tile-sub">Spotify</span></span>' +
      '<span class="mu-tile-name">' + App.esc(p.name) + '</span>' +
      '</button>';
  }

  function body() {
    var pr = presets();
    var tilesHtml;
    if (pr === null) {
      tilesHtml = '<div class="mu-empty">' + App.icon('music', 44) + '<div class="serif">Presets not set up</div>' +
        '<small>Create a <b>Music Presets</b> to-do list helper in HA (Settings \u203A Devices &amp; Services \u203A Helpers). ' +
        'Rows look like <b>Name | spotify:playlist:ID</b>.</small></div>';
    } else if (pr.loading) {
      tilesHtml = '<div class="mu-empty"><div class="serif">Loading\u2026</div></div>';
    } else if (!pr.tiles.length) {
      tilesHtml = '<div class="mu-empty">' + App.icon('music', 44) + '<div class="serif">No playlists yet</div>' +
        '<small>Add rows to the <b>Music Presets</b> list from any phone: <b>Name | spotify:playlist:ID</b>. ' +
        'Tick a row there to hide it here.</small></div>';
    } else {
      tilesHtml = '<div class="mu-grid">' + pr.tiles.map(tile).join('') + '</div>';
      if (pr.bad || pr.hidden) {
        var notes = [];
        if (pr.bad) notes.push(pr.bad + ' unreadable row' + (pr.bad > 1 ? 's' : ''));
        if (pr.hidden) notes.push(pr.hidden + ' hidden');
        tilesHtml += '<div class="mu-note">' + App.esc(notes.join(' \u00B7 ')) + '</div>';
      }
    }
    return '<div class="mu-top"><span class="label">Speaker</span><div class="mu-chips">' + C.music.speakers.map(speakerChip).join('') + '</div></div>' +
      '<div class="mu-main">' + hero() +
      '<div class="mu-presets"><span class="label">Playlists</span>' + tilesHtml +
      '<div class="mu-note mu-note--fixed">Playlists are the <b>Music Presets</b> list in the HA app: add <b>Name | spotify:playlist:ID</b> rows to change them.</div>' +
      '</div></div>';
  }

  function paint() {
    V.el.innerHTML = '<div class="music-wrap">' + body() + '</div>';
    V.sig = sig();
    bind();
  }

  function failToast() {
    App.toast('Couldn\u2019t reach <b>' + App.esc(HA.name(selected())) + '</b>', { tone: 'error', icon: 'bolt' });
  }

  function bind() {
    if (V.el._bound) return; V.el._bound = true;
    V.el.addEventListener('click', function (e) {
      var c = e.target.closest('[data-ctrl]');
      if (c) {
        var kind = c.dataset.ctrl;
        var svc = kind === 'prev' ? 'media_player.media_previous_track'
          : kind === 'next' ? 'media_player.media_next_track'
            : 'media_player.media_play_pause';
        HA.callService(svc, { entity_id: selected() }).catch(failToast);
        return;
      }
      if (e.target.closest('[data-mute]')) {
        var muted = HA.attr(selected(), 'is_volume_muted');
        HA.callService('media_player.volume_mute', { entity_id: selected(), is_volume_muted: !muted }).catch(failToast);
        return;
      }
      var s = e.target.closest('[data-speaker]');
      if (s && !s.disabled) {
        try { localStorage.setItem('music-speaker', s.dataset.speaker); } catch (e2) {}
        paint();
        return;
      }
      var p = e.target.closest('[data-play]');
      if (p) playIndex(+p.dataset.play);
    });
    V.el.addEventListener('pointerdown', function (e) { V.dragging = !!e.target.closest('.mu-range'); });
    V.el.addEventListener('pointerup', function () { V.dragging = false; });
    V.el.addEventListener('pointercancel', function () { V.dragging = false; });
    V.el.addEventListener('input', function (e) {
      if (e.target.classList && e.target.classList.contains('mu-range')) {
        V.el.querySelector('.mu-vol-val').textContent = e.target.value + '%';
      }
    });
    V.el.addEventListener('change', function (e) {
      if (!e.target.classList || !e.target.classList.contains('mu-range')) return;
      V.dragging = false;
      HA.callService('media_player.volume_set', { entity_id: selected(), volume_level: +e.target.value / 100 })
        .then(function () { V.sig = sig(); }) // adopt the pushed value; no repaint flash
        .catch(failToast);
    });
  }

  function playIndex(i) {
    var pr = presets();
    if (!pr || !pr.tiles[i]) return;
    var p = pr.tiles[i];
    var cfg = byId(selected());
    App.toast('Playing <b>' + App.esc(p.name) + '</b> on <b>' + App.esc(cfg ? cfg.name : selected()) + '</b>', { icon: 'music', ms: 2600 });
    HA.callService('media_player.play_media', {
      entity_id: selected(),
      media_content_id: p.uri,
      media_content_type: p.isUri ? 'playlist' : 'music',
      extra: { title: p.name }
    }).then(function () {
      // A paused Sonos loads the queue but does not start it (verified live):
      // media_play makes the tap deterministic.
      return HA.callService('media_player.media_play', { entity_id: selected() });
    }).catch(failToast);
  }

  App.register('music', {
    show: function (el) {
      V.el = el; paint();
      fetchPresets().then(function () { if (App.current === 'music' && V.el) paint(); });
    },
    resume: function () {
      if (V.el) {
        paint();
        fetchPresets().then(function () { if (App.current === 'music' && V.el) paint(); });
      }
    },
    hide: function () { V.dragging = false; }
  });
  App.on('data', function () {
    if (App.current !== 'music' || !V.el || V.dragging) return;
    if (sig() !== V.sig) paint();
  });
})();
