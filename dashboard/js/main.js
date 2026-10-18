// Entry point. Order matters: each module attaches to the shared window.App.
import './icons.js';
import './ha-config.js';
import './ha-demo.js';    // demo fixture; only becomes the data source when no /ha.json
import './app.js';        // shell (defines App) — ha.js needs it, so it comes after
import './ha.js';         // live HA client; picks live vs demo at boot
import './system.js';     // takeovers, banners, demo drawer
import './slideshow.js';
import './views/today.js';
import './views/calendar.js';
import './views/chores.js';
import './views/lists.js';
import './views/photos.js';
import './views/lights.js';
import './views/security.js';
import './views/cameras.js';
import './views/watering.js';
import './views/aircon.js';
import './views/room.js';
import './views/cellar.js';
import './views/ambient.js';
import './diag.js';
