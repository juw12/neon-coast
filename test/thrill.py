"""What version 1.9 added to make the game more fun to play, one rule at a time: the handbrake slide, cash
for near misses and slides (chained, banked, lost in a crash), a two-star pursuit that does not shoot at a
moving car, cash for losing the police, odd jobs from the first story job on, a busier city that sounds
its horns and sirens, an engine with gears, and the touch controls for all of it.

Cars are placed through the game's test handle (window.NEON) and the game is left to run each case itself.
Time is counted on the game's own clock (the game never moves on more than 0.1 s a frame, 0.05 s before 2.0.1), so a slow PC
cannot fail it. Run it against an older build to see which rules are new: there the new ones fail.

It proves the rules hold. It does not prove that the game is more fun: only playing it can.

    python test/thrill.py                 # NeonCoast.html; one line per check, exit code 0 when all pass
    python test/thrill.py other.html      # another build that has NEON.addVehicle and NEON.removeVehicle
"""
import os
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

# A GitHub Mac draws with its graphics card only in a real window: NEON_WINDOW=1 opens one.
# NEON_CHROME_ARGS adds flags (the frame-rate gate runs without the 60 Hz cap of the display).
WINDOW = os.environ.get("NEON_WINDOW") == "1"
EXTRA_ARGS = os.environ.get("NEON_CHROME_ARGS", "").split()

ROOT = Path(__file__).resolve().parent.parent
results = []

# shared by every case: the game clock, an empty street, and the keys of the player's car
TOOLS = """
    const n = NEON, c = n.player.car;
    let last = performance.now(), clock = 0;
    const step = () => { const now = performance.now(); const dt = Math.min(NEON.STEP * NEON.MAX_STEPS || 0.05, (now - last) / 1000); last = now; clock += dt; return dt; };
    const empty = (keep) => {
        for (const v of n.vehicles.slice()) if (v !== c && !keep.includes(v)) n.removeVehicle(v);
        for (const p of n.peds.splice(0)) n.scene.remove(p.mesh);
    };
    const press = (held) => { for (const key of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space']) n.keys[key] = held.includes(key); };
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const fresh = () => {
        n.save.mission = Math.max(1, n.save.mission);     // past the learner phase, where the police look away
        n.save.difficulty = 1;
        n.setWanted(0); n.wanted.pts = 0;
        c.hp = c.t.hp; c.crashT = 0;
    };
"""

# The handbrake at speed. The car is put on the open sand west of the city (50 m wide, nothing to hit), heading
# along it at `speed` with the throttle held. From 0.3 s the handbrake is held for `hold` seconds, with the wheel
# turned towards the city (and the throttle still held) when `steer` is set, and with no throttle when it is not;
# then the handbrake is let go and the car drives on for 1.2 s.
# With `touch` the phone controls are used instead: the stick pushed over, the HAND BRAKE button held, no GAS.
TURN_JS = """(setup) => new Promise(done => {""" + TOOLS + """
    fresh();
    empty([]);
    if (n.style) n.updateStyle(0);
    if (setup.touch) n.setTouchMode(true);
    const half = 430;
    c.x = -half - 24; c.z = -260; c.h = 0; c.vx = 0; c.vz = setup.speed; c.steer = 0;
    const hp0 = c.hp, h0 = c.h, money0 = n.save.money;
    const out = { enter: 0, exit: 0, after: 0, turned: 0, sideways: 0, sidewaysAfter: 0, roll: 0, squeal: 0, power: 0,
                  wheel: 0, slideCard: '', tricks: 0, bank: 0 };
    const slideCard = () => {
        const card = document.getElementById('style');
        if (card && card.className.includes('show') && card.textContent.includes('SLIDE')) out.slideCard = card.textContent;
    };
    const tick = () => {
        step();
        empty([]);
        const speed = Math.hypot(c.vx, c.vz);
        const share = speed > 1 ? c.slip / speed : 0;
        if (clock < 0.3) {
            press(['KeyW']);
            out.enter = speed;
        } else if (clock < 0.3 + setup.hold) {
            if (setup.touch) { press(['Space']); n.touch.sx = setup.steer ? -setup.stick : 0; }
            else press(setup.steer ? ['KeyW', 'KeyA', 'Space'] : ['Space']);
            out.exit = speed;
            out.turned = Math.abs(wrap(c.h - h0));
            out.sideways = Math.max(out.sideways, share);
            out.wheel = Math.max(out.wheel, Math.abs(c.steer));
            if (c.thr > 0 && clock > 0.45) out.power++;      // (the first frames still show the throttle of before)
            const shell = c.mesh.userData.shell;
            if (shell) out.roll = Math.max(out.roll, Math.abs(shell.rotation.z));
            if (n.carSound) out.squeal = Math.max(out.squeal, n.carSound(c).squeal);
            slideCard();
        } else if (clock < 1.5 + setup.hold) {
            if (setup.touch) n.touch.sx = 0;
            press(['KeyW']);
            slideCard();
            if (n.style) { out.tricks = Math.max(out.tricks, n.style.count); out.bank = Math.max(out.bank, n.style.bank); }
        } else {
            press([]);
            out.after = speed;
            out.sidewaysAfter = share;
            out.lost = hp0 - c.hp;
            out.x = c.x;
            if (setup.touch) n.setTouchMode(false);
            c.vx = c.vz = 0;
            return done(out);
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""

# Near misses. The player's car is held on the street at `speed` (a treadmill), and `cars` cars with a driver
# come the other way one after the other at `other` m/s, each passing with `daylight` metres between the two
# cars. Then either a parked car is put in the way (`crash`), or the game is left alone until the chain is paid.
NEAR_JS = """(setup) => new Promise(done => {""" + TOOLS + """
    fresh();
    empty([]);
    if (setup.stars) n.setWanted(setup.stars);
    const lane = -3.2, at = -42;
    const money0 = n.save.money, honks0 = n.honks || 0, tricks0 = n.save.tricks || 0;
    const out = { tricks: 0, bank: 0, mult: 0, card: '', paidCard: '', lostCard: '', sent: 0 };
    let coming = null, sent = 0, wreck = null, idle = 0, crashed = false, startAt = 0;
    const hold = () => { c.x = lane; c.z = at; c.h = 0; c.vx = 0; c.vz = setup.speed; };
    hold();
    const tick = () => {
        step();
        empty([coming, wreck].filter(Boolean));
        const card = document.getElementById('style');
        const words = card && card.className.includes('show') ? card.textContent : '';
        if (words.includes('BANKED')) out.paidCard = words;
        else if (words.includes('CRASHED')) out.lostCard = words;
        else if (words) out.card = words;
        if (n.style) {
            out.tricks = Math.max(out.tricks, n.style.count);
            out.bank = Math.max(out.bank, n.style.bank);
            out.mult = Math.max(out.mult, n.styleMult());
        }
        if (!crashed) hold();
        if (!coming && sent < setup.cars) {
            coming = n.addVehicle('sedan', lane, at + 26, Math.PI, 'ai');
            coming.side = c.t.wid / 2 + coming.t.wid / 2 + setup.daylight;
            startAt = clock;
            sent++;
        }
        if (coming) {
            const ahead = 26 - (setup.speed + setup.other) * (clock - startAt);
            coming.x = lane + coming.side; coming.z = at + ahead; coming.h = Math.PI;
            coming.vx = 0; coming.vz = -setup.other;
            if (ahead < -18) { n.removeVehicle(coming); coming = null; }
        } else if (sent >= setup.cars) {
            if (setup.crash && !wreck) {
                wreck = n.addVehicle('van', lane, at + 16, 0, null);
                crashed = true;
                c.vz = setup.speed;
            }
            idle += 1;
            const open = n.style ? n.style.count > 0 : false;
            if ((!open && idle > 20 && (!setup.crash || clock - startAt > 3.2)) || clock - startAt > 9) {
                out.sent = sent;
                out.paid = n.save.money - money0;
                out.honks = (n.honks || 0) - honks0;
                out.counted = (n.save.tricks || 0) - tricks0;
                out.lost = c.t.hp - c.hp;
                out.stars = n.wanted.stars;
                if (wreck) n.removeVehicle(wreck);
                c.vx = c.vz = 0;
                n.setWanted(0); n.wanted.pts = 0;
                return done(out);
            }
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""

# Police gunfire at two stars. The car and one cruiser 20 m behind it are held in place on the street while the
# car is given a speed (a treadmill), and every dice roll of the game is fixed to `roll` (0 always hits).
AIM_JS = """(setup) => new Promise(done => {""" + TOOLS + """
    fresh();
    empty([]);
    n.setWanted(setup.stars);
    const cop = n.addVehicle('police', -3.2, -62, 0, 'cop');
    cop.ai.fire = 0.2;
    const dice = Math.random;
    Math.random = () => setup.roll;
    let prev = c.hp, hits = 0, other = 0;
    const tick = () => {
        step();
        empty([cop]);
        const drop = prev - c.hp; prev = c.hp;
        if (Math.abs(drop - 6) < 0.01) hits++; else if (drop > 0.01) other++;
        c.x = -3.2; c.z = -42; c.h = 0; c.vx = 0; c.vz = setup.speed;
        cop.x = -3.2; cop.z = -62; cop.h = 0; cop.vx = 0; cop.vz = 0;
        if (clock >= setup.seconds || c.dead || n.state !== 'play') {
            Math.random = dice;
            n.removeVehicle(cop);
            c.vx = c.vz = 0;
            const stars = n.wanted.stars;
            n.setWanted(0); n.wanted.pts = 0;
            return done({ hits, other, seconds: clock, stars, state: n.state, dead: c.dead });
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""

# Losing the police. The player's car stands on the street with `stars` wanted stars and one cruiser held 20 m
# behind it (in sight, shots fixed to miss) for `seen` seconds. Then every police car is taken away, again and
# again, until the game itself decides that the police have lost the player.
GETAWAY_JS = """(setup) => new Promise(done => {""" + TOOLS + """
    fresh();
    empty([]);
    n.setWanted(setup.stars);
    const cop = n.addVehicle('police', -3.2, -62, 0, 'cop');
    const dice = Math.random;
    const money0 = n.save.money, getaways0 = n.save.getaways || 0;
    const out = { bar: false, barWide: 0, barWhileSeen: false, words: '' };
    let gone = false, goneAt = 0;
    const tick = () => {
        step();
        const bar = document.getElementById('evade');
        const barOn = !!bar && bar.className.includes('show');
        c.x = -3.2; c.z = -42; c.h = 0; c.vx = 0; c.vz = 0;
        if (!gone) {
            Math.random = () => 0.99;
            empty([cop]);
            cop.x = -3.2; cop.z = -62; cop.h = 0; cop.vx = 0; cop.vz = 0;
            if (clock > 1 && barOn) out.barWhileSeen = true;
            if (clock >= setup.seen) {
                gone = true; goneAt = clock;
                Math.random = dice;
                n.removeVehicle(cop);
            }
        } else {
            empty([]);
            if (barOn) {
                out.bar = true;
                out.barWide = Math.max(out.barWide, parseFloat(document.getElementById('evade-bar').style.width) || 0);
            }
            const hint = document.getElementById('hint');
            if (hint && hint.textContent.includes('lost them')) out.words = hint.textContent;
            if (n.wanted.stars === 0 || clock - goneAt > 30 || n.state !== 'play') {
                out.stars = n.wanted.stars;
                out.hid = clock - goneAt;
                out.paid = n.save.money - money0;
                out.getaways = (n.save.getaways || 0) - getaways0;
                out.lost = c.t.hp - c.hp;
                n.setWanted(0); n.wanted.pts = 0;
                return done(out);
            }
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""

# A quiet city. Nothing is wanted; one patrol car drives the street 60 m behind the player, and the next call
# is made due. Its siren and its speed are watched for `seconds`.
CALL_JS = """(setup) => new Promise(done => {""" + TOOLS + """
    fresh();
    empty([]);
    c.x = -3.2; c.z = -42; c.h = 0; c.vx = c.vz = 0;
    const cop = n.addVehicle('police', 3.2, 30, Math.PI, 'cop');
    // a car made here has no lane yet and picked its first direction by chance: two times in four it turned
    // into the wall beside it (1.9 and 2.0 alike). Since 2.0 the handle can put it in the lane it stands in.
    if (n.snapLane) n.snapLane(cop);
    const out = { siren: false, call: 0, top: 0, starsAfter: 0, quietSpeed: 0 };
    const tick = () => {
        step();
        empty([cop]);
        c.vx = c.vz = 0;
        if (clock < 3) out.quietSpeed = Math.max(out.quietSpeed, Math.abs(cop.vf));
        else if (!out.due) { out.due = true; n.wanted.callT = 0.01; }
        else {
            if (cop.siren) out.siren = true;
            out.call = Math.max(out.call, cop.call || 0);
            out.top = Math.max(out.top, Math.abs(cop.vf));
        }
        if (clock >= setup.seconds) {
            out.starsAfter = n.wanted.stars;
            n.removeVehicle(cop);
            return done(out);
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""

# The player's car is put down 15 m in front of a car of the city's own traffic that is driving along its lane,
# and stands there. The driver behind has to stop and wait.
HONK_JS = """(setup) => new Promise(done => {""" + TOOLS + """
    fresh();
    const moving = n.vehicles.filter(v => v.driver === 'ai' && !v.dead && Math.abs(v.vf) > 6
        && Math.abs(Math.sin(2 * v.h)) < 0.1);            // driving straight along a street, not turning at a crossing
    if (!moving.length) return done({ honks: 0, first: -1, found: 0 });
    // one that has not yet picked its turn at the next crossing (it does so some 20 m before it): a car about to
    // turn there turned away before it reached the player's car, and the check read "never stopped"
    const behind = moving.find(v => v.ai.nd < 0) || moving[0];
    const fx = Math.round(Math.sin(behind.h)), fz = Math.round(Math.cos(behind.h));
    const park = () => { c.h = Math.atan2(fx, fz); c.vx = c.vz = 0; };
    c.x = behind.x + fx * 15; c.z = behind.z + fz * 15;
    const px = c.x, pz = c.z;
    park();
    const honks0 = n.honks || 0;
    const out = { honks: 0, first: -1, stopped: false, found: moving.length, own: false };
    const tick = () => {
        step();
        for (const p of n.peds.splice(0)) n.scene.remove(p.mesh);
        c.x = px; c.z = pz; park();
        if (Math.abs(behind.vf) < 0.5) out.stopped = true;
        out.honks = (n.honks || 0) - honks0;
        out.own = !!behind.ai.honked;
        if (out.own && out.first < 0) out.first = clock;
        if (clock >= setup.seconds) {
            out.gap = Math.hypot(behind.x - c.x, behind.z - c.z);
            return done(out);
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""

# How the screen shows speed: the car is held on the street at `speed` for `seconds`.
SPEED_JS = """(setup) => new Promise(done => {""" + TOOLS + """
    fresh();
    empty([]);
    const tick = () => {
        step();
        empty([]);
        c.x = -3.2; c.z = -42; c.h = 0; c.vx = 0; c.vz = setup.speed; c.vf = setup.speed;
        if (clock >= setup.seconds) {
            const rush = document.getElementById('rush');
            const out = { lens: n.camera.fov - n.view.fov, rush: rush ? parseFloat(rush.style.opacity) || 0 : null,
                          mix: n.audio.mix || null };
            c.vx = c.vz = 0;
            return done(out);
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""

# The engine note through the speeds of the player's car (the game's own function, no driving needed).
SOUND_JS = """() => {
    const n = NEON, c = n.player.car;
    if (!n.carSound) return null;
    const at = (share, slip, thr) => n.carSound({ t: c.t, vf: share * c.t.max, vx: 0, vz: share * c.t.max, slip: slip || 0, thr: thr || 0 });
    const gears = [], drops = [];
    let before = at(0.02, 0, 1);
    for (let share = 0.03; share <= 0.96; share += 0.01) {
        const now = at(share, 0, 1);
        if (now.gear !== before.gear) { gears.push(now.gear); drops.push(before.hz - now.hz); }
        before = now;
    }
    return { first: at(0.02, 0, 1).gear, gears, drops, top: c.t.max,
             still: at(0, 0, 0), cruise: at(0.3, 0, 1), fast: at(0.9, 0, 1), slide: at(0.5, 9, 1), coast: at(0.5, 0, 0), power: at(0.5, 0, 1),
             voices: ['engine', 'engine2', 'squeal', 'wind'].filter(name => n.audio[name]) };
}"""

# J, the key that asks for another job, with `done` story jobs finished. Returns what is on offer after each press.
JOBS_JS = """(done) => {
    const n = NEON, was = n.save.mission;
    n.save.mission = done;
    n.offerMission();
    const name = () => n.mission.offer.name;
    const isStory = () => n.mission.offer === n.MISSIONS[done];
    const hint = () => document.getElementById('hint').textContent;
    const out = { start: name(), startStory: isStory(), presses: [] };
    for (let k = 0; k < 4; k++) {
        n.anotherJob();
        out.presses.push({ name: name(), story: isStory(), kind: n.mission.offer.kind || 'drive', words: hint() });
    }
    n.save.mission = was;
    n.offerMission();
    return out;
}"""

# The street 12 s after the cars near the player were counted: how many the game keeps around the player.
CROWD_JS = """(seconds) => new Promise(done => {
    const n = NEON;
    let last = performance.now(), clock = 0;
    const seen = [];
    const tick = () => {
        const now = performance.now();
        clock += Math.min(NEON.STEP * NEON.MAX_STEPS || 0.05, (now - last) / 1000); last = now;
        n.gfx.crowd = 1;                       // the full crowd, whatever this PC's frame rate made of the graphics
        // counted on every frame of the last four seconds, and the middle value taken: a car that drives out of
        // reach is replaced a moment later, and one look at that moment read 18 where the street holds 20
        if (clock >= seconds - 4) seen.push([n.vehicles.filter(v => v.driver === 'ai' || v.driver === 'cop').length,
            n.vehicles.filter(v => !v.driver && !v.dead).length, n.peds.length]);
        if (clock < seconds) return requestAnimationFrame(tick);
        const middle = (k) => seen.map(row => row[k]).sort((a, b) => a - b)[seen.length >> 1];
        done({ traffic: middle(0), parked: middle(1), walkers: middle(2),
               least: Math.min(...seen.map(row => row[0])), looks: seen.length, aim: n.CROWD || null });
    };
    requestAnimationFrame(tick);
})"""

# let the game clock run on
REST_JS = """(seconds) => new Promise(done => {
    let last = performance.now(), clock = 0;
    const tick = () => {
        const now = performance.now();
        clock += Math.min(NEON.STEP * NEON.MAX_STEPS || 0.05, (now - last) / 1000); last = now;
        clock >= seconds ? done(clock) : requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
})"""


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS  " if ok else "FAIL  ") + name + (("  |  " + str(detail)) if detail else ""), flush=True)


def brief(value):
    def short(item):
        if isinstance(item, float):
            return round(item, 2)
        if isinstance(item, dict):
            return {key: short(inner) for key, inner in item.items()}
        if isinstance(item, list):
            return [short(inner) for inner in item]
        return item
    return json.dumps(short(value))


def run(target):
    problems = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=not WINDOW, args=[
            "--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] + EXTRA_ARGS)
        page = browser.new_context(viewport={"width": 1280, "height": 720}).new_page()
        page.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))
        page.on("console", lambda m: problems.append(f"{m.type}: {m.text}") if m.type == "error" else None)
        page.goto(target.resolve().as_uri())
        page.wait_for_timeout(800)
        page.click("#btn-new")
        page.wait_for_timeout(1000)

        # 1. a busier city (counted first, before the cases below empty the streets)
        crowd = page.evaluate(CROWD_JS, 12)
        check("the city keeps at least 19 cars driving, 10 parked and 30 people walking around the player (1.8: 15, 9, 26)",
              crowd["traffic"] >= 19 and crowd["parked"] >= 10 and crowd["walkers"] >= 30, brief(crowd))

        page.evaluate("""() => { const n = NEON, p = n.player;
            const car = n.vehicles.filter(v => !v.driver && !v.dead && v.type !== 'police')
              .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
            car.vx = car.vz = 0; p.x = car.x + 2.2; p.z = car.z; n.tryEnterExit(); }""")
        page.wait_for_timeout(500)
        check("the player sits in a car", page.evaluate("() => !!NEON.player.car && NEON.state === 'play'"))

        # 2. the handbrake: a stop when the wheel is straight, a slide when it is turned
        stop = page.evaluate(TURN_JS, {"speed": 22, "hold": 0.9, "steer": False})
        check("handbrake with the wheel straight is still a brake: 0.9 s takes more than 12 m/s off 22 m/s",
              stop["enter"] > 20 and stop["enter"] - stop["exit"] > 12 and stop["lost"] == 0, brief(stop))
        page.evaluate(REST_JS, 5.0)
        turn = page.evaluate(TURN_JS, {"speed": 22, "hold": 0.9, "steer": True})
        check("handbrake with the wheel turned is a slide: the car turns more than 60 degrees and still does more than 16 m/s",
              turn["enter"] > 20 and turn["exit"] > 16 and turn["turned"] > 1.05 and turn["lost"] == 0, brief(turn))
        check("in that slide the car travels well sideways, and a second after the handbrake is let go the tyres grip again",
              turn["sideways"] > 0.36 and turn["sidewaysAfter"] < 0.15 and turn["after"] > 16, brief(turn))
        check("the body leans in the slide and the tyres are heard",
              turn["roll"] > 0.03 and turn["squeal"] > 0.02, brief(turn))
        check("the slide is counted on the style card while it lasts and becomes a trick when it ends",
              "SLIDE" in turn["slideCard"] and turn["tricks"] >= 1 and turn["bank"] >= 18, brief(turn))
        page.evaluate(REST_JS, 5.0)

        # 3. the same slide on a phone: stick and HAND BRAKE, no thumb left for GAS
        thumb = page.evaluate(TURN_JS, {"speed": 22, "hold": 0.9, "steer": True, "touch": True, "stick": 1})
        check("touch: HAND BRAKE with the stick pushed over keeps the power on, and the car comes out above 16 m/s",
              thumb["power"] > 5 and thumb["exit"] > 16 and thumb["turned"] > 1.05, brief(thumb))
        page.evaluate(REST_JS, 5.0)
        half = page.evaluate(TURN_JS, {"speed": 9, "hold": 0.9, "steer": True, "touch": True, "stick": 0.5})
        check("touch: half the stick turns the wheel about a third (0.35), for small corrections at speed",
              0.3 < half["wheel"] < 0.4, brief(half))
        halt = page.evaluate(TURN_JS, {"speed": 22, "hold": 0.9, "steer": False, "touch": True, "stick": 0})
        check("touch: HAND BRAKE with the stick in the middle is still a brake",
              halt["power"] == 0 and halt["enter"] - halt["exit"] > 12, brief(halt))
        page.evaluate(REST_JS, 5.0)

        # 4. near misses
        near = page.evaluate(NEAR_JS, {"speed": 20, "other": 10, "daylight": 0.8, "cars": 1})
        check("passing an oncoming car 0.8 m away at 20 m/s is a near miss: $25, paid when the bar runs out",
              near["tricks"] == 1 and near["bank"] == 25 and near["paid"] == 25 and "BANKED" in near["paidCard"], brief(near))
        check("the other driver sounds the horn", near.get("honks", 0) >= 1, brief(near))
        wide = page.evaluate(NEAR_JS, {"speed": 20, "other": 10, "daylight": 2.6, "cars": 1})
        check("a pass with 2.6 m of room is not a near miss", wide["tricks"] == 0 and wide["paid"] == 0, brief(wide))
        slow = page.evaluate(NEAR_JS, {"speed": 9, "other": 10, "daylight": 0.8, "cars": 1})
        check("neither is a close pass at 9 m/s", slow["tricks"] == 0 and slow["paid"] == 0, brief(slow))
        chain = page.evaluate(NEAR_JS, {"speed": 20, "other": 10, "daylight": 0.8, "cars": 3})
        check("three near misses in a row are worth double: (25 + 25 + 25) x 2 = $150",
              chain["tricks"] == 3 and chain["mult"] == 2 and chain["paid"] == 150 and "3 in a row" in chain["paidCard"], brief(chain))
        wreck = page.evaluate(NEAR_JS, {"speed": 20, "other": 10, "daylight": 0.8, "cars": 2, "crash": True})
        check("a crash loses the open chain: two near misses, then a parked van, pays nothing",
              wreck["tricks"] == 2 and wreck["paid"] == 0 and "CRASHED" in wreck["lostCard"] and wreck["lost"] > 0, brief(wreck))
        page.evaluate(REST_JS, 1.5)
        heat = page.evaluate(NEAR_JS, {"speed": 20, "other": 10, "daylight": 0.8, "cars": 1, "stars": 2})
        check("with wanted stars on, the same near miss pays double ($50)",
              heat["tricks"] == 1 and heat["paid"] == 50, brief(heat))

        # 5. two stars is a pursuit: no shots at a car on the move
        page.evaluate(REST_JS, 1.0)
        held = page.evaluate(AIM_JS, {"stars": 2, "speed": 32, "roll": 0, "seconds": 4})
        check("at two stars no shot is fired at a car doing 32 m/s, even with dice that always hit",
              held["hits"] == 0 and held["other"] == 0 and held["stars"] == 2, brief(held))
        crawl = page.evaluate(AIM_JS, {"stars": 2, "speed": 5, "roll": 0.2, "seconds": 4})
        check("a car crawling at 5 m/s is shot at as before", crawl["hits"] >= 3, brief(crawl))
        three = page.evaluate(AIM_JS, {"stars": 3, "speed": 32, "roll": 0, "seconds": 4})
        check("from three stars a fast car is shot at again", three["hits"] >= 3, brief(three))

        # 6. losing the police pays
        page.evaluate(REST_JS, 1.0)
        full = page.evaluate(GETAWAY_JS, {"stars": 2, "seen": 10.6})
        check("a two-star chase the police had in sight for 10 s pays $150 when they are lost",
              full["stars"] == 0 and full["paid"] == 150 and full["getaways"] == 1 and "2-star getaway" in full["words"], brief(full))
        check("while they cannot see you a LOSING THEM bar fills up under the stars, and it is hidden while they can",
              full["bar"] and full["barWide"] >= 90 and not full["barWhileSeen"], brief(full))
        part = page.evaluate(GETAWAY_JS, {"stars": 2, "seen": 4.2})
        check("seen for only 4 s, the same getaway pays 40% of it ($60)",
              part["stars"] == 0 and part["paid"] == 60, brief(part))
        one = page.evaluate(GETAWAY_JS, {"stars": 1, "seen": 10.6})
        check("losing a one-star patrol pays nothing", one["stars"] == 0 and one["paid"] == 0 and one["getaways"] == 0, brief(one))
        three_star = page.evaluate(GETAWAY_JS, {"stars": 3, "seen": 10.6})
        check("a three-star getaway pays $400", three_star["stars"] == 0 and three_star["paid"] == 400, brief(three_star))

        # 7. the city has a voice
        page.evaluate(REST_JS, 6.0)          # the streets fill up again
        horn = page.evaluate(HONK_JS, {"seconds": 6})
        check("a driver who has to stop behind the player's car sounds the horn within 4 s",
              horn["honks"] >= 1 and horn.get("own") and horn.get("stopped") and 0 < horn["first"] < 4, brief(horn))
        call = page.evaluate(CALL_JS, {"seconds": 12})
        check("with no stars a patrol car answers a call: siren on, faster than 18 m/s (traffic does 10 to 15), and nobody is wanted",
              call["siren"] and call["call"] > 5 and call["top"] > 18 and call["quietSpeed"] < 16 and call["starsAfter"] == 0, brief(call))

        # 8. speed can be heard and seen
        sound = page.evaluate(SOUND_JS)
        check("the engine has five gears and its note drops at every change",
              sound and sound["first"] == 1 and sound["gears"] == [2, 3, 4, 5] and all(drop > 30 for drop in sound["drops"]), brief(sound and {"gears": sound["gears"], "drops": sound["drops"]}))
        check("tyres squeal only in a slide, wind is heard only at speed, and the engine is louder under power",
              sound and sound["slide"]["squeal"] > 0.03 and sound["cruise"]["squeal"] == 0 and sound["still"]["wind"] == 0
              and sound["fast"]["wind"] > 0.03 and sound["power"]["engine"] > sound["coast"]["engine"]
              and sound["voices"] == ["engine", "engine2", "squeal", "wind"],
              brief(sound and {key: sound[key] for key in ("still", "cruise", "fast", "slide", "voices")}))
        quick = page.evaluate(SPEED_JS, {"speed": 46, "seconds": 2.5})
        check("at 46 m/s the lens is more than 17 degrees wider (1.8: 14) and the edges of the screen are dark",
              quick["lens"] > 17 and quick["rush"] is not None and quick["rush"] >= 0.95, brief(quick))
        calm = page.evaluate(SPEED_JS, {"speed": 12, "seconds": 2.5})
        check("at 12 m/s the edges are clear and the lens is under 6 degrees wider",
              calm["rush"] == 0 and calm["lens"] < 6, brief(calm))

        # 9. odd jobs from the first story job on
        learner = page.evaluate(JOBS_JS, 0)
        check("before the first story job J keeps the first job on offer",
              learner["startStory"] and all(press["story"] for press in learner["presses"]), brief([p["name"] for p in learner["presses"]]))
        jobs = page.evaluate(JOBS_JS, 1)
        stories = [press["story"] for press in jobs["presses"]]
        odd = [press for press in jobs["presses"] if not press["story"]]
        check("after it, J goes from the story job to an odd job and back, and the second odd job is another kind",
              jobs["startStory"] and stories == [False, True, False, True] and odd[0]["kind"] != odd[1]["kind"]
              and "back to the story job" in odd[0]["words"],
              brief([[p["name"], p["kind"], p["story"]] for p in jobs["presses"]]))

        check("no console errors", not problems, "; ".join(problems[:3]))
        browser.close()


if __name__ == "__main__":
    run(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "NeonCoast.html")
    failed = [name for name, ok, _ in results if not ok]
    print(f"\n{len(results) - len(failed)} / {len(results)} checks passed")
    sys.exit(1 if failed else 0)
