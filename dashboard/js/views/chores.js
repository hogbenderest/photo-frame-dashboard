// Chores (HIMACK): per-person to-do lists in HA (todo.chores_*), with
// client-side recurrence reconciliation. The recurrence table lives in
// HACONFIG.chores.recurrences and ships EMPTY on purpose: chore content is a
// family decision. Items come from the todo.get_items service (HA 2026.10
// does not expose them in entity attributes).
(function () {
  'use strict';
  var C = window.HACONFIG, HA = window.HA, V = { items: {} };

  function todayISO() { var d = App.now(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

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

  // Ensure today's recurring items exist. No-op while recurrences is empty.
  function reconcile() {
    C.chores.recurrences.forEach(function (r) {
      var entityId = entityIdFor(r.who);
      if (!entityId || HA.unavailable(entityId)) return;
      if (r.day !== 'daily' && r.day !== App.now().getDay()) return;
      var items = V.items[entityId] || [];
      var exists = items.some(function (it) {
        return it.summary === r.title && (!it.due_date || it.due_date <= todayISO());
      });
      if (!exists) {
        HA.callService('todo.add_item', { entity_id: entityId, item: r.title, due_date: todayISO() })
          .then(function () { return fetchList(entityId); });
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
        return '<button class="ch-item' + (isDone ? ' is-done' : '') + '" data-check="' + App.esc(entityId) + '" data-item="' + App.esc(it.summary) + '" data-status="' + it.status + '">' +
          '<i>' + App.icon('check', 18) + '</i><span>' + App.esc(it.summary) + '</span></button>';
      }).join('') || '<div class="ch-free serif"><i>Nothing due</i></div>') +
      '</div></div>';
  }

  function paint() {
    if (!V.el) return;
    V.el.innerHTML = '<div class="chores-wrap">' +
      '<div class="ch-grid">' + App.state.people.map(personColumn).join('') + '</div>' +
      '<div class="ch-note">' + (C.chores.recurrences.length
        ? C.chores.recurrences.length + ' recurring chore definitions reconcile automatically each morning.'
        : 'Recurring chores are defined in js/ha-config.js (chores.recurrences). None yet: chore content is a family decision.') + '</div>' +
      '</div>';
    bind();
  }

  function loadAll() {
    var ids = {};
    C.chores.recurrences.forEach(function (r) { ids[entityIdFor(r.who)] = true; });
    App.state.people.forEach(function (p) { ids[p.todo] = true; });
    ids[C.chores.familyTodo] = true;
    return Promise.all(Object.keys(ids).map(fetchList)).then(function () {
      reconcile();
      if (App.current === 'tasks' && V.el) paint();
    });
  }

  function bind() {
    if (V.el._bound) return; V.el._bound = true;
    V.el.addEventListener('click', function (e) {
      var it = e.target.closest('[data-check]');
      if (!it) return;
      var to = it.dataset.status === 'completed' ? 'needs_action' : 'completed';
      HA.callService('todo.update_item', { entity_id: it.dataset.check, item: it.dataset.item, status: to })
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
