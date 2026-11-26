"""What does one row of barrels pay? A measurement, not a pass/fail suite.

A blast is a trick on the style card of 1.9: it pays $40, each further one in the chain raises the
multiplier, and with wanted stars on it pays double. A blast also sets off the barrels next to it. So a row
of barrels is the one place where a single shot or a single ram could pay like a job. This script finds
every group of barrels that go up together, sets off one barrel at the end of each group the way a shot
does (the game's own `shootProps`), with the player sitting in a car 14 m away, outside the blast, and reads
what the chain was worth when it was paid, the multiplier, the stars and how many barrels went up. Then it
fires one shot at every group of two or more, 1.5 s apart, as a car driving past at 20 m/s could, so that
they are all one chain. That last number is an upper bound: the script does not aim, the car is moved by
script and the police are taken off the road.

    python test/barrel_rows.py                # NeonCoast.html, prints JSON
    python test/barrel_rows.py other.html     # another build (2.0 or later)

It does not measure how often a player can come back to a row. In 2.0 barrels stood again once the player was
150 m away, so the best row paid every time the player came back; since 2.0.1 a barrel that went up stays
gone for ten minutes of play (`BARREL_BACK`, held by check 47 of `havoc.py`).
"""
import json
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

# NEON_WINDOW=1 opens a real window; NEON_CHROME_ARGS adds Chrome flags.
WINDOW = os.environ.get("NEON_WINDOW") == "1"
EXTRA_ARGS = os.environ.get("NEON_CHROME_ARGS", "").split()

ROOT = Path(__file__).resolve().parent.parent

SIT_JS = """() => { const n = NEON, p = n.player;
    n.save.mission = Math.max(1, n.save.mission);          // past the learner phase: the police do not look away
    const car = n.vehicles.filter(v => !v.driver && !v.dead && v.type !== 'police')
      .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    car.vx = car.vz = 0; p.x = car.x + 2.2; p.z = car.z; n.tryEnterExit();
    return !!p.car; }"""

ROWS_JS = """(setup) => new Promise(done => { const n = NEON, c = n.player.car;
    const barrels = n.props.filter(q => q.kind === 'barrel');
    // barrels closer than the reach of a blast go up together
    const group = barrels.map((_, k) => k);
    const top = (k) => { while (group[k] !== k) k = group[k]; return k; };
    for (let a = 0; a < barrels.length; a++) {
        for (let b = a + 1; b < barrels.length; b++) {
            if (Math.hypot(barrels[a].hx - barrels[b].hx, barrels[a].hz - barrels[b].hz) < n.BLAST.reach) group[top(a)] = top(b);
        }
    }
    const sets = {};
    barrels.forEach((q, k) => { (sets[top(k)] = sets[top(k)] || []).push(q); });
    const all = Object.values(sets).sort((a, b) => b.length - a.length);
    const sizes = {};
    for (const set of all) sizes[set.length] = (sizes[set.length] || 0) + 1;
    const todo = all.filter(set => set.length >= 2).concat(all.filter(set => set.length === 1).slice(0, 1));
    const rows = [];
    let at = -1, row = null, spot = null, run = null;
    const clean = () => {
        n.resetHavoc(); n.setWanted(0); n.wanted.pts = 0;
        Object.assign(n.style, { bank: 0, count: 0, t: 0, drift: 0, smashes: 0, free: 0, crashT: 0 });
        c.hp = c.t.hp;
    };
    // the car is put 14 m from the barrel at the end of the group, outside the blast, and one shot is fired at that barrel
    const shoot = (set) => {
        const cx = set.reduce((sum, q) => sum + q.hx, 0) / set.length, cz = set.reduce((sum, q) => sum + q.hz, 0) / set.length;
        const end = set.slice().sort((a, b) => Math.hypot(b.hx - cx, b.hz - cz) - Math.hypot(a.hx - cx, a.hz - cz))[0];
        let dx = end.hx - cx, dz = end.hz - cz;
        const far = Math.hypot(dx, dz);
        if (far < 0.01) { dx = 1; dz = 0; } else { dx /= far; dz /= far; }
        spot = { x: end.hx + dx * 14, z: end.hz + dz * 14 };
        c.x = spot.x; c.z = spot.z; c.vx = c.vz = 0; c.y = 0; c.vy = 0; c.air = false;
        return { lit: n.shootProps(spot.x, 0.5, spot.z, -dx, 0, -dz, 30), at: [Math.round(end.hx), Math.round(end.hz)] };
    };
    const next = () => {
        at++;
        if (at >= todo.length) return false;
        clean();
        const shot = shoot(todo[at]);
        row = { barrels: todo[at].length, at: shot.at, lit: shot.lit, began: n.clock, money: n.save.money,
                worth: 0, bank: 0, multiplier: 1, tricks: 0, stars: 0, hp: c.hp };
        return true;
    };
    // every group of two or more, one shot each, `gap` seconds apart: all of them in one chain
    const startRun = () => {
        clean();
        const sets = all.filter(set => set.length >= 2).sort((a, b) => a[0].hx - b[0].hx);
        run = { sets, fired: 0, began: n.clock, lastShot: -99, money: n.save.money, worth: 0, bank: 0, multiplier: 1, tricks: 0, stars: 0, hp: c.hp };
    };
    next();
    const tick = () => {
        for (const v of n.vehicles.slice()) if (v !== c) n.removeVehicle(v);
        c.x = spot.x; c.z = spot.z; c.vx = c.vz = 0;
        for (const key of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'ShiftLeft']) n.keys[key] = false;
        const worth = Math.round(n.style.bank * n.styleMult());
        const seen = run || row;
        if (worth > seen.worth) Object.assign(seen, { worth, bank: n.style.bank, multiplier: n.styleMult(), tricks: n.style.count });
        seen.stars = Math.max(seen.stars, n.wanted.stars);
        if (run) {
            if (run.fired < run.sets.length && n.clock - run.lastShot >= setup.gap) {
                shoot(run.sets[run.fired++]);
                run.lastShot = n.clock;
            }
            if ((run.fired === run.sets.length && n.clock - run.lastShot > 8) || n.state !== 'play') {
                n.setWanted(0);
                return done({ barrels: barrels.length, groups_by_size: sizes, rows, all_in_one_chain: {
                    groups: run.sets.length, barrels: run.sets.reduce((sum, set) => sum + set.length, 0), seconds_between_shots: setup.gap,
                    went_up: run.sets.reduce((sum, set) => sum + set.filter(q => q.st === 3).length, 0),
                    paid: n.save.money - run.money, worth_at_its_highest: run.worth, bank: run.bank, multiplier: run.multiplier,
                    tricks: run.tricks, stars: run.stars, state: n.state } });
            }
        } else if (n.clock - row.began > 8 || n.state !== 'play') {
            const set = todo[at];
            rows.push({ barrels: row.barrels, at: row.at, lit: row.lit, went_up: set.filter(q => q.st === 3).length,
                paid: n.save.money - row.money, worth_at_its_highest: row.worth, bank: row.bank, multiplier: row.multiplier,
                tricks: row.tricks, stars: row.stars, car_health_lost: +(row.hp - c.hp).toFixed(1), state: n.state });
            if (n.state !== 'play') return done({ barrels: barrels.length, groups_by_size: sizes, rows });
            if (!next()) startRun();
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""

if __name__ == "__main__":
    build = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "NeonCoast.html"
    problems = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=not WINDOW, args=[
            "--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] + EXTRA_ARGS)
        page = browser.new_context(viewport={"width": 1280, "height": 720}).new_page()
        page.set_default_timeout(0)
        page.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))
        page.goto(build.resolve().as_uri())
        page.wait_for_timeout(800)
        page.click("#btn-new")
        page.wait_for_timeout(1000)
        page.evaluate(SIT_JS)
        page.wait_for_timeout(400)
        got = page.evaluate(ROWS_JS, {"gap": 1.5})
        browser.close()
    for row in got["rows"]:
        print(json.dumps(row), flush=True)
    if got.get("all_in_one_chain"):
        print("ALL IN ONE CHAIN " + json.dumps(got["all_in_one_chain"]), flush=True)
    pays = [row["paid"] for row in got["rows"] if row["barrels"] >= 2]
    summary = {"build": build.name, "barrels": got["barrels"], "groups_by_size": got["groups_by_size"],
               "highest_pay_of_a_group": max(pays) if pays else 0,
               "all_groups_one_after_the_other": sum(pays),
               "all_groups_in_one_chain": (got.get("all_in_one_chain") or {}).get("paid"),
               "page_errors": problems[:3]}
    print("SUMMARY " + json.dumps(summary), flush=True)
    os._exit(0)
