"""Screenshots of the version 1.2 city systems for the judges: cab fare, whole map, helicopter, property.

State is set through window.NEON to reach each scene quickly; the pictures are the real game.

    python test/city_shots.py       # writes test/shots/11-cab-fare.png ... 14-property-day.png
"""
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
        browser.close()


if __name__ == "__main__":
    run()
    print("wrote 4 shots to", OUT)
