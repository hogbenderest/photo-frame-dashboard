// Aircon: the AirTouch5 system as laid out in the HA "Aircon" dashboard -
// whole-house target, two units, 10 zone climates + dampers.
// - Whole house: setting the helper only; the user's automation fans it out
//   (one setpoint per second - AirTouch drops rapid bursts).
// - Zone sheets: setpoint, fan on/off, vent position. Unit sheets: HVAC mode,
//   fan speed, setpoint. All via standard climate/cover services.
(function () {
  'use strict';
  var C = window.HACONFIG, HA = window.HA, V = {};

  function unitState(unit) { return HA.state(unit.id); }
  function unitOn(unit) { var s = unitState(unit); return s !== null && s !== 'off' && s !== 'unavailable' && s !== 'unknown'; }
  function zTemp(zone) { return HA.attr(zone.climate, 'current_temperature'); }
  function zTarget(zone) { return HA.attr(zone.climate, 'temperature'); }
  function zVent(zone) { return HA.attr(zone.damper, 'current_position'); }
  function zAction(zone) { return HA.attr(zone.climate, 'hvac_action'); }
  function zOn(zone) { var s = HA.state(zone.climate); return s === 'fan_only'; }

  // ------------------------------------------------------------ header strip
  function header() {
    var wh = HA.num(C.aircon.wholeHouse);
    var units = C.aircon.units.map(function (u) {
      var on = unitOn(u);
      var tgt = HA.attr(u.id, 'temperature');
      var cur = HA.attr(u.id, 'current_temperature');
      return '<button class="ac-unit' + (on ? ' is-on' : '') + '" data-unit="' + u.id + '">' +
        '<b>' + u.name + '</b>' +
        '<span class="ac-unit-mode">' + (on ? unitState(u) : 'Off') + '</span>' +
        '<span class="ac-unit-t num">' + (tgt !== null ? tgt + '\u00B0' : '--') +
        (cur !== null ? ' <small>' + cur + '\u00B0 in</small>' : '') + '</span></button>';
    }).join('');
    return '<div class="ac-head">' +
      '<button class="ac-wholehouse" data-wholehouse="1">' +
      '<span class="label">Whole house</span>' +
      '<span class="ac-wh-big num">' + (wh !== null ? wh : '--') + '\u00B0</span>' +
      '<small>Tap to set everywhere</small></button>' +
      '<div class="ac-units">' + units + '</div>' +
      '</div>';
  }

  // ------------------------------------------------------------ zone grid
  function zoneCard(key) {
    var z = C.aircon.zones[key];
    var cur = zTemp(z), tgt = zTarget(z), vent = zVent(z);
    var act = zAction(z);
    var unit = C.aircon.units.filter(function (u) { return u.zones.indexOf(key) >= 0; })[0];
    var uOn = unit ? unitOn(unit) : false;
    var cls = 'ac-zone' + (zOn(z) ? ' is-on' : '') + (act === 'cooling' ? ' is-cooling' : '') + (act === 'heating' ? ' is-heating' : '');
    return '<button class="' + cls + '" data-zone="' + key + '">' +
      '<span class="ac-z-name">' + App.esc(z.name) + '</span>' +
      '<span class="ac-z-cur num">' + (cur !== null ? Math.round(cur) : '--') + '\u00B0</span>' +
      '<span class="ac-z-tgt">' + (tgt !== null ? 'to ' + tgt + '\u00B0' : '--') + '</span>' +
      '<span class="ac-z-vent' + (uOn ? '' : ' is-mute') + '">' + App.icon('sliders', 16) +
      (vent !== null ? ' Vent ' + vent + '%' : '') + '</span>' +
      '</button>';
  }

  function groups() {
    return C.aircon.units.map(function (u) {
      return '<div class="ac-group"><div class="label">' + u.name + ' unit</div>' +
        '<div class="ac-gz">' + u.zones.map(zoneCard).join('') + '</div></div>';
    }).join('');
  }

  // ------------------------------------------------------------ sheets
  function stepBtns(prefix, val, opts) {
    return '<div class="ac-steprow">' +
      '<button class="ac-stepbtn" data-' + prefix + 'dec="' + (val - opts.step) + '">' + App.icon('minus', 22) + '</button>' +
      '<span class="ac-stepval num">' + (val !== null ? val + '\u00B0' : '--') + '</span>' +
      '<button class="ac-stepbtn" data-' + prefix + 'inc="' + (val + opts.step) + '">' + App.icon('plus', 22) + '</button>' +
      '</div>';
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function wholeHouseSheet() {
    var cur = HA.num(C.aircon.wholeHouse) || 21;
    var lo = HA.attr(C.aircon.wholeHouse, 'min') || 16;
    var hi = HA.attr(C.aircon.wholeHouse, 'max') || 30;
    var st = HA.attr(C.aircon.wholeHouse, 'step') || 1;
    var close = App.sheet(
      '<div class="ac-sheet">' +
      '<div class="label">Whole house</div>' +
      '<div class="serif ac-sheet-name">Set every zone at once</div>' +
      stepBtns('wh', cur, { step: st }) +
      '<div class="ac-note">Applies to both units and all 10 zones automatically, one per second (AirTouch console drops bursts). Power and modes are not changed.</div>' +
      '</div>',
      {
        onMount: function (sheet) {
          var val = sheet.querySelector('.ac-stepval');
          var v = cur;
          function set(delta) {
            v = clamp(v + delta, lo, hi);
            val.textContent = v + '\u00B0';
          }
          function apply() {
            if (v !== cur) {
              HA.callService('input_number.set_value', { entity_id: C.aircon.wholeHouse, value: v });
              App.toast('Whole house set to <b>' + v + '\u00B0</b> - applying to all zones', { icon: 'thermo' });
            }
            close();
          }
          sheet.querySelector('[data-whdec]').addEventListener('click', function () { set(-st); });
          sheet.querySelector('[data-whinc]').addEventListener('click', function () { set(st); });
          // Apply on close-behaviour: the scrim tap. Simplest: a Set button.
          var b = document.createElement('button');
          b.className = 'rz-act ac-apply';
          b.innerHTML = App.icon('check', 22) + 'Set ' + v + '\u00B0 everywhere';
          b.addEventListener('click', apply);
          sheet.appendChild(b);
        }
      });
  }

  function zoneSheet(key) {
    var z = C.aircon.zones[key];
    var cur = zTemp(z), tgt = zTarget(z), vent = zVent(z);
    var close = App.sheet(
      '<div class="ac-sheet">' +
      '<div class="label">Zone</div>' +
      '<div class="serif ac-sheet-name">' + App.esc(z.name) + '</div>' +
      '<div class="ac-sheet-cur">Now <b class="num">' + (cur !== null ? cur + '\u00B0' : '--') + '</b></div>' +
      '<div class="label">Target</div>' + stepBtns('zt', tgt, { step: 1 }) +
      '<div class="label">Vent (damper)</div>' +
      '<div class="ac-ventrow">' +
      [0, 25, 50, 75, 100].map(function (p) {
        return '<button class="ac-ventbtn' + (vent === p ? ' is-active' : '') + '" data-vent="' + p + '">' + p + '%</button>';
      }).join('') +
      '</div>' +
      '<div class="ac-sheet-actions">' +
      '<button class="rz-act" data-fan>' + (zOn(z) ? 'Turn fan off' : 'Fan only on') + '</button>' +
      '<button class="rz-act rz-stop" data-closeac>Close</button>' +
      '</div>' +
      '</div>',
      {
        onMount: function (sheet) {
          var val = sheet.querySelector('.ac-stepval');
          var v = tgt;
          var zlo = HA.attr(z.climate, 'min_temp') || 16;
          var zhi = HA.attr(z.climate, 'max_temp') || 32; // Downstairs zones: 16-30
          sheet.querySelector('[data-ztdec]').addEventListener('click', function () {
            v = clamp(v - 1, zlo, zhi); val.textContent = v + '\u00B0';
            HA.callService('climate.set_temperature', { entity_id: z.climate, temperature: v });
          });
          sheet.querySelector('[data-ztinc]').addEventListener('click', function () {
            v = clamp(v + 1, zlo, zhi); val.textContent = v + '\u00B0';
            HA.callService('climate.set_temperature', { entity_id: z.climate, temperature: v });
          });
          sheet.querySelectorAll('[data-vent]').forEach(function (b) {
            b.addEventListener('click', function () {
              HA.callService('cover.set_cover_position', { entity_id: z.damper, position: +b.dataset.vent });
              sheet.querySelectorAll('[data-vent]').forEach(function (x) { x.classList.remove('is-active'); });
              b.classList.add('is-active');
            });
          });
          sheet.querySelector('[data-fan]').addEventListener('click', function () {
            HA.callService('climate.set_hvac_mode', { entity_id: z.climate, hvac_mode: zOn(z) ? 'off' : 'fan_only' });
            close();
          });
          sheet.querySelector('[data-closeac]').addEventListener('click', close);
        }
      });
  }

  function unitSheet(unitId) {
    var u = C.aircon.units.filter(function (x) { return x.id === unitId; })[0];
    if (!u) return;
    var modes = HA.attr(u.id, 'hvac_modes') || ['off', 'cool', 'heat', 'fan_only', 'auto', 'dry'];
    var fans = HA.attr(u.id, 'fan_modes') || ['low', 'medium', 'high', 'auto'];
    var tgt = HA.attr(u.id, 'temperature');
    App.sheet(
      '<div class="ac-sheet">' +
      '<div class="label">AC unit</div>' +
      '<div class="serif ac-sheet-name">' + u.name + '</div>' +
      '<div class="label">Mode</div>' +
      '<div class="ac-ventrow">' + modes.map(function (m) {
        return '<button class="ac-ventbtn' + (unitState(u) === m ? ' is-active' : '') + '" data-mode="' + m + '">' + (m === 'fan_only' ? 'Fan' : m === 'dry' ? 'Dry' : m.charAt(0).toUpperCase() + m.slice(1)) + '</button>';
      }).join('') + '</div>' +
      '<div class="label">Fan speed</div>' +
      '<div class="ac-ventrow">' + fans.map(function (f) {
        return '<button class="ac-ventbtn' + (HA.attr(u.id, 'fan_mode') === f ? ' is-active' : '') + '" data-fanmode="' + f + '">' + f + '</button>';
      }).join('') + '</div>' +
      '<div class="label">Target</div>' + stepBtns('ut', tgt, { step: 1 }) +
      '</div>',
      {
        onMount: function (sheet) {
          var val = sheet.querySelector('.ac-stepval');
          var v = tgt;
          sheet.querySelectorAll('[data-mode]').forEach(function (b) {
            b.addEventListener('click', function () {
              HA.callService('climate.set_hvac_mode', { entity_id: u.id, hvac_mode: b.dataset.mode });
              sheet.querySelectorAll('[data-mode]').forEach(function (x) { x.classList.remove('is-active'); });
              b.classList.add('is-active');
            });
          });
          sheet.querySelectorAll('[data-fanmode]').forEach(function (b) {
            b.addEventListener('click', function () {
              HA.callService('climate.set_fan_mode', { entity_id: u.id, fan_mode: b.dataset.fanmode });
              sheet.querySelectorAll('[data-fanmode]').forEach(function (x) { x.classList.remove('is-active'); });
              b.classList.add('is-active');
            });
          });
          var ulo = HA.attr(u.id, 'min_temp') || 16;
          var uhi = HA.attr(u.id, 'max_temp') || 32;
          sheet.querySelector('[data-utdec]').addEventListener('click', function () {
            v = clamp(v - 1, ulo, uhi); val.textContent = v + '\u00B0';
            HA.callService('climate.set_temperature', { entity_id: u.id, temperature: v });
          });
          sheet.querySelector('[data-utinc]').addEventListener('click', function () {
            v = clamp(v + 1, ulo, uhi); val.textContent = v + '\u00B0';
            HA.callService('climate.set_temperature', { entity_id: u.id, temperature: v });
          });
        }
      });
  }

  function paint() {
    if (!V.el) return;
    V.el.innerHTML = '<div class="ac-wrap">' + header() + groups() + '</div>';
    if (!V.el._bound) {
      V.el._bound = true;
      V.el.addEventListener('click', function (e) {
        var wh = e.target.closest('[data-wholehouse]');
        if (wh) { wholeHouseSheet(); return; }
        var un = e.target.closest('[data-unit]');
        if (un) { unitSheet(un.dataset.unit); return; }
        var zn = e.target.closest('[data-zone]');
        if (zn) { zoneSheet(zn.dataset.zone); return; }
      });
    }
  }

  App.register('aircon', {
    show: function (el) { V.el = el; paint(); },
    resume: function () { if (V.el) paint(); },
    hide: function () {}
  });
  App.on('data', function () { if (App.current === 'aircon' && V.el) paint(); });
})();
