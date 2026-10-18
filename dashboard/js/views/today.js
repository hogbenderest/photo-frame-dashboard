// Today: the glanceable overview. Never scrolls.
// Cards (2x3): Family (mail + next event), House mode, Watering, Solar,
// Cellar, Lights. Mail lives in an authenticated sensor written by the
// Mac-side sync script; next-event comes from the strip calendars.
(function () {
  'use strict';
  var C = window.HACONFIG, HA = window.HA, V = { events: null, at: 0 };

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

  // ------------------------------------------------------------ next event
  function stripCalendars() { return C.calendar.entities.filter(function (c) { return c.strip !== false; }); }
  function loadEvents() {
    // Boot race: show() runs before /ha.json resolves, so HA.url may be null;
    // never fetch (and never cache) in that state - the next paint retries.
    if (!HA.url) { V.events = null; V.at = 0; return; }
    if (V.events && Date.now() - V.at < 10 * 60000) return;
    var start = new Date(App.now()); start.setHours(0, 0, 0, 0);
    var end = App.addDays(start, 7);
    Promise.all(stripCalendars().map(function (cal) {
      return HA.calendarEvents(cal.id, start.toISOString(), end.toISOString()).then(function (events) {
        return (events || []).map(function (e) {
          var sd = e.start && (e.start.dateTime || e.start.date);
          var ed = e.end && (e.end.dateTime || e.end.date);
          return { title: e.summary || '(untitled)', start: sd ? new Date(sd) : null, end: ed ? new Date(ed) : null, allDay: !!(e.start && e.start.date) };
        });
      }).catch(function () { return []; });
    })).then(function (all) {
      var flat = [];
      all.forEach(function (l) { flat = flat.concat(l); });
      flat.sort(function (a, b) { return (a.start || 0) - (b.start || 0); });
      V.events = flat;
      // An empty result caches for only 60s so a transient failure (or a
      // genuinely empty week) doesn't stick for the full 10 minutes.
      V.at = Date.now() - (flat.length ? 0 : 9 * 60000);
      if (App.current === 'home' && V.el) paint();
    });
  }
  // Next strip event: upcoming timed/all-day events, plus all-day events
  // already in progress (multi-day trips and holidays must surface mid-span).
  function nextEvent() {
    if (!V.events) return null;
    var now = App.now(), today = App.dayStart(now);
    return V.events.filter(function (e) {
      if (!e.start) return false;
      if (e.allDay) {
        var s = App.dayStart(e.start);
        var endExclusive = e.end ? App.dayStart(e.end) : App.addDays(s, 1);
        return today >= s && today < endExclusive ? true : s > today;
      }
      return e.end ? e.end > now : e.start > now;
    })[0] || null;
  }

  // ------------------------------------------------------------ family card
  function senderName(from) { return String(from || '').replace(/\s*<.*>\s*$/, '').trim() || String(from || ''); }
  function mailCount() { var n = HA.num(C.mail.sensor); return n === null ? null : n; }
  function familyCard() {
    var mailRow;
    var n = mailCount();
    if (n === null) {
      mailRow = '<div class="fam-row is-mute">' + App.icon('box', 22) + '<span>Mail \u00B7 waiting for first sync</span></div>';
    } else if (n === 0) {
      mailRow = '<div class="fam-row is-ok">' + App.icon('check', 22) + '<span>Mail \u00B7 no unread</span></div>';
    } else {
      var msgs = HA.attr(C.mail.sensor, 'messages') || [];
      var names = [];
      msgs.forEach(function (m) {
        var nm = senderName(m.from);
        if (names.indexOf(nm) < 0) names.push(nm);
      });
      var extra = n - names.length;
      mailRow = '<button class="fam-row is-warn" data-mail="1">' + App.icon('bell', 22) + '<span><b class="num">' + n + ' unread</b>' +
        (names.length ? ' \u00B7 ' + names.slice(0, C.mail.maxSenders).join(', ') : '') +
        (extra > 0 ? ' +' + extra : '') + '</span></button>';
    }
    var evRow;
    if (!V.events) {
      // Never fetched yet (boot storm can fail the first attempt; the 60s
      // empty-cache retry recovers) - do not claim "nothing coming up".
      evRow = '<div class="fam-row is-mute">' + App.icon('calendar', 22) + '<span>Loading\u2026</span></div>';
    } else {
      var ev = nextEvent();
      evRow = ev
        ? '<button class="fam-row" data-go="calendar">' + App.icon('calendar', 22) +
          '<span><b>' + App.esc(ev.title) + '</b><small>' + (ev.allDay ? App.fmt.rel(ev.start) : App.fmt.hour(ev.start) + ' ' + App.fmt.rel(ev.start)) + '</small></span></button>'
        : '<div class="fam-row is-mute">' + App.icon('calendar', 22) + '<span>Nothing coming up</span></div>';
    }
    // NOTE: outer element is a div - buttons cannot nest in buttons; a nested
    // <button> makes the parser close the outer one and eject the rest.
    return '<div class="card h-card h-family">' +
      '<div class="label">Family</div>' + mailRow + evRow + '</div>';
  }

  function mailSheet() {
    var n = mailCount();
    if (n === null || n === 0) {
      App.sheet('<div class="cl-detail"><div class="label">Mail</div><div class="serif cl-detail-name">' +
        (n === 0 ? 'No unread mail' : 'Not synced yet') + '</div>' +
        '<small class="li-note">' + App.esc(C.mail.hourly) + '</small></div>');
      return;
    }
    var msgs = HA.attr(C.mail.sensor, 'messages') || [];
    App.sheet(
      '<div class="cl-detail"><div class="label">Mail \u00B7 <b class="num">' + n + '</b> unread</div>' +
      '<div class="cl-list cl-mail">' + msgs.map(function (m) {
        return '<div class="li-item cl-mail-item">' +
          '<span class="ch-head">' + App.esc(senderName(m.from)) + '</span>' +
          '<span class="li-name">' + App.esc(m.subject || '(no subject)') + '</span>' +
          '<small class="cl-mail-date">' + (m.date ? App.fmt.rel(new Date(m.date)) : '') + '</small></div>';
      }).join('') + '</div>' +
      '<small class="li-note">' + App.esc(C.mail.hourly) + '</small></div>');
  }

  function card(cls, go) { return '<button class="card h-card ' + cls + '" data-go="' + go + '">'; }

  function statusCards() {
    var mode = HA.state(C.security.modeEntity) || 'Home';
    var lights = 0, onList = [];
    C.lights.areas.forEach(function (a) { a.lights.forEach(function (l) { if (HA.on(l.id)) { lights++; onList.push(a.name + ' ' + l.name); } }); });
    var indoor = HA.attr(C.today.indoor, 'current_temperature');
    var solarNow = HA.num(C.today.solarNow), solarToday = HA.num(C.today.solarToday);
    var cellarN = HA.num(C.cellar.bottles);
    return familyCard() +
      card('h-mode', 'security') +
      '<div class="label">House mode</div>' +
      '<div class="h-mode-big"><span>' + App.icon(mode === 'Night' ? 'moon' : mode === 'Away' ? 'away' : 'home', 30) + '</span><b class="serif">' + mode + '</b></div>' +
      (HA.on(C.security.guestMode) ? '<div class="h-mode-sub">Guest mode on</div>' : '') +
      '</button>' +
      card('h-retic', 'watering') +
      '<div class="label">Watering</div>' +
      '<div class="h-retic-row">' + App.icon('drop', 22) + '<span>' +
      (HA.on(C.watering.rainDelayActive) ? '<b>Rain delay</b> active' :
        HA.on(C.watering.programRunning) ? '<b>Running now</b>' :
          'Next <b>' + (HA.state(C.watering.nextRun) ? App.fmt.hour(new Date(HA.state(C.watering.nextRun))) + ' ' + App.fmt.rel(new Date(HA.state(C.watering.nextRun))) : 'not set') + '</b>') +
      '</span></div>' +
      '<div class="h-retic-row sub">Seasonal ' + HA.num(C.watering.seasonalLevel) + '%' +
      (HA.state(C.watering.heatBoost) === 'active' ? ' \u00B7 heat boost' : '') + '</div>' +
      '</button>' +
      card('h-solar', 'home') +
      '<div class="label">Solar</div>' +
      '<div class="h-solar-big num">' + (solarNow !== null ? (solarNow >= 1000 ? (solarNow / 1000).toFixed(1) + ' kW' : Math.round(solarNow) + ' W') : '--') + '</div>' +
      '<div class="h-retic-row sub">' + (solarToday !== null ? solarToday.toFixed(1) + ' kWh today' : '') + '</div>' +
      '</button>' +
      card('h-cellar', 'cellar') +
      '<div class="label">Cellar</div>' +
      '<div class="h-solar-big num">' + (cellarN !== null ? cellarN : '--') + '</div>' +
      '<div class="h-retic-row sub">bottles \u00B7 ' + (HA.num(C.cellar.capacity) !== null ? HA.num(C.cellar.capacity).toFixed(1) + '% full' : '--') +
      (HA.on(C.cellar.door) ? ' \u00B7 <b>door open</b>' : '') + '</div>' +
      '</button>' +
      card('h-lights', 'lights') +
      '<div class="label">Lights</div>' +
      '<div class="h-solar-big num">' + lights + '</div>' +
      '<div class="h-retic-row sub">lights on' + (indoor !== null ? ' \u00B7 inside ' + Math.round(indoor) + '\u00B0' : '') + '</div>' +
      '<div class="h-lights-list">' + onList.slice(0, 3).map(App.esc).join(' \u00B7 ') + '</div>' +
      '</button>';
  }

  function connCard() {
    var s = HA.status;
    var txt = { live: 'Live \u00B7 Home Assistant', demo: 'Demo data (?demo)', connecting: 'Connecting\u2026', offline: 'Reconnecting\u2026', badtoken: 'Bad token' }[s] || s;
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
          var m = e.target.closest('[data-mail]');
          if (m) { mailSheet(); return; }
          var g = e.target.closest('[data-go]');
          if (g) App.go(g.dataset.go);
        });
      }
      loadEvents();
      paint();
    },
    resume: function () { if (V.el && V.el.firstChild) { loadEvents(); paint(); } },
    hide: function () {}
  });
  // Every minute: clock. Weather on the hour.
  App.on('minute', function (n) {
    if (!V.el || !V.el.firstChild) return;
    V.el.querySelector('.h-clock').innerHTML = clock();
    if (n.getMinutes() === 0) { V.el.querySelector('.h-weather').innerHTML = weather(); V.at = 0; loadEvents(); }
  });
  App.on('data', function () { if (App.current === 'home' && V.el) { loadEvents(); paint(); } });
  App.on('ha-status', function () { if (App.current === 'home' && V.el) { loadEvents(); paint(); } });
})();
