"""Play-test NeonCoast.html in real Chrome: load, start, walk, drive, police, pause."""
import os
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

# A GitHub Mac draws with its graphics card only in a real window: NEON_WINDOW=1 opens one.
# NEON_CHROME_ARGS adds flags (the frame-rate gate runs without the 60 Hz cap of the display).
WINDOW = os.environ.get("NEON_WINDOW") == "1"
EXTRA_ARGS = os.environ.get("NEON_CHROME_ARGS", "").split()

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "test" / "shots"
SHOTS.mkdir(parents=True, exist_ok=True)
URL = (ROOT / "NeonCoast.html").as_uri()

problems = []
results = {}


def check(name, ok, detail=""):
    results[name] = {"ok": bool(ok), "detail": detail}
    print(("PASS  " if ok else "FAIL  ") + name + ("   " + str(detail) if detail else ""))


def snapshot(page):
    return page.evaluate(
        """() => {
            const n = window.NEON, p = n.player, c = p.car;
            return {
                state: n.state, x: p.x, z: p.z, hp: p.hp, inCar: !!c,
                carX: c ? c.x : null, carZ: c ? c.z : null,
                carSpeed: c ? Math.hypot(c.vx, c.vz) : 0, carName: c ? c.t.name : null,
                vehicles: n.vehicles.length, peds: n.peds.length, pickups: n.pickups.length,
                cops: n.vehicles.filter(v => v.driver === 'cop').length,
                stars: n.wanted.stars, money: n.save.money,
                missionActive: n.mission.active, missionStep: n.mission.step,
            };
        }"""
    )


with sync_playwright() as pw:
    browser = pw.chromium.launch(
        channel="chrome",
        headless=not WINDOW,
        args=["--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] + EXTRA_ARGS,
    )
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    page.on("console", lambda m: problems.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))
    page.goto(URL)
    page.wait_for_timeout(2500)

    gpu = page.evaluate(
        """() => {
            const gl = document.createElement('canvas').getContext('webgl');
            const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
            return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
        }"""
    )
    print("renderer:", gpu)
    check("page loads with game handle", page.evaluate("() => !!window.NEON && NEON.state === 'title'"))
    page.screenshot(path=str(SHOTS / "1-title.png"))

    page.click("#btn-new")
    page.wait_for_timeout(1500)
    s = snapshot(page)
    check("new game starts in play state", s["state"] == "play", s["state"])
    check("streets are populated", s["vehicles"] >= 8 and s["peds"] >= 8, f"{s['vehicles']} vehicles, {s['peds']} peds")
    check("packages and health pickups placed", s["pickups"] >= 15, s["pickups"])
    page.screenshot(path=str(SHOTS / "2-start.png"))

    # walk forward
    before = snapshot(page)
    page.keyboard.down("KeyW")
    page.wait_for_timeout(1500)
    page.keyboard.up("KeyW")
    after = snapshot(page)
    walked = ((after["x"] - before["x"]) ** 2 + (after["z"] - before["z"]) ** 2) ** 0.5
    check("player walks with W", walked > 1.0, f"{walked:.1f} m")

    # stand next to the starter car and get in
    page.evaluate(
        """() => {
            const n = window.NEON;
            const car = n.vehicles.find(v => v.type === 'muscle' && !v.driver);
            n.player.x = car.x + 2.2; n.player.z = car.z;
        }"""
    )
    page.wait_for_timeout(200)
    page.keyboard.press("KeyF")
    page.wait_for_timeout(300)
    s = snapshot(page)
    check("F enters the car", s["inCar"], s["carName"])

    # mission 1 step 1 is "get in a vehicle" once the job is started; start it directly
    start_z = s["carZ"]
    page.keyboard.down("KeyW")
    page.wait_for_timeout(4000)
    s = snapshot(page)
    page.screenshot(path=str(SHOTS / "3-driving.png"))
    page.keyboard.up("KeyW")
    check("car accelerates and moves", s["carSpeed"] > 5 or abs(s["carZ"] - start_z) > 15, f"{s['carSpeed'] * 3.6:.0f} km/h, moved {abs(s['carZ'] - start_z):.0f} m")

    # steering changes heading
    h0 = page.evaluate("() => NEON.player.car.h")
    page.keyboard.down("KeyW")
    page.keyboard.down("KeyA")
    page.wait_for_timeout(1200)
    page.keyboard.up("KeyA")
    page.keyboard.up("KeyW")
    h1 = page.evaluate("() => NEON.player.car.h")
    check("A steers left", h1 - h0 > 0.1, f"heading change {h1 - h0:.2f} rad")

    # police response
    # This check is about patrol cars arriving. The car stands still, and a patrol car next to a standing
    # car arrests its driver after 2.4 s, so the arrest clock is held at zero while we wait; the arrest
    # itself is gate G5 (test/gates.py).
    page.evaluate("() => NEON.setWanted(3)")
    for _ in range(14):
        page.wait_for_timeout(500)
        page.evaluate("() => { NEON.wanted.bust = 0; }")
    s = snapshot(page)
    check("three stars bring police", s["stars"] == 3 and s["cops"] >= 2, f"{s['cops']} patrol cars, {s['stars']} stars")
    page.evaluate(
        """() => {
            const c = NEON.player.car || NEON.player;
            let best = null, bestD = 1e9;
            for (const v of NEON.vehicles) {
                if (v.driver !== 'cop') continue;
                const d = Math.hypot(v.x - c.x, v.z - c.z);
                if (d < bestD) { bestD = d; best = v; }
            }
            if (best) { NEON.cam.yaw = Math.atan2(best.x - c.x, best.z - c.z); NEON.cam.lastMouse = performance.now(); }
        }"""
    )
    page.wait_for_timeout(350)
    page.screenshot(path=str(SHOTS / "4-wanted.png"))
    page.evaluate("() => NEON.setWanted(0)")

    # pause and resume
    page.keyboard.press("KeyP")
    page.wait_for_timeout(400)
    paused = page.evaluate("() => NEON.state")
    check("P pauses", paused == "paused", f"state {paused}")
    page.screenshot(path=str(SHOTS / "5-pause.png"))
    page.click("#btn-resume")
    page.wait_for_timeout(400)
    check("Resume returns to play", page.evaluate("() => NEON.state") == "play")

    # ---- first job, start to finish (car is teleported between the markers) ----
    def place_car(x, z):
        page.evaluate(
            """([x, z]) => {
                const c = NEON.player.car;
                c.x = x; c.z = z; c.vx = 0; c.vz = 0; c.vf = 0;
            }""",
            [x, z],
        )

    money_before = snapshot(page)["money"]
    start_at = page.evaluate("() => NEON.MISSIONS[0].at")
    garage = page.evaluate("() => NEON.PLACES.garage")
    job_end = page.evaluate("() => NEON.MISSIONS[0].steps.filter(s => s.at).pop().at")
    place_car(start_at[0], start_at[1])
    page.wait_for_timeout(700)
    s = snapshot(page)
    check("driving onto the J marker starts the job", s["missionActive"], f"step {s['missionStep']}")
    page.wait_for_timeout(3800)
    road_x = round((start_at[0] + 420) / 84) * 84 - 420 + 4      # right-hand lane of the nearest street
    place_car(road_x, start_at[1] + 14)
    page.evaluate("() => { NEON.player.car.h = Math.PI; NEON.cam.yaw = Math.PI; NEON.cam.lastMouse = performance.now(); }")
    page.wait_for_timeout(500)
    page.screenshot(path=str(SHOTS / "6a-job-running.png"))
    place_car(job_end[0], job_end[1])
    page.wait_for_timeout(700)
    s = snapshot(page)
    saved_jobs = page.evaluate("() => NEON.save.mission")
    check(
        "job 1 passes and pays out",
        not s["missionActive"] and saved_jobs == 1 and s["money"] == money_before + 250,
        f"jobs done {saved_jobs}, cash ${money_before} -> ${s['money']}",
    )
    page.screenshot(path=str(SHOTS / "6-mission-passed.png"))

    # ---- respray clears the heat ----
    place_car(garage[0] + 40, garage[1])
    page.wait_for_timeout(400)
    page.evaluate("() => NEON.setWanted(2)")
    place_car(garage[0], garage[1])
    page.wait_for_timeout(600)
    after_spray = snapshot(page)
    check(
        "respray costs $150 and clears the stars",
        after_spray["stars"] == 0 and after_spray["money"] == s["money"] - 150,
        f"stars {after_spray['stars']}, cash ${after_spray['money']}",
    )

    # ---- tune-up: stop in the ring, pay, the stage is saved ----
    tune = page.evaluate("() => NEON.PLACES.tune")
    cash_before_tune = after_spray["money"]
    page.evaluate("() => { NEON.save.money = 2000; }")
    place_car(tune[0], tune[1])
    page.wait_for_timeout(700)
    tuned = page.evaluate("() => ({ tune: NEON.save.tune, money: NEON.save.money })")
    stored = page.evaluate("() => JSON.stringify(Object.values(localStorage))")
    check(
        "tune-up stage 1 costs $1500 and is saved",
        tuned["tune"] == 1 and tuned["money"] == 500 and '"tune":1' in stored.replace("\\", ""),
        f"stage {tuned['tune']}, cash $2000 -> ${tuned['money']}",
    )
    page.evaluate("(cash) => { NEON.save.money = cash; }", cash_before_tune)
    page.wait_for_timeout(4200)      # let the tune-up banner clear before the pictures

    # ---- landmarks: the Sol Wheel seen from the beach road at dusk ----
    wheel = page.evaluate("() => NEON.landmarks.wheelAt")
    place_car(wheel["x"] - 105, wheel["z"] - 55)
    page.evaluate(
        """(w) => {
            const c = NEON.player.car;
            NEON.setTime(18.6);
            NEON.cam.yaw = Math.atan2(w.x - c.x, w.z - c.z);
            NEON.cam.lastMouse = performance.now();
        }""",
        wheel,
    )
    page.wait_for_timeout(1200)
    page.screenshot(path=str(SHOTS / "10-sol-wheel.png"))
    spire = page.evaluate("() => NEON.landmarks.spire")
    place_car(-420 + 84 * 9, round((spire["z"] + 420) / 84) * 84 - 420 + 4)
    page.evaluate(
        """(s) => {
            const c = NEON.player.car;
            NEON.cam.yaw = Math.atan2(s.x - c.x, s.z - c.z);
            NEON.cam.lastMouse = performance.now();
        }""",
        spire,
    )
    page.wait_for_timeout(1200)
    page.screenshot(path=str(SHOTS / "11-meridian-spire.png"))

    # ---- night look ----
    page.evaluate("() => NEON.setTime(23.5)")
    page.wait_for_timeout(1500)
    page.screenshot(path=str(SHOTS / "7-night.png"))

    # ---- on foot: leave the car, fire the pistol ----
    page.evaluate("() => NEON.tryEnterExit()")
    page.wait_for_timeout(400)
    check("F leaves the car", not snapshot(page)["inCar"])
    ammo_before = page.evaluate("() => NEON.player.ammo")
    page.evaluate("() => NEON.playerAttack()")
    page.wait_for_timeout(300)
    ammo_after = page.evaluate("() => NEON.player.ammo")
    check("pistol fires and uses a round", ammo_after == ammo_before - 1, f"{ammo_before} -> {ammo_after}")

    # ---- wasted, then back on your feet at the hospital ----
    page.evaluate("() => NEON.hurt(100000)")
    page.wait_for_timeout(300)
    check("losing all health shows WASTED", page.evaluate("() => NEON.state") == "dead")
    page.screenshot(path=str(SHOTS / "8-wasted.png"))
    page.wait_for_timeout(4200)
    s = snapshot(page)
    hospital = page.evaluate("() => NEON.PLACES.hospital")
    near_hospital = ((s["x"] - hospital[0]) ** 2 + (s["z"] - hospital[1]) ** 2) ** 0.5 < 6
    check("respawn at the hospital with full health", s["state"] == "play" and s["hp"] == 100 and near_hospital, f"hp {s['hp']}")

    fps = page.evaluate(
        """() => new Promise(done => {
            let frames = 0; const t0 = performance.now();
            const tick = () => { frames++; performance.now() - t0 < 2000 ? requestAnimationFrame(tick) : done(frames / 2); };
            requestAnimationFrame(tick);
        })"""
    )
    print(f"fps in this headless browser: {fps:.0f}")

    # ---- progress survives closing the page; Fast graphics works ----
    page.reload()
    page.wait_for_timeout(2500)
    check(
        "progress is saved and Continue is offered",
        page.evaluate("() => NEON.save.mission === 1 && getComputedStyle(document.getElementById('btn-continue')).display !== 'none'"),
    )
    page.click("#title .seg:text-is('Fast')")
    page.click("#btn-continue")
    page.wait_for_timeout(2500)
    s = snapshot(page)
    check("Continue starts play in Fast graphics", s["state"] == "play" and page.evaluate("() => NEON.save.quality") == 0)
    page.screenshot(path=str(SHOTS / "9-fast-graphics.png"))
    browser.close()

unique = sorted(set(problems))
check("no console errors or warnings", not unique, unique[:6])
(ROOT / "test" / "smoke-result.json").write_text(json.dumps({"results": results, "gpu": gpu, "fps": fps}, indent=2))
sys.exit(0 if all(r["ok"] for r in results.values()) else 1)
