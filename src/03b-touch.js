// =====================================================================
// NEON COAST - part 3b: touch play for phones and tablets
// =====================================================================
// Keyboard-and-mouse players never reach this code: `touch.on` stays false until a touch screen is the main
// pointer, or a finger lands on the page. The buttons press the same keys the keyboard does (keyAction in
// part 4), the stick feeds touch.sx / touch.sy, and dragging the view turns the camera as the mouse would.

// ---------- words: hints name keys; on a touch screen they name the buttons ----------
const TOUCH_WORDS = [
  [/\[F\]/g, () => (player.car ? '[EXIT]' : '[CAR]')],
  [/\[Shift\] sprints/g, 'full stick sprints'],
  [/\[Space\]/g, '[HAND BRAKE]'],
  [/\[Shift\] fires the nitro/g, 'the NITRO button fires it'],
  [/\[J\] another kind/g, 'the pause menu has other kinds'],
  [/\[J\] an odd job instead/g, 'the pause menu has odd jobs'],
  [/\[J\] back to the story job/g, 'the pause menu goes back to the story job'],
  [/Odd jobs are open: \[J\]\./g, 'Odd jobs are open: see the pause menu.'],
  [/\[J\] picks the kind/g, 'the pause menu picks the kind'],
  [/Press E\b/g, 'Tap USE'],
  [/Press T\b/g, 'Tap CAB'],
  [/press T\b/g, 'tap CAB'],
  [/\bT ends the shift/g, 'CAB ends the shift'],
  [/Press G to take another shift\./g, 'The pause menu has another shift.'],
  [/press F\b/g, 'tap CAR'],
  [/^F: take/, 'Tap CAR to take'],
  [/\bF gets off\./g, 'GET OFF ends the ride.'],
  [/M closes the map/g, 'tap to close'],
  [/M shows the whole map\./g, 'Tap the round map for the whole island.'],
  [/W A S D to walk, mouse to look around\./g, 'Left thumb walks. Drag the view to look around.'],
];
function say(text) {
  if (!touch.on || !text) return text;
  for (const [find, put] of TOUCH_WORDS) text = text.replace(find, put);
  return text;
}

// ---------- switching it on ----------
const pad = $('pad');
const stickEl = $('stick');
const knobEl = stickEl.firstElementChild;
const touchPoints = new Map();    // pointer id -> { kind: 'stick' | 'look' | 'btn', el, aim, x, y }
let padMode = '';
let gameReady = false;            // part 4 sets this once the renderer can be resized

function setTouchMode(on) {
  if (touch.on === on) return;
  touch.on = on;
  document.body.classList.toggle('touch', on);
  // district, car and radio names go under the round map at the top: the bottom corners are for thumbs
  if (on) $('bl').appendChild($('br'));
  else $('hud').insertBefore($('br'), $('cross'));
  for (const id in hudCache) delete hudCache[id];   // texts on screen are worded again
  if (!on) {
    releaseTouch();
    padMode = '';
    pad.className = 'for-touch hidden';
  }
  if (gameReady) applySettings();
}

const touchAsked = /[?&]touch=([01])/.exec(location.search);     // ?touch=1 tries the phone layout on a desktop
const coarsePointer = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
if (touchAsked ? touchAsked[1] === '1' : coarsePointer) setTouchMode(true);
if (!touchAsked) window.addEventListener('touchstart', () => setTouchMode(true), { passive: true });
if (coarsePointer && !save.auto16) {
  // a phone starts on Auto graphics (part 4 measures the frame rate and draws what the phone can carry).
  // Release 1.5 started phones on Fast, so a phone that met 1.5 is moved over once; a choice made after
  // that is kept, because the mark is saved with it
  save.quality = 2;
  save.auto16 = 1;
}

// ---------- the stick: it appears under the left thumb wherever that lands ----------
const padUnit = () => clamp(Math.min(window.innerWidth, window.innerHeight) / 100, 3.4, 5.2);   // --u in the style sheet
function inStickZone(x, y) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return w > h ? x < w * 0.45 && y > h * 0.42 : x < w * 0.55 && y > h * 0.55;
}
const stickAt = { x: 0, y: 0 };
function stickStart(x, y) {
  const radius = stickEl.offsetWidth / 2;
  stickAt.x = clamp(x, radius + 4, window.innerWidth - radius - 4);
  stickAt.y = clamp(y, radius + 4, window.innerHeight - radius - 4);
  const homeX = stickEl.offsetLeft + radius;
  const homeY = stickEl.offsetTop + radius;
  stickEl.style.transform = `translate(${stickAt.x - homeX}px, ${stickAt.y - homeY}px)`;
  stickEl.classList.add('down');
  stickMove(x, y);
}
function stickMove(x, y) {
  const reach = 11 * padUnit();
  const dx = x - stickAt.x;
  const dy = y - stickAt.y;
  const len = Math.hypot(dx, dy);
  const pull = Math.min(1, len / reach);
  const out = pull < 0.16 ? 0 : (pull - 0.16) / 0.84;    // a still thumb does not creep
  touch.sx = len ? (dx / len) * out : 0;
  touch.sy = len ? (-dy / len) * out : 0;
  touch.run = pull > 0.93;
  const k = len > reach ? reach / len : 1;
  knobEl.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
}
function stickEnd() {
  touch.sx = 0;
  touch.sy = 0;
  touch.run = false;
  stickEl.classList.remove('down');
  stickEl.style.transform = '';
  knobEl.style.transform = '';
}

// ---------- looking around ----------
function lookBy(dx, dy) {
  if (state !== 'play') return;
  cam.yaw -= dx * 0.0058;
  cam.pitch = clamp(cam.pitch - dy * 0.0042, -1.2, 0.3);
  cam.lastMouse = performance.now();
}

// ---------- buttons ----------
function buttonDown(el) {
  el.classList.add('down');
  if (navigator.vibrate) navigator.vibrate(8);     // a tick under the thumb where the phone can (Android)
  if (el.dataset.hold) keys[el.dataset.hold] = true;
  else if (el.dataset.tap) keyAction(el.dataset.tap);
  else firing = true;
}
function buttonUp(el) {
  el.classList.remove('down');
  if (el.dataset.hold) keys[el.dataset.hold] = false;
  else if (!el.dataset.tap) firing = false;
}
function releaseButtons() {
  for (const [id, point] of touchPoints) {
    if (point.kind !== 'btn') continue;
    buttonUp(point.el);
    touchPoints.delete(id);
  }
}
function releaseTouch() {
  releaseButtons();
  touchPoints.clear();
  stickEnd();
}
const hasPoint = (kind) => {
  for (const point of touchPoints.values()) if (point.kind === kind) return true;
  return false;
};

canvas.addEventListener('pointerdown', (e) => {
  if (!touch.on || state !== 'play') return;
  e.preventDefault();
  if (bigMap.open) {
    toggleBigMap(false);
    return;
  }
  if (touchPoints.has(e.pointerId)) return;
  let kind = null;
  const stickShown = !(player.car && save.steer === 1);       // Arrows steer the car instead
  if (ride.t <= 0 && stickShown && !hasPoint('stick') && inStickZone(e.clientX, e.clientY)) kind = 'stick';
  else if (!hasPoint('look')) kind = 'look';
  if (!kind) return;
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch (err) {
    // the finger is followed anyway
  }
  touchPoints.set(e.pointerId, { kind, x: e.clientX, y: e.clientY });
  if (kind === 'stick') stickStart(e.clientX, e.clientY);
});
for (const el of pad.querySelectorAll('.tb')) {
  el.addEventListener('pointerdown', (e) => {
    if (!touch.on) return;
    e.preventDefault();
    if (touchPoints.has(e.pointerId)) return;
    try {
      el.setPointerCapture(e.pointerId);
    } catch (err) {
      // as above
    }
    // FIRE doubles as an aiming pad: slide the thumb on it to turn the view while shooting
    touchPoints.set(e.pointerId, { kind: 'btn', el, aim: el.hasAttribute('data-fire'), x: e.clientX, y: e.clientY });
    buttonDown(el);
  });
}
window.addEventListener('pointermove', (e) => {
  const point = touchPoints.get(e.pointerId);
  if (!point) return;
  if (point.kind === 'stick') stickMove(e.clientX, e.clientY);
  else if (point.kind === 'look' || point.aim) lookBy(e.clientX - point.x, e.clientY - point.y);
  point.x = e.clientX;
  point.y = e.clientY;
});
function pointEnd(e) {
  const point = touchPoints.get(e.pointerId);
  if (!point) return;
  touchPoints.delete(e.pointerId);
  if (point.kind === 'stick') stickEnd();
  else if (point.kind === 'btn') buttonUp(point.el);
}
window.addEventListener('pointerup', pointEnd);
window.addEventListener('pointercancel', pointEnd);

// no scrolling, pinch zoom, long-press menu or second-hand mouse events over the game
for (const el of [canvas, pad]) {
  for (const type of ['touchstart', 'touchmove', 'touchend']) {
    el.addEventListener(type, (e) => {
      if (touch.on && e.cancelable) e.preventDefault();
    }, { passive: false });
  }
  el.addEventListener('contextmenu', (e) => {
    if (touch.on) e.preventDefault();
  });
}
document.addEventListener('gesturestart', (e) => {
  if (touch.on) e.preventDefault();
});

// the round map opens the whole island; a tap anywhere closes it
$('map').addEventListener('click', () => {
  if (touch.on && state === 'play') toggleBigMap();
});
$('bigmap').addEventListener('click', () => {
  if (touch.on) toggleBigMap(false);
});

// ---------- which buttons are on screen: on foot, in a car, on the Sol Wheel ----------
const padCache = {};
function padSet(id, on, label) {
  const key = (on ? '1' : '0') + (label || '');
  if (padCache[id] === key) return;
  padCache[id] = key;
  const el = $(id);
  el.classList.toggle('on', on);
  if (label) el.textContent = label;
}
function refreshPad() {
  if (!touch.on) return;
  const mode = state !== 'play' ? '' : ride.t > 0 ? 'ride' : player.car ? (save.steer === 1 ? 'car arrows' : 'car') : 'foot';
  if (mode !== padMode) {
    // buttons that leave the screen let go of their keys; the stick stays under the thumb from foot to car
    if (mode === 'car' || mode === 'foot') releaseButtons();
    else releaseTouch();                // also when the stick leaves the screen for the arrows
    padMode = mode;
    pad.className = 'for-touch ' + (mode || 'hidden');
  }
  if (!mode) return;
  const armed = player.gun && player.ammo > 0;
  padSet('tb-fire', true, armed ? 'FIRE' : 'PUNCH');
  padSet('tb-carfire', !!player.car && armed);
  padSet('tb-cab', !!player.car && player.car.type === 'taxi');
  padSet('tb-nitro', !!player.car && nitro.tank > NITRO.min);      // there only while there is nitro to burn (2.2)
  padSet('tb-radio', !!player.car && wanted.stars === 0);          // nobody changes the station with the police behind (2.2)
  padSet('tb-car', mode === 'foot' && carInReach());        // bright when a car is close enough to take
  padSet('tb-use', mode === 'foot' && (wheelGate.inside || PROPERTIES.some((p) => p.marker.inside)));
}

function carInReach() {
  for (const v of vehicles) {
    if (!v.dead && v.hp > 0 && dist2(v.x, v.z, player.x, player.z) < 18) return true;
  }
  return false;
}

// ---------- aiming with a thumb ----------
// Each shot on a touch screen first turns the view onto the nearest target that is already close to the
// crosshair: within 0.4 rad and 70 m, a police car before anything else. A mouse needs none of this.
function aimAssist() {
  const [px, pz] = focus();
  const eye = player.car ? 1.6 : 1.55 + player.y;      // the height the camera looks along (updateCamera)
  const shoulder = player.car ? 0 : 0.55;              // on foot the view sits over the right shoulder
  let best = null;
  let bestScore = 0.4;
  const consider = (x, y, z, bonus, skip) => {
    if (skip) return;
    const dx = x - px;
    const dz = z - pz;
    const far = Math.hypot(dx, dz);
    if (far < 2.5 || far > 70) return;
    const off = Math.abs(wrapPi(Math.atan2(dx, dz) - cam.yaw));
    if (off - bonus < bestScore) {
      bestScore = off - bonus;
      const rough = Math.atan2(dx, dz);
      const ox = px - Math.cos(rough) * shoulder;      // where the line of sight passes the player
      const oz = pz + Math.sin(rough) * shoulder;
      best = { yaw: Math.atan2(x - ox, z - oz), pitch: Math.atan2(y - eye, far) };
    }
  };
  // parked cars are left alone (one of them is yours), and with stars on you only the police count
  for (const v of vehicles) consider(v.x, 0.8, v.z, v.driver === 'cop' ? 0.25 : 0, v === player.car || v.dead || !v.driver || (v.driver !== 'cop' && wanted.stars > 0));
  for (const ped of peds) consider(ped.x, 1.0, ped.z, 0, ped.state === 'down' || wanted.stars > 0);
  if (!best) return false;
  cam.yaw = best.yaw;
  cam.pitch = clamp(best.pitch, -1.2, 0.3);
  cam.lastMouse = performance.now();
  return true;
}

// ---------- full screen ----------
const standalone = navigator.standalone === true
  || !!(window.matchMedia && (window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches));
function goFullscreen() {
  // Android only: the iPhone has no full screen for web pages (the home-screen icon gives it instead)
  if (!touch.on || standalone || !/Android/i.test(navigator.userAgent)) return;
  const root = document.documentElement;
  if (!root.requestFullscreen || document.fullscreenElement) return;
  try {
    const asked = root.requestFullscreen({ navigationUI: 'hide' });
    if (asked && asked.catch) asked.catch(() => {});
  } catch (err) {
    // the game plays in the browser tab
  }
}
window.addEventListener('orientationchange', () => setTimeout(() => gameReady && resize(), 300));

// ---------- an icon on the home screen, and play without a network after the first visit ----------
// Only on a web address. Opened as a file, the page asks for nothing and stays one self-contained file.
const onWeb = /^https?:$/.test(location.protocol);
if (standalone || !onWeb) $('installnote').classList.add('hidden');
if (onWeb) {
  for (const [rel, href] of [['manifest', 'manifest.webmanifest'], ['apple-touch-icon', 'icons/apple-touch-icon.png']]) {
    const link = document.createElement('link');
    link.rel = rel;
    link.href = href;
    document.head.appendChild(link);
  }
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || local)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
