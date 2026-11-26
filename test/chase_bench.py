"""Chase bench (version 1.8, changed in 2.0.1): how long a car lasts with the police after it. A number to
compare two builds, not a pass/fail test.

The player is put in a Vanta GT on the street through the middle of the map with STARS wanted stars. The
script holds W to keep CRUISE m/s and steers back to its lane with A and D; it never dodges, and it uses no
nitro, ramp or barrel. A run ends when the car is wrecked, after 30 s on the game's own clock, or at the end
of the street. One JSON line per run: wrecked or not, health left, health lost to crashes and to gunfire (a
drop of 6 or less is counted as a shot), the highest star count, the most police cars on the map at once,
and for every crash where it was, how fast the car was before and after, and how far the nearest police car.

Traffic is kept out of the way, not removed: every frame each car in traffic is put back 230 m east of the
player. Until 2.0.1 this script removed traffic every frame. The game puts a new car on the road for each
one that goes, one in fourteen of them a patrol car, which the script left in; since 2.0 the game makes up
to three tries every fifth of a second at speed and puts two thirds of the new cars on the road ahead. So
the old script counted its own patrol cars: up to 16 police on the map for 2.0 against 7 for 1.9.

    python test/chase_bench.py NeonCoast.html 3 21        # three stars, 21 m/s, three runs
    python test/chase_bench.py other.html 2 21 8          # another build (needs NEON.addVehicle), eight runs
    python test/chase_bench.py NeonCoast.html 3 21 8 old  # the way it counted until 2.0.1

Police spawn at random, so runs differ: compare builds over several runs each, in the same hour.
"""
import json
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

# NEON_WINDOW=1 opens a real window instead of a headless browser (a GitHub Mac uses its graphics card in both).
# NEON_CHROME_ARGS adds flags (the frame-rate gate runs without the 60 Hz cap of the display).
WINDOW = os.environ.get("NEON_WINDOW") == "1"
EXTRA_ARGS = os.environ.get("NEON_CHROME_ARGS", "").split()

BENCH_JS = """(setup) => new Promise(done => {
    const n = NEON, p = n.player;
    n.save.mission = 3; n.save.difficulty = 1;
    if (p.car) { p.car.vx = p.car.vz = 0; n.tryEnterExit(); }
    // traffic stays (see the top of this file); parked cars and patrol cars already out go
    for (const v of n.vehicles.slice()) if (setup.old || v.driver !== 'ai') n.removeVehicle(v);
    const car = n.addVehicle('sports', -3.2, -400, 0, null);
    p.x = car.x + 2.2; p.z = car.z; n.tryEnterExit();
    n.setWanted(0); n.wanted.pts = 0; n.setWanted(setup.stars);
    const full = car.t.hp;
    let last = performance.now(), clock = 0, frames = 0, prev = car.hp, crash = 0, shots = 0, crashes = 0, hits = 0, maxStars = 0, lostAt = -1;
    let speedBefore = 0, headingBefore = 0, mostPolice = 0;
    const log = [];                  // one entry for every crash: where, how fast, and how far the nearest police car was
    const tick = () => {
        const now = performance.now();
        clock += Math.min(NEON.STEP * NEON.MAX_STEPS || 0.05, (now - last) / 1000); last = now; frames++;
        let slot = 0, police = 0;
        for (const v of n.vehicles.slice()) {
            if (v.type === 'police' && !v.dead) police++;
            if (v.driver !== 'ai') continue;
            if (setup.old) { n.removeVehicle(v); continue; }
            v.x = car.x + 230; v.z = car.z + (slot++ - 10) * 7; v.vx = v.vz = 0;
        }
        mostPolice = Math.max(mostPolice, police);
        const speed = Math.hypot(car.vx, car.vz);
        n.keys.KeyW = speed < setup.cruise; n.keys.KeyS = false;
        const want = Math.max(-0.5, Math.min(0.5, (-3.2 - car.x) * 0.08));      // heading that leads back to the lane
        let err = want - car.h; while (err > Math.PI) err -= 2 * Math.PI; while (err < -Math.PI) err += 2 * Math.PI;
        n.keys.KeyA = err > 0.03; n.keys.KeyD = err < -0.03;
        const drop = prev - car.hp; prev = car.hp;
        if (drop > 0.01) {
            if (drop <= 6.01) { shots += drop; hits++; }
            else {
                crash += drop; crashes++;
                let near = 999, count = 0;
                for (const v of n.vehicles) if (v.type === 'police' && v !== car) { count++; near = Math.min(near, Math.hypot(v.x - car.x, v.z - car.z)); }
                log.push({ t: +clock.toFixed(1), lost: +drop.toFixed(0), x: +car.x.toFixed(1), z: Math.round(car.z), from: +speedBefore.toFixed(1), to: +speed.toFixed(1),
                    heading: +headingBefore.toFixed(2), police_m: +near.toFixed(1), police: count, others: n.vehicles.length - count - 1 });
            }
        }
        speedBefore = speed; headingBefore = car.h;
        maxStars = Math.max(maxStars, n.wanted.stars);
        if (n.wanted.stars === 0 && lostAt < 0) lostAt = clock;
        const over = !p.car || car.dead || car.hp <= 0 || n.state !== 'play';
        if (over || clock >= setup.seconds || car.z > 390) {
            n.keys.KeyW = n.keys.KeyA = n.keys.KeyD = false;
            return done({ wrecked: over, seconds: +clock.toFixed(1), left: +(Math.max(0, car.hp) / full).toFixed(2), crashes,
                crash: +crash.toFixed(0), shot_hits: hits, shots: +shots.toFixed(0), max_stars: maxStars, end_stars: n.wanted.stars,
                lost_police_at: lostAt, z: Math.round(car.z), fps: Math.round(frames / Math.max(clock, 0.1)), state: n.state, most_police: mostPolice, crash_log: log });
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""

target, stars, cruise = Path(sys.argv[1]), int(sys.argv[2]), float(sys.argv[3])
runs = int(sys.argv[4]) if len(sys.argv) > 4 else 3
OLD = len(sys.argv) > 5 and sys.argv[5] == "old"         # remove traffic every frame, as until 2.0.1
out = []
with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome", headless=not WINDOW, args=[
        "--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] + EXTRA_ARGS)
    for _ in range(runs):
        page = browser.new_context(viewport={"width": 1280, "height": 720}).new_page()
        page.goto(target.resolve().as_uri())
        page.wait_for_timeout(800)
        page.click("#btn-new")
        page.wait_for_timeout(1000)
        result = page.evaluate(BENCH_JS, {"stars": stars, "cruise": cruise, "seconds": 30, "old": OLD})
        out.append(result)
        print(json.dumps(result), flush=True)
        page.close()
    browser.close()
kept = sum(1 for result in out if not result["wrecked"])
print(f"{kept} of {len(out)} runs ended with the car still driving ({stars} stars, {cruise:g} m/s{', traffic removed' if OLD else ''})", flush=True)
os._exit(0)
