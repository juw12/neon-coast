"""Where a Paper Round can start, and what a car put on its beam is told.

test/city.py puts a car on the beam of the Paper Round and expects the hint that the round is on foot. The game
stands that beam on the corner of a block picked at random, so the check meets a different corner in every run.
This script tries every block in turn, with the ramp tip not yet said (the first time near a ramp) and said.

    python test/foot_beam.py [NeonCoast.html]

One line for each corner where the hint was not the on-foot one, and a count at the end. It measures; it checks
nothing and its exit code is always 0.

Run 9 (2.0.1 and 2.0, a GitHub Mac): the on-foot hint at 61 of 61 corners, tip said or not, 8 of them with a ramp
within 45 m. So the corner was not the cause. The cause was in city.py's own set-up: it got into the car from the
spot where a new game starts, which clears the hint line (see check 13 there).
"""
import json
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

WINDOW = os.environ.get("NEON_WINDOW") == "1"
EXTRA_ARGS = os.environ.get("NEON_CHROME_ARGS", "").split()
ROOT = Path(__file__).resolve().parent.parent

CORNERS_JS = """() => { const out = [];
    for (let i = 1; i <= 8; i++) for (let j = 1; j <= 8; j++) { const b = NEON.blocks[i][j];
        if (b && b.type !== 'park') out.push({ i, j, type: b.type, at: [b.x0 + 2.4, b.z0 + 2.4] }); }
    return out; }"""

# The same moves as city.py: the car is put on the beam and the hint is read 700 ms later.
BEAM_JS = """(setup) => new Promise(done => {
    const n = NEON, m = n.mission, c = n.player.car, at = setup.at, line = document.getElementById('hint');
    n.setWanted(0); n.wanted.pts = 0;
    if (setup.untold) n.save.havocTold &= ~2; else n.save.havocTold |= 2;
    m.footNote = 0;
    m.offer.at = at; m.startMarker.x = at[0]; m.startMarker.z = at[1];
    line.classList.remove('show');
    c.x = at[0]; c.z = at[1]; c.vx = c.vz = 0; c.hp = c.t.hp;
    const start = performance.now();
    const out = { far: 0, fast: 0, onFoot: false, tip: false, frames: 0 };
    const tick = () => {
        const car = n.player.car;
        out.frames++;
        if (!car) return done(Object.assign(out, { lostCar: true, state: n.state }));
        out.far = Math.max(out.far, Math.hypot(car.x - at[0], car.z - at[1]));
        out.fast = Math.max(out.fast, Math.abs(car.vf || 0));
        const shown = line.classList.contains('show'), words = line.textContent;
        if (shown && words.includes('on foot')) out.onFoot = true;
        if (shown && words.includes('stunt ramp')) out.tip = true;
        if (performance.now() - start >= 700) {
            out.hint = words; out.shown = shown; out.active = m.active;
            out.end = Math.hypot(car.x - at[0], car.z - at[1]);
            out.ramp = Math.min(...(n.ramps || []).map((r) => Math.hypot(r.x - at[0], r.z - at[1])), 9999);
            out.high = car.y || 0; out.air = !!car.air; out.lost = c.t.hp - car.hp; out.stars = n.wanted.stars;
            for (const key of ['far', 'fast', 'end', 'ramp', 'high', 'lost']) out[key] = Math.round(out[key] * 100) / 100;
            return done(out);
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""


def run(target):
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=not WINDOW, args=[
            "--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] + EXTRA_ARGS)
        page = browser.new_context(viewport={"width": 1280, "height": 720}).new_page()
        problems = []
        page.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))
        page.goto(target.resolve().as_uri())
        page.wait_for_timeout(800)
        page.click("#btn-new")
        page.wait_for_timeout(1000)
        page.evaluate("() => { NEON.save.mission = NEON.MISSIONS.length; NEON.offerMission(); }")
        for _ in range(8):
            if page.evaluate("() => NEON.mission.offer.kind") == "foot":
                break
            page.keyboard.press("j")
            page.wait_for_timeout(200)
        kind = page.evaluate("() => NEON.mission.offer.kind")
        page.evaluate("""() => { const n = NEON, p = n.player;
            if (p.car) return;
            const car = n.vehicles.filter(v => v.driver !== 'ai' && !v.dead)
              .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
            p.x = car.x + 2.2; p.z = car.z; n.tryEnterExit(); }""")
        page.wait_for_timeout(700)
        corners = page.evaluate(CORNERS_JS)
        print(f"{target.name}: offer is '{kind}', in a car: {page.evaluate('() => !!NEON.player.car')}, {len(corners)} corners, "
              f"{page.evaluate('() => (NEON.ramps || []).length')} ramps")
        for untold in (True, False):
            told = 0
            near_ramp = 0
            for corner in corners:
                if not page.evaluate("() => !!NEON.player.car && NEON.state === 'play' && NEON.mission.offer.kind === 'foot' && !NEON.mission.active"):
                    print("  stopped: the set-up is gone  |  " + json.dumps(page.evaluate(
                        "() => ({ car: !!NEON.player.car, state: NEON.state, kind: NEON.mission.offer.kind, active: NEON.mission.active })")))
                    break
                seen = page.evaluate(BEAM_JS, {"at": corner["at"], "untold": untold})
                ok = "on foot" in seen.get("hint", "") and seen.get("shown")
                told += bool(ok)
                near_ramp += seen.get("ramp", 9999) < 45
                if not ok:
                    print(f"  block {corner['i']},{corner['j']} ({corner['type']})  |  " + json.dumps(seen))
            print(f"{target.name}, ramp tip {'not yet said' if untold else 'said before'}: the on-foot hint at {told} of {len(corners)} corners; "
                  f"{near_ramp} corners have a ramp within 45 m")
        if problems:
            print("page errors: " + "; ".join(problems[:3]))
        browser.close()


if __name__ == "__main__":
    run(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "NeonCoast.html")
