// Alerts (takeovers, banners) + the hidden demo drawer. Live HA edition:
// the doorbell takeover pulls a real front-door still; the leak takeover is
// display + acknowledge (no water-main control exists in this house).
(function () {
  'use strict';
  var HA = window.HA, C = window.HACONFIG, $ = App.$;

  function img(seed, w, h) { return 'https://picsum.photos/seed/' + seed + '/' + w + '/' + h; }
  App.img = img; // demo only

  // ------------------------------------------------------------ full-screen takeovers
  function takeover(html, cls) {
    var el = $('#takeover');
    el.className = 'takeover ' + (cls || '');
    el.innerHTML = html;
    el.classList.add('is-open');
    App.closeSheet();
    if (App.mode !== 'day') App.setMode('day');
    return el;
  }
  function closeTakeover() {
    var el = $('#takeover');
    el.classList.remove('is-open');
    el.innerHTML = '';
  }
  App.closeTakeover = closeTakeover;

  var doorbellTimer, doorbellUrl = null;
  App.doorbell = function () {
    var now = App.now();
    var el = takeover(
      '<div class="tk-cam" id="tkCam">' +
      '<span class="tk-live"><i></i>SNAPSHOT \u00B7 FRONT DOOR</span></div>' +
      '<div class="tk-door">' +
      '  <div class="label label--light">' + App.icon('bell', 20) + ' Front door \u00B7 ' + App.fmt.time(now) + '</div>' +
      '  <h1 class="serif tk-title">Someone\u2019s at<br>the front door</h1>' +
      '  <div class="tk-actions">' +
      '    <button class="tk-btn" data-go-cams>' + App.icon('camera', 30) + '<span>Cameras</span></button>' +
      '    <button class="tk-btn tk-btn--solid" data-dismiss>' + App.icon('x', 30) + '<span>Dismiss</span></button>' +
      '  </div>' +
      '</div>', 'takeover--door');
    el.querySelector('[data-dismiss]').onclick = function () { clearTimeout(doorbellTimer); closeTakeover(); };
    el.querySelector('[data-go-cams]').onclick = function () { clearTimeout(doorbellTimer); closeTakeover(); App.go('cameras'); };
    if (HA.status === 'live') {
      var camId = C.cameras[0] && C.cameras[0].id;
      HA.cameraStill(camId).then(function (blob) {
        var holder = document.getElementById('tkCam');
        if (!holder) return;
        if (doorbellUrl) try { URL.revokeObjectURL(doorbellUrl); } catch (e) {}
        doorbellUrl = URL.createObjectURL(blob);
        holder.insertAdjacentHTML('afterbegin', '<img src="' + doorbellUrl + '" alt="">');
      }).catch(function () {});
    }
    clearTimeout(doorbellTimer);
    doorbellTimer = setTimeout(closeTakeover, 45000);
  };

  App.alert = function (kind) {
    var now = App.now();
    var el = takeover(
      '<div class="tk-alarm">' +
      '<div class="tk-alarm-icon">' + App.icon('drop', 88) + '</div>' +
      '<div class="label label--light">Critical alert \u00B7 ' + App.fmt.time(now) + '</div>' +
      '<h1 class="tk-huge">Water leak</h1>' +
      '<p class="tk-sub">A leak sensor detected water on the floor. HA automations are already alerting phones.</p>' +
      '<div class="tk-actions">' +
      '<button class="tk-btn tk-btn--solid tk-btn--light" data-ack>' + App.icon('check', 30) + '<span>Acknowledge</span></button>' +
      '</div>' +
      '</div>', 'takeover--alarm');
    el.querySelector('[data-ack]').onclick = function () {
      closeTakeover();
      App.toast('Leak acknowledged on the frame', { icon: 'check' });
    };
  };

  // ------------------------------------------------------------ banners (amber, actionable)
  App.banner = function (opts) {
    var box = $('#banners');
    var b = document.createElement('div');
    b.className = 'banner banner--' + (opts.tone || 'amber');
    b.innerHTML = App.icon(opts.icon || 'bell', 30) + '<div class="banner-text"><b>' + opts.title + '</b><span>' + (opts.sub || '') + '</span></div>' +
      (opts.action ? '<button class="banner-btn banner-btn--solid" data-act>' + opts.action + '</button>' : '') +
      '<button class="banner-btn" data-x>' + (opts.dismiss || 'Dismiss') + '</button>';
    box.appendChild(b);
    b.classList.add('is-in');
    function kill() { b.remove(); }
    b.querySelector('[data-x]').onclick = kill;
    if (opts.action) b.querySelector('[data-act]').onclick = function () { kill(); opts.onAction(); };
    if (opts.ms) setTimeout(kill, opts.ms);
    return kill;
  };

  // ------------------------------------------------------------ demo drawer
  function demoHTML() {
    var t = App.now();
    return '<div class="demo-panel">' +
      '<div class="demo-head"><div><div class="label label--light">Panel</div><h2 class="serif">Demo controls</h2></div><button class="demo-x" data-demo-close>' + App.icon('x', 28) + '</button></div>' +
      '<div class="demo-sec"><div class="label label--light">Connection</div><div class="demo-grid">' +
      '<button data-status>HA: ' + HA.status + '</button><button data-reload>Reload page</button></div></div>' +
      '<div class="demo-sec"><div class="label label--light">Time of day \u00B7 now ' + App.fmt.time(t) + '</div><div class="demo-grid">' +
      '<button data-time="7:10">7:10 AM</button><button data-time="15:18">3:18 PM</button><button data-time="19:45">7:45 PM</button><button data-time="23:40">11:40 PM</button><button data-time="real">Real time</button></div></div>' +
      '<div class="demo-sec"><div class="label label--light">Modes</div><div class="demo-grid">' +
      '<button data-mode="ambient">Ambient</button><button data-mode="night">Night</button><button data-fastidle>' + (App.idle.home < 60 ? 'Idle: fast \u2713' : 'Idle: fast') + '</button></div></div>' +
      '<div class="demo-sec"><div class="label label--light">Alerts</div><div class="demo-grid">' +
      '<button data-alert="doorbell">Doorbell</button><button data-alert="leak">Water leak</button></div></div>' +
      '<p class="demo-note">Keyboard: <b>D</b> demo \u00B7 <b>A</b> ambient \u00B7 <b>N</b> night \u00B7 <b>1\u20130</b> views</p>' +
      '</div>';
  }
  App.openDemo = function () {
    var el = $('#demo');
    el.innerHTML = demoHTML();
    el.classList.add('is-open');
  };
  function closeDemo() { $('#demo').classList.remove('is-open'); }

  function demoClick(e) {
    var b = e.target.closest('button');
    if (!b) { if (e.target === $('#demo')) closeDemo(); return; }
    if (b.hasAttribute('data-demo-close')) return closeDemo();
    if (b.hasAttribute('data-status')) { App.openDemo(); return; }
    if (b.hasAttribute('data-reload')) { location.reload(); return; }
    if (b.dataset.time) {
      if (b.dataset.time === 'real') App.setTime(null);
      else { var p = b.dataset.time.split(':'); App.setTime(+p[0], +p[1]); }
      App.openDemo();
      return;
    }
    if (b.dataset.mode) { closeDemo(); App.setMode(b.dataset.mode); return; }
    if (b.hasAttribute('data-fastidle')) {
      var fast = App.idle.home >= 60;
      App.idle.home = fast ? 8 : 60;
      App.idle.ambient = fast ? 15 : 120;
      App.openDemo();
      return;
    }
    if (b.dataset.alert) {
      closeDemo();
      if (b.dataset.alert === 'doorbell') App.doorbell();
      if (b.dataset.alert === 'leak') App.alert('water');
      return;
    }
  }

  App.on('ready', function () {
    $('#demo').addEventListener('click', demoClick);
    App.hold($('#railClock'), 700, { done: App.openDemo });
    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT') return;
      var k = e.key.toLowerCase();
      if (k === 'd') { $('#demo').classList.contains('is-open') ? closeDemo() : App.openDemo(); }
      if (k === 'a') App.setMode('ambient');
      if (k === 'n') App.setMode('night');
      if (k === 'escape') { closeDemo(); App.closeSheet(); }
      var views = ['home', 'calendar', 'chores', 'lists', 'photos', 'lights', 'security', 'cameras', 'watering', 'cellar'];
      if (k >= '1' && k <= '9') App.go(views[+k - 1]);
      if (k === '0') App.go(views[9]);
    });
  });
})();
