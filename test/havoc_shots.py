"""Screenshots for the judges: what 2.0 Havoc added (a stunt jump, the barrel row going up, a car through
road works, nitro). The council cannot play the game; it sees these next to the fact sheet.

    python test/havoc_shots.py      # writes test/shots/28-stunt-jump.png ... 31-nitro.png
"""
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

WINDOW = os.environ.get("NEON_WINDOW") == "1"
EXTRA_ARGS = os.environ.get("NEON_CHROME_ARGS", "").split()

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "test" / "shots"

# the player gets into the nearest free car, past the learner phase, nothing wanted, everything standing
SETUP_JS = """() => { const n = NEON, p = n.player;
    const car = n.vehicles.filter(v => !v.driver && !v.dead && v.type !== 'police')
      .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    car.vx = car.vz = 0; p.x = car.x + 2.2; p.z = car.z; n.tryEnterExit(); }"""

PUT_JS = """(at) => { const n = NEON, c = n.player.car;
    n.save.mission = Math.max(1, n.save.mission); n.setWanted(0); n.wanted.pts = 0; n.resetHavoc();
    c.hp = c.t.hp; c.x = at.x; c.z = at.z; c.h = at.h; c.vx = Math.sin(at.h) * at.speed; c.vz = Math.cos(at.h) * at.speed;
    c.y = 0; c.vy = 0; c.air = false; c.spin = 0; c.jump = null; c.steer = 0; c.stun = 0;
    n.cam.yaw = at.h; n.setTime(at.time);
    for (const key of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'ShiftLeft']) n.keys[key] = (at.keys || []).includes(key); }"""

STOP_JS = """() => { const n = NEON, c = n.player.car;
    for (const key of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'ShiftLeft']) n.keys[key] = false;
    c.vx = c.vz = 0; }"""


def run():
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=not WINDOW, args=[
            "--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] + EXTRA_ARGS)
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.goto((ROOT / "NeonCoast.html").as_uri())
        page.wait_for_timeout(1200)
        page.click("#btn-new")
        page.wait_for_timeout(1000)
        page.evaluate(SETUP_JS)
        page.wait_for_timeout(500)

        # a stunt jump at dusk: 35 m of run-up at 30 m/s, the shot is taken in the air
        ramp = page.evaluate("() => { const r = NEON.ramps[2]; return { x: r.x, z: r.z, fx: r.fx, fz: r.fz, h: r.h }; }")
        page.evaluate(PUT_JS, {"x": ramp["x"] - ramp["fx"] * 35, "z": ramp["z"] - ramp["fz"] * 35, "h": ramp["h"],
                               "speed": 30, "time": 17.8, "keys": ["KeyW"]})
        try:
            page.wait_for_function("() => NEON.player.car.air && NEON.player.car.y > 1.5", timeout=6000)
        except Exception as error:      # the shot is still taken: the judges see what the game showed
            print("the car did not leave the ground:", str(error).splitlines()[0])
        page.screenshot(path=str(OUT / "28-stunt-jump.png"))
        page.wait_for_timeout(2500)
        page.evaluate(STOP_JS)

        # the barrel row on the Rustport dock at night, a third of a second after a shot at the first barrel
        page.evaluate(PUT_JS, {"x": -327, "z": 455, "h": 1.5708, "speed": 0, "time": 21.5})
        page.wait_for_timeout(900)
        page.evaluate("() => { NEON.shootProps(-287, 0.5, 440, 0, 0, 1, 60); }")
        page.wait_for_timeout(350)
        page.screenshot(path=str(OUT / "29-barrel-blast.png"))
        page.wait_for_timeout(2500)

        # through road works by day: cones and barriers in the air, the style card counting
        works = page.evaluate("""() => { const n = NEON, w = n.worksAt[0];
            const lines = []; for (let i = 0; i <= 10; i++) lines.push(-420 + 84 * i);
            const alongZ = lines.some((line) => Math.abs(w.x - line) < 8);     // on a road that runs north and south
            return { x: w.x, z: w.z, alongZ }; }""")
        if works["alongZ"]:
            start = {"x": works["x"], "z": works["z"] - 16, "h": 0}
        else:
            start = {"x": works["x"] - 16, "z": works["z"], "h": 1.5708}
        page.evaluate(PUT_JS, dict(start, speed=22, time=12, keys=["KeyW"]))
        page.wait_for_timeout(900)
        page.screenshot(path=str(OUT / "30-road-works.png"))
        page.evaluate(STOP_JS)
        page.wait_for_timeout(1500)

        # nitro at night on a straight: a full tank, Shift held
        page.evaluate(PUT_JS, {"x": 3.2, "z": -150, "h": 0, "speed": 20, "time": 21.5, "keys": ["KeyW", "ShiftLeft"]})
        page.evaluate("() => { NEON.nitro.tank = 1; }")
        page.wait_for_timeout(1100)
        page.screenshot(path=str(OUT / "31-nitro.png"))
        page.evaluate(STOP_JS)

        browser.close()
    print("wrote 4 shots to", OUT)


if __name__ == "__main__":
    run()
