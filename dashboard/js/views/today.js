// Today: the glanceable overview. Never scrolls.
// Layout: top strip (clock | weather | tracked presence), then the Coming Up
// hero (next family events + unread mail with bill pills) beside a 2x3 card
// grid (Mode, Watering, Solar, Cellar, Lights, Patio). Attention states
// (doors, leak, garage, watering-now) render as a slim warning strip above
// the cards, never as a hero takeover.
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

  // Tracked people only: a person with a working tracker (device_trackers
  // attr present). Marcus/Connor/Alexa have none - they don't earn a chip.
  function presence() {
    return App.state.people.filter(function (p) {
      if (!p.person) return false;
      var tr = HA.attr(p.person, 'device_trackers');
      return Array.isArray(tr) && tr.length > 0;
    }).map(function (p) {
      var s = HA.state(p.person);
      var home = s === 'home';
      return '<div class="h-who' + (home ? ' is-home' : '') + '" style="' + App.pstyle(p) + '">' +
        App.avatar(p, 36, home ? '' : 'avatar--away') +
        '<span><b>' + p.name + '</b><small>' + (home ? 'Home' : 'Away') + '</small></span></div>';
    }).join('');
  }

  // ------------------------------------------------------------ events
  function stripCalendars() { return C.calendar.entities.filter(function (c) { return c.strip !== false; }); }
  function loadEvents() {
    // Boot race guard: never fetch (and never cache) before HA.url exists;
    // empty results cache for only 60s. Both guards survive from the old view.
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
      V.at = Date.now() - (flat.length ? 0 : 9 * 60000);
      if (App.current === 'home' && V.el) paint();
    });
  }
  function upcoming(n) {
    if (!V.events) return [];
    var now = App.now(), today = App.dayStart(now), out = [];
    for (var i = 0; i < V.events.length && out.length < n; i++) {
      var e = V.events[i];
      if (!e.start) continue;
      if (e.allDay) {
        var s = App.dayStart(e.start);
        var endX = e.end ? App.dayStart(e.end) : App.addDays(s, 1);
        if (today >= s && today < endX) e._ongoing = true; // mid multi-day event
        else if (s > today) e._ongoing = false;
        else continue; // ended before today
      } else {
        if (e.end ? e.end < now : e.start < now) continue;
        e._ongoing = e.start <= now;
      }
      out.push(e);
    }
    return out;
  }

  // ------------------------------------------------------------ hero
  function senderName(from) { return String(from || '').replace(/\s*<.*>\s*$/, '').trim() || String(from || ''); }
  function isBill(m) {
    var hay = String((m.from || '') + ' ' + (m.subject || '')).toLowerCase();
    return (C.mail.billKeywords || []).some(function (k) { return hay.indexOf(k) >= 0; });
  }
  function mailCount() { var n = HA.num(C.mail.sensor); return n === null ? null : n; }

  function hero() {
    // Coming up: next family events, the first one large, then two compact.
    var evs = upcoming(3);
    var evHtml;
    if (!V.events) {
      evHtml = '<div class="cu-big is-mute"><span class="serif">Loading\u2026</span></div>';
    } else if (!evs.length) {
      evHtml = '<div class="cu-big is-mute"><span class="serif">Nothing coming up.</span><small>A quiet week ahead.</small></div>';
    } else {
      var f = evs[0];
      var when = f._ongoing ? (f.allDay ? 'Now through ' + App.fmt.rel(f.end) : 'Happening now')
        : (f.allDay ? App.fmt.rel(f.start) : App.fmt.hour(f.start) + ' \u00B7 ' + App.fmt.rel(f.start));
      evHtml = '<div class="cu-big">' +
        '<div class="label label--on">Coming up \u00B7 ' + App.esc(when) + '</div>' +
        '<div class="cu-title serif">' + App.esc(f.title) + '</div>' +
        '<div class="cu-more">' + evs.slice(1).map(function (e) {
          var w = e._ongoing ? 'now' : (e.allDay ? App.fmt.rel(e.start) : App.fmt.hour(e.start));
          return '<span><b>' + App.esc(w) + '</b> ' + App.esc(e.title) + '</span>';
        }).join('') + '</div></div>';
    }
    // Mail: unread count + deduped senders; bills get a red pill.
    var n = mailCount();
    var mailHtml;
    if (n === null) {
      mailHtml = '<div class="cu-mail is-mute">' + App.icon('box', 20) + '<span>Mail \u00B7 waiting for first sync</span></div>';
    } else if (n === 0) {
      mailHtml = '<button class="cu-mail is-ok" data-mail="1">' + App.icon('check', 20) + '<span>Mail \u00B7 no unread</span></button>';
    } else {
      var msgs = HA.attr(C.mail.sensor, 'messages') || [];
      var names = [], bills = 0;
      msgs.forEach(function (m) {
        var nm = senderName(m.from);
        if (names.indexOf(nm) < 0 && names.length < C.mail.maxSenders) names.push(nm);
        if (isBill(m)) bills++;
      });
      mailHtml = '<button class="cu-mail' + (bills ? ' is-warn' : '') + '" data-mail="1">' + App.icon('bell', 20) +
        '<span><b class="num">' + n + ' unread</b>' + (names.length ? ' \u00B7 ' + names.join(', ') : '') +
        (n - names.length > 0 ? ' +' + (n - names.length) : '') +
        (bills ? ' <i class="cu-billpill">' + bills + ' bill' + (bills > 1 ? 's' : '') + '</i>' : '') +
        '</span></button>';
    }
    return '<div class="h-hero2">' + evHtml + mailHtml + '</div>';
  }

  // Attention strip: replaces the old hero takeover. Slim, above the cards.
  function warnStrip() {
    var S = C.security;
    var alerts = [];
    if (HA.on(S.leakAggregate)) alerts.push({ t: 'Water leak detected', go: 'security' });
    if (HA.state(S.garage.cover) && HA.state(S.garage.cover) !== 'closed') alerts.push({ t: 'Garage ' + HA.state(S.garage.cover), go: 'security' });
    S.doors.forEach(function (d) { if (HA.on(d.id)) alerts.push({ t: d.name + ' open', go: 'security' }); });
    if (HA.on(S.garage.problem)) alerts.push({ t: 'Garage problem', go: 'security' });
    if (HA.on(C.watering.programRunning)) alerts.push({ t: 'Watering now', go: 'watering' });
    if (!alerts.length) return '';
    return '<div class="h-warnstrip">' + alerts.map(function (a) {
      return '<button class="h-warnpill" data-go="' + a.go + '"><i></i>' + App.esc(a.t) + '</button>';
    }).join('') + '</div>';
  }

  // ------------------------------------------------------------ patio card
  function patioCard() {
    var P = C.patio;
    var lightsOn = HA.on(P.lights[0].id);
    var fanPreset = HA.attr(P.fan.state, 'preset_mode');
    var fanOn = HA.on(P.fan.power) || (fanPreset !== null && fanPreset !== undefined);
    return '<button class="card h-card h-patio" data-patio="1">' +
      '<div class="label">Patio</div>' +
      '<div class="h-patio-row' + (lightsOn ? ' is-on' : '') + '">' + App.icon('bulb', 22) + '<span>Lights ' + (lightsOn ? 'On' : 'Off') + '</span></div>' +
      '<div class="h-patio-row' + (fanOn ? ' is-on' : '') + '">' + App.icon('sliders', 22) + '<span>Fan ' + (fanOn ? (fanPreset || 'On') : 'Off') + ' <small>tap for controls</small></span></div>' +
      '</button>';
  }

  function patioSheet() {
    var P = C.patio;
    var lightsOn = HA.on(P.lights[0].id);
    var fanPreset = HA.attr(P.fan.state, 'preset_mode');
    var fanOn = HA.on(P.fan.power) || (fanPreset !== null && fanPreset !== undefined);
    App.sheet(
      '<div class="ac-sheet">' +
      '<div class="label">Patio</div>' +
      '<div class="rz-sheet-actions">' +
      '<button class="rz-act' + (lightsOn ? ' is-on' : '') + '" data-pl="1">' + App.icon('bulb', 22) + 'Lights ' + (lightsOn ? 'On \u00B7 tap to turn off' : 'Off \u00B7 tap to turn on') + '</button>' +
      '<div class="label">Fan <small class="h-patio-stale">RF remote \u00B7 state is best-known</small></div>' +
      '<div class="ac-ventrow">' +
      '<button class="ac-ventbtn' + (fanOn ? ' is-active' : '') + '" data-pfan="on">' + App.icon('play', 16) + 'On</button>' +
      '<button class="ac-ventbtn' + (!fanOn ? ' is-active' : '') + '" data-pfan="off">Off</button>' +
      '<button class="ac-ventbtn" data-pfan="low">Low</button>' +
      '<button class="ac-ventbtn" data-pfan="medium">Medium</button>' +
      '<button class="ac-ventbtn" data-pfan="high">High</button>' +
      '<button class="ac-ventbtn" data-pfan="light">Light</button>' +
      '</div></div></div>',
      {
        onMount: function (sheet) {
          sheet.querySelector('[data-pl]').addEventListener('click', function () {
            HA.callService(lightsOn ? 'light.turn_off' : 'light.turn_on', { entity_id: P.lights[0].id });
          });
          sheet.querySelectorAll('[data-pfan]').forEach(function (b) {
            b.addEventListener('click', function () {
              // Always call the script regardless of mirror state (RF, no feedback).
              HA.callScript(P.fan.scripts[b.dataset.pfan]).catch(function () {
                App.toast('Fan command failed', { tone: 'error', icon: 'bolt' });
              });
            });
          });
        }
      });
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
        var bill = isBill(m);
        return '<div class="li-item cl-mail-item' + (bill ? ' is-bill' : '') + '">' +
          '<span class="ch-head">' + App.esc(senderName(m.from)) + (bill ? ' <i class="cu-billpill">bill</i>' : '') + '</span>' +
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
    return card('h-mode', 'security') +
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
      '</button>' +
      patioCard();
  }

  function connCard() {
    var s = HA.status;
    var txt = { live: 'Live \u00B7 Home Assistant', demo: 'Demo data (?demo)', connecting: 'Connecting\u2026', offline: 'Reconnecting\u2026', badtoken: 'Bad token' }[s] || s;
    var prof = C.profile ? C.profile().name : '';
    return '<div class="h-conn' + (s === 'live' ? '' : ' is-warn') + '">' + App.icon(s === 'live' ? 'check' : 'bolt', 20) +
      '<span>' + txt + (prof ? ' \u00B7 ' + App.esc(prof) : '') + '</span></div>';
  }

  function paint() {
    var el = V.el;
    el.querySelector('.h-clock').innerHTML = clock();
    el.querySelector('.h-weather').innerHTML = weather();
    el.querySelector('.h-presence').innerHTML = presence();
    el.querySelector('.h-hero-slot').innerHTML = hero();
    el.querySelector('.h-warn-slot').innerHTML = warnStrip();
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
          '<div class="h-main"><div class="h-hero-slot"></div><div class="h-right"><div class="h-warn-slot"></div><div class="h-cards"></div></div></div>' +
          '<div class="h-side"><div class="h-conn-slot"></div></div>' +
          '</div>';
        el.addEventListener('click', function (e) {
          var m = e.target.closest('[data-mail]');
          if (m) { mailSheet(); return; }
          var pt = e.target.closest('[data-patio]');
          if (pt) { patioSheet(); return; }
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
  App.on('minute', function (n) {
    if (!V.el || !V.el.firstChild) return;
    V.el.querySelector('.h-clock').innerHTML = clock();
    if (n.getMinutes() === 0) { V.el.querySelector('.h-weather').innerHTML = weather(); V.at = 0; loadEvents(); }
  });
  App.on('data', function () { if (App.current === 'home' && V.el) { loadEvents(); paint(); } });
  App.on('ha-status', function () { if (App.current === 'home' && V.el) { loadEvents(); paint(); } });
})();
