// Lights: area-grouped tiles. Tap toggles; hold opens a brightness sheet for
// dimmable lights. Unavailable lights show greyed "unreachable" tiles.
(function () {
  'use strict';
  var C = window.HACONFIG, HA = window.HA, V = {};

  function pct(id) {
    var b = HA.attr(id, 'brightness');
    return b === null || b === undefined ? null : Math.round(b / 255 * 100);
  }
  function tile(l, area) {
    var s = HA.state(l.id);
    var off = !HA.on(l.id);
    var un = HA.unavailable(l.id);
    var lvl = pct(l.id);
    return '<button class="tile tile--light' + (off ? '' : ' is-on') + (un ? ' is-dead' : '') + '" data-light="' + l.id + '" style="--lvl:' + (off ? 0 : (lvl || 100)) + '%">' +
      '<span class="tile-fill"></span>' +
      '<span class="tile-icon">' + App.icon('bulb', 28) + '</span>' +
      '<span class="tile-name">' + App.esc(l.name) + '</span>' +
      '<span class="tile-state num">' + (un ? 'Unreachable' : off ? 'Off' : (lvl !== null ? lvl + '%' : 'On')) + '</span>' +
      '<small class="tile-area">' + App.esc(area.name) + '</small>' +
      '</button>';
  }

  function group(a) {
    var onCount = a.lights.filter(function (l) { return HA.on(l.id); }).length;
    return '<div class="lg-group" data-area="' + a.id + '">' +
      '<div class="lg-head"><b>' + App.esc(a.name) + '</b>' +
      '<span class="lg-count num">' + onCount + '/' + a.lights.length + '</span>' +
      '<button class="lg-alloff" data-alloff="' + a.id + '"' + (onCount ? '' : ' disabled') + '>' + App.icon('x', 18) + 'All off</button>' +
      '</div><div class="lg-tiles">' + a.lights.map(function (l) { return tile(l, a); }).join('') + '</div></div>';
  }

  function summary() {
    var all = [], on = 0;
    C.lights.areas.forEach(function (a) { a.lights.forEach(function (l) { all.push(l); if (HA.on(l.id)) on++; }); });
    var un = all.filter(function (l) { return HA.unavailable(l.id); });
    return '<div class="ct-summary"><span class="num">' + on + '</span><span>lights on</span>' +
      (un.length ? '<span class="pill pill--alert">' + un.length + ' unreachable</span>' : '') +
      (on ? '<button class="lg-alloff lg-alloff--all" data-alloff="all">All off</button>' : '') +
      '</div>';
  }

  function paint() {
    V.el.innerHTML = '<div class="lights-wrap">' + summary() +
      '<div class="lights-grid">' + C.lights.areas.map(group).join('') + '</div></div>';
    bind();
  }

  function areaOf(id) {
    for (var i = 0; i < C.lights.areas.length; i++) {
      var a = C.lights.areas[i];
      for (var j = 0; j < a.lights.length; j++) if (a.lights[j].id === id) return a;
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
  function lightOf(id) {
    var a = areaOf(id); if (!a) return null;
    for (var i = 0; i < a.lights.length; i++) if (a.lights[i].id === id) return a.lights[i];
    return null;
  }

  function toggle(id) {
    var svc = HA.on(id) ? 'light.turn_off' : 'light.turn_on';
    HA.callService(svc, { entity_id: id }).catch(function () {
      App.toast('Couldn\u2019t reach <b>' + App.esc(HA.name(id)) + '</b>', { tone: 'error', icon: 'bolt' });
    });
  }

  function alloff(areaId) {
    var ids = [];
    C.lights.areas.forEach(function (a) {
      if (areaId === 'all' || a.id === areaId) a.lights.forEach(function (l) { ids.push(l.id); });
    });
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
