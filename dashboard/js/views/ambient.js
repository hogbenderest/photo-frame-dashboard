// Ambient (idle photo frame) and Night (dim red clock) overlays, live HA edition.
(function () {
  'use strict';
  var HA = window.HA, C = window.HACONFIG, $ = App.$;
  var amb = { show: null }, shiftTimer = null;

  function ambientInfo() {
    var n = App.now(), w = App.weatherNow();
    var mode = HA.state(C.security.modeEntity) || 'Home';
    var homeCount = App.state.people.filter(function (p) { return p.person && HA.state(p.person) === 'home'; }).length;
    return '<div class="amb-clock"><div class="amb-time num">' + App.fmt.time(n, false) + '</div>' +
      '<div class="amb-date">' + App.fmt.day(n) + ', ' + App.fmt.month(n) + ' ' + n.getDate() + '</div></div>' +
      '<div class="amb-right">' +
      '<div class="amb-wx">' + App.icon(w.cond, 44) + '<span class="num">' + w.temp + '\u00B0</span><small>' + w.label + '</small></div>' +
      '<div class="amb-mode">' + App.icon(mode === 'Night' ? 'moon' : mode === 'Away' ? 'away' : 'home', 20) + ' ' + mode + ' \u00B7 ' + homeCount + ' home</div>' +
      '</div>';
  }
  function nightInfo() {
    var n = App.now(), w = App.weatherNow();
    var next = HA.state(C.watering.nextRun);
    var line = App.icon(w.cond, 26) + ' ' + w.temp + '\u00B0';
    if (next && new Date(next) > n) line += ' \u00B7 Watering ' + App.fmt.hour(new Date(next)) + ' ' + App.fmt.rel(new Date(next));
    var g = HA.state(C.security.garage.cover);
    if (g && g !== 'closed') line += ' \u00B7 Garage ' + g;
    return '<div class="nt-time num">' + App.fmt.time(n, false) + '</div>' +
      '<div class="nt-line">' + line + '</div>' +
      '<div class="nt-lock">' + App.icon('door', 20) + ' ' + (HA.on(C.security.leakAggregate) ? 'LEAK DETECTED' : 'Sensors quiet') + '</div>';
  }

  function paint() {
    if (App.mode === 'ambient') $('#ambient .amb-info').innerHTML = ambientInfo();
    if (App.mode === 'night') $('#night .nt-inner').innerHTML = nightInfo();
  }

  function pixelShift() {
    var x = Math.round(Math.random() * 8 - 4), y = Math.round(Math.random() * 8 - 4);
    App.$$('.amb-info, .nt-inner').forEach(function (el) { el.style.transform = 'translate(' + x + 'px,' + y + 'px)'; });
  }

  App.on('ready', function () {
    $('#ambient').innerHTML = '<div class="amb-stage"></div><div class="amb-scrim"></div><div class="amb-info"></div>';
    $('#night').innerHTML = '<div class="nt-inner"></div>';
    amb.show = new App.Slideshow($('#ambient .amb-stage'), { layout: 'cover', captions: false, interval: 14000 });
    $('#ambient').addEventListener('click', function () { App.setMode('day'); App.go('home'); });
    $('#night').addEventListener('click', function () { App.setMode('nightdash'); });
    shiftTimer = setInterval(pixelShift, 60000);
    HA.loadPhotos();
  });

  App.on('mode', function (m) {
    var photos = HA.photos && HA.photos.photos && HA.photos.photos.length;
    if (m === 'ambient' && !photos) {
      // No photos in the pool yet: retry the manifest (a fresh sync may have
      // created it since the last attempt); if it lands, the next ambient
      // entry starts the slideshow.
      HA.loadPhotos().then(function () {
        if (App.mode === 'ambient' && HA.photos && HA.photos.photos && HA.photos.photos.length) amb.show.start();
      });
      $('#ambient .amb-stage').innerHTML = ''; // plain dark clock until photos exist
    }
    if (m === 'ambient' && photos) amb.show.start();
    if (m !== 'ambient') amb.show.stop();
    paint();
  });
  App.on('minute', paint);
  App.on('data', paint);
})();
