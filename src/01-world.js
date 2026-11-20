// =====================================================================
// NEON COAST - part 1: constants, helpers, renderer, city generation
// =====================================================================
const T = THREE;

// ---------- city layout ----------
const BLOCK = 64;                 // building block edge (m)
const ROAD = 20;                  // road width (m)
const CELL = BLOCK + ROAD;        // one road strip + one block
const N = 10;                     // blocks per side
const WORLD = N * CELL + ROAD;    // city edge length
const HALF = WORLD / 2;
const SHORE = 50;                 // sand ring around the city
const LIMIT = HALF + SHORE - 3;   // nobody goes past the waterline
const LANE = 3.2;                 // lane centre offset from road centre
const PARK = 8.3;                 // parked-car offset from road centre
const WALK = 5;                   // sidewalk width inside a block
const DX = [1, 0, -1, 0];         // direction index -> unit vector
const DZ = [0, 1, 0, -1];

// ---------- helpers ----------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const wrapPi = (a) => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
};
const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
const rand = (a, b) => a + Math.random() * (b - a);
const irand = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = seeded(20261120);       // the city is the same every time
const pickR = (arr) => arr[Math.floor(R() * arr.length)];

const roadC = (i) => -HALF + i * CELL + ROAD / 2;        // centre line of road i
const blockMin = (i) => -HALF + i * CELL + ROAD;         // low edge of block i
const cellOf = (x) => Math.floor((x + HALF) / CELL);     // cell (road + block) index
const nodeOf = (x) => clamp(Math.round((x + HALF - ROAD / 2) / CELL), 0, N);
const headingOf = (d) => Math.atan2(DX[d], DZ[d]);

// ---------- save data ----------
const SAVE_KEY = 'neon-coast-save-v1';
const SAVE_DEFAULTS = { money: 200, mission: 0, packages: [], ferryRuns: 0, ferryBest: 0, difficulty: 1, quality: 1, sound: 1 };
const save = Object.assign({}, SAVE_DEFAULTS);
try {
  Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'));
} catch (err) {
  // storage blocked: play without saving
}
function persist() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (err) {
    // ignore
  }
}
const DIFFICULTY = [
  { name: 'Easy', aim: 0.16, dmg: 0.6, time: 1.35, cops: 0, evade: 0.75 },
  { name: 'Normal', aim: 0.28, dmg: 1.0, time: 1.0, cops: 0, evade: 1.0 },
  { name: 'Hard', aim: 0.42, dmg: 1.4, time: 0.85, cops: 1, evade: 1.3 },
];
const diff = () => DIFFICULTY[save.difficulty];

// ---------- shared state ----------
const vehicles = [];
const peds = [];
const pickups = [];
const markers = [];
const keys = {};
let state = 'title';              // title | play | paused | dead
let tod = 17.4;                   // time of day in hours
const cam = { yaw: Math.PI, pitch: -0.2, dist: 6, shake: 0, lastMouse: 0 };

// ---------- renderer ----------
const canvas = document.getElementById('view');
const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.type = T.PCFSoftShadowMap;
const scene = new T.Scene();
scene.fog = new T.Fog(0x88aacc, 140, 1150);
const camera = new T.PerspectiveCamera(62, 1, 0.35, 2600);

const hemi = new T.HemisphereLight(0xbfd8ff, 0x3a3540, 0.8);
const sun = new T.DirectionalLight(0xffffff, 1);
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -75;
sun.shadow.camera.right = sun.shadow.camera.top = 75;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 420;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.4;
const headlight = new T.SpotLight(0xfff2cf, 0, 70, 0.62, 0.55, 1.1);
scene.add(hemi, sun, sun.target, headlight, headlight.target);

// ---------- materials and small builders ----------
const boxGeo = new T.BoxGeometry(1, 1, 1);
const lambertCache = {};
const basicCache = {};
const mat = (hex) => lambertCache[hex] || (lambertCache[hex] = new T.MeshLambertMaterial({ color: hex }));
const glowMat = (hex) => basicCache[hex] || (basicCache[hex] = new T.MeshBasicMaterial({ color: hex }));
const hexRGB = (hex) => {
  const c = new T.Color(hex);
  return [c.r, c.g, c.b];
};

function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h || w;
  return c;
}

function radialTexture(inner, outer) {
  const c = mkCanvas(64);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new T.CanvasTexture(c);
}

function instanced(geo, material, list, place) {
  const mesh = new T.InstancedMesh(geo, material, list.length);
  const dummy = new T.Object3D();
  list.forEach((item, k) => {
    dummy.position.set(0, 0, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    place(dummy, item);
    dummy.updateMatrix();
    mesh.setMatrixAt(k, dummy.matrix);
    if (item.color) mesh.setColorAt(k, item.color);
  });
  mesh.frustumCulled = false;     // instances are spread over the whole city
  scene.add(mesh);
  return mesh;
}

function labelSprite(text, color) {
  const c = mkCanvas(256, 64);
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(8,10,24,0.78)';
  g.fillRect(0, 6, 256, 52);
  g.fillStyle = color;
  g.fillRect(0, 6, 256, 4);
  g.font = 'bold 30px "Segoe UI", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 35);
  const sprite = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), transparent: true, fog: false }));
  sprite.scale.set(9, 2.25, 1);
  return sprite;
}

// ---------- ground ----------
function groundCanvas() {
  const size = 1024;
  const c = mkCanvas(size);
  const g = c.getContext('2d');
  const s = size / CELL;          // pixels per metre
  g.fillStyle = '#2b2d34';
  g.fillRect(0, 0, size, size);
  for (let k = 0; k < 6000; k++) {
    g.fillStyle = `rgba(255,255,255,${R() * 0.04})`;
    g.fillRect(R() * size, R() * size, 2, 2);
  }
  // sidewalk slab covering the block
  const b0 = ROAD * s;
  const bs = BLOCK * s;
  g.fillStyle = '#8b8d96';
  g.fillRect(b0, b0, bs, bs);
  g.strokeStyle = 'rgba(0,0,0,0.12)';
  g.lineWidth = 1;
  for (let k = 0; k <= BLOCK; k += 2) {
    g.beginPath();
    g.moveTo(b0 + k * s, b0);
    g.lineTo(b0 + k * s, b0 + bs);
    g.moveTo(b0, b0 + k * s);
    g.lineTo(b0 + bs, b0 + k * s);
    g.stroke();
  }
  g.strokeStyle = '#c3c5cc';
  g.lineWidth = 4;
  g.strokeRect(b0 + 2, b0 + 2, bs - 4, bs - 4);
  // centre dashes (both road directions)
  const mid = (ROAD / 2) * s;
  g.fillStyle = '#d9b343';
  for (let v = ROAD + 4; v < CELL - 5; v += 6) {
    g.fillRect(mid - 1.5, v * s, 3, 3 * s);
    g.fillRect(v * s, mid - 1.5, 3 * s, 3);
  }
  // parking lane lines
  g.fillStyle = 'rgba(255,255,255,0.3)';
  for (const off of [ROAD / 2 - 6.8, ROAD / 2 + 6.8]) {
    g.fillRect(off * s - 1, (ROAD + 4) * s, 2, (BLOCK - 8) * s);
    g.fillRect((ROAD + 4) * s, off * s - 1, (BLOCK - 8) * s, 2);
  }
  // crosswalks
  g.fillStyle = 'rgba(238,238,238,0.82)';
  for (let x = 1; x < ROAD - 1; x += 2) {
    g.fillRect(x * s, (ROAD + 0.5) * s, s, 2.6 * s);
    g.fillRect(x * s, (CELL - 3.1) * s, s, 2.6 * s);
    g.fillRect((ROAD + 0.5) * s, x * s, 2.6 * s, s);
    g.fillRect((CELL - 3.1) * s, x * s, 2.6 * s, s);
  }
  return c;
}

function buildGround() {
  const tex = new T.CanvasTexture(groundCanvas());
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.flipY = false;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const rep = WORLD / CELL;
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute([-HALF, 0, -HALF, -HALF, 0, HALF, HALF, 0, HALF, HALF, 0, -HALF], 3));
  geo.setAttribute('normal', new T.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  geo.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 0, rep, rep, rep, rep, 0], 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const city = new T.Mesh(geo, new T.MeshLambertMaterial({ map: tex }));
  city.receiveShadow = true;
  scene.add(city);

  const sand = new T.Mesh(new T.PlaneGeometry(2 * (HALF + SHORE), 2 * (HALF + SHORE)), mat('#d8c391'));
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = -0.06;
  sand.receiveShadow = true;
  const water = new T.Mesh(
    new T.PlaneGeometry(9000, 9000),
    new T.MeshLambertMaterial({ color: '#1c7391', emissive: '#0a2a3a' })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.7;
  scene.add(sand, water);
}

// ---------- buildings ----------
const blocks = [];                // blocks[i][j] = {type, x0, z0, x1, z1, boxes, circles}
const blockAt = (i, j) => (i >= 0 && j >= 0 && i < N && j < N ? blocks[i][j] : null);
const freeSpots = [];             // hidden-package candidates (alleys, parks, sand)
const bld = { pos: [], nor: [], uv: [], col: [], idx: [] };
const neonBars = [];
const trees = [];
const palms = [];
const lamps = [];
const PARKS = new Set(['5,4', '1,2', '7,7']);
const PALETTE = {
  downtown: ['#9fb4c7', '#7f93a8', '#c9d3dc', '#6c7f96', '#b8a99a', '#8fa0b5'],
  beach: ['#ffb3c7', '#ffe0a3', '#a8f0e0', '#ffd1e8', '#b9e3ff', '#fff1d6'],
  suburb: ['#e8d6c0', '#d9c2a7', '#c4d4c0', '#e3c9c9', '#cfd6e3', '#f0e4cc'],
  industrial: ['#8a8a84', '#9a8f80', '#7b8288', '#a39a8c'],
};
const NEON = ['#ff3fa4', '#3fe0ff', '#b56bff', '#ff8a3f', '#57ff9a', '#ffe14f'];

function districtOf(i, j) {
  if (PARKS.has(i + ',' + j)) return 'park';
  if (i >= N - 1) return 'beach';
  if (j >= N - 2 && i <= 3) return 'industrial';
  if (Math.hypot(i - 4.3, j - 4.5) < 2.4) return 'downtown';
  return 'suburb';
}

function face(a, b, c, d, normal, u, v, col, uo, vo) {
  const base = bld.pos.length / 3;
  bld.pos.push(...a, ...b, ...c, ...d);
  for (let k = 0; k < 4; k++) {
    bld.nor.push(...normal);
    bld.col.push(...col);
  }
  bld.uv.push(uo, vo, uo + u, vo, uo + u, vo + v, uo, vo + v);
  bld.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function addBox(x0, x1, z0, z1, y0, y1, col) {
  // the window texture holds 8 x 8 windows; give every wall a whole number of them
  const cells = (len) => Math.max(1, Math.round(len / 3.5)) / 8;
  const uo = Math.floor(R() * 8) / 8;
  const vo = Math.floor(R() * 8) / 8;
  const v = cells(y1 - y0);
  face([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], cells(z1 - z0), v, col, uo, vo);
  face([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], cells(z1 - z0), v, col, uo, vo);
  face([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], cells(x1 - x0), v, col, uo, vo);
  face([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], cells(x1 - x0), v, col, uo, vo);
  const roof = [col[0] * 0.42, col[1] * 0.42, col[2] * 0.42];
  face([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0], 0, 0, roof, 0.01, 0.01);
}

function neonBand(x0, x1, z0, z1, y, hex) {
  const color = new T.Color(hex);
  const t = 0.35;
  neonBars.push({ x: (x0 + x1) / 2, y, z: z0 - 0.1, sx: x1 - x0 + 0.5, sy: t, sz: 0.25, color });
  neonBars.push({ x: (x0 + x1) / 2, y, z: z1 + 0.1, sx: x1 - x0 + 0.5, sy: t, sz: 0.25, color });
  neonBars.push({ x: x0 - 0.1, y, z: (z0 + z1) / 2, sx: 0.25, sy: t, sz: z1 - z0 + 0.5, color });
  neonBars.push({ x: x1 + 0.1, y, z: (z0 + z1) / 2, sx: 0.25, sy: t, sz: z1 - z0 + 0.5, color });
}

function lotsFor(type, x0, x1, z0, z1) {
  const gap = 5;
  const r = R();
  const mx = (x0 + x1) / 2;
  const mz = (z0 + z1) / 2;
  let split = r < 0.35 ? 2 : 4;
  if (type === 'industrial') split = r < 0.5 ? 1 : 2;
  if (type === 'downtown') split = r < 0.2 ? 1 : r < 0.5 ? 2 : 4;
  if (split === 1) return [[x0, x1, z0, z1]];
  if (split === 2) {
    return R() < 0.5
      ? [[x0, mx - gap / 2, z0, z1], [mx + gap / 2, x1, z0, z1]]
      : [[x0, x1, z0, mz - gap / 2], [x0, x1, mz + gap / 2, z1]];
  }
  freeSpots.push([mx, mz]);       // the alley crossing in the middle
  return [
    [x0, mx - gap / 2, z0, mz - gap / 2],
    [mx + gap / 2, x1, z0, mz - gap / 2],
    [x0, mx - gap / 2, mz + gap / 2, z1],
    [mx + gap / 2, x1, mz + gap / 2, z1],
  ];
}

function buildBlocks() {
  for (let i = 0; i < N; i++) {
    blocks.push([]);
    for (let j = 0; j < N; j++) {
      const x0 = blockMin(i);
      const z0 = blockMin(j);
      const block = { type: districtOf(i, j), x0, z0, x1: x0 + BLOCK, z1: z0 + BLOCK, boxes: [], circles: [] };
      blocks[i].push(block);

      if (block.type === 'park') {
        const grass = new T.Mesh(new T.PlaneGeometry(BLOCK - 8, BLOCK - 8), mat('#3f8f4a'));
        grass.rotation.x = -Math.PI / 2;
        grass.position.set(x0 + BLOCK / 2, 0.05, z0 + BLOCK / 2);
        grass.receiveShadow = true;
        scene.add(grass);
        for (let k = 0; k < 18; k++) {
          const tx = x0 + 8 + R() * (BLOCK - 16);
          const tz = z0 + 8 + R() * (BLOCK - 16);
          trees.push({ x: tx, z: tz, s: 0.8 + R() * 0.7, color: new T.Color().setHSL(0.3 + R() * 0.08, 0.5, 0.26 + R() * 0.1) });
          block.circles.push({ x: tx, z: tz, r: 0.45 });
        }
        freeSpots.push([x0 + BLOCK / 2, z0 + BLOCK / 2]);
        continue;
      }

      const lots = lotsFor(block.type, x0 + WALK, x0 + BLOCK - WALK, z0 + WALK, z0 + BLOCK - WALK);
      const central = clamp(1.3 - Math.hypot(i - 4.3, j - 4.5) * 0.22, 0.55, 1.3);
      for (const lot of lots) {
        const inset = () => R() * (block.type === 'suburb' ? 4.5 : 2);
        const bx0 = lot[0] + inset();
        const bx1 = lot[1] - inset();
        const bz0 = lot[2] + inset();
        const bz1 = lot[3] - inset();
        let h = 7 + R() * 16;
        if (block.type === 'downtown') h = (30 + R() * 95) * central;
        if (block.type === 'beach') h = 9 + R() * 15;
        if (block.type === 'industrial') h = 7 + R() * 6;
        const col = hexRGB(pickR(PALETTE[block.type]));
        addBox(bx0, bx1, bz0, bz1, 0, h, col);
        block.boxes.push({ x0: bx0, x1: bx1, z0: bz0, z1: bz1, h });
        if (h > 55 && R() < 0.6) {
          addBox(bx0 + 4, bx1 - 4, bz0 + 4, bz1 - 4, h, h + 12 + R() * 28, col);
        }
        const chance = block.type === 'downtown' ? 0.5 : block.type === 'beach' ? 0.75 : block.type === 'suburb' ? 0.12 : 0;
        if (R() < chance) neonBand(bx0, bx1, bz0, bz1, h - 0.7, pickR(NEON));
        if (R() < chance) neonBand(bx0, bx1, bz0, bz1, 4.3, pickR(NEON));
      }
    }
  }

  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(bld.pos, 3));
  geo.setAttribute('normal', new T.Float32BufferAttribute(bld.nor, 3));
  geo.setAttribute('uv', new T.Float32BufferAttribute(bld.uv, 2));
  geo.setAttribute('color', new T.Float32BufferAttribute(bld.col, 3));
  geo.setIndex(bld.idx);
  const mesh = new T.Mesh(geo, buildingMat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

function windowTextures() {
  const wall = mkCanvas(256);
  const lit = mkCanvas(256);
  const gw = wall.getContext('2d');
  const gl = lit.getContext('2d');
  gw.fillStyle = '#ececec';
  gw.fillRect(0, 0, 256, 256);
  gl.fillStyle = '#000';
  gl.fillRect(0, 0, 256, 256);
  for (let cx = 0; cx < 8; cx++) {
    for (let cy = 0; cy < 8; cy++) {
      const on = R() < 0.42;
      gw.fillStyle = on ? '#5b6672' : '#2c3540';
      gw.fillRect(cx * 32 + 6, cy * 32 + 7, 20, 19);
      if (on) {
        gl.fillStyle = pickR(['#ffd98a', '#ffe9b8', '#9fd6ff', '#ffc46b']);
        gl.fillRect(cx * 32 + 6, cy * 32 + 7, 20, 19);
      }
    }
  }
  const make = (c) => {
    const tex = new T.CanvasTexture(c);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  };
  return [make(wall), make(lit)];
}
const [wallTex, litTex] = windowTextures();
const buildingMat = new T.MeshLambertMaterial({
  map: wallTex,
  emissiveMap: litTex,
  emissive: 0xffffff,
  emissiveIntensity: 0,
  vertexColors: true,
});

// ---------- street furniture and plants ----------
const lampGlowMat = new T.MeshBasicMaterial({
  map: radialTexture('rgba(255,190,110,0.9)', 'rgba(255,190,110,0)'),
  transparent: true,
  opacity: 0,
  blending: T.AdditiveBlending,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});

function frondGeometry() {
  const pos = [];
  const leaves = 8;
  for (let k = 0; k < leaves; k++) {
    const a = (k / leaves) * Math.PI * 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const px = -dz;
    const pz = dx;
    const b1 = [-px * 0.2, 0, -pz * 0.2];
    const b2 = [px * 0.2, 0, pz * 0.2];
    const m1 = [dx * 1.7 - px * 0.55, 0.55, dz * 1.7 - pz * 0.55];
    const m2 = [dx * 1.7 + px * 0.55, 0.55, dz * 1.7 + pz * 0.55];
    const tip = [dx * 3.5, -0.9, dz * 3.5];
    pos.push(...b1, ...b2, ...m2, ...b1, ...m2, ...m1, ...m1, ...m2, ...tip);
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

function buildProps() {
  // street lamps on two corners of every intersection
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const off = ROAD / 2 + 1.3;
      lamps.push({ x: roadC(i) + off, z: roadC(j) + off });
      lamps.push({ x: roadC(i) - off, z: roadC(j) - off });
    }
  }
  instanced(new T.CylinderGeometry(0.1, 0.16, 7, 6), mat('#3a3d46'), lamps, (d, l) => d.position.set(l.x, 3.5, l.z));
  instanced(boxGeo, glowMat('#ffd9a0'), lamps, (d, l) => {
    d.position.set(l.x, 7.05, l.z);
    d.scale.set(0.9, 0.22, 0.9);
  });
  const glowGeo = new T.PlaneGeometry(17, 17);
  glowGeo.rotateX(-Math.PI / 2);
  instanced(glowGeo, lampGlowMat, lamps, (d, l) => d.position.set(l.x, 0.09, l.z));

  // palms: along the beach road, and scattered on the sand all around the island
  for (let z = -HALF + 12; z < HALF - 8; z += 14) {
    const nearCrossing = Math.abs(((z + HALF) % CELL) - ROAD / 2) < ROAD / 2 + 3;
    if (!nearCrossing) {
      const px = roadC(N - 1) + ROAD / 2 + 1.6;
      palms.push({ x: px, z, s: 0.9 + R() * 0.3 });
      const owner = blockAt(cellOf(px), cellOf(z));
      if (owner) owner.circles.push({ x: px, z, r: 0.35 });
    }
    palms.push({ x: HALF + 6 + R() * 30, z: z + R() * 8, s: 0.9 + R() * 0.5 });
  }
  for (let k = 0; k < 70; k++) {
    const along = -HALF + R() * WORLD;
    const out = HALF + 6 + R() * (SHORE - 14);
    const side = Math.floor(R() * 3);
    if (side === 0) palms.push({ x: -out, z: along, s: 0.9 + R() * 0.5 });
    if (side === 1) palms.push({ x: along, z: out, s: 0.9 + R() * 0.5 });
    if (side === 2) palms.push({ x: along, z: -out, s: 0.9 + R() * 0.5 });
  }
  instanced(new T.CylinderGeometry(0.14, 0.26, 7, 6), mat('#7a5f43'), palms, (d, p) => {
    d.position.set(p.x, 3.5 * p.s, p.z);
    d.scale.set(1, p.s, 1);
  });
  const frondMat = new T.MeshLambertMaterial({ color: '#2f8f4f', side: T.DoubleSide });
  const fronds = instanced(frondGeometry(), frondMat, palms, (d, p) => {
    d.position.set(p.x, 7 * p.s, p.z);
    d.rotation.y = p.x + p.z;
    d.scale.setScalar(p.s);
  });
  fronds.castShadow = true;

  // park trees
  instanced(new T.CylinderGeometry(0.28, 0.4, 3, 6), mat('#5a4332'), trees, (d, t) => d.position.set(t.x, 1.5, t.z));
  const canopy = instanced(new T.IcosahedronGeometry(2.3, 0), new T.MeshLambertMaterial({ color: '#ffffff' }), trees, (d, t) => {
    d.position.set(t.x, 3.6 + t.s, t.z);
    d.rotation.y = t.x;
    d.scale.setScalar(t.s);
  });
  canopy.castShadow = true;

  // neon trim
  instanced(boxGeo, new T.MeshBasicMaterial({ color: '#ffffff' }), neonBars, (d, n) => {
    d.position.set(n.x, n.y, n.z);
    d.scale.set(n.sx, n.sy, n.sz);
  });
}

// ---------- sky ----------
const sky = new T.Mesh(
  new T.SphereGeometry(2100, 24, 12),
  new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new T.Color() }, bot: { value: new T.Color() } },
    vertexShader: `
      varying float h;
      void main() {
        h = normalize(position).y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 top;
      uniform vec3 bot;
      varying float h;
      void main() {
        gl_FragColor = vec4(mix(bot, top, smoothstep(0.0, 0.5, h)), 1.0);
      }`,
  })
);
sky.renderOrder = -2;
const sunDisc = new T.Sprite(
  new T.SpriteMaterial({
    map: radialTexture('rgba(255,235,200,1)', 'rgba(255,170,90,0)'),
    blending: T.AdditiveBlending,
    transparent: true,
    fog: false,
    depthWrite: false,
  })
);
sunDisc.scale.set(420, 420, 1);
const starGeo = new T.BufferGeometry();
{
  const pts = [];
  for (let k = 0; k < 500; k++) {
    const a = R() * Math.PI * 2;
    const e = 0.08 + R() * 1.4;
    pts.push(Math.cos(a) * Math.cos(e) * 1900, Math.sin(e) * 1900, Math.sin(a) * Math.cos(e) * 1900);
  }
  starGeo.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
}
const starMat = new T.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
const stars = new T.Points(starGeo, starMat);
stars.frustumCulled = false;
scene.add(sky, sunDisc, stars);

const SKY = [
  [0, '#050818', '#141a3a'],
  [5, '#0a1030', '#2a2350'],
  [6.5, '#3b5fa8', '#ff9e6e'],
  [9, '#3f8fe0', '#bfe3ff'],
  [16, '#3f8fe0', '#c9e6ff'],
  [18.2, '#5a4a9c', '#ff7f6a'],
  [19.3, '#2a1b5a', '#ff4f8f'],
  [20.5, '#0a0d28', '#3a1d55'],
  [24, '#050818', '#141a3a'],
];
const skyTop = new T.Color();
const skyBot = new T.Color();
const tmpColor = new T.Color();
let nightAmount = 0;

function updateSky(dt, fx, fz) {
  tod = (tod + dt / 60) % 24;     // one game minute per real second
  let k = 0;
  while (SKY[k + 1][0] < tod) k++;
  const a = SKY[k];
  const b = SKY[k + 1];
  const f = (tod - a[0]) / (b[0] - a[0]);
  skyTop.set(a[1]).lerp(tmpColor.set(b[1]), f);
  skyBot.set(a[2]).lerp(tmpColor.set(b[2]), f);
  sky.material.uniforms.top.value.copy(skyTop);
  sky.material.uniforms.bot.value.copy(skyBot);
  scene.fog.color.copy(skyBot);

  const day = smooth(5.5, 7.5, tod) - smooth(18.2, 20, tod);
  nightAmount = 1 - day;
  const ang = ((tod - 6) / 12) * Math.PI;
  const sx = Math.cos(ang);
  const sy = Math.sin(ang);
  const up = sy > 0;
  const lift = clamp(Math.abs(sy) * 3, 0, 1);
  sun.position.set(fx + (up ? sx : -sx) * 150, Math.max(0.28, Math.abs(sy)) * 150, fz + 55);
  sun.target.position.set(fx, 0, fz);
  sun.color.set('#8fa6ff');
  if (up) sun.color.lerp(tmpColor.set('#ff9a5c'), clamp(sy * 6, 0, 1)).lerp(tmpColor.set('#fff1dc'), lift);
  sun.intensity = up ? 0.22 + 0.75 * lift : 0.22;
  hemi.intensity = 0.42 + 0.42 * day;
  hemi.color.copy(skyTop).lerp(tmpColor.set('#ffffff'), 0.45);

  buildingMat.emissiveIntensity = nightAmount * 0.95;
  lampGlowMat.opacity = nightAmount * 0.55;
  starMat.opacity = nightAmount * 0.9;
  sky.position.copy(camera.position);
  stars.position.copy(camera.position);
  sunDisc.visible = sy > -0.12;
  sunDisc.position.set(camera.position.x + sx * 1700, camera.position.y + sy * 1700, camera.position.z + 620);
}

// ---------- collision queries ----------
const tmpHit = { x: 0, z: 0, hit: false, nx: 0, nz: 0 };

// Push a circle out of every building and tree trunk it overlaps.
function pushOut(x, z, r, out) {
  out.x = x;
  out.z = z;
  out.hit = false;
  const i0 = cellOf(x - r);
  const i1 = cellOf(x + r);
  const j0 = cellOf(z - r);
  const j1 = cellOf(z + r);
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const block = blockAt(i, j);
      if (!block) continue;
      for (const q of block.boxes) {
        const cx = clamp(out.x, q.x0, q.x1);
        const cz = clamp(out.z, q.z0, q.z1);
        let dx = out.x - cx;
        let dz = out.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        let pen;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          dx /= d;
          dz /= d;
          pen = r - d;
        } else {
          // centre is inside the box: leave through the nearest wall
          const toL = out.x - q.x0;
          const toR = q.x1 - out.x;
          const toT = out.z - q.z0;
          const toB = q.z1 - out.z;
          const m = Math.min(toL, toR, toT, toB);
          dx = 0;
          dz = 0;
          if (m === toL) dx = -1;
          else if (m === toR) dx = 1;
          else if (m === toT) dz = -1;
          else dz = 1;
          pen = m + r;
        }
        out.x += dx * pen;
        out.z += dz * pen;
        out.hit = true;
        out.nx = dx;
        out.nz = dz;
      }
      for (const c of block.circles) {
        const dx = out.x - c.x;
        const dz = out.z - c.z;
        const rr = r + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr || d2 < 1e-9) continue;
        const d = Math.sqrt(d2);
        out.x += (dx / d) * (rr - d);
        out.z += (dz / d) * (rr - d);
        out.hit = true;
        out.nx = dx / d;
        out.nz = dz / d;
      }
    }
  }
}

function insideBox(x, z) {
  const block = blockAt(cellOf(x), cellOf(z));
  if (!block) return null;
  for (const q of block.boxes) {
    if (x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1) return q;
  }
  return null;
}

function clearLine(x0, z0, x1, z1) {
  const d = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.ceil(d / 3);
  for (let k = 1; k < steps; k++) {
    const f = k / steps;
    if (insideBox(lerp(x0, x1, f), lerp(z0, z1, f))) return false;
  }
  return true;
}

function rayBox(ox, oy, oz, dx, dy, dz, q) {
  let t0 = 0;
  let t1 = 1e9;
  const axes = [
    [ox, dx, q.x0, q.x1],
    [oy, dy, 0, q.h],
    [oz, dz, q.z0, q.z1],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return -1;
      continue;
    }
    let a = (lo - o) / d;
    let b = (hi - o) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return -1;
  }
  return t0;
}

function zoneName(x, z) {
  if (Math.abs(x) > HALF || Math.abs(z) > HALF) return 'The Shoreline';
  const i = clamp(cellOf(x), 0, N - 1);
  const j = clamp(cellOf(z), 0, N - 1);
  const type = blocks[i][j].type;
  if (type === 'downtown') return 'Meridian';
  if (type === 'beach') return 'Sol Beach';
  if (type === 'industrial') return 'Rustport';
  if (type === 'park') return 'Verde Park';
  return i < 4 ? 'Palmera' : j < 4 ? 'North Maren' : 'Little Coral';
}

buildGround();
buildBlocks();
buildProps();
