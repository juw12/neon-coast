"""City systems check for version 1.2: cab fares, property, perks, helicopter, route, big map, old saves.

State is set through the game's test handle (window.NEON) so each rule can be
checked in seconds. It proves the rules work; it does not prove they are fun.
Real key input is covered separately by test/drive.py.

    python test/city.py             # prints one line per check, exit code 0 when all pass
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS  " if ok else "FAIL  ") + name + (("  |  " + str(detail)) if detail else ""))


def run():
    problems = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=True, args=[
            "--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        page = context.new_page()
        page.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))
        page.on("console", lambda m: problems.append(f"{m.type}: {m.text}") if m.type == "error" else None)
        url = (ROOT / "NeonCoast.html").as_uri()

        # 1. a save written by version 1.1 (no fares, no property) still loads
        page.goto(url)
        page.wait_for_timeout(800)
        page.evaluate("() => NEON.persist()")
        key = page.evaluate("() => Object.keys(localStorage).find(k => /neon/i.test(k)) || null")
        old_save = {"money": 1234, "mission": 2, "packages": [1, 4], "tune": 1, "ferryRuns": 1, "ferryBest": 77}
        if key:
            page.evaluate("([k, v]) => localStorage.setItem(k, JSON.stringify(v))", [key, old_save])
            page.reload()
            page.wait_for_timeout(1000)
            loaded = page.evaluate("() => JSON.parse(JSON.stringify(NEON.save))")
            check("old save loads with new fields", loaded.get("money") == 1234 and loaded.get("mission") == 2
                  and loaded.get("fares") == 0 and loaded.get("props") == {} and len(loaded.get("packages", [])) == 2,
                  json.dumps(loaded))
        else:
            check("old save loads with new fields", False, "no save key found in localStorage")

        page.click("#btn-new")
        page.wait_for_timeout(1000)
        fresh = page.evaluate("() => JSON.parse(JSON.stringify(NEON.save))")
        check("new game starts clean", fresh["money"] == 200 and fresh["fares"] == 0 and fresh["props"] == {} and fresh["mission"] == 0, json.dumps(fresh))

        # 2. route to the job beam follows the street grid
        route = page.evaluate("() => ({ points: NEON.route.points, length: NEON.route.length, blip: NEON.mission.blip, at: [NEON.player.x, NEON.player.z] })")
        axis_aligned = all(abs(a[0] - b[0]) < 0.6 or abs(a[1] - b[1]) < 0.6 for a, b in zip(route["points"][1:-1], route["points"][2:-1]))
        ends_at_target = bool(route["points"]) and abs(route["points"][-1][0] - route["blip"][0]) < 0.1 and abs(route["points"][-1][1] - route["blip"][1]) < 0.1
        check("route follows streets to the target", len(route["points"]) >= 2 and axis_aligned and ends_at_target and route["length"] > 50,
              f"{len(route['points'])} points, {round(route['length'])} m")

        # 3. the whole map opens and closes on M
        page.keyboard.press("m")
        page.wait_for_timeout(300)
        opened = page.evaluate("() => NEON.bigMap.open && getComputedStyle(document.getElementById('bigmap')).display !== 'none'")
        page.keyboard.press("m")
        page.wait_for_timeout(200)
        closed = page.evaluate("() => !NEON.bigMap.open && getComputedStyle(document.getElementById('bigmap')).display === 'none'")
        check("whole map opens and closes on M", opened and closed)

        # 4. cab fares: T outside a cab is refused, a full fare pays, the next one is offered
        page.keyboard.press("t")
        page.wait_for_timeout(200)
        check("T without a cab is refused", page.evaluate("() => !NEON.cab.on && !NEON.mission.active"))
        page.evaluate("""() => { const n = NEON, p = n.player; const cab = n.vehicles.find(v => v.type === 'taxi' && !v.dead);
            cab.vx = cab.vz = 0; p.x = cab.x + 2.2; p.z = cab.z; n.tryEnterExit(); }""")
        page.wait_for_timeout(400)
        page.keyboard.press("t")
        page.wait_for_timeout(600)
        on_duty = page.evaluate("() => NEON.cab.on && NEON.mission.active && NEON.mission.def.cab === true && !!NEON.cab.passenger")
        check("T in a City Cab starts a fare with a waiting passenger", on_duty)
        before = page.evaluate("() => NEON.save.money")
        fare = page.evaluate("() => ({ reward: NEON.mission.def.reward, metres: NEON.mission.def.metres })")
        for step in (0, 1):
            page.evaluate("""(step) => { const n = NEON, c = n.player.car, at = n.mission.def.steps[step].at; c.x = at[0]; c.z = at[1]; c.vx = c.vz = 0; }""", step)
            page.wait_for_timeout(1300)
        paid = page.evaluate("() => ({ money: NEON.save.money, fares: NEON.save.fares, streak: NEON.cab.streak, best: NEON.save.fareBest })")
        gain = paid["money"] - before
        check("a finished fare pays the fare plus a tip of at most half", paid["fares"] == 1 and fare["reward"] <= gain <= fare["reward"] * 1.5 + 1,
              f"fare ${fare['reward']} for {round(fare['metres'])} m, paid ${gain}")
        page.wait_for_timeout(3800)
        check("the next fare is offered and the streak counts", page.evaluate("() => NEON.mission.active && NEON.mission.def.cab === true && NEON.cab.streak === 1"))
        page.keyboard.press("t")
        page.wait_for_timeout(300)
        check("T again ends the shift", page.evaluate("() => !NEON.cab.on && !(NEON.mission.active && NEON.mission.def.cab)"))

        # 5. helicopter: arrives at four stars, leaves when the stars go
        page.evaluate("() => NEON.setWanted(4)")
        page.wait_for_timeout(9000)
        heli = page.evaluate("() => ({ on: NEON.heli.on, y: NEON.heli.y, d: Math.hypot(NEON.heli.x - NEON.player.car.x, NEON.heli.z - NEON.player.car.z) })")
        check("helicopter joins at four stars and closes in", heli["on"] and heli["d"] < 120, f"{round(heli['d'])} m away at {round(heli['y'])} m up")
        page.evaluate("() => NEON.setWanted(0)")
        page.wait_for_timeout(8500)
        check("helicopter leaves when the stars go", page.evaluate("() => !NEON.heli.on && !NEON.heli.mesh.visible"))

        # 6. property: refused without the money, E buys on foot, rent builds up and is collected
        page.evaluate("""() => { const n = NEON, p = n.player; if (p.car) { p.car.vx = p.car.vz = 0; n.tryEnterExit(); }
            const at = n.PROPERTIES[0].at; n.addMoney(-n.save.money + 500); p.x = at[0]; p.z = at[1]; }""")
        page.wait_for_timeout(500)
        page.keyboard.press("e")
        page.wait_for_timeout(300)
        check("property is refused when you cannot pay", page.evaluate("() => NEON.save.props.bungalow === undefined && NEON.save.money === 500"))
        page.evaluate("() => NEON.addMoney(2000)")
        page.keyboard.press("e")
        page.wait_for_timeout(400)
        check("E buys the property on foot", page.evaluate("() => NEON.save.props.bungalow !== undefined && NEON.save.money === 500"))
        # one game hour passes in a real minute: wait, step out, step back in
        page.evaluate("() => { NEON.player.x += 12; }")
        page.wait_for_timeout(6000)
        page.evaluate("() => { NEON.player.hp = 40; const at = NEON.PROPERTIES[0].at; NEON.player.x = at[0]; NEON.player.z = at[1]; }")
        page.wait_for_timeout(500)
        rent = page.evaluate("() => ({ money: NEON.save.money, hp: NEON.player.hp })")
        check("rent builds up and walking back in collects it and heals", 505 <= rent["money"] <= 530 and rent["hp"] == 100, json.dumps(rent))

        # 7. perks follow the save
        perks = page.evaluate("""() => { const n = NEON; const before = n.PERKS.map(p => n.perk(p.id));
            n.save.packages = [0, 1, 2, 3, 4]; n.save.fares = 10; const after = n.PERKS.map(p => n.perk(p.id)); return { before, after }; }""")
        check("perks unlock from packages and fares", perks["before"] == [False, False, False, False] and perks["after"] == [True, False, True, False], json.dumps(perks))

        # 8. the pause screen lists them and nothing spills off a 720p screen
        page.keyboard.press("p")
        page.wait_for_timeout(400)
        layout = page.evaluate("""() => { const panel = document.querySelector('#pause .panel'); const rows = document.querySelectorAll('#perks b').length;
            return { rows, fits: panel.scrollHeight <= panel.clientHeight + 1, got: document.querySelectorAll('#perks b.got').length }; }""")
        check("pause screen shows four perks without scrolling", layout["rows"] == 4 and layout["fits"] and layout["got"] == 2, json.dumps(layout))

        # 9. the purchase survives a reload
        page.evaluate("() => NEON.persist()")
        page.reload()
        page.wait_for_timeout(1000)
        kept = page.evaluate("() => ({ props: Object.keys(NEON.save.props), fares: NEON.save.fares })")
        title_fits = page.evaluate("() => { const p = document.querySelector('#title .panel'); return p.scrollHeight <= p.clientHeight + 1; }")
        check("property and fares survive a reload", kept["props"] == ["bungalow"] and kept["fares"] == 10, json.dumps(kept))
        check("title screen fits a 720p screen without scrolling", title_fits)
        check("no console errors", not problems, "; ".join(problems[:3]))
        browser.close()


if __name__ == "__main__":
    run()
    failed = [name for name, ok, _ in results if not ok]
    print(f"\n{len(results) - len(failed)} / {len(results)} checks passed")
    sys.exit(1 if failed else 0)
