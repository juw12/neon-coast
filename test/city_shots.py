"""Screenshots for the judges: the 1.2 city systems (cab fare, whole map, helicopter, property) and the
1.3 day look, Sol Wheel ride and perk card, the 1.4 skyline, Rustport quay, Paper Round and radio dial,
and the 1.6 dock apron and Shadow Run.

State is set through window.NEON to reach each scene quickly (time of day, where you stand, where the
airship is on its lap); the pictures are the real game.

    python test/city_shots.py       # writes test/shots/11-cab-fare.png ... 27-shadow-run.png
"""
import math
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "test" / "shots"


def run():
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=True, args=[
            "--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.goto((ROOT / "NeonCoast.html").as_uri())
        page.wait_for_timeout(1200)
        page.click("#btn-new")
        page.wait_for_timeout(1000)

        # cab fare: on duty, rolling up to the passenger
        page.evaluate("""() => { const n = NEON, p = n.player; n.setTime(17.6); const cab = n.vehicles.find(v => v.type === 'taxi' && !v.dead);
            cab.vx = cab.vz = 0; p.x = cab.x + 2.2; p.z = cab.z; n.tryEnterExit(); }""")
        page.wait_for_timeout(400)
        page.keyboard.press("t")
        page.wait_for_timeout(4200)
        page.evaluate("""() => { const n = NEON, c = n.player.car, at = n.mission.def.steps[0].at;
            const side = n.cab.passenger.position.z > at[1] ? 1 : -1;      // kerb side of the stop
            c.x = at[0] - side * 30; c.z = at[1] - side * 5.1; c.h = side * Math.PI / 2;
            c.vx = side * 9; c.vz = 0; n.cam.yaw = c.h; n.keys.KeyW = true; }""")
        page.wait_for_timeout(650)
        page.screenshot(path=str(OUT / "11-cab-fare.png"))
        page.evaluate("() => { NEON.keys.KeyW = false; NEON.player.car.vx = NEON.player.car.vz = 0; }")

        # the whole map, with the route to the pickup
        page.keyboard.press("m")
        page.wait_for_timeout(500)
        page.screenshot(path=str(OUT / "12-whole-map.png"))
        page.keyboard.press("m")
        page.keyboard.press("t")
        page.wait_for_timeout(300)

        # four stars at night: the helicopter and its searchlight
        page.evaluate("() => { NEON.setTime(22); NEON.setWanted(4); }")
        page.wait_for_timeout(7500)
        page.evaluate("""() => { const n = NEON, c = n.player.car; n.cam.pitch = 0.25;
            n.cam.yaw = Math.atan2(n.heli.x - c.x, n.heli.z - c.z); n.cam.lastMouse = performance.now() + 60000; }""")
        page.wait_for_timeout(600)
        page.screenshot(path=str(OUT / "13-helicopter.png"))
        page.evaluate("() => { NEON.setWanted(0); NEON.setTime(11.5); }")
        page.wait_for_timeout(8500)

        # property by day: standing at the bungalow with the money to buy it
        page.evaluate("""() => { const n = NEON, p = n.player; if (p.car) { p.car.vx = p.car.vz = 0; n.tryEnterExit(); }
            n.addMoney(2400); const at = n.PROPERTIES[0].at; p.x = at[0] - 5.5; p.z = at[1] - 0.4; p.h = Math.PI / 2;
            n.cam.yaw = Math.PI / 2 - 0.5; n.cam.pitch = -0.12; n.cam.lastMouse = performance.now() + 60000; }""")
        page.wait_for_timeout(2600)
        page.evaluate("() => { const n = NEON, at = n.PROPERTIES[0].at; n.player.x = at[0] - 1; n.player.z = at[1]; }")
        page.wait_for_timeout(700)
        page.screenshot(path=str(OUT / "14-property-day.png"))

        # ---- version 1.3 ----
        def stand(tod, x, z, cam_yaw, pitch, ship_lap):
            page.evaluate("""([tod, x, z, yaw, pitch, lap]) => { const n = NEON, p = n.player;
                if (p.car) { p.car.vx = p.car.vz = 0; n.tryEnterExit(); }
                n.setTime(tod); p.x = x; p.z = z; p.h = yaw; n.cam.yaw = yaw; n.cam.pitch = pitch;
                n.cam.lastMouse = performance.now() + 60000; n.landmarks.shipT = lap / 0.021; }""", [tod, x, z, cam_yaw, pitch, ship_lap])
            page.wait_for_timeout(1300)

        # Sol Beach by day: parasols, sails, the wheel, the airship
        stand(10.5, 470, 420, 3.46, 0.06, 0.3)
        page.wait_for_timeout(8000)             # let the property offer from the last scene fade
        page.screenshot(path=str(OUT / "15-day-sol-beach.png"))
        # a painted wall in each of three districts: the mural nearest a point, seen from across its street
        def mural(tod, near_x, near_z, back, side, ship_lap):
            m = page.evaluate("""([x, z]) => NEON.landmarks.murals.slice()
                .sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0]""", [near_x, near_z])
            nx, nz = [(-1, 0), (1, 0), (0, -1), (0, 1)][m["f"]]
            x = m["x"] + nx * back - nz * side
            z = m["z"] + nz * back + nx * side
            stand(tod, x, z, math.atan2(m["x"] - x, m["z"] - z), 0.3, ship_lap)

        mural(13.0, 404, 278, 17.0, 6.0, 5.9)
        page.screenshot(path=str(OUT / "16-day-mural-beach.png"))
        mural(11.0, -100, 42, 17.0, 6.0, 3.4)
        page.screenshot(path=str(OUT / "17-day-mural-meridian.png"))
        mural(11.0, -308, 351, 15.0, -7.0, 2.6)
        page.screenshot(path=str(OUT / "18-day-mural-rustport.png"))

        # the Sol Wheel ride: E at the foot of the pier, then the view from near the top
        page.evaluate("""() => { const n = NEON, p = n.player, m = n.markers.find(k => k.kind === 'wheel');
            n.setTime(16.4); n.landmarks.shipT = 2.75 / 0.021; p.x = m.x; p.z = m.z; }""")
        page.wait_for_timeout(600)
        page.keyboard.press("e")
        page.wait_for_timeout(6500)
        page.screenshot(path=str(OUT / "10b-sol-wheel-ride.png"))
        page.keyboard.press("f")
        page.wait_for_timeout(500)

        # the perk card: what a found package shows in play
        page.evaluate("""() => { const n = NEON; n.setTime(17.6); n.checkPerks(true); n.save.packages = [0, 1, 2, 3]; n.checkPerks();
            const p = n.player; p.x = 425; p.z = 150; p.h = 0.5; n.cam.yaw = 0.5; n.cam.pitch = -0.02; }""")
        page.wait_for_timeout(900)
        page.screenshot(path=str(OUT / "19-perk-card.png"))

        # ---------- version 1.4: building outlines, the Rustport quay, the Paper Round, the radio dial ----------
        page.evaluate("() => { const n = NEON; n.save.packages = []; n.checkPerks(true); document.getElementById('perk').classList.remove('show'); }")
        page.wait_for_timeout(5500)             # let the hints from the last scenes fade
        stand(11.5, -252, 460, 0.35, 0.12, 4.2)
        page.screenshot(path=str(OUT / "20-rustport-quay.png"))
        stand(17.8, -336, -84, math.pi / 2, 0.22, 1.1)
        page.screenshot(path=str(OUT / "21-meridian-crowns.png"))
        stand(11.5, 455, 0, -1.9, 0.1, 0.3)
        page.screenshot(path=str(OUT / "22-beach-balconies.png"))
        stand(16.5, -80, 252, -1.2, 0.2, 2.0)
        page.screenshot(path=str(OUT / "23-rustport-roofs.png"))

        # the radio: R in a car turns the dial, the station and its style show for three seconds
        page.evaluate("""() => { const n = NEON, p = n.player; n.setTime(19.3);
            const car = n.vehicles.filter(v => v.driver !== 'ai' && !v.dead && ['sedan', 'sports', 'muscle'].includes(v.type))
              .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
            p.x = car.x + 2.2; p.z = car.z; n.tryEnterExit();
            car.x = 339.2; car.z = -190; car.h = 0; car.vx = car.vz = 0; n.cam.yaw = 0; n.cam.pitch = 0.12;
            n.cam.lastMouse = performance.now() + 60000; }""")
        page.wait_for_timeout(4000)
        for _ in range(4):
            if page.evaluate("() => NEON.radio.station") == 2:
                break
            page.keyboard.press("r")
            page.wait_for_timeout(120)
        page.wait_for_timeout(500)
        page.screenshot(path=str(OUT / "25-radio-dial.png"))
        page.evaluate("() => { const c = NEON.player.car; c.vx = c.vz = 0; NEON.tryEnterExit(); }")
        page.wait_for_timeout(3500)

        # the Paper Round: an odd job done on foot, four envelopes round one block
        page.evaluate("""() => { const n = NEON, p = n.player; n.setTime(10.5); n.save.mission = n.MISSIONS.length; n.offerMission();
            for (let k = 0; k < 6 && n.mission.offer.kind !== 'foot'; k++) n.anotherJob();
            const at = n.mission.offer.at, to = n.mission.offer.steps[0].at;
            p.x = at[0]; p.z = at[1]; p.h = n.cam.yaw = Math.atan2(to[0] - at[0], to[1] - at[1]); n.cam.pitch = 0.1;
            n.cam.lastMouse = performance.now() + 60000; }""")
        page.wait_for_timeout(1700)
        page.screenshot(path=str(OUT / "24-paper-round.png"))

        # ---------- version 1.6: the dock apron, and the Shadow Run (follow a car unseen) ----------
        page.wait_for_timeout(19000)            # the round runs out of time; the next kind on offer is the tail job
        stand(11.5, -214, 447, 0.8, 0.26, 4.2)
        page.screenshot(path=str(OUT / "26-dock-apron.png"))
        page.evaluate("""() => { const n = NEON, p = n.player; n.setTime(18.4); n.setWanted(0);
            for (let k = 0; k < 7 && n.mission.offer.kind !== 'tail'; k++) n.anotherJob();
            const at = n.mission.offer.at; p.x = at[0]; p.z = at[1]; }""")
        page.wait_for_timeout(600)
        page.evaluate("""() => { const n = NEON, p = n.player;
            const car = n.vehicles.filter(v => v.driver !== 'ai' && v.driver !== 'cop' && !v.dead)
              .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
            car.vx = car.vz = 0; p.x = car.x + 2.2; p.z = car.z; n.tryEnterExit(); }""")
        page.wait_for_timeout(400)
        # hold the player's car 24 m behind the marked car, in its lane, for the picture
        page.evaluate("""() => { window.__pin = setInterval(() => { const n = NEON, c = n.player.car, t = n.mission.car;
            if (!c || !t) return;
            c.x = t.x - Math.sin(t.h) * 24; c.z = t.z - Math.cos(t.h) * 24; c.h = t.h; c.vx = t.vx; c.vz = t.vz;
            n.cam.yaw = t.h; n.cam.pitch = 0.16; n.cam.lastMouse = performance.now() + 60000; }, 16); }""")
        page.wait_for_timeout(4300)
        page.screenshot(path=str(OUT / "27-shadow-run.png"))
        page.evaluate("() => clearInterval(window.__pin)")
        browser.close()


if __name__ == "__main__":
    run()
    print("wrote 18 shots to", OUT)
