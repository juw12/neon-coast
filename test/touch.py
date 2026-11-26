"""Touch play on an emulated phone. Run after `python build.py`: python test/touch.py

Chrome is told it is a phone (touch screen as the main pointer) at four screen sizes, landscape and upright.
Fingers are real touch events sent through the browser's debugging channel, two at a time where the game needs
two thumbs. Then: the desktop page must be untouched by all this, the home-screen files must install and serve
the game offline, and, where Playwright's WebKit is installed, the page must run on Safari's engine too.
This is an emulation. It cannot tell how the game runs or feels on a real phone.
"""
import os
import functools
import http.server
import json
import re
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

# NEON_WINDOW=1 opens a real window instead of a headless browser (a GitHub Mac uses its graphics card in both).
# NEON_CHROME_ARGS adds flags (the frame-rate gate runs without the 60 Hz cap of the display).
WINDOW = os.environ.get("NEON_WINDOW") == "1"
EXTRA_ARGS = os.environ.get("NEON_CHROME_ARGS", "").split()

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "test" / "shots"
SHOTS.mkdir(parents=True, exist_ok=True)
GAME = ROOT / "NeonCoast.html"
SCREENS = [("landscape", 844, 390), ("upright", 390, 844), ("small-landscape", 667, 375), ("small-upright", 360, 740)]
CHROME_ARGS = ["--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

results = {}
problems = []


def check(name, ok, detail=""):
    results[name] = {"ok": bool(ok), "detail": str(detail)}
    print(("PASS  " if ok else "FAIL  ") + name + ("   " + str(detail) if detail != "" else ""))


def watch(page, tag):
    page.on("console", lambda m: problems.append(f"{tag} console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: problems.append(f"{tag} pageerror: {e}"))


class Fingers:
    """Touch points held on the screen; each change is sent as one touch event listing every finger."""

    def __init__(self, page):
        self.cdp = page.context.new_cdp_session(page)
        self.points = {}

    def _send(self, kind):
        points = [{"x": x, "y": y, "id": finger} for finger, (x, y) in self.points.items()]
        self.cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": points})

    def down(self, finger, x, y):
        self.points[finger] = (x, y)
        self._send("touchStart")

    def move(self, finger, x, y, steps=4):
        x0, y0 = self.points[finger]
        for k in range(1, steps + 1):
            self.points[finger] = (x0 + (x - x0) * k / steps, y0 + (y - y0) * k / steps)
            self._send("touchMove")

    def up(self, finger):
        del self.points[finger]
        self._send("touchEnd")

    def tap(self, x, y):
        self.down(9, x, y)
        self.up(9)


def centre(page, selector):
    box = page.evaluate(
        """(selector) => {
            const el = [...document.querySelectorAll(selector)].find(e => e.getClientRects().length);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return [r.left + r.width / 2, r.top + r.height / 2];
        }""",
        selector,
    )
    if not box:
        raise AssertionError(f"{selector} is not on screen")
    return box


BESIDE_CAR = """() => {
    const n = NEON, p = n.player;
    const car = n.vehicles.find(v => v.type === 'muscle' && !v.driver);
    // the second time round the car goes back to its kerb, facing up the empty street
    if (!window.carHome) window.carHome = [car.x, car.z, car.h];
    else { [car.x, car.z, car.h] = window.carHome; car.vx = car.vz = car.vf = 0; }
    p.x = car.x + 2.2; p.z = car.z;
    for (const v of n.vehicles) if (v !== car && Math.hypot(v.x - car.x, v.z - car.z) < 90) v.x -= 500;   // an empty street
    for (const ped of n.peds) if (Math.hypot(ped.x - car.x, ped.z - car.z) < 60) ped.x += 300;
}"""

OVERLAPS = """() => {
    const show = (id, text) => { const e = document.getElementById(id); if (text) e.textContent = text; e.classList.add('show'); };
    show('hint', 'Sol Beach Kiosk: $2,000, pays $40 an hour.  Tap USE to buy.');
    show('objective', 'Deliver it to Rustport before time runs out');
    show('timer', '1:20');
    show('radio', 'Neon FM 88.1 · synthwave');
    show('veh', 'Patrol Cruiser');
    show('zone', 'North Maren');
    if (NEON.player.car) show('drive');
    document.getElementById('money').textContent = '$128,450';
    document.querySelector('#perk b').textContent = 'Body armour  ·  4 / 5';
    document.querySelector('#perk span').textContent = 'You take 25% less damage';
    show('perk');
    if (!NEON.player.car) show('weapon', 'Pistol  48');
    document.getElementById('way-dist').textContent = 'JOB  1250 m';
    show('way');
    for (const id of ['tb-use', 'tb-cab', 'tb-carfire', 'tb-nitro', 'tb-radio']) document.getElementById(id).classList.add('on');
    const boxes = [];
    for (const id of ['tr', 'map', 'objective', 'way', 'timer', 'hint', 'stick'].concat(NEON.player.car ? ['drive'] : [])) {
        boxes.push([id, document.getElementById(id).getBoundingClientRect()]);
    }
    for (const el of document.querySelectorAll('#pad .tb')) {
        if (el.getClientRects().length) boxes.push([el.textContent.trim().replace(/\\s+/g, ' ') || el.getAttribute('aria-label'), el.getBoundingClientRect()]);
    }
    const out = [];
    for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
        const [ia, ra] = boxes[a], [ib, rb] = boxes[b];
        const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (w > 1 && h > 1) out.push(ia + ' x ' + ib);
    }
    for (const [id, r] of boxes) {
        if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) out.push(id + ' off screen');
        if (r.width < 1 || r.height < 1) out.push(id + ' not shown');
    }
    const small = [...document.querySelectorAll('#pad .tb')].filter(e => e.getClientRects().length && e.getBoundingClientRect().width < 36);
    for (const el of small) out.push(el.textContent.trim() + ' under 36 px');
    return out;
}"""

# pixels of the 3D view that are more than half see-through: the page behind would show (black, on Safari)
SEE_THROUGH = """() => new Promise(done => requestAnimationFrame(() => {
    const copy = document.createElement('canvas');
    copy.width = copy.height = 64;
    const g = copy.getContext('2d');
    g.drawImage(document.getElementById('view'), 0, 0, 64, 64);
    const data = g.getImageData(0, 0, 64, 64).data;
    let count = 0;
    for (let k = 3; k < data.length; k += 4) if (data[k] < 128) count++;
    done(count);
}))"""

OFF_SCREEN = """(selector) => [...document.querySelectorAll(selector)].filter(e => e.getClientRects().length).filter(e => {
    const r = e.getBoundingClientRect();
    return r.left < 0 || r.right > innerWidth;
}).map(e => e.textContent.trim())"""

EMPTY_STREET = """() => {
    const n = NEON, p = n.player;
    for (const v of n.vehicles) if (v.driver && v !== p.car && Math.hypot(v.x - p.x, v.z - p.z) < 110) v.x -= 600;
    for (const ped of n.peds) if (Math.hypot(ped.x - p.x, ped.z - p.z) < 110) ped.x -= 600;
}"""

# feed the frame-rate governor a run of frames of one length, as the game loop would
FEED = """([seconds, frame]) => { for (let t = 0; t < seconds; t += frame) NEON.governor(frame); return NEON.auto.level; }"""


def play_on_phone(browser, name, width, height):
    """One emulated phone: every control once, with real touches."""
    context = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=3, is_mobile=True, has_touch=True)
    page = context.new_page()
    watch(page, name)
    outside = []
    page.on("request", lambda r: outside.append(r.url) if not r.url.startswith(("file:", "data:", "blob:")) else None)
    page.goto(GAME.as_uri())
    page.wait_for_function("window.NEON && NEON.state === 'title'")
    fingers = Fingers(page)
    failed = []

    def want(ok, what):
        if not ok:
            failed.append(what)

    want(page.evaluate("NEON.touch.on && document.body.classList.contains('touch')"), "touch mode is not on")
    want(page.evaluate("NEON.save.quality === 2"), "a first visit on a phone should start on Auto graphics")
    sharp = page.evaluate("(() => { const c = document.getElementById('view'); return [c.width / c.clientWidth, c.getContext('webgl2').getContextAttributes().antialias]; })()")
    want(sharp[0] >= 1.5 and sharp[1], f"picture drawn at {sharp[0]:.2f} pixels per point, antialiasing {sharp[1]}")
    want(page.evaluate("getComputedStyle(document.getElementById('pad')).display === 'none'"), "pad shows on the title screen")
    want(page.evaluate("document.querySelector('#title .touchkeys').getClientRects().length > 0"), "touch instructions are not shown")
    want(page.evaluate("document.querySelector('#title .keys.pairs').getClientRects().length === 0"), "keyboard instructions are shown")
    cut = page.evaluate(OFF_SCREEN, "#title button, #title kbd, #title .card")
    want(not cut, "cut off on the title screen: " + ", ".join(cut))
    page.screenshot(path=str(SHOTS / f"touch-{name}-title.png"))

    fingers.tap(*centre(page, "#btn-new"))
    page.wait_for_function("NEON.state === 'play'")
    page.wait_for_function("document.getElementById('pad').classList.contains('foot')")
    want(page.evaluate("!document.getElementById('lockhint').getClientRects().length"), "the mouse hint shows")
    holes = page.evaluate(SEE_THROUGH)
    want(holes == 0, f"{holes} of 4096 points of the view are see-through (a black sky on Safari)")
    lens = page.evaluate("NEON.view.fov")
    want(lens == 62 if width > height else 62 < lens <= 88, f"lens {lens}")

    # walk: left thumb down in the lower left, pushed up; then let go
    start = page.evaluate("[NEON.player.x, NEON.player.z]")
    sx, sy = centre(page, "#stick")
    fingers.down(1, sx, sy)
    fingers.move(1, sx, sy - 70)
    try:
        page.wait_for_function("([x, z]) => Math.hypot(NEON.player.x - x, NEON.player.z - z) > 4", arg=start, timeout=10000)
    except Exception:  # noqa: BLE001 - reported just below
        pass
    here = page.evaluate("[NEON.player.x, NEON.player.z, NEON.player.speed, NEON.touch.sy]")
    walked = ((here[0] - start[0]) ** 2 + (here[1] - start[1]) ** 2) ** 0.5
    want(walked > 4 and here[2] > 7 and here[3] > 0.95, f"stick: walked {walked:.1f} m at speed {here[2]}")
    fingers.up(1)
    page.wait_for_timeout(200)
    want(page.evaluate("NEON.player.speed === 0 && NEON.touch.sy === 0"), "the player keeps walking after the thumb lifts")

    # look: a drag across the upper right turns the camera
    yaw = page.evaluate("NEON.cam.yaw")
    fingers.down(2, width * 0.72, height * 0.3)
    fingers.move(2, width * 0.72 - 90, height * 0.3 + 20)
    fingers.up(2)
    turned = page.evaluate("NEON.cam.yaw") - yaw
    want(abs(turned - 90 * 0.0058) < 0.02, f"look drag turned {turned:.3f} rad")

    # fire: held, the pistol goes off; the thumb sliding on the button aims (nobody near the crosshair to snap to)
    page.evaluate(EMPTY_STREET)
    ammo, yaw = page.evaluate("[NEON.player.ammo, NEON.cam.yaw]")
    fx, fy = centre(page, "#tb-fire")
    fingers.down(3, fx, fy)
    fingers.move(3, fx - 30, fy)
    try:
        page.wait_for_function("(ammo) => NEON.player.ammo <= ammo - 2", arg=ammo, timeout=10000)
    except Exception:  # noqa: BLE001 - reported just below
        pass
    fingers.up(3)
    shots = ammo - page.evaluate("NEON.player.ammo")
    want(shots >= 2 and abs(page.evaluate("NEON.cam.yaw") - yaw - 30 * 0.0058) < 0.02, f"FIRE: {shots} shots")
    page.wait_for_timeout(400)
    shots_after = page.evaluate("NEON.player.ammo")
    page.wait_for_timeout(700)
    want(page.evaluate("NEON.player.ammo") == shots_after, "the pistol keeps firing after the thumb lifts")
    fingers.tap(*centre(page, ".tb[data-tap=KeyQ]"))
    want(page.evaluate("NEON.player.gun === false && document.getElementById('tb-fire').textContent === 'PUNCH'"), "SWAP did not put the pistol away")
    fingers.tap(*centre(page, ".tb[data-tap=KeyQ]"))
    page.evaluate("NEON.setWanted(0); NEON.wanted.pts = 0;")

    overlaps = page.evaluate(OVERLAPS)
    want(not overlaps, "on foot: " + ", ".join(overlaps))
    page.screenshot(path=str(SHOTS / f"touch-{name}-foot.png"))
    page.evaluate("for (const id of ['hint', 'timer', 'perk', 'radio', 'veh', 'zone']) document.getElementById(id).classList.remove('show')")

    # the car: CAR gets in, GAS with the right thumb while the left thumb steers, BRAKE stops, EXIT gets out
    page.evaluate(BESIDE_CAR)
    page.wait_for_timeout(150)
    fingers.tap(*centre(page, ".tb.on-foot[data-tap=KeyF]"))
    page.wait_for_function("!!NEON.player.car && document.getElementById('pad').classList.contains('car')")
    heading = page.evaluate("NEON.player.car.h")
    gx, gy = centre(page, ".tb[data-hold=KeyW]")
    fingers.down(1, gx, gy)
    try:
        page.wait_for_function("Math.hypot(NEON.player.car.vx, NEON.player.car.vz) > 5", timeout=15000)
    except Exception:  # noqa: BLE001 - reported just below
        pass
    sx, sy = centre(page, "#stick")
    fingers.down(2, sx, sy)
    fingers.move(2, sx + 70, sy)
    try:
        page.wait_for_function("(h) => NEON.player.car.h < h - 0.15", arg=heading, timeout=10000)
    except Exception:  # noqa: BLE001 - reported just below
        pass
    drive = page.evaluate("[Math.hypot(NEON.player.car.vx, NEON.player.car.vz), NEON.player.car.h, NEON.keys.KeyW, NEON.touch.sx]")
    want(drive[0] > 5 and drive[2] and drive[3] > 0.95, f"GAS: {drive[0]:.1f} m/s, key {drive[2]}, stick {drive[3]:.2f}")
    want(drive[1] < heading - 0.15, f"steering right turned the car {drive[1] - heading:.2f} rad")
    fingers.up(2)
    fingers.up(1)
    want(page.evaluate("!NEON.keys.KeyW && NEON.touch.sx === 0"), "GAS or the stick stayed on")
    # the picture is what a player sees at the wheel; the overlap check after it then shows every line and
    # button at once (the worst case), which up to 2.1 was also what the picture showed
    page.wait_for_timeout(120)
    page.screenshot(path=str(SHOTS / f"touch-{name}-car.png"))
    overlaps = page.evaluate(OVERLAPS)
    want(not overlaps, "in a car: " + ", ".join(overlaps))
    page.screenshot(path=str(SHOTS / f"touch-{name}-car-all.png"))
    page.evaluate("for (const id of ['hint', 'timer', 'perk']) document.getElementById(id).classList.remove('show')")
    bx, by = centre(page, ".tb[data-hold=Space]")
    fingers.down(1, bx, by)
    page.wait_for_function("Math.hypot(NEON.player.car.vx, NEON.player.car.vz) < 0.5", timeout=8000)
    fingers.up(1)
    station = page.evaluate("NEON.radio.station")
    fingers.tap(*centre(page, ".tb[data-tap=KeyR]"))
    want(page.evaluate("NEON.radio.station") != station, "RADIO did not change the station")

    # (2.2) fewer buttons at once: NITRO only with nitro in the tank, RADIO only while nobody is after you
    seen = "document.getElementById('%s').getClientRects().length > 0"
    page.evaluate("NEON.nitro.tank = 0")
    page.wait_for_function("!" + seen % "tb-nitro", timeout=3000)
    page.evaluate("NEON.nitro.tank = 0.5")
    page.wait_for_function(seen % "tb-nitro", timeout=3000)
    want(page.evaluate(seen % "tb-radio"), "RADIO is not there with no stars on")
    page.evaluate("NEON.setWanted(1)")
    page.wait_for_function("!" + seen % "tb-radio", timeout=3000)
    page.evaluate("NEON.setWanted(0); NEON.wanted.pts = 0")
    page.wait_for_function(seen % "tb-radio", timeout=3000)
    # (2.1, unchecked until now) under the map one name at a time: the district, then the car, then the station
    names = page.evaluate("""() => {
        const ids = ['zone', 'veh', 'radio'], out = [];
        const shown = () => ids.filter(id => getComputedStyle(document.getElementById(id)).display !== 'none'
            && document.getElementById(id).classList.contains('show')).join('+');
        for (const id of ids) document.getElementById(id).classList.add('show');
        out.push(shown());
        document.getElementById('zone').classList.remove('show'); out.push(shown());
        document.getElementById('veh').classList.remove('show'); out.push(shown());
        document.getElementById('radio').classList.remove('show');
        return out;
    }""")
    want(names == ['zone', 'veh', 'radio'], f"under the map more than one name shows, or the wrong one: {names}")

    # the round map opens the whole island; a tap closes it
    fingers.tap(*centre(page, "#map"))
    page.wait_for_function("NEON.bigMap.open", timeout=3000)
    want(page.evaluate("/tap to close$/.test(document.getElementById('bigmap-note').textContent)"), "the map note still names a key")
    big = page.evaluate("(() => { const r = document.getElementById('bigmap').getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; })()")
    want(big, "the big map does not fit the screen")
    page.screenshot(path=str(SHOTS / f"touch-{name}-map.png"))
    fingers.tap(*centre(page, "#bigmap-canvas"))
    page.wait_for_function("!NEON.bigMap.open", timeout=3000)

    # pause with a thumb still on GAS: the key must not stay down
    fingers.down(1, gx, gy)
    fingers.tap(*centre(page, ".tb.sys"))
    page.wait_for_function("NEON.state === 'paused'")
    fingers.up(1)
    page.wait_for_timeout(250)
    want(page.evaluate("!NEON.keys.KeyW && getComputedStyle(document.getElementById('pad')).display === 'none'"), "pause left GAS down or the pad up")
    want(page.evaluate("getComputedStyle(document.getElementById('btn-shift')).display !== 'none'"), "no courier shift button on the pause screen")
    fits = page.evaluate("(() => { const p = document.querySelector('#pause .panel'); const r = document.getElementById('btn-resume').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && p.getBoundingClientRect().bottom <= innerHeight + 1; })()")
    want(fits, "the pause screen does not fit")
    cut = page.evaluate(OFF_SCREEN, "#pause button, #pause .card")
    want(not cut, "cut off on the pause screen: " + ", ".join(cut))
    page.screenshot(path=str(SHOTS / f"touch-{name}-pause.png"))
    fingers.tap(*centre(page, "#btn-resume"))
    page.wait_for_function("NEON.state === 'play'")
    rolling = page.evaluate("Math.hypot(NEON.player.car.vx, NEON.player.car.vz)")
    page.wait_for_timeout(400)
    after = page.evaluate("Math.hypot(NEON.player.car.vx, NEON.player.car.vz)")
    want(after <= rolling + 0.05, f"the car speeds up after the pause with no thumb on GAS: {rolling:.2f} to {after:.2f} m/s")

    fingers.down(1, bx, by)
    page.wait_for_function("Math.hypot(NEON.player.car.vx, NEON.player.car.vz) < 0.5", timeout=15000)
    fingers.up(1)
    fingers.tap(*centre(page, ".tb.in-car[data-tap=KeyF]"))
    page.wait_for_function("!NEON.player.car && document.getElementById('pad').classList.contains('foot')")

    # CAR is dim with no car in reach and bright beside one
    want(page.evaluate("document.getElementById('tb-car').classList.contains('on')"), "CAR is dim beside the car")
    page.evaluate("NEON.player.x += 40")
    page.wait_for_function("!document.getElementById('tb-car').classList.contains('on')", timeout=4000)
    page.evaluate("NEON.player.x -= 40")

    # a shot turns onto a target near the crosshair
    aimed = page.evaluate("""() => {
        const n = NEON, p = n.player, ped = n.peds[0];
        for (const v of n.vehicles) if (v.driver && Math.hypot(v.x - p.x, v.z - p.z) < 110) v.x -= 600;
        for (const other of n.peds) if (Math.hypot(other.x - p.x, other.z - p.z) < 110) other.x -= 600;
        const yaw = n.cam.yaw + 0.25;
        ped.x = p.x + Math.sin(yaw) * 18; ped.z = p.z + Math.cos(yaw) * 18; ped.state = 'walk'; ped.hp = 100;
        const before = n.cam.yaw;
        const found = n.aimAssist();
        // the camera's heading is not kept inside one turn, so compare the two directions, not the two numbers
        const apart = Math.abs(Math.atan2(Math.sin(n.cam.yaw - yaw), Math.cos(n.cam.yaw - yaw)));
        return [found, apart < 0.05, before !== n.cam.yaw];
    }""")
    want(all(aimed), f"aim assist did not turn onto a walker 0.25 rad off the crosshair: {aimed}")
    ammo = page.evaluate("NEON.player.ammo")
    fingers.tap(*centre(page, "#tb-fire"))
    page.wait_for_function("(a) => NEON.player.ammo < a", arg=ammo, timeout=5000)
    want(page.evaluate("NEON.peds[0].hp < 100 || NEON.peds[0].state === 'down'"), "the assisted shot missed the walker")
    page.evaluate("NEON.setWanted(0); NEON.wanted.pts = 0; NEON.cam.pitch = -0.18;")

    # steering by arrows: picked on the pause screen, two buttons replace the stick in a car
    fingers.tap(*centre(page, ".tb.sys"))
    page.wait_for_function("NEON.state === 'paused'")
    spot = """() => {
        const b = [...document.querySelectorAll('#pause .seg')].find(e => e.textContent === 'Arrows');
        if (!b) return null;
        b.scrollIntoView({ block: 'center' });
        const r = b.getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2];
    }"""
    want(bool(page.evaluate(spot)), "no Steering choice on the pause screen")
    page.wait_for_timeout(250)
    page.touchscreen.tap(*page.evaluate(spot))
    want(page.evaluate("NEON.save.steer === 1"), "Arrows was not picked")
    page.evaluate("document.querySelector('#pause .panel').scrollTop = 0")
    fingers.tap(*centre(page, "#btn-resume"))
    page.wait_for_function("NEON.state === 'play'")
    page.evaluate(BESIDE_CAR)
    page.wait_for_timeout(150)
    fingers.tap(*centre(page, "#tb-car"))
    page.wait_for_function("!!NEON.player.car && document.getElementById('pad').classList.contains('arrows')")
    want(page.evaluate("!document.getElementById('stick').getClientRects().length"), "the stick still shows with Arrows picked")
    heading = page.evaluate("NEON.player.car.h")
    fingers.down(1, *centre(page, ".tb[data-hold=KeyW]"))
    fingers.down(2, *centre(page, ".tb.go-right"))
    try:
        page.wait_for_function("(h) => NEON.player.car.h < h - 0.15", arg=heading, timeout=15000)
    except Exception:  # noqa: BLE001 - reported just below
        pass
    want(page.evaluate("NEON.player.car.h") < heading - 0.15, "the right arrow did not turn the car")
    fingers.up(2)
    fingers.up(1)
    overlaps = page.evaluate(OVERLAPS.replace("'hint', 'stick'", "'hint'"))
    want(not overlaps, "with arrows: " + ", ".join(overlaps))
    page.screenshot(path=str(SHOTS / f"touch-{name}-arrows.png"))
    page.evaluate("for (const id of ['hint', 'timer', 'perk']) document.getElementById(id).classList.remove('show')")
    fingers.down(1, bx, by)
    page.wait_for_function("Math.hypot(NEON.player.car.vx, NEON.player.car.vz) < 0.5", timeout=15000)
    fingers.up(1)
    fingers.tap(*centre(page, ".tb.in-car[data-tap=KeyF]"))
    page.wait_for_function("!NEON.player.car && document.getElementById('pad').classList.contains('foot')")
    want(page.evaluate("document.getElementById('stick').getClientRects().length > 0"), "on foot the stick is gone with Arrows picked")

    # the Sol Wheel: USE appears in the ring, GET OFF ends the ride
    page.evaluate("() => { const n = NEON, p = n.player; p.x = n.PLACES.wheel[0]; p.z = n.PLACES.wheel[1]; }")
    page.wait_for_function("document.getElementById('tb-use').classList.contains('on')", timeout=4000)
    fingers.tap(*centre(page, "#tb-use"))
    page.wait_for_function("NEON.ride.t > 0 && document.getElementById('pad').classList.contains('ride')", timeout=4000)
    want(page.evaluate("/GET OFF ends the ride\\.$/.test(document.getElementById('hint').textContent)"), "the ride hint still names a key")
    fingers.tap(*centre(page, ".tb.on-ride"))
    page.wait_for_function("NEON.ride.t === 0", timeout=4000)

    want(not outside, "asked the network for " + ", ".join(outside[:3]))
    context.close()
    return failed


def run_governor(browser):
    """Auto graphics, fed frame times: shadows go before pixels, a step that buys nothing is given back,
    a smooth phone climbs, and a touch screen never drops under 1.5 drawn pixels per point."""
    context = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True)
    page = context.new_page()
    watch(page, "governor")
    notes = []
    page.goto(GAME.as_uri())
    page.wait_for_function("window.NEON && NEON.state === 'title'")
    page.tap("#btn-new")
    page.wait_for_function("NEON.state === 'play'")
    page.evaluate("NEON.auto.manual = true; Object.assign(NEON.auto, { level: 0, settle: 0, time: 0, frames: 0, calm: 0, hold: 0, trial: null, useless: {}, forget: 120 }); NEON.applySettings();")
    ratio = "(() => { const c = document.getElementById('view'); return c.width / c.clientWidth; })()"
    start = page.evaluate("[NEON.gfx.shadows, NEON.gfx.glow, NEON.gfx.ratio]")
    if start != [True, True, 2]:
        notes.append(f"top rung is {start}")
    slow, smooth = 1 / 30, 1 / 60
    # slow: one rung down (shadows off, pixels kept)
    level = page.evaluate(FEED, [2.1, slow])
    first = page.evaluate("[NEON.auto.level, NEON.gfx.shadows, NEON.gfx.glow, NEON.gfx.ratio]")
    if first != [1, False, True, 2]:
        notes.append(f"first step down gave {first}")
    # the step bought enough (30 -> 50): it is kept; smooth for a while: it climbs back
    page.evaluate(FEED, [2.0, slow])            # the settle time after a change does not count
    page.evaluate(FEED, [2.1, 1 / 50])
    if page.evaluate("NEON.auto.level") != 1:
        notes.append("a step that helped was not kept")
    for _ in range(3):
        page.evaluate(FEED, [2.1, smooth])
    if page.evaluate("NEON.auto.level") != 0:
        notes.append(f"did not climb when smooth: level {page.evaluate('NEON.auto.level')}")
    # the climb was too much: back down, and no new climb for a minute
    page.evaluate(FEED, [2.0, slow])
    page.evaluate(FEED, [2.1, slow])
    held = page.evaluate("[NEON.auto.level, NEON.auto.hold > 50]")
    if held != [1, True]:
        notes.append(f"a climb that was too much gave {held}")
    # slow whatever is drawn: every step is tried once and given back, the picture ends where it started
    page.evaluate("Object.assign(NEON.auto, { level: 1, settle: 0, time: 0, frames: 0, calm: 0, hold: 0, trial: null, useless: {}, forget: 120 }); NEON.applySettings();")
    seen = []
    for _ in range(12):
        page.evaluate(FEED, [2.0, slow])
        seen.append(page.evaluate(FEED, [2.1, slow]))
    lowest = max(seen)
    floor = page.evaluate(ratio)
    if lowest != 4 or seen[-1] != 1:
        notes.append(f"a phone that stays slow walked {seen}")
    # really bought by drawing less: it goes down to the floor and stays; never under 1.5 pixels per point
    page.evaluate("Object.assign(NEON.auto, { level: 1, settle: 0, time: 0, frames: 0, calm: 0, hold: 0, trial: null, useless: {}, forget: 120 }); NEON.applySettings();")
    rates = [30, 34, 39, 39, 39, 39, 39, 39]
    walked = []
    for rate in rates:
        page.evaluate(FEED, [2.0, 1 / rate])
        walked.append(page.evaluate(FEED, [2.1, 1 / rate]))
    page.wait_for_timeout(300)
    floor = page.evaluate(ratio)
    if floor < 1.5 or max(walked) > 4:
        notes.append(f"dropped to {floor:.2f} pixels per point, rungs {walked}")
    # the player's own choice is kept: Fast picked on a phone stays Fast after a reload; 1.5 saves move to Auto once
    page.evaluate("NEON.auto.manual = false; NEON.pause();")
    page.evaluate("[...document.querySelectorAll('#pause .seg')].find(e => e.textContent === 'Fast').click()")
    page.reload()
    page.wait_for_function("window.NEON && NEON.state === 'title'")
    if page.evaluate("NEON.save.quality") != 0:
        notes.append("Fast picked on the phone did not survive a reload")
    page.evaluate("localStorage.setItem('neon-coast-save-v1', JSON.stringify({ money: 900, mission: 1, quality: 0 }))")
    page.reload()
    page.wait_for_function("window.NEON && NEON.state === 'title'")
    moved = page.evaluate("[NEON.save.quality, NEON.save.money]")
    if moved != [2, 900]:
        notes.append(f"a save from 1.5 was not moved to Auto: {moved}")
    context.close()
    return not notes, "shadows first, pixels last and never under 1.5 per point, steps given back, choice kept" if not notes else "; ".join(notes)


def run_words(browser):
    """Every text in the source that names a key must come out of say() naming a button."""
    context = browser.new_context(viewport={"width": 844, "height": 390}, is_mobile=True, has_touch=True)
    page = context.new_page()
    watch(page, "words")
    page.goto(GAME.as_uri())
    page.wait_for_function("window.NEON && NEON.state === 'title'")
    names_key = re.compile(r"\[(?:[A-Z]|Shift|Space)\]|[Pp]ress [A-Z]\b|W A S D|\bmouse\b|\b[A-Z] (?:gets off|closes|shows|ends)|^F: ")
    texts = set()
    for path in sorted((ROOT / "src").glob("*.js")):
        if path.name == "03b-touch.js":
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("//"):
                continue
            for quote in "'`\"":
                for text in re.findall(quote + r"((?:[^" + quote + r"\\]|\\.)*)" + quote, line):
                    if names_key.search(text):
                        texts.add(text)
    left = [t for t in sorted(texts) if names_key.search(page.evaluate("(t) => NEON.say(t)", t))]
    context.close()
    return not left and len(texts) >= 15, f"{len(texts)} texts name a key, {len(left)} still do on a phone" + ("".join("  | " + t for t in left[:4]))


def run_desktop(browser):
    """A mouse-and-keyboard page must look and behave as it did before."""
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    watch(page, "desktop")
    page.goto(GAME.as_uri())
    page.wait_for_function("window.NEON && NEON.state === 'title'")
    page.click("#btn-new")
    page.wait_for_timeout(600)
    facts = page.evaluate(
        """() => ({
            touch: NEON.touch.on,
            body: document.body.className,
            pad: getComputedStyle(document.getElementById('pad')).display,
            forTouch: [...document.querySelectorAll('.for-touch')].filter(e => e.getClientRects().length).length,
            quality: NEON.save.quality,
            lens: NEON.view.fov,
            said: NEON.say('Get into the red car ahead  [F]'),
            br: document.getElementById('br').parentElement.id,
            map: getComputedStyle(document.getElementById('map')).width,
            objective: getComputedStyle(document.getElementById('objective')).position,
            steering: [...document.querySelectorAll('.seg')].filter(e => e.textContent === 'Arrows').length,
            ratio: document.getElementById('view').width / document.getElementById('view').clientWidth,
        })"""
    )
    page.close()
    want = {"touch": False, "body": "", "pad": "none", "forTouch": 0, "quality": 1, "lens": 62,
            "said": "Get into the red car ahead  [F]", "br": "hud", "map": "196px", "objective": "absolute", "steering": 0, "ratio": 1}
    wrong = {k: facts[k] for k in want if facts[k] != want[k]}
    return not wrong, "unchanged" if not wrong else json.dumps(wrong)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def run_install(browser):
    """Served from a web address: the manifest and icons are found, and after one visit it loads with no network."""
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://localhost:{server.server_address[1]}/"
    context = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    page = context.new_page()
    watch(page, "install")
    notes = []
    try:
        page.goto(base + "NeonCoast.html")
        page.wait_for_function("window.NEON && NEON.state === 'title'")
        manifest_url = page.evaluate("(document.querySelector('link[rel=manifest]') || {}).href || ''")
        manifest = page.evaluate("(url) => fetch(url).then(r => r.json())", manifest_url) if manifest_url else {}
        sizes = page.evaluate(
            """(icons) => Promise.all(icons.map(src => new Promise(done => {
                const img = new Image();
                img.onload = () => done(img.naturalWidth + 'x' + img.naturalHeight);
                img.onerror = () => done('missing');
                img.src = src;
            })))""",
            [i["src"] for i in manifest.get("icons", [])] + ["icons/apple-touch-icon.png"],
        )
        expected = [i["sizes"] for i in manifest.get("icons", [])] + ["180x180"]
        if sizes != expected or len(sizes) < 4:
            notes.append(f"icons {sizes}")
        if manifest.get("start_url") != "./NeonCoast.html" or manifest.get("orientation") != "any":
            notes.append("manifest start or orientation")
        if not page.evaluate("document.getElementById('installnote').getClientRects().length > 0"):
            notes.append("no install note on the title screen")
        page.evaluate("navigator.serviceWorker.ready.then(() => true)")
        page.wait_for_function("navigator.serviceWorker.controller !== null", timeout=10000)
        page.wait_for_timeout(500)
        context.set_offline(True)
        server.shutdown()
        page.reload()
        page.wait_for_function("window.NEON && NEON.state === 'title'", timeout=15000)
        page.tap("#btn-new")
        page.wait_for_function("NEON.state === 'play'", timeout=5000)
    except Exception as error:  # noqa: BLE001 - reported as a failed check
        notes.append(str(error).splitlines()[0][:160])
    finally:
        context.close()
        server.shutdown()
    return not notes, "manifest, 4 icons, and a reload with the network off" if not notes else "; ".join(notes)


def run_webkit(pw):
    """Safari's engine, as an iPhone, both ways up: loads, starts, the buttons answer taps."""
    try:
        browser = pw.webkit.launch()
    except Exception as error:  # noqa: BLE001
        return None, "WebKit is not installed (playwright install webkit): " + str(error).splitlines()[0][:80]
    notes = []
    for name, device in [("upright", "iPhone 13"), ("landscape", "iPhone 13 landscape")]:
        context = browser.new_context(**pw.devices[device])
        page = context.new_page()
        watch(page, "webkit-" + name)
        try:
            page.goto(GAME.as_uri())
            page.wait_for_function("window.NEON && NEON.state === 'title'", timeout=20000)
            if not page.evaluate("NEON.touch.on"):
                notes.append(name + ": touch mode is off")
            page.tap("#btn-new")
            page.wait_for_function("NEON.state === 'play' && document.getElementById('pad').classList.contains('foot')", timeout=8000)
            holes = page.evaluate(SEE_THROUGH)
            if holes:
                notes.append(f"{name}: {holes} of 4096 points of the view are see-through")
            page.evaluate(BESIDE_CAR)
            page.wait_for_timeout(200)
            page.tap(".tb.on-foot[data-tap=KeyF]")
            page.wait_for_function("!!NEON.player.car && document.getElementById('pad').classList.contains('car')", timeout=5000)
            frames = 0
            for _ in range(5):                 # the first seconds compile shaders, and the machine may be busy
                page.wait_for_timeout(1500)
                frames = max(frames, page.evaluate("() => new Promise(done => { let n = 0; const t0 = performance.now(); const tick = () => { n++; performance.now() - t0 < 1500 ? requestAnimationFrame(tick) : done(n); }; requestAnimationFrame(tick); })"))
                if frames >= 10:
                    break
            if frames < 10:
                notes.append(f"{name}: only {frames} frames in 1.5 s")
            overlaps = page.evaluate(OVERLAPS)
            if overlaps:
                notes.append(name + ": " + ", ".join(overlaps))
            page.screenshot(path=str(SHOTS / f"touch-webkit-{name}.png"))
            page.evaluate("for (const id of ['hint', 'timer', 'perk']) document.getElementById(id).classList.remove('show')")
            page.tap("#map")
            page.wait_for_function("NEON.bigMap.open", timeout=3000)
            page.tap("#bigmap-canvas")
            page.wait_for_function("!NEON.bigMap.open", timeout=3000)
            page.tap(".tb.sys")
            page.wait_for_function("NEON.state === 'paused'", timeout=3000)
            page.tap("#btn-resume")
            page.wait_for_function("NEON.state === 'play'", timeout=3000)
        except Exception as error:  # noqa: BLE001
            notes.append(name + ": " + str(error).splitlines()[0][:160])
        context.close()
    browser.close()
    return not notes, "iPhone 13 upright and landscape" if not notes else "; ".join(notes)


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=not WINDOW, args=CHROME_ARGS + EXTRA_ARGS)
        for name, width, height in SCREENS:
            try:
                failed = play_on_phone(browser, name, width, height)
            except Exception as error:  # noqa: BLE001
                failed = [str(error).splitlines()[0][:200]]
            check(f"phone {name} {width}x{height}", not failed, "every control answers, nothing overlaps" if not failed else "; ".join(failed))
        check("auto graphics", *run_governor(browser))
        check("hints name buttons, not keys", *run_words(browser))
        check("desktop page unchanged", *run_desktop(browser))
        check("installs and plays offline", *run_install(browser))
        browser.close()
        ok, detail = run_webkit(pw)
        if ok is None:
            print("SKIP  Safari engine   " + detail)
        else:
            check("Safari engine (WebKit)", ok, detail)

    unique = sorted(set(problems))
    check("clean console", not unique, "no errors or warnings" if not unique else " | ".join(unique[:4]))
    passed = sum(1 for r in results.values() if r["ok"])
    print(f"TOUCH {passed}/{len(results)}")
    (ROOT / "test" / "touch-result.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
