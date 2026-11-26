"""Chase bench (version 1.8): how long a car lasts with the police after it. A number to compare two builds,
not a pass/fail test.

The player is put in a Vanta GT on the street through the middle of the map with STARS wanted stars. The
script holds W to keep CRUISE m/s and steers back to its lane with A and D; it never dodges. Traffic is
removed, so the only other cars are police. A run ends when the car is wrecked, after 30 s on the game's
own clock, or at the end of the street. One JSON line per run: wrecked or not, health left, health lost to
crashes and to gunfire (a drop of 6 or less is counted as a shot), the highest star count.

    python test/chase_bench.py NeonCoast.html 3 21        # three stars, 21 m/s, three runs
    python test/chase_bench.py other.html 2 21 8          # another build (needs NEON.addVehicle), eight runs

Police spawn at random, so runs differ: compare builds over several runs each, in the same hour.
"""
import json
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

# A GitHub Mac draws with its graphics card only in a real window: NEON_WINDOW=1 opens one.
# NEON_CHROME_ARGS adds flags (the frame-rate gate runs without the 60 Hz cap of the display).
WINDOW = os.environ.get("NEON_WINDOW") == "1"
EXTRA_ARGS = os.environ.get("NEON_CHROME_ARGS", "").split()

BENCH_JS = """(setup) => new Promise(done => {
    const n = NEON, p = n.player;
    n.save.mission = 3; n.save.difficulty = 1;
    if (p.car) { p.car.vx = p.car.vz = 0; n.tryEnterExit(); }
    for (const v of n.vehicles.slice()) n.removeVehicle(v);
    const car = n.addVehicle('sports', -3.2, -400, 0, null);
    p.x = car.x + 2.2; p.z = car.z; n.tryEnterExit();
    n.setWanted(0); n.wanted.pts = 0; n.setWanted(setup.stars);
    const full = car.t.hp;
    let last = performance.now(), clock = 0, frames = 0, prev = car.hp, crash = 0, shots = 0, crashes = 0, hits = 0, maxStars = 0, lostAt = -1;
    const tick = () => {
        const now = performance.now();
        clock += Math.min(NEON.STEP * NEON.MAX_STEPS || 0.05, (now - last) / 1000); last = now; frames++;
        for (const v of n.vehicles.slice()) if (v.driver === 'ai') n.removeVehicle(v);
        const speed = Math.hypot(car.vx, car.vz);
        n.keys.KeyW = speed < setup.cruise; n.keys.KeyS = false;
        const want = Math.max(-0.5, Math.min(0.5, (-3.2 - car.x) * 0.08));      // heading that leads back to the lane
        let err = want - car.h; while (err > Math.PI) err -= 2 * Math.PI; while (err < -Math.PI) err += 2 * Math.PI;
        n.keys.KeyA = err > 0.03; n.keys.KeyD = err < -0.03;
        const drop = prev - car.hp; prev = car.hp;
        if (drop > 0.01) { if (drop <= 6.01) { shots += drop; hits++; } else { crash += drop; crashes++; } }
        maxStars = Math.max(maxStars, n.wanted.stars);
        if (n.wanted.stars === 0 && lostAt < 0) lostAt = clock;
        const over = !p.car || car.dead || car.hp <= 0 || n.state !== 'play';
        if (over || clock >= setup.seconds || car.z > 390) {
            n.keys.KeyW = n.keys.KeyA = n.keys.KeyD = false;
            return done({ wrecked: over, seconds: +clock.toFixed(1), left: +(Math.max(0, car.hp) / full).toFixed(2), crashes,
                crash: +crash.toFixed(0), shot_hits: hits, shots: +shots.toFixed(0), max_stars: maxStars, end_stars: n.wanted.stars,
                lost_police_at: lostAt, z: Math.round(car.z), fps: Math.round(frames / Math.max(clock, 0.1)), state: n.state });
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""

target, stars, cruise = Path(sys.argv[1]), int(sys.argv[2]), float(sys.argv[3])
runs = int(sys.argv[4]) if len(sys.argv) > 4 else 3
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
        result = page.evaluate(BENCH_JS, {"stars": stars, "cruise": cruise, "seconds": 30})
        out.append(result)
        print(json.dumps(result), flush=True)
        page.close()
    browser.close()
kept = sum(1 for result in out if not result["wrecked"])
print(f"{kept} of {len(out)} runs ended with the car still driving ({stars} stars, {cruise:g} m/s)", flush=True)
os._exit(0)
