"""Which graphics does this computer give Chrome, and how fast does it draw the game with each?

    python test/probe.py NEW.html OLD.html
"""
import platform
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

MEASURE = """(seconds) => new Promise(done => {
    let frames = 0, worst = 0, last = performance.now(); const t0 = last, clock0 = NEON.clock;
    const tick = () => {
        const now = performance.now(); worst = Math.max(worst, now - last); last = now; frames++;
        now - t0 < seconds * 1000 ? requestAnimationFrame(tick)
            : done({ fps: frames / seconds, worst, game: (NEON.clock - clock0) / seconds });
    };
    requestAnimationFrame(tick);
})"""
RENDERER = """() => { const c = document.createElement('canvas').getContext('webgl');
    const e = c && c.getExtension('WEBGL_debug_renderer_info');
    return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; }"""

BASE = ["--autoplay-policy=no-user-gesture-required"]
SUITE_ARGS = ["--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
NO_CAP = ["--disable-gpu-vsync", "--disable-frame-rate-limit"]
system = platform.system()
if system == "Darwin":
    SETS = {
        "window": (False, SUITE_ARGS),
        "window, no frame cap": (False, SUITE_ARGS + NO_CAP),
        "window, no frame cap, again": (False, SUITE_ARGS + NO_CAP),
        "no window, no frame cap": (True, SUITE_ARGS + NO_CAP),
    }
else:
    SETS = {"no window": (True, SUITE_ARGS)}

print(f"{system} {platform.machine()} {platform.version()}", flush=True)
with sync_playwright() as pw:
    for name, (headless, extra) in SETS.items():
        try:
            browser = pw.chromium.launch(channel="chrome", headless=headless, args=BASE + extra)
        except Exception as error:
            print(f"{name}: did not start: {str(error)[:200]}", flush=True)
            continue
        try:
            for label, target in [(Path(argument).stem, argument) for argument in sys.argv[1:]]:
                page = browser.new_page(viewport={"width": 1280, "height": 720})
                page.goto(Path(target).resolve().as_uri())
                page.wait_for_timeout(1200)
                page.click("#btn-new")
                page.wait_for_timeout(1500)
                renderer = page.evaluate(RENDERER)
                line = [f"{name} | {label} | {renderer}"]
                for quality, word in ((1, "Pretty"), (0, "Fast")):
                    page.evaluate("(q) => { NEON.save.quality = q; NEON.applySettings(); }", quality)
                    page.wait_for_timeout(700)
                    got = page.evaluate(MEASURE, 5)
                    pace = page.evaluate("() => NEON.pace ? `, ${NEON.pace.steps} step(s) a frame, ${NEON.pace.simMs.toFixed(2)} ms in them` : ''")
                    line.append(f"{word} {got['fps']:.1f} fps, worst frame {got['worst']:.0f} ms, game runs at {got['game']:.2f} of real time{pace}")
                # the same at speed down a street, where the kerbs are full: the car is held at 30 m/s
                page.evaluate("() => { NEON.save.quality = 1; NEON.applySettings(); }")
                drive = page.evaluate("""(seconds) => new Promise(done => { const n = NEON, p = n.player;
                    const car = n.vehicles.filter(v => !v.driver && !v.dead && v.type !== 'police')
                      .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
                    p.x = car.x + 2.2; p.z = car.z; n.tryEnterExit();
                    if (n.snapLane) n.snapLane(car);
                    let frames = 0; const t0 = performance.now(); const fx = Math.sin(car.h), fz = Math.cos(car.h);
                    const tick = () => { frames++; car.vx = fx * 30; car.vz = fz * 30; car.hp = car.t.hp;
                        performance.now() - t0 < seconds * 1000 ? requestAnimationFrame(tick) : done(frames / seconds); };
                    requestAnimationFrame(tick); })""", 5)
                line.append(f"Pretty at 30 m/s down the street {drive:.1f} fps")
                print(" | ".join(line), flush=True)
                page.close()
        except Exception as error:
            print(f"{name}: failed: {str(error)[:300]}", flush=True)
        browser.close()
