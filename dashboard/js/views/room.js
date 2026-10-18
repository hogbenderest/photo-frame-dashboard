// Room: the context-specific view. The frame's profile decides which room:
// the living frame's Room tab is the Patio; bedroom frames land here with
// their own aircon zone, lights and chores. Config-driven, one view for all.
(function () {
  'use strict';
  var C = window.HACONFIG, HA = window.HA, V = {};

  function room() { return C.roomFor ? C.roomFor(C.frameId) : null; }

  // ------------------------------------------------------------ aircon zone
  function zoneCard() {
    var r = room();
    if (!r || !r.aircon) return '';
    var z = C.aircon.zones[r.aircon];
    var cur = HA.attr(z.climate, 'current_temperature');
    var tgt = HA.attr(z.climate, 'temperature');
    var vent = HA.attr(z.damper, 'current_position');
    var act = HA.attr(z.climate, 'hvac_action');
    var on = HA.state(z.climate) === 'fan_only';
    return '<button class="rm-ac' + (on ? ' is-on' : '') + (act === 'cooling' ? ' is-cooling' : '') + (act === 'heating' ? ' is-heating' : '') + '" data-aczone="' + r.aircon + '">' +
      '<span class="rm-ac-temp num">' + (cur !== null ? Math.round(cur) : '--') + '\u00B0</span>' +
      '<span class="rm-ac-tgt">Target ' + (tgt !== null ? tgt + '\u00B0' : '--') + ' \u00B7 Vent ' + (vent !== null ? vent + '%' : '--') + '</span>' +
      '<span class="rm-ac-name">' + App.esc(z.name) + ' \u00B7 ' + (on ? 'Fan on' : 'Off') + '</span>' +
      '</button>';
  }

  function zoneSheet(key) {
    var z = C.aircon.zones[key];
    var cur = HA.attr(z.climate, 'current_temperature');
    var tgt = HA.attr(z.climate, 'temperature');
    var vent = HA.attr(z.damper, 'current_position');
    var on = HA.state(z.climate) === 'fan_only';
    var close = App.sheet(
      '<div class="ac-sheet">' +
      '<div class="label">Aircon \u00B7 ' + App.esc(z.name) + '</div>' +
      '<div class="ac-sheet-cur">Now <b class="num">' + (cur !== null ? cur + '\u00B0' : '--') + '</b></div>' +
      '<div class="label">Target</div>' +
      '<div class="ac-steprow">' +
      '<button class="ac-stepbtn" data-zdec>' + App.icon('minus', 22) + '</button>' +
      '<span class="ac-stepval num">' + (tgt !== null ? tgt + '\u00B0' : '--') + '</span>' +
      '<button class="ac-stepbtn" data-zinc>' + App.icon('plus', 22) + '</button>' +
      '</div>' +
      '<div class="label">Vent (damper)</div>' +
      '<div class="ac-ventrow">' +
      [0, 25, 50, 75, 100].map(function (p) {
        return '<button class="ac-ventbtn' + (vent === p ? ' is-active' : '') + '" data-zvent="' + p + '">' + p + '%</button>';
      }).join('') +
      '</div>' +
      '<div class="ac-sheet-actions">' +
      '<button class="rz-act" data-zfan>' + (on ? 'Turn fan off' : 'Fan only on') + '</button>' +
      '</div></div>',
      {
        onMount: function (sheet) {
          var val = sheet.querySelector('.ac-stepval');
          var v = tgt || 21;
          function clampSet(d) {
            v = Math.max(16, Math.min(32, v + d));
            val.textContent = v + '\u00B0';
            HA.callService('climate.set_temperature', { entity_id: z.climate, temperature: v });
          }
          sheet.querySelector('[data-zdec]').addEventListener('click', function () { clampSet(-1); });
          sheet.querySelector('[data-zinc]').addEventListener('click', function () { clampSet(1); });
          sheet.querySelectorAll('[data-zvent]').forEach(function (b) {
            b.addEventListener('click', function () {
              HA.callService('cover.set_cover_position', { entity_id: z.damper, position: +b.dataset.zvent });
              sheet.querySelectorAll('[data-zvent]').forEach(function (x) { x.classList.remove('is-active'); });
              b.classList.add('is-active');
            });
          });
          sheet.querySelector('[data-zfan]').addEventListener('click', function () {
            HA.callService('climate.set_hvac_mode', { entity_id: z.climate, hvac_mode: on ? 'off' : 'fan_only' });
            close();
          });
        }
      });
  }

  // ------------------------------------------------------------ lights
  function lightsSection() {
    var r = room();
    if (!r || !r.lights || !r.lights.length) return '';
    var avail = r.lights.filter(function (l) { return !HA.unavailable(l.id); });
    if (!avail.length) return '<div class="rm-sec rm-sec--empty"><div class="label">Lights</div><small>None reachable right now</small></div>';
    return '<div class="rm-sec"><div class="label">Lights</div><div class="rm-lights">' + avail.map(function (l) {
      var on = HA.on(l.id);
      var b = HA.attr(l.id, 'brightness');
      var lvl = b !== null && b !== undefined ? Math.round(b / 255 * 100) : null;
      return '<button class="tile tile--light' + (on ? ' is-on' : '') + '" data-rmlight="' + l.id + '" style="--lvl:' + (on ? (lvl || 100) : 0) + '%">' +
        '<span class="tile-fill"></span>' +
        '<span class="tile-icon">' + App.icon('bulb', 26) + '</span>' +
        '<span class="tile-name">' + App.esc(l.name) + '</span>' +
        '<span class="tile-state num">' + (on ? (lvl !== null ? lvl + '%' : 'On') : 'Off') + '</span></button>';
    }).join('') + '</div></div>';
  }

  // ------------------------------------------------------------ chores
  function choresSection() {
    var r = room();
    if (!r || !r.chores || !r.chores.length) return '';
    var html = '<div class="rm-sec"><div class="label">Chores</div><div class="rm-chores">';
    var any = false;
    r.chores.forEach(function (pid) {
      var p = App.person(pid);
      var entityId = p.todo;
      if (!entityId || HA.unavailable(entityId)) return;
      var items = (HA.attr(entityId, 'items') || []);
      // items aren't in attributes on live HA (fetched per-view by chores.js);
      // show the state count instead - enough for the room summary.
      var pending = HA.state(entityId);
      any = true;
      html += '<button class="rm-chore" data-go="tasks" style="' + App.pstyle(p) + '">' +
        App.avatar(p, 26) + '<b>' + p.name + '</b><span class="num">' + (pending !== null ? pending : '--') + '</span><small>to do</small></button>';
    });
    html += '</div></div>';
    return any ? html : '';
  }

  // ------------------------------------------------------------ patio variant
  function patioSection() {
    var r = room();
    if (!r || r.kind !== 'patio') return '';
    var P = C.patio;
    var lightsOn = HA.on(P.lights[0].id);
    var fanPreset = HA.attr(P.fan.state, 'preset_mode');
    var fanOn = HA.on(P.fan.power) || (fanPreset !== null && fanPreset !== undefined);
    return '<div class="rm-sec"><div class="label">Lights</div><div class="rm-lights">' +
      '<button class="tile tile--light' + (lightsOn ? ' is-on' : '') + '" data-rmlight="' + P.lights[0].id + '" style="--lvl:' + (lightsOn ? 100 : 0) + '%">' +
      '<span class="tile-fill"></span><span class="tile-icon">' + App.icon('bulb', 26) + '</span>' +
      '<span class="tile-name">' + App.esc(P.lights[0].name) + '</span>' +
      '<span class="tile-state num">' + (lightsOn ? 'On' : 'Off') + '</span></button></div></div>' +
      '<div class="rm-sec"><div class="label">Fan <small>RF \u00B7 best-known state</small></div>' +
      '<div class="ac-ventrow">' +
      '<button class="ac-ventbtn' + (fanOn ? ' is-active' : '') + '" data-pfan="on">On</button>' +
      '<button class="ac-ventbtn' + (!fanOn ? ' is-active' : '') + '" data-pfan="off">Off</button>' +
      '<button class="ac-ventbtn" data-pfan="low">Low</button>' +
      '<button class="ac-ventbtn" data-pfan="medium">Medium</button>' +
      '<button class="ac-ventbtn" data-pfan="high">High</button>' +
      '<button class="ac-ventbtn" data-pfan="light">Light</button>' +
      '</div><div class="rm-fanstate">' + (fanOn ? 'Fan ' + (fanPreset || 'On') : 'Fan off') + '</div></div>';
  }

  function paint() {
    if (!V.el) return;
    var r = room();
    var title = r ? r.name : (C.profile ? C.profile().name : 'Room');
    V.el.innerHTML = '<div class="rm-wrap">' +
      '<div class="rm-head"><div class="label">Room</div><div class="serif rm-title">' + App.esc(title) + '</div></div>' +
      '<div class="rm-grid">' +
      zoneCard() +
      patioSection() +
      lightsSection() +
      choresSection() +
      '</div></div>';
    bind();
  }

  function bind() {
    if (V.el._bound) return; V.el._bound = true;
    V.el.addEventListener('click', function (e) {
      var ac = e.target.closest('[data-aczone]');
      if (ac) { zoneSheet(ac.dataset.aczone); return; }
      var l = e.target.closest('[data-rmlight]');
      if (l) {
        HA.callService(HA.on(l.dataset.rmlight) ? 'light.turn_off' : 'light.turn_on', { entity_id: l.dataset.rmlight });
        return;
      }
      var f = e.target.closest('[data-pfan]');
      if (f) {
        // Always call the RF script regardless of mirror state (no feedback).
        HA.callScript(C.patio.fan.scripts[f.dataset.pfan]).catch(function () {
          App.toast('Fan command failed', { tone: 'error', icon: 'bolt' });
        });
        return;
      }
      var g = e.target.closest('[data-go]');
      if (g) App.go(g.dataset.go);
    });
  }

  App.register('room', {
    show: function (el) { V.el = el; paint(); },
    resume: function () { if (V.el) paint(); },
    hide: function () {}
  });
  App.on('data', function () { if (App.current === 'room' && V.el) paint(); });
})();
