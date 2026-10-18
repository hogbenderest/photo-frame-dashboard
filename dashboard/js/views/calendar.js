// Calendar: 14-day agenda across the configured HA calendars. v1 is an agenda
// (not a month grid): a wall display reads "what's coming", not "what's the
// layout of June". Google Calendar appears here once the 2lawlerst@gmail.com
// integration is configured in HA; until then the irrigation calendar shows.
(function () {
  'use strict';
  var C = window.HACONFIG, HA = window.HA, V = { cache: null, at: 0 };

  function load() {
    if (V.cache && Date.now() - V.at < 10 * 60000) return Promise.resolve(V.cache);
    if (!HA.url) { V.cache = null; V.at = 0; return Promise.resolve([]); } // boot race, retry next show
    var start = new Date(App.now()); start.setHours(0, 0, 0, 0);
    var end = App.addDays(start, C.calendar.days);
    return Promise.all(C.calendar.entities.map(function (cal) {
      return HA.calendarEvents(cal.id, start.toISOString(), end.toISOString())
        .then(function (events) {
          return (events || []).map(function (e) {
            var sd = e.start && (e.start.dateTime || e.start.date);
            var ed = e.end && (e.end.dateTime || e.end.date);
            return {
              cal: cal.name, color: cal.color, title: e.summary || '(untitled)',
              start: sd ? new Date(sd) : null, end: ed ? new Date(ed) : null,
              allDay: !!(e.start && e.start.date), loc: e.location || '', desc: e.description || ''
            };
          });
        }).catch(function () { return []; });
    })).then(function (all) {
      var flat = [];
      all.forEach(function (l) { flat = flat.concat(l); });
      flat.sort(function (a, b) { return (a.start || 0) - (b.start || 0); });
      V.cache = flat;
      V.at = Date.now() - (flat.length ? 0 : 9 * 60000); // empty results cache 60s only
      return flat;
    });
  }

  function dayCard(day, events, idx) {
    var isToday = App.sameDay(day, App.now());
    var dayEv = events.filter(function (e) { return e.start && App.sameDay(e.start, day); });
    return '<div class="cal-day' + (isToday ? ' is-today' : '') + (idx > 6 ? ' cal-day--wk2' : '') + '" data-day="' + day.toISOString() + '">' +
      '<div class="cal-day-head"><span class="cal-day-dow">' + App.fmt.dayShort(day) + '</span>' +
      '<b class="num">' + day.getDate() + '</b><span class="cal-day-mon">' + App.fmt.monthShort(day) + '</span></div>' +
      '<div class="cal-day-list">' + (dayEv.length ? dayEv.map(function (e) {
        return '<button class="cal-ev' + (e.allDay ? ' is-allday' : '') + '" data-ev="' + e.title.replace(/"/g, '') + '|' + (e.start ? e.start.getTime() : '') + '" style="--c:' + e.color + '">' +
          (e.allDay ? '<span class="cal-ev-t">All day</span>' : '<span class="cal-ev-t num">' + App.fmt.time(e.start, false) + '</span>') +
          '<span class="cal-ev-n">' + App.esc(e.title) + '</span><i class="cal-ev-dot"></i></button>';
      }).join('') : '<span class="cal-free">-</span>') + '</div></div>';
  }

  function paint(events) {
    var start = new Date(App.now()); start.setHours(0, 0, 0, 0);
    var days = [];
    for (var i = 0; i < C.calendar.days; i++) days.push(App.addDays(start, i));
    V.el.innerHTML = '<div class="cal-agenda-wrap">' +
      '<div class="cal-agenda-head"><div class="label">Next ' + C.calendar.days + ' days</div>' +
      '<div class="cal-legend">' + C.calendar.entities.map(function (c) {
        return '<span style="--c:' + c.color + '"><i></i>' + App.esc(c.name) + '</span>';
      }).join('') + '</div></div>' +
      '<div class="cal-grid">' + days.map(function (d, i) { return dayCard(d, events, i); }).join('') + '</div>' +
      '</div>';
    if (!V.el._clickBound) {
      V.el._clickBound = true;
      V.el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ev]');
      if (!b) return;
      var parts = b.dataset.ev.split('|');
      var ev = (V.cache || []).filter(function (x) { return x.title === parts[0] && x.start && String(x.start.getTime()) === parts[1]; })[0];
      if (!ev) return;
      App.sheet(
        '<div class="cal-detail">' +
        '<div class="label">Event \u00B7 <span style="color:' + ev.color + '">' + App.esc(ev.cal) + '</span></div>' +
        '<div class="serif cal-detail-name">' + App.esc(ev.title) + '</div>' +
        '<div class="cl-detail-grid">' +
        (ev.start ? '<div class="cl-kv"><span>When</span><b>' + App.fmt.day(ev.start) + ' ' + App.fmt.range(ev.start, ev.end || ev.start) + '</b></div>' : '') +
        (ev.loc ? '<div class="cl-kv"><span>Where</span><b>' + App.esc(ev.loc) + '</b></div>' : '') +
        (ev.desc ? '<div class="cl-kv"><span>Notes</span><b>' + App.esc(ev.desc) + '</b></div>' : '') +
        '</div></div>');
    });
    }
  }

  function emptyState() {
    return '<div class="cl-empty">' + App.icon('calendar', 44) +
      '<div class="serif">No calendars yet</div>' +
      '<small>' + App.esc('Only calendar.opensprinkler_schedule exists. Configure the HA Google Calendar integration for 2lawlerst@gmail.com, then add the calendar entity IDs to js/ha-config.js.') + '</small></div>';
  }

  App.register('calendar', {
    show: function (el) {
      V.el = el;
      var usable = C.calendar.entities.filter(function (c) { return !HA.unavailable(c.id); });
      if (!usable.length) { V.el.innerHTML = '<div class="cl-wrap">' + emptyState() + '</div>'; return; }
      V.el.innerHTML = '<div class="cl-empty">' + App.icon('calendar', 44) + '<div class="serif">Loading\u2026</div></div>';
      load().then(function (events) { if (V.el) paint(events); });
    },
    resume: function () { if (V.el) load().then(function (events) { if (V.el) paint(events); }); },
    hide: function () {}
  });
  App.on('data', function () {
    // HA states may only have arrived after the first render (live connect).
    if (App.current === 'calendar' && V.el) App.views.calendar._dirty = true, App.go('calendar', { rerender: true });
  });
})();
