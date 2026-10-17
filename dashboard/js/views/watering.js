// Watering: the nine-zone front retic on a WaterCorp-compliant control surface.
// - Test runs go ONLY through the frame scripts capped at 120 s server-side.
// - Stop All and rain delay are hold-to-confirm.
// - The panel is a control surface; scheduling stays in HA/OpenSprinkler.
(function () {
  'use strict';
  var C = window.HACONFIG, HA = window.HA, V = {};

  function statusStrip() {
    var w = C.watering;
    var next = HA.state(w.nextRun), last = HA.state(w.lastRun);
    var bits = [];
    bits.push(HA.on(w.programRunning)
      ? '<span class="rz-bit is-run"><i class="pulse"></i>Program running now</span>'
      : (next ? '<span class="rz-bit">Next run <b>' + App.fmt.hour(new Date(next)) + '</b> ' + App.fmt.rel(new Date(next)) + '</span>' : '<span class="rz-bit">No run scheduled</span>'));
    if (last) bits.push('<span class="rz-bit">Last run ' + App.fmt.rel(new Date(last)) + '</span>');
    if (HA.on(w.rainDelayActive)) bits.push('<span class="rz-bit is-warn">Rain delay' + (HA.state(w.rainDelayUntil) && HA.state(w.rainDelayUntil) !== 'unknown' ? ' until ' + App.fmt.hour(new Date(HA.state(w.rainDelayUntil))) : '') + '</span>');
    if (HA.on(w.paused)) bits.push('<span class="rz-bit is-warn">Paused</span>');
    if (HA.on(w.weatherRestriction)) bits.push('<span class="rz-bit is-warn">Weather restriction</span>');
    if (HA.state(w.heatBoost) === 'active') bits.push('<span class="rz-bit is-boost">Heat boost armed</span>');
    if (HA.on(w.pumpRunning)) bits.push('<span class="rz-bit is-run">Pump running</span>');
    var lvl = HA.num(w.seasonalLevel);
    bits.push('<span class="rz-bit">Seasonal <b>' + (lvl !== null ? lvl : '--') + '%</b></span>');
    return '<div class="rz-strip">' + bits.join('') + '</div>';
  }

  function zoneTile(z) {
    var running = HA.on(z.run);
    var enabled = z.enabled ? HA.state(z.enabled) !== 'off' : true;
    return '<button class="rz-zone' + (running ? ' is-run' : '') + (enabled ? '' : ' is-off') + '" data-zone="' + z.n + '">' +
      '<span class="rz-n num">' + z.n + '</span>' +
      '<span class="rz-name">' + App.esc(z.name) + '</span>' +
      '<span class="rz-state">' + (running ? '<i class="pulse"></i>Running' : enabled ? 'Ready' : 'Disabled') + '</span>' +
      '<span class="rz-run">Hold to test 2 min</span>' +
      '</button>';
  }

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
      '<button class="rz-act rz-stop" data-act="stop">' + App.icon('x', 22) + 'Hold to stop all watering</button>' +
      '<button class="rz-act" data-act="rain">' + App.icon('drop', 22) + 'Hold to toggle rain delay</button>' +
      '<button class="rz-act rz-hold' + (HA.on(w.patioHold) ? ' is-on' : '') + '" data-act="patiohold">' + App.icon('clock', 22) + 'Patio hold ' + (HA.on(w.patioHold) ? 'ON' : 'off') + '</button>' +
      '</div><div class="rz-note">' + App.esc(C.watering.compliance) + '</div>';
  }

  function paint() {
    V.el.innerHTML = '<div class="retic-wrap">' +
      statusStrip() +
      '<div class="rz-zones">' + C.watering.zones.map(zoneTile).join('') + '</div>' +
      controls() +
      '<div class="card rz-soilcard"><div class="label">Soil moisture \u00B7 red at ' + C.watering.lowThreshold + '% or less</div>' + soilRow() + '</div>' +
      '</div>';
    bind();
  }

  function bind() {
    if (V.el._bound) return; V.el._bound = true;
    V.el.addEventListener('pointerdown', function (e) {
      var z = e.target.closest('[data-zone]');
      if (z) {
        App.hold(z, 1600, {
          enabled: function () { return true; },
          done: function () { testRun(+z.dataset.zone); },
          cancel: function () {}
        });
      }
      var stop = e.target.closest('[data-act="stop"]');
      if (stop) {
        App.hold(stop, 1600, {
          enabled: function () { return true; },
          done: function () { HA.callService(C.watering.actions.stopAll.service).then(ok('Watering stopped')).catch(fail()); },
          cancel: function () {}
        });
      }
      var rain = e.target.closest('[data-act="rain"]');
      if (rain) {
        App.hold(rain, 1600, {
          enabled: function () { return true; },
          done: function () { HA.callService(C.watering.actions.rainDelay.service).then(ok('Rain delay toggled')).catch(fail()); },
          cancel: function () {}
        });
      }
    });
    V.el.addEventListener('click', function (e) {
      var ph = e.target.closest('[data-act="patiohold"]');
      if (ph) {
        HA.callService(HA.on(C.watering.patioHold) ? 'input_boolean.turn_off' : 'input_boolean.turn_on', { entity_id: C.watering.patioHold });
      }
    });
    function ok(msg) { return function () { App.toast(msg, { icon: 'check' }); }; }
    function fail() { return function () { App.toast('Couldn\u2019t reach the controller', { tone: 'error', icon: 'bolt' }); }; }
  }

  function testRun(n) {
    var z = C.watering.zones[n - 1];
    if (!z) return;
    if (z.enabled && HA.state(z.enabled) === 'off') {
      App.toast('<b>' + App.esc(z.name) + '</b> is disabled', { tone: 'error', icon: 'bolt' });
      return;
    }
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

  App.register('watering', {
    show: function (el) { V.el = el; paint(); },
    resume: function () { if (V.el) paint(); }
  });
  App.on('data', function () { if (App.current === 'watering' && V.el) paint(); });
})();
