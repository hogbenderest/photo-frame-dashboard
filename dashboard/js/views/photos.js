// Photos: full-bleed slideshow from the Google Photos sync pipeline. The sync
// writes www/frame-photos/ in HA and a JS manifest (window.FRAME_PHOTOS) that
// loads cross-origin via a <script> tag (fetch of JSON would be CORS-blocked).
(function () {
  'use strict';
  var C = window.HACONFIG, HA = window.HA, V = { slides: null };

  function mapPhoto(p) {
    return {
      url: p.url, date: p.date, place: p.place || '', from: p.from || null,
      o: (p.w && p.h && p.h > p.w) ? 'p' : 'l', fav: !!p.fav, tag: p.tag || ''
    };
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
    V.el.innerHTML = '<div class="ph-stage"></div><div class="ph-cap"></div>';
    V.slides = new App.Slideshow(V.el.querySelector('.ph-stage'), {
      layout: 'cover', captions: false, interval: 15000,
      onChange: function (slide) {
        var m = App.photoMeta(slide.photos[0]);
        V.el.querySelector('.ph-cap').innerHTML = '<b>' + m.kicker + '</b><span>' + App.esc(m.place) + '</span>';
      }
    });
    V.slides.start();
  }

  App.register('photos', {
    show: function (el) {
      V.el = el;
      if (HA.photos === null && HA.status !== 'demo') {
        V.el.innerHTML = '<div class="cl-empty">' + App.icon('photo', 44) + '<div class="serif">Loading photos\u2026</div></div>';
        HA.loadPhotos().then(function () { if (App.current === 'photos') paint(); });
      } else paint();
    },
    resume: function () { if (V.slides) V.slides.start(); },
    hide: function () { if (V.slides) V.slides.stop(); }
  });
})();
