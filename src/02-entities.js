// =====================================================================
// NEON COAST - part 2: people, vehicles, driving physics, traffic AI
// =====================================================================

// ---------- people ----------
const SHIRTS = ['#e84a5f', '#2a9d8f', '#f4a261', '#577590', '#f2f2f2', '#9b5de5', '#ffd166', '#333842'];
const PANTS = ['#2b2f3a', '#3d5a80', '#6b705c', '#e0d8c3', '#1d1d22'];
const SKINS = ['#f1c9a5', '#d9a47a', '#a8744f', '#7a4f33', '#f5d7bd'];
const HAIRS = ['#1b1b1b', '#5a3a1e', '#c9a24b', '#8a8a8a', '#7a2b1b'];

function buildPerson(shirt, pants, skin, hair, jacket) {
  const group = new T.Group();
  const part = (w, h, d, hex, x, y, z, parent) => {
    const mesh = new T.Mesh(boxGeo, mat(hex));
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    (parent || group).add(mesh);
    return mesh;
  };
  const limb = (x, y, w, h, hex) => {
    const pivot = new T.Group();
    pivot.position.set(x, y, 0);
    part(w, h, w + 0.02, hex, 0, -h / 2, 0, pivot);
    group.add(pivot);
    return pivot;
  };
  part(0.5, 0.62, 0.28, shirt, 0, 1.13, 0);
  part(0.56, 0.16, 0.3, shirt, 0, 1.38, 0);                  // shoulders
  part(0.51, 0.07, 0.29, '#15151a', 0, 0.85, 0);             // belt
  part(0.14, 0.08, 0.14, skin, 0, 1.47, 0);                  // neck
  part(0.3, 0.3, 0.3, skin, 0, 1.63, 0);
  part(0.32, 0.1, 0.32, hair, 0, 1.81, 0);
  part(0.32, 0.2, 0.08, hair, 0, 1.7, -0.13);
  for (const side of [-0.075, 0.075]) part(0.05, 0.04, 0.02, '#15151a', side, 1.66, 0.151);   // eyes
  if (jacket) {
    part(0.16, 0.5, 0.02, jacket, 0, 1.14, 0.141);           // open jacket over a light shirt
    part(0.34, 0.06, 0.34, '#20242e', 0, 1.87, 0.02);        // cap
    part(0.26, 0.03, 0.14, '#20242e', 0, 1.85, 0.22);
  }
  const legs = [limb(-0.13, 0.82, 0.2, 0.82, pants), limb(0.13, 0.82, 0.2, 0.82, pants)];
  const arms = [limb(-0.35, 1.44, 0.14, 0.6, skin), limb(0.35, 1.44, 0.14, 0.6, skin)];
  for (const leg of legs) part(0.22, 0.1, 0.34, '#1a1a1e', 0, -0.77, 0.05, leg);       // shoes
  for (const arm of arms) part(0.17, 0.26, 0.19, shirt, 0, -0.12, 0, arm);            // sleeves
  group.userData.legs = legs;
  group.userData.arms = arms;
  return group;
}

function animPerson(group, phase, amp) {
  const swing = Math.sin(phase) * amp;
  const u = group.userData;
  u.legs[0].rotation.x = swing;
  u.legs[1].rotation.x = -swing;
  u.arms[0].rotation.x = -swing * 0.8;
  u.arms[1].rotation.x = swing * 0.8;
}

// ---------- player ----------
const player = {
  x: 0, z: 0, y: 0, vy: 0, h: 0,
  hp: 100, speed: 0, phase: 0,
  car: null, lastCar: null,
  ammo: 48, gun: true, fireT: 0, punchT: 0,
  mesh: buildPerson('#ff4fa3', '#2b3350', '#d9a47a', '#1b1b1b', '#f4f4f4'),
};
scene.add(player.mesh);
const focus = () => (player.car ? [player.car.x, player.car.z] : [player.x, player.z]);

// ---------- pedestrians ----------
function addPed(x, z) {
  const ped = {
    x, z, h: 0, state: 'walk', hp: 100,
    phase: rand(0, 6), speed: rand(1.2, 1.9), timer: 0,
    b: null, k: 0, dir: 1, fx: 0, fz: 0, vx: 0, vz: 0,
    mesh: buildPerson(pick(SHIRTS), pick(PANTS), pick(SKINS), pick(HAIRS)),
  };
  ped.mesh.position.set(x, 0, z);
  scene.add(ped.mesh);
  peds.push(ped);
  return ped;
}

function blockCorner(b, k) {
  const m = 2.4;
  if (k === 0) return [b.x0 + m, b.z0 + m];
  if (k === 1) return [b.x1 - m, b.z0 + m];
  if (k === 2) return [b.x1 - m, b.z1 - m];
  return [b.x0 + m, b.z1 - m];
}

function spawnWalker(minD, maxD) {
  const [px, pz] = focus();
  const i = clamp(cellOf(px) + irand(-2, 2), 0, N - 1);
  const j = clamp(cellOf(pz) + irand(-2, 2), 0, N - 1);
  const b = blocks[i][j];
  const k = irand(0, 3);
  const from = blockCorner(b, k);
  const to = blockCorner(b, (k + 1) & 3);
  const u = Math.random();
  const x = lerp(from[0], to[0], u);
  const z = lerp(from[1], to[1], u);
  const d = Math.hypot(x - px, z - pz);
  if (d < minD || d > maxD) return;
  const ped = addPed(x, z);
  ped.b = b;
  ped.dir = Math.random() < 0.5 ? 1 : -1;
  ped.k = ped.dir > 0 ? (k + 1) & 3 : k;
}

function rehome(ped) {
  ped.b = blocks[clamp(cellOf(ped.x), 0, N - 1)][clamp(cellOf(ped.z), 0, N - 1)];
  let best = 1e9;
  for (let k = 0; k < 4; k++) {
    const c = blockCorner(ped.b, k);
    const d = dist2(ped.x, ped.z, c[0], c[1]);
    if (d < best) {
      best = d;
      ped.k = k;
    }
  }
}

function scare(x, z, radius, secs) {
  for (const ped of peds) {
    if (ped.state === 'down' || dist2(ped.x, ped.z, x, z) > radius * radius) continue;
    ped.state = 'flee';
    ped.fx = x;
    ped.fz = z;
    ped.timer = secs;
  }
}

function downPed(ped, vx, vz, byPlayer) {
  if (ped.state === 'down') return;
  ped.state = 'down';
  ped.timer = 14;
  ped.vx = vx * 0.6;
  ped.vz = vz * 0.6;
  ped.mesh.rotation.x = -Math.PI / 2;
  ped.mesh.position.y = 0.2;
  scare(ped.x, ped.z, 22, 9);
  if (byPlayer) {
    crime(1.6);
    addPickup('cash', ped.x + rand(-1, 1), ped.z + rand(-1, 1), irand(8, 45));
  }
}

function updatePed(ped, dt) {
  if (ped.state === 'down') {
    ped.timer -= dt;
    ped.x += ped.vx * dt;
    ped.z += ped.vz * dt;
    ped.vx *= 0.9;
    ped.vz *= 0.9;
    ped.mesh.position.x = ped.x;
    ped.mesh.position.z = ped.z;
    return ped.timer > 0;
  }
  let speed = ped.speed;
  let tx;
  let tz;
  if (ped.state === 'flee') {
    ped.timer -= dt;
    const dx = ped.x - ped.fx;
    const dz = ped.z - ped.fz;
    const d = Math.hypot(dx, dz) || 1;
    tx = ped.x + (dx / d) * 5;
    tz = ped.z + (dz / d) * 5;
    speed = 6.2;
    if (ped.timer <= 0) {
      ped.state = 'walk';
      rehome(ped);
    }
  } else {
    const c = blockCorner(ped.b, ped.k);
    tx = c[0];
    tz = c[1];
    if (dist2(ped.x, ped.z, tx, tz) < 0.6) ped.k = (ped.k + ped.dir + 4) & 3;
  }
  const dx = tx - ped.x;
  const dz = tz - ped.z;
  const d = Math.hypot(dx, dz) || 1;
  ped.h += wrapPi(Math.atan2(dx, dz) - ped.h) * Math.min(1, dt * 8);
  pushOut(ped.x + (dx / d) * speed * dt, ped.z + (dz / d) * speed * dt, 0.4, tmpHit);
  ped.x = clamp(tmpHit.x, -LIMIT, LIMIT);
  ped.z = clamp(tmpHit.z, -LIMIT, LIMIT);
  ped.phase += speed * dt * 2.4;
  animPerson(ped.mesh, ped.phase, speed > 3 ? 0.9 : 0.5);
  ped.mesh.position.set(ped.x, 0, ped.z);
  ped.mesh.rotation.y = ped.h;
  return true;
}

// ---------- vehicles ----------
const VEHICLE_TYPES = {
  sedan: { name: 'Tidal', len: 4.5, wid: 1.95, hgt: 1.3, max: 33, acc: 12, brake: 26, turn: 2.2, grip: 6.5, hp: 100, cab: [0.5, -0.05], colors: ['#c9d1d9', '#2f5f9e', '#8d2b2b', '#2f6e58', '#d8c7a0', '#444b57'] },
  sports: { name: 'Vanta GT', len: 4.4, wid: 2.0, hgt: 1.08, max: 52, acc: 21, brake: 32, turn: 2.5, grip: 7.5, hp: 90, cab: [0.38, -0.2], colors: ['#ff3f7f', '#ffd23f', '#21d4c4', '#f2f2f2', '#ff6a1f'] },
  muscle: { name: 'Ravager', len: 4.8, wid: 2.0, hgt: 1.2, max: 44, acc: 17, brake: 26, turn: 2.1, grip: 5.2, hp: 110, cab: [0.4, -0.3], colors: ['#1d1d22', '#b3261e', '#3d2a6e', '#e07a1f'] },
  pickup: { name: 'Brawler', len: 5.1, wid: 2.1, hgt: 1.5, max: 30, acc: 11, brake: 24, turn: 2.0, grip: 6, hp: 130, cab: [0.34, 0.3], colors: ['#7a5a3c', '#40505f', '#a33b2b', '#dcdcdc'] },
  van: { name: 'Hauler', len: 5.0, wid: 2.1, hgt: 1.9, max: 27, acc: 9, brake: 22, turn: 1.9, grip: 6, hp: 130, cab: [0.88, -0.02], colors: ['#f0f0f0', '#3a6ea5', '#5c5c5c'] },
  taxi: { name: 'City Cab', len: 4.5, wid: 1.95, hgt: 1.3, max: 35, acc: 13, brake: 26, turn: 2.2, grip: 6.5, hp: 100, cab: [0.5, -0.05], colors: ['#f2c318'] },
  police: { name: 'Patrol Cruiser', len: 4.6, wid: 2.0, hgt: 1.3, max: 47, acc: 20, brake: 30, turn: 2.4, grip: 7, hp: 120, cab: [0.48, -0.05], colors: ['#f4f6f8'] },
};
const TRAFFIC_MIX = ['sedan', 'sedan', 'sedan', 'taxi', 'taxi', 'pickup', 'van', 'muscle', 'sports'];

const glassMat = new T.MeshLambertMaterial({ color: '#141c26' });
const tireMat = new T.MeshLambertMaterial({ color: '#15161a' });
const wreckMat = new T.MeshLambertMaterial({ color: '#1a1614' });
const wheelGeo = new T.CylinderGeometry(0.36, 0.36, 0.28, 12);
wheelGeo.rotateZ(Math.PI / 2);

// body and cabin outlines per type, extruded across the car's width (made once, shared by every car of that type)
const CAR_RAKE = { van: [0.28, 0.04], pickup: [0.5, 0.06], sports: [1.0, 0.75], muscle: [0.8, 0.6] };
const carGeoCache = {};
function carGeos(type) {
  if (carGeoCache[type]) return carGeoCache[type];
  const t = VEHICLE_TYPES[type];
  const half = t.len / 2;
  const bodyH = t.hgt * 0.48;
  const y0 = 0.3;
  const y1 = y0 + bodyH;
  const cabH = t.hgt * 0.46;
  const cabL = t.len * t.cab[0];
  const cabZ = t.len * t.cab[1];
  const zr = cabZ - cabL / 2;
  const zf = cabZ + cabL / 2;
  const [rakeF, rakeR] = CAR_RAKE[type] || [0.8, 0.5];
  const extrude = (points, width) => {
    const shape = new T.Shape(points.map((p) => new T.Vector2(p[0], p[1])));
    const geo = new T.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
    geo.rotateY(-Math.PI / 2);        // outline x becomes the car's length, the extrusion its width
    geo.translate(width / 2, 0, 0);
    return geo;
  };
  const hoodZ = Math.min(zf + 0.1, half - 0.35);
  const body = extrude([
    [-half + 0.14, y0], [half - 0.18, y0], [half, y0 + bodyH * 0.36], [half - 0.06, y1 - bodyH * 0.2],
    [hoodZ, y1], [-half + 0.1, y1], [-half, y0 + bodyH * 0.5],
  ], t.wid);
  const topF = zf - rakeF * cabH;
  const topR = zr + rakeR * cabH;
  const cabin = extrude([[zr, y1], [zf, y1], [topF, y1 + cabH], [topR, y1 + cabH]], t.wid * 0.86);
  return (carGeoCache[type] = { body, cabin, y0, y1, bodyH, cabH, cabZ, zr, zf, topF, topR });
}
const beamPoolGeo = new T.PlaneGeometry(7, 12);
beamPoolGeo.rotateX(-Math.PI / 2);
const hubGeo = new T.CylinderGeometry(0.2, 0.2, 0.3, 8);
hubGeo.rotateZ(Math.PI / 2);
const hubMat = new T.MeshLambertMaterial({ color: '#b9bec8' });
const trimMat = new T.MeshLambertMaterial({ color: '#22252b' });

function buildCar(type, colorHex) {
  const t = VEHICLE_TYPES[type];
  const g = carGeos(type);
  const group = new T.Group();
  const paint = mat(colorHex);
  const add = (w, h, d, material, x, y, z) => {
    const mesh = new T.Mesh(boxGeo, material);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  const body = new T.Mesh(g.body, paint);
  const cabin = new T.Mesh(g.cabin, glassMat);
  body.castShadow = cabin.castShadow = true;
  group.add(body, cabin);
  const bodyY = g.y0 + g.bodyH / 2;
  const roofY = g.y1 + g.cabH;
  const roofZ = (g.topF + g.topR) / 2;
  const painted = [body];
  painted.push(add(t.wid * 0.88, 0.07, g.topF - g.topR + 0.08, paint, 0, roofY + 0.03, roofZ));
  painted.push(add(t.wid * 0.875, g.cabH, 0.13, paint, 0, g.y1 + g.cabH / 2, roofZ));          // door pillar
  add(t.wid + 0.08, 0.2, 0.2, trimMat, 0, 0.42, t.len / 2 - 0.02);
  add(t.wid + 0.08, 0.2, 0.2, trimMat, 0, 0.42, -t.len / 2 + 0.02);
  add(t.wid * 0.5, 0.13, 0.06, trimMat, 0, bodyY + 0.02, t.len / 2 - 0.02);                    // grille
  for (const side of [-1, 1]) {
    add(0.42, 0.15, 0.1, glowMat('#fff6d8'), side * t.wid * 0.33, bodyY + 0.07, t.len / 2 - 0.05);
    add(0.42, 0.13, 0.1, glowMat('#ff2a2a'), side * t.wid * 0.33, bodyY + 0.12, -t.len / 2 + 0.03);
    add(0.06, 0.1, 0.2, trimMat, side * (t.wid * 0.43 + 0.1), g.y1 + 0.1, g.zf - 0.25);          // door mirror
  }
  if (type === 'sports' || type === 'muscle') {
    painted.push(add(t.wid * 0.92, 0.06, 0.32, paint, 0, g.y1 + 0.2, -t.len / 2 + 0.24));        // rear wing
    for (const side of [-1, 1]) add(0.08, 0.2, 0.1, trimMat, side * t.wid * 0.34, g.y1 + 0.1, -t.len / 2 + 0.26);
  }
  if (type === 'pickup') add(t.wid * 0.82, 0.04, g.zr + t.len / 2 - 0.25, trimMat, 0, g.y1 + 0.01, (g.zr - t.len / 2) / 2);   // load bed
  const wheels = [];
  for (const wz of [1, -1]) {
    for (const wx of [-1, 1]) {
      const wheel = new T.Mesh(wheelGeo, tireMat);
      wheel.position.set(wx * (t.wid / 2 - 0.1), 0.36, wz * t.len * 0.31);
      wheel.castShadow = true;
      wheel.add(new T.Mesh(hubGeo, hubMat));
      group.add(wheel);
      wheels.push(wheel);
    }
  }
  const beam = new T.Mesh(beamPoolGeo, lampGlowMat);     // pool of light on the road after dark
  beam.position.set(0, 0.07, t.len / 2 + 5.5);
  group.add(beam);
  group.userData = { painted, wheels, bar: null };
  if (type === 'police') {
    add(t.wid + 0.03, g.bodyH * 0.55, t.len * 0.36, mat('#15171c'), 0, bodyY, -0.15);
    add(t.wid * 0.62, 0.1, 0.3, mat('#2a2d35'), 0, roofY + 0.1, roofZ);
    group.userData.bar = [
      add(t.wid * 0.3, 0.16, 0.3, glowMat('#ff2233'), -t.wid * 0.16, roofY + 0.2, roofZ),
      add(t.wid * 0.3, 0.16, 0.3, glowMat('#2a6bff'), t.wid * 0.16, roofY + 0.2, roofZ),
    ];
  }
  if (type === 'taxi') add(0.62, 0.2, 0.3, glowMat('#ffe36b'), 0, roofY + 0.17, roofZ);
  return group;
}

function addVehicle(type, x, z, h, driver, colorHex) {
  const t = VEHICLE_TYPES[type];
  const v = {
    type, t, x, z, h,
    vx: 0, vz: 0, vf: 0, slip: 0, steer: 0,
    hp: t.hp, driver: driver || null,
    burn: 0, dead: false, deadT: 0, keep: false, siren: false, smokeT: 0,
    input: { thr: 0, st: 0 },
    ai: { d: 0, ti: 0, tj: 0, nd: -1, stuck: 0, rev: 0, block: 0, cruise: rand(10, 15), los: 0, direct: false, wasDirect: false, fire: 1, cx: 0, cz: 0, want: 0 },
    mesh: buildCar(type, colorHex || pick(t.colors)),
  };
  v.mesh.position.set(x, 0, z);
  v.mesh.rotation.y = h;
  scene.add(v.mesh);
  vehicles.push(v);
  return v;
}

function removeVehicle(v) {
  scene.remove(v.mesh);
  const k = vehicles.indexOf(v);
  if (k >= 0) vehicles.splice(k, 1);
}

function vehicleNear(x, z, r) {
  for (const v of vehicles) {
    if (dist2(v.x, v.z, x, z) < r * r) return true;
  }
  return false;
}

// Put a car in the right-hand lane halfway along a random road segment.
function spawnTraffic(minD, maxD, parked) {
  const [px, pz] = focus();
  const i = clamp(nodeOf(px) + irand(-3, 3), 0, N);
  const j = clamp(nodeOf(pz) + irand(-3, 3), 0, N);
  const d = irand(0, 3);
  const ni = i + DX[d];
  const nj = j + DZ[d];
  if (ni < 0 || nj < 0 || ni > N || nj > N) return null;
  const rd = (d + 1) & 3;
  const along = parked ? rand(0.25, 0.75) * CELL : CELL / 2;
  const off = parked ? PARK : LANE;
  const x = roadC(i) + DX[d] * along + DX[rd] * off;
  const z = roadC(j) + DZ[d] * along + DZ[rd] * off;
  const dist = Math.hypot(x - px, z - pz);
  if (dist < minD || dist > maxD || vehicleNear(x, z, 9)) return null;
  if (parked) return addVehicle(pick(TRAFFIC_MIX), x, z, headingOf(d), null);
  const type = Math.random() < 0.07 ? 'police' : pick(TRAFFIC_MIX);
  const v = addVehicle(type, x, z, headingOf(d), type === 'police' ? 'cop' : 'ai');
  v.ai.d = d;
  v.ai.ti = ni;
  v.ai.tj = nj;
  v.vx = DX[d] * v.ai.cruise;
  v.vz = DZ[d] * v.ai.cruise;
  return v;
}

// Re-attach a car to the road grid from wherever it is, keeping its rough heading.
function snapLane(v) {
  const a = v.ai;
  const i = nodeOf(v.x);
  const j = nodeOf(v.z);
  const fx = Math.sin(v.h);
  const fz = Math.cos(v.h);
  const alongIndex = (pos, forward) => {
    const u = (pos + HALF - ROAD / 2) / CELL;
    return clamp(forward ? Math.ceil(u) : Math.floor(u), 0, N);
  };
  if (Math.abs(v.x - roadC(i)) < Math.abs(v.z - roadC(j))) {
    a.d = fz >= 0 ? 1 : 3;
    a.ti = i;
    a.tj = alongIndex(v.z, a.d === 1);
  } else {
    a.d = fx >= 0 ? 0 : 2;
    a.tj = j;
    a.ti = alongIndex(v.x, a.d === 0);
  }
  a.nd = -1;
}

function chooseDir(a, chase) {
  const options = [a.d, (a.d + 1) & 3, (a.d + 3) & 3].filter((d) => {
    const ni = a.ti + DX[d];
    const nj = a.tj + DZ[d];
    return ni >= 0 && nj >= 0 && ni <= N && nj <= N;
  });
  if (!options.length) return (a.d + 2) & 3;
  if (chase) {
    const [px, pz] = focus();
    let best = options[0];
    let bestD = 1e9;
    for (const d of options) {
      const score = Math.abs(roadC(a.ti + DX[d]) - px) + Math.abs(roadC(a.tj + DZ[d]) - pz);
      if (score < bestD) {
        bestD = score;
        best = d;
      }
    }
    return best;
  }
  return options.includes(a.d) && Math.random() < 0.55 ? a.d : pick(options);
}

// Follow the lane toward the next intersection; fills a.cx/a.cz (steer target) and a.want (speed).
function laneFollow(v, chase) {
  const a = v.ai;
  let s = 0;
  for (let pass = 0; pass < 2; pass++) {
    s = (roadC(a.ti) - v.x) * DX[a.d] + (roadC(a.tj) - v.z) * DZ[a.d];
    if (a.nd < 0 && s < ROAD / 2 + 10) a.nd = chooseDir(a, chase);
    if (a.nd < 0) break;
    const rightTurn = a.nd === ((a.d + 1) & 3);
    const threshold = a.nd === a.d ? 0 : rightTurn ? LANE + 4.2 : -LANE + 4.2;
    if (s >= threshold) break;
    a.d = a.nd;
    a.nd = -1;
    a.ti = clamp(a.ti + DX[a.d], 0, N);
    a.tj = clamp(a.tj + DZ[a.d], 0, N);
  }
  const dx = DX[a.d];
  const dz = DZ[a.d];
  const rd = (a.d + 1) & 3;
  const lx = roadC(a.ti) + DX[rd] * LANE;
  const lz = roadC(a.tj) + DZ[rd] * LANE;
  const along = (v.x - lx) * dx + (v.z - lz) * dz + 6 + Math.abs(v.vf) * 0.35;
  a.cx = lx + dx * along;
  a.cz = lz + dz * along;
  const turning = a.nd >= 0 && a.nd !== a.d && s < 18;
  a.want = chase ? (turning ? 10 : v.t.max * 0.8) : turning ? 6.5 : a.cruise;
}

function blockedAhead(v, range) {
  const fx = Math.sin(v.h);
  const fz = Math.cos(v.h);
  const inPath = (x, z, halfWidth) => {
    const dx = x - v.x;
    const dz = z - v.z;
    const ahead = dx * fx + dz * fz;
    return ahead > 1 && ahead < range && Math.abs(dz * fx - dx * fz) < halfWidth;
  };
  for (const other of vehicles) {
    if (other !== v && inPath(other.x, other.z, 2.3)) return true;
  }
  if (!player.car && inPath(player.x, player.z, 1.6)) return true;
  for (const ped of peds) {
    if (ped.state !== 'down' && inPath(ped.x, ped.z, 1.5)) return true;
  }
  return false;
}

function aiDrive(v, dt) {
  const a = v.ai;
  let tx;
  let tz;
  let want;
  const chasing = v.driver === 'cop' && wanted.stars > 0 && state === 'play';
  if (chasing) {
    const [px, pz] = focus();
    const d = Math.hypot(px - v.x, pz - v.z);
    a.los -= dt;
    if (a.los <= 0) {
      a.los = 0.4;
      a.direct = d < 50 && clearLine(v.x, v.z, px, pz);
      if (!a.direct && a.wasDirect) snapLane(v);
      a.wasDirect = a.direct;
    }
    if (a.direct) {
      const target = player.car;
      tx = px + (target ? target.vx * 0.3 : 0);
      tz = pz + (target ? target.vz * 0.3 : 0);
      want = v.t.max;
      if (wanted.stars === 1 && d < 12) want = d < 6 ? 0 : 6;   // one star: box in and arrest
    } else {
      laneFollow(v, true);
      tx = a.cx;
      tz = a.cz;
      want = a.want;
    }
  } else {
    if (a.wasDirect) {
      snapLane(v);
      a.wasDirect = a.direct = false;
    }
    laneFollow(v, false);
    tx = a.cx;
    tz = a.cz;
    want = a.want;
    if (blockedAhead(v, 6 + Math.abs(v.vf) * 0.8)) {
      a.block += dt;
      if (a.block < 7) want = 0;
      else if (a.block > 9.5) a.block = 0;      // crept through a jam, start waiting again
    } else {
      a.block = Math.max(0, a.block - dt * 2);
    }
  }
  const turn = wrapPi(Math.atan2(tx - v.x, tz - v.z) - v.h);
  let steer = clamp(turn * 2.2, -1, 1);
  let throttle = 0;
  if (v.vf < want) throttle = clamp((want - v.vf) / 4, 0.2, 1);
  else if (v.vf > want + 1.5) throttle = -1;

  // stuck against something: back up for a moment
  if (want > 2 && Math.abs(v.vf) < 0.6) a.stuck += dt;
  else a.stuck = Math.max(0, a.stuck - dt);
  if (a.stuck > (chasing ? 1.6 : 4)) {
    a.stuck = 0;
    a.rev = 1.5;
  }
  if (a.rev > 0) {
    a.rev -= dt;
    throttle = -1;
    steer = -steer;
  }
  v.input.thr = throttle;
  v.input.st = steer;
}

function damageVehicle(v, amount) {
  if (v.dead) return;
  v.hp -= amount * (v.driver === 'player' ? diff().dmg : 1);
}

function impact(v, speed) {
  if (speed < 4) return;
  damageVehicle(v, (speed - 4) * 1.7);
  const [px, pz] = focus();
  const d = Math.hypot(v.x - px, v.z - pz);
  if (d < 60) sfx.crash(clamp((speed / 30) * (1 - d / 60), 0.03, 0.6));
  if (v.driver === 'player') cam.shake = Math.min(0.6, speed / 40);
  for (let k = 0; k < 5; k++) puff(v.x, 0.7, v.z, rand(-4, 4), rand(1, 4), rand(-4, 4), 0.4, 1, 0.8, 0.4, 9);
}

function updateVehicle(v, dt) {
  const t = v.t;
  let throttle = 0;
  let steer = 0;
  let handbrake = false;
  if (v.dead || !v.driver) {
    handbrake = true;
  } else if (v.driver === 'player') {
    if (state === 'play') {
      throttle = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
      steer = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
      handbrake = !!keys.Space;
    }
  } else {
    aiDrive(v, dt);
    throttle = v.input.thr;
    steer = v.input.st;
  }
  if (v.hp <= 0) throttle = 0;

  v.steer += clamp(steer - v.steer, -dt * 6, dt * 6);
  let fx = Math.sin(v.h);
  let fz = Math.cos(v.h);
  let vf = v.vx * fx + v.vz * fz;
  v.h += ((v.steer * t.turn) / (1 + Math.abs(vf) / 40)) * clamp(vf / 6, -1, 1) * dt;
  fx = Math.sin(v.h);
  fz = Math.cos(v.h);
  const rx = -fz;                 // right-hand side of the car
  const rz = fx;
  vf = v.vx * fx + v.vz * fz;
  let vl = v.vx * rx + v.vz * rz;

  const power = v.hp < 30 ? 0.6 : 1;
  const tuned = v === player.car && save.tune > 0;
  const accel = t.acc * (tuned ? 1 + 0.14 * save.tune : 1);
  const topSpeed = t.max * (tuned ? 1 + 0.07 * save.tune : 1);
  if (throttle > 0) {
    vf += (vf < -0.5 ? t.brake : accel * power * Math.max(0, 1 - vf / topSpeed)) * throttle * dt;
  } else if (throttle < 0) {
    vf += (vf > 0.5 ? t.brake : t.acc * 0.6 * Math.max(0, 1 + vf / (t.max * 0.3))) * throttle * dt;
  } else {
    vf -= vf * 0.35 * dt;
  }
  if (handbrake) {
    const cut = 16 * dt;
    vf = Math.abs(vf) < cut ? 0 : vf - Math.sign(vf) * cut;
  }
  vf -= Math.sign(vf) * Math.min(Math.abs(vf), 0.6 * dt);
  vl *= Math.exp(-(handbrake ? 1.5 : t.grip) * dt);
  v.slip = Math.abs(vl);
  v.vf = vf;
  v.vx = fx * vf + rx * vl;
  v.vz = fz * vf + rz * vl;
  v.x += v.vx * dt;
  v.z += v.vz * dt;

  // buildings: the car is two circles, front and rear
  for (const end of [1, -1]) {
    const off = t.len * 0.3 * end;
    const cx = v.x + fx * off;
    const cz = v.z + fz * off;
    pushOut(cx, cz, t.wid * 0.56, tmpHit);
    if (!tmpHit.hit) continue;
    const px = tmpHit.x - cx;
    const pz = tmpHit.z - cz;
    const len = Math.hypot(px, pz) || 1;
    v.x += px;
    v.z += pz;
    v.h -= clamp(((px * rx + pz * rz) / off) * 0.5, -0.1, 0.1);
    const vn = (v.vx * px + v.vz * pz) / len;
    if (vn < 0) {
      v.vx -= (px / len) * vn * 1.2;
      v.vz -= (pz / len) * vn * 1.2;
      impact(v, -vn);
    }
  }
  if (Math.abs(v.x) > LIMIT) {
    v.x = clamp(v.x, -LIMIT, LIMIT);
    v.vx = 0;
  }
  if (Math.abs(v.z) > LIMIT) {
    v.z = clamp(v.z, -LIMIT, LIMIT);
    v.vz = 0;
  }

  // damage states: smoke, fire, explosion
  if (!v.dead) {
    v.smokeT -= dt;
    if (v.hp < 45 && v.smokeT <= 0) {
      v.smokeT = 0.08;
      const hot = v.hp <= 0;
      puff(v.x + fx * t.len * 0.35, 1, v.z + fz * t.len * 0.35, rand(-0.5, 0.5), rand(2, 4), rand(-0.5, 0.5), hot ? 0.7 : 1.1, hot ? 1 : 0.3, hot ? 0.5 : 0.3, hot ? 0.1 : 0.32, -1);
    }
    if (v.hp <= 0) {
      if (v.driver && v.driver !== 'player') ejectDriver(v);
      v.burn += dt;
      if (v.burn > 3.6) explode(v);
    }
  } else {
    v.deadT += dt;
  }

  if (v.slip > 5 && Math.abs(vf) > 6 && Math.random() < 0.5) {
    puff(v.x - fx * t.len * 0.3, 0.2, v.z - fz * t.len * 0.3, 0, 0.6, 0, 0.6, 0.22, 0.22, 0.24, -0.5);
  }

  v.mesh.position.set(v.x, 0, v.z);
  v.mesh.rotation.y = v.h;
  const u = v.mesh.userData;
  u.wheels[0].rotation.y = u.wheels[1].rotation.y = v.steer * 0.45;
  if (u.bar) {
    const flash = v.siren && !v.dead ? Math.floor(performance.now() / 160) % 2 : -1;
    u.bar[0].visible = flash !== 1;
    u.bar[1].visible = flash !== 0;
  }
}

function explode(v) {
  v.dead = true;
  v.driver = null;
  v.siren = false;
  v.mesh.traverse((o) => {
    if (o.isMesh && o.material === lampGlowMat) o.visible = false;
    else if (o.isMesh) o.material = wreckMat;
  });
  for (let k = 0; k < 60; k++) {
    puff(v.x, 1, v.z, rand(-9, 9), rand(2, 14), rand(-9, 9), rand(0.5, 1.3), 1, rand(0.3, 0.7), 0.1, 10);
  }
  const [px, pz] = focus();
  const d = Math.hypot(v.x - px, v.z - pz);
  sfx.boom(clamp(1 - d / 150, 0, 1));
  if (d < 40) cam.shake = 0.8;
  for (const other of vehicles) {
    if (other !== v && dist2(other.x, other.z, v.x, v.z) < 81) damageVehicle(other, 55);
  }
  for (const ped of peds) {
    if (dist2(ped.x, ped.z, v.x, v.z) < 64) downPed(ped, (ped.x - v.x) * 2, (ped.z - v.z) * 2, false);
  }
  scare(v.x, v.z, 60, 10);
  if (player.car === v) {
    exitCar();
    hurt(999, 'wasted');
  } else if (!player.car && d < 9) {
    hurt(70 - d * 6, 'wasted');
  }
}

function collideVehicles() {
  for (let a = 0; a < vehicles.length; a++) {
    const A = vehicles[a];
    for (let b = a + 1; b < vehicles.length; b++) {
      const B = vehicles[b];
      if (dist2(A.x, A.z, B.x, B.z) > 42) continue;
      for (const sa of [1, -1]) {
        for (const sb of [1, -1]) {
          const oa = A.t.len * 0.3 * sa;
          const ob = B.t.len * 0.3 * sb;
          let nx = A.x + Math.sin(A.h) * oa - (B.x + Math.sin(B.h) * ob);
          let nz = A.z + Math.cos(A.h) * oa - (B.z + Math.cos(B.h) * ob);
          const reach = (A.t.wid + B.t.wid) * 0.54;
          const d2 = nx * nx + nz * nz;
          if (d2 >= reach * reach || d2 < 1e-6) continue;
          const d = Math.sqrt(d2);
          nx /= d;
          nz /= d;
          const pen = (reach - d) * 0.5;
          A.x += nx * pen;
          A.z += nz * pen;
          B.x -= nx * pen;
          B.z -= nz * pen;
          A.h -= clamp((((nz * Math.sin(A.h) - nx * Math.cos(A.h)) * pen) / oa) * 0.5, -0.06, 0.06);
          B.h += clamp((((nz * Math.sin(B.h) - nx * Math.cos(B.h)) * pen) / ob) * 0.5, -0.06, 0.06);
          const rel = (A.vx - B.vx) * nx + (A.vz - B.vz) * nz;
          if (rel >= 0) continue;
          const push = -rel * 0.6;
          A.vx += nx * push;
          A.vz += nz * push;
          B.vx -= nx * push;
          B.vz -= nz * push;
          impact(A, -rel * 0.8);
          impact(B, -rel * 0.8);
          const mine = A.driver === 'player' ? B : B.driver === 'player' ? A : null;
          if (mine && -rel > 5) crime(mine.type === 'police' ? 1.3 : mine.driver ? 0.3 : 0);
        }
      }
    }
  }
}

function vehiclesVsPeople(dt) {
  for (const v of vehicles) {
    const speed = Math.hypot(v.vx, v.vz);
    const reach = v.t.wid * 0.56 + 0.4;
    for (const end of [1, -1]) {
      const cx = v.x + Math.sin(v.h) * v.t.len * 0.3 * end;
      const cz = v.z + Math.cos(v.h) * v.t.len * 0.3 * end;
      if (speed > 2) {
        for (const ped of peds) {
          if (ped.state === 'down' || dist2(ped.x, ped.z, cx, cz) > reach * reach) continue;
          if (speed > 5) {
            downPed(ped, v.vx, v.vz, v.driver === 'player');
            sfx.crash(0.25);
          } else if (ped.state !== 'flee') {
            scare(cx, cz, 4, 3);
          }
        }
      }
      if (player.car || state !== 'play') continue;
      const dx = player.x - cx;
      const dz = player.z - cz;
      const d = Math.hypot(dx, dz);
      if (d >= reach || d < 1e-4) continue;
      const closing = (v.vx * dx + v.vz * dz) / d;
      player.x += (dx / d) * (reach - d);
      player.z += (dz / d) * (reach - d);
      if (closing > 5) {
        hurt(closing * 1.5, 'wasted');
        player.x += (v.vx / speed) * 1.5;
        player.z += (v.vz / speed) * 1.5;
      }
    }
  }
}

// ---------- getting in and out ----------
function ejectDriver(v) {
  const ped = addPed(v.x + Math.cos(v.h) * 1.8, v.z - Math.sin(v.h) * 1.8);
  ped.state = 'flee';
  ped.fx = v.x;
  ped.fz = v.z;
  ped.timer = 12;
  v.driver = null;
  v.siren = false;
}

function enterCar(v) {
  if (player.lastCar && player.lastCar !== v) player.lastCar.keep = false;
  if (v.driver) {
    const cop = v.type === 'police';
    ejectDriver(v);
    crime(cop ? 3 : 0.8);
  }
  player.car = player.lastCar = v;
  v.driver = 'player';
  v.keep = true;
  player.mesh.visible = false;
  sfx.door();
  toast('veh', v.t.name);
  if (v.type === 'taxi' && !mission.active && !cab.on) hint('City Cab: press T to pick up fares.', 5);
  if (radio.station === 0 && !radio.touched) setStation(1);
}

function exitCar() {
  const v = player.car;
  if (!v) return;
  v.driver = null;
  player.car = null;
  const lx = Math.cos(v.h);       // driver's side (left)
  const lz = -Math.sin(v.h);
  const reach = v.t.wid / 2 + 0.9;
  let x = v.x + lx * reach;
  let z = v.z + lz * reach;
  if (insideBox(x, z)) {
    x = v.x - lx * reach;
    z = v.z - lz * reach;
  }
  player.x = x;
  player.z = z;
  player.h = v.h;
  player.mesh.visible = true;
  sfx.door();
}

function tryEnterExit() {
  if (player.car) {
    if (Math.hypot(player.car.vx, player.car.vz) > 7) {
      hint('Slow down to get out');
      return;
    }
    exitCar();
    return;
  }
  let best = null;
  let bestD = 18;
  for (const v of vehicles) {
    const d = dist2(v.x, v.z, player.x, player.z);
    if (!v.dead && v.hp > 0 && d < bestD) {
      bestD = d;
      best = v;
    }
  }
  if (best) enterCar(best);
}

// ---------- player on foot ----------
function updatePlayerOnFoot(dt) {
  const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const s = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  let mx = Math.sin(cam.yaw) * f - Math.cos(cam.yaw) * s;
  let mz = Math.cos(cam.yaw) * f + Math.sin(cam.yaw) * s;
  const len = Math.hypot(mx, mz);
  player.speed = 0;
  if (len > 0) {
    player.speed = keys.ShiftLeft || keys.ShiftRight ? 7.6 : 4.3;
    mx /= len;
    mz /= len;
    player.h += wrapPi(Math.atan2(mx, mz) - player.h) * Math.min(1, dt * 12);
    player.phase += player.speed * dt * 2.3;
  }
  if (player.fireT > 0) player.h = cam.yaw;
  if (keys.Space && player.y === 0) player.vy = 6.2;
  player.y += player.vy * dt;
  player.vy -= 19 * dt;
  if (player.y <= 0) {
    player.y = 0;
    player.vy = 0;
  }
  pushOut(player.x + mx * player.speed * dt, player.z + mz * player.speed * dt, 0.42, tmpHit);
  player.x = clamp(tmpHit.x, -LIMIT, LIMIT);
  player.z = clamp(tmpHit.z, -LIMIT, LIMIT);

  animPerson(player.mesh, player.phase, player.speed > 5 ? 0.95 : player.speed > 0 ? 0.55 : 0);
  if (player.fireT > 0 || player.punchT > 0) player.mesh.userData.arms[1].rotation.x = -1.5;
  player.mesh.position.set(player.x, player.y, player.z);
  player.mesh.rotation.set(0, player.h, 0);
}
