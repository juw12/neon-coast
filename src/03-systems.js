// =====================================================================
// NEON COAST - part 3: effects, audio, wanted level, police, weapons,
//                      pickups, markers, missions, HUD
// =====================================================================
const $ = (id) => document.getElementById(id);

// ---------- particles and tracers ----------
const P_MAX = 600;
const pPos = new Float32Array(P_MAX * 3).fill(-999);
const pCol = new Float32Array(P_MAX * 3);
const pVel = new Float32Array(P_MAX * 3);
const pBase = new Float32Array(P_MAX * 3);
const pLife = new Float32Array(P_MAX);
const pSpan = new Float32Array(P_MAX);
const pGrav = new Float32Array(P_MAX);
let pNext = 0;
const particleGeo = new T.BufferGeometry();
particleGeo.setAttribute('position', new T.BufferAttribute(pPos, 3));
particleGeo.setAttribute('color', new T.BufferAttribute(pCol, 3));
const particles = new T.Points(
  particleGeo,
  new T.PointsMaterial({
    size: 1.3,
    map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'),
    vertexColors: true,
    transparent: true,
    blending: T.AdditiveBlending,
    depthWrite: false,
  })
);
particles.frustumCulled = false;
scene.add(particles);

function puff(x, y, z, vx, vy, vz, life, r, g, b, gravity) {
  const k = pNext;
  pNext = (pNext + 1) % P_MAX;
  pPos.set([x, y, z], k * 3);
  pVel.set([vx, vy, vz], k * 3);
  pBase.set([r, g, b], k * 3);
  pLife[k] = pSpan[k] = life;
  pGrav[k] = gravity || 0;
}

function updateParticles(dt) {
  for (let k = 0; k < P_MAX; k++) {
    if (pLife[k] <= 0) continue;
    pLife[k] -= dt;
    const o = k * 3;
    if (pLife[k] <= 0) {
      pPos[o + 1] = -999;
      continue;
    }
    pVel[o + 1] -= pGrav[k] * dt;
    pPos[o] += pVel[o] * dt;
    pPos[o + 1] += pVel[o + 1] * dt;
    pPos[o + 2] += pVel[o + 2] * dt;
    const fade = pLife[k] / pSpan[k];
    pCol[o] = pBase[o] * fade;
    pCol[o + 1] = pBase[o + 1] * fade;
    pCol[o + 2] = pBase[o + 2] * fade;
  }
  particleGeo.attributes.position.needsUpdate = true;
  particleGeo.attributes.color.needsUpdate = true;
}

const tracers = [];
for (let k = 0; k < 10; k++) {
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(new Float32Array(6), 3));
  const line = new T.Line(geo, new T.LineBasicMaterial({ color: 0xfff0a0 }));
  line.frustumCulled = false;
  line.visible = false;
  line.userData.t = 0;
  scene.add(line);
  tracers.push(line);
}
let tracerNext = 0;
function tracer(x0, y0, z0, x1, y1, z1) {
  const line = tracers[tracerNext];
  tracerNext = (tracerNext + 1) % tracers.length;
  line.geometry.attributes.position.array.set([x0, y0, z0, x1, y1, z1]);
  line.geometry.attributes.position.needsUpdate = true;
  line.visible = true;
  line.userData.t = 0.07;
}

// ---------- audio (all synthesised, no files) ----------
const audio = { ctx: null };
const radio = { station: 0, step: 0, next: 0, touched: false };
const STATIONS = [
  { name: 'Radio Off' },
  { name: 'Neon FM 88.1', bpm: 104, root: 45, prog: [0, -4, 3, -2], arp: [0, 7, 12, 7, 3, 7, 12, 15] },
  { name: 'Coast 98', bpm: 122, root: 43, prog: [0, 5, -3, 2], arp: [0, null, 7, 12, null, 7, 4, null] },
  { name: 'Low Tide', bpm: 84, root: 41, prog: [0, 3, -2, -5], arp: [12, null, 7, null, 3, null, 7, null] },
];

function initAudio() {
  if (audio.ctx) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  const ctx = (audio.ctx = new Ctx());
  audio.master = ctx.createGain();
  audio.master.connect(ctx.destination);
  audio.fx = ctx.createGain();
  audio.fx.gain.value = 0.7;
  audio.fx.connect(audio.master);
  audio.music = ctx.createGain();
  audio.music.gain.value = 0;
  audio.music.connect(audio.master);

  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let k = 0; k < data.length; k++) data[k] = Math.random() * 2 - 1;
  audio.noise = buffer;

  const loop = (type, cutoff) => {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = type;
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    gain.gain.value = 0;
    osc.connect(filter).connect(gain).connect(audio.fx);
    osc.start();
    return { osc, gain };
  };
  audio.engine = loop('sawtooth', 420);
  audio.siren = loop('square', 1500);
  applySound();
}

function applySound() {
  if (audio.ctx) audio.master.gain.value = save.sound ? 0.7 : 0;
}

function tone(freq, dur, vol, type, slideTo) {
  const ctx = audio.ctx;
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, now);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + dur);
  gain.gain.setValueAtTime(vol, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
  osc.connect(gain).connect(audio.fx);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

function noiseBurst(dur, vol, freq, when, bus, type) {
  const ctx = audio.ctx;
  if (!ctx || vol <= 0) return;
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  const start = when || ctx.currentTime;
  src.buffer = audio.noise;
  filter.type = type || 'lowpass';
  filter.frequency.value = freq;
  gain.gain.setValueAtTime(vol, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
  src.connect(filter).connect(gain).connect(bus || audio.fx);
  src.start(start, Math.random() * 0.5);
  src.stop(start + dur + 0.02);
}

const sfx = {
  shot: (vol) => {
    noiseBurst(0.16, 0.5 * vol, 2200);
    tone(190, 0.12, 0.25 * vol, 'square', 60);
  },
  crash: (vol) => noiseBurst(0.3, vol, 520),
  boom: (vol) => {
    noiseBurst(1.3, 0.9 * vol, 240);
    tone(90, 0.9, 0.6 * vol, 'sine', 30);
  },
  cash: () => {
    tone(880, 0.08, 0.16, 'square');
    setTimeout(() => tone(1320, 0.14, 0.16, 'square'), 70);
  },
  star: () => tone(620, 0.3, 0.16, 'sawtooth', 980),
  door: () => noiseBurst(0.09, 0.35, 320),
  horn: () => tone(330, 0.45, 0.2, 'square'),
  hurt: () => tone(160, 0.2, 0.3, 'sawtooth', 80),
  click: () => tone(1200, 0.03, 0.1, 'square'),
  pass: () => [523, 659, 784, 1047].forEach((f, k) => setTimeout(() => tone(f, 0.25, 0.2, 'triangle'), k * 130)),
  fail: () => [392, 330, 262].forEach((f, k) => setTimeout(() => tone(f, 0.35, 0.2, 'sawtooth'), k * 180)),
};

const midiHz = (n) => 440 * Math.pow(2, (n - 69) / 12);

function musicNote(when, freq, dur, vol, type, cutoff) {
  const ctx = audio.ctx;
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.linearRampToValueAtTime(vol, when + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(filter).connect(gain).connect(audio.music);
  osc.start(when);
  osc.stop(when + dur + 0.05);
}

function musicKick(when) {
  const ctx = audio.ctx;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.setValueAtTime(140, when);
  osc.frequency.exponentialRampToValueAtTime(45, when + 0.16);
  gain.gain.setValueAtTime(0.5, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.2);
  osc.connect(gain).connect(audio.music);
  osc.start(when);
  osc.stop(when + 0.22);
}

function setStation(k) {
  radio.station = k;
  radio.step = 0;
  radio.next = 0;
  toast('radio', STATIONS[k].name);
}

function updateAudio() {
  const ctx = audio.ctx;
  if (!ctx) return;
  const now = ctx.currentTime;
  const car = state === 'play' ? player.car : null;
  audio.engine.osc.frequency.setTargetAtTime(car ? 48 + Math.abs(car.vf) * 3.4 : 48, now, 0.08);
  audio.engine.gain.gain.setTargetAtTime(car ? 0.05 + Math.min(0.06, Math.abs(car.vf) * 0.002) : 0, now, 0.1);

  let sirenVol = 0;
  if (wanted.stars > 0 && state === 'play') {
    const [px, pz] = focus();
    for (const v of vehicles) {
      if (v.siren) sirenVol = Math.max(sirenVol, clamp(1 - Math.hypot(v.x - px, v.z - pz) / 170, 0, 1));
    }
  }
  audio.siren.osc.frequency.value = 700 + 260 * Math.sin(now * 5.5);
  audio.siren.gain.gain.setTargetAtTime(sirenVol * 0.07, now, 0.15);

  const station = STATIONS[radio.station];
  const playing = car && station.bpm;
  audio.music.gain.setTargetAtTime(playing ? 0.5 : 0, now, 0.2);
  if (!playing) return;
  const stepDur = 60 / station.bpm / 4;
  if (radio.next < now) radio.next = now + 0.05;
  while (radio.next < now + 0.2) {
    const step = radio.step++;
    const beat = step & 15;
    const root = station.root + station.prog[(step >> 4) % station.prog.length];
    if (beat % 4 === 0) musicKick(radio.next);
    if (beat === 4 || beat === 12) noiseBurst(0.13, 0.22, 1900, radio.next, audio.music, 'bandpass');
    if (beat % 2 === 0) noiseBurst(0.04, 0.07, 7000, radio.next, audio.music, 'highpass');
    if (beat % 2 === 0) musicNote(radio.next, midiHz(root - 12 + (beat % 8 === 6 ? 12 : 0)), stepDur * 1.8, 0.24, 'sawtooth', 520);
    const arp = station.arp[beat % station.arp.length];
    if (arp !== null) musicNote(radio.next, midiHz(root + 12 + arp), stepDur * 1.6, 0.06, 'square', 2300);
    if (beat === 0) {
      for (const interval of [0, 3, 7]) musicNote(radio.next, midiHz(root + interval), stepDur * 15, 0.035, 'triangle', 1400);
    }
    radio.next += stepDur;
  }
}

// ---------- HUD helpers ----------
const hudCache = {};
function setText(id, value) {
  if (hudCache[id] === value) return;
  hudCache[id] = value;
  $(id).textContent = value;
}

const toastTimers = {};
function toast(id, text, secs) {
  const el = $(id);
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimers[id]);
  toastTimers[id] = setTimeout(() => el.classList.remove('show'), (secs || 3) * 1000);
}
const hint = (text, secs) => toast('hint', text, secs || 3.5);

function banner(kind, title, sub, secs) {
  const el = $('banner');
  el.className = 'show ' + kind;
  el.querySelector('b').textContent = title;
  el.querySelector('span').textContent = sub || '';
  clearTimeout(toastTimers.banner);
  toastTimers.banner = setTimeout(() => (el.className = ''), (secs || 4) * 1000);
}

function addMoney(amount) {
  save.money = Math.max(0, Math.round(save.money + amount));
  persist();
}

// ---------- wanted level ----------
const wanted = { pts: 0, stars: 0, evade: 0, bust: 0, spawnT: 0 };
const STAR_PTS = [0, 1, 3, 6, 10, 15];
const COPS_PER_STAR = [0, 1, 2, 3, 4, 6];

function refreshStars() {
  let s = 0;
  for (let k = 1; k <= 5; k++) {
    if (wanted.pts >= STAR_PTS[k]) s = k;
  }
  if (s > wanted.stars) sfx.star();
  wanted.stars = s;
}

function crime(points) {
  if (state !== 'play' || points <= 0) return;
  wanted.pts = Math.min(20, wanted.pts + points);
  wanted.evade = 0;
  refreshStars();
}

function setWanted(n) {
  wanted.pts = STAR_PTS[n];
  wanted.evade = 0;
  wanted.bust = 0;
  refreshStars();
}

function spawnCop() {
  const [px, pz] = focus();
  for (let tries = 0; tries < 14; tries++) {
    const x = roadC(clamp(nodeOf(px) + irand(-2, 2), 0, N));
    const z = roadC(clamp(nodeOf(pz) + irand(-2, 2), 0, N));
    const d = Math.hypot(x - px, z - pz);
    if (d < 85 || d > 215 || vehicleNear(x, z, 10)) continue;
    const v = addVehicle('police', x, z, Math.atan2(px - x, pz - z), 'cop');
    snapLane(v);
    return v;
  }
  return null;
}

function hurt(amount, cause) {
  if (state !== 'play' || amount <= 0) return;
  player.hp -= amount * diff().dmg;
  sfx.hurt();
  $('flash').classList.add('show');
  setTimeout(() => $('flash').classList.remove('show'), 160);
  if (player.hp <= 0) die(cause || 'wasted');
}

function updateWanted(dt) {
  const [px, pz] = focus();
  if (wanted.stars === 0) {
    wanted.pts = Math.max(0, wanted.pts - dt * 0.03);
    wanted.bust = 0;
    for (const v of vehicles) v.siren = false;
    return;
  }
  let active = 0;
  let seen = false;
  let arresting = false;
  for (const v of vehicles) {
    if (v.driver !== 'cop' || v.dead) continue;
    v.siren = true;
    const d = Math.hypot(v.x - px, v.z - pz);
    if (d < 230) active++;
    if (d < 60 && (d < 22 || v.ai.direct)) seen = true;
    if (d < 7.5 && Math.abs(v.vf) < 6) arresting = true;

    // two stars and up: officers open fire
    if (wanted.stars >= 2 && d < 36 && v.ai.direct) {
      v.ai.fire -= dt;
      if (v.ai.fire <= 0) {
        v.ai.fire = rand(0.5, 1.1);
        const hit = Math.random() < diff().aim * (d < 15 ? 1.4 : 1);
        const ex = px + (hit ? 0 : rand(-2.5, 2.5));
        const ez = pz + (hit ? 0 : rand(-2.5, 2.5));
        tracer(v.x, 1.4, v.z, ex, 1.1, ez);
        sfx.shot(clamp(1 - d / 50, 0.15, 0.6));
        if (hit && player.car) damageVehicle(player.car, 6);
        else if (hit) hurt(7, 'wasted');
      }
    }
  }

  wanted.spawnT -= dt;
  if (active < COPS_PER_STAR[wanted.stars] + diff().cops && wanted.spawnT <= 0) {
    spawnCop();
    wanted.spawnT = 2.5;
  }

  wanted.evade = seen ? 0 : wanted.evade + dt;
  if (wanted.evade > (7 + wanted.stars * 3) * diff().evade) {
    setWanted(0);
    hint('You lost them.');
    return;
  }

  const mySpeed = player.car ? Math.hypot(player.car.vx, player.car.vz) : player.speed;
  if (arresting && mySpeed < 2.2) wanted.bust += dt;
  else wanted.bust = Math.max(0, wanted.bust - dt * 2);
  if (wanted.bust > 0.6) hint('Move! You are being arrested.', 1);
  if (wanted.bust > 2.4) die('busted');
}

// ---------- weapons ----------
function castRay(ox, oy, oz, dx, dy, dz, tMin, tMax, skipVehicle) {
  const hit = { t: tMax, ped: null, veh: null };
  if (dy < -1e-6) hit.t = Math.min(hit.t, -oy / dy);
  let lastKey = '';
  for (let s = 0; s < tMax; s += 12) {
    const i = cellOf(ox + dx * s);
    const j = cellOf(oz + dz * s);
    const key = i + ',' + j;
    if (key === lastKey) continue;
    lastKey = key;
    const block = blockAt(i, j);
    if (!block) continue;
    for (const q of block.boxes) {
      const t = rayBox(ox, oy, oz, dx, dy, dz, q);
      if (t >= 0 && t < hit.t) hit.t = t;
    }
  }
  const sphere = (cx, cy, cz, r) => {
    const lx = cx - ox;
    const ly = cy - oy;
    const lz = cz - oz;
    const proj = lx * dx + ly * dy + lz * dz;
    if (proj < tMin) return -1;
    const off2 = lx * lx + ly * ly + lz * lz - proj * proj;
    return off2 > r * r ? -1 : proj - Math.sqrt(r * r - off2);
  };
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    const t = sphere(ped.x, 1.0, ped.z, 0.8);
    if (t >= 0 && t < hit.t) {
      hit.t = t;
      hit.ped = ped;
      hit.veh = null;
    }
  }
  for (const v of vehicles) {
    if (v === skipVehicle) continue;
    for (const end of [1, -1]) {
      const off = v.t.len * 0.3 * end;
      const t = sphere(v.x + Math.sin(v.h) * off, 0.8, v.z + Math.cos(v.h) * off, 1.25);
      if (t >= 0 && t < hit.t) {
        hit.t = t;
        hit.veh = v;
        hit.ped = null;
      }
    }
  }
  return hit;
}

function playerAttack() {
  if (player.fireT > 0 || player.punchT > 0) return;
  const [px, pz] = focus();
  if (!player.gun || player.ammo <= 0) {
    if (player.car) return;
    player.punchT = 0.4;
    player.h = cam.yaw;
    for (const ped of peds) {
      const dx = ped.x - player.x;
      const dz = ped.z - player.z;
      if (ped.state === 'down' || dx * dx + dz * dz > 4.4) continue;
      if (dx * Math.sin(player.h) + dz * Math.cos(player.h) < 0.3) continue;
      downPed(ped, Math.sin(player.h) * 4, Math.cos(player.h) * 4, true);
      sfx.crash(0.2);
    }
    if (player.gun) sfx.click();
    return;
  }
  player.ammo--;
  player.fireT = 0.2;
  const cp = Math.cos(cam.pitch);
  const dx = Math.sin(cam.yaw) * cp;
  const dy = Math.sin(cam.pitch);
  const dz = Math.cos(cam.yaw) * cp;
  const o = camera.position;
  const hit = castRay(o.x, o.y, o.z, dx, dy, dz, cam.dist * 0.9, 150, player.car);
  const my = player.car ? 1.3 : 1.4 + player.y;
  tracer(px + dx * 0.6, my, pz + dz * 0.6, o.x + dx * hit.t, o.y + dy * hit.t, o.z + dz * hit.t);
  puff(px + dx * 0.8, my, pz + dz * 0.8, 0, 0, 0, 0.06, 1, 0.9, 0.5, 0);
  for (let k = 0; k < 4; k++) {
    puff(o.x + dx * hit.t, o.y + dy * hit.t, o.z + dz * hit.t, rand(-3, 3), rand(0, 4), rand(-3, 3), 0.25, 1, 0.8, 0.4, 9);
  }
  sfx.shot(1);
  scare(px, pz, 45, 10);
  crime(0.35);
  if (hit.ped) {
    hit.ped.hp -= 60;
    if (hit.ped.hp <= 0) downPed(hit.ped, dx * 3, dz * 3, true);
  }
  if (hit.veh) {
    damageVehicle(hit.veh, 14);
    if (hit.veh.type === 'police') crime(1.2);
    else if (hit.veh.driver === 'ai') hit.veh.ai.cruise = 22;   // panicked driver floors it
  }
}

// ---------- pickups ----------
const pickupGeo = new T.OctahedronGeometry(0.55, 0);
function addPickup(kind, x, z, value, id) {
  let mesh;
  if (kind === 'cash') {
    mesh = new T.Mesh(boxGeo, glowMat('#58e07a'));
    mesh.scale.set(0.5, 0.12, 0.28);
  } else if (kind === 'health') {
    mesh = new T.Group();
    for (const size of [[0.7, 0.22, 0.22], [0.22, 0.7, 0.22]]) {
      const bar = new T.Mesh(boxGeo, glowMat('#ff4d5e'));
      bar.scale.set(...size);
      mesh.add(bar);
    }
  } else {
    mesh = new T.Mesh(pickupGeo, glowMat('#3fe0ff'));
  }
  mesh.position.set(x, kind === 'cash' ? 0.5 : 1, z);
  scene.add(mesh);
  const pickup = { kind, x, z, value, id, mesh, age: 0 };
  pickups.push(pickup);
  return pickup;
}

function updatePickups(dt) {
  const [px, pz] = focus();
  const reach = player.car ? 2.6 : 1.5;
  for (let k = pickups.length - 1; k >= 0; k--) {
    const p = pickups[k];
    p.age += dt;
    p.mesh.rotation.y += dt * 2.2;
    p.mesh.position.y = (p.kind === 'cash' ? 0.5 : 1) + Math.sin(p.age * 3) * 0.12;
    let take = dist2(p.x, p.z, px, pz) < reach * reach;
    if (take && p.kind === 'health' && player.hp >= 100) take = false;
    if (take) {
      if (p.kind === 'cash') {
        addMoney(p.value);
      } else if (p.kind === 'health') {
        player.hp = 100;
        hint('Health restored');
      } else {
        save.packages.push(p.id);
        addMoney(100);
        const found = save.packages.length;
        banner('pass', 'HIDDEN PACKAGE', found + ' of ' + packageSpots.length + '   +$100', 3);
        if (found === packageSpots.length) {
          addMoney(5000);
          hint('All packages found: $5000 bonus!', 6);
        }
      }
      sfx.cash();
    }
    if (take || (p.kind === 'cash' && p.age > 40)) {
      scene.remove(p.mesh);
      pickups.splice(k, 1);
    }
  }
}

// ---------- places and markers ----------
const node = (i, j) => [roadC(i), roadC(j)];
const corner = (i, j) => [roadC(i) + ROAD / 2 + 2.6, roadC(j) + ROAD / 2 + 2.6];
const kerb = (i, j) => [(roadC(i) + roadC(i + 1)) / 2, roadC(j) + ROAD / 2 + 2.6];
const PLACES = {
  home: corner(9, 5),
  garage: [(roadC(2) + roadC(3)) / 2, roadC(8)],
  ammo: kerb(6, 6),
  hospital: kerb(7, 2),
  police: kerb(2, 4),
  bank: kerb(4, 4),
};
freeSpots.push([HALF + 30, -210], [-HALF - 28, 150], [120, HALF + 30], [-260, -HALF - 26]);
const packageSpots = freeSpots
  .map((spot) => [R(), spot])
  .sort((a, b) => a[0] - b[0])
  .slice(0, 15)
  .map((entry) => entry[1]);

const ringGeo = new T.CylinderGeometry(1, 1, 1.6, 28, 1, true);
const beamGeo = new T.CylinderGeometry(0.22, 0.22, 70, 8, 1, true);
function addMarker(kind, x, z, r, hex, text) {
  const group = new T.Group();
  const material = new T.MeshBasicMaterial({
    color: hex,
    transparent: true,
    opacity: 0.38,
    blending: T.AdditiveBlending,
    side: T.DoubleSide,
    depthWrite: false,
  });
  const ring = new T.Mesh(ringGeo, material);
  ring.scale.set(r, 1, r);
  ring.position.y = 0.8;
  const beam = new T.Mesh(beamGeo, material);
  beam.position.y = 35;
  group.add(ring, beam);
  if (text) {
    const label = labelSprite(text, hex);
    label.position.y = 5.4;
    group.add(label);
  }
  group.position.set(x, 0, z);
  scene.add(group);
  const marker = { kind, x, z, r, hex, group, inside: false };
  markers.push(marker);
  return marker;
}

function removeMarker(marker) {
  if (!marker) return;
  scene.remove(marker.group);
  const k = markers.indexOf(marker);
  if (k >= 0) markers.splice(k, 1);
}

addMarker('garage', PLACES.garage[0], PLACES.garage[1], 4.5, '#57ff9a', 'RESPRAY $150');
addMarker('ammo', PLACES.ammo[0], PLACES.ammo[1], 2.2, '#ff8a3f', 'AMMO $80');
addMarker('info', PLACES.hospital[0], PLACES.hospital[1], 1.6, '#ff4d5e', 'HOSPITAL');
addMarker('info', PLACES.police[0], PLACES.police[1], 1.6, '#4f8dff', 'POLICE');

function updateMarkers() {
  const [px, pz] = focus();
  for (const m of markers) {
    const inside = dist2(m.x, m.z, px, pz) < m.r * m.r;
    const entered = inside && !m.inside;
    m.inside = inside;
    if (!entered) continue;
    if (m.kind === 'garage' && player.car && !(mission.active && currentStep().at === PLACES.garage)) {
      const car = player.car;
      if (wanted.stars === 0 && car.hp >= car.t.hp) {
        hint('Mo: "Come back when the car is hot or broken."');
      } else if (save.money < 150) {
        hint('Respray costs $150');
      } else {
        addMoney(-150);
        setWanted(0);
        car.hp = car.t.hp;
        const paint = mat(pick(VEHICLE_TYPES.sports.colors.concat(VEHICLE_TYPES.muscle.colors)));
        for (const part of car.mesh.userData.painted) part.material = paint;
        sfx.cash();
        banner('pass', 'RESPRAYED', 'Repaired and clean.  -$150', 3);
      }
    }
    if (m.kind === 'ammo' && !player.car) {
      if (save.money < 80) {
        hint('Ammo costs $80');
      } else {
        addMoney(-80);
        player.ammo += 24;
        player.gun = true;
        sfx.cash();
        hint('+24 rounds');
      }
    }
  }
}

// ---------- missions ----------
const lap = (points, first, extra) =>
  points.map((p, k) => ({ t: 'goto', at: node(p[0], p[1]), car: true, time: k === 0 ? first : 0, addTime: k === 0 ? 0 : extra, text: 'Hit every checkpoint' }));
const MISSIONS = [
  {
    name: 'First Wheels', by: 'Mo', at: corner(9, 4), reward: 250,
    steps: [
      { t: 'car', text: 'Get into any vehicle  [F]' },
      { t: 'goto', at: PLACES.garage, car: true, text: "Drive to Mo's Respray in Rustport" },
    ],
  },
  {
    name: 'Hot Delivery', by: 'Lena', at: corner(7, 6), reward: 600,
    steps: [
      { t: 'goto', at: corner(4, 2), text: 'Pick up the package in Meridian' },
      { t: 'goto', at: corner(1, 7), time: 80, text: 'Deliver it to Rustport before time runs out' },
    ],
  },
  {
    name: 'Midnight Sprint', by: 'Rico', at: corner(5, 6), reward: 900,
    steps: [{ t: 'car', text: 'Get in something fast' }].concat(
      lap([[5, 7], [8, 7], [8, 3], [4, 3], [4, 0], [1, 0], [1, 5]], 26, 15)
    ),
  },
  {
    name: 'Borrowed Time', by: 'Mo', at: corner(3, 6), reward: 1400, spawn: { type: 'sports', i: 9, j: 2 },
    steps: [
      { t: 'car', target: true, wantedAfter: 2, text: 'Steal the Vanta GT parked in Sol Beach' },
      { t: 'goto', at: PLACES.garage, car: true, target: true, text: "Bring it to Mo's Respray in one piece" },
    ],
  },
  {
    name: 'Heat Wave', by: 'Lena', at: corner(2, 2), reward: 2200,
    steps: [
      { t: 'goto', at: PLACES.bank, text: 'Grab the bag outside Meridian Bank' },
      { t: 'lose', stars: 3, text: 'Lose the three-star heat' },
    ],
  },
  {
    name: 'Coastline Run', by: 'Rico', at: corner(9, 8), reward: 3500,
    steps: [{ t: 'car', text: 'Get in something fast' }].concat(
      lap([[10, 10], [5, 10], [0, 10], [0, 5], [0, 0], [5, 0], [10, 0], [10, 5]], 24, 21)
    ),
  },
];

const mission = { active: false, def: null, step: 0, timer: -1, car: null, startMarker: null, goalMarker: null, blip: null };
const currentStep = () => mission.def.steps[mission.step];

// Harbor shift: a side contract, never a slot in the six-job story.
const FERRY = {
  name: 'Last Ferry', by: 'Harbor Dispatch', reward: 450,
  steps: [
    { t: 'car', text: 'Film night at Pier 03 • Take a vehicle [F]' },
    { t: 'goto', car: true, time: 90, at: [roadC(9) + PARK, roadC(5) - 27], label: 'REEL LAB', text: '1/3 · Reel Lab · Collect the film cans' },
    { t: 'goto', car: true, at: [roadC(9) + CELL * .52, roadC(4) + PARK], label: 'LAMP SHOP', text: '2/3 · Electric Works · Collect the lamp' },
    { t: 'goto', car: true, at: [HALF + SHORE - 16, roadC(4)], label: 'PIER 03', text: '3/3 · Pier 03 · Deliver the cinema kit' },
  ],
};
// One instanced draw for the pier and moored ferry, on the water beyond the driveable edge.
const ferryPieces = [];
const pierZ = roadC(4);
const tideX = HALF + SHORE;
function hullPart(x, y, z, w, h, d, color) {
  ferryPieces.push({ x, y, z, w, h, d, color: new T.Color(color) });
}
hullPart(tideX + 2, .28, pierZ, 30, .65, 9, '#c0a683');
for (const side of [-1, 1]) {
  for (const offset of [-9, -2, 5, 12]) hullPart(tideX + offset, 1.1, pierZ + side * 4.3, .4, 2.1, .4, '#438f9a');
}
hullPart(tideX + 24, .5, pierZ, 14, 3, 44, '#255362');
hullPart(tideX + 24, 2.4, pierZ, 14.3, 1.1, 42, '#f0d6a7');
hullPart(tideX + 24, 4.6, pierZ + 2, 11, 3.5, 30, '#f3dcc0');
hullPart(tideX + 24, 7, pierZ - 4, 8.5, 2, 12, '#407587');
hullPart(tideX + 24, 9, pierZ + 7, 2.8, 5.4, 3.6, '#b95846');
for (let dz = -10; dz <= 12; dz += 3.5) {
  for (const side of [-1, 1]) hullPart(tideX + 24 + side * 5.54, 5.1, pierZ + dz, .12, 1.25, 2.1, '#497988');
}
instanced(new T.BoxGeometry(1, 1, 1), mat('#ffffff'), ferryPieces, (object, p) => {
  object.position.set(p.x, p.y, p.z);
  object.scale.set(p.w, p.h, p.d);
});
const pierSign = labelSprite('PIER 03', '#ffcb6a');
pierSign.position.set(tideX - 6, 5, pierZ + 5);
scene.add(pierSign);
function dispatch() {
  if (mission.active) {
    hint(mission.def === FERRY ? 'Shift in progress. Pause to end it early.' : 'Finish your current job first.');
    return;
  }
  mission.def = FERRY;
  mission.handoff = 0;
  mission.shiftTime = 0;
  startMission();
}

function oddJob() {
  const from = corner(irand(0, 9), irand(0, 9));
  let to = from;
  while (Math.abs(to[0] - from[0]) + Math.abs(to[1] - from[1]) < 250) to = corner(irand(0, 9), irand(0, 9));
  const metres = Math.abs(to[0] - from[0]) + Math.abs(to[1] - from[1]);
  return {
    name: 'Odd Job', by: 'Lena', at: corner(irand(1, 8), irand(1, 8)), reward: Math.round(metres * 0.9 / 50) * 50 + 200,
    steps: [
      { t: 'goto', at: from, text: 'Pick up the package' },
      { t: 'goto', at: to, time: 30 + metres / 14, text: 'Deliver it before time runs out' },
    ],
  };
}

function offerMission() {
  removeMarker(mission.startMarker);
  mission.def = MISSIONS[save.mission] || oddJob();
  const [x, z] = mission.def.at;
  mission.startMarker = addMarker('mission', x, z, 2.2, '#ffe14f', 'JOB: ' + mission.def.by.toUpperCase());
  mission.blip = [x, z];
}

function beginStep(k) {
  mission.step = k;
  const step = currentStep();
  removeMarker(mission.goalMarker);
  mission.goalMarker = null;
  if (step.time) mission.timer = step.time * diff().time;
  if (step.addTime) mission.timer += step.addTime * diff().time;
  if (step.t === 'goto') {
    mission.handoff = 0;
    const color = mission.def === FERRY ? '#ffbe62' : '#ff3fa4';
    mission.goalMarker = addMarker('goal', step.at[0], step.at[1], step.car ? 6.5 : 3, color, step.label);
    mission.blip = step.at;
  }
  if (step.t === 'lose') setWanted(step.stars);
  setText('objective', step.text);
}

function startMission() {
  const def = mission.def;
  mission.active = true;
  mission.timer = -1;
  mission.car = null;
  removeMarker(mission.startMarker);
  mission.startMarker = null;
  if (def.spawn) {
    const d = 1;
    const x = roadC(def.spawn.i) + DX[(d + 1) & 3] * PARK;
    const z = roadC(def.spawn.j) + CELL * 0.4;
    for (const v of vehicles.slice()) {
      if (v !== player.car && dist2(v.x, v.z, x, z) < 64) removeVehicle(v);
    }
    mission.car = addVehicle(def.spawn.type, x, z, headingOf(d), null, '#ff3f7f');
    mission.car.keep = true;
  }
  banner('title', def.name, 'A job from ' + def.by, 3.5);
  $('objective').classList.add('show');
  beginStep(0);
}

function endMission(passed, reason) {
  const ferry = mission.def === FERRY;
  const spare = Math.max(0, Math.floor(mission.timer));
  mission.active = false;
  mission.timer = -1;
  removeMarker(mission.goalMarker);
  mission.goalMarker = null;
  if (mission.car && mission.car !== player.car) mission.car.keep = false;
  mission.car = null;
  $('objective').classList.remove('show');
  if (passed) {
    const pay = mission.def.reward + (ferry ? Math.min(90, spare) * 2 : 0);
    if (ferry) {
      const seconds = Math.max(1, Math.ceil(mission.shiftTime));
      save.ferryRuns++;
      save.ferryBest = save.ferryBest ? Math.min(seconds, save.ferryBest) : seconds;
      banner('pass', 'ALL ABOARD', `Cinema kit delivered · +$${pay} · ${seconds}s / best ${save.ferryBest}s`, 5);
    } else {
      if (save.mission < MISSIONS.length) save.mission++;
      banner('pass', 'MISSION PASSED', '+$' + pay, 4.5);
    }
    addMoney(pay);
    sfx.pass();
  } else {
    banner('fail', 'MISSION FAILED', reason, 4);
    sfx.fail();
  }
  offerMission();
}

function updateMission(dt) {
  const [px, pz] = focus();
  if (!mission.active) {
    const m = mission.startMarker;
    if (m && dist2(m.x, m.z, px, pz) < 9 && (!player.car || Math.abs(player.car.vf) < 6)) startMission();
    return;
  }
  if (mission.timer >= 0) {
    mission.timer -= dt;
    if (mission.def === FERRY) mission.shiftTime += dt;
    if (mission.timer <= 0) {
      endMission(false, mission.def === FERRY ? 'The ferry sailed. Press G to take another shift.' : 'You ran out of time.');
      return;
    }
  }
  if (mission.car && (mission.car.dead || mission.car.hp <= 0)) {
    endMission(false, 'The car was destroyed.');
    return;
  }
  const step = currentStep();
  let done = false;
  if (step.t === 'car') {
    done = step.target ? player.car === mission.car : !!player.car;
    if (step.target) mission.blip = [mission.car.x, mission.car.z];
    else mission.blip = null;
  } else if (step.t === 'goto') {
    const r = step.car ? 6.5 : 3;
    done = dist2(step.at[0], step.at[1], px, pz) < r * r;
    if (step.car && !player.car) done = false;
    if (step.target && player.car !== mission.car) done = false;
    if (mission.def === FERRY) {
      const distance = Math.round(Math.hypot(step.at[0] - px, step.at[1] - pz));
      const stopped = done && Math.hypot(player.car.vx, player.car.vz) < 1.5;
      mission.handoff = stopped ? mission.handoff + dt : 0;
      const action = !player.car ? 'Get a vehicle [F]' : distance > 12 ? `${distance} m` : stopped ? 'Loading…' : 'Stop inside ring [Space]';
      setText('objective', `${step.text}  |  ${action}`);
      done = mission.handoff >= .65;
    }
  } else if (step.t === 'lose') {
    mission.blip = null;
    done = wanted.stars === 0;
  }
  if (!done) return;
  if (step.wantedAfter) setWanted(step.wantedAfter);
  sfx.cash();
  if (mission.step + 1 >= mission.def.steps.length) endMission(true);
  else beginStep(mission.step + 1);
}

// ---------- minimap ----------
const mapCanvas = $('map');
const mapCtx = mapCanvas.getContext('2d');
const MAP_SCALE = 0.42;           // pixels per metre

function drawMap() {
  const g = mapCtx;
  const size = mapCanvas.width;
  const half = size / 2;
  const [px, pz] = focus();
  const rot = cam.yaw + Math.PI;  // camera forward points up
  g.save();
  g.clearRect(0, 0, size, size);
  g.beginPath();
  g.arc(half, half, half - 2, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = '#14506a';
  g.fillRect(0, 0, size, size);
  g.translate(half, half);
  g.rotate(rot);
  g.scale(MAP_SCALE, MAP_SCALE);
  g.translate(-px, -pz);
  g.fillStyle = '#b9a877';
  g.fillRect(-HALF - SHORE, -HALF - SHORE, 2 * (HALF + SHORE), 2 * (HALF + SHORE));
  g.fillStyle = '#5b6170';
  g.fillRect(-HALF, -HALF, WORLD, WORLD);
  const i0 = clamp(cellOf(px) - 3, 0, N - 1);
  const i1 = clamp(cellOf(px) + 3, 0, N - 1);
  const j0 = clamp(cellOf(pz) - 3, 0, N - 1);
  const j1 = clamp(cellOf(pz) + 3, 0, N - 1);
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const b = blocks[i][j];
      g.fillStyle = b.type === 'park' ? '#2f6b3c' : '#262a36';
      g.fillRect(b.x0, b.z0, BLOCK, BLOCK);
    }
  }
  g.restore();

  // blips are drawn unrotated so their symbols stay upright
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  const blip = (x, z, color, text, pin) => {
    let dx = (x - px) * MAP_SCALE;
    let dz = (z - pz) * MAP_SCALE;
    let sx = dx * cosR - dz * sinR;
    let sy = dx * sinR + dz * cosR;
    const d = Math.hypot(sx, sy);
    const edge = half - 9;
    if (d > edge) {
      if (!pin) return;
      sx *= edge / d;
      sy *= edge / d;
    }
    g.fillStyle = color;
    g.beginPath();
    g.arc(half + sx, half + sy, text ? 7 : 4, 0, Math.PI * 2);
    g.fill();
    if (text) {
      g.fillStyle = '#0b0d18';
      g.font = 'bold 10px "Segoe UI", Arial';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, half + sx, half + sy + 0.5);
    }
  };
  blip(PLACES.garage[0], PLACES.garage[1], '#57ff9a', 'R');
  blip(PLACES.ammo[0], PLACES.ammo[1], '#ff8a3f', 'A');
  blip(PLACES.hospital[0], PLACES.hospital[1], '#ff6b78', 'H');
  blip(PLACES.police[0], PLACES.police[1], '#6fa2ff', 'P');
  for (const v of vehicles) {
    if (v.siren && !v.dead) blip(v.x, v.z, Math.floor(performance.now() / 200) % 2 ? '#ff3344' : '#3f7bff');
  }
  if (player.lastCar && player.lastCar !== player.car && !player.lastCar.dead) blip(player.lastCar.x, player.lastCar.z, '#e8e8e8');
  if (mission.blip) blip(mission.blip[0], mission.blip[1], mission.active ? (mission.def === FERRY ? '#ffbe62' : '#ff3fa4') : '#ffe14f', mission.active ? (mission.def === FERRY ? String(mission.step) : '') : 'J', true);
  blip(px, pz - 4000, '#ffffff', 'N', true);

  // player arrow
  const heading = player.car ? player.car.h : player.h;
  g.save();
  g.translate(half, half);
  g.rotate(cam.yaw - heading);
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#0b0d18';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(0, -8);
  g.lineTo(5.5, 6);
  g.lineTo(0, 3);
  g.lineTo(-5.5, 6);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}

// ---------- HUD refresh ----------
let lastZone = '';
function updateHud() {
  setText('money', '$' + save.money.toLocaleString('en-US'));
  const hours = Math.floor(tod);
  const minutes = Math.floor((tod - hours) * 60);
  setText('clock', String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0'));
  $('hp').style.width = clamp(player.hp, 0, 100) + '%';
  setText('weapon', player.gun && player.ammo > 0 ? 'Pistol  ' + player.ammo : 'Fists');

  const flashing = wanted.stars > 0 && wanted.evade > 2 && Math.floor(performance.now() / 300) % 2 === 0;
  const starState = wanted.stars + (flashing ? 'f' : '');
  if (hudCache.stars !== starState) {
    hudCache.stars = starState;
    const els = $('stars').children;
    for (let k = 0; k < 5; k++) els[k].className = k < wanted.stars ? (flashing ? 'on dim' : 'on') : '';
  }

  const car = player.car;
  if (car) {
    const kmh = Math.round(Math.hypot(car.vx, car.vz) * 3.6);
    setText('speed', kmh + ' km/h');
    $('carhp').style.width = clamp((car.hp / car.t.hp) * 100, 0, 100) + '%';
  }
  $('drive').classList.toggle('show', !!car);
  $('cross').classList.toggle('show', player.gun && player.ammo > 0);

  if (mission.active && mission.timer >= 0) {
    const secs = Math.ceil(mission.timer);
    setText('timer', Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0'));
    $('timer').classList.add('show');
    $('timer').classList.toggle('low', secs <= 10);
  } else {
    $('timer').classList.remove('show');
  }

  const [px, pz] = focus();
  const zone = zoneName(px, pz);
  if (zone !== lastZone) {
    lastZone = zone;
    toast('zone', zone, 3.5);
  }
}
