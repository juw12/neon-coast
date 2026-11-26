"""City systems check: cab fares, property, perks, helicopter, route, big map, old saves (version 1.2),
and police heat reaching fares, shops and your own front door, the Sol Wheel ride and the perk card (1.3),
the learner phase, the J key, the Paper Round on foot and the building outlines (1.4),
the near first job beam, the on-foot rule at the beam, the Shadow Run tail job, the head start on a stolen
car and the respray route while losing heat (1.7).

State is set through the game's test handle (window.NEON) so each rule can be
checked in seconds. It proves the rules work; it does not prove they are fun.
Real key input is covered separately by test/drive.py.

    python test/city.py             # prints one line per check, exit code 0 when all pass
"""
import os
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

# NEON_WINDOW=1 opens a real window instead of a headless browser (a GitHub Mac uses its graphics card in both).
# NEON_CHROME_ARGS adds flags (the frame-rate gate runs without the 60 Hz cap of the display).
WINDOW = os.environ.get("NEON_WINDOW") == "1"
EXTRA_ARGS = os.environ.get("NEON_CHROME_ARGS", "").split()

ROOT = Path(__file__).resolve().parent.parent
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS  " if ok else "FAIL  ") + name + (("  |  " + str(detail)) if detail else ""))


def run():
    problems = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=not WINDOW, args=[
            "--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] + EXTRA_ARGS)
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
        check("route follows streets to the job beam", len(route["points"]) >= 2 and axis_aligned and ends_at_target,
              f"{len(route['points'])} points, {round(route['length'])} m")
        # 2b. (1.7) the first job beam stands in the first view: 30 to 45 m from the start spot, and ahead of the player
        first = page.evaluate("""() => { const n = NEON, p = n.player, b = n.mission.blip, dx = b[0] - p.x, dz = b[1] - p.z;
            const gap = Math.hypot(dx, dz);
            return { gap, ahead: (Math.sin(n.cam.yaw) * dx + Math.cos(n.cam.yaw) * dz) / gap, name: n.mission.offer.name }; }""")
        check("the first job beam is 30 to 45 m ahead of the start spot", first["name"] == "First Wheels" and 30 <= first["gap"] <= 45 and first["ahead"] > 0.9,
              f"{round(first['gap'])} m, {round(first['ahead'], 2)} of straight ahead")

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
        # the long route (this was the job-beam check until 1.7 moved that beam next to the start spot)
        page.wait_for_timeout(500)
        route = page.evaluate("() => ({ points: NEON.route.points, length: NEON.route.length, blip: NEON.mission.blip })")
        axis_aligned = all(abs(a[0] - b[0]) < 0.6 or abs(a[1] - b[1]) < 0.6 for a, b in zip(route["points"][1:-1], route["points"][2:-1]))
        ends_at_target = bool(route["points"]) and abs(route["points"][-1][0] - route["blip"][0]) < 0.1 and abs(route["points"][-1][1] - route["blip"][1]) < 0.1
        check("route follows streets to a far target", len(route["points"]) >= 2 and axis_aligned and ends_at_target and route["length"] > 50,
              f"{len(route['points'])} points, {round(route['length'])} m")
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

        # 4b. learning to drive: no wreck before the first job is done, a normal wreck after it
        learner = page.evaluate("""() => { const n = NEON, c = n.player.car, full = c.hp, done = n.save.mission;
            n.damageVehicle(c, 5000); const before = c.hp; c.hp = full;
            n.save.mission = 1; n.damageVehicle(c, 5000); const after = c.hp;
            n.save.mission = done; c.hp = full;
            return { done, before, after }; }""")
        check("your car cannot be wrecked until the first job is done, and can be after",
              learner["done"] == 0 and learner["before"] > 0 and learner["after"] <= 0, json.dumps(learner))

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

        # 6b. version 1.3: your own front door hides you from two stars, not from three
        def step_out_and_in():
            page.evaluate("() => { NEON.player.x += 12; }")
            page.wait_for_timeout(350)
            page.evaluate("() => { const at = NEON.PROPERTIES[0].at; NEON.player.x = at[0]; NEON.player.z = at[1]; }")
            page.wait_for_timeout(450)

        page.evaluate("() => NEON.setWanted(2)")
        step_out_and_in()
        check("your own property hides you from two stars", page.evaluate("() => NEON.wanted.stars") == 0)
        page.evaluate("() => NEON.setWanted(3)")
        step_out_and_in()
        check("three stars are too many to hide at home", page.evaluate("() => NEON.wanted.stars") == 3)
        page.evaluate("() => NEON.setWanted(0)")

        # 6c. the Sol Wheel: no ride with stars; a ride costs $25, marks three packages, F ends it
        page.evaluate("""() => { const n = NEON, p = n.player, m = n.markers.find(k => k.kind === 'wheel');
            n.addMoney(-n.save.money + 100); n.setWanted(1); p.x = m.x; p.z = m.z; }""")
        page.wait_for_timeout(450)
        page.keyboard.press("e")
        page.wait_for_timeout(300)
        check("no Sol Wheel ride while wanted", page.evaluate("() => NEON.ride.t === 0 && NEON.save.money === 100"))
        page.evaluate("() => NEON.setWanted(0)")
        page.wait_for_timeout(200)
        page.keyboard.press("e")
        page.wait_for_timeout(700)
        riding = page.evaluate("""() => ({ t: NEON.ride.t, money: NEON.save.money, spotted: NEON.save.spotted.length,
            hidden: !NEON.player.mesh.visible })""")
        check("a ride costs $25 and marks the three nearest packages on the map",
              riding["t"] > 0 and riding["money"] == 75 and riding["spotted"] == 3 and riding["hidden"], json.dumps(riding))
        page.evaluate("() => { NEON.player.hp = 55; }")
        page.keyboard.press("f")
        page.wait_for_timeout(400)
        after_ride = page.evaluate("() => ({ t: NEON.ride.t, hp: NEON.player.hp, visible: NEON.player.mesh.visible, car: !!NEON.player.car })")
        check("F ends the ride, rested and back on foot",
              after_ride["t"] == 0 and after_ride["hp"] == 100 and after_ride["visible"] and not after_ride["car"], json.dumps(after_ride))

        # 6d. a cab will not pick up while the police are after you; it does once they are gone
        page.evaluate("""() => { const n = NEON, p = n.player; const cab = n.vehicles.find(v => v.type === 'taxi' && !v.dead);
            cab.vx = cab.vz = 0; p.x = cab.x + 2.2; p.z = cab.z; n.tryEnterExit(); }""")
        page.wait_for_timeout(400)
        page.keyboard.press("t")
        page.wait_for_timeout(4200)
        page.evaluate("""() => { const n = NEON, c = n.player.car, at = n.mission.def.steps[0].at;
            n.setWanted(1); c.x = at[0]; c.z = at[1]; c.vx = c.vz = 0; }""")
        page.wait_for_timeout(1300)
        hot = page.evaluate("() => ({ step: NEON.mission.step, text: document.getElementById('objective').textContent })")
        check("no pickup while wanted", hot["step"] == 0 and "Lose the police first" in hot["text"], json.dumps(hot))
        page.evaluate("() => { const c = NEON.player.car; NEON.setWanted(0); c.vx = c.vz = 0; }")
        page.wait_for_timeout(1500)
        check("the pickup goes ahead once the stars are gone", page.evaluate("() => NEON.mission.step") == 1)
        page.keyboard.press("t")
        page.wait_for_timeout(300)

        # 6e. the tune-up shop pulls its shutters down while you are wanted
        page.evaluate("""() => { const n = NEON, c = n.player.car, at = n.PLACES.tune;
            n.addMoney(-n.save.money + 3000); n.setWanted(1); c.x = at[0]; c.z = at[1]; c.vx = c.vz = 0; }""")
        page.wait_for_timeout(1000)
        check("no tune-up while wanted", page.evaluate("() => NEON.save.tune === 0 && NEON.save.money === 3000"))
        page.evaluate("() => { const c = NEON.player.car; NEON.setWanted(0); c.vx = c.vz = 0; }")
        page.wait_for_timeout(900)
        check("the tune-up sells again once the stars are gone", page.evaluate("() => NEON.save.tune === 1 && NEON.save.money < 3000"))
        page.evaluate("() => { const n = NEON; n.player.car.vx = n.player.car.vz = 0; n.tryEnterExit(); }")
        page.wait_for_timeout(300)

        # 6f. the perk card shows progress in play
        card = page.evaluate("""() => { const n = NEON; n.checkPerks(true); n.save.packages = [0]; n.checkPerks();
            const el = document.getElementById('perk');
            const out = { shown: el.classList.contains('show'), title: el.querySelector('b').textContent, bar: el.querySelector('i').style.width };
            n.save.packages = []; n.checkPerks(true); el.classList.remove('show'); return out; }""")
        check("finding a package shows how far the next perk is", card["shown"] and "1 / 5" in card["title"] and card["bar"] == "20%", json.dumps(card))

        # 7. perks follow the save
        perks = page.evaluate("""() => { const n = NEON; const before = n.PERKS.map(p => n.perk(p.id));
            n.save.packages = [0, 1, 2, 3, 4]; n.save.fares = 10; const after = n.PERKS.map(p => n.perk(p.id)); return { before, after }; }""")
        check("perks unlock from packages and fares", perks["before"] == [False, False, False, False] and perks["after"] == [True, False, True, False], json.dumps(perks))
        unlocked = page.evaluate("""() => { NEON.checkPerks(); const el = document.getElementById('perk');
            return { shown: el.classList.contains('show'), got: el.classList.contains('got'), title: el.querySelector('b').textContent }; }""")
        check("an unlocked perk is announced in play", unlocked["shown"] and unlocked["got"] and "PERK UNLOCKED" in unlocked["title"], json.dumps(unlocked))

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

        # ---------- version 1.4 ----------
        # 10. learner phase: a crime before the first job is done brings no stars, afterwards it does
        page.click("#btn-new")
        page.wait_for_timeout(900)
        learner = page.evaluate("""() => { const n = NEON; n.crime(8); n.crime(8);
            return { stars: n.wanted.stars, pts: n.wanted.pts, hint: document.getElementById('hint').textContent }; }""")
        check("no stars for a crime before the first job is done", learner["stars"] == 0 and learner["pts"] == 0
              and "police let that one go" in learner["hint"], json.dumps(learner))
        watched = page.evaluate("""() => { const n = NEON; n.save.mission = 1; n.offerMission(); n.crime(8);
            const out = { stars: n.wanted.stars }; n.setWanted(0); return out; }""")
        check("the same crime earns stars once the first job is done", watched["stars"] >= 1, json.dumps(watched))

        # 11. the skyline has outlines: roof lips, crowns, tanks, chimneys, the Rustport quay
        outlines = page.evaluate("() => NEON.landmarks.outlines")
        check("buildings carry roof shapes and the quay is built",
              outlines["boxes"] > 300 and outlines["wedges"] > 20 and outlines["drums"] > 20, json.dumps(outlines))

        # 12. J. Before the first story job it only names that job. Since 1.9, once the first job is done, J goes
        # from the story job to an odd job and back (before 1.9 it only named the next story job until the story
        # was over). After the story it deals a new kind each press.
        first = page.evaluate("""() => { const n = NEON; n.save.mission = 0; n.offerMission(); n.anotherJob();
            const out = { hint: document.getElementById('hint').textContent, job: n.mission.offer.name };
            n.save.mission = 1; n.offerMission(); return out; }""")
        check("J before the first story job names that job and changes nothing",
              first["job"] == "First Wheels" and "First Wheels" in first["hint"] and "Odd jobs open once it is done" in first["hint"],
              json.dumps(first))
        page.keyboard.press("j")
        page.wait_for_timeout(250)
        told = page.evaluate("() => ({ hint: document.getElementById('hint').textContent, job: NEON.mission.offer.name, kind: NEON.mission.offer.kind || '' })")
        page.keyboard.press("j")
        page.wait_for_timeout(250)
        back = page.evaluate("() => ({ hint: document.getElementById('hint').textContent, job: NEON.mission.offer.name })")
        check("J during the story offers an odd job, and J again brings the story job back",
              told["job"] != "Hot Delivery" and told["kind"] and told["job"] in told["hint"] and "back to the story job" in told["hint"]
              and back["job"] == "Hot Delivery" and "Story job: Hot Delivery" in back["hint"], json.dumps([told, back]))
        page.evaluate("() => { NEON.save.mission = NEON.MISSIONS.length; NEON.offerMission(); }")
        kinds = [page.evaluate("() => NEON.mission.offer.kind")]
        for _ in range(5):
            page.keyboard.press("j")
            page.wait_for_timeout(200)
            kinds.append(page.evaluate("() => NEON.mission.offer.kind"))
        check("J deals six different kinds of odd job in turn", len(set(kinds)) == 6 and "foot" in kinds and "tail" in kinds, json.dumps(kinds))

        # 13. Paper Round: on foot only, four envelopes, pays $550
        for _ in range(6):
            if page.evaluate("() => NEON.mission.offer.kind") == "foot":
                break
            page.keyboard.press("j")
            page.wait_for_timeout(200)
        offer = page.evaluate("""() => { const o = NEON.mission.offer;
            return { name: o.name, reward: o.reward, steps: o.steps.length, foot: o.steps.every(s => s.foot) }; }""")
        check("Paper Round is offered: four stops on foot for $550",
              offer["name"] == "Paper Round" and offer["reward"] == 550 and offer["steps"] == 4 and offer["foot"], json.dumps(offer))
        marker = page.evaluate("() => NEON.mission.startMarker.text")
        check("the Paper Round beam is labelled ON FOOT", "ON FOOT" in marker, marker)
        # PROBE ONLY: the beam is moved to the corner that has a ramp just inside 45 m (NEON_FOOT_CORNER=ramp),
        # or to the corner furthest from every ramp (NEON_FOOT_CORNER=far)
        if os.environ.get('NEON_FOOT_CORNER'):
            print('forced corner: ' + json.dumps(page.evaluate("""(want) => { const n = NEON; let best = null;
                for (let i = 1; i <= 8; i++) for (let j = 1; j <= 8; j++) { const b = n.blocks[i][j];
                    if (!b || b.type === 'park') continue;
                    const at = [b.x0 + 2.4, b.z0 + 2.4];
                    const d = Math.min(...n.ramps.map((r) => Math.hypot(r.x - at[0], r.z - at[1])));
                    if (want === 'ramp' ? (d < 45 && (!best || d > best.d)) : (!best || d > best.d)) best = { at, d, i, j };
                }
                n.mission.offer.at = best.at; n.mission.startMarker.x = best.at[0]; n.mission.startMarker.z = best.at[1];
                return Object.assign(best, { told: n.save.havocTold, line: document.getElementById('hint').textContent.slice(0, 30),
                    shown: document.getElementById('hint').classList.contains('show') }); }""", os.environ['NEON_FOOT_CORNER'])), flush=True)
        # arrive by car (1.7): the round does not start from the driver's seat, and the hint says why
        page.evaluate("""() => { const n = NEON, p = n.player;
            const car = n.vehicles.filter(v => v.driver !== 'ai' && !v.dead)
              .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
            p.x = car.x + 2.2; p.z = car.z; n.tryEnterExit();
            const at = n.mission.offer.at; n.player.car.x = at[0]; n.player.car.z = at[1]; n.player.car.vx = n.player.car.vz = 0;
            // what the hint line said, frame by frame, for the line the check prints: it decides nothing
            const el = document.getElementById('hint'), start = performance.now();
            const seen = window.__line = { on: true, frames: 0, longest: 0, last: start, said: [], was: '' };
            const look = () => { if (!seen.on) return;
                const now = performance.now(), c = n.player.car, shown = el.classList.contains('show');
                seen.frames++; seen.longest = Math.max(seen.longest, now - seen.last); seen.last = now;
                const words = (shown ? '' : '(hidden) ') + el.textContent.slice(0, 22);
                if (words !== seen.was && seen.said.length < 12) { seen.was = words;
                    seen.said.push({ ms: Math.round(now - start), line: words, wait: Math.round((n.mission.footNote || 0) * 100) / 100,
                        vf: c ? Math.round((c.vf || 0) * 100) / 100 : null, off: c ? Math.round(Math.hypot(c.x - at[0], c.z - at[1]) * 100) / 100 : null }); }
                requestAnimationFrame(look); };
            look(); }""")
        page.wait_for_timeout(700)
        # (the beam stands on the corner of a block picked at random: the line says which, and how far the car is from it)
        refused = page.evaluate("""() => { const n = NEON, c = n.player.car, m = n.mission.startMarker, at = n.mission.offer.at;
            const round = (v) => typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : -1;
            return { active: n.mission.active, car: !!c, hint: document.getElementById('hint').textContent,
                shown: document.getElementById('hint').classList.contains('show'), beam: at.map(Math.round),
                from_beam: round(c && m ? Math.hypot(c.x - m.x, c.z - m.z) : -1), speed: round(c ? Math.abs(c.vf || 0) : -1),
                ramp: round(Math.min(...(n.ramps || []).map((r) => Math.hypot(r.x - at[0], r.z - at[1])), 9999)),
                frames: (window.__line || {}).frames, longest_ms: Math.round((window.__line || {}).longest || 0),
                line: ((window.__line || {}).on = false, (window.__line || {}).said) }; }""")
        check("the round does not start from a car, and the hint says it is on foot",
              refused["car"] and not refused["active"] and "on foot" in refused["hint"], json.dumps(refused))
        # step out at the beam: now it starts, and the title card says on foot
        page.evaluate("""() => { const n = NEON, c = n.player.car; c.vx = c.vz = 0; n.tryEnterExit();
            const at = n.mission.offer.at; n.player.x = at[0]; n.player.z = at[1]; }""")
        page.wait_for_timeout(500)
        begun = page.evaluate("""() => ({ active: NEON.mission.active, name: NEON.mission.active ? NEON.mission.def.name : '',
            card: document.querySelector('#banner span').textContent })""")
        check("on foot at the beam the round starts, and the title card says on foot",
              begun["active"] and begun["name"] == "Paper Round" and "On foot" in begun["card"], json.dumps(begun))
        money_before = page.evaluate("() => NEON.save.money")
        # get back in mid-round: an envelope does not count from the driver's seat
        page.evaluate("""() => { const n = NEON, p = n.player;
            const car = n.vehicles.filter(v => v.driver !== 'ai' && !v.dead)
              .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
            p.x = car.x + 2.2; p.z = car.z; n.tryEnterExit(); }""")
        page.wait_for_timeout(300)
        page.evaluate("""() => { const n = NEON, c = n.player.car, at = n.mission.def.steps[0].at;
            c.x = at[0]; c.z = at[1]; c.vx = c.vz = 0; }""")
        page.wait_for_timeout(600)
        seated = page.evaluate("""() => ({ active: NEON.mission.active, name: NEON.mission.active ? NEON.mission.def.name : '', step: NEON.mission.step,
            text: document.getElementById('objective').textContent })""")
        check("an envelope cannot be delivered from a car", seated["active"] and seated["name"] == "Paper Round"
              and seated["step"] == 0 and "on foot" in seated["text"], json.dumps(seated))
        page.evaluate("() => { const c = NEON.player.car; c.vx = c.vz = 0; NEON.tryEnterExit(); }")
        page.wait_for_timeout(300)
        steps_seen = []
        for stop in range(4):
            page.evaluate("""(k) => { const n = NEON, at = n.mission.def.steps[k].at; n.player.x = at[0]; n.player.z = at[1]; }""", stop)
            page.wait_for_timeout(350)
            steps_seen.append(page.evaluate("() => NEON.mission.active ? NEON.mission.step : -1"))
        paid = page.evaluate("() => ({ active: NEON.mission.active, money: NEON.save.money, car: !!NEON.player.car })")
        check("four envelopes on foot finish the round and pay $550",
              steps_seen == [1, 2, 3, -1] and not paid["active"] and paid["money"] - money_before == 550 and not paid["car"],
              json.dumps({"steps": steps_seen, "paid": paid["money"] - money_before}))

        # 14. (1.7) Shadow Run: follow a moving car, no clock and no marker. The follow time is cut from 40 s to 3 s
        # for the check, and the player's car is held at a set distance behind the marked car.
        def start_tail():
            page.evaluate("""() => { const n = NEON, c = n.player.car; n.setWanted(0); n.player.hp = 100;
                if (c) { c.vx = c.vz = 0; n.tryEnterExit(); } }""")
            page.wait_for_timeout(300)
            for _ in range(7):
                if page.evaluate("() => !NEON.mission.active && NEON.mission.offer.kind") == "tail":
                    break
                page.keyboard.press("j")
                page.wait_for_timeout(200)
            told = page.evaluate("""() => { const n = NEON, o = n.mission.offer; o.steps[1].secs = 3;
                n.player.x = o.at[0]; n.player.z = o.at[1];
                return { name: o.name, kind: o.kind, reward: o.reward, steps: o.steps.map(s => s.t) }; }""")
            page.wait_for_timeout(400)
            page.evaluate("""() => { const n = NEON, p = n.player;
                const car = n.vehicles.filter(v => v.driver !== 'ai' && v.driver !== 'cop' && !v.dead)
                  .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
                car.vx = car.vz = 0; p.x = car.x + 2.2; p.z = car.z; n.tryEnterExit(); }""")
            page.wait_for_timeout(500)
            return told

        def hold_behind(metres, seconds):
            # seconds are counted on the game's own clock (the tail's age): under 20 frames a second the game
            # runs slower than the wall clock, and a wall-clock wait would end before the game's timer does
            page.evaluate("""(metres) => { clearInterval(window.__pin); window.__pin = setInterval(() => {
                const n = NEON, c = n.player.car, t = n.mission.car;
                if (!n.mission.active || !c || !t) return;
                c.x = t.x - Math.sin(t.h) * metres; c.z = t.z - Math.cos(t.h) * metres; c.h = t.h; c.vx = c.vz = 0; c.hp = c.t.hp; }, 30);
                window.__age0 = n_age(); function n_age() { const t = NEON.mission.tail; return t ? t.age : 0; }
                // what the hold saw, frame by frame, for the line a check prints: it decides nothing
                if (window.__seen) window.__seen.on = false;
                const seen = window.__seen = { on: true, frames: 0, nearest: 1e9, widest: 0, noCar: 0, inAir: 0, lost: 0, resets: 0, before: 0 };
                const look = () => { if (!seen.on) return;
                    const n = NEON, c = n.player.car, t = n.mission.car, tail = n.mission.tail;
                    seen.frames++;
                    if (!c) seen.noCar++; else if (c.air) seen.inAir++;
                    if (c && t) { const gap = Math.hypot(t.x - c.x, t.z - c.z); seen.nearest = Math.min(seen.nearest, gap); seen.widest = Math.max(seen.widest, gap); }
                    if (tail) { if (tail.lost < seen.before) seen.resets++; seen.before = tail.lost; seen.lost = Math.max(seen.lost, tail.lost); }
                    requestAnimationFrame(look); };
                requestAnimationFrame(look); }""", metres)
            try:
                page.wait_for_function(
                    "(s) => !NEON.mission.active || !NEON.mission.tail || NEON.mission.tail.age - window.__age0 >= s",
                    arg=seconds, polling=50, timeout=int(seconds * 6000) + 10000)
            except Exception:
                pass          # the checks below read the state and fail on their own terms
            page.wait_for_timeout(200)
            page.evaluate("() => clearInterval(window.__pin)")
            return page.evaluate("""() => { const n = NEON, seen = window.__seen || {}, tail = n.mission.tail, c = n.player.car;
                const round = (v) => typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : -1;
                seen.on = false;
                return { active: n.mission.active, money: n.save.money,
                    card: document.querySelector('#banner b').textContent + ' / ' + document.querySelector('#banner span').textContent,
                    age: round(tail && tail.age), held: round(tail && tail.age - window.__age0), lost: round(tail && tail.lost),
                    most_lost: round(seen.lost), lost_restarted: seen.resets, nearest: round(seen.nearest), widest: round(seen.widest),
                    frames: seen.frames, no_car: seen.noCar, in_air: seen.inAir,
                    ramp: round(c ? Math.min(...(n.ramps || []).map((r) => Math.hypot(r.x - c.x, r.z - c.z)), 9999) : -1) }; }""")

        told = start_tail()
        check("Shadow Run is offered: get a car, then tail one, for $700",
              told["name"] == "Shadow Run" and told["reward"] == 700 and told["steps"] == ["car", "tail"], json.dumps(told))
        chase = page.evaluate("""() => { const n = NEON, m = n.mission, t = m.car, p = n.player;
            return { active: m.active, step: m.step, driver: t ? t.driver : null, keep: t ? t.keep : null,
                gap: t && p.car ? Math.round(Math.hypot(t.x - p.car.x, t.z - p.car.z)) : -1, near: n.TAIL.near, far: n.TAIL.far,
                text: document.getElementById('objective').textContent }; }""")
        check("the marked car is a driver in traffic, 26 to 130 m away, and the objective shows the gap",
              chase["active"] and chase["step"] == 1 and chase["driver"] == "ai" and chase["keep"] and 20 <= chase["gap"] <= 135
              and " m " in chase["text"] and "to go" in chase["text"], json.dumps(chase))
        money_before = page.evaluate("() => NEON.save.money")
        kept = hold_behind(25, 4.2)
        check("staying 25 m behind for the full time passes and pays $700",
              not kept["active"] and kept["money"] - money_before == 700 and "PASSED" in kept["card"],
              json.dumps(dict(kept, before=money_before, counts=page.evaluate(
                  "() => ({ tricks: NEON.save.tricks, smashed: NEON.save.smashed, getaways: NEON.save.getaways, jumps: (NEON.save.jumps || []).length })"))))
        page.wait_for_timeout(400)
        start_tail()
        money_before = page.evaluate("() => NEON.save.money")
        close = hold_behind(5, 4.0)
        check("sitting 5 m behind gets you spotted: failed, no pay",
              not close["active"] and close["money"] == money_before and "spotted" in close["card"], json.dumps(close))
        page.wait_for_timeout(400)
        start_tail()
        page.evaluate("() => { NEON.mission.tail.age = NEON.TAIL.pickup; }")     # past the opening twenty seconds
        far = hold_behind(100, 9.2)
        check("after the opening, 100 m behind for eight seconds loses them: failed, no pay",
              not far["active"] and far["money"] == money_before and "lost them" in far["card"], json.dumps(far))
        page.wait_for_timeout(400)
        start_tail()
        slow = hold_behind(100, 12.0)         # a slow start: 100 m behind from the first second
        slow["text"] = page.evaluate("() => document.getElementById('objective').textContent")
        check("a slow start is allowed: 100 m behind for the first twelve seconds does not fail, and the line says catch up",
              slow["active"] and "CATCH UP" in slow["text"] and page.evaluate("() => NEON.TAIL.pickup") == 20, json.dumps(slow))
        gone = hold_behind(100, 17.5)
        check("never closing up loses them once the opening twenty seconds and eight more are gone",
              not gone["active"] and gone["money"] == money_before and "lost them" in gone["card"], json.dumps(gone))

        # 15. (1.7) Borrowed Time: ten seconds of head start before the stars
        page.evaluate("""() => { const n = NEON, c = n.player.car; n.setWanted(0); n.player.hp = 100; n.save.money = 1000;
            if (c) { c.vx = c.vz = 0; n.tryEnterExit(); } n.save.mission = 3; n.offerMission(); }""")
        page.wait_for_timeout(300)
        page.evaluate("() => { const n = NEON, at = n.mission.offer.at; n.player.x = at[0]; n.player.z = at[1]; }")
        page.wait_for_timeout(500)
        page.evaluate("""() => { const n = NEON, p = n.player, car = n.mission.car; n.setWanted(0);
            p.x = car.x + 2.2; p.z = car.z; n.tryEnterExit(); }""")
        page.wait_for_timeout(700)
        early = page.evaluate("""() => ({ job: NEON.mission.active ? NEON.mission.def.name : '', step: NEON.mission.step, stars: NEON.wanted.stars,
            hint: document.getElementById('hint').textContent, left: NEON.mission.heat ? NEON.mission.heat.t : -1 })""")
        # the ten seconds are the game's (mission.heat.t counts them down); wait for that clock, not the wall clock
        try:
            page.wait_for_function("() => !NEON.mission.heat", polling=50, timeout=70000)
        except Exception:
            pass
        page.wait_for_timeout(300)
        late = page.evaluate("() => NEON.wanted.stars")
        check("taking the marked car gives ten seconds before the two stars",
              early["job"] == "Borrowed Time" and early["step"] == 1 and early["stars"] == 0 and "10 seconds" in early["hint"]
              and 8.0 <= early["left"] <= 10 and late >= 2,
              json.dumps({"early": early, "stars_when_the_ten_seconds_are_up": late}))

        # 16. (1.7) Heat Wave: while losing the heat the route leads to the respray, and the respray ends it
        page.evaluate("() => { NEON.setWanted(0); NEON.player.hp = 100; NEON.save.money = 1000; }")
        page.evaluate("""() => { const n = NEON, c = n.player.car, g = n.PLACES.garage;      // finish Borrowed Time the honest way: the car in the ring
            c.x = g[0]; c.z = g[1]; c.vx = c.vz = 0; c.hp = c.t.hp; }""")
        page.wait_for_timeout(700)
        moved_on = page.evaluate("() => ({ done: NEON.save.mission, offer: NEON.mission.offer.name, active: NEON.mission.active })")
        # stay in the same car: roll into the next beam, then to the bag outside the bank
        page.evaluate("""() => { const n = NEON, c = n.player.car, at = n.mission.offer.at; n.setWanted(0); n.save.money = 1000;
            c.x = at[0]; c.z = at[1]; c.vx = c.vz = 0; }""")
        page.wait_for_timeout(500)
        page.evaluate("() => { const n = NEON, c = n.player.car, at = n.PLACES.bank; c.x = at[0]; c.z = at[1]; c.vx = c.vz = 0; }")
        page.wait_for_timeout(500)
        heat = page.evaluate("""() => { const n = NEON, m = n.mission, g = n.PLACES.garage, r = n.route.points;
            return { job: m.active ? m.def.name : '', step: m.step, stars: n.wanted.stars, blip_is_respray: !!m.blip && m.blip[0] === g[0] && m.blip[1] === g[1],
                route_ends_there: r.length > 1 && Math.hypot(r[r.length - 1][0] - g[0], r[r.length - 1][1] - g[1]) < 0.2,
                text: document.getElementById('objective').textContent }; }""")
        check("with three stars on, the route leads to Mo's Respray and the objective says so",
              moved_on["done"] == 4 and heat["job"] == "Heat Wave" and heat["step"] == 1 and heat["stars"] == 3 and heat["blip_is_respray"]
              and heat["route_ends_there"] and "respray" in heat["text"], json.dumps({"after_job_4": moved_on, "heat": heat}))
        money_before = page.evaluate("() => NEON.save.money")
        page.evaluate("() => { const n = NEON, c = n.player.car, g = n.PLACES.garage; c.x = g[0]; c.z = g[1]; c.vx = c.vz = 0; }")
        page.wait_for_timeout(800)
        sprayed = page.evaluate("() => ({ stars: NEON.wanted.stars, done: NEON.save.mission, gain: NEON.save.money, in_car: !!NEON.player.car })")
        sprayed["gain"] -= money_before
        check("the respray clears the heat for $150 and the job pays $2200",
              sprayed["in_car"] and sprayed["stars"] == 0 and sprayed["done"] == 5 and sprayed["gain"] == 2200 - 150, json.dumps(sprayed))
        check("no console errors", not problems, "; ".join(problems[:3]))
        browser.close()


if __name__ == "__main__":
    run()
    failed = [name for name, ok, _ in results if not ok]
    print(f"\n{len(results) - len(failed)} / {len(results)} checks passed")
    sys.exit(1 if failed else 0)
