// Chores (HIMACK): per-person to-do lists in HA (todo.chores_*), with
// client-side recurrence reconciliation. The recurrence table lives in
// HACONFIG.chores.recurrences and ships EMPTY on purpose: chore content is a
// family decision. Stars v1 = done-today counts from real to-do state.
(function () {
  'use strict';
  var C = window.HACONFIG, HA = window.HA, V = {};

  function todayISO() { var d = App.now(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

  function itemsOf(entityId) {
    var a = HA.attr(entityId, 'items');
    return Array.isArray(a) ? a : [];
  }

  // Ensure today's recurring items exist. No-op while recurrences is empty.
  function reconcile() {
    C.chores.recurrences.forEach(function (r) {
      var p = App.person(r.who);
      var entityId = r.who === 'himack' ? C.chores.familyTodo : p.todo;
      if (!entityId || HA.unavailable(entityId)) return;
      if (r.day !== 'daily' && r.day !== App.now().getDay()) return;
      var exists = itemsOf(entityId).some(function (it) {
        return it.summary === r.title && (!it.due_date || it.due_date <= todayISO());
      });
      if (!exists) {
        HA.callService('todo.add_item', { entity_id: entityId, item: r.title, due_date: todayISO() });
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
    var items = itemsOf(entityId);
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
        return '<button class="ch-item' + (isDone ? ' is-done' : '') + '" data-check="' + App.esc(entityId) + '" data-uid="' + App.esc(it.uid) + '" data-status="' + it.status + '">' +
          '<i>' + App.icon('check', 18) + '</i><span>' + App.esc(it.summary) + '</span></button>';
      }).join('') || '<div class="ch-free serif"><i>Nothing due</i></div>') +
      '</div></div>';
  }

  function paint() {
    V.el.innerHTML = '<div class="chores-wrap">' +
      '<div class="ch-grid">' + App.state.people.map(personColumn).join('') + '</div>' +
      '<div class="ch-note">' + (C.chores.recurrences.length
        ? C.chores.recurrences.length + ' recurring chore definitions reconcile automatically each morning.'
        : 'Recurring chores are defined in js/ha-config.js (chores.recurrences). None yet: chore content is a family decision.') + '</div>' +
      '</div>';
    bind();
  }

  function bind() {
    if (V.el._bound) return; V.el._bound = true;
    V.el.addEventListener('click', function (e) {
      var it = e.target.closest('[data-check]');
      if (!it) return;
      var to = it.dataset.status === 'completed' ? 'needs_action' : 'completed';
      HA.callService('todo.update_item', { entity_id: it.dataset.check, item_uid: it.dataset.uid, status: to })
        .catch(function () { App.toast('Couldn\u2019t update the chore', { tone: 'error', icon: 'bolt' }); });
    });
  }

  App.register('tasks', {
    show: function (el) { V.el = el; reconcile(); paint(); },
    hide: function () {}
  });
  App.on('data', function () { if (App.current === 'tasks' && V.el) paint(); });
})();
