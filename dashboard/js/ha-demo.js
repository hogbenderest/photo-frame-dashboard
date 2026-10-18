// Demo fixture: canned entity states mirroring the real house as discovered on
// 2026-10-17. Loaded only in demo mode (no /ha.json or ?demo=1). Views read
// these through the same HA.* helpers as live data, so the UI can be developed
// and tested on the Mac without touching Home Assistant.
(function () {
  'use strict';
  var now = new Date();
  function iso(d, h, m) { var x = new Date(now); x.setDate(x.getDate() + d); x.setHours(h, m || 0, 0, 0); return x.toISOString(); }

  function st(entity_id, state, attributes, last_changed) {
    return { entity_id: entity_id, state: state, attributes: attributes || {}, last_changed: last_changed || now.toISOString(), last_updated: now.toISOString() };
  }

  var states = {};
  function S(o) { states[o.entity_id] = o; }

  // today
  S(st('weather.north_perth', 'sunny', { temperature: 24, humidity: 45, wind_speed: 15, forecast: [] }));
  S(st('weather.north_perth_hourly', 'sunny', { forecast: (function () {
    var f = [], h = now.getHours();
    for (var i = 0; i < 12; i++) f.push({ datetime: iso(0, (h + i) % 24), condition: i > 6 ? 'cloudy' : 'sunny', temperature: 24 - i, precipitation_probability: i > 6 ? 20 : 0 });
    return f;
  })() }));
  S(st('sensor.sun_next_rising', iso(1, 5, 34)));
  S(st('sensor.sun_next_setting', iso(0, 18, 29)));
  S(st('climate.front_lounge', 'off', { current_temperature: 22.4, friendly_name: 'Front Lounge' }));
  S(st('sensor.power_production_now', '4838', { unit_of_measurement: 'W', friendly_name: 'Solar now' }));
  S(st('sensor.energy_production_today', '27.149', { unit_of_measurement: 'kWh', friendly_name: 'Solar today' }));
  S(st('sensor.energy_production_today_remaining', '10.816', { unit_of_measurement: 'kWh', friendly_name: 'Solar remaining' }));
  S(st('sensor.energy_production_tomorrow', '7.038', { unit_of_measurement: 'kWh', friendly_name: 'Solar tomorrow' }));

  // people
  S(st('person.ian_hogben', 'home', { friendly_name: 'Ian Hogben' }));
  S(st('person.helen_barbour', 'home', { friendly_name: 'Helen Barbour' }));
  S(st('person.kyle_ingram', 'home', { friendly_name: 'Kyle Ingram' }));
  S(st('person.alexa_ingram', 'unknown', { friendly_name: 'Alexa Ingram' }));

  // lights
  S(st('light.alexa_lamp', 'unavailable', { friendly_name: 'Alexa Lamp' }));
  S(st('light.tv_light_strip', 'off', { friendly_name: 'TV Light Strip', brightness: 80 }));
  S(st('light.keyboard_light_strip', 'off', { friendly_name: 'Keyboard Light Strip', brightness: 60 }));
  S(st('light.bed_strip', 'off', { friendly_name: 'Bed Strip', brightness: 120 }));
  S(st('light.smart_plug_20041792822229251h3948e1e91a3cd4_dnd', 'on', { friendly_name: 'Bed Lamp Ian Dnd' }));
  S(st('light.smart_plug_20041747068605251h3948e1e91a3dba_dnd', 'on', { friendly_name: 'Bed Lamp Helen Dnd' }));
  S(st('light.ikea_of_sweden_tradfri_bulb_e14_cws_globe_806lm', 'on', { friendly_name: 'Sphere light', brightness: 140 }));
  S(st('light.paper_lamp_tradfri_globe_806lm', 'off', { friendly_name: 'Paper lamp', brightness: 200 }));
  S(st('light.wled_gledopto_main', 'off', { friendly_name: 'Upstairs Landing Bookcase Light', brightness: 90 }));
  S(st('light.wled_second_2', 'off', { friendly_name: 'Secondary LED', brightness: 90 }));
  S(st('light.patio_nanoleaf_string_lights', 'off', { friendly_name: 'Nanoleaf String Lights', brightness: 255 }));
  S(st('light.cellar_light', 'off', { friendly_name: 'Cellar light', brightness: 254 }));

  // security
  S(st('input_select.home_away_mode', 'Home', { friendly_name: 'Home Away Mode', options: ['Home', 'Away', 'Night'] }));
  S(st('input_boolean.guest_mode', 'off', { friendly_name: 'Guest Mode' }));
  S(st('binary_sensor.door_sensor_2', 'off', { friendly_name: 'Front Door' }));
  S(st('binary_sensor.door_sensor', 'off', { friendly_name: 'Cellar Door' }));
  S(st('binary_sensor.kitchen_garage_door', 'off', { friendly_name: 'Kitchen Garage Door' }));
  S(st('binary_sensor.patio_garage_door', 'off', { friendly_name: 'Patio Garage Door' }));
  S(st('cover.smart_garage_door_1911084913247890804648e1e9111bf0_garage', 'closed', { friendly_name: 'Garage Door' }));
  S(st('binary_sensor.smart_garage_door_1911084913247890804648e1e9111bf0_problem', 'off', { friendly_name: 'Garage Door 1 Problem' }));
  S(st('binary_sensor.3r_leak_sensor_hi_shower', 'off', { friendly_name: 'Helen Ian Shower Leak' }));
  S(st('binary_sensor.3r_leak_sensor_hi_toilet', 'off', { friendly_name: 'Helen Ian Toilet Leak' }));
  S(st('binary_sensor.3r_leak_sensor_connor', 'off', { friendly_name: 'Connor Ensuite Leak' }));
  S(st('binary_sensor.kitchen_3r_leak_sensor_kitchen', 'off', { friendly_name: 'Connor Kitchenette Leak' }));
  S(st('binary_sensor.water_leak_detected', 'off', { friendly_name: 'Water Leak Detected' }));
  ['front_door_cam_person', 'front_door_cam_package', 'front_door_cam_visitor', 'front_door_cam_vehicle',
   'garage_car_cam_person', 'garage_car_cam_motion'].forEach(function (n) { S(st('binary_sensor.' + n, 'off', { friendly_name: n })); });
  ['front_door_cam_siren', 'garage_car_cam_siren', 'home_hub_siren'].forEach(function (n) { S(st('siren.' + n, 'unknown', { friendly_name: n })); });

  // cameras (idle; stills unavailable in demo)
  ['camera.front_door_cam_fluent', 'camera.192_168_86_148', 'camera.192_168_86_22', 'camera.192_168_86_22_2', 'camera.192_168_86_22_3', 'camera.192_168_86_22_4', 'camera.patio_camera_5']
    .forEach(function (id, i) { S(st(id, 'idle', { friendly_name: ['Front Door', 'Garage', 'Driveway', 'Front Left', 'Front Right', 'Side Gate', 'Patio'][i] })); });

  // watering
  S(st('binary_sensor.front_garden_opensprinkler_front_retic_morning_program_running', 'off'));
  S(st('sensor.opensprinkler_next_run', iso(1, 4, 30), { friendly_name: 'OpenSprinkler Next Run' }));
  S(st('sensor.opensprinkler_last_run', iso(-7, 13, 33), { friendly_name: 'OpenSprinkler Last Run' }));
  S(st('binary_sensor.opensprinkler_rain_delay_active', 'off'));
  S(st('sensor.opensprinkler_rain_delay_stop_time', 'unknown'));
  S(st('binary_sensor.opensprinkler_paused', 'off'));
  S(st('binary_sensor.opensprinkler_weather_restriction_active', 'off'));
  S(st('input_number.retic_seasonal_level', '60.0', { min: 0, max: 100, unit_of_measurement: '%' }));
  S(st('input_boolean.retic_patio_hold', 'off'));
  S(st('timer.retic_heat_boost', 'idle', { friendly_name: 'Retic Heat Boost' }));
  S(st('binary_sensor.opensprinkler_s08_station_running', 'off'));
  S(st('switch.opensprinkler_s08_station_enabled', 'on'));
  var names = ['Verge Strip Top', 'Verge Strip Mid', 'Verge Strip Bottom', 'Lawn Upper', 'Letterbox Lawn', 'Driveway Lawn', 'Hedge Borders'];
  for (var i = 1; i <= 7; i++) {
    S(st('binary_sensor.opensprinkler_s0' + i + '_station_running', 'off', { friendly_name: names[i - 1] }));
    S(st('switch.opensprinkler_s0' + i + '_station_enabled', 'on', { friendly_name: names[i - 1] }));
  }
  S(st('switch.centre_garden_bed', 'off', { friendly_name: 'Centre Garden Bed' }));
  S(st('switch.garden_borders', 'off', { friendly_name: 'Garden Borders' }));
  var soils = [['sensor.letterbox_soil_moisture', 36.7, 'Letterbox Lawn'], ['sensor.driveway_soil_moisture', 28.9, 'Driveway Lawn'], ['sensor.back_garden_soil_moisture_soil_moisture', 77.7, 'Back Garden'], ['sensor.patio_tomato_plant_soil_moisture', 80.4, 'Patio Tomato'], ['sensor.balcony_bay_leaf_soil_moisture_soil_moisture', 12.7, 'Balcony Bay Leaf'], ['sensor.palm_pot_plant_soil_moisture_soil_moisture', 62.3, 'Palm Pot'], ['sensor.third_reality_inc_3rsm0347z_soil_moisture', 91.4, 'Plant Meter 1'], ['sensor.landing_balcony_plants_soil_moisture', 68.9, 'Plant Meter 2'], ['sensor.temporary_device_2_soil_moisture', 86.4, 'Plant Meter 3']];
  soils.forEach(function (s) { S(st(s[0], String(s[1]), { unit_of_measurement: '%', friendly_name: s[2] })); });

  // aircon (demo states mirror the live AirTouch shapes)
  S(st('input_number.aircon_whole_house_target', '21.0', { min: 16, max: 30, step: 1, friendly_name: 'Aircon Whole House Target' }));
  S(st('climate.ac_0', 'off', { hvac_modes: ['off', 'auto', 'cool', 'dry', 'fan_only', 'heat'], fan_modes: ['low', 'medium', 'high', 'auto'], current_temperature: 27, temperature: 23, fan_mode: 'low', friendly_name: 'Main Unit' }));
  S(st('climate.ac_1', 'off', { hvac_modes: ['off', 'auto', 'cool', 'dry', 'fan_only', 'heat'], fan_modes: ['low', 'medium', 'high', 'auto'], current_temperature: 26, temperature: 22, fan_mode: 'auto', friendly_name: 'Downstairs' }));
  [['helen_ian', 22.5, 21, 50], ['connor', 23, 21, 40], ['dining', 24, 22, 60], ['kitchen', 25, 22, 55], ['study', 23.5, 21, 45], ['upstairs', 26, 22, 35],
   ['alexa', 24, 21, 50], ['kyle', 23.5, 20, 40], ['marcus', 23, 21, 45], ['theatre', 24.5, 22, 30]].forEach(function (z) {
    S(st('climate.' + z[0], 'fan_only', { current_temperature: z[1], temperature: z[2], min_temp: 16, max_temp: 32, hvac_modes: ['off', 'fan_only'], preset_modes: ['none', 'boost'], preset_mode: 'none', friendly_name: z[0] }));
    S(st('cover.' + z[0] + '_damper', 'open', { current_position: z[3], device_class: 'damper', friendly_name: z[0] + ' damper' }));
  });

  // cellar
  S(st('sensor.cork_dork_total_bottles', '141', { friendly_name: 'Cork Dork Total Bottles' }));
  S(st('sensor.cork_dork_capacity', '97.9', { unit_of_measurement: '%', friendly_name: 'Cork Dork Capacity' }));
  S(st('sensor.cork_dork_section_1', '47', { friendly_name: 'Cork Dork Shelf 1' }));
  S(st('sensor.cork_dork_section_2', '47', { friendly_name: 'Cork Dork Shelf 2' }));
  S(st('sensor.cork_dork_section_3', '47', { friendly_name: 'Cork Dork Shelf 3' }));
  S(st('sensor.bilresa_dual_button_battery', '26', { unit_of_measurement: '%', friendly_name: 'BILRESA battery' }));
  S(st('sensor.door_sensor_battery', '47.5', { unit_of_measurement: '%', friendly_name: 'Cellar Door Battery' }));

  // calendar
  S(st('calendar.opensprinkler_schedule', 'off', { friendly_name: 'OpenSprinkler Schedule' }));

  // lists: built-in shopping list with a few items
  S(st('todo.shopping_list', '3', {
    friendly_name: 'Shopping list',
    items: [
      { uid: 'd1', summary: 'Milk 2%', status: 'needs_action' },
      { uid: 'd2', summary: 'Bananas', status: 'needs_action' },
      { uid: 'd3', summary: 'Coffee beans', status: 'needs_action' },
      { uid: 'd4', summary: 'Bread', status: 'completed' }
    ]
  }));
  // chores lists: present so the view renders (recurrences are empty by default)
  ['ian', 'helen', 'marcus', 'alexa', 'connor', 'kyle'].forEach(function (p) {
    S(st('todo.chores_' + p, '0', { friendly_name: 'Chores ' + p[0].toUpperCase() + p.slice(1), items: [] }));
  });

  window.DEMO_STATES = { states: states };
  window.DEMO_PAYLOADS = {
    wine: {
      wines: [
        { id: 'w1', name: 'Rockford Basket Press Shiraz', vintage: '2018', grape_variety: 'Shiraz', rating: 96, drink_window: '2023-2033', peak_status: 'at_peak', value: 90, location: { human_readable: 'Cabinet 1, Shelf 2, Column 3' } },
        { id: 'w2', name: 'Vasse Felix Filius Chardonnay', vintage: '2022', grape_variety: 'Chardonnay', rating: 91, drink_window: '2024-2027', peak_status: 'young', value: 32, location: { human_readable: 'Cabinet 2, Shelf 1, Column 5' } },
        { id: 'w3', name: 'Moss Wood Cabernet', vintage: '2015', grape_variety: 'Cabernet', rating: 94, drink_window: '2019-2024', peak_status: 'past_due', value: 120, location: { human_readable: 'Cabinet 1, Shelf 3, Column 1' } }
      ]
    },
    calendarEvents: [
      { summary: 'Front Retic Morning', start: { dateTime: iso(1, 4, 30) }, end: { dateTime: iso(1, 6, 30) }, location: 'Front garden' }
    ],
    photos: null // demo: photos not configured
  };
})();
