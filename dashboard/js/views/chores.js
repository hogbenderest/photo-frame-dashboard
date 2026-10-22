// Chores (HIMACK): large person-summary cards (wall display readable at 10 ft).
// Tap a card to open a detail sheet with large checklist rows.
// Definitions live in the "Chore Definitions" to-do list: `Who | Chore | Day`.
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
      if (it.status === 'completed') return;
      var parts = it.summary.split('|').map(function (p) { return p.trim(); });
      if (parts.length < 3) { errs.push(it.summary + ' - expected "Who | Chore | Day"'); return; }
      var who = parts[0].toLowerCase();
      if (who !== 'himack' && !App.person(who).id) { errs.push(parts[0] + ' - unknown person'); return; }
      var day = parseDay(parts[2]);
      if (day === null) { errs.push(it.summary + ' - unknown day "' + parts[2] + '"'); return; }
      out.push({ who: who, title: parts[1], day: day });
    });
    return { defs: out, errs: errs };
  }

  function entityIdFor(who) { return who === 'himack' ? C.chores.familyTodo : App.person(who).todo; }
  function fetchList(entityId) {
    if (!entityId || HA.unavailable(entityId)) return Promise.resolve();
    return HA.todoItems(entityId).then(function (items) { V.items[entityId] = items; })
      .catch(function () { if (!V.items[entityId]) V.items[entityId] = []; });
  }
  function reconcile(defs) {
    defs.forEach(function (d) {
      var entityId = entityIdFor(d.who);
      if (!entityId || HA.unavailable(entityId)) return;
      if (!dueToday(d.day)) return;
      var exists = (V.items[entityId] || []).some(function (it) {
        return it.summary === d.title && (!it.due_date || it.due_date <= todayISO());
      });
      if (!exists) HA.callService('todo.add_item', { entity_id: entityId, item: d.title, due_date: todayISO() });
    });
  }

  function personCard(p) {
    var entityId = p.todo;
    if (!entityId || HA.unavailable(entityId)) return missingCard(p, entityId);
    var items = V.items[entityId];
    if (!items) return loadingCard(p);
    var today = todayISO();
    var due = items.filter(function (it) { return it.status !== 'completed' && (!it.due_date || it.due_date <= today); });
    var done = items.filter(function (it) { return it.status === 'completed'; });
    var total = due.length + done.length;
    var next = due.length ? due[0].summary : null;
    return '<button class="ch-card' + (total && done.length === total ? ' is-done' : '') + '" data-person="' + p.id + '" style="' + App.pstyle(p) + '">' +
      '<div class="ch-card-top">' + App.avatar(p, 44) + '<b>' + p.name + '</b></div>' +
      '<span class="ch-card-count num' + (total && done.length === total ? ' is-done' : '') + '">' + (done.length + '/' + total) + '</span>' +
      '<span class="ch-card-sub">' + (done.length === total && total > 0 ? 'All done' : due.length + ' to do') + '</span>' +
      (next ? '<span class="ch-card-next">Next: ' + App.esc(next) + '</span>' : '') +
      '</button>';
  }
  function missingCard(p, entityId) {
    return '<div class="ch-card" style="' + App.pstyle(p) + '">' +
      '<div class="ch-card-top">' + App.avatar(p, 44) + '<b>' + p.name + '</b></div>' +
      '<span class="ch-card-sub">Missing ' + (entityId || 'todo list') + '</span></div>';
  }
  function loadingCard(p) {
    return '<div class="ch-card" style="' + App.pstyle(p) + '">' +
      '<div class="ch-card-top">' + App.avatar(p, 44) + '<b>' + p.name + '</b></div>' +
      '<span class="ch-card-sub">Loading...</span></div>';
  }

  function himackCard() {
    var p = App.person('himack');
    var entityId = C.chores.familyTodo;
    if (!entityId || HA.unavailable(entityId)) return '';
    var items = V.items[entityId] || [];
    var pending = HA.state(entityId);
    return '<button class="ch-card" data-person="himack" style="' + App.pstyle(p) + '">' +
      '<div class="ch-card-top">' + App.avatar(p, 44) + '<b>HIMACK</b></div>' +
      '<span class="ch-card-count num">' + (pending !== null ? pending : '--') + '</span>' +
      '<span class="ch-card-sub">shared</span>' +
      '</button>';
  }

  function personSheet(pid) {
    var p = App.person(pid);
    var entityId = pid === 'himack' ? C.chores.familyTodo : p.todo;
    if (!entityId || HA.unavailable(entityId)) return;
    var items = V.items[entityId] || [];
    var today = todayISO();
    var due = items.filter(function (it) { return it.status !== 'completed' && (!it.due_date || it.due_date <= today); });
    var done = items.filter(function (it) { return it.status === 'completed'; });
    var close = App.sheet(
      '<div class="ch-sheet">' +
      '<div class="label">Chores</div>' +
      '<div class="ch-head">' + App.avatar(p, 40) + '<b>' + (pid === 'himack' ? 'HIMACK' : p.name) + '</b>' +
      '<span class="num">' + done.length + '/' + (due.length + done.length) + '</span></div>' +
      '<div class="ch-items">' + due.concat(done).map(function (it) {
        var isDone = it.status === 'completed';
        var key = it.uid || it.summary;
        return '<button class="ch-item' + (isDone ? ' is-done' : '') + '" data-check="' + App.esc(entityId) + '" data-key="' + App.esc(key) + '" data-status="' + it.status + '">' +
          '<i>' + App.icon('check', 18) + '</i><span>' + App.esc(it.summary) + '</span></button>';
      }).join('') + '</div>' +
      '</div>',
      {
        onMount: function (sheet) {
          sheet.addEventListener('click', function (e) {
            var it = e.target.closest('[data-check]');
            if (!it) return;
            var to = it.dataset.status === 'completed' ? 'needs_action' : 'completed';
            HA.callService('todo.update_item', { entity_id: it.dataset.check, item: it.dataset.key, status: to })
              .then(function () { HA.invalidateTodo(it.dataset.check); return fetchList(it.dataset.check); })
              .then(function () { close(); if (App.current === 'tasks') paint(); });
          });
        }
      });
  }

  function definitionsNote() {
    var def = C.chores.definitionsEntity;
    var hint = 'Add recurring chores from any phone: <span class="num">Who | Chore | Day</span> in the Chore Definitions list.';
    if (HA.unavailable(def)) {
      return '<div class="ch-note ch-note--warn">Missing <b>' + App.esc(def) + '</b>. Create it in HA Helpers, then add definitions.</div>';
    }
    var n = (V.defs || []).length;
    var html = n
      ? '<div class="ch-note">' + n + ' definition' + (n === 1 ? '' : 's') + ' active. ' + hint + '</div>'
      : '<div class="ch-note">' + hint + '</div>';
    if (V.errs && V.errs.length) {
      html += '<div class="ch-note ch-note--warn">Couldn\'t read ' + V.errs.length + ' definition(s):<br>' + V.errs.map(App.esc).join('<br>') + '</div>';
    }
    return html;
  }

  function paint() {
    if (!V.el) return;
    var cards = App.state.people.map(personCard);
    var hm = himackCard();
    if (hm) cards.push(hm);
    V.el.innerHTML = '<div class="chores-wrap">' +
      '<div class="ch-grid">' + cards.slice(0, 6).join('') + '</div>' +
      (hm ? '' : '') +
      definitionsNote() +
      '</div>';
    bind();
  }

  function bind() {
    if (V.el._bound) return; V.el._bound = true;
    V.el.addEventListener('click', function (e) {
      var c = e.target.closest('[data-person]');
      if (c) personSheet(c.dataset.person);
    });
  }

  function loadAll() {
    var ids = {};
    C.chores.recurrences.forEach(function (r) { ids[entityIdFor(r.who)] = true; });
    App.state.people.forEach(function (p) { ids[p.todo] = true; });
    ids[C.chores.familyTodo] = true;
    ids[C.chores.definitionsEntity] = true;
    return Promise.all(Object.keys(ids).map(fetchList)).then(function () {
      var parsed = parseDefinitions(V.items[C.chores.definitionsEntity] || []);
      V.defs = parsed.defs; V.errs = parsed.errs;
      reconcile(parsed.defs);
      if (App.current === 'tasks' && V.el) paint();
    });
  }

  App.register('tasks', {
    show: function (el) { V.el = el; paint(); loadAll(); },
    resume: function () { if (V.el) { paint(); loadAll(); } },
    hide: function () {}
  });
  App.on('data', function () { if (App.current === 'tasks' && V.el) loadAll(); });
})();
