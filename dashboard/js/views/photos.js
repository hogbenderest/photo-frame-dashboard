// Photos: full-bleed slideshow from the Google Photos sync pipeline, with
// manual controls: tap left third = previous, right third = next, centre =
// pause/resume, plus a position counter ("3 / 19"). The frame IS a photo
// frame - this view is exempt from the 60 s idle-return-home (ambient still
// takes over after the normal idle period; taps reset it).
(function () {
  'use strict';
  var C = window.HACONFIG, HA = window.HA, V = { slides: null, paused: false, lastLoad: 0, pending: false };

  function mapPhoto(p) {
    var url = p.url || '';
    // The sync writes RELATIVE /local/... URLs; resolve them against the HA
    // host, not the page origin (the loopback kiosk server 404s them).
    if (url.charAt(0) === '/') url = HA.url + url;
    return {
      url: url, date: p.date, place: p.place || '', from: p.from || null,
      o: (p.w && p.h && p.h > p.w) ? 'p' : 'l', fav: !!p.fav, tag: p.tag || ''
    };
  }

  function total() { return HA.photos && HA.photos.photos ? HA.photos.photos.length : 0; }
  // history holds every slide shown before the current one (the first render
  // pushes nothing), so position = history.length + 1; count is cumulative.
  function pos() { return V.slides ? (V.slides.history.length + 1) : 1; }

  function updateChrome() {
    if (!V.el) return;
    var c = V.el.querySelector('.ph-count');
    if (c) c.textContent = pos() + ' / ' + total();
    var p = V.el.querySelector('.ph-paused');
    if (p) p.classList.toggle('is-on', V.paused);
  }

  function paint() {
    var manifest = HA.photos;
    var photos = manifest && manifest.photos && manifest.photos.length ? manifest.photos.map(mapPhoto) : null;
    if (!photos) {
      V.el.innerHTML = '<div class="cl-empty ph-empty">' + App.icon('photo', 44) +
        '<div class="serif">Photos aren\u2019t set up yet</div>' +
        '<small>' + App.esc(C.photos.fallbackNote) + '</small></div>';
      return;
    }
    V.paused = false;
    V.el.innerHTML = '<div class="ph-stage"></div><div class="ph-cap"></div>' +
      '<div class="ph-zone ph-zone--l" data-ph="prev" aria-label="Previous photo"></div>' +
      '<div class="ph-zone ph-zone--m" data-ph="pause" aria-label="Pause or resume"></div>' +
      '<div class="ph-zone ph-zone--r" data-ph="next" aria-label="Next photo"></div>' +
      '<div class="ph-count num"></div>' +
      '<div class="ph-paused">' + App.icon('pause', 16) + 'Paused \u00B7 tap centre to resume</div>';
    V.slides = new App.Slideshow(V.el.querySelector('.ph-stage'), {
      layout: 'cover', captions: false, interval: 15000,
      onChange: function (slide) {
        var m = App.photoMeta(slide.photos[0]);
        V.el.querySelector('.ph-cap').innerHTML = '<b>' + m.kicker + '</b><span>' + App.esc(m.place) + '</span>';
        updateChrome();
      }
    });
    V.slides.start();
    updateChrome();
    bind();
  }

  // One-shot binding on the view element (survives repaints via delegation).
  function bind() {
    if (V.el._bound) return; V.el._bound = true;
    V.el.addEventListener('click', function (e) {
      var z = e.target.closest('[data-ph]');
      if (!z || !V.slides) return;
      if (z.dataset.ph === 'prev') {
        V.slides.prev();
        if (V.paused) V.slides.stop(); // prev() restarts the timer; keep pause sticky
      } else if (z.dataset.ph === 'next') {
        V.slides.next();
        if (V.paused) V.slides.stop();
      } else {
        V.paused = !V.paused;
        if (V.paused) V.slides.stop();
        else V.slides.start();
      }
      updateChrome();
    });
  }

  // Loads (and at most hourly, re-loads) the manifest. A frame runs for weeks:
  // the freshness check keeps the pool current; failed loads do not set the
  // timestamp so the next open retries instead of showing the empty state.
  function load() {
    if (HA.status === 'demo') { paint(); return; }
    if (HA.photos && Date.now() - V.lastLoad < 3600e3) { paint(); return; }
    if (V.pending) return;
    V.pending = true;
    V.slides = null;
    V.el.innerHTML = '<div class="cl-empty">' + App.icon('photo', 44) + '<div class="serif">Loading photos\u2026</div></div>';
    window.FRAME_PHOTOS = undefined;
    HA.photos = null;
    HA.loadPhotos().then(function () {
      V.pending = false;
      if (HA.photos && HA.photos.photos && HA.photos.photos.length) V.lastLoad = Date.now();
      if (App.current === 'photos') paint();
    });
  }

  App.register('photos', {
    show: function (el) { V.el = el; load(); },
    resume: function () { if (V.el) load(); },
    hide: function () { if (V.slides) V.slides.stop(); }
  });
})();
