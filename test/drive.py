"""Real-input drive test: finish a story job using only key presses.

Nothing is teleported and no game function is called while it plays. The script
reads the game state (position, heading, the route the game itself draws, people
and cars close by) and answers with the same keys a player has: W A S D and F.
It brakes for whoever is in its lane (not while the police are chasing it). It
walks to a car (a car more than 15 m away is reached along the pavements, round the
block and not through it; stepping round a lamp post or a parked car is counted as
"sidesteps"), gets in, drives to the yellow job beam, follows every step of the
job, and passes when the save file records the job as done.

Jobs it can play (version 1.7):
    1     First Wheels     new game, red car, Sol Wheel pier
    2     Hot Delivery     pick up in Meridian, deliver to Rustport inside 80 s
    3     Midnight Sprint  seven checkpoints against the clock
    4     Borrowed Time    steal the marked car (two stars after a head start), bring it to the respray
    5     Heat Wave        grab the bag at the bank, then lose three stars (it takes the marked route to the respray)
    6     Coastline Run    eight checkpoints round the whole island against the clock
    tail  Shadow Run       the odd job with no clock: stay 12 to 60 m behind a moving car for 40 s

For every job but the first the save file is first set to "the earlier jobs done" and Continue
is pressed, which is the one thing that is set up rather than played. For Shadow Run the story is
set as finished and J is pressed until that job is on offer. A failed try (timer out, arrested,
taken out, spotted, lost) is not hidden: the game offers a job again, the script tries again inside
the same time limit, and the result lists the tries it took ("tries") and how often it was arrested
or taken out ("downs"), with the reason the game gave for each failed try ("fails").

Traffic is random, so one run is one sample: run it a few times before trusting it.

    python test/drive.py            # one run of job 1; prints a JSON result, exit code 0 on pass
    python test/drive.py 5          # five runs of job 1, exit code 0 only when all five pass
    python test/drive.py 3 2        # three runs of job 2 (result in test/drive-result-job2.json)
    python test/drive.py 3 tail     # three runs of Shadow Run (result in test/drive-result-tail.json)
"""
import os
import json
import math
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

# NEON_WINDOW=1 opens a real window instead of a headless browser (a GitHub Mac uses its graphics card in both).
# NEON_CHROME_ARGS adds flags (the frame-rate gate runs without the 60 Hz cap of the display).
WINDOW = os.environ.get("NEON_WINDOW") == "1"
EXTRA_ARGS = os.environ.get("NEON_CHROME_ARGS", "").split()

ROOT = Path(__file__).resolve().parent.parent
LANE = 3.2
TIME_LIMIT = 240.0
# cruise speed on a straight / in a bend (m/s), and the time allowed for the whole run
JOBS = {
    1: {"name": "First Wheels", "straight": 15.0, "bend": 7.5, "limit": 240.0},
    2: {"name": "Hot Delivery", "straight": 19.0, "bend": 8.0, "limit": 300.0},
    3: {"name": "Midnight Sprint", "straight": 27.0, "bend": 9.5, "limit": 420.0, "race": True},
    4: {"name": "Borrowed Time", "straight": 19.0, "bend": 8.0, "limit": 420.0},
    5: {"name": "Heat Wave", "straight": 21.0, "bend": 8.5, "limit": 480.0},
    6: {"name": "Coastline Run", "straight": 31.0, "bend": 9.5, "limit": 480.0, "race": True},
    # the odd job: not a slot in the story, so it is found with J and passes when its $700 is paid
    7: {"name": "Shadow Run", "straight": 16.0, "bend": 7.5, "limit": 420.0, "odd": True, "reward": 700},
}
STORY_JOBS = 6
TAIL_GAP = (22.0, 34.0)       # where the script tries to sit behind the marked car (the game allows 11 to 60 m)

STATE_JS = """(fast) => {
  const n = NEON, p = n.player, c = p.car;
  // the car to walk to: the red starter car on a new game, otherwise the nearest parked one
  const away = (v) => Math.hypot(v.x - p.x, v.z - p.z);
  const parked = n.vehicles.filter(v => (n.save.mission > 0 || v.type === 'muscle') && !v.dead && v.driver !== 'ai' && v.driver !== 'cop')
    .sort((a, b) => away(a) - away(b));
  // "get in something fast": for a race, a sports or muscle car is worth a short walk
  const starter = (fast && parked.find(v => (v.type === 'sports' || v.type === 'muscle') && away(v) < 60)) || parked[0];
  const step = n.mission.active ? n.mission.def.steps[n.mission.step] : null;
  const tailed = step && step.t === 'tail' && n.mission.car ? n.mission.car : null;
  const marked = step && step.t === 'car' && step.target && n.mission.car && c !== n.mission.car ? n.mission.car : null;
  return {
    state: n.state, x: p.x, z: p.z, yaw: n.cam.yaw, hp: p.hp, stars: n.wanted.stars,
    car: c ? { x: c.x, z: c.z, h: c.h, vx: c.vx, vz: c.vz, hp: c.hp, max: c.t.hp } : null,
    starter: starter ? [starter.x, starter.z] : null,
    marked: marked ? [marked.x, marked.z] : null,
    route: n.route.points, blip: n.mission.blip, active: n.mission.active,
    // what a driver sees: people and other cars close by
    people: c ? n.peds.filter(q => q.state !== 'down' && Math.hypot(q.x - c.x, q.z - c.z) < 32).map(q => [q.x, q.z]) : [],
    cars: c ? n.vehicles.filter(v => v !== c && Math.hypot(v.x - c.x, v.z - c.z) < 32).map(v => [v.x, v.z]) : [],
    job: n.mission.active ? n.mission.def.name : '', step: n.mission.step, done: n.save.mission,
    money: n.save.money, offer: n.mission.offer ? n.mission.offer.name : '',
    // a checkpoint to drive through (no stopping, no walking in): the script keeps its speed there
    through: !!(step && step.t === 'goto' && step.car && !step.stop && !step.target),
    tailed: tailed ? [tailed.x, tailed.z] : null,
    // what the game says when a try ends: read from the banner a player sees
    card: document.querySelector('#banner b').textContent, why: document.querySelector('#banner span').textContent,
    type: c ? c.type : '',
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


# The city is a grid: road centre lines every 84 m from -420 to 420, roads 20 m wide, 5 m of pavement
# inside each block edge (CELL, ROAD and WALK in src/01-world.js). A person on foot keeps to the pavement.
PAVEMENTS = sorted(-420 + 84 * i + side * 12.5 for i in range(11) for side in (-1, 1))


def steps(px, pz, corners):
    """The corners of a walk with a point every 10 m or less between them, so that walking with eight
    key directions cannot drift off the pavement on a long leg."""
    out = []
    x, z = px, pz
    for cx, cz in corners:
        pieces = max(1, math.ceil(math.hypot(cx - x, cz - z) / 10))
        out += [(x + (cx - x) * k / pieces, z + (cz - z) * k / pieces) for k in range(1, pieces + 1)]
        x, z = cx, cz
    return out


def foot_path(px, pz, tx, tz):
    """Way-points for a walk from (px, pz) to a car at (tx, tz) along the pavements, the way a person
    goes round a block and not through it. A car closer than 15 m is walked to directly."""
    if math.hypot(tx - px, tz - pz) < 15:
        return [(tx, tz)]
    near = lambda value: min(PAVEMENTS, key=lambda line: abs(value - line))
    sx, sz, ex, ez = near(px), near(pz), near(tx), near(tz)
    start_on_x = abs(px - sx) <= abs(pz - sz)       # the player's nearest pavement runs north-south (x fixed)
    end_on_x = abs(tx - ex) <= abs(tz - ez)
    start = (sx, pz) if start_on_x else (px, sz)
    end = (ex, tz) if end_on_x else (tx, ez)
    points = [start]
    if start_on_x == end_on_x and abs((sx - ex) if start_on_x else (sz - ez)) == 25:
        # the two pavements of one road: cross it where the car is
        return steps(px, pz, points + [(sx, tz) if start_on_x else (tx, sz), (tx, tz)])
    if start_on_x and end_on_x:
        if sx != ex:
            across = min(PAVEMENTS, key=lambda line: abs(pz - line) + abs(tz - line))
            points += [(sx, across), (ex, across)]
    elif not start_on_x and not end_on_x:
        if sz != ez:
            across = min(PAVEMENTS, key=lambda line: abs(px - line) + abs(tx - line))
            points += [(across, sz), (across, ez)]
    elif start_on_x:
        points.append((sx, ez))
    else:
        points.append((ex, sz))
    return steps(px, pz, points + [end, (tx, tz)])


def blocked_ahead(state, speed):
    """True when a person or a car is in the lane ahead, inside the distance needed to stop.
    With the police behind it still stops for people, but no longer queues behind cars."""
    car = state["car"]
    fx, fz = math.sin(car["h"]), math.cos(car["h"])
    reach = 7.0 + speed * 1.1
    for x, z in state["people"] + (state["cars"] if state["stars"] == 0 else []):
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


def run(job=1):
    plan = JOBS[job]
    result = {"job": job, "name": plan["name"], "passed": False, "phase": "start", "seconds": 0, "tries": 0,
              "downs": 0, "fails": [],
              "reverses": 0, "yields": 0, "sidesteps": 0, "max_stars": 0}
    problems = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=not WINDOW, args=[
            "--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] + EXTRA_ARGS)
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))
        page.on("console", lambda m: problems.append(f"{m.type}: {m.text}") if m.type == "error" else None)
        page.goto((ROOT / "NeonCoast.html").as_uri())
        page.wait_for_timeout(1200)
        if job > 1:
            # the one thing that is set up, not played: a save file with the earlier jobs done
            page.evaluate("() => NEON.persist()")
            key = page.evaluate("() => Object.keys(localStorage).find(k => /neon/i.test(k))")
            done_before = STORY_JOBS if plan.get("odd") else job - 1
            page.evaluate("([k, v]) => localStorage.setItem(k, JSON.stringify(v))", [key, {"money": 200, "mission": done_before}])
            page.reload()
            page.wait_for_timeout(1200)
            page.click("#btn-continue")
        else:
            page.click("#btn-new")
        page.wait_for_timeout(1000)
        keys = Keys(page)
        was_active = False
        down = False
        started = time.time()
        stuck_since = None
        waiting_since = None
        yielding = False
        reverse_until = 0.0
        reverse_keys = []
        start_money = None
        try_money = None
        asked = 0.0
        foot_plan = []            # on foot: way-points along the pavements to the car, and the car they lead to
        foot_goal = None
        foot_spot = None          # on foot: where the player was when it last got somewhere, and since when
        foot_since = 0.0
        side_until = 0.0          # walking along a wall until this time
        side_sign = 1
        side_count = 0
        side_gap = None
        while time.time() - started < plan["limit"]:
            s = page.evaluate(STATE_JS, bool(plan.get("race")))
            now = time.time()
            if start_money is None:
                start_money = s["money"]
            result["max_stars"] = max(result["max_stars"], s["stars"])
            if s["active"] and not was_active:
                result["tries"] += 1
                try_money = s["money"]
            if was_active and not s["active"] and "FAILED" in s["card"]:
                result["fails"].append(s["why"])          # the reason the game gave for a failed try
            if plan.get("odd"):
                # passed when the job that was running has ended and its reward is in the bank
                if was_active and not s["active"] and try_money is not None and s["money"] >= try_money + plan["reward"]:
                    result["passed"] = True
                    break
                # another kind is on offer (first time, or after a failed try): ask for the next with J
                if not s["active"] and s["state"] == "play" and s["offer"] != plan["name"] and now - asked > 0.6:
                    keys.hold([])
                    page.keyboard.press("j")
                    asked = now
                    was_active = s["active"]
                    page.wait_for_timeout(150)
                    continue
            elif s["done"] >= job:
                result["passed"] = True
                break
            was_active = s["active"]
            if s["state"] == "dead":
                # arrested or taken out: the game puts the player back on foot after a few seconds
                if not down:
                    result["downs"] += 1
                down = True
                keys.hold([])
                page.wait_for_timeout(200)
                continue
            down = False
            if s["state"] != "play":
                result["phase"] = "stopped: game state " + s["state"]
                break
            car = s["car"]
            if not car:
                # on foot: walk to the driver's side of the red car, then F
                result["phase"] = "walking to the car"
                if not (s["marked"] or s["starter"]):
                    break
                tx, tz = s["marked"] or s["starter"]
                if math.hypot(tx - s["x"], tz - s["z"]) < 3.2:
                    keys.hold([])
                    page.keyboard.press("f")
                    page.wait_for_timeout(350)
                    foot_spot = None
                    foot_goal = None
                    continue
                # plan the walk along the pavements once per car (a person goes round a block, not through it)
                if foot_goal is None or math.hypot(tx - foot_goal[0], tz - foot_goal[1]) > 3:
                    foot_goal = (tx, tz)
                    foot_plan = foot_path(s["x"], s["z"], tx, tz)
                    side_gap = None
                while len(foot_plan) > 1 and math.hypot(foot_plan[0][0] - s["x"], foot_plan[0][1] - s["z"]) < 2.0:
                    foot_plan.pop(0)
                    side_gap = None
                tx, tz = foot_plan[0]
                dx, dz = tx - s["x"], tz - s["z"]
                gap = max(0.01, math.hypot(dx, dz))
                # something in the way (a lamp post, a parked car): after 1.5 s without getting anywhere,
                # walk along the wall for a while, longer each time, as a person would
                if foot_spot is None or math.hypot(s["x"] - foot_spot[0], s["z"] - foot_spot[1]) > 0.8:
                    foot_spot, foot_since = (s["x"], s["z"]), now
                elif now - foot_since > 1.5:
                    if now < side_until + 0.3:
                        side_sign = -side_sign          # the sidestep itself went nowhere: try the other way
                    if side_gap is None or gap < side_gap - 8.0:
                        side_count = 0                  # real progress since the last wall
                    side_gap = gap
                    side_count += 1
                    side_until = now + min(9.0, 1.5 * side_count)
                    result["sidesteps"] += 1
                    foot_spot = None
                if now < side_until:
                    dx, dz = dz * side_sign, -dx * side_sign
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
            foot_spot = None
            foot_goal = None

            result["phase"] = "driving to " + (s["job"] or "the job beam") + (" step " + str(s["step"]) if s["active"] else "")
            speed = math.hypot(car["vx"], car["vz"])
            racing = bool(plan.get("race")) and s["through"]
            target = aim_point(s, max(13.0, speed * 0.75) if racing else 13.0) if s["blip"] else None
            if not target:
                keys.hold([])
                page.wait_for_timeout(100)
                continue
            if s["marked"] and math.hypot(s["marked"][0] - car["x"], s["marked"][1] - car["z"]) < 11:
                # the job wants another car: stop short of it and get out
                result["phase"] = "changing to the marked car"
                if speed > 1.2:
                    keys.hold(["Space"])
                    page.wait_for_timeout(45)
                else:
                    keys.hold([])
                    page.keyboard.press("f")
                    page.wait_for_timeout(350)
                continue
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
            far = aim_point(s, 30.0 + max(0.0, speed - 15.0) * 2.6 if racing else 30.0)
            bend = abs(wrap(math.atan2(far[0] - car["x"], far[1] - car["z"]) - car["h"]))
            to_go = math.hypot(s["blip"][0] - car["x"], s["blip"][1] - car["z"])
            cruise = plan["straight"] if bend < 0.25 else plan["bend"]
            if s["tailed"]:
                # following: hold a gap behind the marked car instead of racing to it
                result["phase"] = "tailing the marked car"
                if to_go < TAIL_GAP[0]:
                    keys.hold(["s"] if speed > 1.0 else [])
                    stuck_since = None
                    page.wait_for_timeout(45)
                    continue
                cruise = min(cruise, 9.0 if to_go < TAIL_GAP[1] else plan["straight"])
            elif to_go < 26 and not racing:
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
        final = page.evaluate(STATE_JS, False)
        result["seconds"] = round(time.time() - started, 1)
        result["jobs_done"] = final["done"]
        result["money"] = final["money"]
        result["money_start"] = start_money
        result["car"] = final["type"]
        result["car_health"] = round(final["car"]["hp"] / final["car"]["max"], 2) if final["car"] else None
        result["player_health"] = round(final["hp"])
        result["console_errors"] = problems[:5]
        shots = ROOT / "test" / "shots"
        shots.mkdir(parents=True, exist_ok=True)
        page.wait_for_timeout(600)
        page.screenshot(path=str(shots / ("drive-end.png" if job == 1 else f"drive-end-{label(job)}.png")))
        browser.close()
    return result


def label(job):
    return "tail" if job == 7 else f"job{job}"


if __name__ == "__main__":
    runs = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    job = (7 if sys.argv[2] == "tail" else int(sys.argv[2])) if len(sys.argv) > 2 else 1
    name = "drive-result.json" if job == 1 else f"drive-result-{label(job)}.json"
    samples = []
    for _ in range(runs):
        try:
            samples.append(run(job))
        except Exception as error:             # a browser that hangs is a failed sample, not a lost result file
            samples.append({"job": job, "name": JOBS[job]["name"], "passed": False, "phase": "the test itself broke",
                            "seconds": 0, "console_errors": [], "error": str(error).splitlines()[0][:200]})
        summary = {
            "job": job,
            "name": JOBS[job]["name"],
            "runs": len(samples),
            "passed": sum(1 for sample in samples if sample["passed"]),
            "seconds": [sample["seconds"] for sample in samples],
            "samples": samples,
        }
        # written after every run, so a run that is cut short does not lose the ones before it
        (ROOT / "test" / name).write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    clean = all(not sample["console_errors"] for sample in samples)
    sys.exit(0 if summary["passed"] == runs and clean else 1)
