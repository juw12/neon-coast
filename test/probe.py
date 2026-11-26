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
SETS = {
    "as the suites start it": (True, ["--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]),
    "gpu asked for": (True, ["--ignore-gpu-blocklist", "--enable-gpu"]),
    "with a window": (False, ["--ignore-gpu-blocklist"]),
}
system = platform.system()
if system == "Darwin":
    SETS["metal"] = (True, ["--ignore-gpu-blocklist", "--enable-gpu", "--use-angle=metal"])
    SETS["metal with a window"] = (False, ["--ignore-gpu-blocklist", "--use-angle=metal"])
elif system == "Windows":
    SETS["d3d11"] = (True, ["--ignore-gpu-blocklist", "--enable-gpu", "--use-angle=d3d11"])
    SETS["d3d11 warp"] = (True, ["--ignore-gpu-blocklist", "--enable-gpu", "--use-angle=d3d11-warp"])
else:
    SETS["gl egl"] = (True, ["--ignore-gpu-blocklist", "--enable-gpu", "--use-gl=angle", "--use-angle=gl-egl"])
    SETS["vulkan swiftshader"] = (True, ["--ignore-gpu-blocklist", "--use-angle=swiftshader"])

print(f"{system} {platform.machine()} {platform.version()}", flush=True)
with sync_playwright() as pw:
    for name, (headless, extra) in SETS.items():
        try:
            browser = pw.chromium.launch(channel="chrome", headless=headless, args=BASE + extra)
        except Exception as error:
            print(f"{name}: did not start: {str(error)[:200]}", flush=True)
            continue
        try:
            for label, target in (("new", sys.argv[1]), ("old", sys.argv[2])):
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
                    got = page.evaluate(MEASURE, 4)
                    line.append(f"{word} {got['fps']:.1f} fps, worst frame {got['worst']:.0f} ms, game runs at {got['game']:.2f} of real time")
                print(" | ".join(line), flush=True)
                page.close()
        except Exception as error:
            print(f"{name}: failed: {str(error)[:300]}", flush=True)
        browser.close()
