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
const SAVE_DEFAULTS = { money: 200, mission: 0, packages: [], tune: 0, ferryRuns: 0, ferryBest: 0, fares: 0, fareBest: 0, props: {}, spotted: [], difficulty: 1, quality: 1, sound: 1 };
const save = Object.assign({}, SAVE_DEFAULTS);
try {
  Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'));
} catch (err) {
  // storage blocked: play without saving
}
save.packages = (save.packages || []).slice();       // never share the default objects
save.props = Object.assign({}, save.props);
save.spotted = (save.spotted || []).slice();
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
  let px = 30;
  do g.font = 'bold ' + px + 'px "Segoe UI", Arial, sans-serif';
  while (g.measureText(text).width > 236 && --px > 14);
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

// sea: moving ripples, sky colour at shallow angles, a glitter path under the sun or moon
const waterMat = new T.ShaderMaterial({
  uniforms: {
    time: { value: 0 },
    deep: { value: new T.Color('#0d4f6b') },      // set every frame: teal by day, dark by night
    skyC: { value: new T.Color() },
    sunC: { value: new T.Color() },
    sunDir: { value: new T.Vector3(0, 1, 0) },
    fogC: { value: new T.Color() },
  },
  vertexShader: `
    varying vec3 wp;
    void main() {
      vec4 world = modelMatrix * vec4(position, 1.0);
      wp = world.xyz;
      gl_Position = projectionMatrix * viewMatrix * world;
    }`,
  fragmentShader: `
    uniform float time;
    uniform vec3 deep;
    uniform vec3 skyC;
    uniform vec3 sunC;
    uniform vec3 sunDir;
    uniform vec3 fogC;
    varying vec3 wp;
    void main() {
      vec2 p = wp.xz * 0.11;
      float gx = cos(p.x * 1.3 + time * 0.9) * 1.3 + cos((p.x + p.y) * 0.9 + time * 1.3) * 0.9 + cos((p.x - p.y) * 2.3 - time * 1.1) * 2.3;
      float gz = cos(p.y * 1.7 - time * 0.7) * 1.7 + cos((p.x + p.y) * 0.9 + time * 1.3) * 0.9 - cos((p.x - p.y) * 2.3 - time * 1.1) * 2.3;
      vec3 toEye = cameraPosition - wp;
      float far = length(toEye);
      vec3 v = toEye / far;
      vec3 n = normalize(vec3(-gx, 14.0 + far * 0.08, -gz));
      float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
      vec3 col = mix(deep, skyC, 0.12 + 0.8 * fres);
      float glint = pow(max(dot(reflect(-sunDir, n), v), 0.0), 90.0);
      col += sunC * glint * 0.9;
      gl_FragColor = vec4(mix(col, fogC, smoothstep(140.0, 1150.0, far)), 1.0);
    }`,
});

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

  const sand = new T.Mesh(new T.PlaneGeometry(2 * (HALF + SHORE), 2 * (HALF + SHORE)), mat('#cdae78'));
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = -0.06;
  sand.receiveShadow = true;
  const water = new T.Mesh(new T.PlaneGeometry(9000, 9000), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.7;
  scene.add(sand, water);
}

// ---------- buildings ----------
const blocks = [];                // blocks[i][j] = {type, x0, z0, x1, z1, boxes, circles}
const blockAt = (i, j) => (i >= 0 && j >= 0 && i < N && j < N ? blocks[i][j] : null);
const freeSpots = [];             // hidden-package candidates (alleys, parks, sand)
const bld = { pos: [], nor: [], uv: [], col: [], idx: [] };
const shopWalls = { pos: [], nor: [], uv: [], col: [], idx: [] };    // street-level storefronts
const SHOP_H = 4.4;
const RT = seeded(31337);         // extra detail; its own stream so the city layout stays the same
const neonBars = [];
const trees = [];
const palms = [];
const lamps = [];
const PARKS = new Set(['5,4', '1,2', '7,7']);
const PALETTE = {
  downtown: ['#8fc3d4', '#6f8fb4', '#ece4d2', '#5f86a8', '#f0b79c', '#b3a4dc'],
  beach: ['#ffb3c7', '#ffe0a3', '#a8f0e0', '#ffd1e8', '#b9e3ff', '#fff1d6'],
  suburb: ['#e8d6c0', '#d9c2a7', '#c4d4c0', '#e3c9c9', '#cfd6e3', '#f0e4cc'],
  industrial: ['#a9684c', '#9a8f80', '#6c8d94', '#c4a45e'],
};
const NEON = ['#ff3fa4', '#3fe0ff', '#b56bff', '#ff8a3f', '#57ff9a', '#ffe14f'];

function districtOf(i, j) {
  if (PARKS.has(i + ',' + j)) return 'park';
  if (i >= N - 1) return 'beach';
  if (j >= N - 2 && i <= 3) return 'industrial';
  if (Math.hypot(i - 4.3, j - 4.5) < 2.4) return 'downtown';
  return 'suburb';
}

function face(a, b, c, d, normal, u, v, col, uo, vo, into, foot) {
  const buf = into || bld;
  const base = buf.pos.length / 3;
  buf.pos.push(...a, ...b, ...c, ...d);
  for (let k = 0; k < 4; k++) {
    buf.nor.push(...normal);
    buf.col.push(...(foot && k < 2 ? foot : col));   // a and b are the bottom edge of a wall
  }
  buf.uv.push(uo, vo, uo + u, vo, uo + u, vo + v, uo, vo + v);
  buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function addBox(x0, x1, z0, z1, y0, y1, col, rng, shops) {
  // the window texture holds 8 x 8 windows; give every wall a whole number of them
  const cells = (len) => Math.max(1, Math.round(len / 3.5)) / 8;
  const random = rng || R;
  const uo = Math.floor(random() * 8) / 8;
  const vo = Math.floor(random() * 8) / 8;
  if (shops) {
    // the ground floor is a row of storefronts (4 different ones in the texture, each 8 m wide)
    const y2 = y0 + SHOP_H;
    const tiles = (len) => Math.max(1, Math.round(len / 8)) / 4;
    const so = Math.floor(RT() * 4) / 4;
    face([x1, y0, z1], [x1, y0, z0], [x1, y2, z0], [x1, y2, z1], [1, 0, 0], tiles(z1 - z0), 1, col, so, 0, shopWalls);
    face([x0, y0, z0], [x0, y0, z1], [x0, y2, z1], [x0, y2, z0], [-1, 0, 0], tiles(z1 - z0), 1, col, so + 0.25, 0, shopWalls);
    face([x0, y0, z1], [x1, y0, z1], [x1, y2, z1], [x0, y2, z1], [0, 0, 1], tiles(x1 - x0), 1, col, so + 0.5, 0, shopWalls);
    face([x1, y0, z0], [x0, y0, z0], [x0, y2, z0], [x1, y2, z0], [0, 0, -1], tiles(x1 - x0), 1, col, so + 0.75, 0, shopWalls);
    y0 = y2;
  }
  const v = cells(y1 - y0);
  // weathered at the foot, sun-bleached at the top: taller walls fade further
  const fade = clamp(0.9 - (y1 - y0) * 0.004, 0.62, 0.9);
  const foot = [col[0] * fade, col[1] * fade, col[2] * (fade + 0.04)];
  const top = [Math.min(1, col[0] * 1.06), Math.min(1, col[1] * 1.06), Math.min(1, col[2] * 1.06)];
  face([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], cells(z1 - z0), v, top, uo, vo, null, foot);
  face([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], cells(z1 - z0), v, top, uo, vo, null, foot);
  face([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], cells(x1 - x0), v, top, uo, vo, null, foot);
  face([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], cells(x1 - x0), v, top, uo, vo, null, foot);
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

// shop signs and roof clutter; a separate random stream keeps the existing city layout unchanged
const SIGN_NAMES = {
  downtown: ['MERIDIAN BANK', 'LUNA LOUNGE', 'PIXEL ARCADE', 'NOODLE BAR', 'SKY HOTEL', '24H MART', 'VINYL CLUB'],
  beach: ['CAFE BRISA', 'KITE & SURF', 'TIDE HOTEL', 'GELATO', 'SUNSET GRILL', 'BOARD SHOP'],
  suburb: ['CORNER SHOP', 'LAUNDRY', 'PHARMACY', 'BAKERY'],
  industrial: ['RUSTPORT TOOLS', 'TYRES', 'COLD STORE', 'SCRAP & CO'],
};
const SIGN_CHANCE = { downtown: 0.85, beach: 0.8, suburb: 0.35, industrial: 0.5 };
const signs = {};
const roofBits = [];
const hipRoofs = [];
const towerTops = [];
const RS = seeded(4711);
const RD = seeded(1305);          // day dressing: murals, beach, boats; leaves the older streams alone
const murals = [];
const MURAL_KINDS = { beach: [0, 1], downtown: [2, 3], suburb: [4, 5], industrial: [6, 7] };
const MURAL_CHANCE = { beach: 0.7, downtown: 0.45, suburb: 0.2, industrial: 0.85 };
const HIP_COLORS = ['#a8553f', '#8f4a3a', '#5d6470', '#b06a45'].map((hex) => new T.Color(hex));

function dressBuilding(block, x0, x1, z0, z1, h, roofInset, shops, wallTop) {
  const hip = block.type === 'suburb' && h < 15;
  if (hip) {
    hipRoofs.push({
      x: (x0 + x1) / 2, z: (z0 + z1) / 2, y: h, sx: x1 - x0 + 1.2, sz: z1 - z0 + 1.2,
      rise: 2.4 + ((x0 * 7 + z0 * 13) % 10 + 10) % 10 * 0.14,
      color: HIP_COLORS[Math.abs(Math.round(x0 + z0)) % HIP_COLORS.length],
    });
  }
  if (h < 70) {
    const count = 1 + Math.floor(RS() * 3);
    for (let k = 0; k < count; k++) {
      const sx = 1.6 + RS() * 2.6;
      const sz = 1.6 + RS() * 2.6;
      const sy = 0.9 + RS() * 1.5;
      if (hip || x1 - x0 < sx + 4 || z1 - z0 < sz + 4) continue;
      const edge = 2 + (roofInset || 0);
      roofBits.push({
        x: clamp(x0 + 2 + sx / 2 + RS() * (x1 - x0 - sx - 4), x0 + edge + sx / 2, x1 - edge - sx / 2),
        y: h + sy / 2,
        z: clamp(z0 + 2 + sz / 2 + RS() * (z1 - z0 - sz - 4), z0 + edge + sz / 2, z1 - edge - sz / 2),
        sx, sy, sz,
      });
    }
  }
  const names = SIGN_NAMES[block.type];
  if (!names) return;
  const near = WALK + 7;        // only walls that face a street get a sign
  const streetFaces = [x0 - block.x0 < near, block.x1 - x1 < near, z0 - block.z0 < near, block.z1 - z1 < near];
  const turn = [-Math.PI / 2, Math.PI / 2, Math.PI, 0];
  const signed = [false, false, false, false];
  for (let f = 0; f < 4; f++) {
    const along = f < 2 ? z1 - z0 : x1 - x0;
    if (!streetFaces[f] || along < 11 || RS() > SIGN_CHANCE[block.type]) continue;
    const text = names[Math.floor(RS() * names.length)];
    const slide = (RS() - 0.5) * (along - 10);
    const x = f === 0 ? x0 - 0.14 : f === 1 ? x1 + 0.14 : (x0 + x1) / 2 + slide;
    const z = f === 2 ? z0 - 0.14 : f === 3 ? z1 + 0.14 : (z0 + z1) / 2 + slide;
    (signs[text] || (signs[text] = [])).push({ x, z, rot: turn[f] });
    signed[f] = true;
  }
  // one painted wall on some buildings: the first street side with room for it
  if (RD() > MURAL_CHANCE[block.type]) return;
  const first = Math.floor(RD() * 4);
  for (let n = 0; n < 4; n++) {
    const f = (first + n) % 4;
    const along = f < 2 ? z1 - z0 : x1 - x0;
    const y0 = signed[f] ? 7.1 : shops ? SHOP_H + 0.7 : 1.1;
    let tall = Math.min(wallTop - 1.2 - y0, 11);
    const w = Math.min(along - 3, 18, tall * 1.9);
    if (w < tall * 1.4) tall = w / 1.4;         // keep the picture close to the 1.6 : 1 it was painted at
    if (!streetFaces[f] || w < 7 || tall < 4.4) continue;
    murals.push({ f, w, tall, y0, kind: MURAL_KINDS[block.type][Math.floor(RD() * 2)],
      x: f === 0 ? x0 - 0.09 : f === 1 ? x1 + 0.09 : (x0 + x1) / 2,
      z: f === 2 ? z0 - 0.09 : f === 3 ? z1 + 0.09 : (z0 + z1) / 2 });
    break;
  }
}

// ---------- outlines: a roof line for every district, so the skyline is not a row of plain boxes ----------
// Everything here is dressing above or outside the walls: nothing to collide with, its own random stream.
const RO = seeded(2718);
const trimBoxes = [];             // {x, y, z, sx, sy, sz, color}
const trimWedges = [];            // {x, y, z, sx, sy, sz, rot, color}: upright side at -x before turning
const trimDrums = [];             // {x, y, z, r, h, color}
const tint = (col, k) => new T.Color(Math.min(1, col[0] * k), Math.min(1, col[1] * k), Math.min(1, col[2] * k));
const TRIM = {
  white: new T.Color('#f6f0e4'), chimney: new T.Color('#8a5546'), saw: new T.Color('#5d7f86'), glass: new T.Color('#9fd3dc'),
  tank: new T.Color('#b9b2a2'), wood: new T.Color('#8a5a3c'), concrete: new T.Color('#7d7f86'), crane: new T.Color('#e8b53a'),
  hull: new T.Color('#27364f'), keel: new T.Color('#a8432f'),
  deco: ['#ff7fb0', '#3fd6c8', '#ffb347', '#8f9bff'].map((hex) => new T.Color(hex)),
  crates: ['#c0503c', '#2f7fb8', '#e08a2e', '#3f9f68', '#e5c443', '#7d5aa8', '#d9d4c8', '#1f8f8f'].map((hex) => new T.Color(hex)),
};

function slab(x0, x1, z0, z1, y, thick, color, over) {
  trimBoxes.push({ x: (x0 + x1) / 2, y: y + thick / 2, z: (z0 + z1) / 2, sx: x1 - x0 + over * 2, sy: thick, sz: z1 - z0 + over * 2, color });
}

function shapeBuilding(block, x0, x1, z0, z1, h, waist, step, top, col, mural) {
  const type = block.type;
  const w = x1 - x0;
  const d = z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const roll = RO();
  const roll2 = RO();
  const roll3 = RO();
  if (type === 'suburb' && h < 15) {
    // houses: a chimney through the pitched roof
    if (roll < 0.7) trimBoxes.push({ x: cx + (roll2 - 0.5) * w * 0.4, y: h + 1.9, z: cz + (roll3 - 0.5) * d * 0.4, sx: 1.1, sy: 3.8, sz: 1.1, color: TRIM.chimney });
    return;
  }
  // every flat roof gets an edge that overhangs the wall and throws a shadow line
  const lip = tint(col, type === 'beach' ? 1.14 : 0.74);
  const tiered = waist < h;
  if (tiered) slab(x0, x1, z0, z1, waist, 0.6, lip, 0.45);
  const s = tiered ? step : 0;
  slab(x0 + s, x1 - s, z0 + s, z1 - s, h, 0.6, lip, 0.45);
  let rx0 = x0 + s;
  let rx1 = x1 - s;
  let rz0 = z0 + s;
  let rz1 = z1 - s;
  let ry = h + 0.6;
  if (top > h) {
    rx0 = x0 + 4;
    rx1 = x1 - 4;
    rz0 = z0 + 4;
    rz1 = z1 - 4;
    ry = top + 0.5;
    slab(rx0, rx1, rz0, rz1, top, 0.5, lip, 0.35);
  }
  const rw = rx1 - rx0;
  const rd = rz1 - rz0;

  if (type === 'downtown' && h > 42) {
    if (roll < 0.34) {
      // a slanted crown
      const quarter = Math.floor(roll3 * 4);
      trimWedges.push({ x: (rx0 + rx1) / 2, y: ry, z: (rz0 + rz1) / 2, sx: quarter & 1 ? rd : rw, sy: 5 + roll2 * 9, sz: quarter & 1 ? rw : rd,
        rot: quarter * Math.PI / 2, color: tint(col, 0.86) });
    } else if (roll < 0.62) {
      // a stepped crown: two more tiers
      for (let k = 1; k <= 2; k++) {
        const inset = Math.min(rw, rd) * 0.17 * k;
        slab(rx0 + inset, rx1 - inset, rz0 + inset, rz1 - inset, ry + (k - 1) * 3.4, 3.4, tint(col, 1.04 - k * 0.08), 0);
      }
    } else if (roll < 0.86) {
      // corner fins that run up the upper part and stand over the roof
      const base = top > h ? h : tiered ? waist : SHOP_H;
      const fin = tint(col, 1.18);
      for (const fx of [rx0, rx1]) {
        for (const fz of [rz0, rz1]) trimBoxes.push({ x: fx, y: (base + ry + 2.6) / 2, z: fz, sx: 1.3, sy: ry + 2.6 - base, sz: 1.3, color: fin });
      }
    }
  } else if (type === 'downtown' && roll < 0.55 && rw > 9 && rd > 9) {
    // lower blocks: a water tank on legs
    const tx = rx0 + 3.2 + roll2 * (rw - 6.4);
    const tz = rz0 + 3.2 + roll3 * (rd - 6.4);
    trimBoxes.push({ x: tx, y: ry + 0.6, z: tz, sx: 2.2, sy: 1.2, sz: 2.2, color: TRIM.concrete });
    trimDrums.push({ x: tx, y: ry + 2.8, z: tz, r: 1.8, h: 3.2, color: TRIM.wood });
  }

  if (type === 'beach') {
    // hotel balconies: a band under every row of windows, left off where a wall is painted
    const rows = Math.max(1, Math.round((h - SHOP_H) / 3.5));
    const floor = (h - SHOP_H) / rows;
    if (roll < 0.78) {
      for (let k = 1; k < rows; k++) {
        const y = SHOP_H + k * floor - 0.15;
        for (let f = 0; f < 4; f++) {
          if (mural && mural.f === f && y + 0.9 > mural.y0 && y < mural.y0 + mural.tall) continue;
          const out = 0.5;
          if (f < 2) trimBoxes.push({ x: f === 0 ? x0 - out : x1 + out, y: y + 0.45, z: cz, sx: 1, sy: 0.9, sz: d - 1.6, color: TRIM.white });
          else trimBoxes.push({ x: cx, y: y + 0.45, z: f === 2 ? z0 - out : z1 + out, sx: w - 1.6, sy: 0.9, sz: 1, color: TRIM.white });
        }
      }
    }
    // a deco fin up one wall and over the roof
    if (roll2 < 0.6) {
      let f = Math.floor(roll3 * 4);
      if (mural && mural.f === f) f ^= 1;
      const color = TRIM.deco[Math.floor(roll * 97) % TRIM.deco.length];
      const tall = h + 4.2 - SHOP_H;
      const slide = (roll - 0.5) * 0.3;
      if (f < 2) trimBoxes.push({ x: f === 0 ? x0 - 0.7 : x1 + 0.7, y: SHOP_H + tall / 2, z: cz + slide * d, sx: 1.4, sy: tall, sz: 2.6, color });
      else trimBoxes.push({ x: cx + slide * w, y: SHOP_H + tall / 2, z: f === 2 ? z0 - 0.7 : z1 + 0.7, sx: 2.6, sy: tall, sz: 1.4, color });
    } else if (rw > 10 && rd > 10) {
      // or a round penthouse
      trimDrums.push({ x: cx, y: ry + 1.7, z: cz, r: Math.min(rw, rd) * 0.24, h: 3.4, color: TRIM.white });
      trimDrums.push({ x: cx, y: ry + 3.55, z: cz, r: Math.min(rw, rd) * 0.28, h: 0.3, color: lip });
    }
  }

  if (type === 'industrial') {
    if (roll < 0.6) {
      // saw-tooth factory roof: the upright side of each tooth is glass
      const teeth = Math.max(2, Math.round(w / 9));
      for (let k = 0; k < teeth; k++) {
        const tx = x0 + (k + 0.5) * (w / teeth);
        trimWedges.push({ x: tx, y: ry, z: cz, sx: w / teeth, sy: 3, sz: d - 1.2, rot: 0, color: TRIM.saw });
        trimBoxes.push({ x: tx - w / teeth / 2 + 0.08, y: ry + 1.5, z: cz, sx: 0.12, sy: 2.4, sz: d - 2.4, color: TRIM.glass });
      }
    } else {
      // storage tanks on the roof
      const count = 2 + Math.floor(roll2 * 2);
      const tall = 4 + roll3 * 3;
      for (let k = 0; k < count; k++) {
        if (4 + k * 6.4 > w - 4) break;
        trimDrums.push({ x: x0 + 4 + k * 6.4, y: ry + tall / 2, z: z0 + 4.2 + roll * Math.max(0, d - 8.4), r: 2.6, h: tall, color: k % 2 ? TRIM.tank : tint(col, 1.1) });
      }
    }
  }
}

function yardTexture() {
  const c = mkCanvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#4b4a4c';
  g.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 900; k++) {
    g.fillStyle = RO() < 0.5 ? `rgba(0,0,0,${RO() * 0.12})` : `rgba(255,220,180,${RO() * 0.05})`;
    g.fillRect(RO() * 256, RO() * 256, 2 + RO() * 3, 2 + RO() * 3);
  }
  for (let k = 0; k < 7; k++) {
    // rust and oil
    const x = RO() * 256;
    const y = RO() * 256;
    const stain = g.createRadialGradient(x, y, 2, x, y, 14 + RO() * 22);
    stain.addColorStop(0, RO() < 0.5 ? 'rgba(150,72,38,0.45)' : 'rgba(18,18,24,0.5)');
    stain.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = stain;
    g.fillRect(0, 0, 256, 256);
  }
  // concrete joints, then a hazard border round the yard
  g.strokeStyle = 'rgba(0,0,0,0.28)';
  g.lineWidth = 1.5;
  for (let k = 32; k < 256; k += 32) {
    g.beginPath();
    g.moveTo(k, 0);
    g.lineTo(k, 256);
    g.moveTo(0, k);
    g.lineTo(256, k);
    g.stroke();
  }
  g.save();
  g.beginPath();
  g.rect(0, 0, 256, 256);
  g.rect(10, 10, 236, 236);
  g.clip('evenodd');
  g.fillStyle = '#d9b23c';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#2a2a2e';
  g.lineWidth = 7;
  for (let k = -256; k < 512; k += 18) {
    g.beginPath();
    g.moveTo(k, 0);
    g.lineTo(k + 256, 256);
    g.stroke();
  }
  g.restore();
  return new T.CanvasTexture(c);
}

function buildOutlines() {
  // Rustport yards: stained concrete with a hazard border instead of the city's pavement
  const yardMat = new T.MeshLambertMaterial({ map: yardTexture() });
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const block = blocks[i][j];
      if (block.type !== 'industrial') continue;
      const yard = new T.Mesh(new T.PlaneGeometry(BLOCK - 1, BLOCK - 1), yardMat);
      yard.rotation.x = -Math.PI / 2;
      yard.position.set(block.x0 + BLOCK / 2, 0.035, block.z0 + BLOCK / 2);
      yard.receiveShadow = true;
      scene.add(yard);
    }
  }

  // Rustport quay: containers, gantry cranes and a freighter on the water south of the docks (out of reach)
  const qx0 = -HALF + 6;
  const qx1 = roadC(4) - 8;
  const qz0 = HALF + SHORE - 1;
  slab(qx0, qx1, qz0, qz0 + 34, -1.2, 1.9, TRIM.concrete, 0);
  for (let x = qx0 + 9; x < qx1 - 8; x += 13.2) {
    for (let row = 0; row < 2; row++) {
      const high = Math.floor(RO() * 4.4);
      for (let k = 0; k < high; k++) {
        trimBoxes.push({ x, y: 0.7 + 1.3 + k * 2.62, z: qz0 + 6 + row * 3.4, sx: 12.2, sy: 2.6, sz: 2.5, color: TRIM.crates[Math.floor(RO() * TRIM.crates.length)] });
      }
    }
  }
  for (const x of [qx0 + 60, qx0 + 150, qx0 + 250]) {
    for (const lx of [-9, 9]) {
      for (const lz of [16, 30]) trimBoxes.push({ x: x + lx, y: 0.7 + 17, z: qz0 + lz, sx: 1.5, sy: 34, sz: 1.5, color: TRIM.crane });
      trimBoxes.push({ x: x + lx, y: 34.5, z: qz0 + 23, sx: 1.5, sy: 1.8, sz: 15.5, color: TRIM.crane });
    }
    trimBoxes.push({ x, y: 36.4, z: qz0 + 16, sx: 19.5, sy: 2, sz: 1.6, color: TRIM.crane });
    trimBoxes.push({ x, y: 36.4, z: qz0 + 30, sx: 19.5, sy: 2, sz: 1.6, color: TRIM.crane });
    trimBoxes.push({ x, y: 38.2, z: qz0 + 42, sx: 3.2, sy: 2.2, sz: 66, color: TRIM.crane });      // the boom, out over the ship
    trimBoxes.push({ x, y: 45, z: qz0 + 23, sx: 2, sy: 12, sz: 2, color: TRIM.crane });
    trimBoxes.push({ x, y: 34.6, z: qz0 + 48 + (x % 7), sx: 4, sy: 3, sz: 4, color: TRIM.white });   // the cab
  }
  const shipX = qx0 + 150;
  const shipZ = qz0 + 50;
  trimBoxes.push({ x: shipX, y: 1.4, z: shipZ, sx: 150, sy: 5, sz: 19, color: TRIM.hull });
  trimBoxes.push({ x: shipX, y: -0.9, z: shipZ, sx: 150.4, sy: 1.4, sz: 19.4, color: TRIM.keel });
  trimBoxes.push({ x: shipX - 62, y: 9.5, z: shipZ, sx: 14, sy: 11, sz: 15, color: TRIM.white });
  trimBoxes.push({ x: shipX - 64, y: 17.5, z: shipZ, sx: 4, sy: 5, sz: 4, color: TRIM.keel });
  for (let x = shipX - 46; x < shipX + 68; x += 13.2) {
    for (let row = -2; row <= 2; row++) {
      const high = 1 + Math.floor(RO() * 3.2);
      for (let k = 0; k < high; k++) {
        trimBoxes.push({ x, y: 3.9 + 1.3 + k * 2.62, z: shipZ + row * 3.2, sx: 12.2, sy: 2.6, sz: 2.6, color: TRIM.crates[Math.floor(RO() * TRIM.crates.length)] });
      }
    }
  }

  const tintable = () => new T.MeshLambertMaterial({ color: '#ffffff' });
  const boxes = instanced(boxGeo, tintable(), trimBoxes, (o, b) => {
    o.position.set(b.x, b.y, b.z);
    o.scale.set(b.sx, b.sy, b.sz);
  });
  const wedgeGeo = new T.BufferGeometry();
  const A = [-0.5, 0, -0.5], B = [-0.5, 0, 0.5], C = [-0.5, 1, 0.5], D = [-0.5, 1, -0.5], E = [0.5, 0, -0.5], F = [0.5, 0, 0.5];
  wedgeGeo.setAttribute('position', new T.Float32BufferAttribute([].concat(A, B, C, A, C, D, D, C, F, D, F, E, B, F, C, A, D, E), 3));
  wedgeGeo.computeVertexNormals();
  const wedges = instanced(wedgeGeo, tintable(), trimWedges, (o, b) => {
    o.position.set(b.x, b.y, b.z);
    o.rotation.y = b.rot;
    o.scale.set(b.sx, b.sy, b.sz);
  });
  const drums = instanced(new T.CylinderGeometry(1, 1, 1, 14), tintable(), trimDrums, (o, b) => {
    o.position.set(b.x, b.y, b.z);
    o.scale.set(b.r, b.h, b.r);
  });
  for (const mesh of [boxes, wedges, drums]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  return { boxes: trimBoxes.length, wedges: trimWedges.length, drums: trimDrums.length };
}

function signTexture(text, hex) {
  const c = mkCanvas(512, 112);
  const g = c.getContext('2d');
  g.fillStyle = '#0b0d1c';
  g.fillRect(0, 0, 512, 112);
  g.strokeStyle = hex;
  g.lineWidth = 6;
  g.strokeRect(7, 7, 498, 98);
  let size = 62;
  do {
    g.font = '900 ' + size + 'px "Segoe UI", Arial, sans-serif';
    size -= 4;
  } while (g.measureText(text).width > 460);
  g.fillStyle = hex;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = hex;
  g.shadowBlur = 14;
  g.fillText(text, 256, 60);
  const texture = new T.CanvasTexture(c);
  texture.anisotropy = 4;
  return texture;
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
        const shops = block.type === 'downtown' || block.type === 'beach' || (block.type === 'suburb' && h >= 14);
        // many towers step in above a waist, so the skyline is not all plain boxes
        const tiered = block.type === 'downtown' && h > 42 && RT() < 0.7;
        const waist = tiered ? Math.round(h * (0.42 + RT() * 0.28)) : h;
        const step = tiered ? 2.2 + RT() * 1.6 : 0;
        addBox(bx0, bx1, bz0, bz1, 0, waist, col, R, shops);
        if (tiered) addBox(bx0 + step, bx1 - step, bz0 + step, bz1 - step, waist, h, col, RT);
        block.boxes.push({ x0: bx0, x1: bx1, z0: bz0, z1: bz1, h });
        const muralsBefore = murals.length;
        dressBuilding(block, bx0, bx1, bz0, bz1, h, step, shops, waist);
        const mural = murals.length > muralsBefore ? murals[murals.length - 1] : null;
        let top = h;
        if (h > 55 && R() < 0.6) {
          top = h + 12 + R() * 28;
          addBox(bx0 + 4, bx1 - 4, bz0 + 4, bz1 - 4, h, top, col);
        }
        if (top > 60) towerTops.push({ x: (bx0 + bx1) / 2, z: (bz0 + bz1) / 2, y: top, w: Math.min(bx1 - bx0, bz1 - bz0) });
        shapeBuilding(block, bx0, bx1, bz0, bz1, h, waist, step, top, col, mural);
        const chance = block.type === 'downtown' ? 0.5 : block.type === 'beach' ? 0.75 : block.type === 'suburb' ? 0.12 : 0;
        if (R() < chance) neonBand(bx0, bx1, bz0, bz1, waist - 0.7, pickR(NEON));
        if (R() < chance) neonBand(bx0, bx1, bz0, bz1, SHOP_H + 0.1, pickR(NEON));
      }
      // street trees on the pavement of the inland districts (never mid-block or at the corners)
      if (block.type === 'suburb' || block.type === 'downtown') {
        for (let side = 0; side < 4; side++) {
          for (const part of [0.25, 0.75]) {
            if (RT() > 0.6) continue;
            const along = BLOCK * part + (RT() - 0.5) * 6;
            const tx = side === 0 ? x0 + 1.6 : side === 1 ? x0 + BLOCK - 1.6 : x0 + along;
            const tz = side === 2 ? z0 + 1.6 : side === 3 ? z0 + BLOCK - 1.6 : z0 + along;
            trees.push({ x: tx, z: tz, s: 0.5 + RT() * 0.2, color: new T.Color().setHSL(0.27 + RT() * 0.1, 0.5, 0.26 + RT() * 0.1) });
            block.circles.push({ x: tx, z: tz, r: 0.35 });
          }
        }
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

  const shopGeo = new T.BufferGeometry();
  shopGeo.setAttribute('position', new T.Float32BufferAttribute(shopWalls.pos, 3));
  shopGeo.setAttribute('normal', new T.Float32BufferAttribute(shopWalls.nor, 3));
  shopGeo.setAttribute('uv', new T.Float32BufferAttribute(shopWalls.uv, 2));
  shopGeo.setAttribute('color', new T.Float32BufferAttribute(shopWalls.col, 3));
  shopGeo.setIndex(shopWalls.idx);
  const shopMesh = new T.Mesh(shopGeo, shopMat);
  shopMesh.castShadow = true;
  shopMesh.receiveShadow = true;
  scene.add(shopMesh);
}

function windowTextures() {
  const wall = mkCanvas(512);
  const lit = mkCanvas(512);
  const gw = wall.getContext('2d');
  const gl = lit.getContext('2d');
  gw.fillStyle = '#ececec';
  gw.fillRect(0, 0, 512, 512);
  gl.fillStyle = '#000';
  gl.fillRect(0, 0, 512, 512);
  for (let k = 0; k < 2600; k++) {
    gw.fillStyle = `rgba(0,0,0,${RT() * 0.05})`;
    gw.fillRect(RT() * 512, RT() * 512, 3, 2);
  }
  for (let cy = 0; cy <= 8; cy++) {
    gw.fillStyle = 'rgba(0,0,0,0.16)';
    gw.fillRect(0, cy * 64 - 1, 512, 3);         // floor line
  }
  for (let cx = 0; cx < 8; cx++) {
    for (let cy = 0; cy < 8; cy++) {
      const on = R() < 0.42;
      const x = cx * 64 + 13;
      const y = cy * 64 + 13;
      gw.fillStyle = '#fbfbfb';
      gw.fillRect(x - 3, y - 3, 44, 46);          // frame
      const glass = gw.createLinearGradient(0, y, 0, y + 40);
      glass.addColorStop(0, on ? '#6a7886' : '#3a4654');
      glass.addColorStop(1, on ? '#4c5864' : '#222a34');
      gw.fillStyle = glass;
      gw.fillRect(x, y, 38, 40);
      gw.fillStyle = '#d6d6d6';
      gw.fillRect(x + 18, y, 2, 40);              // mullion
      gw.fillStyle = 'rgba(0,0,0,0.3)';
      gw.fillRect(x - 5, y + 43, 48, 4);          // sill shadow
      if (on) {
        gl.fillStyle = pickR(['#ffd98a', '#ffe9b8', '#9fd6ff', '#ffc46b']);
        gl.fillRect(x, y, 38, 40);
        gl.fillStyle = 'rgba(0,0,0,0.55)';
        gl.fillRect(x + 18, y, 2, 40);
        if (RT() < 0.4) gl.fillRect(x, y, 38, 8 + RT() * 18);   // a blind half down
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

// four storefronts side by side: awning, two panes and a door, lit from inside after dark
function shopTextures() {
  const wall = mkCanvas(1024, 128);
  const lit = mkCanvas(1024, 128);
  const gw = wall.getContext('2d');
  const gl = lit.getContext('2d');
  gw.fillStyle = '#e4e4e4';
  gw.fillRect(0, 0, 1024, 128);
  gl.fillStyle = '#000';
  gl.fillRect(0, 0, 1024, 128);
  const glow = ['#ffdc9a', '#ffc9e0', '#aee6ff', '#ffe9b8'];
  for (let k = 0; k < 4; k++) {
    const x = k * 256;
    for (let s = 0; s < 8; s++) {
      gw.fillStyle = s % 2 ? '#ffffff' : '#b9b9b9';
      gw.fillRect(x + s * 32, 6, 32, 20);        // striped awning
    }
    gw.fillStyle = 'rgba(0,0,0,0.3)';
    gw.fillRect(x, 26, 256, 5);
    gw.fillStyle = '#6f6f6f';
    gw.fillRect(x, 112, 256, 16);                // plinth
    const shut = k === 3;
    const panes = [[x + 14, 92], [x + 150, 92], [x + 112, 32]];
    panes.forEach(([px, w], n) => {
      const top = n === 2 ? 44 : 38;
      const glass = gw.createLinearGradient(px, top, px + w, 112);
      glass.addColorStop(0, '#55657a');
      glass.addColorStop(0.5, '#27323f');
      glass.addColorStop(1, '#3b4858');
      gw.fillStyle = shut && n < 2 ? '#8d9299' : glass;
      gw.fillRect(px, top, w, 112 - top);
      gw.strokeStyle = '#f4f4f4';
      gw.lineWidth = 3;
      gw.strokeRect(px, top, w, 112 - top);
      if (shut && n < 2) {
        gw.fillStyle = 'rgba(0,0,0,0.22)';
        for (let y = top + 6; y < 110; y += 8) gw.fillRect(px + 2, y, w - 4, 2);   // roller shutter
        return;
      }
      const warm = gl.createLinearGradient(0, top, 0, 112);
      warm.addColorStop(0, glow[k]);
      warm.addColorStop(1, 'rgba(120,90,60,1)');
      gl.fillStyle = warm;
      gl.fillRect(px + 2, top + 2, w - 4, 108 - top);
    });
  }
  const make = (c) => {
    const tex = new T.CanvasTexture(c);
    tex.wrapS = T.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  };
  return [make(wall), make(lit)];
}
const [shopTex, shopLitTex] = shopTextures();
const shopMat = new T.MeshLambertMaterial({
  map: shopTex,
  emissiveMap: shopLitTex,
  emissive: 0xffffff,
  emissiveIntensity: 0,
  vertexColors: true,
});
const buildingMat = new T.MeshLambertMaterial({
  map: wallTex,
  emissiveMap: litTex,
  emissive: 0xffffff,
  emissiveIntensity: 0,
  vertexColors: true,
});

// ---------- murals: eight painted walls, two per district, on one sheet ----------
function muralTexture() {
  const CELL_PX = 512;
  const c = mkCanvas(CELL_PX * 4, CELL_PX * 2);
  const g = c.getContext('2d');
  const disc = (x, y, r, fill) => {
    g.fillStyle = fill;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  const poly = (fill, pts) => {
    g.fillStyle = fill;
    g.beginPath();
    pts.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.fill();
  };
  const words = (text, x, y, px, fill, shadow) => {
    g.font = '900 ' + px + 'px "Arial Black", "Segoe UI", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (shadow) {
      g.fillStyle = shadow;
      g.fillText(text, x + px * 0.07, y + px * 0.07);
    }
    g.fillStyle = fill;
    g.fillText(text, x, y);
  };
  const wave = (y, amp, stroke, width) => {
    g.strokeStyle = stroke;
    g.lineWidth = width;
    g.beginPath();
    for (let x = -10; x <= 522; x += 8) g.lineTo(x, y + Math.sin(x * 0.045) * amp);
    g.stroke();
  };
  // every picture is drawn on a 512 x 320 board
  const PAINT = [
    () => {                         // Sol Beach: the sun going down behind a palm
      const sky = g.createLinearGradient(0, 0, 0, 320);
      sky.addColorStop(0, '#ff4f8f');
      sky.addColorStop(0.6, '#ff9a4f');
      sky.addColorStop(1, '#ffd36b');
      g.fillStyle = sky;
      g.fillRect(0, 0, 512, 320);
      disc(300, 200, 112, '#fff1a8');
      g.fillStyle = '#ff8a5a';
      for (let k = 0; k < 5; k++) g.fillRect(180, 196 + k * 22, 240, 6 + k * 2);
      g.fillStyle = '#2b2a7a';
      g.fillRect(0, 262, 512, 58);
      wave(280, 4, '#6f7ce0', 4);
      wave(300, 4, '#6f7ce0', 4);
      g.strokeStyle = '#1b1740';
      g.lineWidth = 13;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(86, 320);
      g.quadraticCurveTo(96, 190, 132, 92);
      g.stroke();
      g.lineWidth = 9;
      for (const [dx, dy] of [[-92, 6], [-70, -44], [-14, -70], [50, -56], [88, -8], [70, 46], [-60, 52]]) {
        g.beginPath();
        g.moveTo(132, 92);
        g.quadraticCurveTo(132 + dx * 0.6, 92 + dy * 0.9 - 26, 132 + dx, 92 + dy);
        g.stroke();
      }
    },
    () => {                         // Sol Beach: a postcard
      g.fillStyle = '#14b3ae';
      g.fillRect(0, 0, 512, 320);
      disc(430, 70, 46, '#ffe14f');
      for (let k = 0; k < 4; k++) wave(236 + k * 24, 7, k % 2 ? '#ffffff' : '#8fe7df', 7);
      words('SOL', 190, 84, 104, '#ffffff', '#ff3fa4');
      words('BEACH', 256, 170, 104, '#ffffff', '#ff3fa4');
    },
    () => {                         // Meridian: hard colour blocks and a white zigzag
      g.fillStyle = '#1d1a4a';
      g.fillRect(0, 0, 512, 320);
      poly('#ff3fa4', [[0, 0], [230, 0], [0, 230]]);
      poly('#3fe0ff', [[512, 320], [512, 70], [262, 320]]);
      poly('#ffe14f', [[250, 0], [420, 0], [335, 86]]);
      poly('#b56bff', [[70, 320], [210, 320], [140, 250]]);
      disc(256, 160, 58, '#ffffff');
      disc(256, 160, 38, '#1d1a4a');
      g.strokeStyle = '#ffffff';
      g.lineWidth = 12;
      g.lineJoin = 'miter';
      g.beginPath();
      [[40, 290], [130, 200], [190, 250], [330, 110], [390, 160], [480, 40]].forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      g.stroke();
    },
    () => {                         // Meridian: the skyline under a striped sun
      const sky = g.createLinearGradient(0, 0, 0, 320);
      sky.addColorStop(0, '#231a5c');
      sky.addColorStop(1, '#ff4f8f');
      g.fillStyle = sky;
      g.fillRect(0, 0, 512, 320);
      disc(256, 190, 120, '#ffd36b');
      g.fillStyle = '#ff4f8f';
      for (let k = 0; k < 5; k++) g.fillRect(120, 176 + k * 24, 272, 5 + k * 2);
      g.fillStyle = '#120f33';
      [[20, 150], [70, 96], [124, 170], [176, 60], [236, 130], [290, 84], [348, 150], [398, 40], [452, 120]].forEach(([x, top]) => g.fillRect(x, top, 46, 320 - top));
      g.fillStyle = '#3fe0ff';
      g.fillRect(0, 300, 512, 6);
      words('MERIDIAN', 256, 276, 40, '#ffffff', '#3fe0ff');
    },
    () => {                         // the suburbs: cut citrus on mint
      g.fillStyle = '#a8efd2';
      g.fillRect(0, 0, 512, 320);
      const slice = (x, y, r, rind, flesh) => {
        disc(x, y, r, rind);
        disc(x, y, r * 0.86, '#fff8e0');
        disc(x, y, r * 0.78, flesh);
        g.strokeStyle = '#fff8e0';
        g.lineWidth = r * 0.07;
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI;
          g.beginPath();
          g.moveTo(x - Math.cos(a) * r * 0.8, y - Math.sin(a) * r * 0.8);
          g.lineTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8);
          g.stroke();
        }
      };
      slice(130, 170, 104, '#ff8a3f', '#ffb15c');
      slice(330, 118, 84, '#ffd23f', '#ffe98a');
      slice(420, 248, 62, '#57c45a', '#b6ec7a');
      poly('#2f8f4f', [[236, 268], [300, 232], [322, 286], [262, 304]]);
    },
    () => {                         // the suburbs: one big flower
      g.fillStyle = '#ffd3e2';
      g.fillRect(0, 0, 512, 320);
      poly('#2f8f4f', [[0, 320], [150, 180], [210, 320]]);
      poly('#3fae62', [[512, 320], [372, 196], [300, 320]]);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
        disc(256 + Math.cos(a) * 78, 156 + Math.sin(a) * 78, 66, k % 2 ? '#ff5f7a' : '#ff7f8f');
      }
      disc(256, 156, 40, '#ffe14f');
      disc(256, 156, 18, '#ff8a3f');
    },
    () => {                         // Rustport: stencil lettering between hazard stripes
      g.fillStyle = '#22323c';
      g.fillRect(0, 0, 512, 320);
      for (const y of [0, 270]) {
        g.fillStyle = '#ffd23f';
        g.fillRect(0, y, 512, 50);
        for (let x = -60; x < 540; x += 56) poly('#16181c', [[x, y + 50], [x + 28, y + 50], [x + 78, y], [x + 50, y]]);
      }
      words('RUSTPORT', 256, 136, 84, '#f3ead6');
      words('DOCK 7', 256, 222, 50, '#ff8a3f');
    },
    () => {                         // Rustport: a cog over the water
      g.fillStyle = '#c4572e';
      g.fillRect(0, 0, 512, 320);
      g.save();
      g.translate(256, 140);
      g.fillStyle = '#f3e6c8';
      for (let k = 0; k < 10; k++) {
        g.rotate(Math.PI / 5);
        g.fillRect(-20, -122, 40, 50);
      }
      g.restore();
      disc(256, 140, 92, '#f3e6c8');
      disc(256, 140, 40, '#c4572e');
      g.fillStyle = '#1f2d4d';
      g.fillRect(0, 262, 512, 58);
      wave(266, 6, '#f3e6c8', 6);
      wave(292, 6, '#5f86a8', 6);
    },
  ];
  PAINT.forEach((paint, k) => {
    g.save();
    g.beginPath();
    g.rect((k % 4) * CELL_PX, Math.floor(k / 4) * CELL_PX, CELL_PX, CELL_PX);
    g.clip();
    g.translate((k % 4) * CELL_PX, Math.floor(k / 4) * CELL_PX);
    g.scale(1, CELL_PX / 320);
    paint();
    g.restore();
  });
  const texture = new T.CanvasTexture(c);
  texture.anisotropy = 4;
  return texture;
}

function buildMurals() {
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  const turn = [-Math.PI / 2, Math.PI / 2, Math.PI, 0];
  murals.forEach((m, k) => {
    const rx = Math.cos(turn[m.f]) * m.w / 2;
    const rz = -Math.sin(turn[m.f]) * m.w / 2;
    const u0 = (m.kind % 4) / 4 + 0.003;
    const v0 = 0.5 - Math.floor(m.kind / 4) * 0.5 + 0.004;
    pos.push(m.x - rx, m.y0, m.z - rz, m.x + rx, m.y0, m.z + rz, m.x + rx, m.y0 + m.tall, m.z + rz, m.x - rx, m.y0 + m.tall, m.z - rz);
    for (let n = 0; n < 4; n++) nor.push(Math.sin(turn[m.f]), 0, Math.cos(turn[m.f]));
    uv.push(u0, v0, u0 + 0.244, v0, u0 + 0.244, v0 + 0.492, u0, v0 + 0.492);
    idx.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3);
  });
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mesh = new T.Mesh(geo, new T.MeshLambertMaterial({ map: muralTexture() }));
  mesh.receiveShadow = true;
  scene.add(mesh);
  landmarks.murals = murals;
}

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
  // and one on each side halfway along every block (not on the palm side of the beach road)
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j < N; j++) {
      const mid = roadC(j) + CELL / 2;
      const off = ROAD / 2 + 1.3;
      for (const side of [-1, 1]) {
        if (!(i === N - 1 && side > 0)) lamps.push({ x: roadC(i) + side * off, z: mid });
        lamps.push({ x: mid, z: roadC(i) + side * off });
      }
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

  // shop signs (one instanced mesh per name) and roof boxes
  const signGeo = new T.PlaneGeometry(8, 1.75);
  Object.keys(signs).forEach((text, k) => {
    const material = new T.MeshBasicMaterial({ map: signTexture(text, NEON[k % NEON.length]) });
    instanced(signGeo, material, signs[text], (d, s) => {
      d.position.set(s.x, 5.6, s.z);
      d.rotation.y = s.rot;
    });
  });
  const roofMesh = instanced(boxGeo, mat('#70737f'), roofBits, (d, b) => {
    d.position.set(b.x, b.y, b.z);
    d.scale.set(b.sx, b.sy, b.sz);
  });
  roofMesh.castShadow = true;
}

// ---------- landmarks: things to steer by from anywhere in the city ----------
const landmarks = { wheel: null };

function buildLandmarks() {
  landmarks.outlines = buildOutlines();
  // hip roofs for the low houses
  const hipGeo = new T.ConeGeometry(1, 1, 4).toNonIndexed();
  hipGeo.rotateY(Math.PI / 4);
  hipGeo.computeVertexNormals();
  const hipMesh = instanced(hipGeo, new T.MeshLambertMaterial({ color: '#ffffff' }), hipRoofs, (d, r) => {
    d.position.set(r.x, r.y + r.rise / 2, r.z);
    d.scale.set(r.sx / 1.4142, r.rise, r.sz / 1.4142);
  });
  hipMesh.castShadow = true;

  // Meridian Spire on the tallest tower, masts with a red light on the others
  towerTops.sort((a, b) => b.y - a.y);
  const beacons = [];
  const masts = [];
  towerTops.forEach((t, k) => {
    if (k === 0) return;
    const len = 9 + RS() * 9;
    masts.push({ x: t.x, y: t.y + len / 2, z: t.z, len });
    beacons.push({ x: t.x, y: t.y + len + 0.4, z: t.z, s: 0.7 });
  });
  const tallest = towerTops[0];
  if (tallest) {
    const crown = new T.Mesh(new T.CylinderGeometry(tallest.w * 0.18, tallest.w * 0.34, 9, 8), mat('#c9d3dc'));
    crown.position.set(tallest.x, tallest.y + 4.5, tallest.z);
    const needle = new T.Mesh(new T.CylinderGeometry(0.25, tallest.w * 0.16, 44, 8), mat('#dfe6ee'));
    needle.position.set(tallest.x, tallest.y + 9 + 22, tallest.z);
    const halo = new T.Mesh(new T.TorusGeometry(tallest.w * 0.3, 0.45, 6, 28), glowMat('#3fe0ff'));
    halo.rotation.x = Math.PI / 2;
    halo.position.set(tallest.x, tallest.y + 9.4, tallest.z);
    crown.castShadow = needle.castShadow = true;
    scene.add(crown, needle, halo);
    beacons.push({ x: tallest.x, y: tallest.y + 53.6, z: tallest.z, s: 1.3 });
    landmarks.spire = { x: tallest.x, z: tallest.z, y: tallest.y + 53 };
  }

  // Rustport smokestacks
  const stacks = [];
  const bands = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const block = blocks[i][j];
      if (block.type !== 'industrial') continue;
      for (const box of block.boxes) {
        if (RS() > 0.7) continue;
        const pair = RS() < 0.5 ? 2 : 1;
        for (let k = 0; k < pair; k++) {
          const len = 20 + RS() * 14;
          const x = box.x0 + 4 + k * 5.5;
          const z = box.z0 + 4 + RS() * Math.max(1, box.z1 - box.z0 - 8);
          stacks.push({ x, y: box.h + len / 2, z, len });
          bands.push({ x, y: box.h + len - 2.2, z }, { x, y: box.h + len - 6.2, z });
          beacons.push({ x, y: box.h + len + 0.5, z, s: 0.8 });
        }
      }
    }
  }
  const stackGeo = new T.CylinderGeometry(1.05, 1.5, 1, 10);
  const stackMesh = instanced(stackGeo, mat('#a35a41'), stacks, (d, s) => {
    d.position.set(s.x, s.y, s.z);
    d.scale.set(1, s.len, 1);
  });
  stackMesh.castShadow = true;
  instanced(new T.CylinderGeometry(1.24, 1.3, 1.5, 10), mat('#ecece6'), bands, (d, b) => d.position.set(b.x, b.y, b.z));
  instanced(boxGeo, mat('#8b909c'), masts, (d, m) => {
    d.position.set(m.x, m.y, m.z);
    d.scale.set(0.4, m.len, 0.4);
  });
  instanced(new T.SphereGeometry(0.5, 8, 6), glowMat('#ff3b3b'), beacons, (d, b) => {
    d.position.set(b.x, b.y, b.z);
    d.scale.setScalar(b.s);
  });

  // the Sol Wheel on its pier, out in the water off Sol Beach (the ride is sold at the foot of the pier)
  const pierX0 = HALF + SHORE - 1;
  const wheelX = HALF + SHORE + 46;
  const wheelZ = roadC(7) + 6;
  const radius = 25;
  const hubY = radius + 5.5;
  const pier = new T.Mesh(new T.BoxGeometry(wheelX + 16 - pierX0, 0.7, 9), mat('#8a6a4a'));
  pier.position.set((pierX0 + wheelX + 16) / 2, 1.1, wheelZ);
  pier.castShadow = true;
  scene.add(pier);
  const posts = [];
  for (let x = pierX0 + 3; x < wheelX + 16; x += 9) posts.push({ x, z: wheelZ - 3.8 }, { x, z: wheelZ + 3.8 });
  instanced(boxGeo, mat('#5e4631'), posts, (d, p) => {
    d.position.set(p.x, -0.2, p.z);
    d.scale.set(0.6, 2.4, 0.6);
  });
  const pierLamps = [];
  for (let x = pierX0 + 5; x < wheelX - 8; x += 12) pierLamps.push({ x, z: wheelZ - 4.1 }, { x, z: wheelZ + 4.1 });
  instanced(boxGeo, glowMat('#ffe9a8'), pierLamps, (d, p) => {
    d.position.set(p.x, 2.2, p.z);
    d.scale.set(0.35, 0.35, 0.35);
  });

  const wheel = new T.Group();
  const steel = mat('#e6e9f2');
  for (const side of [-1.6, 1.6]) {
    const rim = new T.Mesh(new T.TorusGeometry(radius, 0.4, 6, 48), steel);
    rim.position.z = side;
    const glowRim = new T.Mesh(new T.TorusGeometry(radius - 1.6, 0.22, 5, 48), glowMat(side < 0 ? '#ff3fa4' : '#3fe0ff'));
    glowRim.position.z = side;
    wheel.add(rim, glowRim);
  }
  const SPOKES = 12;
  for (let k = 0; k < SPOKES; k++) {
    const angle = (k / SPOKES) * Math.PI * 2;
    if (k < SPOKES / 2) {
      const spoke = new T.Mesh(boxGeo, steel);
      spoke.scale.set(radius * 2, 0.3, 0.3);
      spoke.rotation.z = angle;
      wheel.add(spoke);
    }
    const cabin = new T.Mesh(new T.SphereGeometry(1.7, 10, 8), glowMat(NEON[k % NEON.length]));
    cabin.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
    wheel.add(cabin);
  }
  const hub = new T.Mesh(new T.SphereGeometry(2.2, 12, 8), glowMat('#ffe14f'));
  wheel.add(hub);
  wheel.rotation.y = Math.PI / 2;          // face the beach
  wheel.position.set(wheelX, hubY, wheelZ);
  scene.add(wheel);
  for (const lean of [-1, 1]) {
    for (const side of [-2.6, 2.6]) {
      const leg = new T.Mesh(boxGeo, steel);
      leg.scale.set(0.8, hubY + 1.5, 0.8);
      leg.position.set(wheelX + side, hubY / 2 + 0.6, wheelZ + lean * 7.5);
      leg.rotation.x = -lean * Math.atan2(15, hubY * 2);
      leg.castShadow = true;
      scene.add(leg);
    }
  }
  landmarks.wheel = wheel;
  landmarks.wheelAt = { x: wheelX, y: hubY, z: wheelZ };

  // Sol Beach by day: parasols and towels on the sand (clear of the pier), sails out on the water
  const BRIGHT = ['#ff5f8f', '#ffd23f', '#3fd0e0', '#ff8a3f', '#ffffff', '#7f6bff'].map((hex) => new T.Color(hex));
  const shades = [];
  const towels = [];
  for (let z = -HALF + 20; z < HALF - 20; z += 9 + RD() * 9) {
    const x = HALF + 9 + RD() * (SHORE - 24);
    if (Math.abs(z - wheelZ) < 13) continue;
    const color = BRIGHT[Math.floor(RD() * BRIGHT.length)];
    shades.push({ x, z, color, tilt: (RD() - 0.5) * 0.3 });
    towels.push({ x: x + 1.3, z: z + (RD() - 0.5), turn: RD() * 3, color: BRIGHT[Math.floor(RD() * BRIGHT.length)] });
    if (RD() < 0.5) towels.push({ x: x - 1.2, z: z + 0.8, turn: RD() * 3, color });
  }
  const white = new T.MeshLambertMaterial({ color: '#ffffff' });
  instanced(new T.CylinderGeometry(0.05, 0.05, 2.5, 5), mat('#e9e4d6'), shades, (d, s) => d.position.set(s.x, 1.25, s.z));
  const shadeMesh = instanced(new T.ConeGeometry(1.9, 0.75, 8), white, shades, (d, s) => {
    d.position.set(s.x, 2.6, s.z);
    d.rotation.z = s.tilt;
  });
  shadeMesh.castShadow = true;
  instanced(boxGeo, white, towels, (d, t) => {
    d.position.set(t.x, 0.02, t.z);
    d.rotation.y = t.turn;
    d.scale.set(0.95, 0.05, 1.9);
  });
  const boats = [];
  for (let k = 0; k < 9; k++) {
    const far = HALF + SHORE + 70 + RD() * 230;
    const along = (RD() - 0.5) * WORLD;
    const east = k < 6;
    boats.push({ x: east ? far : along, z: east ? along : far, turn: RD() * Math.PI * 2, s: 0.9 + RD() * 0.5, color: BRIGHT[Math.floor(RD() * BRIGHT.length)] });
  }
  instanced(boxGeo, mat('#f4f1ea'), boats, (d, b) => {
    d.position.set(b.x, -0.25, b.z);
    d.rotation.y = b.turn;
    d.scale.set(7.5 * b.s, 1.1, 2.1 * b.s);
  });
  const sailGeo = new T.BufferGeometry();
  sailGeo.setAttribute('position', new T.Float32BufferAttribute([-0.6, 0.6, 0, -0.6, 10.5, 0, 3.4, 0.6, 0, -1, 0.6, 0, -1, 8.2, 0, -3.3, 0.6, 0], 3));
  sailGeo.computeVertexNormals();
  instanced(sailGeo, new T.MeshLambertMaterial({ color: '#ffffff', side: T.DoubleSide }), boats, (d, b) => {
    d.position.set(b.x, 0, b.z);
    d.rotation.y = b.turn;
    d.scale.setScalar(b.s);
  });

  // gulls over the beach: nine birds in one small mesh, redrawn every frame
  const gullGeo = new T.BufferGeometry();
  gullGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(9 * 18), 3));
  const gullMat = new T.MeshBasicMaterial({ color: '#ffffff', side: T.DoubleSide });
  const gullMesh = new T.Mesh(gullGeo, gullMat);
  gullMesh.frustumCulled = false;
  scene.add(gullMesh);
  landmarks.gulls = { geo: gullGeo, mat: gullMat, birds: [] };
  for (let k = 0; k < 9; k++) {
    landmarks.gulls.birds.push({
      cx: HALF + 8 + RD() * 36, cz: wheelZ + (RD() - 0.5) * 300, r: 9 + RD() * 16, y: 11 + RD() * 16,
      a: RD() * 6.28, w: (0.25 + RD() * 0.2) * (RD() < 0.5 ? -1 : 1), flap: RD() * 6,
    });
  }

  // the Coastliner: an airship that circles the island with the city's name on its side
  const ship = new T.Group();
  const hull = new T.Mesh(new T.SphereGeometry(1, 20, 12), mat('#f4ecdc'));
  hull.scale.set(27, 7.2, 7.2);
  const nose = new T.Mesh(new T.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#ff3fa4'));
  nose.rotation.z = -Math.PI / 2;
  nose.scale.set(6.3, 9, 6.3);
  nose.position.x = 18.6;
  const cabin = new T.Mesh(boxGeo, mat('#2a2f45'));
  cabin.scale.set(8, 1.9, 2.6);
  cabin.position.y = -7.7;
  const lights = new T.Mesh(boxGeo, glowMat('#ffe9a8'));
  lights.scale.set(6.6, 0.5, 2.7);
  lights.position.y = -7.5;
  ship.add(hull, nose, cabin, lights);
  for (let k = 0; k < 4; k++) {
    const fin = new T.Mesh(boxGeo, mat(k % 2 ? '#3fe0ff' : '#ff3fa4'));
    fin.scale.set(7, 5.5, 0.35);
    fin.position.set(-21.5, Math.cos((k * Math.PI) / 2) * 5.2, Math.sin((k * Math.PI) / 2) * 5.2);
    fin.rotation.x = (k * Math.PI) / 2;
    ship.add(fin);
  }
  const nameCanvas = mkCanvas(1024, 192);
  const ng = nameCanvas.getContext('2d');
  const ink = ng.createLinearGradient(60, 0, 964, 0);
  ink.addColorStop(0, '#ff3fa4');
  ink.addColorStop(0.5, '#ff8a3f');
  ink.addColorStop(1, '#12a9c9');
  ng.font = 'italic 900 150px "Arial Black", "Segoe UI", Arial, sans-serif';
  ng.textAlign = 'center';
  ng.textBaseline = 'middle';
  ng.fillStyle = ink;
  ng.fillText('NEON COAST', 512, 102, 960);
  const nameMat = new T.MeshBasicMaterial({ map: new T.CanvasTexture(nameCanvas), transparent: true, depthWrite: false });
  for (const side of [1, -1]) {
    const name = new T.Mesh(new T.PlaneGeometry(30, 5.6), nameMat);
    name.position.z = side * 7.3;
    name.rotation.y = side > 0 ? 0 : Math.PI;
    ship.add(name);
  }
  scene.add(ship);
  landmarks.ship = ship;
  landmarks.shipT = 40;
}

function updateLandmarks(dt) {
  if (landmarks.wheel) landmarks.wheel.rotateZ(dt * 0.12);
  if (!landmarks.ship) return;
  // one slow lap of the island every five minutes, nose first
  landmarks.shipT += dt;
  const lap = landmarks.shipT * 0.021;
  landmarks.ship.position.set(Math.cos(lap) * 300, 150 + Math.sin(lap * 3) * 6, Math.sin(lap) * 300);
  landmarks.ship.rotation.y = -lap - Math.PI / 2;

  const flock = landmarks.gulls;
  const p = flock.geo.attributes.position.array;
  flock.mat.color.setScalar(1 - nightAmount * 0.72);
  flock.birds.forEach((b, k) => {
    b.a += b.w * dt;
    b.flap += dt * 7;
    const x = b.cx + Math.cos(b.a) * b.r;
    const z = b.cz + Math.sin(b.a) * b.r;
    const y = b.y + Math.sin(b.a * 2) * 1.2;
    const way = Math.sign(b.w);
    const fx = -Math.sin(b.a) * way;
    const fz = Math.cos(b.a) * way;
    const tip = y + 0.12 + Math.sin(b.flap) * 0.55;
    const o = k * 18;
    for (const side of [1, -1]) {
      const at = o + (side > 0 ? 0 : 9);
      p[at] = x + fx * 0.45;
      p[at + 1] = y;
      p[at + 2] = z + fz * 0.45;
      p[at + 3] = x - fx * 0.3;
      p[at + 4] = y;
      p[at + 5] = z - fz * 0.3;
      p[at + 6] = x + side * fz * 1.35 - fx * 0.2;
      p[at + 7] = tip;
      p[at + 8] = z - side * fx * 1.35 - fz * 0.2;
    }
  });
  flock.geo.attributes.position.needsUpdate = true;
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
        gl_FragColor = vec4(mix(bot, top, smoothstep(0.0, 0.5, h)), 0.0);   // alpha 0: the glow pass leaves the sky alone
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

const moon = new T.Sprite(
  new T.SpriteMaterial({
    map: radialTexture('rgba(235,242,255,1)', 'rgba(150,180,255,0)'),
    blending: T.AdditiveBlending,
    transparent: true,
    fog: false,
    depthWrite: false,
  })
);
moon.scale.set(170, 170, 1);
scene.add(moon);

// a few flat, soft clouds high over the island; they take the colour of the sky
const cloudList = [];
for (let k = 0; k < 34; k++) {
  cloudList.push({ x: (RT() - 0.5) * 3600, y: 300 + RT() * 130, z: (RT() - 0.5) * 3600, sx: 260 + RT() * 320, sz: 130 + RT() * 150, turn: RT() * 3 });
}
function cloudTexture() {
  const c = mkCanvas(256);
  const g = c.getContext('2d');
  for (let k = 0; k < 16; k++) {
    const x = 64 + RT() * 128;
    const y = 96 + RT() * 64;
    const r = 30 + RT() * 44;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
  }
  return new T.CanvasTexture(c);
}
const cloudMat = new T.MeshBasicMaterial({ map: cloudTexture(), transparent: true, opacity: 0.8, depthWrite: false, fog: false, side: T.DoubleSide });
const cloudGeo = new T.PlaneGeometry(1, 1);
cloudGeo.rotateX(-Math.PI / 2);
const clouds = instanced(cloudGeo, cloudMat, cloudList, (d, c) => {
  d.position.set(c.x, c.y, c.z);
  d.rotation.y = c.turn;
  d.scale.set(c.sx, 1, c.sz);
});
clouds.renderOrder = -1;
let glowAmount = 0;               // 0 at midday, 1 at night; drives the glow pass

const SKY = [
  [0, '#050818', '#141a3a'],
  [5, '#0a1030', '#2a2350'],
  [6.5, '#3b5fa8', '#ff9e6e'],
  [9, '#1f7fdc', '#ffe2c4'],
  [12.5, '#1787dc', '#d8f2ec'],
  [16, '#2b7cd3', '#ffd9b3'],
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
  updateLandmarks(dt);
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
  shopMat.emissiveIntensity = nightAmount * 0.72;
  glowAmount = 1 - (smooth(6.5, 9, tod) - smooth(16, 19.2, tod));
  cloudMat.color.copy(skyBot).lerp(tmpColor.set('#ffffff'), 0.12 + 0.6 * day);
  cloudMat.opacity = 0.45 + 0.4 * day;
  clouds.position.x = ((performance.now() / 1000) * 2.5) % 600;
  moon.visible = sy < 0.15;
  moon.position.set(camera.position.x - sx * 1500, camera.position.y + Math.max(0.3, -sy) * 1500, camera.position.z - 700);
  const wu = waterMat.uniforms;
  wu.time.value += dt;
  wu.skyC.value.copy(skyBot).lerp(skyTop, 0.4 * day);
  wu.deep.value.set('#0b3a58').lerp(tmpColor.set('#0aa0a6'), day);
  wu.fogC.value.copy(skyBot);
  wu.sunC.value.copy(sun.color).multiplyScalar(up ? 0.35 + 0.65 * lift : 0.5);
  wu.sunDir.value.set(up ? sx : -sx, Math.max(0.2, Math.abs(sy)), up ? 0.36 : -0.45).normalize();
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
buildMurals();
buildLandmarks();
