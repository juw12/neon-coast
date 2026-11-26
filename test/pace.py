"""The game keeps its own time and its own physics when the screen is drawn slowly (new in 2.0.1).

Until 2.0 a slow frame was one long step of up to 0.05 s: under 20 frames a second the game ran in slow motion,
and how far a car went before its brakes stopped it depended on the frame rate. Now a long frame is cut into
steps of about 1/60 s, up to six of them, and time a frame could not use is owed to the next. This suite makes the frames slow itself (it keeps the page busy for
a set time each frame) and reads the game's clock, the steps it took, a car's acceleration and braking, and
the radio's beat. It needs a computer that draws the game at 40 frames a second or more to begin with.

    python test/pace.py                 # NeonCoast.html; one line per check, exit code 0 when all pass
    python test/pace.py other.html      # another build (2.0 and older fail the slow-frame checks)
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

ROOT = Path(__file__).resolve().parent.parent
results = []

# Keeps the page busy until `ms` have passed since the last frame, so the screen is drawn every `ms` at best.
HOLD = """
    let heldAt = performance.now();
    const hold = (ms) => { const until = heldAt + ms; while (performance.now() < until); heldAt = performance.now(); };
"""

# For `seconds`: frames drawn, how far the game's clock went, the steps a frame took, the longest step.
# The first three frames are left out, because the change of pace itself is not what is measured. From the
# fourth on, the clock is read once a frame against that frame's own time stamp, the one the game counts
# with, so the first and the last frame are not half counted. (Until this was done the suite read 0.96
# of real time at 12 frames a second for a game that kept it: two frames of fifty.)
PACE_JS = """(setup) => new Promise(done => { const n = NEON;""" + HOLD + """
    const t0 = performance.now(), steps = {};
    let frames = 0, longest = 0, from = null;
    const tick = (stamp) => {
        if (setup.ms) hold(setup.ms);
        frames++;
        if (frames === 4) from = { stamp, clock: n.clock, frames };
        if (n.pace && frames > 4) { steps[n.pace.steps] = (steps[n.pace.steps] || 0) + 1; longest = Math.max(longest, n.pace.step || 0); }
        const real = (performance.now() - t0) / 1000;
        if (real < setup.seconds || frames < 8) return requestAnimationFrame(tick);
        const most = Object.keys(steps).sort((a, b) => steps[b] - steps[a])[0];
        const span = (stamp - from.stamp) / 1000, moved = n.clock - from.clock, count = frames - from.frames;
        done({ fps: count / span, speed: moved / span, perFrame: moved / count,
               steps: most ? +most : 0, longest, state: n.state });
    };
    requestAnimationFrame(tick);
})"""

# The player's car on the open sand, held where it is: full throttle from 5 m/s, then the brake from 80% of its
# top speed. Speed is read against the game's clock each frame; the answer is when it crossed each mark.
DRIVE_JS = """(setup) => new Promise(done => { const n = NEON, c = n.player.car;""" + HOLD + """
    const x = -454, z = -260, top = c.t.max;
    const speedOf = () => Math.hypot(c.vx, c.vz);
    const clear = () => { for (const v of n.vehicles.slice()) if (v !== c) n.removeVehicle(v); };
    const press = (held) => { for (const key of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'ShiftLeft']) n.keys[key] = held.includes(key); };
    const set = (speed) => { c.x = x; c.z = z; c.h = 0; c.vx = 0; c.vz = speed; c.y = 0; c.vy = 0; c.air = false; c.spin = 0; c.steer = 0; c.stun = 0; };
    const stages = [
        { keys: ['KeyW'], from: 5, marks: [0.3 * top, 0.6 * top], rising: true, name: 'gas' },
        { keys: ['KeyS'], from: 0.8 * top, marks: [0.5 * top, 0.2 * top], rising: false, name: 'brake' },
    ];
    const out = { top, gas: [], brake: [], frames: 0 };
    let at = -1, began = 0, before = null;
    const next = () => {
        at++;
        if (at >= stages.length) return false;
        clear(); n.setWanted(0); c.hp = c.t.hp;
        set(stages[at].from); press(stages[at].keys);
        began = n.clock; before = null;
        return true;
    };
    next();
    const tick = () => {
        if (setup.ms) hold(setup.ms);
        out.frames++;
        const s = stages[at], t = n.clock - began, v = speedOf();
        c.x = x; c.z = z; c.h = 0; c.vx = 0; c.hp = c.t.hp;
        press(s.keys);
        if (before) {
            const mark = s.marks[out[s.name].length];
            if (s.rising ? v >= mark : v <= mark) out[s.name].push(before.t + (t - before.t) * (mark - before.v) / (v - before.v || 1));
        }
        before = { t, v };
        if ((out[s.name].length === s.marks.length || t > 20) && !next()) { press([]); c.vx = c.vz = 0; return done(out); }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""

# The radio with a frame every 250 ms, longer than the 0.2 s it schedules ahead: is each note still on the beat
# grid it started on, and does the count of steps still match the time that passed?
RADIO_JS = """(setup) => new Promise(done => { const n = NEON;""" + HOLD + """
    const station = n.STATIONS.findIndex(s => s.bpm);
    n.setStation(station);
    const stepDur = 60 / n.STATIONS[station].bpm / 4;
    const t0 = performance.now();
    let first = null, worst = 0, drift = 0, frames = 0;
    const tick = () => {
        frames++;
        const real = (performance.now() - t0) / 1000;
        if (real > 1) hold(setup.ms);                     // the first second at full rate: the grid is laid down
        if (n.radio.next > 0) {
            if (real > 0.8 && !first) first = { next: n.radio.next, step: n.radio.step };
            if (first) {
                const along = (n.radio.next - first.next) / stepDur;
                worst = Math.max(worst, Math.abs(along - Math.round(along)));
                drift = Math.max(drift, Math.abs(Math.round(along) - (n.radio.step - first.step)));
            }
        }
        if (real < setup.seconds) return requestAnimationFrame(tick);
        done({ playing: !!first, offGrid: worst, lostSteps: drift, frames, bpm: n.STATIONS[station].bpm,
               ahead: n.radio.next - n.audio.ctx.currentTime });
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
            return round(item, 3)
        if isinstance(item, dict):
            return {key: short(inner) for key, inner in item.items()}
        if isinstance(item, list):
            return [short(inner) for inner in item]
        return item
    return json.dumps(short(value))


def apart(one, other):
    """The largest difference between two lists of times, as a share of the first."""
    if not one or len(one) != len(other):
        return 1.0
    return max(abs(a - b) / a for a, b in zip(one, other))


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

        # 1. the clock
        own = ask(page, PACE_JS, {"ms": 0, "seconds": 3})
        check("this computer draws the game at 40 frames a second or more, so the slow frames below are made by this suite",
              lambda: own["fps"] >= 40 and own["state"] == "play", brief(own))
        check("at its own rate the game takes one step a frame and its clock keeps real time (within 2%)",
              lambda: own["steps"] == 1 and 0.98 <= own["speed"] <= 1.02, brief(own))
        half = ask(page, PACE_JS, {"ms": 32, "seconds": 3})
        check("at about 30 frames a second: two steps a frame, real time",
              lambda: 26 <= half["fps"] <= 31.5 and half["steps"] == 2 and 0.98 <= half["speed"] <= 1.02, brief(half))
        slow = ask(page, PACE_JS, {"ms": 80, "seconds": 4})
        check("at about 12 frames a second: five or six steps a frame, and still real time (2.0 ran at 0.6 of it)",
              lambda: 10.5 <= slow["fps"] <= 12.6 and slow["steps"] in (5, 6) and 0.98 <= slow["speed"] <= 1.02, brief(slow))
        crawl = ask(page, PACE_JS, {"ms": 200, "seconds": 4})
        check("at 5 frames a second: six steps a frame and no more, so the game runs at half speed and does not fall behind for ever",
              lambda: 4.5 <= crawl["fps"] <= 5.01 and crawl["steps"] == 6 and 0.095 <= crawl["perFrame"] <= 0.1001 and 0.45 <= crawl["speed"] <= 0.52,
              brief(crawl))
        longest = max(case["longest"] for case in (own, half, slow, crawl))
        check("no step of the game was longer than 1/48 s in any of these",
              lambda: 0 < longest <= 1 / 48 + 1e-9, brief({"longest": longest, "limit": 1 / 48}))

        # 2. a car
        page.evaluate("""() => { const n = NEON, p = n.player;
            const car = n.vehicles.filter(v => !v.driver && !v.dead && v.type !== 'police')
              .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
            car.vx = car.vz = 0; p.x = car.x + 2.2; p.z = car.z; n.tryEnterExit(); }""")
        page.wait_for_timeout(500)
        check("the player sits in a car", lambda: page.evaluate("() => !!NEON.player.car && NEON.state === 'play'"))
        smooth = ask(page, DRIVE_JS, {"ms": 15})
        choppy = ask(page, DRIVE_JS, {"ms": 80})
        detail = brief({"at 60": {"gas": smooth["gas"], "brake": smooth["brake"]},
                        "at 12": {"gas": choppy["gas"], "brake": choppy["brake"]}, "top": smooth["top"],
                        "error": smooth["error"] or choppy["error"]})
        check("full throttle from 5 m/s reaches 30% and 60% of the car's top speed at the same moments at 12 frames a second as at 60 (within 2%)",
              lambda: len(smooth["gas"]) == 2 and apart(smooth["gas"], choppy["gas"]) <= 0.02, detail)
        check("the brake takes it from 80% of its top speed to 50% and to 20% at the same moments too (within 2%)",
              lambda: len(smooth["brake"]) == 2 and apart(smooth["brake"], choppy["brake"]) <= 0.02, detail)

        # 3. the radio
        beat = ask(page, RADIO_JS, {"ms": 250, "seconds": 5})
        check("the radio at 4 frames a second: every note is on the beat grid it started on (within 1 ms) and no step is counted twice or lost",
              lambda: beat["playing"] and beat["offGrid"] * 60 / beat["bpm"] / 4 < 0.001 and beat["lostSteps"] == 0 and beat["frames"] > 15,
              brief(beat))

        page.wait_for_timeout(300)
        check("no page errors", lambda: not problems, "; ".join(problems[:3]))
        browser.close()


if __name__ == "__main__":
    build = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "NeonCoast.html"
    run(build)
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n{passed}/{len(results)} checks passed for {build.name}")
    sys.exit(0 if passed == len(results) else 1)
