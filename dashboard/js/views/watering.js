// Watering: the nine-zone front retic on a WaterCorp-compliant control surface,
// led by the property map. The map geometry ships with the APK
// (/retic/zone_polygons.json + layout.jpg, extracted from the known-good HA
// Watering dashboard clip-paths; render order is load-bearing - see gotcha 3).
// - Test runs go ONLY through the frame scripts capped at 120 s server-side.
// - Per-zone stop: stations via opensprinkler.stop (per-station verified),
//   patio valves via switch.turn_off (their auto-off automations untouched).
// - Stop All and rain delay are hold-to-confirm.
// - The panel is a control surface; scheduling stays in HA/OpenSprinkler.
(function () {
  'use strict';
  var C = window.HACONFIG, HA = window.HA, V = { zones: null, mapBound: false };

  function zoneRunning(z) { return HA.on(z.run); }
  function zoneEnabled(z) { return z.enabled ? HA.state(z.enabled) !== 'off' : true; }

  function statusStrip() {
    var w = C.watering;
    var next = HA.state(w.nextRun), last = HA.state(w.lastRun);
    var bits = [];
    bits.push(HA.on(w.programRunning)
      ? '<span class="rz-bit is-run"><i class="pulse"></i>Program running now</span>'
      : (next ? '<span class="rz-bit">Next <b>' + App.fmt.hour(new Date(next)) + '</b> ' + App.fmt.rel(new Date(next)) + '</span>' : '<span class="rz-bit">No run scheduled</span>'));
    if (HA.on(w.rainDelayActive)) bits.push('<span class="rz-bit is-warn">Rain delay' + (HA.state(w.rainDelayUntil) && HA.state(w.rainDelayUntil) !== 'unknown' ? ' until ' + App.fmt.hour(new Date(HA.state(w.rainDelayUntil))) : '') + '</span>');
    if (HA.on(w.paused)) bits.push('<span class="rz-bit is-warn">Paused</span>');
    if (HA.on(w.weatherRestriction)) bits.push('<span class="rz-bit is-warn">Weather restriction</span>');
    if (HA.state(w.heatBoost) === 'active') bits.push('<span class="rz-bit is-boost">Heat boost armed</span>');
    if (HA.on(w.pumpRunning)) bits.push('<span class="rz-bit is-run">Pump running</span>');
    bits.push('<span class="rz-bit">Seasonal <b>' + HA.num(w.seasonalLevel) + '%</b></span>');
    return '<div class="rz-strip">' + bits.join('') + '</div>';
  }

  // ------------------------------------------------------------ the map
  function svgPath(pts) {
    return 'M' + pts.map(function (p) { return p[0] + ' ' + p[1]; }).join(' L ') + ' Z';
  }
  function centroid(pts) {
    var x = 0, y = 0;
    pts.forEach(function (p) { x += p[0]; y += p[1]; });
    return [Math.round(x / pts.length), Math.round(y / pts.length)];
  }

  function buildMap() {
    if (!V.zones || !V.el) return;
    var holder = V.el.querySelector('.rz-svg');
    if (!holder || holder.firstChild) return;
    var C6 = C.watering.map;
    var svg = '<svg class="rz-svgel" viewBox="0 0 1346 1169" preserveAspectRatio="xMidYMid meet">' +
      '<image href="' + C6.layout + '" x="0" y="0" width="1346" height="1169" alt=""></image>';
    // Load-bearing order: each zone renders as one <g> (all its polygons),
    // zones in C.watering.map.order so hedge loops sit below the lawns.
    C.watering.map.order.forEach(function (n) {
      var z = V.zones[n];
      if (!z) return;
      var paths = z.polygons.map(function (p) { return '<path d="' + svgPath(p) + '"></path>'; }).join('');
      var c = centroid(z.polygons[0]);
      svg += '<g class="rz-pz" data-zone="' + n + '">' + paths +
        '<text class="rz-pzn num" x="' + c[0] + '" y="' + (c[1] + 18) + '" text-anchor="middle">' + n + '</text></g>';
    });
    svg += '</svg>';
    holder.innerHTML = svg;
    bindMap();
    paintMapStates();
  }

  function paintMapStates() {
    if (!V.el || !V.zones) return;
    var C9 = C.watering;
    C.watering.map.order.forEach(function (n) {
      var g = V.el.querySelector('.rz-pz[data-zone="' + n + '"]');
      if (!g) return;
      var z = V.zones[n];
      if (!z) return;
      var conf = C9.zones[n - 1];
      var run = HA.on(conf.run);
      var dis = conf.enabled && HA.state(conf.enabled) === 'off';
      g.classList.toggle('is-run', run);
      g.classList.toggle('is-off', !run && dis);
    });
  }

  function zoneStateLine(z) {
    var bits = [];
    if (zoneRunning(z)) bits.push('<b class="is-run-text">Running now</b>');
    else if (!zoneEnabled(z)) bits.push('Disabled (station switched off)');
    else bits.push('Ready');
    if (HA.on(C.watering.rainDelayActive)) bits.push('rain delay');
    if (HA.on(C.watering.paused)) bits.push('paused');
    return bits.join(' \u00B7 ');
  }

  function zoneSheet(n) {
    var z = C.watering.zones[n - 1];
    if (!z) return;
    var running = zoneRunning(z);
    var canRun = zoneEnabled(z) && !(z.kind === 'valve' && running);
    var close = App.sheet(
      '<div class="rz-sheet">' +
      '<div class="label">Zone ' + n + '</div>' +
      '<div class="serif rz-sheet-name">' + App.esc(z.name) + '</div>' +
      '<div class="rz-sheet-state">' + zoneStateLine(z) + '</div>' +
      '<div class="rz-sheet-actions">' +
      '<button class="rz-act rz-test" data-sheet-run="' + n + '"' + (canRun ? '' : ' disabled') + '>' + App.icon('play', 22) + 'Hold to test run \u00B7 2 min cap</button>' +
      (running ? '<button class="rz-act rz-stop" data-sheet-stop="' + n + '">' + App.icon('x', 22) + 'Stop this zone</button>' : '') +
      '<button class="rz-act" data-sheet-stopall>' + App.icon('x', 22) + 'Hold to stop all watering</button>' +
      '</div>' +
      '<div class="rz-note">' + App.esc(C.watering.compliance) + '</div>' +
      '</div>',
      {
        onMount: function (sheet) {
          var run = sheet.querySelector('[data-sheet-run]');
          if (run) App.hold(run, 1600, {
            enabled: function () { return !run.disabled; },
            done: function () { testRun(n); close(); },
            cancel: function () {}
          });
          var stop = sheet.querySelector('[data-sheet-stop]');
          if (stop) stop.addEventListener('click', function () { stopZone(n); close(); });
          var sa = sheet.querySelector('[data-sheet-stopall]');
          App.hold(sa, 1600, {
            enabled: function () { return true; },
            done: function () { HA.callService(C.watering.actions.stopAll.service); close(); },
            cancel: function () {}
          });
        }
      });
  }

  function testRun(n) {
    var z = C.watering.zones[n - 1];
    if (!z) return;
    if (!zoneEnabled(z)) { App.toast('<b>' + App.esc(z.name) + '</b> is disabled', { tone: 'error', icon: 'bolt' }); return; }
    var svc = z.kind === 'station' ? C.watering.actions.testZone : C.watering.actions.testValve;
    var vars = {};
    vars[z.kind === 'station' ? 'station' : 'valve'] = z.station;
    vars.duration = 120;
    HA.callScript(svc, vars).then(function () {
      App.toast('Test run started on <b>' + App.esc(z.name) + '</b> \u00B7 2 min cap', { icon: 'drop' });
    }).catch(function () {
      App.toast('Couldn\u2019t start <b>' + App.esc(z.name) + '</b>', { tone: 'error', icon: 'bolt' });
    });
  }

  function stopZone(n) {
    var z = C.watering.zones[n - 1];
    if (!z) return;
    var p;
    if (z.kind === 'station') p = HA.callService(C.watering.actions.stopStation, { entity_id: z.station });
    else p = HA.callService('switch.turn_off', { entity_id: z.station });
    p.then(function () {
      App.toast('<b>' + App.esc(z.name) + '</b> stopped', { icon: 'check' });
    }).catch(function () {
      App.toast('Couldn\u2019t stop <b>' + App.esc(z.name) + '</b>', { tone: 'error', icon: 'bolt' });
    });
  }

  // ------------------------------------------------------------ side column
  function soilRow() {
    return '<div class="rz-soil">' + C.watering.soil.map(function (m) {
      var v = HA.num(m.id);
      var low = v !== null && v <= C.watering.lowThreshold;
      return '<div class="rz-meter' + (low ? ' is-low' : '') + (v === null ? ' is-empty' : '') + '">' +
        '<span class="rz-meter-name">' + App.esc(m.name) + '</span>' +
        '<span class="rz-meter-bar" style="--v:' + (v !== null ? Math.max(4, Math.min(100, v)) : 0) + '%"></span>' +
        '<span class="rz-meter-val num">' + (v !== null ? Math.round(v) + '%' : '--') + '</span>' +
        '</div>';
    }).join('') + '</div>';
  }

  function controls() {
    var w = C.watering;
    return '<div class="rz-actions">' +
      '<button class="rz-act rz-stop" data-act="stop">' + App.icon('x', 20) + 'Hold to stop all</button>' +
      '<button class="rz-act" data-act="rain">' + App.icon('drop', 20) + 'Rain delay</button>' +
      '<button class="rz-act rz-hold' + (HA.on(w.patioHold) ? ' is-on' : '') + '" data-act="patiohold">' + App.icon('clock', 20) + 'Patio hold ' + (HA.on(w.patioHold) ? 'ON' : 'off') + '</button>' +
      '</div>';
  }

  function paint() {
    // Status + controls repaint; the map SVG is built once and only its
    // classes update (paintMapStates) - rebuilding per data event would
    // thrash the A7 and cancel holds mid-press.
    if (!V.el) return;
    V.el.querySelector('.rz-strip-slot').innerHTML = statusStrip();
    V.el.querySelector('.rz-actions-slot').innerHTML = controls();
    V.el.querySelector('.rz-soil-slot').innerHTML = soilRow();
    paintMapStates();
    bindActions();
  }

  function bindActions() {
    var a = V.el.querySelector('.rz-actions-slot');
    if (!a || a._bound) return; a._bound = true;
    a.addEventListener('pointerdown', function (e) {
      var stop = e.target.closest('[data-act="stop"]');
      if (stop) App.hold(stop, 1600, {
        enabled: function () { return true; },
        done: function () { HA.callService(C.watering.actions.stopAll.service); },
        cancel: function () {}
      });
      var rain = e.target.closest('[data-act="rain"]');
      if (rain) App.hold(rain, 1600, {
        enabled: function () { return true; },
        done: function () { HA.callService(C.watering.actions.rainDelay.service); },
        cancel: function () {}
      });
    });
    a.addEventListener('click', function (e) {
      var ph = e.target.closest('[data-act="patiohold"]');
      if (ph) HA.callService(HA.on(C.watering.patioHold) ? 'input_boolean.turn_off' : 'input_boolean.turn_on', { entity_id: C.watering.patioHold });
    });
  }

  function bindMap() {
    var holder = V.el.querySelector('.rz-map');
    if (!holder || holder._bound) return; holder._bound = true;
    holder.addEventListener('click', function (e) {
      var g = e.target.closest('.rz-pz');
      if (g) zoneSheet(+g.dataset.zone);
    });
    holder.addEventListener('pointerdown', function (e) {
      var g = e.target.closest('.rz-pz');
      if (!g) return;
      App.hold(g, 1800, {
        enabled: function () { return true; },
        done: function () { testRun(+g.dataset.zone); },
        cancel: function () {}
      });
    });
  }

  function skeleton() {
    return '<div class="retic-wrap retic-wrap--map">' +
      '<div class="rz-map"><div class="rz-svg"></div>' +
      '<div class="rz-map-note">Tap a zone for actions \u00B7 hold to test run (2 min cap)</div></div>' +
      '<div class="rz-side">' +
      '<div class="rz-strip-slot"></div>' +
      '<div class="rz-actions-slot"></div>' +
      '<div class="card rz-soilcard"><div class="label">Soil moisture \u00B7 red at ' + C.watering.lowThreshold + '% or less</div><div class="rz-soil-slot"></div></div>' +
      '</div>' +
      '</div>';
  }

  App.register('watering', {
    show: function (el) {
      V.el = el;
      if (!el.firstChild) {
        el.innerHTML = skeleton();
        el.addEventListener('click', function (e) {
          var g = e.target.closest('[data-go]');
          if (g) App.go(g.dataset.go);
        });
      }
      if (!V.zones) {
        fetch(C.watering.map.polygons).then(function (r) { return r.json(); }).then(function (j) {
          V.zones = j.zones;
          buildMap();
        }).catch(function () {
          V.el.querySelector('.rz-svg').innerHTML = '<div class="cl-empty">Map data missing</div>';
        });
      } else buildMap();
      paint();
    },
    resume: function () { if (V.el) { buildMap(); paint(); } },
    hide: function () {}
  });
  App.on('data', function () { if (App.current === 'watering' && V.el) paint(); });
})();
