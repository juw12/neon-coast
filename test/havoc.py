"""What version 2.0 added to make the game more fun to play, one rule at a time: a street that breaks (cones,
bins, news boxes, crates, hydrants, barrels and lamp posts are knocked flying and pay into the style chain),
barrels that go up, stunt ramps, a nitro tank that tricks fill, parked cars that are shoved out of the way,
hard hits that turn a car round, people thrown by a fast car, and traffic put on the road ahead at speed.

The player's car is placed through the game's test handle (window.NEON) and the game is left to run each case
itself. Time is counted on the game's own clock (the game never moves on more than 0.1 s a frame, 0.05 s before 2.0.1), so a slow PC
cannot fail it. Run it against an older build to see which rules are new: there they fail.

It proves the rules hold. It does not prove that the game is more fun: only playing it can.

    python test/havoc.py                 # NeonCoast.html; one line per check, exit code 0 when all pass
    python test/havoc.py other.html      # another build
"""
import os
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

# NEON_WINDOW=1 opens a real window instead of a headless browser (a GitHub Mac uses its graphics card in both).
# NEON_CHROME_ARGS adds flags (the frame-rate gate runs without the 60 Hz cap of the display).
WINDOW = os.environ.get("NEON_WINDOW") == "1"
EXTRA_ARGS = os.environ.get("NEON_CHROME_ARGS", "").split()

ROOT = Path(__file__).resolve().parent.parent
results = []

# shared by every case: the game clock, an empty street, the keys of the player's car, a clean slate
TOOLS = """
    const n = NEON, c = n.player.car;
    let last = performance.now(), clock = 0;
    const step = () => { const now = performance.now(); const dt = Math.min(NEON.STEP * NEON.MAX_STEPS || 0.05, (now - last) / 1000); last = now; clock += dt; return dt; };
    const empty = (keep) => {
        for (const v of n.vehicles.slice()) if (v !== c && !keep.includes(v)) n.removeVehicle(v);
    };
    const noPeople = (keep) => {
        for (const p of n.peds.slice()) if (!keep.includes(p)) { n.scene.remove(p.mesh); n.peds.splice(n.peds.indexOf(p), 1); }
    };
    const press = (held) => { for (const key of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'ShiftLeft']) n.keys[key] = held.includes(key); };
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const roadC = (i) => -420 + 84 * i;
    const put = (v, x, z, h, speed) => {
        v.x = x; v.z = z; v.h = h; v.vx = Math.sin(h) * speed; v.vz = Math.cos(h) * speed;
        v.y = 0; v.vy = 0; v.air = false; v.spin = 0; v.jump = null; v.steer = 0; v.stun = 0;
    };
    const fresh = () => {
        n.save.mission = Math.max(1, n.save.mission);     // past the learner phase, where the police look away
        n.save.difficulty = 1;
        n.setWanted(0); n.wanted.pts = 0;
        n.resetHavoc();                                   // everything stands again, the tank is half full
        Object.assign(n.style, { bank: 0, count: 0, t: 0, drift: 0, crashT: 0, smashes: 0, free: 0 });
        if (c) { c.hp = c.t.hp; c.crashT = 0; put(c, c.x, c.z, c.h, 0); }
        press([]);
    };
    const card = () => { const el = document.getElementById('style'); return el && el.className.includes('show') ? el.textContent : ''; };
    const speedOf = (v) => Math.hypot(v.vx, v.vz);
"""

# The world as it was built: what stands where, and that none of it is in the way of a job, a shop or a kerb stop.
WORLD_JS = """() => {
    const n = NEON, out = { kinds: {} };
    for (const p of n.props) out.kinds[p.kind] = (out.kinds[p.kind] || 0) + 1;
    out.ramps = n.ramps.length;
    out.works = n.worksAt.length;
    out.lamps = n.lamps.length;
    // metres from a spot to the nearest job stop, shop, front door, ferry stop or the place a new game starts
    const clear = (x, z) => { for (let r = 0.5; r <= 40; r += 0.5) if (n.nearPlace(x, z, r)) return r; return 40; };
    out.rampClear = Math.min(...n.ramps.map((r) => clear(r.x, r.z)));
    out.worksClear = Math.min(...n.worksAt.map((w) => clear(w.x, w.z)));
    out.propClear = Math.min(...n.props.filter((p) => p.kind !== 'lamp').map((p) => clear(p.x, p.z)));
    out.startClear = Math.min(...n.props.filter((p) => p.kind !== 'lamp').map((p) => Math.hypot(p.x - n.START.x, p.z - n.START.z)));
    // metres from anything that can be knocked over (lamp posts aside) to the nearest tree trunk
    out.treeClear = 99;
    for (const row of n.blocks) for (const b of row) for (const t of b.circles) {
        for (const p of n.props) {
            if (p.kind === 'lamp' || Math.abs(p.x - t.x) > 4 || Math.abs(p.z - t.z) > 4) continue;
            out.treeClear = Math.min(out.treeClear, Math.hypot(p.x - t.x, p.z - t.z));
        }
    }
    // every ramp: 40 m of run-up, the flight and 50 m beyond are free of walls, and nothing stands in the run-up or the landing
    out.walled = []; out.cluttered = [];
    for (const r of n.ramps) {
        let wall = 0, clutter = 0;
        for (let u = -40; u <= 50; u += 1) for (const w of [-1.6, 0, 1.6]) if (n.insideBox(r.x + r.fx * u + r.fz * w, r.z + r.fz * u - r.fx * w)) wall++;
        for (const p of n.props) {
            const dx = p.x - r.x, dz = p.z - r.z;
            if (Math.abs(dx) > 60 || Math.abs(dz) > 60) continue;
            const u = dx * r.fx + dz * r.fz, w = dx * r.fz - dz * r.fx;
            if (Math.abs(w) < 1.9 && ((u > -40 && u < -4.5) || (u > 22 && u < 50))) clutter++;
        }
        if (wall) out.walled.push(r.id);
        if (clutter) out.cluttered.push(r.id);
    }
    // a few hundred parked cars and kerb stops: none of them on a ramp or in road works
    out.parked = 0; out.parkedBusy = 0;
    for (let k = 0; k < 4000 && out.parked < 300; k++) {
        const v = n.spawnTraffic(0, 5000, true);
        if (!v) continue;
        out.parked++;
        if (n.kerbBusy(v.x, v.z)) out.parkedBusy++;
        n.removeVehicle(v);
    }
    out.stops = 0; out.stopsBusy = 0;
    for (let k = 0; k < 300; k++) {
        const stop = n.roadStop(0, 5000, [0, 0]);
        out.stops++;
        if (n.kerbBusy(stop.at[0], stop.at[1])) out.stopsBusy++;
    }
    out.news = (document.body.textContent.match(/Version 2[.]0[^.]*/) || [''])[0].trim();
    return out;
}"""

# A line of seven cones down the middle of a street. `mode` says who goes through it:
#   'drive'    the player's car at `speed`, throttle held
#   'crashed'  the same, in the second after a crash (style.crashT held at 1)
#   'loose'    a car with nobody in it, rolling at `speed`; the player's car waits 60 m back
# With `then`, two hydrants are knocked over as the player once the cones are down (a hydrant is a trick).
# Then the car is stopped and the game is left alone until the chain is paid.
CONES_JS = """(setup) => new Promise(done => {""" + TOOLS + """
    fresh();
    empty([]); noPeople([]);
    const lines = new Map();
    for (const p of n.props) {
        if (p.kind !== 'cone') continue;
        for (let i = 0; i <= 10; i++) {
            const key = Math.abs(p.x - roadC(i)) < 0.01 ? 'z' + i + ':' + Math.floor((p.z + 420) / 84)
                : Math.abs(p.z - roadC(i)) < 0.01 ? 'x' + i + ':' + Math.floor((p.x + 420) / 84) : '';
            if (key) lines.set(key, (lines.get(key) || []).concat(p));
        }
    }
    const full = [...lines.entries()].filter(([, list]) => list.length === 7).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    if (full.length <= setup.line) return done({ error: 'no line of seven cones', lines: full.length });
    const [key, cones] = full[setup.line];
    const alongZ = key[0] === 'z';
    cones.sort((a, b) => (alongZ ? a.z - b.z : a.x - b.x));
    const h = alongZ ? 0 : Math.PI / 2, fx = Math.sin(h), fz = Math.cos(h);
    const first = cones[0], end = cones[6];
    const runner = setup.mode === 'loose' ? n.addVehicle('sedan', first.x - fx * 9, first.z - fz * 9, h, null) : c;
    if (setup.mode === 'loose') put(c, first.x - fx * 60, first.z - fz * 60, h, 0);
    put(runner, first.x - fx * (setup.mode === 'loose' ? 9 : 14), first.z - fz * (setup.mode === 'loose' ? 9 : 14), h, setup.speed);
    const money0 = n.save.money, hp0 = c.hp, tank0 = n.nitro.tank, smashed0 = n.save.smashed || 0, tricks0 = n.save.tricks || 0;
    const out = { lines: full.length, cones: 7, knocked: 0, high: 0, bank: 0, count: 0, mult: 0, card: '', paidCard: '', after: [] };
    const down = new Set();
    let phase = 0, stopAt = 0, enter = 0;
    const tick = () => {
        step();
        empty([runner]); noPeople([]);
        for (const p of cones) { if (p.st !== 0) down.add(p); out.high = Math.max(out.high, p.y); }
        const words = card();
        if (words.includes('BANKED')) out.paidCard = words; else if (words) out.card = words;
        out.bank = Math.max(out.bank, n.style.bank); out.count = Math.max(out.count, n.style.count);
        out.mult = Math.max(out.mult, n.styleMult());
        if (phase === 0) {
            if (setup.mode === 'crashed') n.style.crashT = 1;
            if (setup.mode === 'loose') { runner.shoved = 2; runner.vx = fx * setup.speed; runner.vz = fz * setup.speed; }
            else press(['KeyW']);
            if (!enter) enter = speedOf(runner);
            const past = (runner.x - end.x) * fx + (runner.z - end.z) * fz;
            if (past > 6 || clock > 6) {
                out.exit = speedOf(runner);
                out.enter = enter;
                out.gain = n.nitro.tank - tank0;
                out.free = n.style.free; out.smashes = n.style.smashes;
                press([]);
                runner.vx = runner.vz = 0;
                if (setup.then) {
                    const here = n.props.filter((p) => p.kind === 'hydrant' && p.st === 0)
                        .sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z));
                    for (const hydrant of here.slice(0, 2)) {
                        n.knockProp(hydrant, 12, 0, true);
                        out.after.push({ mult: n.styleMult(), bank: n.style.bank, count: n.style.count });
                    }
                }
                phase = 1; stopAt = clock;
            }
        } else {
            c.vx = c.vz = 0;
            if (setup.mode === 'loose') { runner.vx = runner.vz = 0; }
            const open = n.style.count > 0;
            if ((!open && clock - stopAt > 2.2) || clock - stopAt > 8) {
                out.knocked = down.size;
                out.lying = cones.filter((p) => p.st === 2 && p.y === 0).length;
                out.paid = n.save.money - money0;
                out.lost = hp0 - c.hp;
                out.smashed = (n.save.smashed || 0) - smashed0;
                out.tricks = (n.save.tricks || 0) - tricks0;
                out.stars = n.wanted.stars;
                if (runner !== c) n.removeVehicle(runner);
                return done(out);
            }
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""

# One thing at the kerb: a bin, a news box, a hydrant, a barrel or a lamp post. The player's car is put on the
# street in front of it, pointing at it, and held at `speed` until it gets there. Then it rolls on for `roll`
# seconds (a barrel goes up a moment after it is hit) and is stopped, and the game is left alone for `wait` s.
PROP_JS = """(setup) => new Promise(done => {""" + TOOLS + """
    fresh();
    empty([]); noPeople([]);
    const reach = c.t.len * 0.3 + c.t.wid * 0.56;
    // the car comes at it along one of 16 compass lines: the first one that is free of walls, ramps and other things
    // from the car's tail at the start to where the car is stopped
    const behind = reach + 3 + c.t.len * 0.5 + 1;
    const ahead = 3.5 + setup.speed * (setup.roll || 0);
    const ways = [];
    for (let k = 0; k < 16; k++) ways.push([Math.sin((k * Math.PI) / 8), Math.cos((k * Math.PI) / 8)]);
    let target = null, dir = null, tried = 0;
    const standing = n.props.filter((p) => p.st === 0);
    const trunks = [];
    for (const row of n.blocks) for (const b of row) for (const t of b.circles) trunks.push(t);
    for (const p of standing) {
        if (p.kind !== setup.kind || n.nearPlace(p.x, p.z, 12) || n.kerbBusy(p.x, p.z)) continue;
        if (Math.abs(p.x) > 425 || Math.abs(p.z) > 425) continue;                 // on the street grid, not the dock
        const around = standing.filter((q) => q !== p && Math.abs(q.x - p.x) < 40 && Math.abs(q.z - p.z) < 40);
        // a barrel on its own: no second barrel to go up with it, and nothing in reach of the blast to be knocked over and paid for
        if (setup.kind === 'barrel' && around.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < (q.kind === 'barrel' ? 16 : n.BLAST.reach + 1.5))) continue;
        tried++;
        for (const way of ways) {
            let free = true;
            for (let u = -behind; u <= ahead && free; u += 0.5) {
                for (const w of [-1.2, 0, 1.2]) {
                    const sx = p.x + way[0] * u - way[1] * w, sz = p.z + way[1] * u + way[0] * w;
                    if (n.insideBox(sx, sz) || n.rampAt(sx, sz)) free = false;
                }
            }
            if (!free) continue;
            const clear = trunks.every((t) => {
                const dx = t.x - p.x, dz = t.z - p.z;
                if (Math.abs(dx) > 40 || Math.abs(dz) > 40) return true;
                const u = dx * way[0] + dz * way[1], w = Math.abs(dx * way[1] - dz * way[0]);
                return !(w < 2.4 + t.r && u > -behind - 1 && u < ahead + 3);
            });
            if (!clear) continue;
            const lonely = around.every((q) => {
                const dx = q.x - p.x, dz = q.z - p.z;
                const u = dx * way[0] + dz * way[1], w = Math.abs(dx * way[1] - dz * way[0]);
                return !(w < 2.4 && u > -behind - 1 && u < ahead + 1);
            });
            if (!lonely) continue;
            target = p; dir = way;
            break;
        }
        if (target) break;
    }
    if (!target) return done({ error: 'no ' + setup.kind + ' with a free approach', tried });
    const h = Math.atan2(dir[0], dir[1]);
    put(c, target.x - dir[0] * (reach + 3), target.z - dir[1] * (reach + 3), h, setup.speed);
    const money0 = n.save.money, hp0 = c.hp, tank0 = n.nitro.tank, smashed0 = n.save.smashed || 0, jets0 = n.jets.length;
    const out = { kind: setup.kind, at: [target.x, target.z], way: dir, knocked: false, high: 0, bank: 0, count: 0, card: '', boom: 0, slowed: false, stars: 0, thrown: 0 };
    let phase = 0, hitAt = 0, stopAt = 0;
    const tick = () => {
        step();
        empty([]); noPeople([]);
        const words = card();
        if (words && !words.includes('BANKED')) out.card = words;
        out.bank = Math.max(out.bank, n.style.bank); out.count = Math.max(out.count, n.style.count);
        out.high = Math.max(out.high, target.y);
        out.boom = Math.max(out.boom, +document.getElementById('boom').style.opacity || 0);
        out.stars = Math.max(out.stars, n.wanted.stars);
        out.thrown = Math.max(out.thrown, c.y);
        if (n.warp.t > 0) out.slowed = true;
        const past = (c.x - target.x) * dir[0] + (c.z - target.z) * dir[1];
        if (phase === 0) {
            if (target.st !== 0) {
                out.knocked = true;
                out.kept = speedOf(c) / setup.speed;
                phase = 1; hitAt = clock;
            } else if (past > 2 || clock > 5) {
                phase = 2; stopAt = clock;                  // drove through it: it still stands
            } else {
                c.vx = dir[0] * setup.speed; c.vz = dir[1] * setup.speed;
            }
        }
        if (phase === 1 && clock - hitAt >= (setup.roll || 0)) { phase = 2; stopAt = clock; }
        if (phase === 2) {
            if (!c.air) c.vx = c.vz = 0;
            if (clock - stopAt > (setup.wait || 1.5)) {
                out.st = target.st;
                out.lost = hp0 - c.hp;
                out.gain = n.nitro.tank - tank0;
                out.smashed = (n.save.smashed || 0) - smashed0;
                out.jets = n.jets.length - jets0;
                out.open = n.style.bank;
                out.paid = n.save.money - money0;
                if (target.kind === 'lamp') {
                    out.glow = n.lampMesh.glow.instanceMatrix.array[target.lamp * 16];
                    out.lean = target.a;
                }
                c.vx = c.vz = 0;
                return done(out);
            }
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""

# A blast set off by hand on the open sand west of the city: one parked car 3 m from it, one 9 m from it, and a
# person 4 m from it. The player's car waits 60 m away.
BLAST_JS = """() => new Promise(done => {""" + TOOLS + """
    fresh();
    empty([]); noPeople([]);
    const x = -454, z = -260;
    put(c, x, z + 60, 0, 0);
    const near = n.addVehicle('sedan', x, z + 3, 0, null);
    const far = n.addVehicle('sedan', x, z - 9, 0, null);
    const ped = n.addPed(x + 4, z);
    const out = { nearHigh: 0, farHigh: 0, pedHigh: 0 };
    let fired = false;
    const tick = () => {
        step();
        empty([near, far]); noPeople([ped]);
        if (!fired && clock > 0.3) {
            fired = true;
            out.nearHp = near.hp; out.farHp = far.hp;
            n.blast(x, 0.5, z, false);
            out.nearLost = out.nearHp - near.hp; out.farLost = out.farHp - far.hp;
            out.pedDown = ped.state === 'down';
        }
        out.nearHigh = Math.max(out.nearHigh, near.y); out.farHigh = Math.max(out.farHigh, far.y);
        out.pedHigh = Math.max(out.pedHigh, ped.mesh.position.y);
        if (clock > 2.3) {
            out.nearMoved = Math.hypot(near.x - x, near.z - z - 3);
            out.farMoved = Math.hypot(far.x - x, far.z - z + 9);
            out.ownLost = c.t.hp - c.hp;
            n.removeVehicle(near); n.removeVehicle(far); noPeople([]);
            return done(out);
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""

# The row of four barrels on the Rustport dock: a shot at the first one. The player's car stands 40 m away.
CHAIN_JS = """() => new Promise(done => {""" + TOOLS + """
    fresh();
    empty([]); noPeople([]);
    const row = n.props.filter((p) => p.kind === 'barrel' && Math.abs(p.hx + 287) < 0.01).sort((a, b) => a.z - b.z);
    if (row.length !== 4) return done({ error: 'no row of four barrels', row: row.length });
    put(c, -327, 455, Math.PI / 2, 0);
    const smashed0 = n.save.smashed || 0;
    const out = { row: row.length, boom: 0, count: 0, slowed: false };
    out.missed = n.shootProps(-285, 0.5, 440, 0, 0, 1, 20);        // a shot 2 m beside the row hits nothing
    out.hit = n.shootProps(-287, 0.5, 440, 0, 0, 1, 60);           // a shot along it hits the first barrel
    const tick = () => {
        step();
        empty([]); noPeople([]);
        c.vx = c.vz = 0;
        out.boom = Math.max(out.boom, +document.getElementById('boom').style.opacity || 0);
        out.count = Math.max(out.count, n.style.count);
        if (n.warp.t > 0) out.slowed = true;
        const gone = row.filter((p) => p.st === 3).length;
        if (gone === 4 && !out.secs) out.secs = clock;
        if (clock > 2.5) {
            out.gone = gone;
            out.blasts = (n.save.smashed || 0) - smashed0;
            out.card = card();
            out.lost = c.t.hp - c.hp;
            // the blast brought a star. The suite rests 5 s after this with the car standing, and nothing takes police
            // cars off the road in that time: one that stops beside the car makes an arrest in 2.4 s, the game takes
            // the player out of the car, and every case after this one needs the car. So the star goes here.
            out.stars = n.wanted.stars;
            n.setWanted(0); n.wanted.pts = 0;
            return done(out);
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""

# What was knocked over stays down while the player is near, and stands again once the player is 150 m away.
RESTORE_JS = """() => new Promise(done => {""" + TOOLS + """
    fresh();
    empty([]); noPeople([]);
    put(c, -3.2, -42, 0, 0);
    const target = n.props.filter((p) => p.st === 0 && p.kind !== 'lamp' && p.kind !== 'barrel' && p.z < -60 && Math.hypot(p.x - c.x, p.z - c.z) < 70)[0];
    if (!target) return done({ error: 'nothing to knock over near the test avenue' });
    const money0 = n.save.money;
    n.knockProp(target, 8, 0, false);
    const out = { kind: target.kind, away: Math.hypot(target.x - c.x, target.z - c.z) };
    let moved = 0;
    const tick = () => {
        step();
        empty([]); noPeople([]);
        c.vx = c.vz = 0;
        if (!moved && clock > 2) {
            out.stNear = target.st;
            out.listedNear = n.fallen.includes(target);
            out.shift = Math.hypot(target.x - target.hx, target.z - target.hz);
            put(c, -3.2, 150, 0, 0);
            moved = clock;
        } else if (moved && clock - moved > 0.4) {
            out.stFar = target.st;
            out.listedFar = n.fallen.includes(target);
            out.home = Math.hypot(target.x - target.hx, target.z - target.hz);
            out.far = Math.hypot(target.hx - c.x, target.hz - c.z);
            out.paid = n.save.money - money0 + n.style.bank;
            put(c, -3.2, -42, 0, 0);
            return done(out);
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""

# Since 2.0.1 a barrel that went up does not stand again at 150 m like the rest: it stays gone for BARREL_BACK seconds
# of play. The row on the Rustport dock is shot, the player is put 400 m away, and then the barrels' clock is wound on.
BARREL_JS = """() => new Promise(done => {""" + TOOLS + """
    fresh();
    empty([]); noPeople([]);
    const row = n.props.filter((p) => p.kind === 'barrel' && Math.abs(p.hx + 287) < 0.01);
    if (row.length !== 4) return done({ error: 'no row of four barrels', row: row.length });
    put(c, -327, 455, Math.PI / 2, 0);
    const out = { wait: n.BARREL_BACK, lit: n.shootProps(-287, 0.5, 440, 0, 0, 1, 60) };
    let stage = 0, mark = 0;
    const tick = () => {
        step();
        empty([]); noPeople([]);
        c.vx = c.vz = 0;
        if (stage === 0 && clock > 2.5) {
            out.gone = row.filter((p) => p.st === 3).length;
            put(c, -3.2, 150, 0, 0);
            stage = 1; mark = clock;
        } else if (stage === 1 && clock - mark > 0.6) {
            out.far = Math.min(...row.map((p) => Math.hypot(p.hx - c.x, p.hz - c.z)));
            out.goneFar = row.filter((p) => p.st === 3).length;
            out.listedFar = row.filter((p) => n.fallen.includes(p)).length;
            for (const p of row) p.upAt = n.clock - (n.BARREL_BACK - 1);      // all but one second of the wait is over
            stage = 2; mark = clock;
        } else if (stage === 2 && clock - mark > 0.2 && out.goneEarly === undefined) {
            out.goneEarly = row.filter((p) => p.st === 3).length;
        } else if (stage === 2 && clock - mark > 1.6) {
            out.standing = row.filter((p) => p.st === 0).length;
            out.listedLate = row.filter((p) => n.fallen.includes(p)).length;
            out.home = Math.max(...row.map((p) => Math.hypot(p.x - p.hx, p.z - p.hz)));
            put(c, -3.2, -42, 0, 0);
            n.setWanted(0); n.wanted.pts = 0;
            return done(out);
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""

# A stunt ramp. The player's car is put `back` metres before the middle of ramp `ramp`, pointing up it, at `speed`
# (throttle held when `gas` is set). With `reverse` it is put beyond the tall end instead, pointing back at it.
RAMP_JS = """(setup) => new Promise(done => {""" + TOOLS + """
    fresh();
    empty([]); noPeople([]);
    const r = n.ramps[setup.ramp];
    if (!r) return done({ error: 'no ramp ' + setup.ramp });
    n.save.jumps.length = 0; n.save.jumpBest = 0;
    const way = setup.reverse ? -1 : 1;
    put(c, r.x - r.fx * setup.back * way, r.z - r.fz * setup.back * way, r.h + (setup.reverse ? Math.PI : 0), setup.speed);
    const hp0 = c.hp, tank0 = n.nitro.tank, clock0 = n.clock;
    const out = { ramp: r.id, at: [r.x, r.z], flew: false, high: 0, far: 0, minU: 99, card: '', bank: 0, count: 0, slowed: false, nose: 0, burned: false, frame: 0 };
    let from = null, landed = 0, airFrom = 0;
    const tick = () => {
        const dt = step();
        // the longest frame up to the landing: this script sees the take-off and the landing one frame late at most
        if (!landed) out.frame = Math.max(out.frame, dt);
        empty([]); noPeople([]);
        out.high = Math.max(out.high, c.y);
        out.minU = Math.min(out.minU, (c.x - r.x) * r.fx + (c.z - r.z) * r.fz);
        out.nose = Math.max(out.nose, Math.abs(c.tilt));
        if (n.warp.t > 0) out.slowed = true;
        const words = card();
        if (words.includes('STUNT')) out.card = words;
        if (!landed) {
            press(setup.gas ? ['KeyW'] : []);
            if (setup.nitro && c.air) { press(['KeyW', 'ShiftLeft']); if (n.nitro.on) out.burned = true; }
            if (c.air && !from) { from = [c.x, c.z]; airFrom = n.clock; out.takeOff = speedOf(c); }
            if (from && !c.air) {
                landed = clock;
                out.flew = true;
                out.far = Math.hypot(c.x - from[0], c.z - from[1]);
                out.secs = n.clock - airFrom;
                out.landAt = [c.x, c.z];
                out.landSpeed = speedOf(c);
            }
        }
        if (landed) { press([]); c.vx = c.vz = 0; }
        if ((landed && clock - landed > 0.5) || clock > (setup.seconds || 5)) {
            press([]);
            out.bank = n.style.bank; out.count = n.style.count;
            out.jumps = n.save.jumps.slice(); out.best = n.save.jumpBest;
            out.lost = hp0 - c.hp;
            out.gain = n.nitro.tank - tank0;
            out.end = speedOf(c);
            c.vx = c.vz = 0;
            return done(out);
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""

# A tip that is said once must not take the hint line from a job. The car stands 15 m in front of a ramp it has
# never been near, with a hint on the line: the hint stays and the tip is not spent. Then the line is let go,
# as its own timer does, and the tip is said.
TIP_JS = """() => new Promise(done => {""" + TOOLS + """
    fresh();
    empty([]); noPeople([]);
    if (!n.hint) return done({ error: 'no hint on the test handle' });
    const line = document.getElementById('hint');
    const r = n.ramps[5];
    put(c, r.x - r.fx * 15, r.z - r.fz * 15, r.h, 0);
    n.save.havocTold = 0;
    n.hint('Take the van to the dock.', 60);
    const out = { busy: '', busyShown: false, busyTold: -1, free: '', freeShown: false, freeTold: -1, waited: 0 };
    let phase = 0, mark = 0;
    const tick = () => {
        step();
        empty([]); noPeople([]);
        press([]); c.vx = c.vz = 0;
        if (phase === 0 && clock > 1) {
            out.busy = line.textContent; out.busyShown = line.classList.contains('show'); out.busyTold = n.save.havocTold;
            line.classList.remove('show');
            phase = 1; mark = clock;
        } else if (phase === 1 && ((n.save.havocTold & 2) || clock - mark > 2)) {
            out.waited = clock - mark;
            out.free = line.textContent; out.freeShown = line.classList.contains('show'); out.freeTold = n.save.havocTold;
            return done(out);
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""

# The nitro, on the open sand with the car held in one place (a treadmill: its speed is its own).
#   1. from 12 m/s, 0.6 s of throttle, then the same with the nitro: how much speed each gives, how fast the tank drains
#   2. throttle alone for 4 s from near top speed: the car's own top speed
#   3. a full tank burned for 2.6 s: the top speed with nitro, and what the speed bar and the tank bar show
#   4. the nitro let go, throttle held for 5 s: back to its own top speed
#   5. an empty tank: nothing happens
NITRO_JS = """() => new Promise(done => {""" + TOOLS + """
    fresh();
    empty([]); noPeople([]);
    const x = -454, z = -260;
    const out = { top: c.t.max, boostClass: false, plainClass: false, emptyOn: false };
    const bar = () => document.getElementById('nitro').style.width;
    const stages = [
        { secs: 0.6, keys: ['KeyW'], start: 12, tank: 1, name: 'plain' },
        { secs: 0.6, keys: ['KeyW', 'ShiftLeft'], start: 12, tank: 1, name: 'boost' },
        { secs: 4, keys: ['KeyW'], start: c.t.max * 0.95, tank: 1, name: 'own' },
        { secs: 2.6, keys: ['KeyW', 'ShiftLeft'], tank: 1, name: 'burn' },
        { secs: 5, keys: ['KeyW'], name: 'bleed' },
        { secs: 0.8, keys: ['KeyW', 'ShiftLeft'], tank: 0, name: 'dry' },
    ];
    let at = -1, began = 0, speed0 = 0, tank0 = 0;
    const next = () => {
        if (at >= 0) {
            const s = stages[at], secs = n.clock - began;
            out[s.name] = { secs, from: speed0, to: speedOf(c), gained: speedOf(c) - speed0, burned: tank0 - n.nitro.tank, bar: bar() };
        }
        at++;
        if (at >= stages.length) return false;
        const s = stages[at];
        if (s.start !== undefined) put(c, x, z, 0, s.start);
        if (s.tank !== undefined) n.nitro.tank = s.tank;
        press(s.keys);                                    // held from the game's next step on
        began = n.clock; speed0 = speedOf(c); tank0 = n.nitro.tank;
        return true;
    };
    put(c, x, z, 0, 12);
    next();
    const tick = () => {
        step();
        empty([]); noPeople([]);
        c.x = x; c.z = z; c.h = 0; c.vx = 0;
        const s = stages[at];
        press(s.keys);
        const lit = document.getElementById('drive').classList.contains('boost');
        if (s.name === 'burn' && n.clock - began > 0.3) { if (lit && n.nitro.on) out.boostClass = true; out.fast = Math.max(out.fast || 0, speedOf(c)); }
        if (s.name === 'own' && n.clock - began > 0.3 && lit) out.plainClass = true;
        if (s.name === 'dry' && (n.nitro.on || lit)) out.emptyOn = true;
        if (n.clock - began >= s.secs && !next()) {
            press([]);
            c.vx = c.vz = 0;
            return done(out);
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""

# The same on a phone: one thumb on the NITRO button, nothing on GAS.
THUMB_JS = """() => new Promise(done => {""" + TOOLS + """
    fresh();
    empty([]); noPeople([]);
    n.setTouchMode(true);
    const x = -454, z = -260;
    put(c, x, z, 0, 12);
    n.nitro.tank = 1;
    const pad = document.getElementById('tb-nitro');
    const out = { power: 0, burning: 0, from: 12, lit: false, shown: false };
    let dry = 0;
    const tick = () => {
        step();
        empty([]); noPeople([]);
        c.x = x; c.z = z; c.h = 0; c.vx = 0;
        if (!dry) {
            press(['ShiftLeft']);
            if (clock > 0.25) {
                if (c.thr > 0) out.power++;
                if (n.nitro.on) out.burning++;
                if (pad.classList.contains('on')) out.lit = true;
                if (getComputedStyle(pad).display !== 'none') out.shown = true;
            }
            if (clock > 0.9) { out.to = speedOf(c); n.nitro.tank = 0; dry = clock; press([]); }
        } else if (clock - dry > 0.6) {
            out.dark = !pad.classList.contains('on');
            n.setTouchMode(false);
            c.vx = c.vz = 0;
            return done(out);
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""

# The player's car at `speed` into the back of another car on the open sand. `target` is 'parked' (nobody in it)
# or 'ai' (a driver, doing 6 m/s the same way); `offset` puts it that many metres to the side of the player's line.
SHOVE_JS = """(setup) => new Promise(done => {""" + TOOLS + """
    fresh();
    empty([]); noPeople([]);
    const x = -454, z = -300;
    put(c, x, z, 0, setup.speed);
    const other = n.addVehicle('sedan', x + setup.offset, z + 16, 0, setup.target === 'ai' ? 'ai' : null);
    if (setup.target === 'ai') other.vz = 6;
    const start = [other.x, other.z], hp0 = c.hp, otherHp = other.hp;
    const out = { minSpeed: 99, turned: 0, ownTurned: 0, stun: 0, powerless: 0, frames: 0, hitSpeed: 0 };
    let hit = 0;
    const tick = () => {
        step();
        empty([other]); noPeople([]);
        press(['KeyW']);
        if (!hit) {
            if (setup.target === 'ai') { other.x = x + setup.offset; other.h = 0; other.vx = 0; other.vz = 6; }
            if (other.hp < otherHp || Math.hypot(other.x - start[0], other.z - start[1]) > 0.3 && setup.target !== 'ai') { hit = clock; out.hitSpeed = speedOf(c); }
            if (clock > 4) return done({ error: 'never touched', gap: other.z - c.z });
        } else {
            const since = clock - hit;
            if (since < 1) out.minSpeed = Math.min(out.minSpeed, speedOf(c));
            if (since < 1.5) {
                out.turned = Math.max(out.turned, Math.abs(wrap(other.h)));
                out.ownTurned = Math.max(out.ownTurned, Math.abs(wrap(c.h)));
            }
            if (since < 0.4) {
                out.stun = Math.max(out.stun, other.stun || 0);
                out.frames++;
                if (other.thr === 0) out.powerless++;
            }
            if (since > 2.5) {
                press([]);
                out.pushed = Math.hypot(other.x - start[0], other.z - start[1]);
                out.lost = hp0 - c.hp;
                out.otherLost = otherHp - other.hp;
                n.removeVehicle(other);
                c.vx = c.vz = 0;
                return done(out);
            }
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""

# A person standing in the way of the player's car, on the open sand.
PED_JS = """(setup) => new Promise(done => {""" + TOOLS + """
    fresh();
    empty([]); noPeople([]);
    const x = -454, z = -300;
    put(c, x, z, 0, setup.speed);
    const ped = n.addPed(x, z + 14);
    const out = { down: false, high: 0 };
    const tick = () => {
        step();
        empty([]); noPeople([ped]);
        if (ped.state !== 'down') {
            ped.x = x; ped.z = z + 14;
            c.x = x; c.h = 0; c.vx = 0; c.vz = setup.speed;
        } else {
            out.down = true;
            c.vx = c.vz = 0;
        }
        out.high = Math.max(out.high, ped.mesh.position.y);
        if (clock > 3) {
            noPeople([]);
            c.vx = c.vz = 0;
            return done(out);
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""

# Where new traffic is put: the game is asked for 300 cars between 95 and 250 m away while the player's car does
# `speed` m/s up the avenue through the middle of the map. The share put ahead of the car is counted.
AHEAD_JS = """(speed) => {
    const n = NEON, c = n.player.car;
    for (const v of n.vehicles.slice()) if (v !== c) n.removeVehicle(v);
    c.x = -3.2; c.z = -42; c.h = 0; c.vx = 0; c.vz = speed;
    let made = 0, ahead = 0, path = 0;
    for (let k = 0; k < 6000 && made < 300; k++) {
        const v = n.spawnTraffic(95, 250, false);
        if (!v) continue;
        made++;
        if (v.z > c.z) ahead++;
        if (v.z > c.z + 40 && Math.abs(v.x - c.x) < 100) path++;
        n.removeVehicle(v);
    }
    c.vz = 0;
    return { made, ahead, share: made ? ahead / made : 0, path: made ? path / made : 0 };
}"""

# On foot: a ramp is walked up from its low end, and its tall end is a wall.
FOOT_JS = """(setup) => new Promise(done => {
    const n = NEON, p = n.player, r = n.ramps[setup.ramp];
    for (const v of n.vehicles.slice()) n.removeVehicle(v);
    const way = setup.reverse ? -1 : 1;
    p.x = r.x - r.fx * (r.len / 2 + 1.2) * way; p.z = r.z - r.fz * (r.len / 2 + 1.2) * way; p.y = 0; p.vy = 0;
    const out = { high: 0, minU: 99, maxU: -99 };
    let last = performance.now(), clock = 0;
    const tick = () => {
        const now = performance.now(); clock += Math.min(NEON.STEP * NEON.MAX_STEPS || 0.05, (now - last) / 1000); last = now;
        for (const key of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'ShiftLeft']) n.keys[key] = key === 'KeyW';
        n.cam.yaw = r.h + (setup.reverse ? Math.PI : 0);
        const u = (p.x - r.x) * r.fx + (p.z - r.z) * r.fz;
        out.high = Math.max(out.high, p.y);
        out.minU = Math.min(out.minU, u); out.maxU = Math.max(out.maxU, u);
        if (clock > setup.seconds) {
            n.keys.KeyW = false;
            out.end = p.y;
            return done(out);
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""

REST_JS = """(seconds) => new Promise(done => {
    for (const key of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'ShiftLeft']) NEON.keys[key] = false;
    let last = performance.now(), clock = 0;
    const tick = () => {
        const now = performance.now();
        clock += Math.min(NEON.STEP * NEON.MAX_STEPS || 0.05, (now - last) / 1000); last = now;
        if (NEON.player.car) NEON.player.car.vx = NEON.player.car.vz = 0;
        clock >= seconds ? done(clock) : requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""


class Answer(dict):
    """What a case measured. A number the build does not have reads as 0, so an older build fails instead of stopping."""

    def __missing__(self, key):
        return 0


def ask(page, script, arg=None):
    try:
        value = page.evaluate(script, arg)
    except Exception as error:            # an older build: the handle this case needs is not there
        return Answer(error=str(error).splitlines()[0][:110])
    return Answer(value) if isinstance(value, dict) else Answer(value=value)


def check(name, test, detail=""):
    try:
        ok = bool(test())
    except Exception as error:
        ok = False
        detail = f"{detail}  ({type(error).__name__}: {error})"
    results.append((name, ok, detail))
    print(("PASS  " if ok else "FAIL  ") + name + (("  |  " + str(detail)) if detail else ""), flush=True)


def brief(value):
    def short(item):
        if isinstance(item, float):
            return round(item, 2)
        if isinstance(item, dict):
            return {key: short(inner) for key, inner in item.items()}
        if isinstance(item, list):
            return [short(inner) for inner in item]
        return item
    return json.dumps(short(value))


def run(target):
    problems = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=not WINDOW, args=[
            "--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] + EXTRA_ARGS)
        page = browser.new_context(viewport={"width": 1280, "height": 720}).new_page()
        page.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))
        page.on("console", lambda m: problems.append(f"{m.type}: {m.text}") if m.type == "error" else None)
        page.goto(target.resolve().as_uri())
        page.wait_for_timeout(800)
        page.click("#btn-new")
        page.wait_for_timeout(1000)

        # 1. the world as built
        world = ask(page, WORLD_JS)
        kinds = Answer(world["kinds"] or {})
        check("the streets are furnished: over 1,500 things to knock over, of seven kinds, lamp posts included",
              lambda: sum(kinds.values()) > 1500 and all(kinds[kind] >= 30 for kind in ("cone", "bin", "box", "crate", "hydrant", "barrel"))
              and kinds["lamp"] == world["lamps"] > 100, brief({"kinds": kinds, "works": world["works"], "error": world["error"]}))
        check("there are 12 stunt ramps, each with 40 m of run-up, a flight and a landing free of walls and of things",
              lambda: world["ramps"] == 12 and world["walled"] == [] and world["cluttered"] == [],
              brief({key: world[key] for key in ("ramps", "walled", "cluttered")}))
        check("no ramp or road works within 12 m of a job stop, shop, front door or ferry stop, and nothing but lamp posts within 6 m",
              lambda: world["rampClear"] >= 12 and world["worksClear"] >= 12 and world["propClear"] >= 6 and world["startClear"] >= 6,
              brief({key: world[key] for key in ("rampClear", "worksClear", "propClear", "startClear")}))
        check("nothing that can be knocked over stands within 2 m of a tree trunk: a car that comes for it does not hit the tree",
              lambda: world["treeClear"] >= 2, brief({"treeClear": world["treeClear"]}))
        check("300 parked cars and 300 cab stops asked for: none on a ramp or in road works",
              lambda: world["parked"] == 300 and world["parkedBusy"] == 0 and world["stops"] == 300 and world["stopsBusy"] == 0,
              brief({key: world[key] for key in ("parked", "parkedBusy", "stops", "stopsBusy")}))
        check("the menu says what 2.0 is", lambda: "Havoc" in world["news"], world["news"])

        page.evaluate("""() => { const n = NEON, p = n.player;
            const car = n.vehicles.filter(v => !v.driver && !v.dead && v.type !== 'police')
              .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
            car.vx = car.vz = 0; p.x = car.x + 2.2; p.z = car.z; n.tryEnterExit(); }""")
        page.wait_for_timeout(500)
        check("the player sits in a car", lambda: page.evaluate("() => !!NEON.player.car && NEON.state === 'play'"))

        # 2. a line of cones
        cones = ask(page, CONES_JS, {"speed": 20, "mode": "drive", "line": 0})
        check("a line of seven cones at 20 m/s: all seven fly (over 0.5 m up) and are left lying on the road",
              lambda: cones["knocked"] == 7 and cones["high"] > 0.5 and cones["lying"] == 7, brief(cones))
        check("they cost the car no health and no speed, and pay 7 x $5 = $35 when the chain runs out (SMASH on the card)",
              lambda: cones["lost"] == 0 and cones["exit"] >= cones["enter"] and cones["bank"] == 35 and cones["paid"] == 35
              and "SMASH" in cones["card"] and "BANKED" in cones["paidCard"] and "7 smashed" in cones["paidCard"], brief(cones))
        check("smashes are not tricks: the multiplier stays x1, no trick is counted, and each puts 3% in the nitro tank",
              lambda: cones["mult"] == 1 and cones["tricks"] == 0 and cones["smashed"] == 7 and abs(cones["gain"] - 0.21) < 0.005, brief(cones))
        page.evaluate(REST_JS, 1.0)
        after = ask(page, CONES_JS, {"speed": 20, "mode": "crashed", "line": 0})
        check("in the second after a crash, ploughing through the same cones pays nothing",
              lambda: after["knocked"] == 7 and after["bank"] == 0 and after["paid"] == 0 and after["smashed"] == 0, brief(after))
        page.evaluate(REST_JS, 1.0)
        loose = ask(page, CONES_JS, {"speed": 14, "mode": "loose", "line": 0})
        check("a car with nobody in it knocks cones over too, and that pays the player nothing",
              lambda: loose["knocked"] >= 3 and loose["bank"] == 0 and loose["paid"] == 0 and loose["smashed"] == 0, brief(loose))
        mixed = ask(page, CONES_JS, {"speed": 20, "mode": "drive", "line": 1, "then": True})
        check("a chain a smash opened: one trick on top leaves it at x1, a second makes it x1.5, as in a chain of tricks alone",
              lambda: [step["mult"] for step in mixed["after"]] == [1, 1.5] and mixed["after"][1]["bank"] == 85 and mixed["paid"] == 128,
              brief(mixed))
        page.evaluate(REST_JS, 1.0)

        # 3. one thing at the kerb
        nudge = ask(page, PROP_JS, {"kind": "bin", "speed": 2})
        check("nudged at 2 m/s a bin tips over, for no pay", lambda: nudge["knocked"] and nudge["bank"] == 0 and nudge["smashed"] == 0, brief(nudge))
        binned = ask(page, PROP_JS, {"kind": "bin", "speed": 15})
        check("hit at 15 m/s it flies and pays $10, and the car keeps more than 96% of its speed",
              lambda: binned["knocked"] and binned["high"] > 0.5 and binned["bank"] == 10 and binned["kept"] > 0.96 and binned["lost"] == 0, brief(binned))
        hydrant = ask(page, PROP_JS, {"kind": "hydrant", "speed": 15})
        check("a hydrant is a trick (HYDRANT, $25, 23% nitro) and leaves a jet of water",
              lambda: hydrant["knocked"] and "HYDRANT" in hydrant["card"] and hydrant["bank"] == 25 and hydrant["jets"] == 1
              and abs(hydrant["gain"] - 0.23) < 0.005 and hydrant["lost"] == 0, brief(hydrant))
        slow_lamp = ask(page, PROP_JS, {"kind": "lamp", "speed": 5})
        check("a lamp post is not knocked over at 5 m/s", lambda: not slow_lamp["knocked"] and slow_lamp["st"] == 0 and slow_lamp["glow"] > 0.9, brief(slow_lamp))
        lamp = ask(page, PROP_JS, {"kind": "lamp", "speed": 15, "wait": 2.5})
        check("at 15 m/s it falls flat (LAMP POST, $20), its light goes out, and it costs the car 7% of its speed and no health",
              lambda: lamp["knocked"] and lamp["st"] == 2 and lamp["lean"] > 1.5 and "LAMP POST" in lamp["card"] and lamp["bank"] == 20
              and lamp["glow"] < 0.01 and 0.89 <= lamp["kept"] <= 0.95 and lamp["lost"] == 0, brief(lamp))
        barrel = ask(page, PROP_JS, {"kind": "barrel", "speed": 15, "roll": 0.9, "wait": 2})
        check("a barrel rammed at 15 m/s goes up: BLAST on the card ($40, doubled if it brings a star), a flash, a moment of slow motion",
              lambda: barrel["knocked"] and barrel["st"] == 3 and "BLAST" in barrel["card"] and barrel["bank"] in (40, 80)
              and barrel["boom"] > 0.2 and barrel["slowed"], brief(barrel))
        check("it costs the car that set it off between 2 and 12 health of its 100 or more, and lifts it off the road",
              lambda: 2 <= barrel["lost"] <= 12 and barrel["thrown"] > 0.1, brief(barrel))

        # 4. blasts
        blast = ask(page, BLAST_JS)
        check("a blast 3 m from a parked car takes 26 x (1 - 3 / 7.5) = 15.6 health off it, lifts it and moves it over a metre",
              lambda: abs(blast["nearLost"] - 15.6) < 0.3 and blast["nearHigh"] > 0.3 and blast["nearMoved"] > 1, brief(blast))
        check("a car 9 m from it is not touched, a person 4 m from it is thrown over a metre up, the player's car 60 m off loses nothing",
              lambda: blast["farLost"] == 0 and blast["farMoved"] < 0.05 and blast["farHigh"] == 0 and blast["pedDown"]
              and blast["pedHigh"] > 1 and blast["ownLost"] == 0, brief(blast))
        chain = ask(page, CHAIN_JS)
        check("a shot at the first of the four barrels on the dock sets off all four within 2 s, each a BLAST in the chain",
              lambda: chain["hit"] and not chain["missed"] and chain["gone"] == 4 and 0 < chain["secs"] < 2 and chain["blasts"] >= 4
              and chain["count"] >= 4 and chain["lost"] == 0, brief(chain))
        page.evaluate(REST_JS, 5.0)

        # 5. what was knocked over comes back
        back = ask(page, RESTORE_JS)
        check("what is knocked over lies where it fell while the player is near, and stands again once the player is 150 m away",
              lambda: back["stNear"] == 2 and back["listedNear"] and back["shift"] > 0.5 and back["stFar"] == 0 and not back["listedFar"]
              and back["home"] == 0 and back["far"] > 150 and back["paid"] == 0, brief(back))

        # 5b. a barrel that went up stays gone (2.0.1)
        gone = ask(page, BARREL_JS)
        check("a barrel that went up is still gone with the player 150 m away, and stands again after ten minutes of play (2.0.1)",
              lambda: gone["wait"] == 600 and gone["lit"] and gone["gone"] == 4 and gone["far"] > 150 and gone["goneFar"] == 4
              and gone["listedFar"] == 4 and gone["goneEarly"] == 4 and gone["standing"] == 4 and gone["listedLate"] == 0
              and gone["home"] == 0, brief(gone))
        page.evaluate(REST_JS, 3.0)

        # 6. stunt ramps
        jump = ask(page, RAMP_JS, {"ramp": 2, "speed": 30, "back": 35, "gas": True})
        pay = 40 + round(jump["far"] * 4 / 5) * 5
        # The game measures a jump on its own steps of 1/60 s (since 2.0.1), this script once a frame: its metres can be
        # off by what the car covers in one frame (0.6 m at 60 frames a second, more on a slow computer).
        slack = jump["landSpeed"] * jump["frame"]
        check("a ramp at 30 m/s: the car leaves the ground, flies more than 20 m and lands with no health lost",
              lambda: jump["flew"] and jump["high"] > 2 and jump["far"] > 20 and jump["secs"] > 0.6 and jump["lost"] == 0 and jump["nose"] > 0.1, brief(jump))
        check("it is a trick: STUNT JUMP with the metres on the card, $40 + $5 for every 1.25 m, 35% nitro, a moment of slow motion",
              lambda: "STUNT JUMP" in jump["card"] and f"  {int(jump['best'])} m" in jump["card"] and jump["count"] == 1
              and abs(jump["bank"] - pay) <= 5 + 4 * slack and abs(jump["gain"] - 0.35) < 0.005 and jump["slowed"], brief(dict(jump, expected=pay)))
        check("the ramp is ticked off and the longest jump kept",
              lambda: jump["jumps"] == [2] and abs(jump["best"] - jump["far"]) <= 0.5 + slack, brief(dict(jump, slack=round(slack, 2))))
        page.evaluate(REST_JS, 5.0)
        hop = ask(page, RAMP_JS, {"ramp": 2, "speed": 10, "back": 10, "gas": False})
        check("rolled over at 10 m/s the same ramp is a hop of under 8 m: no trick, nothing ticked off",
              lambda: hop["flew"] and 0 < hop["far"] < 8 and hop["count"] == 0 and hop["jumps"] == [] and hop["lost"] == 0, brief(hop))
        wall = ask(page, RAMP_JS, {"ramp": 2, "speed": 14, "back": 22, "gas": True, "reverse": True, "seconds": 2.5})
        check("driven at from its tall end a ramp is a wall: the car stops in front of it and takes the knock",
              lambda: not wall["flew"] and wall["high"] < 0.3 and wall["minU"] > 4.5 and wall["lost"] > 0, brief(wall))
        other = ask(page, RAMP_JS, {"ramp": 11, "speed": 30, "back": 35, "gas": True, "nitro": True})
        check("the ramp on the Rustport dock throws a car over the barrel row as well, and the nitro does not burn in the air",
              lambda: other["flew"] and other["far"] > 20 and other["jumps"] == [11] and not other["burned"] and other["lost"] == 0, brief(other))
        page.evaluate(REST_JS, 5.0)

        tip = ask(page, TIP_JS)
        check("a tip said once waits for the hint line: with a job hint on screen 15 m from a ramp never seen the hint stays, and the tip comes once the line is free",
              lambda: tip["busyShown"] and tip["busy"] == "Take the van to the dock." and tip["busyTold"] == 0
              and tip["freeShown"] and "stunt ramp" in tip["free"] and tip["freeTold"] == 2, brief(tip))
        page.evaluate(REST_JS, 1.0)

        # 7. nitro
        nitro = ask(page, NITRO_JS)
        plain, boost, own, burn, bleed = (Answer(nitro[name] or {}) for name in ("plain", "boost", "own", "burn", "bleed"))
        check("from 12 m/s the nitro gives more than 1.8 times the speed that throttle alone gives in 0.6 s",
              lambda: plain["gained"] > 2 and boost["gained"] > 1.8 * plain["gained"],
              brief({"plain": plain["gained"], "nitro": boost["gained"]}))
        check("a full tank lasts 3.2 s (it drains at 0.31 a second), and throttle alone burns none",
              lambda: plain["burned"] == 0 and 0.27 < boost["burned"] / boost["secs"] < 0.36,
              brief({"burned": boost["burned"], "secs": boost["secs"]}))
        check("it takes the car more than 15% past its own top speed, and the speed bar and the tank bar show it",
              lambda: nitro["fast"] > 1.15 * own["to"] and nitro["boostClass"] and not nitro["plainClass"]
              and own["bar"] == "100%" and burn["bar"] not in ("100%", "", 0),
              brief({"own": own["to"], "nitro": nitro["fast"], "bars": [own["bar"], burn["bar"]], "lit": nitro["boostClass"]}))
        check("5 s after it is let go the car is back within 6% of its own top speed, and an empty tank does nothing",
              lambda: 0 < bleed["to"] < 1.06 * own["to"] and not nitro["emptyOn"],
              brief({"own": own["to"], "after": bleed["to"], "emptyOn": nitro["emptyOn"]}))
        thumb = ask(page, THUMB_JS)
        check("touch: the NITRO button alone is the gas and the nitro in one, lit while there is nitro and dark when the tank is empty",
              lambda: thumb["power"] > 5 and thumb["burning"] > 5 and thumb["to"] > 18 and thumb["lit"] and thumb["shown"] and thumb["dark"], brief(thumb))
        page.evaluate(REST_JS, 1.0)

        # 8. cars that give way and cars that are turned round
        shove = ask(page, SHOVE_JS, {"speed": 20, "offset": 0, "target": "parked"})
        check("a parked car hit square from behind at 20 m/s is shoved more than 12 m down the street, and the player keeps more than 9 m/s",
              lambda: shove["pushed"] > 12 and 9 < shove["minSpeed"] < 99, brief(shove))
        page.evaluate(REST_JS, 5.0)
        clip = ask(page, SHOVE_JS, {"speed": 20, "offset": 1.2, "target": "parked"})
        check("clipped on its corner it is turned more than 35 degrees, while the player's own car is turned less than 20",
              lambda: clip["turned"] > 0.61 and clip["ownTurned"] < 0.35, brief(clip))
        page.evaluate(REST_JS, 5.0)
        driver = ask(page, SHOVE_JS, {"speed": 22, "offset": 1.2, "target": "ai"})
        check("a driver hit like that has lost the car for a moment: no power for at least 0.4 s",
              lambda: driver["stun"] > 0.4 and driver["frames"] > 3 and driver["powerless"] >= driver["frames"] - 1, brief(driver))
        page.evaluate(REST_JS, 5.0)

        # 9. people
        thrown = ask(page, PED_JS, {"speed": 20})
        check("a person hit at 20 m/s is thrown more than a metre into the air", lambda: thrown["down"] and thrown["high"] > 1, brief(thrown))
        bumped = ask(page, PED_JS, {"speed": 7})
        check("hit at 7 m/s they are knocked down where they stood, as before", lambda: bumped["down"] and bumped["high"] < 0.5, brief(bumped))
        page.evaluate(REST_JS, 1.0)

        # 10. traffic where the player is going
        quick = ask(page, AHEAD_JS, 30)
        still = ask(page, AHEAD_JS, 0)
        check("at 30 m/s more than 70% of new traffic is put on the road ahead (standing still: about half)",
              lambda: quick["made"] == 300 and quick["share"] > 0.7 and 0.35 < still["share"] < 0.65, brief({"at 30": quick, "still": still}))

        # 11. on foot
        page.evaluate("() => { NEON.player.car.vx = NEON.player.car.vz = 0; NEON.tryEnterExit(); }")
        page.wait_for_timeout(400)
        walk = ask(page, FOOT_JS, {"ramp": 2, "seconds": 3.2})
        check("on foot a ramp is walked up from its low end (to 1.5 m or more) and stepped off at the top",
              lambda: walk["high"] >= 1.5 and walk["maxU"] > 4.5 and walk["end"] == 0, brief(walk))
        stop = ask(page, FOOT_JS, {"ramp": 2, "seconds": 1.6, "reverse": True})
        check("and its tall end is a wall", lambda: stop["high"] < 0.1 and 4.4 < stop["minU"] < 99, brief(stop))

        # 12. a save from 1.9 has none of the new fields
        # written as the page opens, before the game reads it: a page that is closing writes its own save last
        page.add_init_script("localStorage.setItem('neon-coast-save-v1', JSON.stringify({ money: 1200, mission: 2, packages: [1, 4], difficulty: 1, quality: 0, sound: 0, tricks: 12, styleBest: 310 }))")
        page.reload()
        page.wait_for_timeout(900)
        page.click("#btn-continue")
        page.wait_for_timeout(900)
        old = ask(page, """() => ({ state: NEON.state, money: NEON.save.money, mission: NEON.save.mission, jumps: NEON.save.jumps, best: NEON.save.jumpBest,
            smashed: NEON.save.smashed, tank: NEON.nitro.tank, fallen: NEON.fallen.length, tricks: NEON.save.tricks })""")
        check("a save made by 1.9 loads: money, jobs and tricks as they were, no jumps yet, half a tank of nitro",
              lambda: old["state"] == "play" and old["money"] == 1200 and old["mission"] == 2 and old["jumps"] == [] and old["tricks"] == 12
              and old["tank"] == 0.5 and old["fallen"] == 0, brief(old))

        check("no console errors", lambda: not problems, "; ".join(problems[:3]))
        browser.close()


if __name__ == "__main__":
    run(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "NeonCoast.html")
    failed = [name for name, ok, _ in results if not ok]
    print(f"\n{len(results) - len(failed)} / {len(results)} checks passed")
    sys.exit(1 if failed else 0)
