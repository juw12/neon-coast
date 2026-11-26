// =====================================================================
// NEON COAST - part 4: population, camera, input, menus, main loop
// =====================================================================
let firing = false;
let deadT = 0;
let deadKind = 'wasted';
let popT = 0;
let frameNo = 0;
let titleAngle = 0.6;
const view = { fov: 62 };        // the lens at rest; resize() widens it on an upright screen

// ---------- keeping the streets busy around the player ----------
// how many are kept within reach of the player: [with the full crowd, on the lightest graphics]
const CROWD = { traffic: [20, 11], parked: [11, 7], walkers: [34, 18] };
function updatePopulation(dt) {
  popT -= dt;
  if (popT > 0) return;
  popT = 0.2;
  const [px, pz] = focus();
  let traffic = 0;
  let parked = 0;
  for (const v of vehicles.slice()) {
    const d = Math.hypot(v.x - px, v.z - pz);
    const stale = d > 270 || (v.dead && v.deadT > 25 && d > 45) || (v.dead && v.deadT > 80);
    if (stale && v !== player.car && (!v.keep || v.dead)) {
      removeVehicle(v);
      continue;
    }
    if (v.driver === 'ai' || v.driver === 'cop') traffic++;
    else if (!v.driver && !v.dead) parked++;
  }
  // at speed the player outruns one try every fifth of a second: up to three, so the road ahead is not empty
  const car = player.car;
  const tries = car && Math.hypot(car.vx, car.vz) > AHEAD.speed ? 3 : 1;
  for (let k = 0; k < tries && traffic < (gfx.crowd ? CROWD.traffic[0] : CROWD.traffic[1]); k++) {
    if (spawnTraffic(95, 250, false)) traffic++;
  }
  if (parked < (gfx.crowd ? CROWD.parked[0] : CROWD.parked[1])) spawnTraffic(95, 250, true);
  for (let k = peds.length - 1; k >= 0; k--) {
    if (dist2(peds[k].x, peds[k].z, px, pz) < 190 * 190) continue;
    scene.remove(peds[k].mesh);
    peds.splice(k, 1);
  }
  if (peds.length < (gfx.crowd ? CROWD.walkers[0] : CROWD.walkers[1])) spawnWalker(45, 150);
}

// ---------- session control ----------
// start spot: kerb of the beach road, clear of palms and lamp posts, looking up the street
const START = { x: PLACES.home[0] - 2, z: PLACES.home[1] + 50, yaw: Math.PI + 0.2 };
function resetSession() {
  for (const v of vehicles.slice()) removeVehicle(v);
  for (const ped of peds) scene.remove(ped.mesh);
  for (const p of pickups) scene.remove(p.mesh);
  peds.length = 0;
  pickups.length = 0;
  mission.active = false;
  mission.timer = -1;
  mission.car = null;
  removeMarker(mission.goalMarker);
  mission.goalMarker = null;
  $('objective').classList.remove('show');
  setWanted(0);
  wanted.pts = 0;
  styleReset();
  resetHavoc();                   // part 3c: everything stands again, the nitro tank is back at its start
  hideHeli();
  cab.on = false;
  ride.t = 0;
  clearPassenger();
  toggleBigMap(false);
  PROPERTIES.forEach(placeProperty);
  placeGarage();
  checkPerks(true);

  Object.assign(player, { x: START.x, z: START.z, y: 0, vy: 0, h: START.yaw, hp: 100, car: null, lastCar: null, ammo: 48, gun: true, fireT: 0, punchT: 0 });
  player.mesh.visible = true;
  player.mesh.rotation.set(0, player.h, 0);
  player.mesh.position.set(player.x, 0, player.z);
  cam.yaw = START.yaw;
  cam.pitch = -0.18;
  cam.dist = 5;
  tod = 17.4;

  // a ride waiting at the kerb outside
  addVehicle('muscle', roadC(9) + PARK, START.z - 11, Math.PI, null, '#b3261e');
  packageSpots.forEach((spot, id) => {
    if (!save.packages.includes(id)) addPickup('package', spot[0], spot[1], 0, id);
  });
  for (const place of [PLACES.hospital, PLACES.home, PLACES.bank, PLACES.police]) {
    addPickup('health', place[0] + 3.5, place[1], 0);
  }
  offerMission();
  for (let k = 0; k < 60; k++) spawnTraffic(22, 250, k % 3 === 0);
  for (let k = 0; k < 80; k++) spawnWalker(34, 150);   // nobody in the player's face for the first seconds
}

function die(kind) {
  if (state !== 'play') return;
  if (mission.active) endMission(false, kind === 'busted' ? 'You were arrested.' : 'You were taken out.');
  state = 'dead';
  deadKind = kind;
  styleReset();
  deadT = 3.4;
  firing = false;
  if (player.car) exitCar();
  if (kind !== 'busted') {
    player.mesh.rotation.set(-Math.PI / 2, player.h, 0);
    player.mesh.position.set(player.x, 0.2, player.z);
  }
  banner(kind === 'busted' ? 'busted' : 'fail', kind === 'busted' ? 'BUSTED' : 'WASTED', '', 3.4);
  sfx.fail();
}

function respawn() {
  const busted = deadKind === 'busted';
  const fee = Math.round(save.money * 0.1);
  const place = busted ? PLACES.police : PLACES.hospital;
  addMoney(-fee);
  if (busted) player.ammo = Math.floor(player.ammo / 2);
  Object.assign(player, { x: place[0], z: place[1] + 2, y: 0, vy: 0, hp: 100, h: 0 });
  player.mesh.rotation.set(0, 0, 0);
  setWanted(0);
  wanted.pts = 0;
  cam.yaw = 0;
  state = 'play';
  hint((busted ? 'Released from the station.' : 'Patched up at the hospital.') + '  -$' + fee, 5);
}

// ---------- camera ----------
// how speed shows: the lens widens by `lens` degrees for each m/s up to `lensMax` (1.8: 0.3 and 14), the car
// trembles above `rumbleFrom` of its top speed, and the edges of the screen darken from `rushFrom` m/s
const SPEED_FEEL = { lens: 0.42, lensMax: 20, rumbleFrom: 0.72, rumble: 0.22, rushFrom: 22, rushFull: 46 };
function updateCamera(dt) {
  if (state === 'title') {
    titleAngle += dt * 0.07;
    const cx = player.x - 150;
    camera.position.set(cx + Math.cos(titleAngle) * 235, 120, player.z + Math.sin(titleAngle) * 235);
    camera.lookAt(cx, 12, player.z);
    return;
  }
  if (ride.t > 0) {
    // once round the Sol Wheel, from the bottom, looking back over the beach at the city
    const w = landmarks.wheelAt;
    const a = -Math.PI / 2 + (1 - ride.t / RIDE_SECS) * Math.PI * 2;
    camera.position.set(w.x - 3.2, w.y + Math.sin(a) * 25 + 1.2, w.z + Math.cos(a) * 25);
    camera.lookAt(w.x - 420, 16, w.z - 60);
    if (Math.abs(camera.fov - view.fov) > 0.05) {
      camera.fov = view.fov;
      camera.updateProjectionMatrix();
    }
    return;
  }
  const car = player.car;
  const tx = car ? car.x : player.x;
  const tz = car ? car.z : player.z;
  const ty = car ? 1.6 + car.y * 0.8 : 1.55 + player.y;      // up a ramp and through the air with the car
  const speed = car ? Math.hypot(car.vx, car.vz) : 0;
  if (car && performance.now() - cam.lastMouse > 1400 && car.vf > 2.5) {
    // in a slide the camera stays nearer the way the car is travelling than the way it points,
    // so the car is seen at an angle and the road ahead stays in view
    const sideways = speed > 6 ? car.slip / speed : 0;
    const travel = wrapPi(Math.atan2(car.vx, car.vz) - car.h) * clamp((sideways - 0.15) * 1.6, 0, 0.6);
    cam.yaw += wrapPi(car.h + travel - cam.yaw) * Math.min(1, dt * 2.8);
    cam.pitch += (-0.2 - cam.pitch) * Math.min(1, dt * 1.5);
  }
  if (!car && touch.on && player.speed > 0 && performance.now() - cam.lastMouse > 1200) {
    // one thumb walks and no mouse turns the view, so the camera swings round behind the player
    // (not when they walk towards it: that would spin the view half a turn)
    const turn = wrapPi(player.h - cam.yaw);
    if (Math.abs(turn) < 2.2) cam.yaw += turn * Math.min(1, dt * 1.3);
  }
  const cp = Math.cos(cam.pitch);
  const dx = Math.sin(cam.yaw) * cp;
  const dy = Math.sin(cam.pitch);
  const dz = Math.cos(cam.yaw) * cp;
  let ox = tx;
  let oz = tz;
  if (!car) {
    ox -= Math.cos(cam.yaw) * 0.55;   // over the right shoulder
    oz += Math.sin(cam.yaw) * 0.55;
  }
  const want = car ? 8.5 + speed * 0.05 : 5;
  let open = want;
  for (let s = 1; s <= want; s += 0.5) {
    const box = insideBox(ox - dx * s, oz - dz * s);
    if (box && ty - dy * s < box.h) {
      open = Math.max(0.8, s - 0.7);
      break;
    }
  }
  cam.dist = open < cam.dist ? open : lerp(cam.dist, open, Math.min(1, dt * 4));
  cam.shake = Math.max(0, cam.shake - dt * 1.6);
  // near its top speed the car trembles
  if (car && state === 'play') cam.shake = Math.max(cam.shake, (speed / car.t.max - SPEED_FEEL.rumbleFrom) * SPEED_FEEL.rumble);
  const jx = (Math.random() - 0.5) * cam.shake;
  const jy = (Math.random() - 0.5) * cam.shake;
  camera.position.set(ox - dx * cam.dist + jx, Math.max(0.5, ty - dy * cam.dist + jy), oz - dz * cam.dist);
  camera.lookAt(ox + dx * 10, ty + dy * 10, oz + dz * 10);
  const fov = view.fov + Math.min(SPEED_FEEL.lensMax, speed * SPEED_FEEL.lens) + (nitro.on ? NITRO.lens : 0);
  if (Math.abs(fov - camera.fov) > 0.05) {
    camera.fov = lerp(camera.fov, fov, Math.min(1, dt * 3));
    camera.updateProjectionMatrix();
  }
}

// ---------- one simulation step ----------
// `shown` is false for the steps of a frame that are not drawn (see frame()): they move the game on and
// leave the panel, the map and the sound alone.
function update(dt, realDt, shown) {
  const [fx, fz] = focus();
  updateSky(dt, fx, fz);
  if (state === 'play') {
    player.fireT = Math.max(0, player.fireT - dt);
    player.punchT = Math.max(0, player.punchT - dt);
    if (ride.t > 0) {
      ride.t -= dt;
      if (ride.t <= 0) {
        ride.t = 0.001;
        endRide();
      }
    } else {
      if (!player.car) updatePlayerOnFoot(dt);
      if (firing) playerAttack();
    }
  }
  if (state === 'play') gameClock += dt;
  for (let k = 0; k < vehicles.length; k++) updateVehicle(vehicles[k], dt);
  collideVehicles();
  vehiclesVsProps();              // part 3c: what stands on the street is knocked over
  if (state === 'play') updateStyle(dt);
  vehiclesVsPeople(dt);
  for (let k = peds.length - 1; k >= 0; k--) {
    if (updatePed(peds[k], dt)) continue;
    scene.remove(peds[k].mesh);
    peds.splice(k, 1);
  }
  updatePopulation(dt);
  updateProps(dt);
  updateHavoc(dt, realDt);
  if (state === 'play') {
    updateWanted(dt);
    updateMarkers(dt);
    updatePickups(dt);
    updateMission(dt);
    updateIntro(dt);
  }
  if (shown) updateRoute();
  if (state === 'dead') {
    deadT -= realDt;
    if (deadT <= 0) respawn();
  }
  updateParticles(dt);
  for (const line of tracers) {
    if (!line.visible) continue;
    line.userData.t -= dt;
    if (line.userData.t <= 0) line.visible = false;
  }
  updateCamera(dt);

  const car = player.car;
  headlight.intensity = car ? nightAmount * 2.4 : 0;
  if (car) {
    const sx = Math.sin(car.h);
    const cz = Math.cos(car.h);
    headlight.position.set(car.x + sx * 1.6, 1.2, car.z + cz * 1.6);
    headlight.target.position.set(car.x + sx * 26, 0, car.z + cz * 26);
  }
  if (!shown) return;
  if (state !== 'title') {
    updateHud();
    if ((frameNo & 1) === 0) drawMap();
  }
  updateAudio();
}

// ---------- settings, menus ----------
const SETTINGS = [
  ['Difficulty', 'difficulty', ['Easy', 'Normal', 'Hard']],
  ['Graphics', 'quality', ['Fast', 'Pretty', 'Auto']],
  ['Sound', 'sound', ['Off', 'On']],
  ['Steering', 'steer', ['Stick', 'Arrows'], 'touch'],   // shown on a touch screen only
];

// ---------- how much is drawn ----------
// Fast and Pretty are fixed. Auto, where a phone starts, walks this ladder by the frame rate it measures.
// Shadows go first, then the glow pass and half the crowd, and only then drawn pixels: never fewer than
// 1.5 per point on a touch screen (a dense screen shows every stair-step below that), never under 1.
const LADDER = [
  { ratio: 2, shadows: true, glow: true, crowd: 1 },
  { ratio: 2, shadows: false, glow: true, crowd: 1 },
  { ratio: 2, shadows: false, glow: false, crowd: 0 },
  { ratio: 1.75, shadows: false, glow: false, crowd: 0 },
  { ratio: 1.5, shadows: false, glow: false, crowd: 0 },
  { ratio: 1.25, shadows: false, glow: false, crowd: 0 },
  { ratio: 1, shadows: false, glow: false, crowd: 0 },
];
const gfx = { ratio: 1, shadows: false, glow: false, crowd: 0 };
const auto = { level: 1, settle: 4, time: 0, frames: 0, calm: 0, hold: 0, trial: null, useless: {}, forget: 0, manual: false };
const lowestRung = () => (touch.on ? 4 : LADDER.length - 1);
function setGfx() {
  const rung = save.quality === 2 ? LADDER[Math.min(auto.level, lowestRung())]
    : save.quality === 1 ? LADDER[0]
    : touch.on ? LADDER[4] : LADDER[LADDER.length - 1];
  Object.assign(gfx, rung, { ratio: Math.min(window.devicePixelRatio || 1, rung.ratio) });
}
function autoShift(level, settle) {
  auto.level = level;
  auto.settle = settle;              // the frames after a change compile shaders and do not count
  auto.time = 0;
  auto.frames = 0;
  auto.calm = 0;
  applySettings();
}
// called once a frame with the true time since the last one (seconds)
function governor(seconds) {
  if (save.quality !== 2 || state !== 'play') {
    auto.time = 0;
    auto.frames = 0;
    auto.settle = Math.max(auto.settle, 2);
    return;
  }
  if (auto.settle > 0) {
    auto.settle -= seconds;
    return;
  }
  auto.time += seconds;
  auto.frames++;
  if (auto.time < 2) return;
  const fps = auto.frames / auto.time;
  auto.hold = Math.max(0, auto.hold - auto.time);
  auto.forget -= auto.time;
  auto.time = 0;
  auto.frames = 0;
  if (auto.forget <= 0) {
    auto.useless = {};                // what did not help two minutes ago may help in another street
    auto.forget = 120;
  }
  const trial = auto.trial;
  auto.trial = null;
  if (trial && trial.down && fps < trial.fps * 1.12) {
    // drawing less bought no frame rate (the phone is busy elsewhere): give the picture back
    auto.useless[auto.level] = true;
    autoShift(trial.from, 2);
    return;
  }
  if (trial && !trial.down && fps < 45) {
    autoShift(trial.from, 2);         // the step up was too much: back down, and wait a minute before trying again
    auto.hold = 60;
    return;
  }
  if (fps < 40) {
    auto.calm = 0;
    let next = auto.level + 1;
    while (next <= lowestRung() && auto.useless[next]) next++;
    if (next <= lowestRung()) {
      auto.trial = { down: true, from: auto.level, fps };
      autoShift(next, 2);
    }
  } else if (fps > 55) {
    if (++auto.calm >= 3 && auto.level > 0 && auto.hold <= 0) {
      auto.trial = { down: false, from: auto.level, fps };
      autoShift(auto.level - 1, 2);
    }
  } else {
    auto.calm = 0;
  }
}

// ---------- glow pass (Pretty graphics): bright things bleed light, a soft vignette frames the view ----------
const post = { on: false, scene: new T.Scene(), cam: new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), full: null, a: null, b: null };
const POST_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const postMat = (uniforms, fragmentShader) => new T.ShaderMaterial({ uniforms, vertexShader: POST_VS, fragmentShader, depthTest: false, depthWrite: false });
const brightMat = postMat({ map: { value: null }, cut: { value: 0.8 } }, `
  uniform sampler2D map;
  uniform float cut;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(map, vUv);
    float peak = max(c.r, max(c.g, c.b));
    gl_FragColor = vec4(c.rgb * smoothstep(cut, cut + 0.3, peak) * c.a, 1.0);
  }`);
const blurMat = postMat({ map: { value: null }, dir: { value: new T.Vector2() } }, `
  uniform sampler2D map;
  uniform vec2 dir;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(map, vUv).rgb * 0.227;
    c += (texture2D(map, vUv + dir * 1.385).rgb + texture2D(map, vUv - dir * 1.385).rgb) * 0.316;
    c += (texture2D(map, vUv + dir * 3.231).rgb + texture2D(map, vUv - dir * 3.231).rgb) * 0.070;
    gl_FragColor = vec4(c, 1.0);
  }`);
// the last pass also smooths edges (FXAA) on top of the 4x multisampling of the scene target
const mixMat = postMat({ map: { value: null }, glow: { value: null }, strength: { value: 0.5 }, px: { value: new T.Vector2() } }, `
  uniform sampler2D map;
  uniform sampler2D glow;
  uniform float strength;
  uniform vec2 px;
  varying vec2 vUv;
  const vec3 LUMA = vec3(0.299, 0.587, 0.114);
  vec3 smoothEdges(vec2 uv) {
    vec3 m = texture2D(map, uv).rgb;
    float nw = dot(texture2D(map, uv + vec2(-1.0, -1.0) * px).rgb, LUMA);
    float ne = dot(texture2D(map, uv + vec2(1.0, -1.0) * px).rgb, LUMA);
    float sw = dot(texture2D(map, uv + vec2(-1.0, 1.0) * px).rgb, LUMA);
    float se = dot(texture2D(map, uv + vec2(1.0, 1.0) * px).rgb, LUMA);
    float lm = dot(m, LUMA);
    float lo = min(lm, min(min(nw, ne), min(sw, se)));
    float hi = max(lm, max(max(nw, ne), max(sw, se)));
    if (hi - lo < max(0.04, hi * 0.11)) return m;
    vec2 dir = vec2(-((nw + ne) - (sw + se)), (nw + sw) - (ne + se));
    float reduce = max((nw + ne + sw + se) * 0.03125, 0.0078125);
    dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + reduce), -8.0, 8.0) * px;
    vec3 a = 0.5 * (texture2D(map, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(map, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
    vec3 b = a * 0.5 + 0.25 * (texture2D(map, uv - dir * 0.5).rgb + texture2D(map, uv + dir * 0.5).rgb);
    float lb = dot(b, LUMA);
    return (lb < lo || lb > hi) ? a : b;
  }
  void main() {
    vec3 c = smoothEdges(vUv) + texture2D(glow, vUv).rgb * strength;
    vec2 q = vUv - 0.5;
    gl_FragColor = vec4(c * (1.0 - dot(q, q) * 0.5), 1.0);
  }`);
const postQuad = new T.Mesh(new T.PlaneGeometry(2, 2), mixMat);
postQuad.frustumCulled = false;
post.scene.add(postQuad);

function postPass(material, source, target) {
  material.uniforms.map.value = source.texture;
  postQuad.material = material;
  renderer.setRenderTarget(target);
  renderer.render(post.scene, post.cam);
}

function renderFrame() {
  if (!post.on || !post.full) {
    renderer.render(scene, camera);
    return;
  }
  renderer.setRenderTarget(post.full);
  renderer.render(scene, camera);
  brightMat.uniforms.cut.value = lerp(0.93, 0.5, glowAmount);
  postPass(brightMat, post.full, post.a);
  for (const spread of [1, 2.2]) {
    blurMat.uniforms.dir.value.set(spread / post.a.width, 0);
    postPass(blurMat, post.a, post.b);
    blurMat.uniforms.dir.value.set(0, spread / post.a.height);
    postPass(blurMat, post.b, post.a);
  }
  mixMat.uniforms.glow.value = post.a.texture;
  mixMat.uniforms.px.value.set(1 / post.full.width, 1 / post.full.height);
  mixMat.uniforms.strength.value = lerp(0.3, 0.95, glowAmount);
  postPass(mixMat, post.full, null);
}

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  // upright phone: keep about 50 degrees of road across the screen, up to an 88 degree lens
  const lens = clamp(T.MathUtils.radToDeg(2 * Math.atan(Math.tan(T.MathUtils.degToRad(25)) / camera.aspect)), 62, 88);
  if (lens !== view.fov) {
    view.fov = lens;
    camera.fov = lens;
  }
  camera.updateProjectionMatrix();
  post.on = gfx.glow;
  sky.material.uniforms.solid.value = post.on ? 0 : 1;
  if (!post.on) return;
  const size = renderer.getDrawingBufferSize(new T.Vector2());
  const w = Math.max(4, Math.ceil(size.x / 4));
  const h = Math.max(4, Math.ceil(size.y / 4));
  if (!post.full) {
    post.full = new T.WebGLRenderTarget(size.x, size.y, { samples: 4 });
    post.a = new T.WebGLRenderTarget(w, h, { depthBuffer: false });
    post.b = new T.WebGLRenderTarget(w, h, { depthBuffer: false });
  } else {
    post.full.setSize(size.x, size.y);
    post.a.setSize(w, h);
    post.b.setSize(w, h);
  }
}

function applySettings() {
  setGfx();
  renderer.setPixelRatio(gfx.ratio);
  renderer.shadowMap.enabled = gfx.shadows;
  sun.castShadow = gfx.shadows;
  resize();
  applySound();
}

function renderSettings() {
  for (const box of document.querySelectorAll('.settings')) {
    box.innerHTML = '';
    for (const [label, key, options, only] of SETTINGS) {
      if (only === 'touch' && !touch.on) continue;
      const row = document.createElement('div');
      row.className = 'row';
      const name = document.createElement('span');
      name.textContent = label;
      row.appendChild(name);
      options.forEach((text, k) => {
        const button = document.createElement('button');
        button.textContent = text;
        button.className = 'seg' + (save[key] === k ? ' on' : '');
        button.onclick = () => {
          save[key] = k;
          if (key === 'quality') Object.assign(auto, { level: 1, settle: 4, trial: null, useless: {}, calm: 0, hold: 0 });
          persist();
          applySettings();
          renderSettings();
        };
        row.appendChild(button);
      });
      box.appendChild(row);
    }
  }
  $('btn-end-shift').hidden = !(mission.active && mission.def === FERRY);
  $('btn-shift').hidden = mission.active;
  $('btn-oddjob').hidden = mission.active || save.mission < 1;
  $('btn-oddjob').textContent = !MISSIONS[save.mission] ? 'Another odd job' : mission.offer === MISSIONS[save.mission] ? 'An odd job instead' : 'Back to the story job';
  const jobs = Math.min(save.mission, MISSIONS.length) + ' / ' + MISSIONS.length;
  const have = PROPERTIES.filter(owned).length;
  $('progress').textContent = 'Time ' + clockText() + '     Jobs ' + jobs + '     Packages ' + save.packages.length + ' / ' + packageSpots.length + '     Cash $' + save.money + (save.ferryRuns ? `     Ferry shifts ${save.ferryRuns} · best ${save.ferryBest}s` : '')
    + (save.fares ? `     Cab fares ${save.fares} · best run ${save.fareBest}` : '') + (have ? `     Property ${have} / ${PROPERTIES.length}` : '')
    + (save.tricks ? `     Tricks ${save.tricks} · best chain $${save.styleBest}` + (save.driftBest ? ` · longest slide ${save.driftBest}s` : '') : '')
    + (save.getaways ? `     Getaways ${save.getaways}` : '')
    + (save.smashed || save.jumps.length ? `     Smashed ${save.smashed || 0} · stunt jumps ${save.jumps.length} / ${ramps.length}` + (save.jumpBest ? ` · longest ${save.jumpBest} m` : '') : '');
  const perkBox = $('perks');
  perkBox.innerHTML = '';
  for (const p of PERKS) {
    const [now, need] = p.count();
    const name = document.createElement('b');
    name.textContent = perkHeld(p) ? '\u2713 ' + p.name : p.name + '  \u00b7  ' + now + ' / ' + need;
    if (perkHeld(p)) name.className = 'got';
    const text = document.createElement('span');
    text.textContent = perkHeld(p) ? p.what : p.how + ': ' + p.what.toLowerCase();
    const bar = document.createElement('em');
    bar.style.setProperty('--part', Math.round(clamp(now / need, 0, 1) * 100) + '%');
    perkBox.append(name, text, bar);
  }
  const hasSave = save.mission > 0 || save.packages.length > 0 || save.tune > 0 || save.fares > 0 || have > 0 || save.money !== SAVE_DEFAULTS.money;
  $('btn-continue').style.display = hasSave ? '' : 'none';
}

function showScreen(id) {
  $('title').classList.toggle('hidden', id !== 'title');
  $('pause').classList.toggle('hidden', id !== 'pause');
  $('hud').classList.toggle('hidden', id === 'title');
  document.body.classList.toggle('paused', id === 'pause');   // a phone has no room for the HUD behind the pause screen
}

function refreshLockHint() {
  $('lockhint').classList.toggle('show', state === 'play' && !touch.on && document.pointerLockElement !== canvas);
}

function lockPointer() {
  if (touch.on) return;            // a finger drags the view instead
  try {
    const request = canvas.requestPointerLock();
    if (request && request.catch) request.catch(() => {});
  } catch (err) {
    // the game still works without mouse capture
  }
}

// a first-timer who does not move gets the keys again; anyone who sets off never sees them
const intro = { on: false, idle: 0 };
function updateIntro(dt) {
  if (!intro.on) return;
  if (player.car || dist2(player.x, player.z, START.x, START.z) > 9) {
    intro.on = false;
    if (intro.shown && player.car) $('hint').classList.remove('show');
    else if (intro.shown) hint('The red car is yours: stand beside it and press F.', 4);
    return;
  }
  intro.idle += dt;
  if (intro.idle > 3.5 && !intro.shown) {
    intro.shown = true;
    hint('W A S D to walk, mouse to look around.', 600);
  }
}

function startGame(fresh) {
  if (fresh) {
    Object.assign(save, { money: SAVE_DEFAULTS.money, mission: 0, packages: [], tune: 0, ferryRuns: 0, ferryBest: 0, fares: 0, fareBest: 0, props: {}, spotted: [], jumps: [], jumpBest: 0, smashed: 0, havocTold: 0 });
    persist();
  }
  initAudio();
  if (audio.ctx) audio.ctx.resume();
  resetSession();
  state = 'play';
  showScreen(null);
  lockPointer();
  goFullscreen();
  Object.assign(intro, { on: save.mission === 0, idle: 0, shown: false });
  if (!intro.on) hint('Welcome back. M shows the whole map.', 5);
}

function pause() {
  if (state !== 'play') return;
  state = 'paused';
  firing = false;
  for (const code in keys) keys[code] = false;
  toggleBigMap(false);
  persist();
  renderSettings();
  showScreen('pause');
  if (audio.ctx) audio.ctx.suspend();
  if (document.pointerLockElement) document.exitPointerLock();
}

function resume() {
  if (state !== 'paused') return;
  state = 'play';
  showScreen(null);
  if (audio.ctx) audio.ctx.resume();
  lockPointer();
}

$('btn-continue').onclick = () => startGame(false);
$('btn-new').onclick = () => startGame(true);
$('btn-ferry').onclick = () => {
  startGame(false);
  const vx = roadC(9) + PARK;
  const vz = roadC(5) + 24;
  const starter = vehicles.find(v => v.type === 'muscle' && dist2(v.x, v.z, vx, vz) < 1);
  if (starter) removeVehicle(starter);
  addVehicle('van', vx, vz, Math.PI, null, '#efb35d');
  player.x = vx + 2.3;
  player.z = vz;
  dispatch();
  hint('F: take the van. Follow the amber stops; brake inside each ring.', 7);
};
$('btn-end-shift').onclick = () => {
  if (mission.active && mission.def === FERRY) endMission(false, 'Shift cancelled. Your story progress is unchanged.');
  resume();
};
$('btn-resume').onclick = resume;
$('btn-shift').onclick = () => {
  resume();
  dispatch();
};
$('btn-oddjob').onclick = () => {
  resume();
  anotherJob();
};
$('btn-restart').onclick = () => {
  state = 'paused';
  resetSession();
  resume();
  hint('Back at Sol Beach. Progress and cash are kept.', 5);
};
$('btn-quit').onclick = () => {
  state = 'title';
  renderSettings();
  showScreen('title');
};

// ---------- input ----------
const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyF', 'KeyQ', 'KeyR', 'KeyH', 'KeyT', 'KeyE', 'KeyM', 'KeyJ', 'Tab']);
// what one press of a key does; the touch buttons (part 3b) call this with the same codes
function keyAction(code) {
  if (state === 'paused' && (code === 'KeyP' || code === 'Escape')) {
    resume();
    return;
  }
  if (state !== 'play') return;
  if (ride.t > 0) {
    if (code === 'KeyF' || code === 'KeyE' || code === 'Enter') endRide();
    else if (code === 'KeyP' || code === 'Escape') pause();
    return;
  }
  if (code === 'KeyF' || code === 'Enter') tryEnterExit();
  if (code === 'KeyG') dispatch();
  if (code === 'KeyT') cabDuty();
  if (code === 'KeyE') interact();
  if (code === 'KeyM') toggleBigMap();
  if (code === 'KeyJ') anotherJob();
  if (code === 'KeyH' && player.car) sfx.horn();
  if (code === 'KeyP' || code === 'Escape') pause();
  if (code === 'KeyQ') {
    player.gun = !player.gun;
    hint(player.gun ? 'Pistol drawn' : 'Fists');
  }
  if (code === 'KeyR' && player.car) {
    radio.touched = true;
    setStation((radio.station + 1) % STATIONS.length);
  }
}
window.addEventListener('keydown', (e) => {
  if (state === 'play' && GAME_KEYS.has(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  keyAction(e.code);
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});
window.addEventListener('blur', () => {
  for (const code in keys) keys[code] = false;
  firing = false;
});
document.addEventListener('mousemove', (e) => {
  if (state !== 'play' || document.pointerLockElement !== canvas) return;
  cam.yaw -= e.movementX * 0.0024;
  cam.pitch = clamp(cam.pitch - e.movementY * 0.0022, -1.2, 0.3);
  cam.lastMouse = performance.now();
});
canvas.addEventListener('mousedown', (e) => {
  if (state !== 'play' || touch.on) return;
  if (document.pointerLockElement !== canvas) {
    lockPointer();
    return;
  }
  if (e.button === 0) firing = true;
});
window.addEventListener('mouseup', () => {
  firing = false;
});
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (!locked && state === 'play') pause();
  refreshLockHint();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
window.addEventListener('resize', resize);

// ---------- go ----------
gameReady = true;
applySettings();
renderSettings();
resetSession();
showScreen('title');

// The game moves in steps of 1/60 s or less, however slowly the screen is drawn. Until 2.0 a slow frame was
// one long step of up to 0.05 s, so where a cruiser's brakes stopped it depended on the frame rate, and
// under 20 frames a second the game ran in slow motion. A long frame is now cut into equal steps, up to
// six: the game keeps real time down to 10 frames a second and only then runs slower. A screen at 60 Hz
// or more takes one step a frame, as before.
const STEP = 1 / 60;
const MAX_STEPS = 6;
const pace = { steps: 1, simMs: 0 };       // read by the checks: steps in the last frame, time they took
let lastTime = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  if (!auto.manual) governor(Math.max(0, (now - lastTime) / 1000));
  const realDt = Math.min(STEP * MAX_STEPS, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  frameNo++;
  if ((frameNo & 15) === 0) refreshLockHint();
  refreshPad();
  // timeScale (part 3c): a ramp take-off and a blast run slower for a moment
  // a quarter of a step of slack, so a 60 Hz screen that is a little late still takes one step
  const steps = clamp(Math.ceil(realDt / STEP - 0.25), 1, MAX_STEPS);
  const part = realDt / steps;
  const simStart = performance.now();
  for (let k = 1; k <= steps && state !== 'paused'; k++) {
    update(state === 'dead' ? part * 0.4 : part * timeScale(part), part, k === steps);
  }
  pace.steps = steps;
  pace.simMs += (performance.now() - simStart - pace.simMs) * 0.1;
  renderFrame();
}
requestAnimationFrame(frame);

// small handle for automated checks
window.NEON = {
  player, vehicles, peds, pickups, markers, wanted, mission, save, cam, keys, PLACES, MISSIONS, scene, camera,
  get state() {
    return state;
  },
  startGame, pause, resume, setWanted, tryEnterExit, playerAttack, crime, hurt, landmarks,
  route, cab, heli, bigMap, PROPERTIES, PERKS, perk, cabDuty, interact, toggleBigMap, addMoney, persist,
  ride, checkPerks, packageSpots, damageVehicle, audio, radio, STATIONS, setStation, anotherJob, offerMission, blocks, TAIL,
  touch, say, keyAction, setTouchMode, view, gfx, auto, governor, LADDER, applySettings, renderSettings, aimAssist,
  addVehicle, removeVehicle, snapLane,
  props, ramps, fallen, jets, PROP_KINDS, PROP_HIT, PROP_BACK, BLAST, SPIN, RAMP, NITRO, AHEAD, LOOSE_MASS, nitro, warp, kerbTaken, worksAt,
  knockProp, blast, shootProps, rampAt, rampHeight, kerbBusy, nearPlace, stuntJump, resetHavoc, spawnTraffic, roadStop, downPed,
  addPed, insideBox, lampMesh, lamps, FERRY, START, styleSmash, hint, pace, STEP, MAX_STEPS,
  style, STYLE, styleMult, DRIFT, CROWD, SPEED_FEEL, GETAWAY_PAY, HOLD_FIRE_SPEED, carSound, updateStyle, honk,
  get honks() {
    return honkCount;
  },
  get clock() {
    return gameClock;
  },
  setTime(hours) {
    tod = hours;
  },
};
