"""Gate checker for Neon Coast (rubric v1, G1-G10). Run: python test/gates.py [--skip-smoke]"""
import json
import re
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "test" / "shots"
SHOTS.mkdir(parents=True, exist_ok=True)
GAME = ROOT / "NeonCoast.html"
if not GAME.exists():
    GAME = ROOT / "index.html"
URL = GAME.as_uri()

gates = {}
problems = []
outside_requests = []


def gate(name, ok, detail=""):
    gates[name] = {"ok": bool(ok), "detail": str(detail)}
    print(("PASS  " if ok else "FAIL  ") + name + "   " + str(detail))


def open_page(browser, width, height):
    page = browser.new_page(viewport={"width": width, "height": height})
    page.on("console", lambda m: problems.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))

    def route(request_route):
        url = request_route.request.url
        if url.startswith(("file:", "data:", "blob:")):
            request_route.continue_()
        else:
            outside_requests.append(url)
            request_route.abort()

    page.route("**/*", route)
    page.goto(URL)
    page.wait_for_timeout(2000)
    return page


TELEPORT = """([x, z]) => {
    const p = NEON.player;
    if (p.car) { const c = p.car; c.x = x; c.z = z; c.vx = 0; c.vz = 0; c.vf = 0; }
    else { p.x = x; p.z = z; }
}"""

ENTER_NEAREST = """(wantTarget) => {
    const n = NEON, p = n.player;
    if (p.car && (!wantTarget || p.car === n.mission.car)) return true;
    if (p.car) n.tryEnterExit();
    let car = wantTarget ? n.mission.car : null;
    if (!car) {
        let best = 1e9;
        for (const v of n.vehicles) {
            if (v.dead || v.driver) continue;
            const d = Math.hypot(v.x - p.x, v.z - p.z);
            if (d < best) { best = d; car = v; }
        }
    }
    if (!car) return false;
    p.x = car.x + 2.2; p.z = car.z;
    return false;
}"""


def run_jobs(page):
    """G4: start and pass every job; each must pay its listed reward."""
    page.evaluate("() => localStorage.clear()")
    page.reload()
    page.wait_for_timeout(2000)
    page.click("#btn-new")
    page.wait_for_timeout(1200)
    report = []
    total = page.evaluate("() => NEON.MISSIONS.length")
    for index in range(total):
        info = page.evaluate("() => ({ name: NEON.mission.def.name, reward: NEON.mission.def.reward, at: NEON.mission.def.at, money: NEON.save.money })")
        page.evaluate("() => { NEON.setWanted(0); NEON.player.hp = 100; if (NEON.player.car) NEON.player.car.hp = NEON.player.car.t.hp; }")
        page.evaluate(TELEPORT, info["at"])
        page.wait_for_timeout(500)
        started = page.evaluate("() => NEON.mission.active")
        for _ in range(60):
            step = page.evaluate(
                """() => {
                    const m = NEON.mission;
                    if (!m.active) return null;
                    const s = m.def.steps[m.step];
                    return { t: s.t, at: s.at || null, car: !!s.car, target: !!s.target };
                }"""
            )
            if step is None:
                break
            if step["t"] == "car" or (step["t"] == "goto" and step["car"]):
                seated = page.evaluate(ENTER_NEAREST, step["target"])
                if not seated:
                    page.wait_for_timeout(150)
                    page.evaluate("() => { if (!NEON.player.car) NEON.tryEnterExit(); }")
                    page.wait_for_timeout(250)
            if step["t"] == "goto":
                page.evaluate(TELEPORT, step["at"])
            if step["t"] == "lose":
                page.evaluate("() => NEON.setWanted(0)")
            page.wait_for_timeout(300)
        after = page.evaluate("() => ({ done: NEON.save.mission, money: NEON.save.money, active: NEON.mission.active })")
        paid = after["money"] - info["money"]
        ok = started and not after["active"] and after["done"] == index + 1 and paid == info["reward"]
        report.append(f"{info['name']} {'ok' if ok else 'FAILED'} (+${paid} of ${info['reward']})")
        if not ok:
            return False, report
    return True, report


def run_bust(page):
    """G5: a patrol car stopped next to a standing player arrests them."""
    page.evaluate("() => { if (NEON.player.car) NEON.tryEnterExit(); }")
    page.wait_for_timeout(400)
    police = page.evaluate("() => NEON.PLACES.police")
    page.evaluate("() => { NEON.player.hp = 100; NEON.setWanted(1); }")
    cop_seen = False
    for _ in range(60):
        cop_seen = page.evaluate(
            """() => {
                const p = NEON.player;
                p.hp = 100;
                const cop = NEON.vehicles.find(v => v.driver === 'cop' && !v.dead);
                if (!cop) return false;
                cop.x = p.x + 4.5; cop.z = p.z; cop.vx = 0; cop.vz = 0; cop.vf = 0;
                return true;
            }"""
        ) or cop_seen
        page.wait_for_timeout(150)
        if page.evaluate("() => NEON.state") == "dead":
            break
    banner = page.evaluate("() => document.querySelector('#banner b').textContent")
    page.screenshot(path=str(SHOTS / "gate-busted.png"))
    page.wait_for_timeout(4300)
    after = page.evaluate("() => ({ state: NEON.state, x: NEON.player.x, z: NEON.player.z, stars: NEON.wanted.stars })")
    near = ((after["x"] - police[0]) ** 2 + (after["z"] - police[1]) ** 2) ** 0.5 < 6
    ok = cop_seen and banner == "BUSTED" and after["state"] == "play" and near and after["stars"] == 0
    return ok, f"patrol car arrived: {cop_seen}, banner '{banner}', back in play at the station: {near}"


def run_mouse_look(page):
    """G6: with the pointer captured, moving the mouse turns the camera."""
    page.mouse.click(640, 360)
    page.wait_for_timeout(500)
    if page.evaluate("() => NEON.state") == "paused":
        page.click("#btn-resume")
        page.wait_for_timeout(500)
    locked = page.evaluate("() => document.pointerLockElement === document.getElementById('view')")
    before = page.evaluate("() => ({ yaw: NEON.cam.yaw, pitch: NEON.cam.pitch })")
    page.mouse.move(640, 360)
    for step in range(1, 11):
        page.mouse.move(640 + step * 20, 360 - step * 4)
        page.wait_for_timeout(30)
    after = page.evaluate("() => ({ yaw: NEON.cam.yaw, pitch: NEON.cam.pitch, state: NEON.state })")
    turned = abs(after["yaw"] - before["yaw"]) > 0.05
    return locked and turned, f"pointer captured: {locked}, yaw {before['yaw']:.2f} -> {after['yaw']:.2f}, pitch {before['pitch']:.2f} -> {after['pitch']:.2f}"


def run_clear_start(page):
    """G10: nothing but the player and the ground within 14 m in the middle of the first view."""
    page.evaluate("() => localStorage.clear()")
    page.reload()
    page.wait_for_timeout(2000)
    page.click("#btn-new")
    page.wait_for_timeout(1200)
    page.screenshot(path=str(SHOTS / "gate-start-view.png"))
    blockers = page.evaluate(
        """() => {
            const { scene, camera, player } = NEON;
            const caster = new THREE.Raycaster();
            caster.far = 14;
            const own = new Set();
            player.mesh.traverse(o => own.add(o));
            const found = {};
            for (let ix = -4; ix <= 4; ix++) {
                for (let iy = -4; iy <= 4; iy++) {
                    caster.setFromCamera({ x: ix * 0.1, y: iy * 0.1 }, camera);
                    for (const hit of caster.intersectObjects(scene.children, true)) {
                        if (own.has(hit.object) || hit.point.y < 0.35) continue;
                        if (hit.object.isPoints || hit.object.isLine || !hit.object.visible) continue;
                        const g = hit.object.geometry;
                        const label = (hit.object.isInstancedMesh ? 'instanced ' : '') + g.type + ' at ' + hit.distance.toFixed(1) + ' m';
                        found[g.uuid] = label;
                        break;
                    }
                }
            }
            return Object.values(found);
        }"""
    )
    return not blockers, "clear" if not blockers else "blocked by: " + "; ".join(blockers[:4])


def run_hud_overlap(browser):
    """G8: HUD boxes must not overlap while everything is shown at once."""
    worst = []
    for width, height in [(1024, 640), (1280, 720), (1920, 1080)]:
        page = open_page(browser, width, height)
        page.click("#btn-new")
        page.wait_for_timeout(1000)
        page.evaluate(ENTER_NEAREST, False)
        page.wait_for_timeout(150)
        page.evaluate("() => { if (!NEON.player.car) NEON.tryEnterExit(); }")
        page.wait_for_timeout(600)
        overlaps = page.evaluate(
            """() => {
                const show = (id, text) => { const e = document.getElementById(id); if (text) e.textContent = text; e.classList.add('show'); };
                show('hint', 'Follow the yellow J on the map for your first job.  F gets you into a car.');
                show('objective', 'Deliver it to Rustport before time runs out');
                show('timer', '1:20');
                show('radio', 'RADIO  SUNSET DRIVE FM');
                show('veh', 'Patrol Cruiser');
                show('zone', 'Meridian');
                show('drive');
                if (document.getElementById('way')) { document.getElementById('way-dist').textContent = 'JOB  1250 m'; show('way'); }
                const ids = ['tr', 'map', 'drive', 'objective', 'timer', 'hint', 'br'].concat(document.getElementById('way') ? ['way'] : []);
                const rects = ids.map(id => [id, document.getElementById(id).getBoundingClientRect()]);
                const out = [];
                for (let a = 0; a < rects.length; a++) for (let b = a + 1; b < rects.length; b++) {
                    const [ia, ra] = rects[a], [ib, rb] = rects[b];
                    const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
                    const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
                    if (w > 1 && h > 1) out.push(ia + ' x ' + ib);
                }
                for (const [id, r] of rects) if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) out.push(id + ' off screen');
                return out;
            }"""
        )
        page.screenshot(path=str(SHOTS / f"gate-hud-{width}.png"))
        if overlaps:
            worst.append(f"{width}x{height}: " + ", ".join(overlaps))
        page.close()
    return not worst, "no overlaps at 3 sizes" if not worst else " | ".join(worst)


def run_names():
    """G9: no borrowed names outside the one disclaimer line."""
    banned = re.compile(r"GTA|Grand Theft|Rockstar|Vice City|Los Santos|San Andreas|Liberty City|Trevor Philips|Leonida", re.I)
    hits = []
    sources = sorted((ROOT / "src").glob("*.js")) + [ROOT / "src" / "template.html"]
    if not (ROOT / "src").exists():
        sources = [GAME]
    for path in sources:
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if len(line) > 2000 or "ot affiliated" in line:
                continue
            if banned.search(line):
                hits.append(f"{path.name}:{number}")
    return not hits, "own names only" if not hits else "found in " + ", ".join(hits[:6])


def main():
    if "--skip-smoke" not in sys.argv:
        smoke = subprocess.run([sys.executable, str(ROOT / "test" / "smoke.py")], capture_output=True, text=True)
        passed = smoke.stdout.count("PASS  ")
        failed = [line for line in smoke.stdout.splitlines() if line.startswith("FAIL")]
        gate("G3 core loop", smoke.returncode == 0, f"{passed} checks pass" if not failed else "; ".join(failed)[:300])

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            channel="chrome",
            headless=True,
            args=["--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
        )
        page = open_page(browser, 1280, 720)

        ok, detail = run_clear_start(page)
        gate("G10 clear first view", ok, detail)

        ok, detail = run_mouse_look(page)
        gate("G6 mouse look", ok, detail)

        fps = page.evaluate(
            """() => new Promise(done => {
                let frames = 0; const t0 = performance.now();
                const tick = () => { frames++; performance.now() - t0 < 3000 ? requestAnimationFrame(tick) : done(frames / 3); };
                requestAnimationFrame(tick);
            })"""
        )
        pretty = page.evaluate("() => NEON.save.quality === 1 && NEON.state === 'play'")
        gate("G7 frame rate", pretty and fps >= 60, f"{fps:.0f} fps at 1280x720, Pretty, in play: {pretty}")

        ok, report = run_jobs(page)
        gate("G4 all jobs", ok, "; ".join(report))

        ok, detail = run_bust(page)
        gate("G5 busted", ok, detail)
        page.close()

        ok, detail = run_hud_overlap(browser)
        gate("G8 HUD overlap", ok, detail)
        browser.close()

    ok, detail = run_names()
    gate("G9 own names", ok, detail)
    unique = sorted(set(problems))
    gate("G2 clean console", not unique, "no errors or warnings" if not unique else " | ".join(unique[:4]))
    gate("G1 offline single file", not outside_requests, "0 outside requests" if not outside_requests else ", ".join(sorted(set(outside_requests))[:4]))

    passed = sum(1 for g in gates.values() if g["ok"])
    print(f"GATES {passed}/{len(gates)}")
    (ROOT / "test" / "gates-result.json").write_text(json.dumps({"gates": gates, "passed": passed, "total": len(gates), "fps": fps}, indent=2))
    sys.exit(0 if passed == len(gates) else 1)


main()
