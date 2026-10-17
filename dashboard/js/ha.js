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
  function norm(id, o) {
    // get_states payload
    if (o && o.entity_id) return { state: o.state, attributes: o.attributes || {}, last_changed: o.last_changed };
    // subscribe_entities delta payload: { s, a, lc, lu }
    if (o && ('s' in o)) return { state: o.s, attributes: o.a || {}, last_changed: o.lc };
    return null;
  }
  function put(id, full) {
    var n = norm(id, full);
    if (n) HA.states[id] = n; else delete HA.states[id];
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
    return rest('/api/wine_cellar/wines?limit=500&include_buy_list=false&include_history=false').then(function (j) {
      HA.wine = j; HA.wineAt = Date.now(); return j;
    });
  };

  HA.calendarEvents = function (entityId, startISO, endISO) {
    // Demo payloads are REST-shaped, same as /api/calendars/<id> responses.
    if (HA.status === 'demo') return Promise.resolve(window.DEMO_PAYLOADS.calendarEvents || []);
    return rest('/api/calendars/' + entityId + '?start=' + encodeURIComponent(startISO) + '&end=' + encodeURIComponent(endISO));
  };

  // Photos manifest: the sync writes a JS file (window.FRAME_PHOTOS) because a
  // cross-origin <script> loads without CORS where a fetch() of JSON would not.
  HA.loadPhotos = function () {
    if (HA.status === 'demo') { HA.photos = window.DEMO_PAYLOADS.photos; return Promise.resolve(HA.photos); }
    if (!HA.url) return Promise.resolve(null); // no connection yet: skip the <script> probe
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      var done = false;
      function finish(v) { if (!done) { done = true; HA.photos = v; resolve(v); } }
      s.src = HA.url + C.photos.manifestPath + '?v=' + Date.now();
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
      if (m.type === 'event' && m.event && m.event.c) {
        for (var id in m.event.c) {
          var d = m.event.c[id];
          if (d['+']) { put(id, d['+']); touch(id); }
          else if (d['-']) { delete HA.states[id]; touch(id); }
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
      connect();
    }).catch(function () { bootDemo(); });

    function bootDemo() {
      var D = window.DEMO_STATES;
      HA.states = D ? D.states : {};
      setStatus('demo');
      if (window.DEMO_PAYLOADS) {
        App.setTime(15, 18); // demo default: a busy weekday afternoon
        setTimeout(function () { App.toast('Demo data \u00B7 no Home Assistant connection', { ms: 5000, icon: 'bolt' }); }, 900);
      }
      App.emit('data');
    }
  };

  // Run before the shell's first App.go so the landing view renders with
  // states already populated (demo loads synchronously, live starts async).
  HA.init();
})();
