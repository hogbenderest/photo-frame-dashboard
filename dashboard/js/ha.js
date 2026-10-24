// Live Home Assistant data layer for the frame dashboard.
//
// Connection model (docs/frame-dashboard.md has the full rationale):
// - The kiosk AssetServer serves /ha.json -> { url, token } on loopback ONLY.
//   The token never ships in the dashboard dist (the dist deploys to a public
//   Cloudflare Worker; ha.json is an APK asset that is not part of dist/).
// - WebSocket to ws://<ha>:8123/api/websocket with subscribe_entities over the
//   exact entity list from HACONFIG.allEntities(). REST for services, camera
//   stills, the wine inventory and calendar ranges (HA's /api sends CORS *).
// - No /ha.json (or ?demo=1) -> demo mode from js/ha-demo.js canned states.
(function () {
  'use strict';
  var C = window.HACONFIG;

  var HA = window.HA = {
    states: {}, status: 'boot', url: null, token: null, ws: null, msgId: 0,
    pending: {}, wine: null, wineAt: 0, photos: null, offlineSince: null
  };

  // ------------------------------------------------------------ store helpers
  function numToDate(x) {
    if (typeof x === 'number' && x > 0 && x < 1e11) return new Date(x * 1000).toISOString(); // epoch seconds -> ISO
    return x;
  }
  // Full state payload from get_states (entity_id, state, attributes, last_changed).
  function norm(id, o) {
    if (o && o.entity_id) return { state: o.state, attributes: o.attributes || {}, last_changed: numToDate(o.last_changed) };
    return null;
  }
  function put(id, full) {
    var n = norm(id, full);
    if (n) HA.states[id] = n; else delete HA.states[id];
  }
  // Compact subscribe_entities payload - PARTIAL by design: a change that only
  // moves an attribute arrives as {"lu":..., "c":..., "a": {"temperature": 21}}
  // with no "s" key, so it must MERGE into the stored entity, never replace it.
  function applyCompact(id, v) {
    var cur = HA.states[id];
    if (!cur) cur = HA.states[id] = { state: null, attributes: {}, last_changed: null };
    if (v.s !== undefined) cur.state = v.s;
    if (v.lc !== undefined) cur.last_changed = numToDate(v.lc);
    else if (v.lu !== undefined && cur.last_changed === null) cur.last_changed = numToDate(v.lu);
    if (v.a !== undefined) {
      var a = v.a;
      if (a['+'] !== undefined || a['-'] !== undefined) {
        // defensive: nested add/remove attribute form
        if (a['+']) { for (var k in a['+']) cur.attributes[k] = a['+'][k]; }
        if (a['-']) { (Array.isArray(a['-']) ? a['-'] : Object.keys(a['-'])).forEach(function (kk) { delete cur.attributes[kk]; }); }
      } else {
        for (var k2 in a) cur.attributes[k2] = a[k2]; // observed form: partial attr dict
      }
    }
  }

  HA.get = function (id) { return HA.states[id] || null; };
  HA.state = function (id) { var s = HA.states[id]; return s ? s.state : null; };
  HA.attr = function (id, k) { var s = HA.states[id]; return s ? (s.attributes[k] !== undefined ? s.attributes[k] : null) : null; };
  HA.name = function (id) { return HA.attr(id, 'friendly_name') || id; };
  HA.num = function (id) { var v = parseFloat(HA.state(id)); return isNaN(v) ? null : v; };
  HA.on = function (id) { return HA.state(id) === 'on'; };
  HA.off = function (id) { return HA.state(id) === 'off'; };
  HA.unavailable = function (id) { var s = HA.state(id); return s === null || s === 'unavailable' || s === 'unknown'; };
  HA.minsSince = function (id) {
    var s = HA.states[id]; if (!s || !s.last_changed) return null;
    var t = new Date(s.last_changed).getTime();
    return isNaN(t) ? null : Math.round((Date.now() - t) / 60000);
  };

  // Batch state changes, then let views repaint once (the shell's 'data' event
  // also re-builds hidden views in the background).
  var dirty = {}, dirtyTimer = null;
  function flush() {
    dirtyTimer = null;
    if (!Object.keys(dirty).length) return;
    dirty = {};
    App.emit('data');
  }
  function touch(id) {
    dirty[id] = true;
    if (id.indexOf('todo.') === 0 && HA.invalidateTodo) HA.invalidateTodo(id);
    if (!dirtyTimer) dirtyTimer = setTimeout(flush, 600);
  }

  // ------------------------------------------------------------ REST helpers
  function rest(path, opts) {
    opts = opts || {};
    var headers = { 'Authorization': 'Bearer ' + HA.token };
    if (opts.body) headers['Content-Type'] = 'application/json';
    return fetch(HA.url + path, {
      method: opts.body ? 'POST' : 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + path);
      return r.json();
    });
  }

  // Call a service. Returns the parsed response (HA returns a JSON body,
  // services with return_response include their data).
  HA.callService = function (service, data) {
    var parts = service.split('.');
    return rest('/api/services/' + parts[0] + '/' + parts[1], { body: data || {} });
  };
  HA.callScript = function (entityId, variables) {
    return HA.callService('script.turn_on', { entity_id: entityId, variables: variables || {} });
  };

  HA.cameraStill = function (entityId) {
    return fetch(HA.url + '/api/camera_proxy/' + entityId, {
      headers: { 'Authorization': 'Bearer ' + HA.token }
    }).then(function (r) {
      if (!r.ok) throw new Error('camera HTTP ' + r.status);
      return r.blob();
    });
  };

  HA.wineInventory = function (force) {
    if (!force && HA.wine && Date.now() - HA.wineAt < 3600e3) return Promise.resolve(HA.wine);
    if (HA.status === 'demo') { HA.wine = window.DEMO_PAYLOADS.wine; HA.wineAt = Date.now(); return Promise.resolve(HA.wine); }
    // Bare ?limit=500: include_* booleans are omitted (their defaults are what
    // we want) and cabinet_id must stay absent until the Cork Dork schema fix
    // is live (verified: cabinet_id=None used to 400 every bare call).
    return rest('/api/wine_cellar/wines?limit=500').then(function (j) {
      HA.wine = j; HA.wineAt = Date.now(); return j;
    });
  };

  // To-do items are NOT exposed in entity attributes on HA 2026.10; fetch them
  // through the response-returning service. Cached per entity and invalidated
  // whenever that entity's state changes (the item-count state is the dirty
  // signal; the WS delta triggers 'data' which clears the cache).
  // HA 2026.10 todo services are summary-based: update/remove take `item` (the
  // text, required) - there is no item_uid in this version's service schema.
  var todoCache = {};
  HA.todoItems = function (entityId) {
    if (HA.status === 'demo') {
      var st = HA.get(entityId);
      return Promise.resolve((st && st.attributes && st.attributes.items) || []);
    }
    if (todoCache[entityId]) return Promise.resolve(todoCache[entityId]);
    return fetch(HA.url + '/api/services/todo/get_items?return_response', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + HA.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_id: entityId, status: ['needs_action', 'completed'] })
    }).then(function (r) {
      if (!r.ok) throw new Error('todo.get_items HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      var items = (j.service_response && j.service_response[entityId] && j.service_response[entityId].items) || [];
      todoCache[entityId] = items;
      return items;
    });
  };
  HA.invalidateTodo = function (entityId) { delete todoCache[entityId]; };

  HA.calendarEvents = function (entityId, startISO, endISO) {
    // Demo payloads are REST-shaped, same as /api/calendars/<id> responses.
    if (HA.status === 'demo') return Promise.resolve(window.DEMO_PAYLOADS.calendarEvents || []);
    return rest('/api/calendars/' + entityId + '?start=' + encodeURIComponent(startISO) + '&end=' + encodeURIComponent(endISO));
  };

  // Photos manifest: the sync writes a JS file (window.FRAME_PHOTOS) because a
  // cross-origin <script> loads without CORS where a fetch() of JSON would not.
  // ---------------------------------------------------------------- photos
  // The manifest path is PROFILE-DRIVEN (per-frame Drive folder): living keeps
  // the legacy un-prefixed path; every other frame uses /<room>/. Resolved at
  // call time so it is always correct after ha.json lands (loadPhotos can only
  // succeed after HA.url exists, which is set in the same resolve step).
  HA.loadPhotos = function () {
    if (HA.status === 'demo') { HA.photos = window.DEMO_PAYLOADS.photos; return Promise.resolve(HA.photos); }
    if (!HA.url) return Promise.resolve(null); // no connection yet: skip the <script> probe
    var manifest = (C.profile && C.profile().photosManifest) || C.photos.manifestPath;
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      var done = false;
      function finish(v) { if (!done) { done = true; HA.photos = v; resolve(v); } }
      s.src = HA.url + manifest + '?v=' + Date.now();
      s.onload = function () { finish(window.FRAME_PHOTOS || null); };
      s.onerror = function () { finish(null); };
      setTimeout(function () { finish(HA.photos || null); }, 4000);
      document.head.appendChild(s);
    });
  };

  // ------------------------------------------------------------ websocket
  function send(msg) {
    msg.id = ++HA.msgId;
    HA.ws.send(JSON.stringify(msg));
    return msg.id;
  }

  // One-shot WS command (e.g. wine_cellar/get_cabinets). Resolves with the
  // command result; the pendingWS map is drained in ws.onmessage.
  HA.pendingWS = {};
  HA.callWS = function (type, data) {
    return new Promise(function (resolve, reject) {
      if (!HA.ws || HA.ws.readyState !== 1) { reject(new Error('websocket not open')); return; }
      var payload = Object.assign({}, data || {}, { id: ++HA.msgId, type: type });
      HA.pendingWS[payload.id] = { resolve: resolve, reject: reject };
      try { HA.ws.send(JSON.stringify(payload)); }
      catch (e) { delete HA.pendingWS[payload.id]; reject(e); }
    });
  };

  function setStatus(s) {
    if (HA.status === s) return;
    HA.status = s;
    if (s === 'live' || s === 'demo') HA.offlineSince = null;
    else if (!HA.offlineSince) HA.offlineSince = Date.now();
    App.emit('ha-status', s);
  }

  var retryTimer = null, retryDelay = 5000;
  function connect() {
    setStatus('connecting');
    var wsUrl = HA.url.replace(/^http/, 'ws') + '/api/websocket';
    var ws;
    try { ws = new WebSocket(wsUrl); } catch (e) { scheduleRetry(); return; }
    HA.ws = ws;
    var opened = false;

    ws.onmessage = function (ev) {
      var m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.type === 'auth_required') { ws.send(JSON.stringify({ type: 'auth', access_token: HA.token })); return; }
      if (m.type === 'auth_invalid') { setStatus('badtoken'); ws.close(); return; }
      if (m.type === 'auth_ok') {
        opened = true;
        retryDelay = 5000;
        send({ type: 'get_states' });
        return;
      }
      // One-shot WS commands (HA.callWS): resolve/reject by message id.
      if (m.type === 'result' && HA.pendingWS && HA.pendingWS[m.id]) {
        var p = HA.pendingWS[m.id];
        delete HA.pendingWS[m.id];
        if (m.success) p.resolve(m.result);
        else p.reject(new Error((m.error && m.error.message) || 'ws command failed'));
        return;
      }
      if (m.type === 'result' && m.success && m.result && Array.isArray(m.result)) {
        // get_states: keep only the entities we subscribe to
        var want = {};
        C.allEntities().forEach(function (id) { want[id] = true; });
        HA.states = {};
        m.result.forEach(function (o) { if (want[o.entity_id]) put(o.entity_id, o); });
        setStatus('live');
        App.emit('data');
        send({ type: 'subscribe_entities', entity_ids: Object.keys(want) });
        watchTakeovers();
        return;
      }
      if (m.type === 'event' && m.event && (m.event.a || m.event.c)) {
        var changes = m.event.a || m.event.c; // "a": initial snapshot; "c": diffs
        for (var id in changes) {
          var d = changes[id];
          if (m.event.a) { if (d) applyCompact(id, d); touch(id); continue; }
          // Change diff, HA 2026.10 compact format (captured live on-frame
          // 2026-10-18): d["+"] = {s, lu, lc, a:{...}} carries the new state
          // and added/changed attributes; d["-"] = {a: [name, ...]} lists
          // REMOVED ATTRIBUTES. A "-" key is NOT whole-entity removal: the
          // previous handler deleted the entity whenever "-" appeared, which
          // also dropped the paired "+" (the new state) - any transition that
          // removes attributes (e.g. playing -> idle) left the entity as a
          // state-null stub and the view showed a live speaker as Unreachable.
          if (d === '-') { delete HA.states[id]; touch(id); continue; } // entity removal form
          var add = d['+'];
          var rem = d['-'];
          if (add) applyCompact(id, add);
          if (rem && rem.a && HA.states[id]) rem.a.forEach(function (k) { delete HA.states[id].attributes[k]; });
          if (add || rem) touch(id);
        }
      }
    };
    ws.onopen = function () { /* auth handshake drives progress */ };
    ws.onclose = function () {
      HA.ws = null;
      if (HA.status === 'badtoken') return; // no point retrying a bad token
      setStatus('offline');
      scheduleRetry();
    };
    ws.onerror = function () { if (!opened) { setStatus('offline'); } };

    function scheduleRetry() {
      clearTimeout(retryTimer);
      retryTimer = setTimeout(connect, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 60000);
    }
  }

  // Full-screen takeovers for the two events that matter on a wall display.
  function watchTakeovers() {
    watch('binary_sensor.front_door_cam_visitor');
    watch('binary_sensor.front_door_cam_person');
    watch('binary_sensor.water_leak_detected');
    function watch(id) {
      if (HA.states[id] && HA.on(id) && App.doorbell) App.doorbell(id);
    }
    App.on('data', function () {
      var visitor = HA.on('binary_sensor.front_door_cam_visitor') || HA.on('binary_sensor.front_door_cam_person');
      if (visitor && App.doorbell && App.mode === 'day' && App.current !== 'cameras') App.doorbell('binary_sensor.front_door_cam_visitor');
      if (HA.on('binary_sensor.water_leak_detected') && App.alert) App.alert('water');
    });
  }

  // ------------------------------------------------------------ boot
  HA.init = function () {
    var q = new URLSearchParams(location.search);
    var demo = q.has('demo');
    if (demo) return bootDemo();
    fetch('/ha.json').then(function (r) {
      if (!r.ok) throw new Error('no ha.json');
      return r.json();
    }).then(function (cfg) {
      if (!cfg || !cfg.url || !cfg.token) return bootDemo();
      HA.url = cfg.url.replace(/\/$/, '');
      HA.token = cfg.token;
      if (cfg.frame && typeof cfg.frame === 'string') C.frameId = cfg.frame; // profile identity
      // Landing correction: App.start may have navigated before ha.json
      // resolved (defaulting to 'living'). If this frame's profile says the
      // landing view differs and the user hasn't navigated yet, honor it.
      // The hash check accepts '#home' because that's the default landing,
      // not a user navigation.
      var prof = C.profile();
      if (prof.landing !== 'home' && (location.hash === '' || location.hash === '#home') && (App.current === 'home' || App.current === null)) {
        App.go(prof.landing);
      }
      connect();
    }).catch(function () { bootDemo(); });

    function bootDemo() {
      var D = window.DEMO_STATES;
      HA.states = D ? D.states : {};
      setStatus('demo');
      if (window.DEMO_PAYLOADS) {
        // Demo default: a busy weekday afternoon - DESKTOP DEV ONLY. On a
        // real frame the fake clock is wrong on a wall display, and its
        // fixed offset bakes against the pre-NTP boot clock then inherits
        // the whole NTP step when sync lands (the "9:56pm" incident). The
        // frame shows the true system time; only dev browsers get 15:18.
        if (!/Android/.test(navigator.userAgent)) App.setTime(15, 18);
        setTimeout(function () { App.toast('Demo data \u00B7 no Home Assistant connection', { ms: 5000, icon: 'bolt' }); }, 900);
      }
      App.emit('data');
    }
  };

  // Run before the shell's first App.go so the landing view renders with
  // states already populated (demo loads synchronously, live starts async).
  HA.init();
})();
