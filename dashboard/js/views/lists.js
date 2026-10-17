// Lists: Apple Reminders shared lists (via HA CalDAV, once configured) plus
// the built-in shopping list. Check off, uncheck and remove from the panel;
// adding items happens on phones (a wall panel has no keyboard).
(function () {
  'use strict';
  var C = window.HACONFIG, HA = window.HA, V = { tab: null };

  function itemsOf(id) { var a = HA.attr(id, 'items'); return Array.isArray(a) ? a : []; }

  function tabs() {
    return C.lists.lists.map(function (l, i) {
      var n = itemsOf(l.id).filter(function (it) { return it.status !== 'completed'; }).length;
      var active = (V.tab === null ? i === 0 : V.tab === i) ? ' is-active' : '';
      return '<button class="li-tab' + active + '" data-tab="' + i + '">' + App.esc(l.name) +
        (n ? ' <b class="num">' + n + '</b>' : '') + '</button>';
    }).join('');
  }

  function listBody() {
    var i = V.tab === null ? 0 : V.tab;
    var l = C.lists.lists[i];
    if (!l) return '';
    if (HA.unavailable(l.id)) {
      return '<div class="cl-empty">' + App.icon('cart', 44) +
        '<div class="serif">' + App.esc(l.name) + ' isn\u2019t available yet</div>' +
        '<small>Shared Apple Reminders lists appear after the HA CalDAV integration is configured for iCloud. Then add the new todo.* entity IDs to js/ha-config.js lists.</small></div>';
    }
    var items = itemsOf(l.id);
    var open = items.filter(function (it) { return it.status !== 'completed'; });
    var done = items.filter(function (it) { return it.status === 'completed'; });
    function row(it, isDone) {
      return '<div class="li-item' + (isDone ? ' is-done' : '') + '">' +
        '<button class="li-check" data-toggle="' + App.esc(l.id) + '" data-uid="' + App.esc(it.uid) + '" data-status="' + App.esc(it.status) + '">' + App.icon('check', 20) + '</button>' +
        '<span class="li-name">' + App.esc(it.summary) + '</span>' +
        '<button class="li-x" data-remove="' + App.esc(l.id) + '" data-uid="' + App.esc(it.uid) + '" aria-label="Remove">' + App.icon('x', 16) + '</button>' +
        '</div>';
    }
    return '<div class="li-rows">' +
      (open.length ? open.map(function (it) { return row(it, false); }).join('') : '<div class="li-free serif"><i>Nothing to get</i></div>') +
      (done.length ? '<div class="label li-done-label">Picked up</div>' + done.map(function (it) { return row(it, true); }).join('') : '') +
      '</div>' +
      '<div class="li-note">Add items from a phone or the HA app; the frame can tick them off.</div>';
  }

  function paint() {
    V.el.innerHTML = '<div class="lists-wrap">' +
      '<div class="li-tabs">' + tabs() + '</div>' +
      listBody() +
      '</div>';
    bind();
  }

  function bind() {
    if (V.el._bound) return; V.el._bound = true;
    V.el.addEventListener('click', function (e) {
      var t = e.target.closest('[data-tab]');
      if (t) { V.tab = +t.dataset.tab; paint(); return; }
      var tg = e.target.closest('[data-toggle]');
      if (tg) {
        var to = tg.dataset.status === 'completed' ? 'needs_action' : 'completed';
        HA.callService('todo.update_item', { entity_id: tg.dataset.toggle, item_uid: tg.dataset.uid, status: to })
          .catch(function () { App.toast('Couldn\u2019t update the list', { tone: 'error', icon: 'bolt' }); });
        return;
      }
      var rm = e.target.closest('[data-remove]');
      if (rm) {
        HA.callService('todo.remove_item', { entity_id: rm.dataset.remove, item_uid: rm.dataset.uid })
          .catch(function () { App.toast('Couldn\u2019t remove the item', { tone: 'error', icon: 'bolt' }); });
      }
    });
  }

  App.register('shopping', {
    show: function (el) { V.el = el; paint(); },
    hide: function () {}
  });
  App.on('data', function () { if (App.current === 'shopping' && V.el) paint(); });
})();
