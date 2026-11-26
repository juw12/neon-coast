"""How much does a minute of nothing but smashing pay, and how fast does it fill the nitro tank? A measurement,
not a pass/fail suite.

A script drives the player's car with the keys a player has (W A S D and Shift). It steers at the nearest thing
on the street that still stands, backs out when it is stuck, and fires the nitro when the tank is over 60% and
the way is straight. Getting into the first car, and into another one after an arrest or a wreck, is set up
and not played. It is a relentless and clumsy driver: no person plays like this, so read the result as "what
the sums allow", not as "what a player earns".

    python test/economy.py                    # 3 runs of 5 game minutes on NeonCoast.html, prints JSON
    python test/economy.py 2 180 other.html   # 2 runs of 180 s on another build
"""
import json
import os
import statistics
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

# NEON_WINDOW=1 opens a real window instead of a headless browser (a GitHub Mac uses its graphics card in both).
# NEON_CHROME_ARGS adds flags (the frame-rate gate runs without the 60 Hz cap of the display).
WINDOW = os.environ.get("NEON_WINDOW") == "1"
EXTRA_ARGS = os.environ.get("NEON_CHROME_ARGS", "").split()

ROOT = Path(__file__).resolve().parent.parent

SIT_JS = """() => { const n = NEON, p = n.player;
    n.save.mission = Math.max(1, n.save.mission);          // past the learner phase: the police do not look away
    const car = n.vehicles.filter(v => !v.driver && !v.dead && v.type !== 'police')
      .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    car.vx = car.vz = 0; p.x = car.x + 2.2; p.z = car.z; n.tryEnterExit();
    return !!p.car; }"""

BOT_JS = """(setup) => new Promise(done => { const n = NEON, p = n.player;
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const press = (held) => { for (const key of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'ShiftLeft']) n.keys[key] = held.includes(key); };
    const sit = () => {
        const car = n.vehicles.filter(v => !v.driver && !v.dead && v.type !== 'police')
          .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
        if (!car) return;
        car.vx = car.vz = 0; p.x = car.x + 2.2; p.z = car.z; n.tryEnterExit();
    };
    const clock0 = n.clock, money0 = n.save.money, smashed0 = n.save.smashed || 0;
    const out = { income: 0, fees: 0, pays: [], lostChains: 0, downs: 0, wrecks: 0, backedOut: 0, nitroSecs: 0, tankGain: 0,
                  fullSecs: 0, starSecs: 0, maxStars: 0, maxMult: 1, drove: 0, kinds: {}, minutes: [] };
    let last = n.clock, money = n.save.money, tank = n.nitro ? n.nitro.tank : 0, target = null, pickT = 0, slowT = 0, backT = 0,
        backSteer = 'KeyA', burning = false, away = false, standing = new Map(), minuteAt = 60, minuteMoney = 0, chainOpen = false, chainLost = 0;
    const skip = new Map();                                  // things given up on, until this game time
    const pick = (c) => {
        let best = null, bestScore = 1e9;
        for (const q of n.props) {
            if (q.st !== 0 || (skip.get(q) || 0) > n.clock) continue;
            const dx = q.x - c.x, dz = q.z - c.z, d = Math.hypot(dx, dz);
            if (d > 400) continue;
            const off = Math.abs(wrap(Math.atan2(dx, dz) - c.h));
            const score = d * (1 + 1.5 * off) + (d < 6 && off > 0.6 ? 60 : 0);      // too close and to the side: come back for it
            if (score < bestScore) { bestScore = score; best = q; }
        }
        return best;
    };
    const tick = () => {
        const now = n.clock, dt = now - last; last = now;
        // money: what came in and what went out
        if (n.save.money !== money) {
            const delta = n.save.money - money; money = n.save.money;
            if (delta > 0) { out.income += delta; out.pays.push(delta); minuteMoney += delta; } else out.fees -= delta;
        }
        if (now - clock0 >= minuteAt) { out.minutes.push(minuteMoney); minuteMoney = 0; minuteAt += 60; }
        if (now - clock0 >= setup.seconds) {
            press([]);
            out.seconds = now - clock0; out.net = n.save.money - money0; out.smashed = (n.save.smashed || 0) - smashed0;
            out.pays.sort((a, b) => b - a); out.bestPays = out.pays.slice(0, 5); out.banks = out.pays.length; delete out.pays;
            return done(out);
        }
        const c = p.car;
        if (n.state !== 'play' || !c || c.dead) {
            press([]);
            if (!away) { away = true; if (n.state !== 'play') out.downs++; else out.wrecks++; }
            if (n.state === 'play') sit();
            return requestAnimationFrame(tick);
        }
        away = false;
        const speed = Math.hypot(c.vx, c.vz);
        out.drove += speed * dt;
        // nitro and the chain
        if (n.nitro) {
            if (n.nitro.tank > tank) out.tankGain += n.nitro.tank - tank;
            tank = n.nitro.tank;
            if (n.nitro.on) out.nitroSecs += dt;
            if (tank >= 0.999) out.fullSecs += dt;
        }
        if (n.wanted.stars > 0) out.starSecs += dt;
        out.maxStars = Math.max(out.maxStars, n.wanted.stars);
        if (n.styleMult) out.maxMult = Math.max(out.maxMult, n.styleMult());
        if (chainOpen && !n.style.count && n.style.crashT > 0.9) out.lostChains++;
        chainOpen = n.style.count > 0;
        // what to drive at
        if (!target || target.st !== 0 || now > pickT) {
            if (target && target.st !== 0) out.kinds[target.kind] = (out.kinds[target.kind] || 0) + 1;
            target = pick(c); pickT = now + 0.4;
        }
        if (!target) { press([]); return requestAnimationFrame(tick); }
        const error = wrap(Math.atan2(target.x - c.x, target.z - c.z) - c.h);
        const far = Math.hypot(target.x - c.x, target.z - c.z);
        // stuck: back out with the wheel the other way, and leave this one alone for a while
        if (backT > 0) {
            backT -= dt;
            press(['KeyS', backSteer]);
            return requestAnimationFrame(tick);
        }
        slowT = speed < 1.5 ? slowT + dt : 0;
        if (slowT > 1.2) {
            slowT = 0; backT = 1.4; out.backedOut++;
            backSteer = error > 0 ? 'KeyD' : 'KeyA';
            skip.set(target, now + 12); target = null;
            return requestAnimationFrame(tick);
        }
        const held = [];
        const cruise = Math.abs(error) > 0.7 ? 9 : Math.abs(error) > 0.3 ? 15 : setup.cruise;
        if (speed < cruise) held.push('KeyW'); else if (speed > cruise + 5) held.push('KeyS');
        if (error > 0.04) held.push('KeyA'); else if (error < -0.04) held.push('KeyD');
        if (n.nitro) {
            if (!burning && tank >= 0.6 && Math.abs(error) < 0.12 && far > 25) burning = true;
            if (burning && (tank < 0.08 || Math.abs(error) > 0.3)) burning = false;
            if (burning) { held.push('ShiftLeft'); if (!held.includes('KeyW')) held.push('KeyW'); }
        }
        press(held);
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""


def one_run(pw, target, seconds, cruise):
    browser = pw.chromium.launch(channel="chrome", headless=not WINDOW, args=[
        "--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] + EXTRA_ARGS)
    problems = []
    page = browser.new_context(viewport={"width": 1280, "height": 720}).new_page()
    page.set_default_timeout(0)
    page.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))
    page.goto(target.resolve().as_uri())
    page.wait_for_timeout(800)
    page.click("#btn-new")
    page.wait_for_timeout(1000)
    page.evaluate(SIT_JS)
    page.wait_for_timeout(400)
    got = page.evaluate(BOT_JS, {"seconds": seconds, "cruise": cruise})
    browser.close()
    minutes = got["seconds"] / 60
    return {
        "seconds": round(got["seconds"], 1),
        "income_a_minute": round(got["income"] / minutes),
        "fees_a_minute": round(got["fees"] / minutes),
        "net_a_minute": round(got["net"] / minutes),
        "by_minute": got["minutes"],
        "smashed_a_minute": round(got["smashed"] / minutes, 1),
        "banks": got["banks"], "best_banks": got["bestPays"], "chains_lost_to_a_crash": got["lostChains"],
        "highest_multiplier": got["maxMult"],
        "metres_a_minute": round(got["drove"] / minutes),
        "arrested_or_taken_out": got["downs"], "cars_wrecked": got["wrecks"], "backed_out": got["backedOut"],
        "highest_stars": got["maxStars"], "share_of_time_with_stars": round(got["starSecs"] / got["seconds"], 2),
        "tank_filled_a_minute": round(got["tankGain"] / minutes, 2),
        "nitro_seconds_a_minute": round(got["nitroSecs"] / minutes, 1),
        "share_of_time_on_nitro": round(got["nitroSecs"] / got["seconds"], 3),
        "share_of_time_with_a_full_tank": round(got["fullSecs"] / got["seconds"], 3),
        "reached_first": got["kinds"],
        "page_errors": problems[:3],
    }


if __name__ == "__main__":
    runs = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    seconds = float(sys.argv[2]) if len(sys.argv) > 2 else 300
    build = Path(sys.argv[3]) if len(sys.argv) > 3 else ROOT / "NeonCoast.html"
    samples = []
    with sync_playwright() as pw:
        for _ in range(runs):
            try:
                samples.append(one_run(pw, build, seconds, 20))
            except Exception as error:      # a browser that hangs is a lost sample, not a lost result
                samples.append({"error": str(error).splitlines()[0][:200]})
            print(json.dumps(samples[-1]), flush=True)
    good = [sample for sample in samples if "error" not in sample]
    summary = {"build": build.name, "runs": len(samples), "seconds_each": seconds}
    for key in ("income_a_minute", "net_a_minute", "smashed_a_minute", "tank_filled_a_minute", "nitro_seconds_a_minute"):
        values = [sample[key] for sample in good]
        if values:
            summary[key] = {"median": statistics.median(values), "lowest": min(values), "highest": max(values)}
    print("SUMMARY " + json.dumps(summary), flush=True)
    (ROOT / "test" / "economy-result.json").write_text(json.dumps({"summary": summary, "samples": samples}, indent=2), encoding="utf-8")
