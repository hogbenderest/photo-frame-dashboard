// Cellar: Cork Dork totals + visual racks + inventory browser.
// Racks: one cabinet at a time (tabs) so slot cells stay >= 44dp tappable
// (3 cabinets side-by-side on 1280px would make ~33px cells).
// Bottles land on location.row/col (0-indexed); "Drank it" removes the bottle
// via the wine_cellar.remove_wine service then forces a fresh inventory.
(function () {
  'use strict';
  var C = window.HACONFIG, HA = window.HA, V = { filter: 'all', wine: null, tab: 0, cabinets: null, mode: 'list' };

  var FILTERS = [
    { id: 'all', name: 'All', match: function () { return true; } },
    { id: 'peak', name: 'At peak \u00B7 drink now', match: function (w) { return w.peak_status === 'at_peak' || w.peak_status === 'drink_now'; } },
    { id: 'young', name: 'Young', match: function (w) { return w.peak_status === 'young'; } },
    { id: 'past', name: 'Past peak \u00B7 past due', match: function (w) { return w.peak_status === 'past_peak' || w.peak_status === 'past_due'; } }
  ];

  function wines() { return (HA.wine && HA.wine.wines) ? HA.wine.wines : []; }
  function unplaced() {
    return wines().filter(function (w) {
      var loc = w.location || {};
      return loc.row === null || loc.row === undefined || loc.col === null || loc.col === undefined;
    });
  }

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

  // ------------------------------------------------------------ racks
  function cabinetsLoaded() {
    if (V.cabinets) return Promise.resolve(V.cabinets);
    if (HA.status === 'demo') {
      V.cabinets = [{ id: 'c1', name: 'Cabinet 1', rows: 4, cols: 12, depth: 1 },
                    { id: 'c2', name: 'Cabinet 2', rows: 4, cols: 12, depth: 1 },
                    { id: 'c3', name: 'Cabinet 3', rows: 4, cols: 12, depth: 1 }];
      return Promise.resolve(V.cabinets);
    }
    return HA.callWS('wine_cellar/get_cabinets').then(function (c) {
      // The command wraps the array: {cabinets: [...]}
      var list = c && c.cabinets && c.cabinets.length ? c.cabinets : (Array.isArray(c) && c.length ? c : null);
      if (!list) throw new Error('no cabinets in response');
      V.cabinets = list;
      return V.cabinets;
    }).catch(function () {
      // fallback: derive geometry from bottle positions
      var g = {};
      wines().forEach(function (w) {
        var loc = w.location || {};
        var cid = loc.cabinet_id || 'unknown';
        g[cid] = g[cid] || { id: cid, name: loc.cabinet_name || cid, rows: 0, cols: 0, depth: 1 };
        if (loc.row !== null && loc.row !== undefined) g[cid].rows = Math.max(g[cid].rows, loc.row + 1);
        if (loc.col !== null && loc.col !== undefined) g[cid].cols = Math.max(g[cid].cols, loc.col + 1);
      });
      V.cabinets = Object.keys(g).map(function (k) { return g[k]; });
      return V.cabinets;
    });
  }

  function rackTabs() {
    return V.cabinets.map(function (cab, i) {
      var n = wines().filter(function (w) { return (w.location || {}).cabinet_id === cab.id; }).length;
      return '<button class="cl-tab' + (V.tab === i ? ' is-active' : '') + '" data-tab="' + i + '">' +
        App.esc(cab.name) + ' <b class="num">' + n + '</b></button>';
    }).join('');
  }

  function bottleAt(cab, r, c2) {
    var list = wines().filter(function (w) {
      var loc = w.location || {};
      return loc.cabinet_id === cab.id && loc.row === r && loc.col === c2;
    });
    return list[0] || null;
  }

  function rackGrid() {
    var cab = V.cabinets[V.tab];
    if (!cab) return '<div class="cl-empty">No cabinet data</div>';
    var rows = cab.rows || 4, cols = cab.cols || 12;
    var html = '<div class="cl-rack" style="--rack-cols:' + cols + '">';
    html += '<div class="cl-rack-row cl-rack-hd"><span></span>';
    for (var c2 = 0; c2 < cols; c2++) html += '<span class="num">' + (c2 + 1) + '</span>';
    html += '</div>';
    for (var r = 0; r < rows; r++) {
      html += '<div class="cl-rack-row"><span class="cl-rack-rn num">' + (r + 1) + '</span>';
      for (c2 = 0; c2 < cols; c2++) {
        var w = bottleAt(cab, r, c2);
        if (w) {
          var pk = w.peak_status || 'unknown';
          html += '<button class="cl-slot cl-pk-' + pk + '" data-bottle="' + App.esc(w.id) + '">' +
            '<span class="cl-slot-v num">' + App.esc(w.vintage || '') + '</span>' +
            (w.rating ? '<span class="cl-slot-r num">' + App.esc(w.rating) + '</span>' : '') +
            '</button>';
        } else {
          html += '<span class="cl-slot cl-slot--empty"></span>';
        }
      }
      html += '</div>';
    }
    html += '</div>';
    var up = unplaced();
    html += '<div class="cl-unplaced">' + (up.length ? up.length + ' bottle(s) not gridded (zone or unplaced) \u2014 see List' : 'All bottles gridded') + '</div>';
    return html;
  }

  function bottleDetail(id) {
    var w = wines().filter(function (x) { return String(x.id) === id; })[0];
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
      '</div>' +
      '<button class="rz-act rz-stop cl-drank" data-drank="' + App.esc(w.id) + '">' + App.icon('wine', 22) + 'Hold \u2014 I drank this bottle</button>' +
      '</div>',
      {
        onMount: function (sheet, close) {
          var d = sheet.querySelector('[data-drank]');
          App.hold(d, 1600, {
            enabled: function () { return true; },
            done: function () { drinkBottle(w, close); },
            cancel: function () {}
          });
        }
      });
  }

  function drinkBottle(w, close) {
    HA.callService('wine_cellar.remove_wine', { wine_id: w.id }).then(function () {
      return HA.wineInventory(true); // force fresh; the 1 h cache would keep it
    }).then(function () {
      
      close();
      if (App.current === 'cellar' && V.el) paint();
      App.toast('Removed <b>' + App.esc(w.name) + ' ' + App.esc(w.vintage || '') + '</b> \u00B7 enjoy', { icon: 'wine' });
    }).catch(function () {
      App.toast('Couldn\u2019t remove the bottle', { tone: 'error', icon: 'bolt' });
    });
  }

  // ------------------------------------------------------------ list browser (kept)
  function chips() {
    var counts = {};
    wines().forEach(function (w) {
      FILTERS.forEach(function (f) { if (f.match(w)) counts[f.id] = (counts[f.id] || 0) + 1; });
    });
    return FILTERS.map(function (f) {
      return '<button class="cl-chip' + (V.filter === f.id ? ' is-active' : '') + '" data-filter="' + f.id + '">' +
        f.name + ' <b class="num">' + (counts[f.id] || 0) + '</b></button>';
    }).join('');
  }

  function list() {
    var f = FILTERS.filter(function (x) { return x.id === V.filter; })[0];
    var ws = wines().filter(f.match);
    if (!HA.wine) return '<div class="cl-empty">' + App.icon('wine', 44) + '<div class="serif">Loading the cellar\u2026</div></div>';
    if (V.wine.error) return '<div class="cl-empty">' + App.icon('bolt', 44) + '<div class="serif">Couldn\u2019t read the inventory</div><small>Check the wine_cellar integration and token</small></div>';
    if (!ws.length) return '<div class="cl-empty">' + App.icon('wine', 44) + '<div class="serif">Nothing in this filter</div></div>';
    return '<div class="cl-list">' + ws.slice(0, 120).map(function (w) {
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
    }).join('') + '</div>';
  }

  function paint() {
    if (!V.el) return;
    var modeToggle = '<div class="cl-modes">' +
      '<button class="cl-tab' + (V.mode === 'racks' ? ' is-active' : '') + '" data-mode="racks">Racks</button>' +
      '<button class="cl-tab' + (V.mode === 'list' ? ' is-active' : '') + '" data-mode="list">List</button></div>';
    V.el.innerHTML = '<div class="cl-wrap">' +
      '<div class="cl-top">' + totals() + modeToggle + '</div>' +
      (V.mode === 'racks'
        ? (V.cabinets
          ? '<div class="cl-rackwrap"><div class="cl-tabs">' + rackTabs() + '</div>' + rackGrid() + '</div>'
          : '<div class="cl-empty">' + App.icon('wine', 44) + '<div class="serif">Loading racks\u2026</div></div>')
        : '<div class="cl-browser"><div class="cl-chips">' + chips() + '</div>' + list() + '</div>') +
      '</div>';
    bind();
  }

  function bind() {
    if (V.el._bound) return; V.el._bound = true;
    V.el.addEventListener('click', function (e) {
      var d = e.target.closest('[data-drank]');
      if (d) return; // hold-driven
      var b = e.target.closest('[data-bottle]');
      if (b) { bottleDetail(b.dataset.bottle); return; }
      var f = e.target.closest('[data-filter]');
      if (f) { V.filter = f.dataset.filter; paint(); return; }
      var t = e.target.closest('[data-tab]');
      if (t && V.mode === 'racks') { V.tab = +t.dataset.tab; paint(); return; }
      var m = e.target.closest('[data-mode]');
      if (m) { V.mode = m.dataset.mode; paint(); return; }
      var l = e.target.closest('[data-light]');
      if (l) {
        HA.callService(HA.on(l.dataset.light) ? 'light.turn_off' : 'light.turn_on', { entity_id: l.dataset.light });
      }
    });
  }

  function openCellar() {
    cabinetsLoaded().then(function () { if (App.current === 'cellar' && V.el) paint(); });
    if (!V.wine || V.wine.error) {
      if (V.wine && V.wine.error) V.wine = null;
      paint();
      HA.wineInventory(true).then(function (j) { V.wine = j; paint(); }).catch(function () { V.wine = { error: true }; paint(); });
    } else paint();
  }

  App.register('cellar', {
    show: function (el) { V.el = el; openCellar(); },
    resume: function () { if (V.el) openCellar(); },
    hide: function () {}
  });
  App.on('data', function () { if (App.current === 'cellar' && V.el) paint(); });
})();
