"""Frame rate of two builds measured in turn on the same machine: python test/fps_ab.py NEW.html OLD.html"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

MEASURE = """() => new Promise(done => {
    let frames = 0; const t0 = performance.now();
    const tick = () => { frames++; performance.now() - t0 < 3000 ? requestAnimationFrame(tick) : done(frames / 3); };
    requestAnimationFrame(tick);
})"""

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome", headless=True, args=[
        "--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    for round_number in range(2):
        for label, target in (("new", sys.argv[1]), ("live-1.1", sys.argv[2])):
            page = browser.new_page(viewport={"width": 1280, "height": 720})
            page.goto(Path(target).resolve().as_uri())
            page.wait_for_timeout(1200)
            page.click("#btn-new")
            page.wait_for_timeout(1500)
            fps = page.evaluate(MEASURE)
            renderer = page.evaluate("() => { const c = document.createElement('canvas').getContext('webgl'); const e = c.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; }")
            print(f"{label}: {fps:.0f} fps  [{renderer}]", flush=True)
            page.close()
    browser.close()
