// Security: house mode control (hold-to-confirm), doors + garage, leaks,
// camera activity, sirens (display only, never buttons on a wall panel).
(function () {
  'use strict';
  var C = window.HACONFIG, HA = window.HA, V = {};

  function modeChips() {
    var cur = HA.state(C.security.modeEntity) || 'Home';
    return ['Home', 'Away', 'Night'].map(function (m) {
      return '<button class="sec-chip' + (m === cur ? ' is-active' : '') + '" data-mode="' + m + '">' +
        App.icon(m === 'Night' ? 'moon' : m === 'Away' ? 'away' : 'home', 22) + m + '</button>';
    }).join('') +
      '<button class="sec-chip' + (HA.on(C.security.guestMode) ? ' is-active' : '') + '" data-guest="1">' +
      App.icon('person', 22) + 'Guest' + (HA.on(C.security.guestMode) ? ' on' : '') + '</button>';
  }

  function doorsCard() {
    var rows = C.security.doors.map(function (d) {
      var open = HA.on(d.id);
      var mins = HA.minsSince(d.id);
      return '<div class="sec-row' + (open ? ' is-open' : '') + '">' +
        App.icon('door', 22) + '<span>' + App.esc(d.name) + '</span>' +
        '<b>' + (HA.unavailable(d.id) ? '--' : open ? ('Open' + (mins ? ' \u00B7 ' + App.fmt.mins(mins) : '')) : 'Closed') + '</b></div>';
    });
    var g = C.security.garage;
    var gc = HA.state(g.cover) || 'unavailable';
    var problem = HA.on(g.problem);
    rows.push('<div class="sec-row sec-garage' + (gc !== 'closed' ? ' is-open' : '') + '">' +
      App.icon('garage', 22) + '<span>Garage door</span>' +
      '<b>' + gc + (problem ? ' \u00B7 PROBLEM' : '') + '</b>' +
      '<span class="sec-gdo"><button class="pill" data-gdo="open"' + (gc === 'open' || gc === 'opening' ? ' disabled' : '') + '>Hold to open</button>' +
      '<button class="pill" data-gdo="close"' + (gc === 'closed' || gc === 'closing' ? ' disabled' : '') + '>Hold to close</button></span></div>');
    return '<div class="card sec-card"><div class="label">Doors + garage</div>' + rows.join('') + '</div>';
  }

  function leaksCard() {
    var rows = C.security.leaks.map(function (d) {
      var wet = HA.on(d.id);
      return '<div class="sec-row' + (wet ? ' is-wet' : '') + '">' + App.icon('drop', 22) +
        '<span>' + App.esc(d.name) + '</span><b>' + (HA.unavailable(d.id) ? '--' : wet ? 'LEAK' : 'Dry') + '</b></div>';
    });
    return '<div class="card sec-card"><div class="label">Water</div>' + rows.join('') +
      (HA.on(C.security.leakAggregate) ? '<div class="sec-alert">Leak detected somewhere in the house</div>' : '') +
      '</div>';
  }

  function activityCard() {
    var rows = C.security.activity.map(function (a) {
      var on = HA.on(a.id);
      var mins = HA.minsSince(a.id);
      return '<div class="sec-row' + (on ? ' is-on' : '') + '">' + App.icon(on ? 'bolt' : 'clock', 20) +
        '<span>' + App.esc(a.name) + '</span><b>' + (on ? 'Now' : mins !== null ? App.fmt.mins(mins) + ' ago' : '--') + '</b></div>';
    });
    return '<div class="card sec-card"><div class="label">Camera activity</div>' + rows.join('') +
      '<button class="sec-more" data-go="cameras">See cameras</button></div>';
  }

  function sirensCard() {
    var rows = C.security.sirens.map(function (s) {
      return '<div class="sec-row sec-siren"><i class="sec-led' + (HA.on(s.id) ? ' is-on' : '') + '"></i><span>' + App.esc(s.name) + '</span><b>siren ' + (HA.on(s.id) ? 'SOUNDING' : 'idle') + '</b></div>';
    });
    return '<div class="card sec-card"><div class="label">Sirens \u00B7 display only</div>' + rows.join('') +
      '<div class="sec-note">Sirens can\u2019t be triggered from this panel.</div></div>';
  }

  function paint() {
    V.el.innerHTML = '<div class="sec-wrap">' +
      '<div class="sec-modes">' + modeChips() + '</div>' +
      '<div class="sec-grid">' + doorsCard() + leaksCard() + activityCard() + sirensCard() + '</div>' +
      '</div>';
    bind();
  }

  function bind() {
    if (V.el._bound) return; V.el._bound = true;
    V.el.addEventListener('pointerdown', function (e) {
      var chip = e.target.closest('[data-mode]');
      if (chip) {
        App.hold(chip, 1100, {
          enabled: function () { return !chip.classList.contains('is-active'); },
          done: function () { setMode(chip.dataset.mode); },
          cancel: function () {}
        });
      }
      var g = e.target.closest('[data-gdo]');
      if (g) {
        App.hold(g, 1400, {
          enabled: function () { return !g.disabled; },
          done: function () { garage(g.dataset.gdo); },
          cancel: function () {}
        });
      }
    });
    V.el.addEventListener('click', function (e) {
      var g = e.target.closest('[data-guest]');
      if (g) {
        HA.callService(HA.on(C.security.guestMode) ? 'input_boolean.turn_off' : 'input_boolean.turn_on', { entity_id: C.security.guestMode });
      }
      var go = e.target.closest('[data-go]');
      if (go) App.go(go.dataset.go);
    });
  }

  function setMode(mode) {
    HA.callScript(C.security.modeScripts[mode]).then(function () {
      App.toast('House mode set to <b>' + mode + '</b>', { icon: 'check' });
    }).catch(function () {
      App.toast('Couldn\u2019t change house mode', { tone: 'error', icon: 'bolt' });
    });
  }

  function garage(what) {
    var act = what === 'open' ? 'cover.open_cover' : 'cover.close_cover';
    HA.callService(act, { entity_id: C.security.garage.cover }).then(function () {
      App.toast('Garage door ' + (what === 'open' ? 'opening' : 'closing'), { icon: 'garage' });
    }).catch(function () {
      App.toast('Couldn\u2019t reach the garage door', { tone: 'error', icon: 'bolt' });
    });
  }

  App.register('security', { show: function (el) { V.el = el; paint(); } });
  App.on('data', function () { if (App.current === 'security' && V.el) paint(); });
})();
