// Cellar: Cork Dork totals + inventory browser (REST /api/wine_cellar/wines),
// cellar door/light state and battery warnings. Refreshes on open, 1 h cache.
(function () {
  'use strict';
  var C = window.HACONFIG, HA = window.HA, V = { filter: 'all', wine: null };

  var FILTERS = [
    { id: 'all', name: 'All', match: function () { return true; } },
    { id: 'peak', name: 'At peak \u00B7 drink now', match: function (w) { return w.peak_status === 'at_peak' || w.peak_status === 'drink_now'; } },
    { id: 'young', name: 'Young', match: function (w) { return w.peak_status === 'young'; } },
    { id: 'past', name: 'Past peak \u00B7 past due', match: function (w) { return w.peak_status === 'past_peak' || w.peak_status === 'past_due'; } }
  ];

  function totals() {
    var shelves = C.cellar.shelves.map(function (s) {
      return '<div class="cl-shelf"><span>' + App.esc(s.name) + '</span><b class="num">' + (HA.num(s.id) !== null ? HA.num(s.id) : '--') + '</b></div>';
    }).join('');
    var cap = HA.num(C.cellar.capacity);
    var warn = C.cellar.batteries.filter(function (b) {
      var v = HA.num(b.id);
      return v !== null && v <= 30;
    });
    return '<div class="cl-totals">' +
      '<div class="cl-big"><span class="num">' + (HA.num(C.cellar.bottles) !== null ? HA.num(C.cellar.bottles) : '--') + '</span><span>bottles</span></div>' +
      '<div class="cl-cap"><div class="label">Capacity ' + (cap !== null ? cap.toFixed(1) : '--') + '%</div>' +
      '<div class="cl-capbar"><span style="--v:' + (cap || 0) + '%"></span></div></div>' +
      '<div class="cl-shelves">' + shelves + '</div>' +
      '</div>' +
      '<div class="cl-state card">' +
      '<div class="sec-row' + (HA.on(C.cellar.door) ? ' is-open' : '') + '">' + App.icon('door', 22) + '<span>Cellar door</span><b>' + (HA.on(C.cellar.door) ? 'Open' : 'Closed') + '</b></div>' +
      '<div class="sec-row">' + App.icon('bulb', 22) + '<span>Cellar light</span>' +
      '<button class="pill" data-light="' + C.cellar.light + '">' + (HA.on(C.cellar.light) ? 'On \u00B7 tap to turn off' : 'Off \u00B7 tap to turn on') + '</button></div>' +
      (warn.length ? '<div class="sec-alert">' + warn.map(function (b) {
        return App.esc(b.name) + ' battery low: ' + HA.num(b.id) + '%';
      }).join(' \u00B7 ') + '</div>' : '') +
      '</div>';
  }

  function chips() {
    var counts = {};
    (V.wine ? V.wine.wines || [] : []).forEach(function (w) {
      FILTERS.forEach(function (f) { if (f.match(w)) counts[f.id] = (counts[f.id] || 0) + 1; });
    });
    return FILTERS.map(function (f) {
      return '<button class="cl-chip' + (V.filter === f.id ? ' is-active' : '') + '" data-filter="' + f.id + '">' +
        f.name + ' <b class="num">' + (counts[f.id] || 0) + '</b></button>';
    }).join('');
  }

  function row(w) {
    var peak = w.peak_status || 'unknown';
    return '<button class="cl-bottle cl-pk-' + peak + '" data-bottle="' + App.esc(w.id || w.name) + '">' +
      '<span class="cl-b-name"><b>' + App.esc(w.name) + '</b><small>' + [w.vintage, w.grape_variety].filter(Boolean).join(' \u00B7 ') + '</small></span>' +
      '<span class="cl-b-meta">' +
      (w.rating ? '<b class="num">' + w.rating + '</b>' : '') +
      '<span>' + App.esc(peak === 'at_peak' ? 'at peak' : peak === 'drink_now' ? 'drink now' : peak === 'young' ? 'young' : peak === 'past_due' ? 'past due' : peak === 'past_peak' ? 'past peak' : '') + '</span>' +
      (w.drink_window ? '<small>' + App.esc(w.drink_window) + '</small>' : '') +
      '</span>' +
      '<span class="cl-b-loc">' + App.esc(w.location && w.location.human_readable ? w.location.human_readable : '') + '</span>' +
      '</button>';
  }

  function list() {
    var f = FILTERS.filter(function (x) { return x.id === V.filter; })[0];
    var wines = (V.wine ? V.wine.wines || [] : []).filter(f.match);
    if (!V.wine) return '<div class="cl-empty">' + App.icon('wine', 44) + '<div class="serif">Loading the cellar\u2026</div></div>';
    if (V.wine.error) return '<div class="cl-empty">' + App.icon('bolt', 44) + '<div class="serif">Couldn\u2019t read the inventory</div><small>Check the wine_cellar integration and token</small></div>';
    if (!wines.length) return '<div class="cl-empty">' + App.icon('wine', 44) + '<div class="serif">Nothing in this filter</div></div>';
    return '<div class="cl-list">' + wines.slice(0, 120).map(row).join('') + '</div>';
  }

  function paint() {
    if (!V.el) return;
    V.el.innerHTML = '<div class="cl-wrap">' +
      totals() +
      '<div class="cl-browser">' +
      '<div class="cl-chips">' + chips() + '</div>' +
      list() +
      '</div></div>';
    bind();
  }

  function bottleDetail(id) {
    var w = (V.wine && V.wine.wines ? V.wine.wines : []).filter(function (x) { return String(x.id || x.name) === id; })[0];
    if (!w) return;
    function kv(label, value) {
      if (value === null || value === undefined || value === '') return '';
      return '<div class="cl-kv"><span>' + label + '</span><b>' + App.esc(String(value)) + '</b></div>';
    }
    var peak = w.peak_status || 'unknown';
    App.sheet(
      '<div class="cl-detail">' +
      '<div class="label">Bottle</div>' +
      '<div class="serif cl-detail-name">' + App.esc(w.name) + '</div>' +
      '<div class="cl-detail-grid">' +
      kv('Variety', w.grape_variety) +
      kv('Vintage', w.vintage) +
      kv('Status', peak === 'at_peak' ? 'At peak' : peak === 'drink_now' ? 'Drink now' : peak === 'young' ? 'Young' : peak === 'past_due' ? 'Past due' : peak === 'past_peak' ? 'Past peak' : 'Unknown') +
      kv('Drink window', w.drink_window) +
      kv('Drink by', w.drink_by) +
      kv('Rating', w.rating) +
      kv('Location', w.location && w.location.human_readable) +
      kv('Value', w.value ? '$' + w.value : null) +
      '</div></div>');
  }

  function bind() {
    if (V.el._bound) return; V.el._bound = true;
    V.el.addEventListener('click', function (e) {
      var f = e.target.closest('[data-filter]');
      if (f) { V.filter = f.dataset.filter; paint(); return; }
      var l = e.target.closest('[data-light]');
      if (l) {
        HA.callService(HA.on(l.dataset.light) ? 'light.turn_off' : 'light.turn_on', { entity_id: l.dataset.light });
        return;
      }
      var b = e.target.closest('[data-bottle]');
      if (b) { bottleDetail(b.dataset.bottle); }
    });
  }

  App.register('cellar', {
    show: function (el) {
      V.el = el;
      if (!V.wine || V.wine.error) { // error results never stick: always retry on open
        if (V.wine && V.wine.error) V.wine = null;
        paint();
        HA.wineInventory(true).then(function (j) { V.wine = j; paint(); }).catch(function () { V.wine = { error: true }; paint(); });
      } else paint();
    },
    hide: function () {}
  });
  App.on('data', function () { if (App.current === 'cellar' && V.el) paint(); });
})();
