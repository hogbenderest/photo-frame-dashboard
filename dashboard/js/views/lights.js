// Lights: flat grid of large tiles (wall display readable at 10 ft).
// Tap toggles; hold opens a brightness sheet. Unavailable lights show greyed.
(function () {
  'use strict';
  var C = window.HACONFIG, HA = window.HA, V = {};

  function pct(id) {
    var b = HA.attr(id, 'brightness');
    return b === null || b === undefined ? null : Math.round(b / 255 * 100);
  }
  function tile(l, area) {
    var off = !HA.on(l.id);
    var un = HA.unavailable(l.id);
    var lvl = pct(l.id);
    return '<button class="tile tile--light' + (off ? '' : ' is-on') + (un ? ' is-dead' : '') + '" data-light="' + l.id + '" style="--lvl:' + (off ? 0 : (lvl || 100)) + '%">' +
      '<span class="tile-fill"></span>' +
      '<span class="tile-icon">' + App.icon('bulb', 32) + '</span>' +
      '<span class="tile-name">' + App.esc(l.name) + '</span>' +
      '<span class="tile-state num">' + (un ? 'Unreachable' : off ? 'Off' : (lvl !== null ? lvl + '%' : 'On')) + '</span>' +
      '<small class="tile-area">' + App.esc(area.name) + '</small>' +
      '</button>';
  }

  function summary() {
    var all = [], on = 0;
    C.lights.areas.forEach(function (a) { a.lights.forEach(function (l) { all.push(l); if (HA.on(l.id)) on++; }); });
    var un = all.filter(function (l) { return HA.unavailable(l.id); });
    return '<div class="ct-summary"><span class="num">' + on + '</span><span>lights on</span>' +
      (un.length ? '<span class="pill pill--alert">' + un.length + ' unreachable</span>' : '') +
      (on ? '<button class="rz-act rz-stop" data-alloff="all">All off</button>' : '') +
      '</div>';
  }

  function flatGrid() {
    var tiles = [];
    C.lights.areas.forEach(function (a) { a.lights.forEach(function (l) { tiles.push(tile(l, a)); }); });
    return '<div class="lights-grid">' + tiles.join('') + '</div>';
  }

  function paint() {
    V.el.innerHTML = '<div class="lights-wrap">' + summary() + flatGrid() + '</div>';
    bind();
  }

  function lightOf(id) {
    for (var i = 0; i < C.lights.areas.length; i++) {
      var a = C.lights.areas[i];
      for (var j = 0; j < a.lights.length; j++) if (a.lights[j].id === id) return a.lights[j];
    }
    return null;
  }

  function bind() {
    if (V.el._bound) return; V.el._bound = true;
    V.el.addEventListener('click', function (e) {
      var t = e.target.closest('[data-light]');
      if (t) { toggle(t.dataset.light); return; }
      var o = e.target.closest('[data-alloff]');
      if (o) alloff(o.dataset.alloff);
    });
    V.el.addEventListener('pointerdown', function (e) {
      var t = e.target.closest('[data-light]');
      if (!t) return;
      var l = lightOf(t.dataset.light);
      if (l && l.brightness && !HA.unavailable(l.id)) App.hold(t, 900, {
        enabled: function () { return true; },
        done: function () { brightSheet(l); },
        cancel: function () {}
      });
    });
  }

  function toggle(id) {
    var svc = HA.on(id) ? 'light.turn_off' : 'light.turn_on';
    HA.callService(svc, { entity_id: id }).catch(function () {
      App.toast('Couldn\u2019t reach <b>' + App.esc(HA.name(id)) + '</b>', { tone: 'error', icon: 'bolt' });
    });
  }

  function alloff(areaId) {
    var ids = [];
    C.lights.areas.forEach(function (a) { a.lights.forEach(function (l) { ids.push(l.id); }); });
    HA.callService('light.turn_off', { entity_id: ids }).catch(function () {
      App.toast('Couldn\u2019t turn lights off', { tone: 'error', icon: 'bolt' });
    });
  }

  function brightSheet(l) {
    var cur = pct(l.id) || 50;
    var close = App.sheet(
      '<div class="lg-bright">' +
      '<div class="label">Brightness</div>' +
      '<div class="lg-bright-name serif">' + App.esc(l.name) + '</div>' +
      '<input type="range" min="1" max="100" value="' + cur + '" class="lg-range" id="lgRange">' +
      '<div class="lg-bright-row"><span class="num" id="lgVal">' + cur + '%</span>' +
      '<button class="pill" id="lgOff">Turn off</button></div>' +
      '</div>',
      {
        onMount: function (sheet) {
          var r = sheet.querySelector('#lgRange');
          r.addEventListener('input', function () { sheet.querySelector('#lgVal').textContent = r.value + '%'; });
          r.addEventListener('change', function () {
            HA.callService('light.turn_on', { entity_id: l.id, brightness_pct: +r.value });
          });
          sheet.querySelector('#lgOff').addEventListener('click', function () {
            HA.callService('light.turn_off', { entity_id: l.id }); close();
          });
        }
      });
  }

  App.register('lights', {
    show: function (el) { V.el = el; paint(); },
    resume: function () { if (V.el) paint(); },
    hide: function () {}
  });
  App.on('data', function () { if (App.current === 'lights' && V.el) paint(); });
})();
