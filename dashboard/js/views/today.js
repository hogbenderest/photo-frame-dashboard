// Today: the glanceable overview. Never scrolls.
(function () {
  'use strict';
  var C = window.HACONFIG, HA = window.HA, V = {};

  function clock() {
    var n = App.now();
    return '<div class="h-time num">' + App.fmt.time(n, false) + '<span class="h-ampm">' + App.fmt.ampm(n) + '</span></div>' +
      '<div class="h-date"><b>' + App.fmt.day(n) + '</b> ' + App.fmt.month(n) + ' ' + n.getDate() + '</div>';
  }

  function weather() {
    var w = App.weatherNow();
    var hours = App.hourly(7);
    var tmin = hours.length ? Math.min.apply(null, hours.map(function (h) { return h.t; })) : w.temp;
    var tmax = hours.length ? Math.max.apply(null, hours.map(function (h) { return h.t; })) : w.temp;
    var hi = w.hi !== null ? w.hi : tmax, lo = w.lo !== null ? w.lo : tmin;
    return '<div class="h-wx-top">' +
      '<span class="h-wx-icon">' + App.icon(w.cond, 60) + '</span>' +
      '<span class="h-wx-temp num">' + w.temp + '\u00B0</span>' +
      '<span class="h-wx-meta"><b>' + w.label + '</b><span>H ' + hi + '\u00B0  L ' + lo + '\u00B0</span></span>' +
      '</div>' +
      '<div class="h-wx-say"><b>' + w.summary + '.</b> ' + w.advice + '.</div>' +
      '<div class="h-wx-hours">' + hours.map(function (h) {
        var lift = tmax === tmin ? 0 : Math.round((h.t - tmin) / (tmax - tmin) * 8);
        return '<div class="h-hr' + (h.p >= 50 ? ' is-wet' : '') + '"><span class="h-hr-l">' + h.label + '</span>' +
          '<span class="h-hr-i" style="transform:translateY(' + -lift + 'px)">' + App.icon(h.c, 22) + '</span><b>' + h.t + '\u00B0</b></div>';
      }).join('') + '</div>' +
      '<div class="h-sun">' + App.icon('sunrise', 20) + App.fmt.hour(new Date(HA.state(C.today.sunrise) || Date.now())) + ' &nbsp;' +
      App.icon('sunset', 20) + App.fmt.hour(new Date(HA.state(C.today.sunset) || Date.now())) + '</div>';
  }

  function presence() {
    return App.state.people.map(function (p) {
      var s = p.person ? HA.state(p.person) : null;
      var home = s === 'home';
      var sub = p.person ? (home ? 'Home' : (s === 'away' ? 'Away' : 'Unknown')) : 'No tracker';
      return '<div class="h-who' + (home ? ' is-home' : '') + '" style="' + App.pstyle(p) + '">' +
        App.avatar(p, 36, home ? '' : 'avatar--away') +
        '<span><b>' + p.name + '</b><small>' + sub + '</small></span></div>';
    }).join('');
  }

  // The big left card: attention states first, all-good otherwise.
  function hero() {
    var S = C.security;
    var alerts = [];
    if (HA.on(S.leakAggregate)) alerts.push({ icon: 'drop', t: 'Water leak detected', go: 'security', warn: true });
    if (HA.state(S.garage.cover) && HA.state(S.garage.cover) !== 'closed') alerts.push({ icon: 'garage', t: 'Garage door ' + HA.state(S.garage.cover), go: 'security', warn: true });
    S.doors.forEach(function (d) {
      if (HA.on(d.id)) alerts.push({ icon: 'door', t: d.name + ' open' + (HA.minsSince(d.id) ? ' for ' + App.fmt.mins(HA.minsSince(d.id)) : ''), go: 'security', warn: true });
    });
    if (HA.on(C.watering.programRunning)) alerts.push({ icon: 'drop', t: 'Watering now', go: 'watering' });
    if (HA.on(S.garage.problem)) alerts.push({ icon: 'bolt', t: 'Garage door problem', go: 'security', warn: true });

    if (!alerts.length) {
      var next = HA.state(C.watering.nextRun);
      return '<div class="h-hero h-hero--empty" data-go="watering">' +
        '<div class="label label--light">House status</div>' +
        '<div class="h-hero-title serif">All quiet.<br><i>Everything closed.</i></div>' +
        (next && new Date(next) > App.now() ? '<div class="h-hero-meta">Next watering <b>' + App.fmt.hour(new Date(next)) + '</b> ' + App.fmt.rel(new Date(next)) + '</div>' : '') +
        '</div>';
    }
    var a = alerts[0];
    return '<button class="h-hero h-hero--alert" data-go="' + a.go + '">' +
      '<div class="h-hero-main"><div class="label label--on">Attention</div>' +
      '<div class="h-hero-title serif">' + App.esc(a.t) + '</div>' +
      (alerts.length > 1 ? '<div class="h-hero-meta">+' + (alerts.length - 1) + ' more to look at</div>' : '') +
      '</div>' + App.icon(a.warn ? 'bolt' : 'check', 60) + '</button>';
  }

  function card(cls, go) { return '<button class="card h-card ' + cls + '" data-go="' + go + '">'; }

  function statusCards() {
    var mode = HA.state(C.security.modeEntity) || 'Home';
    var lights = 0, onList = [];
    C.lights.areas.forEach(function (a) { a.lights.forEach(function (l) { if (HA.on(l.id)) { lights++; onList.push(a.name + ' ' + l.name); } }); });
    var indoor = HA.attr(C.today.indoor, 'current_temperature');
    var solarNow = HA.num(C.today.solarNow), solarToday = HA.num(C.today.solarToday);
    var cellarN = HA.num(C.cellar.bottles);
    return card('h-mode', 'security') +
      '<div class="label">House mode</div>' +
      '<div class="h-mode-big"><span>' + App.icon(mode === 'Night' ? 'moon' : mode === 'Away' ? 'away' : 'home', 34) + '</span><b class="serif">' + mode + '</b></div>' +
      (HA.on(C.security.guestMode) ? '<div class="h-mode-sub">Guest mode on</div>' : '') +
      '<div class="h-mode-sub">Tap to control</div></button>' +
      card('h-retic', 'watering') +
      '<div class="label">Watering</div>' +
      '<div class="h-retic-row">' + App.icon('drop', 24) + '<span>' +
      (HA.on(C.watering.rainDelayActive) ? '<b>Rain delay</b> active' :
        HA.on(C.watering.programRunning) ? '<b>Running now</b>' :
          'Next run <b>' + (HA.state(C.watering.nextRun) ? App.fmt.hour(new Date(HA.state(C.watering.nextRun))) + ' ' + App.fmt.rel(new Date(HA.state(C.watering.nextRun))) : 'not set') + '</b>') +
      '</span></div>' +
      '<div class="h-retic-row sub">Seasonal level ' + HA.num(C.watering.seasonalLevel) + '%' +
      (HA.state(C.watering.heatBoost) === 'active' ? ' · heat boost armed' : '') + '</div>' +
      '</button>' +
      card('h-solar', 'home') +
      '<div class="label">Solar</div>' +
      '<div class="h-solar-big num">' + (solarNow !== null ? (solarNow >= 1000 ? (solarNow / 1000).toFixed(1) + ' kW' : Math.round(solarNow) + ' W') : '--') + '</div>' +
      '<div class="h-retic-row sub">' + (solarToday !== null ? solarToday.toFixed(1) + ' kWh today' : '') +
      (HA.num(C.today.solarRemaining) !== null ? ' · ' + HA.num(C.today.solarRemaining).toFixed(1) + ' kWh left' : '') + '</div>' +
      '</button>' +
      card('h-cellar', 'cellar') +
      '<div class="label">Cellar</div>' +
      '<div class="h-solar-big num">' + (cellarN !== null ? cellarN : '--') + '</div>' +
      '<div class="h-retic-row sub">bottles · ' + (HA.num(C.cellar.capacity) !== null ? HA.num(C.cellar.capacity).toFixed(1) + '% full' : '--') +
      (HA.on(C.cellar.door) ? ' · <b>door open</b>' : '') + '</div>' +
      '</button>' +
      card('h-lights', 'lights') +
      '<div class="label">Lights</div>' +
      '<div class="h-solar-big num">' + lights + '</div>' +
      '<div class="h-retic-row sub">lights on' + (indoor !== null ? ' · inside ' + Math.round(indoor) + '\u00B0' : '') + '</div>' +
      '<div class="h-lights-list">' + onList.slice(0, 3).map(App.esc).join(' · ') + '</div>' +
      '</button>';
  }

  function connCard() {
    var s = HA.status;
    var txt = { live: 'Live · Home Assistant', demo: 'Demo data (?demo)', connecting: 'Connecting\u2026', offline: 'Reconnecting\u2026', badtoken: 'Bad token' }[s] || s;
    return '<div class="h-conn' + (s === 'live' ? '' : ' is-warn') + '">' + App.icon(s === 'live' ? 'check' : 'bolt', 20) + '<span>' + txt + '</span></div>';
  }

  function paint() {
    var el = V.el;
    el.querySelector('.h-clock').innerHTML = clock();
    el.querySelector('.h-weather').innerHTML = weather();
    el.querySelector('.h-presence').innerHTML = presence();
    el.querySelector('.h-hero-slot').innerHTML = hero();
    el.querySelector('.h-cards').innerHTML = statusCards();
    el.querySelector('.h-conn-slot').innerHTML = connCard();
  }

  App.register('home', {
    show: function (el) {
      V.el = el;
      if (!el.firstChild) {
        el.innerHTML = '<div class="home">' +
          '<div class="h-clock" data-go="calendar"></div>' +
          '<div class="h-weather"></div>' +
          '<div class="h-presence"></div>' +
          '<div class="h-main"><div class="h-hero-slot"></div><div class="h-cards"></div></div>' +
          '<div class="h-side"><div class="h-conn-slot"></div></div>' +
          '</div>';
        el.addEventListener('click', function (e) {
          var g = e.target.closest('[data-go]');
          if (g) App.go(g.dataset.go);
        });
      }
      paint();
    },
    hide: function () {}
  });
  // Every minute: clock. Weather on the hour.
  App.on('minute', function (n) {
    if (!V.el || !V.el.firstChild) return;
    V.el.querySelector('.h-clock').innerHTML = clock();
    if (n.getMinutes() === 0) V.el.querySelector('.h-weather').innerHTML = weather();
  });
  App.on('data', function () { if (App.current === 'home' && V.el) paint(); });
  App.on('ha-status', function () { if (App.current === 'home' && V.el) paint(); });
})();
