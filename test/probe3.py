"""Not for main. What 2.0 costs to draw next to 1.9, counted in a way that does not depend on this computer
(objects and triangles in the scene), and measured with the processor slowed 4 and 6 times.

    python test/probe3.py NEW.html V20.html V19.html
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ARGS = ["--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
        "--disable-gpu-vsync", "--disable-frame-rate-limit"]

SCENE = """() => { const n = NEON; let meshes = 0, instanced = 0, instances = 0, triangles = 0, shown = 0;
    n.scene.traverse(o => { if (!o.isMesh) return; meshes++;
        const g = o.geometry, count = g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0);
        const copies = o.isInstancedMesh ? o.count : 1;
        if (o.isInstancedMesh) { instanced++; instances += o.count; }
        let visible = true; for (let p = o; p; p = p.parent) if (!p.visible) visible = false;
        if (visible) { shown++; triangles += count / 3 * copies; } });
    return { meshes, shown, instanced, instances, triangles: Math.round(triangles), props: n.props ? n.props.length : 0 }; }"""

MEASURE = """(seconds) => new Promise(done => {
    let frames = 0, last = performance.now(); const t0 = last, clock0 = NEON.clock, times = [];
    const tick = () => { const now = performance.now(); times.push(now - last); last = now; frames++;
        if (now - t0 < seconds * 1000) return requestAnimationFrame(tick);
        times.sort((a, b) => a - b);
        done({ fps: frames / seconds, median: times[times.length >> 1], p95: times[Math.floor(times.length * 0.95)],
               game: (NEON.clock - clock0) / seconds, steps: NEON.pace ? NEON.pace.steps : 0, sim: NEON.pace ? NEON.pace.simMs : 0 }); };
    requestAnimationFrame(tick); })"""

DRIVE = """() => { const n = NEON, p = n.player;
    const car = n.vehicles.filter(v => !v.driver && !v.dead && v.type !== 'police')
      .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    p.x = car.x + 2.2; p.z = car.z; n.tryEnterExit(); if (n.snapLane) n.snapLane(car);
    const fx = Math.sin(car.h), fz = Math.cos(car.h);
    const hold = () => { car.vx = fx * 25; car.vz = fz * 25; car.hp = car.t.hp; requestAnimationFrame(hold); };
    requestAnimationFrame(hold); }"""

builds = [(Path(a).stem, a) for a in sys.argv[1:]]
with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome", headless=True, args=ARGS)
    for label, target in builds:
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.goto(Path(target).resolve().as_uri())
        page.wait_for_timeout(1200)
        page.click("#btn-new")
        page.wait_for_timeout(1500)
        page.evaluate("() => { NEON.save.quality = 1; NEON.applySettings(); }")
        page.wait_for_timeout(500)
        print(f"SCENE {label} Pretty {page.evaluate(SCENE)}", flush=True)
        page.close()
    # frame times: three rounds, the builds in turn, so a busy minute on this computer hits them all
    for rate in (1, 4, 6):
        for round_no in range(3):
            for label, target in builds:
                for quality, word in ((1, "Pretty"), (0, "Fast")):
                    page = browser.new_page(viewport={"width": 1280, "height": 720})
                    page.goto(Path(target).resolve().as_uri())
                    page.wait_for_timeout(1000)
                    page.click("#btn-new")
                    page.wait_for_timeout(1200)
                    page.evaluate("(q) => { NEON.save.quality = q; NEON.applySettings(); }", quality)
                    page.evaluate(DRIVE)
                    session = page.context.new_cdp_session(page)
                    session.send("Emulation.setCPUThrottlingRate", {"rate": rate})
                    page.wait_for_timeout(1500)
                    got = page.evaluate(MEASURE, 5)
                    print(f"COST cpu/{rate} round {round_no} {label} {word} driving at 25 m/s: {got['fps']:.1f} fps, median frame {got['median']:.1f} ms, "
                          f"95% under {got['p95']:.1f} ms, game at {got['game']:.2f} of real time, {got['steps']} step(s), sim {got['sim']:.2f} ms", flush=True)
                    page.close()
    browser.close()
