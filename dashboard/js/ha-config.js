// Frame dashboard entity map: the single source of truth for every entity,
// service and person the dashboard touches. Views never hard-code entity IDs.
//
// Live mode: kiosk AssetServer serves /ha.json -> { url, token } (loopback only,
// bundled in the APK, never in the dist that deploys to the Worker).
// Demo mode: no /ha.json (or ?demo=1) -> js/ha-demo.js canned states.
(function () {
  'use strict';

  // ---------------------------------------------------------------- people (HIMACK)
  // Family shorthand "HIMACK" = Helen Ian Marcus Alexa Connor Kyle.
  // personEntity / todoEntity are optional: Marcus and Connor have no HA person
  // or tracker yet; their chips show as configured people without presence.
  var PEOPLE = [
    { id: 'helen',  name: 'Helen',  person: 'person.helen_barbour', todo: 'todo.chores_helen',  color: '#E4007C', rgb: '228 0 124',   ink: '#FFFFFF' },
    { id: 'ian',    name: 'Ian',    person: 'person.ian_hogben',   todo: 'todo.chores_ian',    color: '#2D5BFF', rgb: '45 91 255',   ink: '#FFFFFF' },
    { id: 'marcus', name: 'Marcus', person: null,                   todo: 'todo.chores_marcus', color: '#7C3AED', rgb: '124 58 237',  ink: '#FFFFFF' },
    { id: 'alexa',  name: 'Alexa',  person: 'person.alexa_ingram', todo: 'todo.chores_alexa',  color: '#00A36C', rgb: '0 163 108',   ink: '#FFFFFF' },
    { id: 'connor', name: 'Connor', person: null,                   todo: 'todo.chores_connor', color: '#EA580C', rgb: '234 88 12',   ink: '#FFFFFF' },
    { id: 'kyle',   name: 'Kyle',   person: 'person.kyle_ingram',   todo: 'todo.chores_kyle',   color: '#FFB000', rgb: '255 176 0',   ink: '#111111' }
  ];
  var FAMILY = { id: 'himack', name: 'HIMACK', color: '#111111', rgb: '17 17 17', ink: '#FFFFFF' };

  window.HACONFIG = {

    // -------------------------------------------------------------- today
    today: {
      weather: 'weather.north_perth',            // condition + temperature
      weatherHourly: 'weather.north_perth_hourly', // attributes.forecast[]
      sunrise: 'sensor.sun_next_rising',
      sunset: 'sensor.sun_next_setting',
      indoor: 'climate.front_lounge',           // attributes.current_temperature
      solarNow: 'sensor.power_production_now',           // W
      solarToday: 'sensor.energy_production_today',      // kWh
      solarRemaining: 'sensor.energy_production_today_remaining', // kWh
      solarForecastTomorrow: 'sensor.energy_production_tomorrow'  // kWh
    },

    // -------------------------------------------------------------- lights
    // Only real, named lights. Camera status LEDs and other pseudo-lights are
    // deliberately excluded. brightness: the entity supports a level control.
    lights: {
      areas: [
        { id: 'frontlounge', name: 'Front Lounge', lights: [
          { id: 'light.alexa_lamp', name: 'Alexa Lamp', brightness: true }
        ]},
        { id: 'family', name: 'Family Room', lights: [
          { id: 'light.tv_light_strip', name: 'TV Light Strip', brightness: true }
        ]},
        { id: 'study', name: 'Study', lights: [
          { id: 'light.keyboard_light_strip', name: 'Keyboard Light Strip', brightness: true }
        ]},
        { id: 'bedroom', name: 'Helen + Ian', lights: [
          { id: 'light.bed_strip', name: 'Bed Strip', brightness: true },
          { id: 'switch.smart_plug_20041792822229251h3948e1e91a3cd4_outlet', name: 'Bed Lamp Ian', brightness: false },
          { id: 'switch.smart_plug_20041747068605251h3948e1e91a3dba_outlet', name: 'Bed Lamp Helen', brightness: false }
        ]},
        { id: 'kyle', name: "Kyle's Room", lights: [
          { id: 'light.ikea_of_sweden_tradfri_bulb_e14_cws_globe_806lm', name: 'Sphere Light', brightness: true }
        ]},
        { id: 'upstairs', name: 'Upstairs Landing', lights: [
          { id: 'light.paper_lamp_tradfri_globe_806lm', name: 'Paper Lamp', brightness: true },
          { id: 'light.wled_gledopto_main', name: 'Bookcase Light', brightness: true },
          { id: 'light.wled_second_2', name: 'Secondary LED', brightness: true }
        ]},
        { id: 'patio', name: 'Patio', lights: [
          { id: 'light.patio_nanoleaf_string_lights', name: 'String Lights', brightness: true }
        ]},
        { id: 'cellar', name: 'Cellar', lights: [
          { id: 'light.cellar_light', name: 'Cellar Light', brightness: true }
        ]}
      ]
    },

    // -------------------------------------------------------------- security
    security: {
      modeEntity: 'input_select.home_away_mode',   // Home | Away | Night
      modeScripts: { Home: 'script.set_mode_home', Away: 'script.set_mode_away', Night: 'script.set_mode_night' },
      guestMode: 'input_boolean.guest_mode',
      doors: [
        { id: 'binary_sensor.door_sensor_2', name: 'Front Door' },
        { id: 'binary_sensor.door_sensor', name: 'Cellar Door' },
        { id: 'binary_sensor.kitchen_garage_door', name: 'Kitchen to Garage' },
        { id: 'binary_sensor.patio_garage_door', name: 'Patio to Garage' }
      ],
      garage: {
        cover: 'cover.smart_garage_door_1911084913247890804648e1e9111bf0_garage',
        problem: 'binary_sensor.smart_garage_door_1911084913247890804648e1e9111bf0_problem'
      },
      leaks: [
        { id: 'binary_sensor.3r_leak_sensor_hi_shower', name: 'HI Shower' },
        { id: 'binary_sensor.3r_leak_sensor_hi_toilet', name: 'HI Toilet' },
        { id: 'binary_sensor.3r_leak_sensor_connor', name: 'Connor Ensuite' },
        { id: 'binary_sensor.kitchen_3r_leak_sensor_kitchen', name: 'Connor Kitchenette' }
      ],
      leakAggregate: 'binary_sensor.water_leak_detected',
      activity: [
        { id: 'binary_sensor.front_door_cam_person', name: 'Front person' },
        { id: 'binary_sensor.front_door_cam_package', name: 'Front package' },
        { id: 'binary_sensor.front_door_cam_visitor', name: 'Front visitor' },
        { id: 'binary_sensor.front_door_cam_vehicle', name: 'Front vehicle' },
        { id: 'binary_sensor.garage_car_cam_person', name: 'Garage person' },
        { id: 'binary_sensor.garage_car_cam_motion', name: 'Garage motion' }
      ],
      // Display only. Never rendered as buttons: no siren triggers on a wall panel.
      sirens: [
        { id: 'siren.front_door_cam_siren', name: 'Front Door Cam' },
        { id: 'siren.garage_car_cam_siren', name: 'Garage Car Cam' },
        { id: 'siren.home_hub_siren', name: 'Home Hub' }
      ]
    },

    // -------------------------------------------------------------- cameras
    cameras: [
      { id: 'camera.front_door_cam_fluent', name: 'Front Door', events: ['binary_sensor.front_door_cam_person', 'binary_sensor.front_door_cam_visitor', 'binary_sensor.front_door_cam_package'] },
      { id: 'camera.192_168_86_148', name: 'Garage', events: ['binary_sensor.garage_car_cam_person', 'binary_sensor.garage_car_cam_motion'] },
      { id: 'camera.192_168_86_22', name: 'Driveway', events: [] },
      { id: 'camera.192_168_86_22_2', name: 'Front Left', events: [] },
      { id: 'camera.192_168_86_22_3', name: 'Front Right', events: [] },
      { id: 'camera.192_168_86_22_4', name: 'Side Gate', events: [] },
      { id: 'camera.patio_camera_5', name: 'Patio', events: [] }
    ],
    camera: {
      gridRefreshMs: 30000,  // small tiles: one refresh every 30 s, staggered
      bigRefreshMs: 5000     // enlarged camera: every 5 s
    },

    // -------------------------------------------------------------- watering
    watering: {
      programRunning: 'binary_sensor.front_garden_opensprinkler_front_retic_morning_program_running',
      nextRun: 'sensor.opensprinkler_next_run',
      lastRun: 'sensor.opensprinkler_last_run',
      rainDelayActive: 'binary_sensor.opensprinkler_rain_delay_active',
      rainDelayUntil: 'sensor.opensprinkler_rain_delay_stop_time',
      paused: 'binary_sensor.opensprinkler_paused',
      weatherRestriction: 'binary_sensor.opensprinkler_weather_restriction_active',
      seasonalLevel: 'input_number.retic_seasonal_level',
      patioHold: 'input_boolean.retic_patio_hold',
      heatBoost: 'timer.retic_heat_boost',
      pumpRunning: 'binary_sensor.opensprinkler_s08_station_running',
      pumpEnabled: 'switch.opensprinkler_s08_station_enabled',
      actions: {
        stopAll: { service: 'script.retic_stop_all_watering', confirm: true },
        rainDelay: { service: 'script.retic_rain_delay_toggle', confirm: true },
        // Frame-only test runs, capped at 120 s server-side (WaterCorp 2-minute
        // per-station testing allowance). Never use retic_run_zone/valve here.
        testZone: 'script.retic_frame_test_zone',   // fields: station, duration
        testValve: 'script.retic_frame_test_valve', // fields: valve, duration
        // Per-zone stop: stations via opensprinkler.stop on the station switch
        // (verified per-station: pyopensprinkler sends /cm sid=en=0 for that
        // station only); patio valves via switch.turn_off.
        stopStation: 'opensprinkler.stop'
      },
      map: {
        polygons: '/retic/zone_polygons.json',
        layout: '/retic/layout.jpg',
        // Render order is load-bearing (project gotcha 3): hedge(7) loops
        // encircle lawn interiors under nonzero fill, so hedge must sit
        // below the lawns it wraps. Order from the HA Watering dashboard.
        order: [1, 2, 3, 4, 7, 5, 6, 8, 9]
      },
      zones: [
        { n: 1, name: 'Verge Strip Top',    run: 'binary_sensor.opensprinkler_s01_station_running', enabled: 'switch.opensprinkler_s01_station_enabled', station: 'switch.opensprinkler_s01_station_enabled', kind: 'station' },
        { n: 2, name: 'Verge Strip Mid',    run: 'binary_sensor.opensprinkler_s02_station_running', enabled: 'switch.opensprinkler_s02_station_enabled', station: 'switch.opensprinkler_s02_station_enabled', kind: 'station' },
        { n: 3, name: 'Verge Strip Bottom', run: 'binary_sensor.opensprinkler_s03_station_running', enabled: 'switch.opensprinkler_s03_station_enabled', station: 'switch.opensprinkler_s03_station_enabled', kind: 'station' },
        { n: 4, name: 'Lawn Upper',        run: 'binary_sensor.opensprinkler_s04_station_running', enabled: 'switch.opensprinkler_s04_station_enabled', station: 'switch.opensprinkler_s04_station_enabled', kind: 'station' },
        { n: 5, name: 'Letterbox Lawn',    run: 'binary_sensor.opensprinkler_s05_station_running', enabled: 'switch.opensprinkler_s05_station_enabled', station: 'switch.opensprinkler_s05_station_enabled', kind: 'station' },
        { n: 6, name: 'Driveway Lawn',     run: 'binary_sensor.opensprinkler_s06_station_running', enabled: 'switch.opensprinkler_s06_station_enabled', station: 'switch.opensprinkler_s06_station_enabled', kind: 'station' },
        { n: 7, name: 'Hedge Borders',     run: 'binary_sensor.opensprinkler_s07_station_running', enabled: 'switch.opensprinkler_s07_station_enabled', station: 'switch.opensprinkler_s07_station_enabled', kind: 'station' },
        { n: 8, name: 'Centre Garden Bed', run: 'switch.centre_garden_bed', enabled: null, station: 'switch.centre_garden_bed', kind: 'valve' },
        { n: 9, name: 'Garden Borders',    run: 'switch.garden_borders',   enabled: null, station: 'switch.garden_borders',   kind: 'valve' }
      ],
      // Canonical soil-moisture list: only the soil_moisture sensors, never the
      // humidity/battery/temperature duplicates from the same devices.
      soil: [
        { id: 'sensor.letterbox_soil_moisture', name: 'Letterbox Lawn' },
        { id: 'sensor.driveway_soil_moisture', name: 'Driveway Lawn' },
        { id: 'sensor.back_garden_soil_moisture_soil_moisture', name: 'Back Garden' },
        { id: 'sensor.patio_tomato_plant_soil_moisture', name: 'Patio Tomato' },
        { id: 'sensor.balcony_bay_leaf_soil_moisture_soil_moisture', name: 'Balcony Bay Leaf' },
        { id: 'sensor.palm_pot_plant_soil_moisture_soil_moisture', name: 'Palm Pot' },
        { id: 'sensor.third_reality_inc_3rsm0347z_soil_moisture', name: 'Plant Meter 1' },
        { id: 'sensor.landing_balcony_plants_soil_moisture', name: 'Plant Meter 2' },
        { id: 'sensor.temporary_device_2_soil_moisture', name: 'Plant Meter 3' }
      ],
      lowThreshold: 20, // matches the hand-watering advisor
      compliance: 'WaterCorp roster: Thu + Sun, one application before 9am. Winter switch-off 1 Jun - 31 Aug is handled by the program date range. Panel test runs are capped at 2 minutes per station (testing allowance).'
    },

    // -------------------------------------------------------------- wine cellar
    cellar: {
      bottles: 'sensor.cork_dork_total_bottles',
      capacity: 'sensor.cork_dork_capacity',
      shelves: [
        { id: 'sensor.cork_dork_section_1', name: 'Shelf 1' },
        { id: 'sensor.cork_dork_section_2', name: 'Shelf 2' },
        { id: 'sensor.cork_dork_section_3', name: 'Shelf 3' }
      ],
      door: 'binary_sensor.door_sensor',
      light: 'light.cellar_light',
      batteries: [
        { id: 'sensor.bilresa_dual_button_battery', name: 'Cellar button' },
        { id: 'sensor.door_sensor_battery', name: 'Door sensor' }
      ]
    },

    // -------------------------------------------------------------- aircon
    // Mirrors the HA "Aircon" dashboard (lovelace.dashboard_aircon):
    // two AirTouch units, 10 zone climates + 10 dampers, whole-house target.
    // Setting wholeHouse only sets the helper - the user's
    // "Aircon Whole House Target Apply" automation fans it out (1 setpoint/sec).
    aircon: {
      wholeHouse: 'input_number.aircon_whole_house_target',
      units: [
        { id: 'climate.ac_0', name: 'Main', zones: ['helen_ian', 'connor', 'dining', 'kitchen', 'study', 'upstairs'] },
        { id: 'climate.ac_1', name: 'Downstairs', zones: ['alexa', 'kyle', 'marcus', 'theatre'] }
      ],
      zones: {
        helen_ian: { name: 'Helen + Ian', climate: 'climate.helen_ian', damper: 'cover.helen_ian_damper' },
        connor:    { name: 'Connor',      climate: 'climate.connor',    damper: 'cover.connor_damper' },
        dining:    { name: 'Dining',      climate: 'climate.dining',    damper: 'cover.dining_damper' },
        kitchen:   { name: 'Kitchen',     climate: 'climate.kitchen',   damper: 'cover.kitchen_damper' },
        study:     { name: 'Study',       climate: 'climate.study',     damper: 'cover.study_damper' },
        upstairs:  { name: 'Upstairs',    climate: 'climate.upstairs',  damper: 'cover.upstairs_damper' },
        alexa:     { name: 'Alexa',       climate: 'climate.alexa',     damper: 'cover.alexa_damper' },
        kyle:      { name: 'Kyle',        climate: 'climate.kyle',      damper: 'cover.kyle_damper' },
        marcus:    { name: 'Marcus',      climate: 'climate.marcus',    damper: 'cover.marcus_damper' },
        theatre:   { name: 'Theatre',    climate: 'climate.theatre',   damper: 'cover.theatre_damper' }
      }
    },

    // -------------------------------------------------------------- music
    // Spotify on the Sonos trio: Sonos plays spotify:* URIs natively through
    // the Sonos integration (the Spotify service is linked in the Sonos app;
    // verified live 2026-10-18: playlist URI -> full queue). The HA Spotify
    // integration is NOT involved in playback (it cannot target Sonos at all).
    // Presets are plain-text rows in the HA "Music Presets" to-do list, edited
    // from any phone via the HA app; tick a row on the phone to hide it from
    // the frame. Two row forms are accepted:
    //   Dinner Jazz | spotify:playlist:5xddIVAtLrZKtt4YGLM1SQ   (URI form)
    //   Deep Focus  | https://open.spotify.com/playlist/37i9dQZF1DX0SM0LYsmbMT
    // Unparseable rows are counted on the view, never rendered as tiles.
    music: {
      presets: 'todo.music_presets',
      defaultSpeaker: 'media_player.sonos_move',
      speakers: [
        { id: 'media_player.sonos_move',  name: 'Sonos Move',  room: 'Living Room' },
        { id: 'media_player.family_room', name: 'Family Room', room: 'Family Room' },
        { id: 'media_player.dining_room',  name: 'Dining Room', room: 'Dining Room' }
      ]
    },

    // -------------------------------------------------------------- family views
    calendar: {
      // calendar.opensprinkler_schedule is real data but deliberately excluded
      // from the Today "next up" strip (watering already has its own card).
      // All four calendars render on the Calendar tab.
      entities: [
        { id: 'calendar.2lawlerst_gmail_com', name: '2lawlerst', color: '#2D5BFF', strip: true },
        { id: 'calendar.birthdays', name: 'Birthdays', color: '#E4007C', strip: true },
        { id: 'calendar.holidays_in_australia', name: 'Holidays', color: '#00A36C', strip: true },
        { id: 'calendar.opensprinkler_schedule', name: 'Irrigation', color: '#7A756B', strip: false }
      ],
      days: 7
    },

    // Unread mail is written by the Mac-side Google sync script
    // (scripts/frame-google-sync/) via POST /api/states with an HA long-lived
    // token. State = unread count; attributes.messages = [{from, subject,
    // date}]. Never write email metadata to www/ (/local/ is unauthenticated).
    mail: {
      sensor: 'sensor.frame_mail_unread',
      maxSenders: 3,
      hourly: 'Synced hourly from Gmail; the count and sender list update on the next sync.',
      // Bill heuristic: sender name matching any keyword gets a "bill" pill on
      // the hero mail line so invoices can't hide among Google alerts.
      billKeywords: ['bill', 'invoice', 'synergy', 'water corp', 'watercorp', 'water', 'energy', 'electric', 'origin', 'agl', 'optus', 'telstra', 'amber', 'sumo', 'medibank', 'bupa', 'rates', 'council', 'rego', 'insurance', 'bank']
    },

    // ------------------------------------------------------------ patio
    // The fan is RF-driven via the Broadlink remote: buttons ALWAYS call these
    // scripts; fan.patio_fan / input_boolean.patio_fan_power_state are only
    // best-known state mirrors (no feedback from the physical fan).
    patio: {
      lights: [{ id: 'light.patio_nanoleaf_string_lights', name: 'String Lights', brightness: true }],
      fan: {
        state: 'fan.patio_fan',
        power: 'input_boolean.patio_fan_power_state',
        scripts: {
          on: 'script.patio_fan_on_1',
          off: 'script.patio_fan_off_2',
          light: 'script.patio_fan_light',
          low: 'script.patio_fan_speed_1',
          medium: 'script.patio_fan_speed_2',
          high: 'script.patio_fan_speed_3'
        }
      }
    },

    // ------------------------------------------------------------ frames + rooms
    // Every frame runs the same APK; /ha.json carries {"frame": "<id>"}.
    // Unknown or missing id falls back to 'living' (the pre-profile build
    // deployed to the living room has no "frame" key).
    //
    // Room defs: aircon: '<aircon.zones key>' = AirTouch ducted zone
    // (climate + damper); climate: '<entity>' = standalone IR climate (Front
    // Lounge split); lights: tiles on the Room view; kind: 'patio' pulls the
    // string lights + RF fan from the patio block above; chores: person ids.
    // Profiles list ONE OR MORE rooms: multi-room profiles (living, study)
    // render every listed room's controls on a single Room page - no tabs.
    profiles: {
      living:    { name: 'Living Room', landing: 'home', rooms: ['patio', 'frontlounge', 'family', 'kitchen', 'dining', 'theatre'], photosManifest: '/local/frame-photos/frame-photos.js' },
      helen_ian: { name: 'Helen + Ian', landing: 'room', rooms: ['helen_ian'], photosManifest: '/local/frame-photos/helen_ian/frame-photos.js', nightMode: true },
      alexa:     { name: 'Alexa',       landing: 'room', rooms: ['alexa'],     photosManifest: '/local/frame-photos/alexa/frame-photos.js' },
      kyle:      { name: 'Kyle',        landing: 'room', rooms: ['kyle'],      photosManifest: '/local/frame-photos/kyle/frame-photos.js' },
      marcus:    { name: 'Marcus',      landing: 'room', rooms: ['marcus'],    photosManifest: '/local/frame-photos/marcus/frame-photos.js' },
      connor:    { name: 'Connor',      landing: 'room', rooms: ['connor'],    photosManifest: '/local/frame-photos/connor/frame-photos.js' },
      study:     { name: 'Study',       landing: 'room', rooms: ['study', 'upstairs'], photosManifest: '/local/frame-photos/study/frame-photos.js' }
    },
    rooms: {
      patio:     { name: 'Patio', kind: 'patio' },
      helen_ian: { name: 'Helen + Ian', aircon: 'helen_ian',
                   lights: [{ id: 'light.bed_strip', name: 'Bed Strip', brightness: true },
                             { id: 'switch.smart_plug_20041792822229251h3948e1e91a3cd4_outlet', name: 'Bed Lamp Ian', brightness: false },
                             { id: 'switch.smart_plug_20041747068605251h3948e1e91a3dba_outlet', name: 'Bed Lamp Helen', brightness: false }],
                   chores: ['helen', 'ian'] },
      alexa:     { name: 'Alexa', aircon: 'alexa', lights: [{ id: 'light.alexa_lamp', name: 'Alexa Lamp', brightness: true }], chores: ['alexa'] },
      kyle:      { name: 'Kyle', aircon: 'kyle', lights: [{ id: 'light.ikea_of_sweden_tradfri_bulb_e14_cws_globe_806lm', name: 'Sphere Light', brightness: true }], chores: ['kyle'] },
      marcus:    { name: 'Marcus', aircon: 'marcus', lights: [], chores: ['marcus'] },
      connor:    { name: 'Connor', aircon: 'connor', lights: [], chores: ['connor'] },
      study:     { name: 'Study', aircon: 'study', lights: [{ id: 'light.keyboard_light_strip', name: 'Keyboard Light Strip', brightness: true }], chores: [] },
      // Living-room-frame rooms (downstairs areas around the frame itself)
      frontlounge: { name: 'Front Lounge', climate: 'climate.front_lounge',
                     lights: [{ id: 'light.alexa_lamp', name: 'Alexa Lamp', brightness: true }] },
      family:    { name: 'Family Room', lights: [{ id: 'light.tv_light_strip', name: 'TV Light Strip', brightness: true }] },
      kitchen:   { name: 'Kitchen', aircon: 'kitchen' },
      dining:    { name: 'Dining Room', aircon: 'dining' },
      theatre:   { name: 'Theatre', aircon: 'theatre' },
      // Study-frame extra room: the landing is right outside the study
      upstairs:  { name: 'Upstairs Landing', aircon: 'upstairs',
                   lights: [{ id: 'light.paper_lamp_tradfri_globe_806lm', name: 'Paper Lamp', brightness: true },
                            { id: 'light.wled_gledopto_main', name: 'Bookcase Light', brightness: true },
                            { id: 'light.wled_second_2', name: 'Secondary LED', brightness: true }] }
    },

    lists: {
      // To-do lists shown as tabs. todo.shopping_list is the built-in helper.
      // Shared Apple Reminders lists appear as todo.* entities once the HA
      // CalDAV integration is configured; add their IDs here.
      lists: [
        { id: 'todo.shopping_list', name: 'Shopping' }
      ]
    },

    chores: {
      // Recurring chore definitions live in the HA to-do list below (editable
      // from any phone via the HA app). Each item is plain text:
      //   Kyle | Make bed | daily
      //   HIMACK | Bins out | Thu | 1        (4th segment = stars, optional)
      // Rules: day is 'daily' | 'weekday' | 'weekend' | 0-6 (Sun=0) | day name.
      // Ticking a definition pauses it; deleting the item removes the rule.
      // Parse errors are shown on the Chores view.
      definitionsEntity: 'todo.chore_definitions',
      familyTodo: 'todo.chores_himack', // create alongside the person lists
      weekStarts: 1 // Monday
    },

    photos: {
      // The sync pipeline writes into HA's www/frame-photos/ and emits a JS
      // manifest (a <script> tag loads cross-origin without CORS, unlike JSON).
      manifestPath: '/local/frame-photos/frame-photos.js',
      fallbackNote: 'Photos appear once the Google Photos sync pipeline is configured (see docs/frame-dashboard.md).'
    },

    // All entity IDs the dashboard subscribes to. Built from the sections above
    // so the HA limited-user allowlist has exactly one list to mirror.
    allEntities: function () {
      var ids = [];
      function add(id) { if (id && ids.indexOf(id) < 0) ids.push(id); }
      var t = this.today; for (var k in t) add(t[k]);
      this.lights.areas.forEach(function (a) { a.lights.forEach(function (l) { add(l.id); }); });
      var PT = this.patio; // string lights + RF fan mirrors (state only; power via scripts)
      PT.lights.forEach(function (l) { add(l.id); });
      add(PT.fan.state); add(PT.fan.power);
      var s = this.security;
      add(s.modeEntity); add(s.guestMode); add(s.leakAggregate);
      s.doors.forEach(function (d) { add(d.id); });
      add(s.garage.cover); add(s.garage.problem);
      s.leaks.forEach(function (d) { add(d.id); });
      s.activity.forEach(function (d) { add(d.id); });
      s.sirens.forEach(function (d) { add(d.id); });
      this.cameras.forEach(function (c) { add(c.id); c.events.forEach(add); });
      var w = this.watering;
      [w.programRunning, w.nextRun, w.lastRun, w.rainDelayActive, w.rainDelayUntil, w.paused,
       w.weatherRestriction, w.seasonalLevel, w.patioHold, w.heatBoost, w.pumpRunning, w.pumpEnabled]
        .forEach(add);
      w.zones.forEach(function (z) { add(z.run); add(z.enabled); add(z.station); });
      w.soil.forEach(function (m) { add(m.id); });
      var c = this.cellar;
      [c.bottles, c.capacity, c.door, c.light].forEach(add);
      c.shelves.forEach(function (x) { add(x.id); });
      c.batteries.forEach(function (x) { add(x.id); });
      add(this.aircon.wholeHouse);
      var AC = this.aircon; // captured for the closure (no `C` in this scope)
      AC.units.forEach(function (u) { add(u.id); });
      Object.keys(AC.zones).forEach(function (k) {
        add(AC.zones[k].climate);
        add(AC.zones[k].damper);
      });
      this.music.speakers.forEach(function (s) { add(s.id); });
      add(this.music.presets);
      this.calendar.entities.forEach(function (e) { add(e.id); });
      this.lists.lists.forEach(function (l) { add(l.id); });
      add(this.mail.sensor);
      add('sun.sun');
      add(this.chores.definitionsEntity);
      add(this.chores.familyTodo);
      PEOPLE.forEach(function (p) { add(p.person); add(p.todo); });
      return ids;
    }
  };

  window.HAPEOPLE = { people: PEOPLE, family: FAMILY, byId: {} };
  PEOPLE.forEach(function (p) { window.HAPEOPLE.byId[p.id] = p; });

  // Frame profile resolution: identity comes from /ha.json ("frame": "<id>").
  // Fallback chain per the plan: missing/unknown id -> 'living'; unknown
  // profile id -> the living profile. Views call these at render time (after
  // HA.init has resolved ha.json), never at module scope.
  window.HACONFIG.profileFor = function (frameId) {
    var id = frameId || 'living';
    return HACONFIG.profiles[id] || HACONFIG.profiles.living;
  };
  window.HACONFIG.frameId = 'living'; // overwritten by ha.js once ha.json resolves
  window.HACONFIG.profile = function () { return HACONFIG.profileFor(HACONFIG.frameId); };
  // Rooms for a frame: profiles list one or more room ids (rooms: []).
  // Legacy single-key profiles (room: 'x') still resolve to a one-element
  // list. Unknown room ids are dropped, never fatal.
  window.HACONFIG.roomsFor = function (frameId) {
    var p = HACONFIG.profileFor(frameId);
    var list = (p.rooms && p.rooms.length ? p.rooms : (p.room ? [p.room] : []));
    return list.map(function (id) { return HACONFIG.rooms[id] || null; }).filter(Boolean);
  };
})();
