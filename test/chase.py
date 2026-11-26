"""Police chase rules (version 1.8): who is to blame for a crash with a police car, how much one crash costs,
how well officers shoot at a moving car, and that the police ram only from three stars.

A cruiser is put next to the player's car on a straight street (through the game's test handle,
window.NEON), both cars are given a speed, and the game is left to run the crash itself. Time is counted
on the game's own clock (the game never moves on more than 0.1 s a frame, 0.05 s before 2.0.1), so a slow PC cannot fail it.

It proves the four rules hold. It does not prove that the chase is fun; test/drive.py plays the jobs.

    python test/chase.py                  # NeonCoast.html; one line per check, exit code 0 when all pass
    python test/chase.py other.html       # another build that has NEON.addVehicle and NEON.removeVehicle
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

# One crash, run by the game. `gap` is where the cruiser starts along the player's heading (negative = behind),
# `facing` is 1 when the cruiser points the same way as the player and -1 when it comes head-on,
# speeds are in m/s along each car's own heading. Health is read 0.55 s (game clock) after the first hit.
CRASH_JS = """(setup) => new Promise(done => {
    const n = NEON, c = n.player.car;
    for (const v of n.vehicles.slice()) if (v !== c) n.removeVehicle(v);
    n.save.mission = Math.max(1, n.save.mission);     // past the learner phase, where the police look away
    n.save.difficulty = 1;
    if (!setup.keep) {
        n.setWanted(0);
        n.wanted.pts = 0;
        c.hp = c.t.hp;
        c.crashT = 0;
    }
    // the street through the middle of the map (road 5, centre line x = 0), right-hand lane heading +z,
    // half way along the block between two crossings: 30 m of clear road in front and behind
    const fx = 0, fz = 1, h = 0;
    c.x = -3.2; c.z = -42; c.h = h;
    c.vx = fx * setup.player; c.vz = fz * setup.player;
    const cop = n.addVehicle('police', c.x + fx * setup.gap, c.z + fz * setup.gap, setup.facing > 0 ? h : h + Math.PI, 'cop');
    cop.vx = fx * setup.facing * setup.police; cop.vz = fz * setup.facing * setup.police;
    const full = c.t.hp, hp0 = c.hp, pts0 = n.wanted.pts;
    let last = performance.now(), clock = 0, hitAt = -1, frames = 0;
    const tick = () => {
        const now = performance.now();
        clock += Math.min(NEON.STEP * NEON.MAX_STEPS || 0.05, (now - last) / 1000); last = now; frames++;
        if (hitAt < 0 && (c.hp < hp0 || n.wanted.pts !== pts0)) hitAt = clock;
        if ((hitAt >= 0 && clock - hitAt >= 0.55) || clock > 6) {
            const out = { hit: hitAt >= 0, full, lost: hp0 - c.hp, share: (hp0 - c.hp) / full, points: n.wanted.pts - pts0,
                          car: c.t.name, frames, dead: c.dead };
            n.removeVehicle(cop);
            c.vx = c.vz = 0;
            return done(out);
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""

# Police gunfire at the player's car. The car and one cruiser 20 m behind it are held in place on the street
# while the car is given a speed (a treadmill), and every dice roll of the game is fixed to `roll`, so the
# same shots are fired every time. At Normal an officer further than 15 m away hits on a roll under 0.28
# when the car stands, and under 0.28 x 0.4 = 0.112 when it does 30 m/s or more. The moving car is shot at with
# three stars on: since 1.9 a two-star pursuit holds its fire at a car on the move (test/thrill.py checks that).
AIM_JS = """(setup) => new Promise(done => {
    const n = NEON, c = n.player.car;
    for (const v of n.vehicles.slice()) if (v !== c) n.removeVehicle(v);
    n.save.mission = Math.max(1, n.save.mission);
    n.save.difficulty = 1;
    n.setWanted(0); n.wanted.pts = 0; n.setWanted(setup.stars || 2);
    c.hp = c.t.hp; c.crashT = 0;
    const cop = n.addVehicle('police', -3.2, -62, 0, 'cop');
    cop.ai.fire = 0.2;
    const dice = Math.random;
    Math.random = () => setup.roll;
    let last = performance.now(), clock = 0, prev = c.hp, hits = 0, other = 0;
    const tick = () => {
        const now = performance.now();
        clock += Math.min(NEON.STEP * NEON.MAX_STEPS || 0.05, (now - last) / 1000); last = now;
        for (const v of n.vehicles.slice()) if (v !== c && v !== cop) n.removeVehicle(v);
        const drop = prev - c.hp; prev = c.hp;
        if (Math.abs(drop - 6) < 0.01) hits++; else if (drop > 0.01) other++;
        c.x = -3.2; c.z = -42; c.h = 0; c.vx = 0; c.vz = setup.speed;
        cop.x = -3.2; cop.z = -62; cop.h = 0; cop.vx = 0; cop.vz = 0;
        if (clock >= setup.seconds || c.dead || n.state !== 'play') {
            Math.random = dice;
            n.removeVehicle(cop);
            c.vx = c.vz = 0;
            const stars = n.wanted.stars;
            n.setWanted(0); n.wanted.pts = 0;
            return done({ hits, other, seconds: clock, stars, state: n.state, dead: c.dead });
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""

# A cruiser comes up behind the standing player at top speed with `stars` wanted stars on, and the game's own
# police driver is left to decide what to do. Officers' shots are made to miss (the dice are fixed at 0.99)
# and other cars are removed, so health can only be lost to this one cruiser.
# The cruiser has arrived when it is inside the game's own arrest reach (7.5 m between centres, checkPolice in
# src/03-systems.js). Up to run 9 this script used 6 m of its own: a two-star cruiser brakes for 8 m and rolls to a
# stop 5.7 to 6.9 m behind (read in the suites of run 9), so now and then it stopped just outside 6 m, was never
# seen to arrive, and arrested the standing player 2.4 s later.
ARREST_REACH = 7.5
PURSUIT_JS = """(setup) => new Promise(done => {
    const n = NEON, c = n.player.car;
    for (const v of n.vehicles.slice()) if (v !== c) n.removeVehicle(v);
    n.save.mission = Math.max(1, n.save.mission);
    n.save.difficulty = 1;
    n.setWanted(0); n.wanted.pts = 0; n.setWanted(setup.stars);
    c.hp = c.t.hp; c.crashT = 0;
    c.x = -3.2; c.z = -42; c.h = 0; c.vx = c.vz = 0;
    const cop = n.addVehicle('police', -3.2, -42 - setup.gap, 0, 'cop');
    cop.vz = setup.police;
    const dice = Math.random;
    Math.random = () => 0.99;
    const full = c.t.hp, pts0 = n.wanted.pts;
    let last = performance.now(), clock = 0, nearest = 1e9, arrive = -1, arriveAt = 0, before = 0, approach = 0;
    const tick = () => {
        const now = performance.now();
        clock += Math.min(NEON.STEP * NEON.MAX_STEPS || 0.05, (now - last) / 1000); last = now;
        for (const v of n.vehicles.slice()) if (v !== c && v !== cop) n.removeVehicle(v);
        const gap = Math.hypot(cop.x - c.x, cop.z - c.z);
        // `approach` is the cruiser's speed one frame earlier: on a slow computer the crash can already be over in the
        // frame that first sees the cruiser within reach (since 2.0.1 a frame holds up to six steps of the game)
        if (gap < setup.reach && arrive < 0) { arrive = Math.hypot(cop.vx, cop.vz); arriveAt = clock; approach = before; }
        before = Math.hypot(cop.vx, cop.vz);
        nearest = Math.min(nearest, gap);
        // stop 0.8 s after the cruiser arrives (one whole crash; an arrest takes 2.4 s), or when time is up
        if ((arrive >= 0 && clock - arriveAt >= 0.8) || clock >= setup.seconds || c.dead || n.state !== 'play') {
            Math.random = dice;
            const out = { share: (full - c.hp) / full, points: n.wanted.pts - pts0, nearest, arrive, approach, stars: n.wanted.stars,
                          state: n.state, dead: c.dead };
            n.removeVehicle(cop);
            c.vx = c.vz = 0;
            n.setWanted(0); n.wanted.pts = 0;
            return done(out);
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""

# let the game clock run on, so the next hit is a new crash
REST_JS = """(seconds) => new Promise(done => {
    let last = performance.now(), clock = 0;
    const tick = () => {
        const now = performance.now();
        clock += Math.min(NEON.STEP * NEON.MAX_STEPS || 0.05, (now - last) / 1000); last = now;
        clock >= seconds ? done(clock) : requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS  " if ok else "FAIL  ") + name + (("  |  " + str(detail)) if detail else ""), flush=True)


def brief(crash):
    return json.dumps({key: (round(value, 2) if isinstance(value, float) else value) for key, value in crash.items()})


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
        page.evaluate("""() => { const n = NEON, p = n.player;
            const car = n.vehicles.filter(v => !v.driver && !v.dead && v.type !== 'police')
              .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
            car.vx = car.vz = 0; p.x = car.x + 2.2; p.z = car.z; n.tryEnterExit(); }""")
        page.wait_for_timeout(500)
        check("the player sits in a car", page.evaluate("() => !!NEON.player.car && NEON.state === 'play'"))

        # 1. rammed from behind while standing still: not the player's crime
        behind = page.evaluate(CRASH_JS, {"gap": -8, "facing": 1, "police": 47, "player": 0})
        check("a cruiser that rams the standing player from behind adds no wanted points",
              behind["hit"] and behind["points"] == 0 and behind["lost"] > 0, brief(behind))

        # 2. head-on, the cruiser faster than the player (72 m/s closing, a wreck by the plain damage rule)
        head_on = page.evaluate(CRASH_JS, {"gap": 16, "facing": -1, "police": 47, "player": 25})
        check("a head-on ram by a faster cruiser adds no wanted points",
              head_on["hit"] and head_on["points"] == 0, brief(head_on))
        check("that crash takes at most 40% of the car, also when it is shoved into a wall",
              head_on["hit"] and 0.2 < head_on["share"] <= 0.401 and not head_on["dead"], brief(head_on))

        # 3. the cap is for one crash, not for good: the next ram hurts again
        page.evaluate(REST_JS, 1.0)
        again = page.evaluate(CRASH_JS, {"gap": 16, "facing": -1, "police": 47, "player": 25, "keep": True})
        check("a second crash a second later takes health again, and again 40% at most",
              again["hit"] and 0.2 < again["share"] <= 0.401, brief(again))

        # 4. the player's own doing is still a crime
        page.evaluate(REST_JS, 1.0)
        rear_end = page.evaluate(CRASH_JS, {"gap": 9, "facing": 1, "police": 0, "player": 20})
        # (each pair of bumpers that meets counts, so one crash is 1.3 or 2.6 points, as it was before 1.8)
        check("driving into a standing cruiser at 20 m/s still adds wanted points (1.3 a hit)",
              rear_end["hit"] and rear_end["points"] >= 1.29, brief(rear_end))
        page.evaluate(REST_JS, 1.0)
        chased = page.evaluate(CRASH_JS, {"gap": 9, "facing": 1, "police": 10, "player": 30})
        check("so does running into the back of a slower cruiser",
              chased["hit"] and chased["points"] >= 1.29, brief(chased))

        # 5. officers shoot worse at a car that is moving
        page.evaluate(REST_JS, 1.0)
        standing = page.evaluate(AIM_JS, {"speed": 0, "roll": 0.2, "seconds": 4})
        check("with the dice fixed at 0.2, an officer 20 m away hits the standing car",
              standing["hits"] >= 3 and standing["other"] == 0, brief(standing))
        fast = page.evaluate(AIM_JS, {"speed": 32, "roll": 0.2, "seconds": 4, "stars": 3})
        check("the same shots all miss the car when it does 32 m/s (three stars)",
              fast["hits"] == 0 and fast["other"] == 0 and not fast["dead"], brief(fast))
        lucky = page.evaluate(AIM_JS, {"speed": 32, "roll": 0.1, "seconds": 4, "stars": 3})
        check("a fast car is harder to hit, not safe: a better roll (0.1) still hits it",
              lucky["hits"] >= 3, brief(lucky))

        # 6. two stars: the police pursue and do not ram; from three stars they ram
        page.evaluate(REST_JS, 1.0)
        pursued = page.evaluate(PURSUIT_JS, {"stars": 2, "gap": 48, "police": 40, "seconds": 8, "reach": ARREST_REACH})
        check("at two stars a cruiser coming up behind at 40 m/s brakes: it arrives slower than 10 m/s and takes under 5% of the car",
              pursued["nearest"] < ARREST_REACH and 0 <= pursued["arrive"] < 10 and pursued["share"] < 0.05 and pursued["points"] == 0,
              brief(pursued))
        ramming = "at three stars the same cruiser rams: it arrives faster than 30 m/s and takes over 20% of the car"
        if pursued["state"] != "play" or pursued["dead"]:
            # the case above ended the game (an arrest or a wreck): say so instead of failing on a car that is gone
            check(ramming, False, "not run: the two-star case left the game in state " + str(pursued["state"]))
        else:
            page.evaluate(REST_JS, 1.0)
            rammed = page.evaluate(PURSUIT_JS, {"stars": 3, "gap": 48, "police": 40, "seconds": 8, "reach": ARREST_REACH})
            check(ramming,
                  max(rammed["arrive"], rammed["approach"]) > 30 and 0.2 < rammed["share"] <= 0.401 and rammed["points"] == 0,
                  brief(rammed))

        check("no console errors", not problems, "; ".join(problems[:3]))
        browser.close()


if __name__ == "__main__":
    run(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "NeonCoast.html")
    failed = [name for name, ok, _ in results if not ok]
    print(f"\n{len(results) - len(failed)} / {len(results)} checks passed")
    sys.exit(1 if failed else 0)
