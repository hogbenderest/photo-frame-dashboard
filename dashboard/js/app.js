// Core shell: router, demo clock, idle/ambient, toasts, sheets, helpers.
// Data comes from js/ha.js (live HA or demo fixture); people from js/ha-config.js.
(function () {
  'use strict';
  var P = window.HAPEOPLE;
  var App = window.App = { state: { people: P.people, family: P.family }, views: {}, current: null, mode: 'day', calMode: 'normal' };
  var $ = App.$ = function (s, r) { return (r || document).querySelector(s); };
  App.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // ------------------------------------------------------------ events
  var handlers = {};
  App.on = function (e, fn) { (handlers[e] = handlers[e] || []).push(fn); };
  App.emit = function (e, a) { (handlers[e] || []).forEach(function (fn) { fn(a); }); };

  // ------------------------------------------------------------ time
  var offset = 0;
  App.now = function () { return new Date(Date.now() + offset); };
  App.setTime = function (h, m) {
    if (h == null) offset = 0;
    else { var d = new Date(); d.setHours(h, m, 0, 0); offset = d - Date.now(); }
    lastMin = -1;
    App.emit('time');
    App.rerender();
  };
  App.dayStart = function (d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  App.addDays = function (d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; };
  App.sameDay = function (a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); };
  App.isNight = function () { var h = App.now().getHours(); return h >= 22 || h < 6; };

  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Nov', 'Dec'];
  App.fmt = {
    time: function (d, ampm) {
      var h = d.getHours(), m = d.getMinutes();
      var s = (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m;
      return ampm === false ? s : s + ' ' + (h >= 12 ? 'PM' : 'AM');
    },
    hour: function (d) {
      var h = d.getHours(), m = d.getMinutes();
      return (h % 12 || 12) + (m ? ':' + (m < 10 ? '0' : '') + m : '') + ' ' + (h >= 12 ? 'PM' : 'AM');
    },
    ampm: function (d) { return d.getHours() >= 12 ? 'PM' : 'AM'; },
    range: function (a, b) {
      var same = App.fmt.ampm(a) === App.fmt.ampm(b);
      return (same ? App.fmt.time(a, false) : App.fmt.time(a)) + ' - ' + App.fmt.time(b);
    },
    day: function (d) { return DAYS[d.getDay()]; },
    dayShort: function (d) { return DAYS[d.getDay()].slice(0, 3); },
    month: function (d) { return MONTHS[d.getMonth()]; },
    monthShort: function (d) { return MON_SHORT[d.getMonth()]; },
    mins: function (m) {
      m = Math.max(0, Math.round(m));
      if (m < 60) return m + ' min';
      var h = Math.floor(m / 60), r = m % 60;
      return h + ' hr' + (r ? ' ' + r + ' min' : '');
    },
    rel: function (d) {
      var t = App.dayStart(App.now()), x = App.dayStart(d), diff = Math.round((x - t) / 864e5);
      if (diff === 0) return 'Today';
      if (diff === 1) return 'Tomorrow';
      if (diff === -1) return 'Yesterday';
      return DAYS[d.getDay()];
    }
  };
  App.esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  // ------------------------------------------------------------ icons + people
  App.icon = function (name, size, cls) {
    size = size || 24;
    return '<svg class="i ' + (cls || '') + '" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (window.ICONS[name] || '') + '</svg>';
  };
  App.person = function (id) {
    if (id === 'himack' || id === 'family' || id === 'any') return P.family;
    return P.byId[id] || P.family;
  };
  App.pstyle = function (p) {
    if (typeof p === 'string') p = App.person(p);
    return '--c:' + p.color + ';--c-rgb:' + p.rgb + ';--c-ink:' + p.ink;
  };
  App.avatar = function (p, size, cls) {
    if (typeof p === 'string') p = App.person(p);
    size = size || 48;
    return '<span class="avatar ' + (cls || '') + '" style="' + App.pstyle(p) + ';width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.42) + 'px">' + (p.id === 'himack' ? '★' : p.name[0]) + '</span>';
  };
  App.dots = function (ids, size) {
    return '<span class="dots">' + ids.map(function (id) { return '<i style="' + App.pstyle(id) + (size ? ';width:' + size + 'px;height:' + size + 'px' : '') + '"></i>'; }).join('') + '</span>';
  };

  // ------------------------------------------------------------ weather (live HA)
  var COND = { 'clear-night': 'moon', clear: 'sun', sunny: 'sun', 'partlycloudy': 'partly', partlycloudy: 'partly', cloudy: 'cloud', 'cloudy': 'cloud', 'rainy': 'rain', rain: 'rain', 'pouring': 'rain', 'lightning': 'rain', 'snowy': 'cloud', 'fog': 'cloud', 'exceptional': 'sun', 'windy': 'cloud', humid: 'cloud' };
  var LABEL = { sun: 'Sunny', moon: 'Clear', partly: 'Partly cloudy', cloud: 'Overcast', rain: 'Rain' };
  function condIcon(cond) { return COND[cond] || 'cloud'; }
  App.condIcon = condIcon;
  App.hourly = function (count) {
    var HA = window.HA, C = window.HACONFIG;
    var f = HA.attr(C.today.weatherHourly, 'forecast') || [];
    var out = [], now = App.now();
    for (var i = 0; i < count && i < f.length; i++) {
      var dt = new Date(f[i].datetime || f[i].dt_iso || Date.now());
      if (dt < new Date(now - 45 * 60000)) continue; // skip past hours
      var label = i === 0 && App.sameDay(dt, now) ? 'Now' : ((dt.getHours() % 12 || 12) + (dt.getHours() >= 12 ? 'p' : 'a'));
      out.push({ h: dt.getHours(), t: Math.round(f[i].temperature), c: condIcon(f[i].condition), p: f[i].precipitation_probability || 0, label: label });
      if (out.length >= count) break;
    }
    return out;
  };
  App.weatherNow = function () {
    var HA = window.HA, C = window.HACONFIG;
    var cond = HA.state(C.today.weather) || 'unknown';
    var temp = HA.attr(C.today.weather, 'temperature');
    var hours = App.hourly(10);
    var hi = null, lo = null;
    hours.forEach(function (h) { if (hi === null || h.t > hi) hi = h.t; if (lo === null || h.t < lo) lo = h.t; });
    var rainAt = -1;
    for (var i = 0; i < hours.length; i++) if (hours[i].p >= 50) { rainAt = hours[i].h; break; }
    var summary, advice;
    if (rainAt === hours[0] && hours[0]) { summary = 'Rain around now'; advice = 'Umbrella weather'; }
    else if (rainAt > -1) { summary = 'Rain from ' + ((rainAt % 12 || 12) + (rainAt >= 12 ? ' PM' : ' AM')); advice = 'Grab a rain jacket'; }
    else { summary = temp < 15 ? 'Cool and clear' : 'Dry all day'; advice = temp < 15 ? 'Jacket weather' : 'Light layers'; }
    return { temp: Math.round(temp), cond: condIcon(cond), label: LABEL[condIcon(cond)] || 'Weather', hi: hi, lo: lo, summary: summary, advice: advice };
  };

  // ------------------------------------------------------------ router
  App.register = function (name, view) { App.views[name] = view; };
  function minuteKey() { return Math.floor(App.now().getTime() / 60000); }
  function build(name, opts) {
    var view = App.views[name];
    view.show($('#view-' + name), opts || {});
    view._built = true; view._dirty = false; view._min = minuteKey();
  }
  App.go = function (name, opts) {
    opts = opts || {};
    if (!App.views[name]) name = 'home';
    if (App.current && App.current !== name && App.views[App.current].hide) App.views[App.current].hide();
    App.$$('.view').forEach(function (v) { v.classList.toggle('is-active', v.dataset.view === name); });
    App.$$('.rail-item').forEach(function (b) { b.classList.toggle('is-active', b.dataset.go === name); });
    App.current = name;
    var view = App.views[name];
    if (!view._built || view._dirty || opts.rerender || (view.minutely && view._min !== minuteKey())) build(name, opts);
    else if (view.resume) view.resume($('#view-' + name));
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
  };
  function prebuild(name) {
    var el = $('#view-' + name), view = App.views[name];
    build(name);
    if (view.hide) view.hide();
    el.classList.add('is-warming');
    el.offsetHeight;
    el.classList.remove('is-warming');
  }
  var refreshTimer = null;
  function refreshStale(delay) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function next() {
      var name = Object.keys(App.views).filter(function (k) {
        var v = App.views[k];
        return k !== App.current && (!v._built || v._dirty);
      })[0];
      if (!name) return;
      prebuild(name);
      refreshTimer = setTimeout(next, 400);
    }, delay);
  }
  function markStale() {
    Object.keys(App.views).forEach(function (k) { if (k !== App.current) App.views[k]._dirty = true; });
    refreshStale(1500);
  }
  App.on('data', markStale);
  App.on('data', function () { App.applyNightTheme(); });
  App.on('time', markStale);
  App.rerender = function () {
    if (App.current) App.views[App.current].show($('#view-' + App.current), { rerender: true });
  };

  // ------------------------------------------------------------ toasts (single, with undo)
  var toastTimer;
  App.toast = function (html, opts) {
    opts = opts || {};
    var box = $('#toasts');
    box.innerHTML = '';
    clearTimeout(toastTimer);
    var ms = opts.ms || 5000;
    var t = document.createElement('div');
    t.className = 'toast' + (opts.tone ? ' toast--' + opts.tone : '');
    t.style.setProperty('--ms', ms + 'ms');
    t.innerHTML = (opts.icon ? App.icon(opts.icon, 26) : '') + '<span class="toast-msg">' + html + '</span>' +
      (opts.undo ? '<button class="toast-undo">' + App.icon('undo', 22) + 'Undo</button>' : '');
    box.appendChild(t);
    t.classList.add('is-in');
    function kill() { t.remove(); }
    toastTimer = setTimeout(kill, ms);
    if (opts.undo) t.querySelector('.toast-undo').addEventListener('click', function () { clearTimeout(toastTimer); opts.undo(); kill(); });
  };

  // ------------------------------------------------------------ sheets (modal cards)
  App.sheet = function (html, opts) {
    opts = opts || {};
    var layer = $('#sheetLayer');
    layer.innerHTML = '<div class="sheet-scrim"></div><div class="sheet ' + (opts.cls || '') + '">' +
      '<button class="sheet-x" data-close aria-label="Close">' + App.icon('x', 28) + '</button>' + html + '</div>';
    layer.classList.add('is-open');
    function close() {
      if (!layer.classList.contains('is-open')) return;
      layer.classList.remove('is-open');
      if (opts.onClose) opts.onClose();
      layer.innerHTML = '';
    }
    App.closeSheet = close;
    layer.querySelector('.sheet-scrim').addEventListener('click', close);
    App.$$('[data-close]', layer).forEach(function (b) { b.addEventListener('click', close); });
    if (opts.onMount) opts.onMount(layer.querySelector('.sheet'), close);
    return close;
  };
  App.closeSheet = function () {};

  App.centerOf = function (el) {
    var stage = $('#stage').getBoundingClientRect(), r = el.getBoundingClientRect(), k = stage.width / 1280;
    return { x: (r.left + r.width / 2 - stage.left) / k, y: (r.top + r.height / 2 - stage.top) / k };
  };

  // ------------------------------------------------------------ press-and-hold
  App.hold = function (el, ms, cb) {
    var t = null;
    el.style.setProperty('--hold', ms + 'ms');
    el.addEventListener('pointerdown', function () {
      if (cb.enabled && !cb.enabled()) return;
      el.classList.add('is-holding');
      t = setTimeout(function () { t = null; el.classList.remove('is-holding'); cb.done(); }, ms);
    });
    function cancel(e) {
      if (!t) return;
      clearTimeout(t); t = null;
      el.classList.remove('is-holding');
      if (cb.cancel && e.type === 'pointerup') cb.cancel();
    }
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointerleave', cancel);
    el.addEventListener('pointercancel', cancel);
  };

  // ------------------------------------------------------------ night theme (sun-driven, profile-gated)
  // Computes once per data event; classList.toggle with a boolean is a no-op
  // when the value hasn't changed. Falls back to App.isNight() if sun.sun is
  // unavailable (boot race, HA offline). sun.sun: 'below_horizon' = night.
  App.applyNightTheme = function () {
    var HC = window.HACONFIG;
    if (!HC) return;
    var prof = HC.profile();
    if (!prof.nightMode) return;
    var sun = HA.state('sun.sun');
    var isNight = (sun === 'below_horizon') || (sun === null || sun === 'unavailable' || sun === 'unknown' ? App.isNight() : false);
    document.getElementById('stage').classList.toggle('night-theme', isNight);
  };

  // ------------------------------------------------------------ modes: day / ambient / night
  App.setMode = function (m) {
    var stage = $('#stage');
    App.mode = m;
    stage.dataset.mode = m;
    App.emit('mode', m);
  };

  // ------------------------------------------------------------ idle
  App.idle = { home: 60, ambient: 120 };
  var idleSec = 0;
  // Idle return target is the PROFILE LANDING, not a hard-coded 'home':
  // bedroom frames (landing: 'room') must fall back to their Room after a
  // stray tap-and-walk-away, not to the household overview. This was the
  // "boots to #home" bug - the landing correction ran, then the idle timer
  // navigated back to home 60 s later.
  function idleTarget() {
    var p = HACONFIG.profile && HACONFIG.profile();
    return (p && p.landing) || 'home';
  }
  function onIdleTick() {
    idleSec++;
    var blocked = $('#takeover').classList.contains('is-open');
    if (App.mode === 'nightdash' && idleSec >= 20) { App.setMode('night'); return; }
    if (App.mode !== 'day' || blocked) return;
    if (idleSec === App.idle.home && App.current !== idleTarget() && App.current !== 'photos') { App.closeSheet(); App.go(idleTarget()); }
    if (idleSec >= App.idle.ambient) {
      App.closeSheet();
      App.go(idleTarget());
      App.setMode(App.isNight() ? 'night' : 'ambient');
    }
  }
  App.resetIdle = function () { idleSec = 0; };

  // ------------------------------------------------------------ stage scaling (desktop preview only)
  function fit() {
    var s = Math.min(window.innerWidth / 1280, window.innerHeight / 800);
    $('#stage').style.transform = Math.abs(s - 1) < 0.01 ? '' : 'scale(' + s + ')';
  }

  // ------------------------------------------------------------ clock tick
  var lastMin = -1;
  function tick() {
    var n = App.now();
    App.emit('second', n);
    if (n.getMinutes() !== lastMin) {
      lastMin = n.getMinutes();
      $('#railClock').innerHTML = '<b>' + App.fmt.time(n, false) + '</b><span>' + App.fmt.ampm(n) + '</span>';
      App.emit('minute', n);
    }
    onIdleTick();
  }

  // ------------------------------------------------------------ boot
  App.start = function () {
    fit();
    window.addEventListener('resize', fit);
    $('#rail').addEventListener('pointerdown', function (e) {
      var b = e.target.closest('[data-go]');
      if (b && e.button === 0) App.go(b.dataset.go);
    });
    $('#rail').addEventListener('click', function (e) {
      var b = e.target.closest('[data-go]');
      if (b && e.detail === 0) App.go(b.dataset.go);
    });
    document.addEventListener('pointerdown', App.resetIdle, true);
    window.addEventListener('hashchange', function () { App.go(location.hash.slice(1)); });
    // Landing view is profile-driven: bedroom frames open on their Room.
    var landing = (HACONFIG.profile && HACONFIG.profile().landing) || 'home';
    App.go(location.hash.slice(1) || landing);
    tick();
    setInterval(tick, 1000);
    App.emit('ready');
    refreshStale(1500);
  };
  document.addEventListener('DOMContentLoaded', function () { App.start(); });
})();
