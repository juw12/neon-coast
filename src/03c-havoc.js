// =====================================================================
// NEON COAST - part 3c: havoc. A street that breaks, ramps to jump, nitro
// =====================================================================
// 2.0. Nothing on the street stops a car: cones, bins, news boxes, crates, hydrants, barrels and lamp posts are
// knocked flying, and what the player's car knocks over pays into the style chain. Ramps on the parking strips
// throw a car over the next crossing. Tricks, smashes and jumps fill a nitro tank. A hard hit turns a car round.

const GRAVITY = 15;                // m/s2 on cars and debris in the air
const PROP_HIT = 2.5;              // m/s: slower than this a car only tips a prop over, for no pay
const PROP_BACK = 150;             // m: what was knocked over stands again once the player is this far away
// s of play: a barrel that went up stands again only after this long as well (since 2.0.1). Until then one
// shot at the six barrels on the Rustport dock paid $1,505 every time the player came back from 150 m away.
const BARREL_BACK = 600;
// r: radius a car touches, h: height standing, lie: centre height lying, pay: $ into the chain,
// slow: share of its speed the car loses, hz: the sound, trick: counts as a trick (raises the multiplier),
// need: m/s the car must do to knock it over (a lamp post under that speed is not touched, as before 2.0)
const PROP_KINDS = {
  cone: { r: 0.3, h: 0.7, lie: 0.22, pay: 5, slow: 0, hz: 620 },
  bin: { r: 0.36, h: 0.95, lie: 0.32, pay: 10, slow: 0.01, hz: 240 },
  box: { r: 0.36, h: 1.0, lie: 0.23, pay: 10, slow: 0.01, hz: 330 },
  crate: { r: 0.55, h: 0.9, lie: 0.45, pay: 10, slow: 0.02, hz: 180 },
  hydrant: { r: 0.26, h: 0.7, lie: 0.19, pay: 25, slow: 0.03, hz: 150, trick: 'HYDRANT' },
  barrel: { r: 0.4, h: 1.0, lie: 0.38, pay: 40, slow: 0.02, hz: 120, trick: 'BLAST' },
  lamp: { r: 0.22, h: 7, lie: 0.1, pay: 20, slow: 0.07, hz: 90, trick: 'LAMP POST', need: 7 },
};
// a barrel going up: metres, m/s, health, metres; own: the share of that damage the player's car takes from a barrel it set off itself
const BLAST = { reach: 7.5, push: 9, damage: 26, flash: 45, own: 0.4 };
const SPIN = { from: 6, gain: 0.26, max: 4.2, own: 0.3, stun: [0.5, 1.6] };   // a hit harder than `from` m/s turns a car
const LOOSE_MASS = 0.55;           // a car with nobody in it, against 1 for one that is being driven
const RAMP = { len: 9, wid: 4.4, high: 1.7, at: 57, air: 0.4, far: 8, all: 2500 };
const NITRO = { burn: 3.2, acc: 2.1, top: 1.28, min: 0.05, start: 0.5, trick: 0.2, smash: 0.03, jump: 0.15, lens: 5 };
const nitro = { tank: NITRO.start, on: false, hissT: 0, over: false };     // over: still above the car's own top speed
const warp = { t: 0, k: 1 };       // a moment of slow motion: seconds left (real time) and the speed of the game in it
const boom = { t: 0, shown: -1 };

const RH = seeded(8086);           // its own stream: the city of 1.9 stays where it was
const props = [];
const propGrid = new Map();        // standing props by 16 m square
const fallen = [];                 // props in the air, lying down or gone
const jets = [];                   // broken hydrants: { x, z, t }
const ramps = [];
const kerbTaken = new Set();       // 'i,j,d' sides of a street kept clear of parked cars: a ramp or road works is there
const worksAt = [];                // road works: { x, z }
const propDummy = new T.Object3D();
const lampAxis = new T.Vector3();
const propMesh = {};

// ---------- where things stand ----------
// job stops, shops and front doors: nothing is put in their way
const keepClear = [[PLACES.home[0] - 2, PLACES.home[1] + 50], ...Object.values(PLACES), ...PROPERTIES.map((p) => p.at)];      // first: where a new game starts (part 4)
for (const def of MISSIONS.concat([FERRY])) {
  for (const step of def.steps || []) if (step.at) keepClear.push(step.at);
  if (def.at) keepClear.push(def.at);
}
const nearPlace = (x, z, r) => keepClear.some((p) => dist2(p[0], p[1], x, z) < r * r);
const gridKey = (x, z) => (Math.floor((x + 640) / 16) << 8) | Math.floor((z + 640) / 16);

function addProp(kind, x, z, extra) {
  const p = Object.assign({ kind, k: PROP_KINDS[kind], n: 0, x, z, hx: x, hz: z, y: 0, vx: 0, vy: 0, vz: 0,
    rx: 0, ry: RH() * 6.28, rz: 0, wx: 0, wz: 0, st: 0, t: 0, fuse: 0, by: false, lamp: -1, dx: 0, dz: 1, a: 0, w: 0 }, extra);
  props.push(p);
  return p;
}

function addRamp(x, z, h) {
  ramps.push({ id: ramps.length, x, z, h, fx: Math.sin(h), fz: Math.cos(h), len: RAMP.len, wid: RAMP.wid, high: RAMP.high });
}
// [road i, road j, direction]: on the right-hand parking strip, RAMP.at metres after that crossing, so a quick car
// lands in the next one. Both street sides are kept clear of parked cars: the run-up and the landing.
const RAMP_SPOTS = [[9, 4, 3], [10, 6, 1], [5, 5, 0], [4, 3, 1], [2, 6, 2], [7, 8, 0], [1, 1, 1], [6, 1, 2], [3, 9, 0], [8, 2, 3], [0, 7, 3]];
for (const [i, j, d] of RAMP_SPOTS) {
  const rd = (d + 1) & 3;
  addRamp(roadC(i) + DX[d] * RAMP.at + DX[rd] * PARK, roadC(j) + DZ[d] * RAMP.at + DZ[rd] * PARK, headingOf(d));
  kerbTaken.add(i + ',' + j + ',' + d);
  kerbTaken.add(i + DX[d] + ',' + (j + DZ[d]) + ',' + d);
}
addRamp(-300, 455, Math.PI / 2);   // one on the Rustport dock apron, heading east over a row of barrels

const rampSpot = { u: 0, w: 0 };   // where on the ramp the last rampAt() was: metres along it and across it
function rampAt(x, z) {
  for (const r of ramps) {
    const dx = x - r.x;
    const dz = z - r.z;
    if (Math.abs(dx) > 6 || Math.abs(dz) > 6) continue;
    const u = dx * r.fx + dz * r.fz;
    const w = dx * r.fz - dz * r.fx;
    if (Math.abs(u) > r.len / 2 || Math.abs(w) > r.wid / 2) continue;
    rampSpot.u = u;
    rampSpot.w = w;
    return r;
  }
  return null;
}
function rampHeight(x, z) {
  const r = rampAt(x, z);
  return r ? r.high * (rampSpot.u / r.len + 0.5) : 0;
}
// is this spot at the kerb taken by a ramp or by road works? (parked cars and cab fares keep off it)
function kerbBusy(x, z) {
  return ramps.some((r) => Math.abs(x - r.x) < 13 && Math.abs(z - r.z) < 13) || worksAt.some((w) => dist2(w.x, w.z, x, z) < 100);
}

(function placeProps() {
  // 1. along the kerb of every block, by district
  const MIX = {
    downtown: ['bin', 'box', 'box', 'hydrant', 'bin', 'cone'],
    beach: ['bin', 'box', 'hydrant', 'bin'],
    suburb: ['bin', 'hydrant', 'box', 'bin'],
    industrial: ['crate', 'barrel', 'bin', 'crate', 'hydrant'],
    park: ['bin', 'bin', 'hydrant'],
  };
  const COUNT = { downtown: 5, beach: 4, suburb: 3, industrial: 4, park: 3 };
  const BOX_COLORS = ['#2f6fd0', '#d0392f', '#e8b53a', '#2f9d6a'].map((hex) => new T.Color(hex));
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const b = blocks[i][j];
      const count = COUNT[b.type];
      for (let side = 0; side < 4; side++) {
        if (side === 0 && i === N - 1) continue;         // the palm side of the beach road
        for (let k = 0; k < count; k++) {
          const along = 7 + ((k + 0.2 + 0.6 * RH()) * 50) / count;
          const inset = 0.9 + RH() * 0.9;
          const kind = MIX[b.type][Math.floor(RH() * MIX[b.type].length)];
          if (Math.abs(along - BLOCK / 2) < 3) continue;   // the lamp post half way along
          const x = side === 0 ? b.x0 + inset : side === 1 ? b.x1 - inset : b.x0 + along;
          const z = side === 2 ? b.z0 + inset : side === 3 ? b.z1 - inset : b.z0 + along;
          if (nearPlace(x, z, 6)) continue;
          if (b.circles.some((c) => dist2(c.x, c.z, x, z) < 2.2 * 2.2)) continue;     // not against a street tree: a car that comes for it would hit the trunk
          addProp(kind, x, z, kind === 'box' ? { color: BOX_COLORS[Math.floor(RH() * BOX_COLORS.length)] } : null);
        }
      }
    }
  }
  // 2. a line of cones down the middle of about one street in five, and road works on some parking strips.
  // (The avenue through the middle of the map and the kerb outside the first home stay clear: the checks in
  // test/ measure crashes and near misses there, and a new player's first metres are there.)
  const quiet = (i, j, d) => (d === 1 && i === 5 && j >= 3 && j <= 6) || (d === 1 && i === 9 && j >= 3 && j <= 5);
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      for (const d of [0, 1]) {
        if (i + DX[d] > N || j + DZ[d] > N) continue;
        const roll = RH();
        const works = RH();
        const from = 24 + RH() * 8;
        if (quiet(i, j, d)) continue;
        if (roll < 0.22) {
          for (let s = from; s < from + 30; s += 4.3) {
            if (!nearPlace(roadC(i) + DX[d] * s, roadC(j) + DZ[d] * s, 9)) addProp('cone', roadC(i) + DX[d] * s, roadC(j) + DZ[d] * s);
          }
        }
        if (works > 0.085) continue;
        const way = works < 0.0425 ? d : d + 2;            // which side of the street
        const key = way === d ? i + ',' + j + ',' + d : i + DX[d] + ',' + (j + DZ[d]) + ',' + way;
        if (kerbTaken.has(key)) continue;
        const rd = (way + 1) & 3;
        const mid = way === d ? from + 14 : CELL - from - 14;
        const ox = roadC(i) + DX[d] * mid;
        const oz = roadC(j) + DZ[d] * mid;
        const cx = ox + DX[rd] * PARK;
        const cz = oz + DZ[rd] * PARK;
        if (nearPlace(cx, cz, 16)) continue;
        kerbTaken.add(key);
        worksAt.push({ x: cx, z: cz });
        for (let s = -6; s <= 6; s += 3) addProp('cone', cx + DX[d] * s - DX[rd] * 1.7, cz + DZ[d] * s - DZ[rd] * 1.7);
        for (const s of [-6, 6]) addProp('cone', cx + DX[d] * s, cz + DZ[d] * s);
        for (let s = -3.6; s <= 3.6; s += 2.4) addProp('crate', cx + DX[d] * (s + RH() - 0.5) + DX[rd] * (RH() - 0.5) * 0.8, cz + DZ[d] * (s + RH() - 0.5) + DZ[rd] * (RH() - 0.5) * 0.8);
      }
    }
  }
  // 3. the dock apron: stacks of crates and barrels, and a row of barrels under the ramp's flight
  for (let k = 0; k < 11; k++) {
    const cx = DOCK.x0 + 22 + k * 28 + RH() * 8;
    const cz = DOCK.z0 + 9 + RH() * 30;
    if (Math.abs(cx + 290) < 45 && Math.abs(cz - 455) < 9) continue;      // the ramp, its run-up and its landing
    const barrels = 2 + Math.floor(RH() * 2);
    for (let n = 0; n < barrels + 3; n++) {
      addProp(n < barrels ? 'barrel' : 'crate', cx + (RH() - 0.5) * 4.4, cz + (RH() - 0.5) * 4.4);
    }
  }
  for (let n = 0; n < 4; n++) addProp('barrel', -287, 452 + n * 2);
  // 4. every street lamp can be knocked over
  lamps.forEach((l, n) => addProp('lamp', l.x, l.z, { lamp: n }));

  // one instanced mesh for each kind; a lamp post is three instances of the meshes part 1 made
  const GEO = {
    cone: new T.ConeGeometry(0.3, 0.7, 8),
    bin: new T.CylinderGeometry(0.34, 0.28, 0.95, 8),
    box: new T.BoxGeometry(0.55, 1.0, 0.45),
    crate: new T.BoxGeometry(0.95, 0.9, 0.95),
    hydrant: new T.CylinderGeometry(0.15, 0.2, 0.7, 8),
    barrel: new T.CylinderGeometry(0.38, 0.38, 1.0, 10),
  };
  const MAT = { cone: mat('#ff7a1a'), bin: mat('#2f6b55'), box: mat('#ffffff'), crate: mat('#a07a4a'), hydrant: mat('#d43a2f'), barrel: mat('#e2452a') };
  for (const kind in GEO) {
    const list = props.filter((p) => p.kind === kind);
    list.forEach((p, n) => (p.n = n));
    propMesh[kind] = instanced(GEO[kind], MAT[kind], list, (d, p) => {
      d.position.set(p.x, p.k.h / 2, p.z);
      d.rotation.y = p.ry;
    });
  }
  for (const p of props) propGrid.set(gridKey(p.x, p.z), (propGrid.get(gridKey(p.x, p.z)) || []).concat(p));
})();

(function buildRamps() {
  // a wedge: low end at -z, tall end at +z (the way a car's heading is measured)
  const w = RAMP.wid / 2;
  const l = RAMP.len / 2;
  const H = RAMP.high;
  const quad = (a, b, c, d) => [...a, ...b, ...c, ...a, ...c, ...d];
  const A = [-w, 0, -l];
  const B = [w, 0, -l];
  const C = [w, 0, l];
  const D = [-w, 0, l];
  const E = [-w, H, l];
  const F = [w, H, l];
  const body = new T.BufferGeometry();
  body.setAttribute('position', new T.Float32BufferAttribute([...quad(D, C, F, E), ...A, ...D, ...E, ...B, ...F, ...C], 3));
  body.computeVertexNormals();
  const top = new T.BufferGeometry();
  top.setAttribute('position', new T.Float32BufferAttribute(quad(A, B, F, E), 3));
  top.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
  top.computeVertexNormals();
  // the deck: dark, with arrows pointing up it
  const canvasEl = mkCanvas(128, 256);
  const g = canvasEl.getContext('2d');
  g.fillStyle = '#2a2d36';
  g.fillRect(0, 0, 128, 256);
  g.strokeStyle = '#ffd23f';
  g.lineWidth = 14;
  for (let k = 0; k < 4; k++) {
    g.beginPath();
    g.moveTo(18, 236 - k * 62);
    g.lineTo(64, 196 - k * 62);
    g.lineTo(110, 236 - k * 62);
    g.stroke();
  }
  const side = new T.MeshLambertMaterial({ color: '#ff8a1f', side: T.DoubleSide });
  const deck = new T.MeshLambertMaterial({ map: new T.CanvasTexture(canvasEl), side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const place = (d, r) => {
    d.position.set(r.x, 0.02, r.z);
    d.rotation.y = r.h;
  };
  instanced(body, side, ramps, place);
  instanced(top, deck, ramps, place);
  // two bright rails up the edges, so a ramp is seen at night and from a distance
  const rails = [];
  for (const r of ramps) for (const s of [-1, 1]) rails.push({ r, s });
  const slope = Math.atan2(H, RAMP.len);
  instanced(boxGeo, glowMat('#ffe14f'), rails, (d, q) => {
    d.rotation.order = 'YXZ';
    d.position.set(q.r.x + q.r.fz * w * q.s, H / 2 + 0.1, q.r.z - q.r.fx * w * q.s);
    d.rotation.set(-slope, q.r.h, 0);
    d.scale.set(0.14, 0.14, Math.hypot(RAMP.len, H));
  });
})();

// ---------- props: drawing ----------
function placeProp(p) {
  if (p.kind === 'lamp') return placeLamp(p);
  const d = propDummy;
  d.position.set(p.x, p.st === 3 ? -50 : p.st === 2 ? p.k.lie : p.y + p.k.h / 2, p.z);
  d.rotation.set(p.st ? p.rx : 0, p.st ? 0 : p.ry, p.st ? p.rz : 0);
  d.scale.set(1, 1, 1);
  d.updateMatrix();
  propMesh[p.kind].setMatrixAt(p.n, d.matrix);
  propMesh[p.kind].instanceMatrix.needsUpdate = true;
}
// a lamp post falls the way it was hit, about its foot; its pool of light goes out
function placeLamp(p) {
  const d = propDummy;
  const s = Math.sin(p.a);
  const c = Math.cos(p.a);
  lampAxis.set(p.dz, 0, -p.dx);
  d.quaternion.setFromAxisAngle(lampAxis, p.a);
  d.scale.set(1, 1, 1);
  d.position.set(p.x + p.dx * s * 3.5, c * 3.5 + s * 0.12, p.z + p.dz * s * 3.5);
  d.updateMatrix();
  lampMesh.pole.setMatrixAt(p.lamp, d.matrix);
  d.scale.set(0.9, 0.22, 0.9);
  d.position.set(p.x + p.dx * s * 7.05, c * 7.05 + s * 0.12, p.z + p.dz * s * 7.05);
  d.updateMatrix();
  lampMesh.head.setMatrixAt(p.lamp, d.matrix);
  d.rotation.set(0, 0, 0);
  d.scale.setScalar(p.st ? 0.001 : 1);
  d.position.set(p.x, 0.09, p.z);
  d.updateMatrix();
  lampMesh.glow.setMatrixAt(p.lamp, d.matrix);
  lampMesh.pole.instanceMatrix.needsUpdate = lampMesh.head.instanceMatrix.needsUpdate = lampMesh.glow.instanceMatrix.needsUpdate = true;
}

// how loud something at (x, z) is for the player: 1 beside it, 0 from `reach` metres
function heard(x, z, reach) {
  const [px, pz] = focus();
  return clamp(1 - Math.hypot(x - px, z - pz) / reach, 0, 1);
}

// ---------- props: knocked over ----------
// a tip said once (what breaks, what a ramp is) waits until the hint line is free: it never takes the line
// from a job, a fare or the police
const lineFree = () => !$('hint').classList.contains('show');

function paySmash(p) {
  if (style.crashT > 0 || state !== 'play') return;      // ploughing on after a crash is not style
  save.smashed = (save.smashed || 0) + 1;
  if (p.k.trick) styleTrick(p.k.trick, p.k.pay);
  else styleSmash(p.k.pay);
  nitroGain(NITRO.smash);
  if (!(save.havocTold & 1) && !intro.on && lineFree()) {
    save.havocTold |= 1;
    persist();
    hint('Whatever stands on the street can be knocked over, and pays. Tricks, smashes and jumps fill the nitro: [Shift] fires the nitro.', 8);
  }
}

function knockProp(p, vx, vz, byPlayer) {
  if (p.st !== 0) return false;
  const speed = Math.hypot(vx, vz);
  if (speed < (p.k.need || 0.5)) return false;
  const cell = propGrid.get(gridKey(p.hx, p.hz));
  cell.splice(cell.indexOf(p), 1);
  fallen.push(p);
  p.st = 1;
  p.t = 0;
  p.by = !!byPlayer;
  const loud = heard(p.x, p.z, 70);
  if (p.kind === 'lamp') {
    p.dx = vx / speed;
    p.dz = vz / speed;
    p.a = 0;
    p.w = 0.8 + speed * 0.1;
    if (loud > 0) for (let k = 0; k < 8; k++) puff(p.x, 6.9, p.z, rand(-3, 3), rand(0, 4), rand(-3, 3), 0.5, 1, 0.85, 0.5, 9);
  } else {
    p.vx = vx * rand(0.85, 1.25) + rand(-1.5, 1.5);
    p.vz = vz * rand(0.85, 1.25) + rand(-1.5, 1.5);
    p.vy = rand(2.5, 4.5) + Math.min(6, speed * 0.14);
    p.wx = rand(-9, 9);
    p.wz = rand(-9, 9);
    p.rx = p.rz = 0;
    if (p.kind === 'barrel') p.fuse = rand(0.12, 0.3);
    if (p.kind === 'hydrant') jets.push({ x: p.hx, z: p.hz, t: 9 });
    if (loud > 0) for (let k = 0; k < 3; k++) puff(p.x, 0.5, p.z, rand(-2, 2) + vx * 0.3, rand(1, 4), rand(-2, 2) + vz * 0.3, 0.35, 0.9, 0.8, 0.6, 9);
  }
  if (loud > 0) sfx.smash(p.k.hz, loud * clamp(speed / 25, 0.15, 0.55));
  if (byPlayer && speed >= PROP_HIT && p.kind !== 'barrel') paySmash(p);      // a barrel pays when it goes up
  return true;
}

function standProp(p) {
  Object.assign(p, { st: 0, x: p.hx, z: p.hz, y: 0, vx: 0, vy: 0, vz: 0, rx: 0, rz: 0, a: 0, fuse: 0, by: false });
  const key = gridKey(p.hx, p.hz);
  if (!propGrid.has(key)) propGrid.set(key, []);
  propGrid.get(key).push(p);
  placeProp(p);
}

// calls back for every standing prop whose centre is within `r` metres (plus its own radius) of a point
function propsNear(x, z, r, each) {
  const bx0 = Math.floor((x - r - 1 + 640) / 16);
  const bx1 = Math.floor((x + r + 1 + 640) / 16);
  const bz0 = Math.floor((z - r - 1 + 640) / 16);
  const bz1 = Math.floor((z + r + 1 + 640) / 16);
  for (let bx = bx0; bx <= bx1; bx++) {
    for (let bz = bz0; bz <= bz1; bz++) {
      const cell = propGrid.get((bx << 8) | bz);
      if (!cell) continue;
      for (let n = cell.length - 1; n >= 0; n--) {
        const p = cell[n];
        const reach = r + p.k.r;
        if (dist2(p.x, p.z, x, z) < reach * reach) each(p);
      }
    }
  }
}

function vehiclesVsProps() {
  for (const v of vehicles) {
    if (v.y > 1) continue;
    const speed = Math.hypot(v.vx, v.vz);
    if (speed < 0.5) continue;
    const mine = v === player.car;
    for (const end of [1, -1]) {
      const cx = v.x + Math.sin(v.h) * v.t.len * 0.3 * end;
      const cz = v.z + Math.cos(v.h) * v.t.len * 0.3 * end;
      propsNear(cx, cz, v.t.wid * 0.56, (p) => {
        if (!knockProp(p, v.vx, v.vz, mine)) return;
        v.vx *= 1 - p.k.slow;
        v.vz *= 1 - p.k.slow;
        if (mine) {
          cam.shake = Math.max(cam.shake, p.kind === 'lamp' ? 0.4 : 0.16);
          if (touch.on && navigator.vibrate) navigator.vibrate(p.kind === 'lamp' ? 50 : 18);
        }
      });
    }
  }
}

function updateProps(dt) {
  const [px, pz] = focus();
  const far = PROP_BACK * PROP_BACK;
  for (let n = fallen.length - 1; n >= 0; n--) {
    const p = fallen[n];
    if (p.st !== 1) {
      // lying or gone: it is put back once nobody can see it
      if (dist2(p.x, p.z, px, pz) > far && dist2(p.hx, p.hz, px, pz) > far && !(p.st === 3 && gameClock - p.upAt < BARREL_BACK)) {
        standProp(p);
        fallen.splice(n, 1);
      }
      continue;
    }
    p.t += dt;
    if (p.kind === 'lamp') {
      p.w += (1 + 5 * Math.sin(p.a)) * dt;
      p.a = Math.min(1.52, p.a + p.w * dt);
      if (p.a >= 1.52) {
        p.st = 2;
        const loud = heard(p.x + p.dx * 5, p.z + p.dz * 5, 70);
        if (loud > 0) {
          sfx.thud(loud * 0.5);
          for (let k = 0; k < 8; k++) puff(p.x + p.dx * rand(1, 7), 0.2, p.z + p.dz * rand(1, 7), rand(-2, 2), rand(0.5, 2), rand(-2, 2), 0.6, 0.5, 0.48, 0.44, -0.5);
        }
      }
      placeLamp(p);
      continue;
    }
    if (p.fuse > 0 && (p.fuse -= dt) <= 0) {
      p.st = 3;
      p.upAt = gameClock;
      placeProp(p);
      blast(p.x, p.y + 0.5, p.z, p.by);
      continue;
    }
    p.vy -= GRAVITY * dt;
    const nx = p.x + p.vx * dt;
    const nz = p.z + p.vz * dt;
    if (insideBox(nx, nz)) {
      p.vx *= -0.4;                 // off a wall
      p.vz *= -0.4;
    } else {
      p.x = clamp(nx, -LIMIT - 12, LIMIT + 12);
      p.z = clamp(nz, -LIMIT - 12, LIMIT + 12);
    }
    p.y += p.vy * dt;
    p.rx += p.wx * dt;
    p.rz += p.wz * dt;
    if (p.y <= 0) {
      p.y = 0;
      if (p.vy < -3.5) {
        p.vy *= -0.35;              // one bounce
        p.vx *= 0.6;
        p.vz *= 0.6;
        p.wx *= 0.6;
        p.wz *= 0.6;
      } else if (p.fuse > 0) {
        p.vy = 0;                   // a lit barrel on the ground waits for its fuse
        p.vx *= 0.6;
        p.vz *= 0.6;
      } else {
        p.st = 2;
        p.rx = Math.PI / 2;
      }
    }
    placeProp(p);
  }
  // a broken hydrant throws water for a while
  for (let n = jets.length - 1; n >= 0; n--) {
    const jet = jets[n];
    jet.t -= dt;
    if (jet.t <= 0) jets.splice(n, 1);
    else if (dist2(jet.x, jet.z, px, pz) < 110 * 110) {
      for (let k = 0; k < 2; k++) puff(jet.x, 0.3, jet.z, rand(-1.1, 1.1), rand(9, 13) * Math.min(1, jet.t / 2), rand(-1.1, 1.1), 1.3, 0.5, 0.72, 1, 15);
    }
  }
}

// ---------- blasts ----------
// cars in reach are thrown off their wheels and turned, props are knocked flying, and other barrels light up
function shockwave(x, z, reach, push, skip, byPlayer) {
  for (const o of vehicles) {
    if (o === skip) continue;
    const d = Math.hypot(o.x - x, o.z - z);
    if (d > reach) continue;
    const f = 1 - d / reach;
    const mine = o === player.car;
    const k = push * f * (mine ? 0.5 : o.driver || o.dead ? 0.8 : 1);
    o.vx += d > 0.1 ? ((o.x - x) / d) * k : k;
    o.vz += d > 0.1 ? ((o.z - z) / d) * k : 0;
    if (!o.air) {
      o.air = true;
      o.airT = 0;
      o.vy = (2 + 5 * f) * (mine ? 0.6 : 1);
      o.jump = null;
    }
    o.spin += rand(-1, 1) * 3 * f * (mine ? SPIN.own : 1);
    if (!mine) o.stun = Math.max(o.stun, 1.2);
    if (!o.driver) o.shoved = 2;
  }
  propsNear(x, z, reach, (p) => {
    const d = Math.hypot(p.x - x, p.z - z) || 1;
    const k = 5 + push * (1 - Math.min(1, d / reach));
    knockProp(p, ((p.x - x) / d) * k, ((p.z - z) / d) * k, byPlayer);
  });
}

function boomFlash(amount) {
  boom.t = Math.max(boom.t, 0.45 * clamp(amount, 0, 1));
}

function blast(x, y, z, byPlayer) {
  const loud = heard(x, z, 140);
  if (loud > 0) {
    for (let k = 0; k < 34; k++) puff(x, y, z, rand(-8, 8), rand(2, 13), rand(-8, 8), rand(0.4, 1.1), 1, rand(0.35, 0.75), 0.1, 10);
    for (let k = 0; k < 8; k++) puff(x, y + 1, z, rand(-2, 2), rand(2, 5), rand(-2, 2), rand(1, 1.8), 0.32, 0.3, 0.3, -1.5);
    sfx.boom(loud * 0.8);
  }
  const d = Math.hypot(x - focus()[0], z - focus()[1]);
  if (d < BLAST.flash) {
    cam.shake = Math.max(cam.shake, 0.75 * (1 - d / 60));
    boomFlash(1 - d / BLAST.flash);
  }
  for (const o of vehicles) {
    const od = Math.hypot(o.x - x, o.z - z);
    if (od < BLAST.reach) damageVehicle(o, BLAST.damage * (1 - od / BLAST.reach) * (byPlayer && o === player.car ? BLAST.own : 1));
  }
  shockwave(x, z, BLAST.reach, BLAST.push, null, byPlayer);
  for (const ped of peds) {
    const pd = Math.hypot(ped.x - x, ped.z - z);
    if (pd < 6.5) downPed(ped, ((ped.x - x) / (pd || 1)) * 9, ((ped.z - z) / (pd || 1)) * 9, byPlayer, 7);
  }
  scare(x, z, 50, 9);
  if (!player.car && state === 'play' && d < 6) hurt(42 - d * 6, 'wasted');
  if (byPlayer && state === 'play') {
    save.smashed = (save.smashed || 0) + 1;
    crime(0.5);
    if (style.crashT <= 0) styleTrick('BLAST', PROP_KINDS.barrel.pay);
    if (d < BLAST.flash && warp.t <= 0) Object.assign(warp, { t: 0.35, k: 0.4 });
  }
}

// a shot that hits a barrel sets it off (called by playerAttack with the ray and how far it flew)
function shootProps(ox, oy, oz, dx, dy, dz, tMax) {
  let best = null;
  let bestT = tMax;
  for (const p of props) {
    if (p.kind !== 'barrel' || p.st !== 0) continue;
    const lx = p.x - ox;
    const ly = 0.5 - oy;
    const lz = p.z - oz;
    const along = lx * dx + ly * dy + lz * dz;
    if (along < 0.5 || along > bestT) continue;
    if (lx * lx + ly * ly + lz * lz - along * along > 0.36) continue;
    best = p;
    bestT = along;
  }
  if (!best) return false;
  const cell = propGrid.get(gridKey(best.hx, best.hz));
  cell.splice(cell.indexOf(best), 1);
  fallen.push(best);
  Object.assign(best, { st: 1, t: 0, by: true, vx: 0, vz: 0, vy: 0, fuse: 0.02 });
  return true;
}

// ---------- cars: off the ground, turned by a hit ----------
// called by updateVehicle once the car has moved: its height on a ramp, its flight, its landing
function rideHeight(v, dt) {
  const speed = Math.hypot(v.vx, v.vz);
  const ramp = rampAt(v.x, v.z);
  const ground = ramp ? ramp.high * (rampSpot.u / ramp.len + 0.5) : 0;
  let nose = 0;
  if (v.air) {
    v.airT += dt;
    v.vy -= GRAVITY * dt;
    v.y += v.vy * dt;
    nose = clamp(-Math.atan2(v.vy, Math.max(8, speed)) * 0.8, -0.45, 0.45);
    if (v.y <= ground) {
      v.y = ground;
      landCar(v, speed);
    }
  } else {
    // the nose of the car meets the tall end or a side of a ramp: a wall
    const lead = v.t.len * 0.3 * (v.vf < 0 ? -1 : 1);
    const lx = v.x + Math.sin(v.h) * lead;
    const lz = v.z + Math.cos(v.h) * lead;
    const face = rampAt(lx, lz);
    if (face && face.high * (rampSpot.u / face.len + 0.5) - v.y > 0.55 + speed * dt * 0.3) {
      const bx = lx - v.vx * dt - face.x;
      const bz = lz - v.vz * dt - face.z;
      const across = bx * face.fz - bz * face.fx;
      const s = Math.abs(across) > face.wid / 2 ? Math.sign(across) : 1;
      const nx = Math.abs(across) > face.wid / 2 ? face.fz * s : face.fx;
      const nz = Math.abs(across) > face.wid / 2 ? -face.fx * s : face.fz;
      v.x -= v.vx * dt;
      v.z -= v.vz * dt;
      const vn = v.vx * nx + v.vz * nz;
      if (vn < 0) {
        v.vx -= nx * vn * 1.2;
        v.vz -= nz * vn * 1.2;
        impact(v, -vn);
      }
    } else if (v.y - ground > 0.12 + speed * dt * 0.3) {
      // the ground has gone from under the wheels: the car flies on with the climb it had
      v.air = true;
      v.airT = 0;
      v.vy = clamp(v.climb, 0, 14);
      v.jump = { x: v.x, z: v.z, ramp: v.onRamp };
      if (v === player.car && state === 'play' && v.vy > 2.5 && speed > 14) {
        Object.assign(warp, { t: 0.45, k: 0.45 });       // the take-off, slowed down for a moment
        sfx.thud(0.25);
      }
    } else {
      v.climb = dt > 0 ? (ground - v.y) / dt : 0;
      v.y = ground;
      v.onRamp = ramp ? ramp.id : -1;
      if (ramp) nose = -Math.atan2(ramp.high, ramp.len) * (Math.sin(v.h) * ramp.fx + Math.cos(v.h) * ramp.fz);
    }
  }
  v.tilt += (nose - v.tilt) * Math.min(1, dt * 12);
}

function landCar(v, speed) {
  const hard = -v.vy;
  const flight = v.jump;
  const secs = v.airT;
  v.air = false;
  v.vy = 0;
  v.climb = 0;
  v.jump = null;
  const loud = heard(v.x, v.z, 60);
  if (loud > 0 && hard > 2) {
    sfx.thud(loud * clamp(hard / 12, 0.15, 0.6));
    for (let k = 0; k < 8; k++) puff(v.x + rand(-1, 1), 0.25, v.z + rand(-1, 1), rand(-3, 3), rand(0.5, 2), rand(-3, 3), 0.6, 0.5, 0.48, 0.44, -0.5);
  }
  if (v !== player.car) return;
  cam.shake = Math.max(cam.shake, clamp(hard / 16, 0.12, 0.5));
  if (touch.on && navigator.vibrate && hard > 3) navigator.vibrate(40);
  if (state !== 'play' || !flight || flight.ramp < 0) return;
  const far = Math.hypot(v.x - flight.x, v.z - flight.z);
  if (far > secs * 70) return;                 // moved by the game in mid-air (a new job, a respawn): not a jump
  if (secs >= RAMP.air && far >= RAMP.far && style.crashT <= 0) stuntJump(flight.ramp, far);
}

function stuntJump(id, metres) {
  const far = Math.round(metres);
  save.jumpBest = Math.max(save.jumpBest || 0, far);
  styleTrick('STUNT JUMP  ' + far + ' m', 40 + Math.round((metres * 4) / 5) * 5);
  nitroGain(NITRO.jump);
  if (!save.jumps.includes(id)) {
    save.jumps.push(id);
    if (save.jumps.length >= ramps.length) {
      addMoney(RAMP.all);
      banner('pass', 'ALL STUNT JUMPS', ramps.length + ' of ' + ramps.length + '   +' + dollars(RAMP.all), 5);
      sfx.pass();
    } else if (lineFree()) {
      hint('Stunt jump ' + save.jumps.length + ' of ' + ramps.length + '. M shows the whole map. The orange marks are the others.', 6);
    }
  }
  persist();
}

// an off-centre hit turns the car that takes it (called by collideVehicles for both cars of a hard crash)
function knockSpin(v, off, nx, nz, push) {
  const mine = v.driver === 'player';
  const lever = Math.sign(off) * (Math.cos(v.h) * nx - Math.sin(v.h) * nz);
  const cap = SPIN.max * (mine ? SPIN.own : 1);
  v.spin = clamp(v.spin + lever * push * SPIN.gain * (mine ? SPIN.own : 1), -cap, cap);
  if (!mine) v.stun = Math.max(v.stun, clamp(push / 10, SPIN.stun[0], SPIN.stun[1]));
  if (!v.driver) v.shoved = 1.5;
}

// ---------- nitro ----------
function nitroGain(amount) {
  nitro.tank = Math.min(1, nitro.tank + amount);
}
// called by updateVehicle for the player's car: is the nitro burning this step?
function nitroBurn(v, throttle, dt) {
  const held = state === 'play' && (keys.ShiftLeft || keys.ShiftRight);
  const can = !!held && throttle > 0 && !v.air && v.hp > 0 && nitro.tank > (nitro.on ? 0 : NITRO.min);
  if (can && !nitro.on) sfx.nitro();
  nitro.on = can;
  if (can) nitro.tank = Math.max(0, nitro.tank - dt / NITRO.burn);
  return can;
}

// the game runs slower for a moment (frame() in part 4 asks every frame)
function timeScale(realDt) {
  if (warp.t <= 0) return 1;
  warp.t -= realDt;
  return warp.k;
}

function updateHavoc(dt, realDt) {
  const car = player.car;
  if (!car) nitro.on = false;
  if (car && nitro.on) {
    const fx = Math.sin(car.h);
    const fz = Math.cos(car.h);
    for (const s of [-0.45, 0.45]) {
      puff(car.x - fx * car.t.len * 0.5 + fz * s, car.y + 0.42, car.z - fz * car.t.len * 0.5 - fx * s,
        car.vx * 0.6 - fx * 5 + rand(-0.6, 0.6), rand(0, 0.8), car.vz * 0.6 - fz * 5 + rand(-0.6, 0.6), 0.24, 0.35, 0.7, 1, 0);
    }
    cam.shake = Math.max(cam.shake, 0.07);
    nitro.hissT -= dt;
    if (nitro.hissT <= 0) {
      nitro.hissT = 0.3;
      noiseBurst(0.34, 0.1, 3200, 0, 0, 'highpass');
    }
  }
  if (boom.t > 0 || boom.shown !== 0) {
    boom.t = Math.max(0, boom.t - realDt);
    const shown = Math.round(clamp(boom.t / 0.45, 0, 1) * 10) / 10;
    if (shown !== boom.shown) {
      boom.shown = shown;
      $('boom').style.opacity = shown * 0.6;
    }
  }
  // said once, the first time a ramp is close and the hint line is free
  if (car && state === 'play' && !(save.havocTold & 2) && !intro.on && lineFree()) {
    for (const r of ramps) {
      if (dist2(r.x, r.z, car.x, car.z) > 45 * 45) continue;
      save.havocTold |= 2;
      persist();
      hint('A stunt ramp. Hit it fast and straight: the further the jump, the more it pays.', 7);
      break;
    }
  }
}

function resetHavoc() {
  for (const p of fallen.splice(0)) standProp(p);
  jets.length = 0;
  Object.assign(nitro, { tank: NITRO.start, on: false, hissT: 0, over: false });
  warp.t = 0;
  boom.t = 0;
}
