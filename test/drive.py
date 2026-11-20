"""Real-input drive test: finish the first story job using only key presses.

Nothing is teleported and no game function is called. The script reads the game
state (position, heading, the route the game itself draws, people and cars close
by) and answers with the same keys a player has: W A S D and F. It brakes for
whoever is in its lane. It walks to the red car, gets in, drives
to the yellow job beam, then to Mo's Respray, and passes when the save file
records the job as done.

Traffic is random, so one run is one sample: run it a few times before trusting it.

    python test/drive.py            # one run; prints a JSON result, exit code 0 on pass
    python test/drive.py 5          # five runs, exit code 0 only when all five pass
"""
import json
import math
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
LANE = 3.2
TIME_LIMIT = 240.0

STATE_JS = """() => {
  const n = NEON, p = n.player, c = p.car;
  const starter = n.vehicles.filter(v => v.type === 'muscle' && !v.dead && v.driver !== 'ai')
    .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
  return {
    state: n.state, x: p.x, z: p.z, yaw: n.cam.yaw, hp: p.hp, stars: n.wanted.stars,
    car: c ? { x: c.x, z: c.z, h: c.h, vx: c.vx, vz: c.vz, hp: c.hp, max: c.t.hp } : null,
    starter: starter ? [starter.x, starter.z] : null,
    route: n.route.points, blip: n.mission.blip, active: n.mission.active,
    // what a driver sees: people and other cars close by
    near: c ? n.peds.filter(q => q.state !== 'down' && Math.hypot(q.x - c.x, q.z - c.z) < 32).map(q => [q.x, q.z])
      .concat(n.vehicles.filter(v => v !== c && Math.hypot(v.x - c.x, v.z - c.z) < 32).map(v => [v.x, v.z])) : [],
    job: n.mission.active ? n.mission.def.name : '', step: n.mission.step, done: n.save.mission,
    money: n.save.money,
  };
}"""


def wrap(angle):
    return (angle + math.pi) % (2 * math.pi) - math.pi


def aim_point(state, ahead):
    """A point `ahead` metres along the game's own route, moved into the right-hand lane."""
    points = state["route"]
    if len(points) < 2:
        return state["blip"]
    left = ahead
    for k in range(1, len(points)):
        (x0, z0), (x1, z1) = points[k - 1], points[k]
        length = math.hypot(x1 - x0, z1 - z0)
        if length < 1e-6:
            continue
        if left <= length or k == len(points) - 1:
            u = min(1.0, left / length)
            side = LANE if 1 < k < len(points) - 1 else 0.0
            dx, dz = (x1 - x0) / length, (z1 - z0) / length
            return [x0 + (x1 - x0) * u - dz * side, z0 + (z1 - z0) * u + dx * side]
        left -= length
    return points[-1]


def blocked_ahead(state, speed):
    """True when a person or a car is in the lane ahead, inside the distance needed to stop."""
    car = state["car"]
    fx, fz = math.sin(car["h"]), math.cos(car["h"])
    reach = 7.0 + speed * 1.1
    for x, z in state["near"]:
        dx, dz = x - car["x"], z - car["z"]
        ahead = dx * fx + dz * fz
        across = abs(dx * fz - dz * fx)
        if 1.5 < ahead < reach and across < 2.3:
            return True
    return False


class Keys:
    """Holds keys down through real keyboard events and never sends a repeat."""

    def __init__(self, page):
        self.page = page
        self.down = set()

    def hold(self, wanted):
        wanted = set(wanted)
        for key in self.down - wanted:
            self.page.keyboard.up(key)
        for key in wanted - self.down:
            self.page.keyboard.down(key)
        self.down = wanted


def run():
    result = {"passed": False, "phase": "start", "seconds": 0, "reverses": 0, "yields": 0, "max_stars": 0}
    problems = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=True, args=[
            "--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))
        page.on("console", lambda m: problems.append(f"{m.type}: {m.text}") if m.type == "error" else None)
        page.goto((ROOT / "NeonCoast.html").as_uri())
        page.wait_for_timeout(1200)
        page.click("#btn-new")
        page.wait_for_timeout(1000)
        keys = Keys(page)
        started = time.time()
        stuck_since = None
        waiting_since = None
        yielding = False
        reverse_until = 0.0
        reverse_keys = []
        start_money = None
        while time.time() - started < TIME_LIMIT:
            s = page.evaluate(STATE_JS)
            now = time.time()
            if start_money is None:
                start_money = s["money"]
            result["max_stars"] = max(result["max_stars"], s["stars"])
            if s["done"] >= 1:
                result["passed"] = True
                break
            if s["state"] != "play":
                result["phase"] = "stopped: game state " + s["state"]
                break
            car = s["car"]
            if not car:
                # on foot: walk to the driver's side of the red car, then F
                result["phase"] = "walking to the car"
                if not s["starter"]:
                    break
                tx, tz = s["starter"]
                dx, dz = tx - s["x"], tz - s["z"]
                gap = math.hypot(dx, dz)
                if gap < 3.2:
                    keys.hold([])
                    page.keyboard.press("f")
                    page.wait_for_timeout(350)
                    continue
                forward = (math.sin(s["yaw"]) * dx + math.cos(s["yaw"]) * dz) / gap
                right = (-math.cos(s["yaw"]) * dx + math.sin(s["yaw"]) * dz) / gap
                want = []
                if forward > 0.38:
                    want.append("w")
                if forward < -0.38:
                    want.append("s")
                if right > 0.38:
                    want.append("d")
                if right < -0.38:
                    want.append("a")
                keys.hold(want)
                page.wait_for_timeout(50)
                continue

            result["phase"] = "driving to " + (s["job"] or "the job beam") + (" step " + str(s["step"]) if s["active"] else "")
            target = aim_point(s, 13.0) if s["blip"] else None
            if not target:
                keys.hold([])
                page.wait_for_timeout(100)
                continue
            speed = math.hypot(car["vx"], car["vz"])
            error = wrap(math.atan2(target[0] - car["x"], target[1] - car["z"]) - car["h"])
            if now < reverse_until:
                keys.hold(reverse_keys)
                page.wait_for_timeout(50)
                continue
            # stuck against something: back out with the wheel turned the other way
            if speed < 0.7:
                stuck_since = stuck_since or now
                if now - stuck_since > 1.6:
                    result["reverses"] += 1
                    reverse_keys = ["s", "d" if error > 0 else "a"]
                    reverse_until = now + 1.3
                    stuck_since = None
                    continue
            else:
                stuck_since = None
            far = aim_point(s, 30.0)
            bend = abs(wrap(math.atan2(far[0] - car["x"], far[1] - car["z"]) - car["h"]))
            to_go = math.hypot(s["blip"][0] - car["x"], s["blip"][1] - car["z"])
            cruise = 15.0 if bend < 0.25 else 7.5
            if to_go < 26:
                cruise = 6.0                  # the last stretch crosses a pavement: go gently
            # brake for whoever is in the way, the way a careful driver would; give up waiting after 5 s
            if blocked_ahead(s, speed):
                waiting_since = waiting_since or now
                if now - waiting_since < 5.0:
                    result["yields"] += 1 if speed > 1 and not yielding else 0
                    yielding = True
                    stuck_since = None
                    keys.hold(["s"] if speed > 1.2 else [])
                    page.wait_for_timeout(45)
                    continue
                cruise = 4.0
            else:
                waiting_since = None
                yielding = False
            want = []
            if abs(error) > 1.9 and speed < 3:
                want = ["s", "d" if error > 0 else "a"]      # target is behind: back round
            else:
                if speed < cruise:
                    want.append("w")
                elif speed > cruise + 4:
                    want.append("s")
                if error > 0.05:
                    want.append("a")
                elif error < -0.05:
                    want.append("d")
            keys.hold(want)
            page.wait_for_timeout(45)

        keys.hold([])
        final = page.evaluate(STATE_JS)
        result["seconds"] = round(time.time() - started, 1)
        result["jobs_done"] = final["done"]
        result["money"] = final["money"]
        result["money_start"] = start_money
        result["car_health"] = round(final["car"]["hp"] / final["car"]["max"], 2) if final["car"] else None
        result["player_health"] = round(final["hp"])
        result["console_errors"] = problems[:5]
        shots = ROOT / "test" / "shots"
        shots.mkdir(parents=True, exist_ok=True)
        page.wait_for_timeout(600)
        page.screenshot(path=str(shots / "drive-end.png"))
        browser.close()
    return result


if __name__ == "__main__":
    runs = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    samples = [run() for _ in range(runs)]
    summary = {
        "runs": runs,
        "passed": sum(1 for sample in samples if sample["passed"]),
        "seconds": [sample["seconds"] for sample in samples],
        "samples": samples,
    }
    (ROOT / "test" / "drive-result.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    clean = all(not sample["console_errors"] for sample in samples)
    sys.exit(0 if summary["passed"] == runs and clean else 1)
