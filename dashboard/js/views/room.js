// Room: profile-driven context view. Single-room profiles keep the two-column
// layout (aircon left, lights/chores right). Multi-room profiles (the living
// room frame's downstairs areas; the study frame + upstairs landing) render
// every listed room's controls on ONE page - aircon cards in a row, then all
// lights, then room extras (patio fan), then chores. No tabs: everything
// visible at once is the wall-display rule.
(function () {
  'use strict';
  var C = window.HACONFIG, HA = window.HA, V = {};

  function rooms() { return C.roomsFor ? C.roomsFor(C.frameId) : []; }

  // ------------------------------------------------------------ aircon: AirTouch zones
  function zoneCard(key) {
    var z = C.aircon.zones[key];
    var cur = HA.attr(z.climate, 'current_temperature');
    var tgt = HA.attr(z.climate, 'temperature');
    var vent = HA.attr(z.damper, 'current_position');
    var act = HA.attr(z.climate, 'hvac_action');
    var on = HA.state(z.climate) === 'fan_only';
    var un = HA.unavailable(z.climate);
    var cls = 'rm-ac' + (on ? ' is-on' : '') + (act === 'cooling' ? ' is-cooling' : '') + (act === 'heating' ? ' is-heating' : '') + (un ? ' rm-ac-unavailable' : '');
    return '<button class="' + cls + '" data-aczone="' + key + '">' +
      '<span class="rm-ac-temp num">' + (un ? '--' : cur !== null ? Math.round(cur) + '\u00B0' : '--') + '</span>' +
      '<span class="rm-ac-tgt">Target ' + (tgt !== null ? tgt + '\u00B0' : '--') + ' \u00B7 Vent ' + (vent !== null ? vent + '%' : '--') + '</span>' +
      '<span class="rm-ac-name">' + App.esc(z.name) + ' \u00B7 ' + (un ? 'Unavailable' : on ? 'Fan on' : 'Off') + '</span>' +
      '</button>';
  }

  function zoneSheet(key) {
    var z = C.aircon.zones[key];
    var cur = HA.attr(z.climate, 'current_temperature');
    var tgt = HA.attr(z.climate, 'temperature');
    var vent = HA.attr(z.damper, 'current_position');
    var on = HA.state(z.climate) === 'fan_only';
    var un = HA.unavailable(z.climate);
    var lo = HA.attr(z.climate, 'min_temp') || 16;
    var hi = HA.attr(z.climate, 'max_temp') || 32;
    var close = App.sheet(
      '<div class="ac-sheet">' +
      '<div class="label">Aircon \u00B7 ' + App.esc(z.name) + '</div>' +
      '<div class="ac-sheet-cur">Now <b class="num">' + (cur !== null ? cur + '\u00B0' : '--') + '</b>' + (un ? ' (unavailable)' : '') + '</div>' +
      '<div class="label">Target</div>' +
      '<div class="ac-steprow">' +
      '<button class="ac-stepbtn" data-zdec>' + App.icon('minus', 28) + '</button>' +
      '<span class="ac-stepval num">' + (tgt !== null ? tgt + '\u00B0' : '--') + '</span>' +
      '<button class="ac-stepbtn" data-zinc>' + App.icon('plus', 28) + '</button>' +
      '</div>' +
      '<div class="label">Vent (damper)</div>' +
      '<div class="ac-ventrow">' +
      [0, 25, 50, 75, 100].map(function (p) {
        return '<button class="ac-ventbtn' + (vent === p ? ' is-active' : '') + '" data-zvent="' + p + '">' + p + '%</button>';
      }).join('') +
      '</div>' +
      '<div class="ac-sheet-actions">' +
      '<button class="rz-act" data-zfan>' + (on ? 'Turn fan off' : 'Fan only on') + '</button>' +
      '<button class="rz-act rz-stop" data-closeac>Close</button>' +
      '</div></div>',
      {
        onMount: function (sheet) {
          var val = sheet.querySelector('.ac-stepval');
          var v = tgt || 21;
          function clampSet(d) {
            v = Math.max(lo, Math.min(hi, v + d));
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
          sheet.querySelector('[data-closeac]').addEventListener('click', close);
        }
      });
  }

  // ------------------------------------------------------------ aircon: standalone IR climate
  // The Front Lounge split system: real hvac modes (off/cool/heat), no damper.
  // The card shape mirrors the zone card; the sheet swaps vent presets for
  // mode buttons.
  function irCard(rm) {
    var cl = rm.climate;
    var cur = HA.attr(cl, 'current_temperature');
    var tgt = HA.attr(cl, 'temperature');
    var act = HA.attr(cl, 'hvac_action');
    var st = HA.state(cl);
    var un = HA.unavailable(cl);
    var on = !un && st !== 'off' && st !== null;
    var cls = 'rm-ac' + (on ? ' is-on' : '') + (act === 'cooling' ? ' is-cooling' : '') + (act === 'heating' ? ' is-heating' : '') + (un ? ' rm-ac-unavailable' : '');
    var label = un ? 'Unavailable' : !on ? 'Off' : (act === 'cooling' || act === 'heating' ? act[0].toUpperCase() + act.slice(1) : 'On');
    return '<button class="' + cls + '" data-irclim="' + cl + '">' +
      '<span class="rm-ac-temp num">' + (un ? '--' : cur !== null ? Math.round(cur) + '\u00B0' : '--') + '</span>' +
      '<span class="rm-ac-tgt">Target ' + (tgt !== null ? Math.round(tgt) + '\u00B0' : '--') + '</span>' +
      '<span class="rm-ac-name">' + App.esc(rm.name) + ' \u00B7 ' + label + '</span>' +
      '</button>';
  }

  function irSheet(rm) {
    var cl = rm.climate;
    var cur = HA.attr(cl, 'current_temperature');
    var tgt = HA.attr(cl, 'temperature');
    var st = HA.state(cl);
    var un = HA.unavailable(cl);
    var lo = HA.attr(cl, 'min_temp') || 16;
    var hi = HA.attr(cl, 'max_temp') || 30;
    var modes = HA.attr(cl, 'hvac_modes') || ['off', 'cool', 'heat'];
    var close = App.sheet(
      '<div class="ac-sheet">' +
      '<div class="label">Aircon \u00B7 ' + App.esc(rm.name) + '</div>' +
      '<div class="ac-sheet-cur">Now <b class="num">' + (cur !== null ? cur + '\u00B0' : '--') + '</b>' + (un ? ' (unavailable)' : '') + '</div>' +
      '<div class="label">Target</div>' +
      '<div class="ac-steprow">' +
      '<button class="ac-stepbtn" data-irdec>' + App.icon('minus', 28) + '</button>' +
      '<span class="ac-stepval num">' + (tgt !== null ? Math.round(tgt) + '\u00B0' : '--') + '</span>' +
      '<button class="ac-stepbtn" data-irinc>' + App.icon('plus', 28) + '</button>' +
      '</div>' +
      '<div class="label">Mode</div>' +
      '<div class="ac-ventrow">' +
      modes.map(function (m) {
        return '<button class="ac-ventbtn' + (st === m ? ' is-active' : '') + '" data-irmode="' + App.esc(m) + '">' +
          App.esc(m === 'off' ? 'Off' : m[0].toUpperCase() + m.slice(1)) + '</button>';
      }).join('') +
      '</div>' +
      '<div class="ac-sheet-actions">' +
      '<button class="rz-act rz-stop" data-closeir>Close</button>' +
      '</div></div>',
      {
        onMount: function (sheet) {
          var val = sheet.querySelector('.ac-stepval');
          var v = tgt || 21;
          function clampSet(d) {
            v = Math.max(lo, Math.min(hi, v + d));
            val.textContent = Math.round(v) + '\u00B0';
            HA.callService('climate.set_temperature', { entity_id: cl, temperature: Math.round(v) }).catch(function () {
              App.toast('Couldn\u2019t reach the aircon', { tone: 'error', icon: 'bolt' });
            });
          }
          sheet.querySelector('[data-irdec]').addEventListener('click', function () { clampSet(-1); });
          sheet.querySelector('[data-irinc]').addEventListener('click', function () { clampSet(1); });
          sheet.querySelectorAll('[data-irmode]').forEach(function (b) {
            b.addEventListener('click', function () {
              HA.callService('climate.set_hvac_mode', { entity_id: cl, hvac_mode: b.dataset.irmode }).catch(function () {
                App.toast('Couldn\u2019t reach the aircon', { tone: 'error', icon: 'bolt' });
              });
              sheet.querySelectorAll('[data-irmode]').forEach(function (x) { x.classList.remove('is-active'); });
              b.classList.add('is-active');
            });
          });
          sheet.querySelector('[data-closeir]').addEventListener('click', close);
        }
      });
  }

  // ------------------------------------------------------------ lights
  // Unavailable lights render as greyed dead tiles (same as the Lights view)
  // instead of being hidden, so the layout is stable and problems are visible.
  function lightTiles(list) {
    return list.map(function (l) {
      var on = HA.on(l.id);
      var un = HA.unavailable(l.id);
      var b = HA.attr(l.id, 'brightness');
      var lvl = b !== null && b !== undefined ? Math.round(b / 255 * 100) : null;
      return '<button class="tile tile--light' + (on ? ' is-on' : '') + (un ? ' is-dead' : '') + '" data-rmlight="' + l.id + '" style="--lvl:' + (on ? (lvl || 100) : 0) + '%">' +
        '<span class="tile-fill"></span>' +
        '<span class="tile-icon">' + App.icon('bulb', 30) + '</span>' +
        '<span class="tile-name">' + App.esc(l.name) + '</span>' +
        '<span class="tile-state num">' + (un ? 'Unreachable' : on ? (lvl !== null ? lvl + '%' : 'On') : 'Off') + '</span></button>';
    }).join('');
  }

  function lightsSection(list) {
    if (!list || !list.length) return '';
    return '<div class="rm-sec"><div class="label">Lights</div><div class="rm-lights">' + lightTiles(list) + '</div></div>';
  }

  // ------------------------------------------------------------ chores
  function choresSection(pids) {
    if (!pids || !pids.length) return '';
    var html = '<div class="rm-sec"><div class="label">Chores</div><div class="rm-chores">';
    var any = false;
    pids.forEach(function (pid) {
      var p = App.person(pid);
      var entityId = p.todo;
      if (!entityId || HA.unavailable(entityId)) return;
      var pending = HA.state(entityId);
      any = true;
      html += '<button class="rm-chore" data-go="tasks" style="' + App.pstyle(p) + '">' +
        App.avatar(p, 30) + '<b>' + p.name + '</b><span class="num">' + (pending !== null ? pending : '--') + '</span><small>to do</small></button>';
    });
    html += '</div></div>';
    return any ? html : '';
  }

  // ------------------------------------------------------------ patio fan
  // RF-driven via the Broadlink scripts; state mirrors are best-known only.
  function fanSection() {
    var P = C.patio;
    var fanPreset = HA.attr(P.fan.state, 'preset_mode');
    var fanOn = HA.on(P.fan.power) || (fanPreset !== null && fanPreset !== undefined);
    return '<div class="rm-sec"><div class="label">Fan <small>RF \u00B7 best-known state</small></div>' +
      '<div class="ac-ventrow">' +
      '<button class="ac-ventbtn' + (fanOn ? ' is-active' : '') + '" data-pfan="on">On</button>' +
      '<button class="ac-ventbtn' + (!fanOn ? ' is-active' : '') + '" data-pfan="off">Off</button>' +
      '<button class="ac-ventbtn" data-pfan="low">Low</button>' +
      '<button class="ac-ventbtn" data-pfan="medium">Medium</button>' +
      '<button class="ac-ventbtn" data-pfan="high">High</button>' +
      '<button class="ac-ventbtn" data-pfan="light">Light</button>' +
      '</div><div class="rm-fanstate">' + (fanOn ? 'Fan ' + (fanPreset || 'On') : 'Fan off') + '</div></div>';
  }

  // ------------------------------------------------------------ layouts
  function singlePaint(r) {
    var title = r ? r.name : (C.profile ? C.profile().name : 'Room');
    var lights = r ? (r.kind === 'patio' ? C.patio.lights : (r.lights || [])) : [];
    var right = lightsSection(lights);
    if (r && r.kind === 'patio') right += fanSection();
    else if (r) right += choresSection(r.chores);
    var left = '';
    if (r && r.aircon) left = zoneCard(r.aircon);
    else if (r && r.climate) { left = irCard(r); V.byClim = V.byClim || {}; V.byClim[r.climate] = r; }
    var twoCol = !!(r && r.aircon) && right !== '';
    if (!twoCol) { left = left + right; right = ''; }
    return '<div class="rm-wrap">' +
      '<div class="rm-head"><div class="label">Room</div><div class="serif rm-title">' + App.esc(title) + '</div></div>' +
      '<div class="rm-body' + (twoCol ? '' : ' rm-body--single') + '">' +
      '<div class="rm-left">' + left + '</div>' +
      (twoCol ? '<div class="rm-right">' + right + '</div>' : '') +
      '</div></div>';
  }

  function multiPaint(rs) {
    var byClim = {};
    var ac = [], lights = [], fan = '', chores = '';
    rs.forEach(function (rm) {
      if (rm.aircon) ac.push(zoneCard(rm.aircon));
      else if (rm.climate) { ac.push(irCard(rm)); byClim[rm.climate] = rm; }
      (rm.kind === 'patio' ? C.patio.lights : (rm.lights || [])).forEach(function (l) { lights.push(l); });
      if (rm.kind === 'patio') fan = fanSection();
      if (rm.chores && rm.chores.length) chores += choresSection(rm.chores);
    });
    V.byClim = byClim;
    var body = '';
    if (ac.length) body += '<div class="rm-sec"><div class="label">Aircon</div><div class="rm-acgrid">' + ac.join('') + '</div></div>';
    body += lightsSection(lights);
    body += fan + chores;
    var title = C.profile ? C.profile().name : 'Room';
    return '<div class="rm-wrap">' +
      '<div class="rm-head"><div class="label">Room</div><div class="serif rm-title">' + App.esc(title) + '</div></div>' +
      '<div class="rm-body rm-body--multi">' + body + '</div></div>';
  }

  function paint() {
    if (!V.el) return;
    var rs = rooms();
    V.el.innerHTML = rs.length > 1 ? multiPaint(rs) : singlePaint(rs[0] || null);
    bind();
  }

  function bind() {
    if (V.el._bound) return; V.el._bound = true;
    V.el.addEventListener('click', function (e) {
      var ac = e.target.closest('[data-aczone]');
      if (ac) { zoneSheet(ac.dataset.aczone); return; }
      var ir = e.target.closest('[data-irclim]');
      if (ir) { var rm = V.byClim && V.byClim[ir.dataset.irclim]; if (rm) irSheet(rm); return; }
      var l = e.target.closest('[data-rmlight]');
      if (l) {
        var domain = l.dataset.rmlight.split('.')[0];
        HA.callService(HA.on(l.dataset.rmlight) ? domain + '.turn_off' : domain + '.turn_on', { entity_id: l.dataset.rmlight }).catch(function () {
          App.toast('Couldn\u2019t reach <b>' + App.esc(HA.name(l.dataset.rmlight)) + '</b>', { tone: 'error', icon: 'bolt' });
        });
        return;
      }
      var f = e.target.closest('[data-pfan]');
      if (f) {
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
