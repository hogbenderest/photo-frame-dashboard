// Security: large status hero + active alerts (wall display readable at 10 ft).
// Mode chips at top, then "secure / not secure" hero, then only active alerts.
(function () {
  'use strict';
  var C = window.HACONFIG, HA = window.HA, V = {};

  function modeChips() {
    var cur = HA.state(C.security.modeEntity) || 'Home';
    return ['Home', 'Away', 'Night'].map(function (m) {
      return '<button class="sec-chip' + (m === cur ? ' is-active' : '') + '" data-mode="' + m + '">' +
        App.icon(m === 'Night' ? 'moon' : m === 'Away' ? 'away' : 'home', 24) + m + '</button>';
    }).join('') +
      '<button class="sec-chip' + (HA.on(C.security.guestMode) ? ' is-active' : '') + '" data-guest="1">' +
      App.icon('person', 24) + 'Guest' + (HA.on(C.security.guestMode) ? ' on' : '') + '</button>';
  }

  function hero() {
    var S = C.security;
    var problems = [];
    if (HA.on(S.leakAggregate)) problems.push('Water leak detected');
    if (HA.state(S.garage.cover) && HA.state(S.garage.cover) !== 'closed') problems.push('Garage door ' + HA.state(S.garage.cover));
    S.doors.forEach(function (d) {
      if (HA.on(d.id)) problems.push(d.name + ' open');
    });
    if (HA.on(S.garage.problem)) problems.push('Garage door problem');

    var mode = HA.state(C.security.modeEntity) || 'Home';
    if (problems.length) {
      return '<div class="sec-hero is-alert" data-go="security">' +
        '<span class="sec-hero-icon">' + App.icon('bolt', 48) + '</span>' +
        '<div><div class="sec-hero-title">' + App.esc(problems[0]) + '</div>' +
        (problems.length > 1 ? '<div class="sec-hero-sub">+' + (problems.length - 1) + ' more</div>' : '') + '</div>' +
        '<div class="sec-hero-mode">' + App.icon(mode === 'Night' ? 'moon' : mode === 'Away' ? 'away' : 'home', 30) + ' ' + mode + '</div>' +
        '</div>';
    }
    return '<div class="sec-hero">' +
      '<span class="sec-hero-icon">' + App.icon('shield', 48) + '</span>' +
      '<div><div class="sec-hero-title">House secure</div>' +
      '<div class="sec-hero-sub">All doors closed. No leaks.</div></div>' +
      '<div class="sec-hero-mode">' + App.icon(mode === 'Night' ? 'moon' : mode === 'Away' ? 'away' : 'home', 30) + ' ' + mode + '</div>' +
      '</div>';
  }

  function alertRows() {
    var S = C.security;
    var rows = [];
    // doors + garage
    S.doors.forEach(function (d) {
      rows.push(secRow(d.id, 'door', d.name, HA.on(d.id), HA.on(d.id) ? 'security' : null));
    });
    var g = HA.state(S.garage.cover);
    rows.push(garageRow());
    // leaks
    S.leaks.forEach(function (d) {
      rows.push(secRow(d.id, 'drop', d.name, HA.on(d.id), HA.on(d.id) ? 'security' : null));
    });
    // camera activity summary
    var actCount = 0;
    S.activity.forEach(function (a) { if (HA.on(a.id)) actCount++; });
    if (actCount) {
      rows.push('<button class="sec-alert-row is-warn" data-go="cameras">' + App.icon('camera', 26) +
        '<span><b>' + actCount + '</b> camera alert' + (actCount > 1 ? 's' : '') + ' active</span></button>');
    }
    return rows.join('');
  }

  function secRow(id, icon, name, active, go) {
    var cls = active ? ' is-warn' : ' is-ok';
    return '<div class="sec-row' + cls + '">' + App.icon(icon, 26) + '<span>' + name + '</span>' +
      '<b style="margin-left:auto">' + (HA.unavailable(id) ? '--' : active ? 'OPEN' : 'OK') + '</b></div>';
  }

  function garageRow() {
    var g = C.security.garage;
    var gc = HA.state(g.cover) || 'unavailable';
    var problem = HA.on(g.problem);
    var cls = gc !== 'closed' ? ' is-warn' : ' is-ok';
    return '<div class="sec-row' + cls + '">' + App.icon('garage', 26) + '<span>Garage</span>' +
      '<b style="margin-left:auto">' + gc + (problem ? ' - PROBLEM' : '') + '</b>' +
      '<span class="sec-gdo">' +
      '<button class="pill" data-gdo="open"' + (gc === 'open' || gc === 'opening' ? ' disabled' : '') + '>Hold to open</button>' +
      '<button class="pill" data-gdo="close"' + (gc === 'closed' || gc === 'closing' ? ' disabled' : '') + '>Hold to close</button>' +
      '</span></div>';
  }

  function paint() {
    V.el.innerHTML = '<div class="sec-wrap">' +
      '<div class="sec-modes">' + modeChips() + '</div>' +
      hero() +
      '<div class="sec-alerts">' + alertRows() + '</div>' +
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

  App.register('security', {
    show: function (el) { V.el = el; paint(); },
    resume: function () { if (V.el) paint(); }
  });
  App.on('data', function () { if (App.current === 'security' && V.el) paint(); });
})();
