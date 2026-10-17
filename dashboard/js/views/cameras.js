// Cameras: snapshot polling via /api/camera_proxy. RAM discipline for a
// 512MB device: only the visible tile set refreshes, one fetch at a time,
// enlarged camera refreshes every 5 s. No WebRTC in v1.
(function () {
  'use strict';
  var C = window.HACONFIG, HA = window.HA, V = { urls: {}, timers: [], big: null };

  function stopTimers() {
    V.timers.forEach(clearTimeout); V.timers = [];
    clearInterval(V.cycle);
    V.cycle = null;
  }
  function releaseImgs() {
    for (var k in V.urls) { try { URL.revokeObjectURL(V.urls[k]); } catch (e) {} delete V.urls[k]; }
  }

  function fetchTile(id, imgEl) {
    if (HA.status !== 'live') return;
    HA.cameraStill(id).then(function (blob) {
      var old = V.urls[id];
      V.urls[id] = URL.createObjectURL(blob);
      if (imgEl) imgEl.src = V.urls[id];
      if (old) try { URL.revokeObjectURL(old); } catch (e) {}
    }).catch(function () {
      if (imgEl) imgEl.classList.add('is-broken');
    });
  }

  function eventChips(cam) {
    return (cam.events || []).map(function (eid) {
      var on = HA.on(eid);
      var mins = HA.minsSince(eid);
      return '<span class="cam-chip' + (on ? ' is-on' : '') + '">' + App.esc(HA.name(eid).replace(/Front Door Cam |Garage Car Cam /, '')) +
        (on ? ' now' : mins !== null ? ' \u00B7 ' + App.fmt.mins(mins) + ' ago' : '') + '</span>';
    }).join('');
  }

  function tile(cam, i) {
    return '<div class="cam-tile" data-cam="' + cam.id + '">' +
      '<div class="cam-img" data-img="' + cam.id + '">' +
      (HA.status === 'live' ? '' : '<span class="cam-demo">' + App.icon('camera', 40) + '</span>') +
      '</div>' +
      '<div class="cam-bar"><b>' + App.esc(cam.name) + '</b><span class="cam-chips">' + eventChips(cam) + '</span></div>' +
      '<span class="cam-tap">Tap to enlarge</span>' +
      '</div>';
  }

  function paint() {
    V.el.innerHTML = '<div class="cam-grid">' + C.cameras.map(tile).join('') + '</div>';
    V.el.addEventListener('click', function (e) {
      var t = e.target.closest('[data-cam]');
      if (t) enlarge(t.dataset.cam);
    });
    // Staggered snapshot polling: one tile every gridRefreshMs / N, so only one
    // image is in flight at a time.
    var step = Math.max(1500, C.camera.gridRefreshMs / C.cameras.length);
    C.cameras.forEach(function (cam, i) {
      V.timers.push(setTimeout(function () {
        var imgEl = V.el.querySelector('[data-img="' + cam.id + '"]');
        if (imgEl) fetchTile(cam.id, imgEl);
      }, 300 + i * step));
    });
    V.cycle = setInterval(function () {
      C.cameras.forEach(function (cam, i) {
        V.timers.push(setTimeout(function () {
          var imgEl = V.el.querySelector('[data-img="' + cam.id + '"]');
          if (imgEl) fetchTile(cam.id, imgEl);
        }, i * step));
      });
    }, C.camera.gridRefreshMs);
  }

  var bigTimer = null, bigClose = null;
  function enlarge(id) {
    var cam = C.cameras.filter(function (c) { return c.id === id; })[0];
    if (!cam) return;
    stopTimers();
    bigClose = App.sheet(
      '<div class="cam-big">' +
      '<div class="cam-big-head"><div class="label">Camera</div><div class="serif cam-big-name">' + App.esc(cam.name) + '</div>' +
      '<div class="cam-chips">' + eventChips(cam) + '</div></div>' +
      '<div class="cam-big-img" id="camBigImg"></div>' +
      '<div class="cam-big-meta"><span class="num" id="camBigStamp"></span></div>' +
      '</div>',
      {
        cls: 'sheet--cam',
        onClose: function () { clearInterval(bigTimer); bigTimer = null; releaseImgs(); if (App.current === 'cameras') App.go('cameras', { rerender: true }); }
      });
    function grab() {
      HA.cameraStill(id).then(function (blob) {
        var holder = document.getElementById('camBigImg');
        if (!holder) return clearInterval(bigTimer);
        var old = V.urls[id];
        V.urls[id] = URL.createObjectURL(blob);
        holder.innerHTML = '<img src="' + V.urls[id] + '" alt="">';
        document.getElementById('camBigStamp').textContent = 'as of ' + App.fmt.time(App.now());
        if (old) try { URL.revokeObjectURL(old); } catch (e) {}
      }).catch(function () {});
    }
    grab();
    bigTimer = setInterval(grab, C.camera.bigRefreshMs);
  }

  App.register('cameras', {
    show: function (el) { V.el = el; paint(); },
    hide: function () { stopTimers(); releaseImgs(); }
  });
  App.on('data', function () {
    // Refresh chips without re-painting images (paint() would kill srcs).
    if (App.current !== 'cameras' || !V.el || V.cycle === null) return;
    V.el.querySelectorAll('.cam-tile').forEach(function (t) {
      var cam = C.cameras.filter(function (c) { return c.id === t.dataset.cam; })[0];
      if (cam) t.querySelector('.cam-chips').innerHTML = eventChips(cam);
    });
  });
})();
