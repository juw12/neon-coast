// =====================================================================
// NEON COAST - part 3: effects, audio, wanted level, police, weapons,
//                      pickups, markers, missions, HUD
// =====================================================================
const $ = (id) => document.getElementById(id);

// ---------- particles and tracers ----------
const P_MAX = 900;                // 600 before 2.0: debris, blasts, water jets and nitro flames need the room
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
  // synthwave: four on the floor, a driving saw bass, a busy square arpeggio
  { name: 'Neon FM 88.1', tag: 'synthwave', bpm: 104, root: 45, prog: [0, -4, 3, -2], thirds: [3, 4, 4, 4], arp: [0, 7, 12, 7, 3, 7, 12, 15],
    kick: [0, 4, 8, 12], snare: [4, 12], bass: 'drive', pad: 'triangle', lead: null, swing: 0 },
  // beach pop in a major key: off-beat bass and open hats, hand claps, a tune on top
  { name: 'Coast 98', tag: 'beach pop', bpm: 122, root: 43, prog: [0, 5, -3, 2], thirds: [4, 4, 3, 3], arp: [0, null, 7, 12, null, 7, 4, null],
    kick: [0, 4, 8, 12], snare: [4, 12], bass: 'offbeat', pad: 'sawtooth', swing: 0,
    lead: [0, null, 4, null, 7, null, 9, 7, null, 4, null, 2, 4, null, null, null, 0, null, 4, null, 7, null, 12, 9, null, 7, null, 4, 2, null, 0, null] },
  // slow and warm: half-time drums with a late swing, long bass notes, seventh chords, a few bell notes
  { name: 'Low Tide', tag: 'late night', bpm: 84, root: 41, prog: [0, 3, -2, -5], thirds: [3, 4, 4, 3], arp: [12, null, null, 7, null, null, 3, null, 10, null, null, 7, null, null, null, null],
    kick: [0, 10], snare: [8], bass: 'long', pad: 'sine', lead: null, swing: 0.3 },
];

function initAudio() {
  if (audio.ctx) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  const ctx = (audio.ctx = new Ctx());
  audio.master = ctx.createGain();
  // a limiter so a crash, a siren and the radio together cannot clip; the tap lets a test measure what comes out
  audio.limit = ctx.createDynamicsCompressor();
  audio.limit.threshold.value = -9;
  audio.limit.knee.value = 6;
  audio.limit.ratio.value = 14;
  audio.limit.attack.value = 0.003;
  audio.limit.release.value = 0.2;
  audio.tap = ctx.createAnalyser();
  audio.tap.fftSize = 2048;
  audio.master.connect(audio.limit);
  audio.limit.connect(ctx.destination);
  audio.limit.connect(audio.tap);
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
  audio.engine2 = loop('square', 240);         // the same note an octave down: the engine's weight
  audio.siren = loop('square', 1500);
  // two beds of noise that are always running and are turned up when needed: tyres, and the wind at speed
  const hiss = (type, cutoff, q) => {
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    src.buffer = audio.noise;
    src.loop = true;
    filter.type = type;
    filter.frequency.value = cutoff;
    filter.Q.value = q;
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(audio.fx);
    src.start();
    return { filter, gain };
  };
  audio.squeal = hiss('bandpass', 1700, 5);
  audio.wind = hiss('lowpass', 520, 0.7);
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
  hornAt: (hz, vol) => {                       // another driver's horn: two notes, as loud as it is near
    tone(hz, 0.34, vol, 'square');
    tone(hz * 1.26, 0.34, vol * 0.7, 'square');
  },
  trick: (n) => tone(520 * Math.pow(1.122, Math.min(n, 9)), 0.09, 0.13, 'triangle'),   // each trick in a chain a tone higher
  smash: (hz, vol) => {                        // something on the street knocked over: a clatter at its own pitch
    noiseBurst(0.12, vol, 900 + hz * 3, 0, 0, 'bandpass');
    tone(hz, 0.1, vol * 0.5, 'triangle', hz * 0.6);
  },
  thud: (vol) => {                             // a car back on its wheels, a lamp post on the road
    noiseBurst(0.22, vol, 160);
    tone(70, 0.18, vol * 0.7, 'sine', 40);
  },
  nitro: () => {
    noiseBurst(0.6, 0.3, 2600, 0, 0, 'highpass');
    tone(160, 0.5, 0.12, 'sawtooth', 640);
  },
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
  toast('radio', STATIONS[k].name + (STATIONS[k].tag ? '  ·  ' + STATIONS[k].tag : ''));
  noiseBurst(0.09, 0.05, 2600, 0, audio.fx, 'bandpass');     // the dial crackles between stations
}

// The engine has five gears: its note climbs through each one and drops at the change, so speed can be heard.
const GEAR_ENDS = [0, 0.14, 0.3, 0.5, 0.72, 1.2];      // share of the car's top speed at which each gear runs out
function engineNote(car) {
  const share = Math.abs(car.vf) / car.t.max;
  let gear = 1;
  while (gear < GEAR_ENDS.length - 1 && share > GEAR_ENDS[gear]) gear++;
  const rev = clamp((share - GEAR_ENDS[gear - 1]) / (GEAR_ENDS[gear] - GEAR_ENDS[gear - 1]), 0, 1);
  return { gear, rev, hz: 52 + rev * 78 + gear * 6 };
}
// what the car sounds like this frame (also read by the checks): engine note, tyres, wind
function carSound(car) {
  if (!car) return { gear: 0, hz: 48, engine: 0, weight: 0, squeal: 0, wind: 0 };
  const speed = Math.hypot(car.vx, car.vz);
  const note = engineNote(car);
  // the part of the engine that comes from revs and throttle: none of it at idle
  const work = note.rev * 0.04 + (car.thr > 0 ? 0.03 : 0);
  return {
    gear: note.gear,
    hz: note.hz,
    engine: 0.045 + work,
    // the low octave only joins when the engine works, so an idling car does not drown the radio
    weight: work * 0.55,
    squeal: speed > 6 ? clamp((car.slip - 3) / 9, 0, 1) * 0.11 : 0,
    wind: clamp((speed - 14) / 34, 0, 1) * 0.1,
  };
}

function updateAudio() {
  const ctx = audio.ctx;
  if (!ctx) return;
  const now = ctx.currentTime;
  const car = state === 'play' ? player.car : null;
  const mix = (audio.mix = carSound(car));
  audio.engine.osc.frequency.setTargetAtTime(mix.hz, now, 0.05);
  audio.engine.gain.gain.setTargetAtTime(mix.engine, now, 0.08);
  audio.engine2.osc.frequency.setTargetAtTime(mix.hz / 2, now, 0.05);
  audio.engine2.gain.gain.setTargetAtTime(mix.weight, now, 0.08);
  audio.squeal.gain.gain.setTargetAtTime(mix.squeal, now, 0.06);
  audio.squeal.filter.frequency.setTargetAtTime(1500 + (car ? car.slip * 45 : 0), now, 0.1);
  audio.wind.gain.gain.setTargetAtTime(mix.wind, now, 0.25);

  // sirens: the ones chasing you at full volume, a patrol car on a call somewhere in town more quietly
  let sirenVol = 0;
  if (state === 'play') {
    const [px, pz] = focus();
    for (const v of vehicles) {
      if (v.siren) sirenVol = Math.max(sirenVol, clamp(1 - Math.hypot(v.x - px, v.z - pz) / 170, 0, 1) * (wanted.stars > 0 ? 1 : 0.5));
    }
  }
  audio.siren.osc.frequency.value = 700 + 260 * Math.sin(now * 5.5);
  audio.siren.gain.gain.setTargetAtTime(sirenVol * 0.07, now, 0.15);

  const station = STATIONS[radio.station];
  const playing = car && station.bpm;
  audio.music.gain.setTargetAtTime(playing ? 0.5 : 0, now, 0.2);
  if (!playing) return;
  const stepDur = 60 / station.bpm / 4;
  // A new station, or back after a long sleep: start again. Late by less (a slow frame): the steps that
  // were missed are left out and the beat stays where it was, so the tempo holds on a slow computer.
  if (radio.next < now - 1) radio.next = now + 0.05;
  while (radio.next < now) {
    radio.next += stepDur;
    radio.step++;
  }
  while (radio.next < now + 0.2) {
    const step = radio.step++;
    const beat = step & 15;
    const bar = (step >> 4) % station.prog.length;
    const root = station.root + station.prog[bar];
    const third = station.thirds[bar];
    const when = radio.next + (beat & 1 ? stepDur * station.swing : 0);
    // drums
    if (station.kick.includes(beat)) musicKick(when);
    if (station.snare.includes(beat)) {
      noiseBurst(0.13, 0.22, 1900, when, audio.music, 'bandpass');
      if (station.bass === 'offbeat') noiseBurst(0.1, 0.12, 1200, when + 0.012, audio.music, 'bandpass');   // a clap has two edges
    }
    if (station.bass === 'offbeat') {
      if (beat % 4 === 2) noiseBurst(0.11, 0.09, 8000, when, audio.music, 'highpass');
      else if (beat % 2 === 0) noiseBurst(0.03, 0.04, 9000, when, audio.music, 'highpass');
    } else if (station.bass === 'long') {
      if (beat % 4 === 2 || beat === 15) noiseBurst(0.03, 0.035, 6000, when, audio.music, 'highpass');
    } else if (beat % 2 === 0) noiseBurst(0.04, 0.07, 7000, when, audio.music, 'highpass');
    // bass
    if (station.bass === 'drive' && beat % 2 === 0) musicNote(when, midiHz(root - 12 + (beat % 8 === 6 ? 12 : 0)), stepDur * 1.8, 0.24, 'sawtooth', 520);
    if (station.bass === 'offbeat' && (beat % 4 === 2 || beat % 8 === 7)) musicNote(when, midiHz(root - 12 + (beat % 8 === 7 ? 7 : 0)), stepDur * 1.5, 0.25, 'sawtooth', 640);
    if (station.bass === 'long' && (beat === 0 || beat === 10)) musicNote(when, midiHz(root - 12), stepDur * (beat ? 5 : 9), 0.34, 'triangle', 380);
    // arpeggio (3 and 4 stand for the chord's own third), tune, chords
    const arp = station.arp[beat % station.arp.length];
    if (arp !== null) {
      const note = arp === 3 || arp === 4 ? third : arp === 15 || arp === 16 ? third + 12 : arp;
      if (station.bass === 'long') musicNote(when, midiHz(root + 24 + note), stepDur * 5, 0.05, 'sine', 4000);
      else musicNote(when, midiHz(root + 12 + note), stepDur * 1.6, station.lead ? 0.035 : 0.06, 'square', 2300);
    }
    if (station.lead) {
      const tune = station.lead[step % station.lead.length];
      if (tune !== null) musicNote(when, midiHz(station.root + 24 + tune), stepDur * 2.4, 0.075, 'triangle', 3200);
    }
    if (beat === 0) {
      const chord = station.bass === 'long' ? [0, third, 7, 10] : [0, third, 7];
      for (const interval of chord) musicNote(when, midiHz(root + interval), stepDur * 15, station.pad === 'sawtooth' ? 0.018 : 0.035, station.pad, station.pad === 'sawtooth' ? 900 : 1400);
    }
    radio.next += stepDur;
  }
}

// ---------- HUD helpers ----------
const hudCache = {};
function setText(id, value) {
  if (hudCache[id] === value) return;
  hudCache[id] = value;
  $(id).textContent = id === 'objective' || id === 'bigmap-note' ? say(value) : value;
}

const toastTimers = {};
function toast(id, text, secs) {
  const el = $(id);
  el.textContent = say(text);
  el.classList.add('show');
  clearTimeout(toastTimers[id]);
  toastTimers[id] = setTimeout(() => el.classList.remove('show'), (secs || 3) * 1000);
}
const hint = (text, secs) => toast('hint', text, secs || 3.5);

function banner(kind, title, sub, secs) {
  const el = $('banner');
  el.className = 'show ' + kind;
  el.querySelector('b').textContent = title;
  el.querySelector('span').textContent = say(sub || '');
  clearTimeout(toastTimers.banner);
  toastTimers.banner = setTimeout(() => (el.className = ''), (secs || 4) * 1000);
}

function addMoney(amount) {
  const before = save.money;
  save.money = Math.max(0, Math.round(save.money + amount));
  persist();
  const delta = save.money - before;
  if (!delta || state === 'title') return;
  const el = $('delta');
  el.textContent = (delta > 0 ? '+$' : '-$') + Math.abs(delta).toLocaleString('en-US');
  el.className = delta > 0 ? 'show up' : 'show down';
  clearTimeout(toastTimers.delta);
  toastTimers.delta = setTimeout(() => (el.className = ''), 2400);
}

// ---------- style: near misses and slides pay cash, and more of it in a row ----------
// A near miss is another driver's car passing the player's car, front to back, with a small gap and no touch.
// A slide is the car travelling well sideways (more than steering alone gives) for a moment. Each trick adds
// its cash to a chain; the chain is paid, times its multiplier, when no further trick follows in time, and is
// lost in a crash. With the police behind you every trick is worth double.
const STYLE = {
  nearSpeed: 14,       // m/s the player's car must be doing
  nearClosing: 8,      // m/s between the two cars: creeping past a queue is not a near miss
  nearGap: 1.8,        // m of daylight between the two cars at most
  nearPay: 25,
  copPay: 50,          // a near miss with a police car
  driftAngle: 0.36,    // sideways share of the car's speed (21 degrees)
  driftSpeed: 10,
  driftMin: 0.6,       // seconds before a slide counts
  driftPay: 30,        // $ a second
  driftCap: 6,
  hold: 4,             // seconds a chain stays open after its last trick
  step: 0.5,           // each further trick adds this to the multiplier
  maxMult: 4,
  heat: 2,             // with wanted stars on
  crash: 6,            // m/s: a crash at least this hard loses the chain
};
// free: 1 when the chain was opened by a smash (part 3c), which is not a trick and does not count towards the multiplier
const style = { bank: 0, count: 0, t: 0, drift: 0, crashT: 0, noteT: 0, shown: false, smashes: 0, free: 0 };
const styleMult = () => Math.min(STYLE.maxMult, 1 + STYLE.step * Math.max(0, style.count - 1 - style.free));
const styleValue = () => Math.round(style.bank * styleMult());

// the card under the clock: what the last trick was, what the chain is worth, how long it stays open
function styleNote(title, detail, kind, secs) {
  const el = $('style');
  el.querySelector('b').textContent = title;
  el.querySelector('span').textContent = detail;
  el.className = 'show ' + (kind || '');
  style.shown = true;
  style.noteT = secs || 0;        // 0: stays while the chain is open
}
function styleTrick(title, cash) {
  style.count++;
  style.bank += cash * (wanted.stars > 0 ? STYLE.heat : 1);
  style.t = STYLE.hold;
  save.tricks = (save.tricks || 0) + 1;
  const mult = styleMult();
  styleNote(title, '$' + styleValue() + (mult > 1 ? '  \u00b7  x' + mult : '') + (wanted.stars > 0 ? '  \u00b7  HEAT' : ''), 'open');
  sfx.trick(style.count);
  nitroGain(NITRO.trick);         // part 3c: every trick puts nitro in the tank
}
// what the car knocks over on the street (part 3c): its cash goes into the chain, opens one if none is open and
// keeps it open, but it is not a trick: the multiplier stays where it is
function styleSmash(cash) {
  if (style.crashT > 0) return;
  if (!style.count) style.count = style.free = 1;
  style.smashes++;
  style.bank += cash * (wanted.stars > 0 ? STYLE.heat : 1);
  style.t = STYLE.hold;
  const mult = styleMult();
  styleNote('SMASH  x' + style.smashes, '$' + styleValue() + (mult > 1 ? '  \u00b7  x' + mult : '') + (wanted.stars > 0 ? '  \u00b7  HEAT' : ''), 'open');
}
function styleClear() {
  style.bank = 0;
  style.count = 0;
  style.t = 0;
  style.drift = 0;
  style.smashes = 0;
  style.free = 0;
}
function styleBank() {
  if (!style.count) return 0;
  const pay = styleValue();
  const chain = style.count - style.free;
  const smashes = style.smashes;
  styleClear();
  save.styleBest = Math.max(save.styleBest || 0, pay);
  addMoney(pay);
  sfx.cash();
  styleNote('BANKED', '+$' + pay + (chain > 1 ? '  \u00b7  ' + chain + ' in a row' : smashes > 1 ? '  \u00b7  ' + smashes + ' smashed' : ''), 'paid', 2.2);
  return pay;
}
// called for every crash of the player's car (part 2)
function styleCrash(speed) {
  if (speed < STYLE.crash) return;
  style.crashT = 1;               // a spin after a crash is not a slide
  const lost = styleValue();
  const open = style.count > 0;
  styleClear();
  if (open) styleNote('CRASHED', 'lost $' + lost, 'lost', 2.2);
  else if (style.shown && !style.noteT) styleReset();      // a slide that was still being counted
}
function styleReset() {
  styleClear();
  style.crashT = 0;
  style.noteT = 0;
  style.shown = false;
  $('style').className = '';
}

function updateStyle(dt) {
  if (style.shown && style.noteT > 0 && (style.noteT -= dt) <= 0) {
    style.shown = false;
    $('style').className = '';
  }
  const car = player.car;
  if (!car || car.dead) {
    styleBank();                  // stepping out takes the money with you
    style.drift = 0;
    return;
  }
  style.crashT = Math.max(0, style.crashT - dt);
  const speed = Math.hypot(car.vx, car.vz);
  const fx = Math.sin(car.h);
  const fz = Math.cos(car.h);

  for (const o of vehicles) {
    if (o === car) continue;
    if (o.scraped > 0) o.scraped -= dt;
    const dx = o.x - car.x;
    const dz = o.z - car.z;
    if (Math.abs(dx) > 14 || Math.abs(dz) > 14) {
      o.passAhead = undefined;
      continue;
    }
    const ahead = dx * fx + dz * fz;
    const was = o.passAhead;
    o.passAhead = ahead;
    if (!(was > 0 && ahead <= 0)) continue;              // it has just gone from in front of the bonnet to behind it
    if (speed < STYLE.nearSpeed || o.dead || !o.driver || o.scraped > 0 || o.nearT > gameClock || style.crashT > 0) continue;
    if (Math.hypot(car.vx - o.vx, car.vz - o.vz) < STYLE.nearClosing) continue;
    const turn = o.h - car.h;
    const reach = car.t.wid / 2 + (Math.abs(Math.cos(turn)) * o.t.wid + Math.abs(Math.sin(turn)) * o.t.len) / 2;
    if (Math.abs(dx * fz - dz * fx) - reach > STYLE.nearGap) continue;
    o.nearT = gameClock + 3;
    const police = o.type === 'police';
    styleTrick(police ? 'CLOSE CALL' : 'NEAR MISS', police ? STYLE.copPay : STYLE.nearPay);
    if (!police) honk(o, true);                          // the other driver leans on the horn
  }

  const sideways = speed > 1 ? car.slip / speed : 0;
  if (sideways > STYLE.driftAngle && speed > STYLE.driftSpeed && style.crashT <= 0) {
    style.drift += dt;
    if (style.drift >= STYLE.driftMin) {
      // the slide is live: the card counts it, and an open chain waits for it to end
      const cash = Math.round(STYLE.driftPay * Math.min(STYLE.driftCap, style.drift));
      styleNote('SLIDE  ' + style.drift.toFixed(1) + 's', '+$' + cash * (wanted.stars > 0 ? STYLE.heat : 1), 'open');
      if (style.count) style.t = Math.max(style.t, 0.5);
    }
  } else if (style.drift > 0) {
    const secs = Math.min(STYLE.driftCap, style.drift);
    style.drift = 0;
    if (secs >= STYLE.driftMin) {
      save.driftBest = Math.max(save.driftBest || 0, Math.round(secs * 10) / 10);
      styleTrick('SLIDE  ' + secs.toFixed(1) + 's', Math.round(STYLE.driftPay * secs));
    }
  }

  if (style.count) {
    style.t -= dt;
    $('style-bar').style.width = Math.round(clamp(style.t / STYLE.hold, 0, 1) * 100) + '%';
    if (style.t <= 0) styleBank();
  }

  // said once, the first time the car is really moving
  if (!save.styleTold && speed > 17 && state === 'play') {
    save.styleTold = 1;
    persist();
    hint('Near misses pay cash, and so does a slide: [Space] with the wheel turned. Chain them before the bar runs out.', 6);
  }
}

// ---------- perks: what you do in one part of the city pays off in another ----------
const PERKS = [
  { id: 'armour', name: 'Body armour', how: 'Find 5 hidden packages', what: 'You take 25% less damage', count: () => [save.packages.length, 5] },
  { id: 'discount', name: "Mo's discount", how: 'Find 10 hidden packages', what: 'Respray and repair at half price', count: () => [save.packages.length, 10] },
  { id: 'licence', name: 'Cab licence', how: 'Finish 10 cab fares', what: 'Cab tips are doubled', count: () => [save.fares, 10] },
  { id: 'kingpin', name: 'Coast kingpin', how: 'Finish all six story jobs', what: 'Properties pay 50% more rent', count: () => [Math.min(save.mission, 6), 6] },
];
const perkHeld = (p) => p.count()[0] >= p.count()[1];
const perk = (id) => perkHeld(PERKS.find((p) => p.id === id));
let perksSeen = [];
let perkCounts = null;
// a small card under the cash: which perk just moved, how far along it is, what it gives
function perkNote(title, body, part, got) {
  const el = $('perk');
  el.querySelector('b').textContent = title;
  el.querySelector('span').textContent = body;
  el.querySelector('i').style.width = Math.round(clamp(part, 0, 1) * 100) + '%';
  el.classList.toggle('got', !!got);
  el.classList.add('show');
  clearTimeout(toastTimers.perk);
  toastTimers.perk = setTimeout(() => el.classList.remove('show'), got ? 8000 : 5000);
}
function checkPerks(quiet) {
  const counts = PERKS.map((p) => p.count()[0]);
  const held = PERKS.filter(perkHeld);
  if (!quiet) {
    let unlocked = false;
    for (const p of held) {
      if (perksSeen.includes(p.id)) continue;
      perkNote('PERK UNLOCKED  \u00b7  ' + p.name, p.what, 1, true);
      unlocked = true;
      if (p.id === 'discount') placeGarage();
    }
    // nothing unlocked: say how far the nearest perk on this track has come
    const moved = PERKS.find((p, k) => perkCounts && counts[k] > perkCounts[k] && !perkHeld(p));
    if (!unlocked && moved) {
      const [now, need] = moved.count();
      perkNote(moved.name + '  \u00b7  ' + now + ' / ' + need, moved.what, now / need, false);
    }
  }
  perksSeen = held.map((p) => p.id);
  perkCounts = counts;
}

// ---------- wanted level ----------
const wanted = { pts: 0, stars: 0, evade: 0, bust: 0, spawnT: 0, peak: 0, seenT: 0, callT: 20, ramRest: 0, bail: 0, took: { ram: 0, shot: 0 } };
const STAR_PTS = [0, 1, 3, 6, 10, 15];
const COPS_PER_STAR = [0, 1, 2, 3, 4, 6];
const ROLLING_SPEED = 6;                         // m/s: a cruiser faster than this is on the move (its officer aims worse)
const BAIL_GRACE = 8;                            // s: after the player jumps out of a burning car no officer fires (2.2)
const HOLD_FIRE_SPEED = 8;                       // m/s: at two stars officers do not shoot at a car faster than this
const GETAWAY_PAY = [0, 0, 150, 400, 800, 1400]; // cash for losing the police on the road, by the most stars the chase reached
const GETAWAY_SEEN = 10;                         // seconds the police must have had you in sight for the full sum
const evadeNeed = () => (7 + wanted.stars * 3) * diff().evade;      // seconds out of sight that lose them

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
  // learner phase: until the first job is done the police look away, so a first minute cannot end in an arrest
  if (save.mission === 0) {
    if (!wanted.letOff) hint('The police let that one go. After your first job they will not.', 4.5);
    wanted.letOff = true;
    return;
  }
  wanted.pts = Math.min(20, wanted.pts + points);
  wanted.evade = 0;
  refreshStars();
}

function setWanted(n) {
  wanted.pts = STAR_PTS[n];
  wanted.evade = 0;
  wanted.bust = 0;
  if (n === 0) {
    wanted.peak = 0;              // the next chase starts its own count
    wanted.seenT = 0;
  }
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
  player.hp -= amount * diff().dmg * (perk('armour') ? 0.75 : 1);
  sfx.hurt();
  $('flash').classList.add('show');
  setTimeout(() => $('flash').classList.remove('show'), 160);
  if (player.hp <= 0) die(cause || 'wasted');
}

// ---------- police helicopter: joins the chase at four stars ----------
const heli = { mesh: new T.Group(), rotor: new T.Group(), on: false, x: 0, y: 60, z: 0, vx: 0, vz: 0, h: 0, lx: 0, lz: 0, fire: 0, chop: 0, leave: 0 };
{
  const piece = (material, w, hgt, d, x, y, z, parent) => {
    const mesh = new T.Mesh(boxGeo, material);
    mesh.scale.set(w, hgt, d);
    mesh.position.set(x, y, z);
    (parent || heli.mesh).add(mesh);
    return mesh;
  };
  const hull = mat('#1c2533');
  piece(hull, 1.9, 1.7, 4.2, 0, 0, 0);
  piece(glowMat('#aebccf'), 1.94, 0.36, 4.24, 0, -0.25, 0);   // unlit stripe: still reads against a dark tower at night
  piece(glassMat, 1.7, 1.0, 1.3, 0, 0.05, 2.3);
  piece(hull, 0.45, 0.45, 4.6, 0, 0.35, -4.2);
  piece(hull, 0.14, 1.5, 0.9, 0, 1.0, -6.1);
  piece(glowMat('#ff3344'), 0.34, 0.34, 0.34, 0, 1.85, -6.1);
  piece(glowMat('#e8f2ff'), 0.7, 0.24, 0.7, 0, -0.95, 1.6);
  for (const side of [-0.8, 0.8]) piece(hull, 0.12, 0.12, 3.4, side, -1.25, 0.2);
  piece(mat('#0d0f14'), 11, 0.06, 0.36, 0, 0, 0, heli.rotor);
  piece(mat('#0d0f14'), 0.36, 0.06, 11, 0, 0, 0, heli.rotor);
  heli.rotor.position.y = 1.1;
  heli.mesh.add(heli.rotor);
  heli.mesh.rotation.order = 'YXZ';
  heli.mesh.scale.setScalar(1.5);
  heli.mesh.visible = false;
  scene.add(heli.mesh);

  // searchlight: a cone from the nose to the ground and a pool of light where it lands
  const coneGeo = new T.CylinderGeometry(0.3, 3.0, 1, 28, 1, true);
  coneGeo.translate(0, -0.5, 0);
  coneGeo.rotateX(-Math.PI / 2);
  heli.beamMat = new T.MeshBasicMaterial({ color: '#cfe4ff', transparent: true, opacity: 0.08, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false });
  heli.beam = new T.Mesh(coneGeo, heli.beamMat);
  const poolGeo = new T.PlaneGeometry(11, 11);
  poolGeo.rotateX(-Math.PI / 2);
  heli.poolMat = new T.MeshBasicMaterial({ map: radialTexture('rgba(215,232,255,0.6)', 'rgba(215,232,255,0)'), transparent: true, blending: T.AdditiveBlending, depthWrite: false });
  heli.pool = new T.Mesh(poolGeo, heli.poolMat);
  heli.beam.visible = heli.pool.visible = false;
  heli.beam.frustumCulled = false;
  scene.add(heli.beam, heli.pool);
}

function hideHeli() {
  heli.on = false;
  heli.mesh.visible = heli.beam.visible = heli.pool.visible = false;
}

// returns true while the crew can see the player
function updateHeli(dt) {
  const [px, pz] = focus();
  const chasing = wanted.stars >= 4;
  if (!chasing && !heli.on) return false;
  if (chasing && !heli.on) {
    const from = rand(0, Math.PI * 2);
    Object.assign(heli, { on: true, x: px + Math.sin(from) * 250, z: pz + Math.cos(from) * 250, y: 70, vx: 0, vz: 0, fire: 2 });
    heli.lx = heli.x;
    heli.lz = heli.z;
    heli.mesh.visible = heli.beam.visible = heli.pool.visible = true;
    hint('Police helicopter inbound. Outrun it or get a respray.', 5);
  }
  const dx = px - heli.x;
  const dz = pz - heli.z;
  const d = Math.hypot(dx, dz) || 1;
  let sees = false;
  if (chasing) {
    heli.leave = 0;
    const speed = 27 * clamp((d - 22) / 16, -0.35, 1);   // holds off to one side, so the beam slants down at you
    heli.vx += ((dx / d) * speed - heli.vx) * Math.min(1, dt * 1.3);
    heli.vz += ((dz / d) * speed - heli.vz) * Math.min(1, dt * 1.3);
    heli.y += (34 - heli.y) * Math.min(1, dt * 0.8);
    sees = d < 55;
    // five stars: the door gunner opens up
    heli.fire -= dt;
    if (wanted.stars >= 5 && sees && heli.fire <= 0) {
      heli.fire = rand(0.9, 1.6);
      const hit = Math.random() < diff().aim * 0.6;
      tracer(heli.x, heli.y - 1, heli.z, px + (hit ? 0 : rand(-3, 3)), 1.1, pz + (hit ? 0 : rand(-3, 3)));
      sfx.shot(0.35);
      if (hit && player.car) damageVehicle(player.car, 5);
      else if (hit) hurt(6, 'wasted');
    }
  } else {
    // called off: climb away, then vanish
    heli.leave += dt;
    heli.y += dt * 10;
    if (heli.leave > 7) {
      hideHeli();
      return false;
    }
  }
  heli.x += heli.vx * dt;
  heli.z += heli.vz * dt;
  const moving = Math.hypot(heli.vx, heli.vz);
  if (moving > 1.5) heli.h += wrapPi(Math.atan2(heli.vx, heli.vz) - heli.h) * Math.min(1, dt * 2.5);
  heli.lx += (px - heli.lx) * Math.min(1, dt * 3);
  heli.lz += (pz - heli.lz) * Math.min(1, dt * 3);
  heli.mesh.position.set(heli.x, heli.y, heli.z);
  heli.mesh.rotation.set(moving * 0.008, heli.h, 0);
  heli.rotor.rotation.y += dt * 34;
  heli.beam.position.set(heli.x, heli.y - 1.6, heli.z);
  heli.beam.lookAt(heli.lx, 0, heli.lz);
  heli.beam.scale.set(1, 1, Math.hypot(heli.lx - heli.x, heli.y - 1.6, heli.lz - heli.z));
  heli.pool.position.set(heli.lx, 0.11, heli.lz);
  heli.beamMat.opacity = chasing ? 0.025 + 0.075 * nightAmount : 0;
  heli.poolMat.opacity = chasing ? 0.25 + 0.75 * nightAmount : 0;
  heli.chop -= dt;
  if (heli.chop <= 0) {
    heli.chop = 0.09;
    noiseBurst(0.07, clamp(1 - d / 230, 0, 1) * 0.2, 230);
  }
  return sees;
}

function updateWanted(dt) {
  const [px, pz] = focus();
  wanted.ramRest = Math.max(0, wanted.ramRest - dt);
  wanted.bail = Math.max(0, wanted.bail - dt);       // runs out with no stars on too, so a later chase starts without it
  const fromAbove = updateHeli(dt);
  if (wanted.stars === 0) {
    wanted.pts = Math.max(0, wanted.pts - dt * 0.03);
    wanted.bust = 0;
    wanted.peak = 0;
    wanted.seenT = 0;
    // a quiet city still has police at work: now and then a patrol car answers a call with its siren on
    wanted.callT -= dt;
    if (wanted.callT <= 0) {
      wanted.callT = rand(35, 70);
      const patrol = vehicles.find((v) => v.driver === 'cop' && !v.dead && Math.hypot(v.x - px, v.z - pz) < 220) || spawnCop();
      if (patrol) patrol.call = rand(14, 22);
    }
    for (const v of vehicles) v.siren = v.call > 0 && v.driver === 'cop' && !v.dead;
    return;
  }
  wanted.peak = Math.max(wanted.peak, wanted.stars);
  let active = 0;
  let seen = fromAbove;
  let arresting = false;
  const carSpeed = player.car ? Math.hypot(player.car.vx, player.car.vz) : 0;
  // two stars is a pursuit: officers shoot at you on foot or in a car that has all but stopped, not at a car on the move
  // out of a burning car: the officers keep back from a car that is about to blow, and hold their fire (2.2)
  const holdFire = (wanted.stars === 2 && carSpeed > HOLD_FIRE_SPEED) || wanted.bail > 0;
  for (const v of vehicles) {
    if (v.driver !== 'cop' || v.dead) continue;
    v.siren = true;
    v.call = 0;
    const d = Math.hypot(v.x - px, v.z - pz);
    if (d < 230) active++;
    if (d < 60 && (d < 22 || v.ai.direct)) seen = true;
    if (d < 7.5 && Math.abs(v.vf) < 6) arresting = true;

    // two stars and up: officers open fire
    if (wanted.stars >= 2 && d < 36 && v.ai.direct && !holdFire) {
      v.ai.fire -= dt;
      if (v.ai.fire <= 0) {
        // an officer in a cruiser on the move shoots half as often and gets nothing for being close (2.1):
        // a cruiser that sits on the player's bumper is a pursuit, not a firing squad
        const rolling = Math.abs(v.vf) > ROLLING_SPEED;
        v.ai.fire = rand(0.5, 1.1) * (rolling ? 2 : 1);
        // a moving car is harder to hit: the chance falls with its speed, to 40% of the standing chance from 30 m/s
        const moving = player.car ? 1 - 0.6 * clamp(Math.hypot(player.car.vx, player.car.vz) / 30, 0, 1) : 1;
        const hit = Math.random() < diff().aim * (d < 15 && !rolling ? 1.4 : 1) * moving;
        const ex = px + (hit ? 0 : rand(-2.5, 2.5));
        const ez = pz + (hit ? 0 : rand(-2.5, 2.5));
        tracer(v.x, 1.4, v.z, ex, 1.1, ez);
        sfx.shot(clamp(1 - d / 50, 0.15, 0.6));
        if (hit && player.car) {
          damageVehicle(player.car, 6);
          wanted.took.shot += 6;
        } else if (hit) hurt(7, 'wasted');
      }
    }
  }

  wanted.spawnT -= dt;
  if (active < COPS_PER_STAR[wanted.stars] + diff().cops && wanted.spawnT <= 0) {
    spawnCop();
    wanted.spawnT = 2.5;
  }

  wanted.evade = seen ? 0 : wanted.evade + dt;
  if (seen) wanted.seenT += dt;
  if (wanted.evade > evadeNeed()) {
    // a getaway pays: more for more stars, and in full only when the police really were on you
    const peak = wanted.peak;
    const pay = Math.round((GETAWAY_PAY[peak] * Math.min(1, wanted.seenT / GETAWAY_SEEN)) / 10) * 10;
    setWanted(0);
    if (pay > 0) {
      save.getaways = (save.getaways || 0) + 1;
      addMoney(pay);
      sfx.cash();
      hint(`You lost them.  +$${pay} for a ${peak}-star getaway.`, 5);
    } else {
      hint('You lost them.');
    }
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
  if (touch.on) aimAssist();      // a thumb cannot aim like a mouse
  const cp = Math.cos(cam.pitch);
  const dx = Math.sin(cam.yaw) * cp;
  const dy = Math.sin(cam.pitch);
  const dz = Math.cos(cam.yaw) * cp;
  const o = camera.position;
  const hit = castRay(o.x, o.y, o.z, dx, dy, dz, cam.dist * 0.9, 150, player.car);
  shootProps(o.x, o.y, o.z, dx, dy, dz, hit.t);      // part 3c: a barrel in the way of the shot goes up
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
        checkPerks();
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
  tune: [(roadC(6) + roadC(7)) / 2, roadC(3)],
  ammo: kerb(6, 6),
  hospital: kerb(7, 2),
  police: kerb(2, 4),
  bank: kerb(4, 4),
  pier: [roadC(10), roadC(7)],                 // where the beach road meets the Sol Wheel pier
  wheel: [HALF + SHORE - 9, roadC(7) + 6],     // the foot of the pier, on the sand
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
  if (kind === 'prop') {
    ring.scale.y = 0.3;           // a low kerb ring: you stand in it on foot
    ring.position.y = 0.26;
  }
  group.add(ring, beam);
  if (text) {
    const label = labelSprite(text, hex);
    label.position.y = kind === 'mission' ? 9 : 5.4;
    if (kind === 'mission') label.scale.set(13, 3.25, 1);
    if (kind === 'prop') {
      label.scale.set(5, 1.25, 1);   // small enough to clear the wall behind it
      label.position.y = 3.7;
    }
    group.add(label);
  }
  group.position.set(x, 0, z);
  scene.add(group);
  const marker = { kind, x, z, r, hex, group, inside: false, text: text || '' };
  if (kind === 'prop') marker.label = group.children[2] || null;
  markers.push(marker);
  return marker;
}

function removeMarker(marker) {
  if (!marker) return;
  scene.remove(marker.group);
  const k = markers.indexOf(marker);
  if (k >= 0) markers.splice(k, 1);
}

const sprayPrice = () => (perk('discount') ? 75 : 150);
let garageMarker = null;
function placeGarage() {
  removeMarker(garageMarker);
  garageMarker = addMarker('garage', PLACES.garage[0], PLACES.garage[1], 4.5, '#57ff9a', 'RESPRAY $' + sprayPrice());
}
placeGarage();
addMarker('tune', PLACES.tune[0], PLACES.tune[1], 4.5, '#3fe0ff', 'TUNE-UP');
addMarker('ammo', PLACES.ammo[0], PLACES.ammo[1], 2.2, '#ff8a3f', 'AMMO $80');

// Tune-up: three stages, kept in the save, they make every car you drive quicker
const TUNE_PRICES = [1500, 3000, 6000];
function buyTune() {
  const price = TUNE_PRICES[save.tune];
  if (price === undefined) {
    hint('Tune-up: all three stages fitted.');
  } else if (save.money < price) {
    hint('Tune-up stage ' + (save.tune + 1) + ' costs $' + price + '. You have $' + save.money + '.', 5);
  } else {
    addMoney(-price);
    save.tune += 1;
    persist();
    sfx.cash();
    banner('pass', 'TUNE-UP ' + save.tune + ' / 3', 'Quicker off the line, higher top speed.  -$' + price, 3.5);
  }
}
addMarker('info', PLACES.hospital[0], PLACES.hospital[1], 1.6, '#ff4d5e', 'HOSPITAL');
addMarker('info', PLACES.police[0], PLACES.police[1], 1.6, '#4f8dff', 'POLICE');

// ---------- property: buy once on foot, then come back for the rent ----------
const lot = (i, j) => [(roadC(i) + roadC(i + 1)) / 2 + 10, roadC(j) + ROAD / 2 + 2.6];
const PROPERTIES = [
  { id: 'bungalow', name: 'Sol Beach Bungalow', tag: 'BUNGALOW', at: lot(9, 7), price: 2000, rate: 120 },
  { id: 'lockup', name: 'Rustport Lockup', tag: 'LOCKUP', at: lot(1, 9), price: 4500, rate: 280 },
  { id: 'villa', name: 'North Maren Villa', tag: 'VILLA', at: lot(7, 0), price: 8000, rate: 520 },
  { id: 'loft', name: 'Meridian Loft', tag: 'LOFT', at: lot(5, 3), price: 14000, rate: 950 },
];
const RENT_HOURS = 6;             // the till holds this many game hours of rent
const dollars = (n) => '$' + Math.round(n).toLocaleString('en-US');
const owned = (p) => save.props[p.id] !== undefined;
const rentRate = (p) => p.rate * (perk('kingpin') ? 1.5 : 1);
function placeProperty(p) {
  removeMarker(p.marker);
  p.marker = addMarker('prop', p.at[0], p.at[1], 2.2, owned(p) ? '#7dffa5' : '#d6dbe6', owned(p) ? p.tag : 'FOR SALE ' + dollars(p.price));
  p.marker.prop = p;
}
PROPERTIES.forEach(placeProperty);

function buyProperty(p) {
  if (save.money < p.price) {
    hint(p.name + ' costs ' + dollars(p.price) + '. You have ' + dollars(save.money) + '.', 5);
    return;
  }
  addMoney(-p.price);
  save.props[p.id] = 0;
  persist();
  placeProperty(p);
  p.marker.inside = true;
  sfx.pass();
  banner('pass', 'PROPERTY BOUGHT', p.name + '  ·  pays ' + dollars(rentRate(p)) + ' an hour', 4.5);
  hint('Yours. Walk back into the ring any time: it holds up to ' + RENT_HOURS + ' hours of rent and patches you up.', 7);
}

const SAFE_STARS = 2;             // your own front door hides you from this much heat
function collectRent(p) {
  const rent = Math.floor(save.props[p.id]);
  player.hp = 100;
  let lay = '';
  if (wanted.stars > SAFE_STARS) {
    lay = ' Too much heat to hide here: get under ' + (SAFE_STARS + 1) + ' stars first.';
  } else if (wanted.stars > 0) {
    setWanted(0);
    lay = ' You lie low and the police lose you.';
  }
  if (rent < 1) {
    hint(p.name + ': the till is empty. You are patched up.' + lay, lay ? 6 : 4);
    return;
  }
  save.props[p.id] -= rent;
  addMoney(rent);
  sfx.cash();
  hint(p.name + ': ' + dollars(rent) + ' rent collected, health restored.' + lay, lay ? 6 : 5);
}

let rentSaveT = 0;
function updateRent(dt) {
  let any = false;
  for (const p of PROPERTIES) {
    if (!owned(p)) continue;
    any = true;
    save.props[p.id] = Math.min(rentRate(p) * RENT_HOURS, save.props[p.id] + (rentRate(p) * dt) / 60);
  }
  rentSaveT += dt;
  if (any && rentSaveT > 15) {
    rentSaveT = 0;
    persist();
  }
}

// ---------- the Sol Wheel: a paid ride, a rest, and a look at where the packages are ----------
const RIDE_PRICE = 25;
const RIDE_SECS = 16;
const ride = { t: 0 };
const wheelGate = addMarker('wheel', PLACES.wheel[0], PLACES.wheel[1], 2.4, '#ff8fd0', 'SOL WHEEL  $' + RIDE_PRICE);
function startRide() {
  if (wanted.stars > 0) return hint('Sol Wheel: no rides while the police are after you.', 4);
  if (mission.active) return hint('Sol Wheel: finish your job first.', 4);
  if (save.money < RIDE_PRICE) return hint('A ride on the Sol Wheel costs $' + RIDE_PRICE + '.', 4);
  addMoney(-RIDE_PRICE);
  ride.t = RIDE_SECS;
  player.mesh.visible = false;
  // from the top you can see what is lying around: the three nearest packages go on the map
  const fresh = packageSpots
    .map((spot, id) => ({ id, d: dist2(spot[0], spot[1], player.x, player.z) }))
    .filter((s) => !save.packages.includes(s.id) && !save.spotted.includes(s.id))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3);
  for (const s of fresh) save.spotted.push(s.id);
  persist();
  sfx.cash();
  hint(fresh.length ? 'From up here you spot ' + fresh.length + ' hidden package' + (fresh.length > 1 ? 's' : '') + '. They are marked ? on your map.  F gets off.' : 'Nothing left to spot from up here.  F gets off.', 9);
}
function endRide() {
  if (ride.t <= 0) return;
  ride.t = 0;
  player.hp = 100;
  player.mesh.visible = !player.car;
  hint('Back on the sand, rested.', 3);
}

// E: ride the wheel, or buy the property you are standing at
function interact() {
  if (wheelGate.inside && !player.car) return startRide();
  for (const p of PROPERTIES) {
    if (!p.marker.inside) continue;
    if (player.car) hint('Get out of the car to visit ' + p.name + '.');
    else if (!owned(p)) buyProperty(p);
    else collectRent(p);
    return;
  }
  hint('Nothing to use here.', 2);
}

function updateMarkers(dt) {
  const [px, pz] = focus();
  updateRent(dt || 0);
  for (const m of markers) {
    const inside = dist2(m.x, m.z, px, pz) < m.r * m.r;
    const entered = inside && !m.inside;
    m.inside = inside;
    // standing in the ring, the prompt says the price: the sign would only cover the HUD
    if (m.label) m.label.visible = !inside;
    if (m.kind === 'tune') {
      // you have to stop in the ring, so driving past never buys anything
      if (!inside) m.armed = true;
      else if (wanted.stars > 0) {
        if (entered) hint('Tune-up: shutters down while the police are after you.', 4);
      } else if (player.car) {
        if (entered && save.tune < TUNE_PRICES.length) hint('Stop here for tune-up stage ' + (save.tune + 1) + ': $' + TUNE_PRICES[save.tune], 4);
        if (m.armed && Math.hypot(player.car.vx, player.car.vz) < 1.5) {
          m.armed = false;
          buyTune();
        }
      }
      continue;
    }
    if (!entered) continue;
    if (m.kind === 'wheel') {
      hint(player.car ? 'Sol Wheel: leave the car and walk up.' : 'Sol Wheel: $' + RIDE_PRICE + ' a ride.  Press E.', 6);
      continue;
    }
    if (m.kind === 'prop') {
      const p = m.prop;
      if (player.car) hint(p.name + ': get out of the car to visit.', 4);
      else if (owned(p)) collectRent(p);
      else hint(p.name + ': ' + dollars(p.price) + ', pays ' + dollars(rentRate(p)) + ' an hour.  Press E to buy.', 7);
      continue;
    }
    if (m.kind === 'garage' && player.car && !(mission.active && currentStep().at === PLACES.garage)) {
      const car = player.car;
      const price = sprayPrice();
      if (wanted.stars === 0 && car.hp >= car.t.hp) {
        hint('Mo: "Come back when the car is hot or broken."');
      } else if (save.money < price) {
        hint('Respray costs $' + price);
      } else {
        addMoney(-price);
        setWanted(0);
        car.hp = car.t.hp;
        const paint = mat(pick(VEHICLE_TYPES.sports.colors.concat(VEHICLE_TYPES.muscle.colors)));
        for (const part of car.mesh.userData.painted) part.material = paint;
        sfx.cash();
        banner('pass', 'RESPRAYED', 'Repaired and clean.  -$' + price, 3);
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
    name: 'First Wheels', by: 'Mo', at: [roadC(9) + PARK, PLACES.home[1] + 10.4], reward: 250,   // 40 m ahead of the start spot, in the red car's own lane
    steps: [
      { t: 'car', text: 'Get into any vehicle  [F]' },
      { t: 'goto', at: PLACES.pier, car: true, label: 'SOL WHEEL', text: 'Follow the beach road to the Sol Wheel pier' },
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
      { t: 'car', target: true, wantedAfter: 2, wantedDelay: 10, text: 'Steal the Vanta GT parked in Sol Beach' },
      { t: 'goto', at: PLACES.garage, car: true, target: true, text: "Bring it to Mo's Respray in one piece" },
    ],
  },
  {
    name: 'Heat Wave', by: 'Lena', at: corner(2, 2), reward: 2200,
    steps: [
      { t: 'goto', at: PLACES.bank, text: 'Grab the bag outside Meridian Bank' },
      { t: 'lose', stars: 3, text: "Lose the three-star heat: get out of their sight, or respray at Mo's" },
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
// one colour per kind of target, shared by the beam, the road arrows, the map line and the map blip
const jobColor = () => (!mission.active ? '#ffe14f' : mission.def === FERRY ? '#ffbe62' : mission.def.cab ? '#ffd23f' : '#ff3fa4');

// Harbor shift: a side contract, never a slot in the six-job story.
const FERRY = {
  name: 'Last Ferry', by: 'Harbor Dispatch', reward: 450,
  steps: [
    { t: 'car', text: 'Film night at Pier 03 • Take a vehicle [F]' },
    { t: 'goto', car: true, stop: true, time: 90, at: [roadC(9) + PARK, roadC(5) - 27], label: 'REEL LAB', text: '1/3 · Reel Lab · Collect the film cans' },
    { t: 'goto', car: true, stop: true, at: [roadC(9) + CELL * .52, roadC(4) + PARK], label: 'LAMP SHOP', text: '2/3 · Electric Works · Collect the lamp' },
    { t: 'goto', car: true, stop: true, at: [HALF + SHORE - 16, roadC(4)], label: 'PIER 03', text: '3/3 · Pier 03 · Deliver the cinema kit' },
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

// after the story: six kinds of odd job, offered in turn; J asks for another kind
const ODD_KINDS = ['delivery', 'repo', 'dash', 'heat', 'foot', 'tail'];
const TAIL = { near: 11, far: 60, seen: 3, lost: 8, pickup: 20 };   // metres behind the marked car, seconds of grace, and the opening seconds in which a gap cannot lose them
let oddCount = 0;
function oddJob() {
  const kind = ODD_KINDS[oddCount++ % ODD_KINDS.length];
  const at = corner(irand(1, 8), irand(1, 8));
  if (kind === 'foot') {
    // on foot: four envelopes round one block, against the clock
    let b = null;
    while (!b || b.type === 'park') b = blocks[irand(1, 8)][irand(1, 8)];
    const mx = (b.x0 + b.x1) / 2;
    const mz = (b.z0 + b.z1) / 2;
    const stops = [[mx, b.z0 + 2.4], [b.x1 - 2.4, mz], [mx, b.z1 - 2.4], [b.x0 + 2.4, mz]];
    return {
      name: 'Paper Round', by: 'Lena', at: blockCorner(b, 0), reward: 550, kind,
      steps: stops.map((p, k) => ({ t: 'goto', at: p, foot: true, time: k === 0 ? 16 : 0, addTime: k === 0 ? 0 : 11,
        text: `Envelope ${k + 1} of 4: on foot, round the block  [Shift] sprints` })),
    };
  }
  if (kind === 'tail') {
    // no clock and no marker: stay behind a moving car without being noticed
    const type = pick(['sedan', 'sports', 'muscle']);
    return {
      name: 'Shadow Run', by: 'Rico', at, reward: 700, kind, tailType: type,
      steps: [
        { t: 'car', text: 'Get in a car: Rico wants someone followed' },
        { t: 'tail', secs: 40, text: 'Tail the pink ' + VEHICLE_TYPES[type].name },
      ],
    };
  }
  if (kind === 'repo') {
    const type = pick(['sports', 'muscle']);
    return {
      name: 'Repo Run', by: 'Mo', at, reward: 750, kind, spawn: { type, i: irand(1, 8), j: irand(0, 8) },
      steps: [
        { t: 'car', target: true, wantedAfter: 1, wantedDelay: 8, text: 'Take the marked ' + VEHICLE_TYPES[type].name + '. The owner will call it in.' },
        { t: 'goto', at: PLACES.garage, car: true, target: true, text: "Bring it to Mo's Respray in one piece" },
      ],
    };
  }
  if (kind === 'dash') {
    const i = irand(1, 6);
    const j = irand(1, 6);
    const w = irand(2, 3);
    const h = irand(2, 3);
    return {
      name: 'Block Dash', by: 'Rico', at: corner(i, j), reward: 500 + (w + h) * 80, kind,
      steps: [{ t: 'car', text: 'Get in something fast' }].concat(lap([[i + w, j], [i + w, j + h], [i, j + h], [i, j]], 22, 14)),
    };
  }
  if (kind === 'heat') {
    return {
      name: 'Hot Parcel', by: 'Lena', at, reward: 650, kind,
      steps: [
        { t: 'goto', at: corner(irand(0, 9), irand(0, 9)), text: 'Collect the parcel. Someone is watching it.' },
        { t: 'lose', stars: 2, text: "Shake the two-star heat: get out of their sight, or respray at Mo's" },
      ],
    };
  }
  const from = corner(irand(0, 9), irand(0, 9));
  let to = from;
  while (manhattan(to, from) < 250) to = corner(irand(0, 9), irand(0, 9));
  const metres = manhattan(to, from);
  return {
    name: 'Rush Order', by: 'Lena', at, reward: Math.round(metres * 0.9 / 50) * 50 + 200, kind,
    steps: [
      { t: 'goto', at: from, text: 'Pick up the package' },
      { t: 'goto', at: to, time: 30 + metres / 14, text: 'Deliver it before time runs out' },
    ],
  };
}

// ---------- cab fares: a side job in any City Cab (T) ----------
const cab = { on: false, streak: 0, passenger: null, nextT: 0 };
const manhattan = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
// a kerbside stop somewhere on the street grid, between minD and maxD metres (by road) from a point
function roadStop(minD, maxD, from) {
  let stop = null;
  for (let tries = 0; tries < 60; tries++) {
    const i = irand(0, N - 1);
    const j = irand(0, N);
    const side = j === 0 ? 1 : j === N ? -1 : pick([-1, 1]);
    const x = (roadC(i) + roadC(i + 1)) / 2 + rand(-16, 16);
    stop = { at: [x, roadC(j) + side * PARK], kerb: [x, roadC(j) + side * (ROAD / 2 + 2)] };
    const d = manhattan(stop.at, from);
    if (d >= minD && d <= maxD && !kerbBusy(stop.at[0], stop.at[1])) break;      // not on a ramp or in road works (part 3c)
  }
  return stop;
}

function clearPassenger() {
  if (cab.passenger) scene.remove(cab.passenger);
  cab.passenger = null;
}

function cabFare() {
  const from = roadStop(90, 300, focus());
  const to = roadStop(300, 720, from.at);
  const metres = manhattan(from.at, to.at);
  clearPassenger();
  cab.passenger = buildPerson(pick(SHIRTS), pick(PANTS), pick(SKINS), pick(HAIRS));
  cab.passenger.position.set(from.kerb[0], 0, from.kerb[1]);
  cab.passenger.rotation.y = from.kerb[1] > from.at[1] ? Math.PI : 0;
  cab.passenger.userData.arms[1].rotation.x = -2.6;   // hailing the cab
  scene.add(cab.passenger);
  return {
    name: 'Cab Fare', by: 'City Cab Co.', cab: true, to, metres,
    reward: Math.round((60 + metres * 0.38) / 10) * 10,
    steps: [
      { t: 'goto', car: true, stop: true, at: from.at, label: 'FARE', text: 'Pick up the fare' },
      { t: 'goto', car: true, stop: true, at: to.at, time: 22 + metres / 10, label: 'DROP-OFF', text: 'Take the fare to ' + zoneName(to.at[0], to.at[1]) },
    ],
  };
}

function cabDuty() {
  if (cab.on) {
    cab.on = false;
    if (mission.active && mission.def.cab) endMission(false, 'Off duty. Press T in a City Cab to start again.');
    else hint('Cab: off duty.');
    return;
  }
  if (!player.car || player.car.type !== 'taxi') {
    hint('Cab fares need a City Cab: take a yellow one, then press T.', 5);
    return;
  }
  if (mission.active) {
    hint('Finish your current job first.');
    return;
  }
  cab.on = true;
  cab.streak = 0;
  mission.def = cabFare();
  startMission();
}

// J: ask the contacts for an odd job. They open once the first story job is done; while story jobs are left,
// J goes from the story job to an odd job and back, and each time round it is another kind of odd job.
function anotherJob() {
  if (mission.active) {
    hint('Finish your current job first.');
    return;
  }
  if (save.mission === 0) {
    const first = mission.offer;
    hint(`First job: ${first.name} from ${first.by}, $${first.reward}. Odd jobs open once it is done.`, 4.5);
    return;
  }
  const story = MISSIONS[save.mission];
  const toStory = story && mission.offer !== story;
  offerMission(toStory ? story : oddJob());
  const next = mission.offer;
  if (toStory) hint(`Story job: ${next.name} from ${next.by}, $${next.reward}.  [J] an odd job instead`, 5);
  else hint(`${next.name} from ${next.by}, $${next.reward}${next.kind === 'foot' ? ', ON FOOT' : next.kind === 'tail' ? ', follow a car unseen' : ''}.  ${story ? '[J] back to the story job' : '[J] another kind'}`, 5);
  sfx.cash();
}

function offerMission(job) {
  removeMarker(mission.startMarker);
  mission.def = mission.offer = job || MISSIONS[save.mission] || oddJob();
  const [x, z] = mission.def.at;
  mission.startMarker = addMarker('mission', x, z, 2.2, '#ffe14f', 'JOB: ' + mission.def.by.toUpperCase() + (mission.def.kind === 'foot' ? ' · ON FOOT' : ''));
  mission.blip = [x, z];
}

function spawnTail(type) {
  const [px, pz] = focus();
  for (let tries = 0; tries < 80; tries++) {
    const reach = tries < 50 ? 2 : 3;
    const i = clamp(nodeOf(px) + irand(-reach, reach), 0, N);
    const j = clamp(nodeOf(pz) + irand(-reach, reach), 0, N);
    const d = irand(0, 3);
    const ni = i + DX[d];
    const nj = j + DZ[d];
    if (ni < 0 || nj < 0 || ni > N || nj > N) continue;
    const rd = (d + 1) & 3;
    const x = roadC(i) + DX[d] * CELL / 2 + DX[rd] * LANE;
    const z = roadC(j) + DZ[d] * CELL / 2 + DZ[rd] * LANE;
    const gap = Math.hypot(x - px, z - pz);
    if (gap < 26 || gap > (tries < 50 ? 58 : 130) || vehicleNear(x, z, 9)) continue;
    if (tries < 30 && player.car) {
      // first choice: in front of you and not driving at you, so the job does not open with a U-turn
      const fx = Math.sin(player.car.h);
      const fz = Math.cos(player.car.h);
      if ((x - px) * fx + (z - pz) * fz < gap * 0.5 || DX[d] * fx + DZ[d] * fz < -0.5) continue;
    }
    const v = addVehicle(type, x, z, headingOf(d), 'ai', '#ff3f7f');
    v.ai.d = d;
    v.ai.ti = ni;
    v.ai.tj = nj;
    v.ai.cruise = 10.5;
    v.vx = DX[d] * 6;
    v.vz = DZ[d] * 6;
    v.keep = true;
    return v;
  }
  return null;
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
    mission.goalMarker = addMarker('goal', step.at[0], step.at[1], step.car ? 6.5 : 3, jobColor(), step.label);
    mission.blip = step.at;
  }
  if (step.t === 'lose') setWanted(step.stars);
  if (step.t === 'tail') {
    mission.car = spawnTail(mission.def.tailType);
    mission.tail = { good: 0, seen: 0, lost: 0, age: 0 };
    if (mission.car) hint('Stay ' + (TAIL.near + 1) + ' to ' + TAIL.far + ' m behind the pink car for ' + step.secs + ' seconds. Too close and they notice.', 6);
  }
  setText('objective', step.text);
}

function startMission() {
  const def = mission.def;
  mission.active = true;
  mission.timer = -1;
  mission.car = null;
  mission.heat = null;
  mission.tail = null;
  removeMarker(mission.startMarker);
  mission.startMarker = null;
  if (def.spawn) {
    const d = 1;
    let sj = def.spawn.j;
    while (kerbTaken.has(def.spawn.i + ',' + sj + ',' + d)) sj = (sj + 1) % N;      // a ramp or road works has that kerb (part 3c)
    const x = roadC(def.spawn.i) + DX[(d + 1) & 3] * PARK;
    const z = roadC(sj) + CELL * 0.4;
    for (const v of vehicles.slice()) {
      if (v !== player.car && dist2(v.x, v.z, x, z) < 64) removeVehicle(v);
    }
    mission.car = addVehicle(def.spawn.type, x, z, headingOf(d), null, '#ff3f7f');
    mission.car.keep = true;
  }
  if (!def.cab) cab.on = false;
  if (!def.cab || cab.streak === 0) banner('title', def.name, def.cab ? 'Stop in the ring to pick up. T ends the shift.' : (def.kind === 'foot' ? 'On foot · a job from ' : 'A job from ') + def.by, 3.5);
  $('objective').classList.add('show');
  beginStep(0);
}

function endMission(passed, reason) {
  const ferry = mission.def === FERRY;
  const spare = Math.max(0, Math.floor(mission.timer));
  mission.active = false;
  mission.timer = -1;
  mission.heat = null;
  mission.tail = null;
  removeMarker(mission.goalMarker);
  mission.goalMarker = null;
  if (mission.car && mission.car !== player.car) mission.car.keep = false;
  mission.car = null;
  $('objective').classList.remove('show');
  const def = mission.def;
  if (passed) {
    let pay = def.reward + (ferry ? Math.min(90, spare) * 2 : 0);
    if (ferry) {
      const seconds = Math.max(1, Math.ceil(mission.shiftTime));
      save.ferryRuns++;
      save.ferryBest = save.ferryBest ? Math.min(seconds, save.ferryBest) : seconds;
      banner('pass', 'ALL ABOARD', `Cinema kit delivered · +$${pay} · ${seconds}s / best ${save.ferryBest}s`, 5);
    } else if (def.cab) {
      // fare by distance, a tip for every second left, and more for each fare in a row
      cab.streak++;
      save.fares++;
      save.fareBest = Math.max(save.fareBest, cab.streak);
      const tip = Math.round(Math.min(def.reward * 0.5, spare * 2) * (perk('licence') ? 2 : 1));
      const run = Math.round(def.reward * Math.min(0.5, 0.1 * (cab.streak - 1)));
      pay += tip + run;
      banner('pass', 'FARE PAID', `+$${pay}  ·  tip $${tip}  ·  ${cab.streak} in a row`, 3.2);
      const rider = addPed(def.to.kerb[0], def.to.kerb[1]);
      rehome(rider);
      cab.nextT = 3.4;
    } else {
      if (save.mission < MISSIONS.length) {
        save.mission++;
        if (save.mission === 1) hint('From now on the police are watching you.  Odd jobs are open: [J].', 6);
        if (save.mission === MISSIONS.length) hint('Story finished. Odd jobs from here: [J] picks the kind.', 7);
      }
      banner('pass', 'MISSION PASSED', '+$' + pay, 4.5);
    }
    addMoney(pay);
    sfx.pass();
    checkPerks();
  } else {
    banner('fail', def.cab ? 'FARE LOST' : 'MISSION FAILED', reason, 4);
    sfx.fail();
    if (def.cab) {
      cab.on = false;
      clearPassenger();
    }
  }
  offerMission();
}

function updateMission(dt) {
  const [px, pz] = focus();
  if (!mission.active) {
    const m = mission.startMarker;
    if (m && dist2(m.x, m.z, px, pz) < 9 && (!player.car || Math.abs(player.car.vf) < 6)) {
      if (mission.offer.kind === 'foot' && player.car) {
        // said at the beam, before the clock starts
        mission.footNote = (mission.footNote || 0) - dt;
        if (mission.footNote <= 0) {
          mission.footNote = 2.5;
          hint(mission.offer.name + ' is on foot: leave the car  [F], then step into the beam.', 3);
        }
      } else {
        mission.def = mission.offer;
        startMission();
      }
    } else if (cab.on) {
      // on duty between fares: the next one calls in after a moment
      cab.nextT -= dt;
      if (!player.car || player.car.type !== 'taxi') {
        cab.on = false;
        hint('Cab: off duty.');
      } else if (cab.nextT <= 0) {
        mission.def = cabFare();
        startMission();
      }
    }
    return;
  }
  if (mission.def.cab && (!player.car || player.car.type !== 'taxi')) {
    endMission(false, 'You left the cab.');
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
  if (mission.heat) {
    mission.heat.t -= dt;
    if (mission.heat.t <= 0) {
      if (wanted.stars < mission.heat.stars) setWanted(mission.heat.stars);
      mission.heat = null;
      hint('The owner has called it in. The police are looking for this car.', 4);
    }
  }
  const step = currentStep();
  let done = false;
  if (step.t === 'tail') {
    const car = mission.car;
    if (!car) {
      endMission(false, 'Rico: "They never showed. Ask me again."');
      return;
    }
    const tail = mission.tail;
    const gap = Math.hypot(car.x - px, car.z - pz);
    mission.blip = [car.x, car.z];
    const close = gap < TAIL.near;
    const far = gap > TAIL.far || !player.car;
    tail.seen = close ? tail.seen + dt : Math.max(0, tail.seen - dt * 0.5);
    // a slow start is not a lost tail: for the opening seconds a gap does not count against you
    tail.age += dt;
    const opening = tail.age < TAIL.pickup;
    tail.lost = far && !opening ? tail.lost + dt : 0;
    if (!close && !far) tail.good += dt;
    if (tail.seen >= TAIL.seen) {
      car.ai.cruise = 22;
      endMission(false, 'They spotted you in the mirror.');
      return;
    }
    if (tail.lost >= TAIL.lost) {
      endMission(false, 'You lost them.');
      return;
    }
    const left = Math.max(0, Math.ceil(step.secs - tail.good));
    const note = !player.car ? 'Get back in a car  [F]' : close ? 'TOO CLOSE: drop back' : far ? (opening ? 'CATCH UP: get within ' + TAIL.far + ' m' : 'LOSING THEM: catch up') : 'good: keep this distance';
    setText('objective', `${step.text}  |  ${Math.round(gap)} m  ·  ${note}  ·  ${left} s to go`);
    done = tail.good >= step.secs;
  } else if (step.t === 'car') {
    done = step.target ? player.car === mission.car : !!player.car;
    if (step.target) mission.blip = [mission.car.x, mission.car.z];
    else mission.blip = null;
  } else if (step.t === 'goto') {
    const r = step.car ? 6.5 : 3;
    done = dist2(step.at[0], step.at[1], px, pz) < r * r;
    if (step.car && !player.car) done = false;
    if (step.foot && player.car) {
      done = false;
      setText('objective', 'This job is on foot: leave the car  [F]');
    } else if (step.foot) setText('objective', step.text);
    if (step.target && player.car !== mission.car) done = false;
    if (step.stop) {
      const distance = Math.round(Math.hypot(step.at[0] - px, step.at[1] - pz));
      // nobody gets into a cab with the police on its tail
      const hot = !!mission.def.cab && mission.step === 0 && wanted.stars > 0;
      const stopped = done && !hot && Math.hypot(player.car.vx, player.car.vz) < 1.5;
      mission.handoff = stopped ? mission.handoff + dt : 0;
      const busy = !mission.def.cab ? 'Loading…' : mission.step === 0 ? 'Getting in…' : 'Paying…';
      const action = !player.car ? 'Get a vehicle [F]' : hot ? 'Lose the police first' : distance > 12 ? `${distance} m` : stopped ? busy : 'Stop inside ring [Space]';
      setText('objective', `${step.text}  |  ${action}`);
      done = mission.handoff >= .65;
    }
  } else if (step.t === 'lose') {
    // the route leads to the respray: one sure way out, for anyone who cannot shake them
    mission.blip = PLACES.garage;
    done = wanted.stars === 0;
  }
  if (!done) return;
  if (step.wantedAfter && step.wantedDelay) {
    mission.heat = { t: step.wantedDelay, stars: step.wantedAfter };
    hint('The owner saw you take it. You have ' + step.wantedDelay + ' seconds before the police know.', 5);
  } else if (step.wantedAfter) setWanted(step.wantedAfter);
  if (mission.def.cab && mission.step === 0) {
    clearPassenger();
    sfx.door();
  }
  sfx.cash();
  if (mission.step + 1 >= mission.def.steps.length) endMission(true);
  else beginStep(mission.step + 1);
}

// ---------- route: the way along the streets to the current target ----------
const route = { points: [], length: 0 };
const ROUTE_MARKS = 14;
const ROUTE_GAP = 9;
const routeMat = new T.MeshBasicMaterial({ color: '#ff3fa4', transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
const routeMesh = (() => {
  const shape = new T.Shape();
  [[0, 2.1], [1.15, -0.7], [1.15, -1.9], [0, 0.9], [-1.15, -1.9], [-1.15, -0.7]].forEach((p, k) => (k ? shape.lineTo(p[0], p[1]) : shape.moveTo(p[0], p[1])));
  const geo = new T.ShapeGeometry(shape);
  geo.rotateX(Math.PI / 2);       // flat on the road, pointing along +z
  const mesh = new T.InstancedMesh(geo, routeMat, ROUTE_MARKS);
  mesh.frustumCulled = false;
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
})();
const routeDummy = new T.Object3D();

// nearest point on the street grid
function snapRoad(x, z) {
  const rx = roadC(nodeOf(x));
  const rz = roadC(nodeOf(z));
  return Math.abs(x - rx) < Math.abs(z - rz)
    ? { x: rx, z: clamp(z, roadC(0), roadC(N)), along: 'z' }
    : { x: clamp(x, roadC(0), roadC(N)), z: rz, along: 'x' };
}

// every grid line is a street, so the shortest way is one or two turns
function findRoute(px, pz, tx, tz) {
  const a = snapRoad(px, pz);
  const b = snapRoad(tx, tz);
  const mid = [];
  if (a.along !== b.along) {
    mid.push(a.along === 'z' ? [a.x, b.z] : [b.x, a.z]);
  } else if (a.along === 'z' && Math.abs(a.x - b.x) > 1) {
    // two parallel streets: cross over on the street that adds the least
    const lo = Math.min(a.z, b.z);
    const hi = Math.max(a.z, b.z);
    let cross = roadC(nodeOf((a.z + b.z) / 2));
    if (cross < lo || cross > hi) cross = Math.abs(roadC(nodeOf(a.z)) - a.z) < Math.abs(roadC(nodeOf(b.z)) - b.z) ? roadC(nodeOf(a.z)) : roadC(nodeOf(b.z));
    mid.push([a.x, cross], [b.x, cross]);
  } else if (a.along === 'x' && Math.abs(a.z - b.z) > 1) {
    const lo = Math.min(a.x, b.x);
    const hi = Math.max(a.x, b.x);
    let cross = roadC(nodeOf((a.x + b.x) / 2));
    if (cross < lo || cross > hi) cross = Math.abs(roadC(nodeOf(a.x)) - a.x) < Math.abs(roadC(nodeOf(b.x)) - b.x) ? roadC(nodeOf(a.x)) : roadC(nodeOf(b.x));
    mid.push([cross, a.z], [cross, b.z]);
  }
  const raw = [[px, pz], [a.x, a.z]].concat(mid, [[b.x, b.z], [tx, tz]]);
  const points = [raw[0]];
  for (let k = 1; k < raw.length; k++) {
    const last = points[points.length - 1];
    if (dist2(last[0], last[1], raw[k][0], raw[k][1]) > 1) points.push(raw[k]);
  }
  return points;
}

function updateRoute() {
  const target = state === 'play' ? mission.blip : null;
  const [px, pz] = focus();
  if (!target || dist2(target[0], target[1], px, pz) < 14 * 14) {
    route.points = [];
    route.length = 0;
    routeMesh.visible = false;
    return;
  }
  route.points = findRoute(px, pz, target[0], target[1]);
  route.length = 0;
  for (let k = 1; k < route.points.length; k++) route.length += Math.hypot(route.points[k][0] - route.points[k - 1][0], route.points[k][1] - route.points[k - 1][1]);

  // arrows on the road ahead, only while driving
  routeMesh.visible = !!player.car;
  if (!player.car) return;
  routeMat.color.set(jobColor());
  let along = 7 + ((performance.now() / 1000) * 7) % ROUTE_GAP;
  let seg = 1;
  let segStart = 0;
  for (let k = 0; k < ROUTE_MARKS; k++, along += ROUTE_GAP) {
    let placed = false;
    while (seg < route.points.length && along < route.length - 5) {
      const p0 = route.points[seg - 1];
      const p1 = route.points[seg];
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      if (along <= segStart + len) {
        const u = (along - segStart) / len;
        // keep to the right-hand lane, where you should be driving
        const side = seg > 1 && seg < route.points.length - 1 ? LANE : 0;
        routeDummy.position.set(lerp(p0[0], p1[0], u) - ((p1[1] - p0[1]) / len) * side, 0.07, lerp(p0[1], p1[1], u) + ((p1[0] - p0[0]) / len) * side);
        routeDummy.rotation.y = Math.atan2(p1[0] - p0[0], p1[1] - p0[1]);
        routeDummy.scale.setScalar(1 - k / (ROUTE_MARKS * 1.6));
        placed = true;
        break;
      }
      segStart += len;
      seg++;
    }
    if (!placed) routeDummy.scale.setScalar(0);
    routeDummy.updateMatrix();
    routeMesh.setMatrixAt(k, routeDummy.matrix);
  }
  routeMesh.instanceMatrix.needsUpdate = true;
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
  g.fillStyle = '#7b7e88';      // the Rustport dock apron and quay
  g.fillRect(DOCK.x0, DOCK.z0, DOCK.x1 - DOCK.x0, DOCK.z1 - DOCK.z0);
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
  // the way to the target, along the streets
  if (route.points.length > 1) {
    g.strokeStyle = jobColor();
    g.globalAlpha = 0.9;
    g.lineWidth = 7;
    g.lineJoin = 'round';
    g.beginPath();
    route.points.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.stroke();
    g.globalAlpha = 1;
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
  blip(PLACES.tune[0], PLACES.tune[1], '#3fe0ff', 'T');
  blip(PLACES.ammo[0], PLACES.ammo[1], '#ff8a3f', 'A');
  blip(PLACES.hospital[0], PLACES.hospital[1], '#ff6b78', 'H');
  blip(PLACES.police[0], PLACES.police[1], '#6fa2ff', 'P');
  for (const p of PROPERTIES) blip(p.at[0], p.at[1], owned(p) ? '#7dffa5' : '#d6dbe6', '$');
  for (const id of save.spotted) if (!save.packages.includes(id)) blip(packageSpots[id][0], packageSpots[id][1], '#c58bff', '?');
  for (const r of ramps) {
    // stunt ramps near enough to reach: orange, green once jumped
    if (dist2(r.x, r.z, px, pz) < 170 * 170) blip(r.x, r.z, save.jumps.includes(r.id) ? '#7dffa5' : '#ff8a1f', '^');
  }
  if (heli.on) blip(heli.x, heli.z, Math.floor(performance.now() / 200) % 2 ? '#ffffff' : '#3f7bff', '', true);
  for (const v of vehicles) {
    if (v.siren && !v.dead) blip(v.x, v.z, Math.floor(performance.now() / 200) % 2 ? '#ff3344' : '#3f7bff');
  }
  if (player.lastCar && player.lastCar !== player.car && !player.lastCar.dead) blip(player.lastCar.x, player.lastCar.z, '#e8e8e8');
  if (mission.blip) blip(mission.blip[0], mission.blip[1], jobColor(), mission.active ? (mission.def === FERRY ? String(mission.step) : '') : 'J', true);
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

// ---------- the whole island (M) ----------
const bigMap = { open: false, t: 0, base: null, scale: 1 };
const DISTRICT_FILL = { downtown: '#3d4666', beach: '#6a4f68', industrial: '#57503f', suburb: '#2d3344', park: '#2f6b3c' };
function bigMapBase(size) {
  const base = mkCanvas(size);
  const g = base.getContext('2d');
  const span = WORLD + 2 * SHORE + 60;
  const k = size / span;
  bigMap.scale = k;
  g.fillStyle = '#14506a';
  g.fillRect(0, 0, size, size);
  g.translate(size / 2, size / 2);
  g.scale(k, k);
  g.fillStyle = '#b9a877';
  g.fillRect(-HALF - SHORE, -HALF - SHORE, 2 * (HALF + SHORE), 2 * (HALF + SHORE));
  g.fillStyle = '#7b7e88';      // the Rustport dock apron and quay
  g.fillRect(DOCK.x0, DOCK.z0, DOCK.x1 - DOCK.x0, DOCK.z1 - DOCK.z0);
  g.fillStyle = '#6b7182';
  g.fillRect(-HALF, -HALF, WORLD, WORLD);
  const names = {};
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const b = blocks[i][j];
      g.fillStyle = DISTRICT_FILL[b.type];
      g.fillRect(b.x0, b.z0, BLOCK, BLOCK);
      const name = zoneName(b.x0 + BLOCK / 2, b.z0 + BLOCK / 2);
      const sum = names[name] || (names[name] = [0, 0, 0]);
      sum[0] += b.x0 + BLOCK / 2;
      sum[1] += b.z0 + BLOCK / 2;
      sum[2]++;
    }
  }
  // the pier, the ferry and the wheel
  g.fillStyle = '#c0a683';
  g.fillRect(HALF + SHORE - 13, roadC(4) - 4.5, 30, 9);
  g.fillStyle = '#f0d6a7';
  g.fillRect(HALF + SHORE + 17, roadC(4) - 22, 14, 44);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '800 italic 15px "Segoe UI", Arial';
  for (const name of Object.keys(names)) {
    if (name === 'Verde Park') continue;
    const [sx, sz, count] = names[name];
    const x = size / 2 + (sx / count) * k;
    let y = size / 2 + (sz / count) * k;
    const upright = name !== 'Sol Beach';
    if (upright) {
      // slide the name off any blip it would sit on
      const wide = g.measureText(name.toUpperCase()).width / 2 + 13;
      const pins = Object.values(PLACES).concat(PROPERTIES.map((p) => p.at)).map((p) => [size / 2 + p[0] * k, size / 2 + p[1] * k]);
      const clear = (yy) => !pins.some((p) => Math.abs(p[0] - x) < wide && Math.abs(p[1] - yy) < 17);
      y += [0, -20, 20, -38, 38].find((shift) => clear(y + shift)) || 0;
    }
    g.save();
    g.translate(x, y);
    if (!upright) g.rotate(-Math.PI / 2);
    g.fillStyle = 'rgba(8,10,24,.55)';
    g.fillText(name.toUpperCase(), 1, 2);
    g.fillStyle = 'rgba(255,255,255,.82)';
    g.fillText(name.toUpperCase(), 0, 0);
    g.restore();
  }
  return base;
}

function drawBigMap() {
  const canvasEl = $('bigmap-canvas');
  const size = canvasEl.width;
  const g = canvasEl.getContext('2d');
  if (!bigMap.base) bigMap.base = bigMapBase(size);
  const k = bigMap.scale;
  const sx = (x) => size / 2 + x * k;
  g.drawImage(bigMap.base, 0, 0);
  if (route.points.length > 1) {
    g.strokeStyle = jobColor();
    g.lineWidth = 4;
    g.lineJoin = 'round';
    g.beginPath();
    route.points.forEach((p, n) => (n ? g.lineTo(sx(p[0]), sx(p[1])) : g.moveTo(sx(p[0]), sx(p[1]))));
    g.stroke();
  }
  const dot = (x, z, color, text, r) => {
    g.fillStyle = '#0b0d18';
    g.beginPath();
    g.arc(sx(x), sx(z), (r || 10) + 2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = color;
    g.beginPath();
    g.arc(sx(x), sx(z), r || 10, 0, Math.PI * 2);
    g.fill();
    if (text) {
      g.fillStyle = '#0b0d18';
      g.font = 'bold 13px "Segoe UI", Arial';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, sx(x), sx(z) + 0.5);
    }
  };
  dot(PLACES.garage[0], PLACES.garage[1], '#57ff9a', 'R');
  dot(PLACES.tune[0], PLACES.tune[1], '#3fe0ff', 'T');
  dot(PLACES.ammo[0], PLACES.ammo[1], '#ff8a3f', 'A');
  dot(PLACES.hospital[0], PLACES.hospital[1], '#ff6b78', 'H');
  dot(PLACES.police[0], PLACES.police[1], '#6fa2ff', 'P');
  for (const p of PROPERTIES) dot(p.at[0], p.at[1], owned(p) ? '#7dffa5' : '#d6dbe6', '$');
  dot(PLACES.wheel[0], PLACES.wheel[1], '#ff8fd0', 'W');
  for (const id of save.spotted) if (!save.packages.includes(id)) dot(packageSpots[id][0], packageSpots[id][1], '#c58bff', '?', 8);
  for (const r of ramps) dot(r.x, r.z, save.jumps.includes(r.id) ? '#7dffa5' : '#ff8a1f', '^', 7);
  for (const v of vehicles) {
    if (v.siren && !v.dead) dot(v.x, v.z, '#ff3344', '', 4);
  }
  if (mission.blip) dot(mission.blip[0], mission.blip[1], jobColor(), mission.active ? '' : 'J', mission.active ? 8 : 11);

  const [px, pz] = focus();
  const heading = player.car ? player.car.h : player.h;
  g.save();
  g.translate(sx(px), sx(pz));
  g.rotate(Math.PI - heading);
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#0b0d18';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, -11);
  g.lineTo(7.5, 8);
  g.lineTo(0, 4);
  g.lineTo(-7.5, 8);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();

  const have = PROPERTIES.filter(owned).length;
  setText('bigmap-note', clockText() + '  ·  You are the white arrow in ' + zoneName(px, pz) + '  ·  Packages ' + save.packages.length + ' / ' + packageSpots.length + '  ·  Property ' + have + ' / ' + PROPERTIES.length + '  ·  M closes the map');
}

function toggleBigMap(open) {
  bigMap.open = open === undefined ? !bigMap.open : open;
  $('bigmap').classList.toggle('show', bigMap.open);
  if (bigMap.open) drawBigMap();
}

// ---------- HUD refresh ----------
let lastZone = '';
const weaponShown = { text: 'Pistol  48', until: 0 };
function clockText() {
  const hours = Math.floor(tod);
  const minutes = Math.floor((tod - hours) * 60);
  return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
}
function updateHud() {
  setText('money', '$' + save.money.toLocaleString('en-US'));
  $('hp').style.width = clamp(player.hp, 0, 100) + '%';
  // the weapon line shows for a few seconds after it changes (drawn, fired, bought), and when ammo runs low
  const weaponText = player.gun && player.ammo > 0 ? 'Pistol  ' + player.ammo : 'Fists';
  if (weaponText !== weaponShown.text) {
    weaponShown.text = weaponText;
    weaponShown.until = performance.now() + 5000;
  }
  setText('weapon', weaponText);
  const lowAmmo = player.gun && player.ammo > 0 && player.ammo <= 12;
  $('weapon').classList.toggle('show', !player.car && (performance.now() < weaponShown.until || lowAmmo));
  $('stars').classList.toggle('idle', wanted.stars === 0);
  if (bigMap.open && (bigMap.t -= 1) <= 0) {
    bigMap.t = 12;                // redraw a few times a second
    drawBigMap();
  }

  const flashing = wanted.stars > 0 && wanted.evade > 2 && Math.floor(performance.now() / 300) % 2 === 0;
  const starState = wanted.stars + (flashing ? 'f' : '');
  if (hudCache.stars !== starState) {
    hudCache.stars = starState;
    const els = $('stars').children;
    for (let k = 0; k < 5; k++) els[k].className = k < wanted.stars ? (flashing ? 'on dim' : 'on') : '';
  }

  // out of their sight: a bar under the stars fills up, and when it is full they are lost
  const hiding = wanted.stars > 0 && wanted.evade > 0.4;
  $('evade').classList.toggle('show', hiding);
  if (hiding) $('evade-bar').style.width = Math.round(clamp(wanted.evade / evadeNeed(), 0, 1) * 100) + '%';

  const car = player.car;
  const rush = car ? clamp((Math.hypot(car.vx, car.vz) - SPEED_FEEL.rushFrom) / (SPEED_FEEL.rushFull - SPEED_FEEL.rushFrom), 0, 1) : 0;
  const rushShown = Math.round(rush * 20) / 20;
  if (hudCache.rush !== rushShown) {
    hudCache.rush = rushShown;
    $('rush').style.opacity = rushShown;
  }
  if (car) {
    const kmh = Math.round(Math.hypot(car.vx, car.vz) * 3.6);
    setText('speed', kmh + ' km/h');
    $('carhp').style.width = clamp((car.hp / car.t.hp) * 100, 0, 100) + '%';
    const tank = Math.round(nitro.tank * 50) * 2;
    if (hudCache.nitro !== tank) {
      hudCache.nitro = tank;
      $('nitro').style.width = tank + '%';
    }
  }
  $('drive').classList.toggle('show', !!car);
  $('drive').classList.toggle('boost', !!car && nitro.on);
  $('cross').classList.toggle('show', player.gun && player.ammo > 0);

  if (mission.active && mission.timer >= 0) {
    const secs = Math.ceil(mission.timer);
    setText('timer', Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0'));
    $('timer').classList.add('show');
    $('timer').classList.toggle('low', secs <= 10);
  } else {
    $('timer').classList.remove('show');
  }

  // until the first job has been started, the top pill says what to do next
  const guide = !mission.active && save.mission === 0;
  if (guide) setText('objective', car ? 'Drive into the yellow beam to meet Mo' : 'Get into the red car ahead  [F]');
  if (!mission.active) $('objective').classList.toggle('show', guide);

  // arrow and distance to the current target, relative to where the camera looks
  const [px, pz] = focus();
  const target = mission.blip;
  const far = target ? Math.hypot(target[0] - px, target[1] - pz) : 0;
  if (target && far > 14) {
    const rel = wrapPi(Math.atan2(target[0] - px, target[1] - pz) - cam.yaw);
    $('way-arrow').style.transform = 'rotate(' + (-rel).toFixed(2) + 'rad)';
    setText('way-dist', (mission.active ? '' : 'JOB  ') + Math.round(far / 5) * 5 + ' m');
    $('way').className = mission.active ? 'show goal' : 'show';
  } else {
    $('way').className = '';
  }

  const zone = zoneName(px, pz);
  if (zone !== lastZone) {
    lastZone = zone;
    toast('zone', zone, 3.5);
  }
}
