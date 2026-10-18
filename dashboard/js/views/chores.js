// Chores (HIMACK): definitions live in the "Chore Definitions" to-do list
// (editable from any phone via the HA app), each item plain text:
//   Kyle | Make bed | daily
//   HIMACK | Bins out | Thu | 1        (4th segment = stars, optional)
// Rules: tick a definition to pause it; delete the item to remove the rule;
// malformed rows are listed on the view. Items are keyed by uid for
// update/remove (HA's `item` field accepts uid or summary; uid is exact even
// with duplicate summaries). Once a day the completed items are cleared so
// summaries never collide across days.
(function () {
  'use strict';
  var C = window.HACONFIG, HA = window.HA, V = { items: {}, defs: null, errs: [] };

  function todayISO() { var d = App.now(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

  var DAYS = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
  function parseDay(dayRaw) {
    var d = String(dayRaw || '').trim().toLowerCase();
    if (d === 'daily' || d === '') return 'daily';
    if (d === 'weekday') return 'weekday';
    if (d === 'weekend' || d === 'weekends') return 'weekend';
    if (DAYS[d] !== undefined) return DAYS[d];
    if (/^[0-6]$/.test(d)) return +d;
    return null;
  }
  function dueToday(dayDef) {
    var dow = App.now().getDay();
    if (dayDef === 'daily') return true;
    if (dayDef === 'weekday') return dow >= 1 && dow <= 5;
    if (dayDef === 'weekend') return dow === 0 || dow === 6;
    return dayDef === dow;
  }
  function parseDefinitions(items) {
    var out = [], errs = [];
    items.forEach(function (it) {
      if (it.status === 'completed') return; // ticked definition = paused
      var parts = it.summary.split('|').map(function (p) { return p.trim(); });
      if (parts.length < 3) { errs.push(it.summary + ' \u00B7 expected "Who | Chore | Day"'); return; }
      var who = parts[0].toLowerCase();
      if (who !== 'himack' && !App.person(who).id) { errs.push(parts[0] + ' \u00B7 unknown person (use ' + App.state.people.map(function (p) { return p.name; }).join('/') + ' or HIMACK)'); return; }
      var day = parseDay(parts[2]);
      if (day === null) { errs.push(it.summary + ' \u00B7 unknown day "' + parts[2] + '"'); return; }
      out.push({ who: who, title: parts[1], day: day, stars: parts[3] ? parseInt(parts[3], 10) || 0 : 0 });
    });
    return { defs: out, errs: errs };
  }

  function entityIdFor(who) {
    return who === 'himack' ? C.chores.familyTodo : App.person(who).todo;
  }

  function fetchList(entityId) {
    if (!entityId || HA.unavailable(entityId)) return Promise.resolve();
    return HA.todoItems(entityId).then(function (items) {
      V.items[entityId] = items;
    }).catch(function () {
      if (!V.items[entityId]) V.items[entityId] = [];
    });
  }

  // Once per calendar day: clear completed items so a summary never appears
  // on two days at once (summary-keyed lookups stay unambiguous).
  function dailyCleanup() {
    var key = 'frame-chore-cleanup';
    var today = todayISO();
    try {
      if (localStorage.getItem(key) === today) return;
      localStorage.setItem(key, today);
    } catch (e) { return; }
    Object.keys(V.items).forEach(function (entityId) {
      if (V.items[entityId] && V.items[entityId].some(function (it) { return it.status === 'completed'; })) {
        HA.callService('todo.remove_completed_items', { entity_id: entityId })
          .then(function () { return fetchList(entityId); });
      }
    });
  }

  // Ensure today's due items exist. Run after all lists are fetched.
  function reconcile(defs) {
    defs.forEach(function (d) {
      if (!dueToday(d.day)) return;
      var entityId = entityIdFor(d.who);
      if (!entityId || HA.unavailable(entityId)) return;
      var today = todayISO();
      var exists = (V.items[entityId] || []).some(function (it) {
        return it.summary === d.title && (!it.due_date || it.due_date <= today);
      });
      if (!exists) {
        HA.callService('todo.add_item', { entity_id: entityId, item: d.title, due_date: today })
          .then(function () { return fetchList(entityId); })
          .then(function () { if (App.current === 'tasks' && V.el) paint(); });
      }
    });
  }

  function personColumn(p) {
    var entityId = p.todo;
    if (!entityId || HA.unavailable(entityId)) {
      return '<div class="ch-col" style="' + App.pstyle(p) + '">' +
        '<div class="ch-head">' + App.avatar(p, 34) + '<b>' + p.name + '</b></div>' +
        '<div class="ch-missing"><small>Missing <b class="num">' + App.esc(entityId || 'todo.chores_' + p.id) + '</b>. Create it in HA: Settings \u2192 Helpers \u2192 Local to-do list.</small></div></div>';
    }
    var items = V.items[entityId];
    if (!items) {
      return '<div class="ch-col" style="' + App.pstyle(p) + '">' +
        '<div class="ch-head">' + App.avatar(p, 34) + '<b>' + p.name + '</b></div>' +
        '<div class="ch-missing"><small>Loading\u2026</small></div></div>';
    }
    var today = todayISO();
    var due = items.filter(function (it) { return it.status !== 'completed' && (!it.due_date || it.due_date <= today); });
    var done = items.filter(function (it) { return it.status === 'completed'; });
    var total = due.length + done.length;
    return '<div class="ch-col" style="' + App.pstyle(p) + '">' +
      '<div class="ch-head">' + App.avatar(p, 34) + '<b>' + p.name + '</b>' +
      '<span class="ch-count num' + (total && done.length === total ? ' is-done' : '') + '">' + done.length + '/' + total + '</span></div>' +
      '<div class="ch-items">' +
      (due.concat(done).slice(0, 10).map(function (it) {
        var isDone = it.status === 'completed';
        var key = it.uid || it.summary;
        return '<button class="ch-item' + (isDone ? ' is-done' : '') + '" data-check="' + App.esc(entityId) + '" data-key="' + App.esc(key) + '" data-status="' + it.status + '">' +
          '<i>' + App.icon('check', 18) + '</i><span>' + App.esc(it.summary) + '</span></button>';
      }).join('') || '<div class="ch-free serif"><i>Nothing due</i></div>') +
      '</div></div>';
  }

  function familyColumn() {
    var p = App.person('himack');
    var entityId = C.chores.familyTodo;
    if (!entityId || HA.unavailable(entityId)) return ''; // optional list
    var items = V.items[entityId] || [];
    return '<div class="ch-col ch-col--family" style="' + App.pstyle(p) + '">' +
      '<div class="ch-head">' + App.avatar(p, 30) + '<b>HIMACK</b></div>' +
      '<div class="ch-items">' + (items.slice(0, 8).map(function (it) {
        var isDone = it.status === 'completed';
        var key = it.uid || it.summary;
        return '<button class="ch-item' + (isDone ? ' is-done' : '') + '" data-check="' + App.esc(entityId) + '" data-key="' + App.esc(key) + '" data-status="' + it.status + '">' +
          '<i>' + App.icon('check', 18) + '</i><span>' + App.esc(it.summary) + '</span></button>';
      }).join('') || '<div class="ch-free serif"><i>Nothing</i></div>') + '</div>' +
      '</div>';
  }

  function definitionsNote() {
    var def = C.chores.definitionsEntity;
    var hint = 'Define recurring chores in the <b>Chore Definitions</b> list from any phone: <span class="num">Who | Chore | Day</span> e.g. <span class="num">Kyle | Make bed | daily</span>. Tick a definition to pause it; delete it to remove the rule.';
    if (HA.unavailable(def)) {
      return '<div class="ch-note ch-note--warn">Missing <b class="num">' + App.esc(def) + '</b>. Create it in HA: Settings \u2192 Helpers \u2192 Local to-do list, then add definitions.</div>';
    }
    var n = (V.defs || []).length;
    var html = '<div class="ch-note">' + hint + ' <b class="num">' + n + '</b> definition' + (n === 1 ? '' : 's') + ' active.</div>';
    if (V.errs && V.errs.length) {
      html += '<div class="ch-note ch-note--warn">Couldn\u2019t read ' + V.errs.length + ' definition(s):<br>' + V.errs.map(App.esc).join('<br>') + '</div>';
    }
    return html;
  }

  function paint() {
    if (!V.el) return;
    var fam = familyColumn();
    V.el.innerHTML = '<div class="chores-wrap' + (fam ? ' has-family' : '') + '">' +
      '<div class="ch-grid">' + App.state.people.map(personColumn).join('') + fam + '</div>' +
      definitionsNote() +
      '</div>';
    bind();
  }

  function loadAll() {
    var ids = {};
    App.state.people.forEach(function (p) { ids[p.todo] = true; });
    ids[C.chores.familyTodo] = true;
    ids[C.chores.definitionsEntity] = true;
    return Promise.all(Object.keys(ids).map(fetchList)).then(function () {
      dailyCleanup();
      var parsed = parseDefinitions(V.items[C.chores.definitionsEntity] || []);
      V.defs = parsed.defs; V.errs = parsed.errs;
      reconcile(parsed.defs);
      if (App.current === 'tasks' && V.el) paint();
    });
  }

  function bind() {
    if (V.el._bound) return; V.el._bound = true;
    V.el.addEventListener('click', function (e) {
      var it = e.target.closest('[data-check]');
      if (!it) return;
      var to = it.dataset.status === 'completed' ? 'needs_action' : 'completed';
      // HA's `item` accepts the uid (exact, duplicate-safe) or the summary.
      HA.callService('todo.update_item', { entity_id: it.dataset.check, item: it.dataset.key, status: to })
        .then(function () { HA.invalidateTodo(it.dataset.check); return fetchList(it.dataset.check); })
        .then(function () { if (App.current === 'tasks' && V.el) paint(); })
        .catch(function () { App.toast('Couldn\u2019t update the chore', { tone: 'error', icon: 'bolt' }); });
    });
  }

  App.register('tasks', {
    show: function (el) { V.el = el; paint(); loadAll(); },
    resume: function () { if (V.el) { paint(); loadAll(); } },
    hide: function () {}
  });
  App.on('data', function () { if (App.current === 'tasks' && V.el) loadAll(); });
})();
