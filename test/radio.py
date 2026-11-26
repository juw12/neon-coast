"""Radio check: the three stations are measured, because a test cannot listen.

It sits in a parked car, turns the dial with the R key and records what leaves
the game's master output (after the limiter) for ten seconds per station:

  * loudness: every station can be heard and none of them clips
  * the beat: the loudness curve repeats at the station's own tempo
  * the stations do not sound alike: their average spectra differ
  * Radio Off is quieter than any station

This proves the stations play in time, at different tempos and with different
tone. It does not prove the music is good: that needs ears.

    python test/radio.py            # one line per check, result in test/radio-result.json
"""
import os
import json
import math
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

# NEON_WINDOW=1 opens a real window instead of a headless browser (a GitHub Mac uses its graphics card in both).
# NEON_CHROME_ARGS adds flags (the frame-rate gate runs without the 60 Hz cap of the display).
WINDOW = os.environ.get("NEON_WINDOW") == "1"
EXTRA_ARGS = os.environ.get("NEON_CHROME_ARGS", "").split()

ROOT = Path(__file__).resolve().parent.parent
SECONDS = 10.0
results = []

RECORD_JS = """(seconds) => new Promise(done => {
  const tap = NEON.audio.tap, ctx = NEON.audio.ctx;
  const wave = new Float32Array(tap.fftSize), bins = new Uint8Array(tap.frequencyBinCount);
  const sum = new Float64Array(tap.frequencyBinCount);
  const times = [], level = [];
  let peak = 0, frames = 0;
  const start = ctx.currentTime;
  const timer = setInterval(() => {
    tap.getFloatTimeDomainData(wave);
    let square = 0;
    // only the newest 20 ms, so the curve keeps its sharp edges
    const from = wave.length - Math.round(ctx.sampleRate * 0.02);
    for (let k = from; k < wave.length; k++) { square += wave[k] * wave[k]; peak = Math.max(peak, Math.abs(wave[k])); }
    times.push(ctx.currentTime - start);
    level.push(Math.sqrt(square / (wave.length - from)));
    tap.getByteFrequencyData(bins);
    for (let k = 0; k < bins.length; k++) sum[k] += bins[k];
    frames++;
    if (ctx.currentTime - start >= seconds) {
      clearInterval(timer);
      done({ times, level, peak, spectrum: Array.from(sum, v => v / frames), rate: ctx.sampleRate });
    }
  }, 10);
})"""


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS  " if ok else "FAIL  ") + name + (("  |  " + str(detail)) if detail else ""))


def resample(times, values, step):
    """The loudness curve on an even time grid (the browser timer is not even)."""
    out = []
    k = 0
    t = 0.0
    while t <= times[-1]:
        while k + 1 < len(times) and times[k + 1] < t:
            k += 1
        out.append(values[k])
        t += step
    return out


def repeat_strength(curve, lag):
    """How well the curve matches itself `lag` samples later: 1 is a perfect repeat, 0 is none."""
    mean = sum(curve) / len(curve)
    centred = [v - mean for v in curve]
    energy = sum(v * v for v in centred) or 1e-12
    return sum(centred[k] * centred[k + lag] for k in range(len(centred) - lag)) / energy


def spectrum_distance(a, b):
    """0 when two average spectra have the same shape, up to 1 when they share nothing."""
    dot = sum(x * y for x, y in zip(a, b))
    size = math.sqrt(sum(x * x for x in a) * sum(y * y for y in b)) or 1e-12
    return 1 - dot / size


def run():
    problems = []
    report = {"stations": []}
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=not WINDOW, args=[
            "--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] + EXTRA_ARGS)
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))
        page.on("console", lambda m: problems.append(f"{m.type}: {m.text}") if m.type == "error" else None)
        page.goto((ROOT / "NeonCoast.html").as_uri())
        page.wait_for_timeout(1000)
        page.click("#btn-new")
        page.wait_for_timeout(800)
        # sit in the parked starter car, engine idling
        page.evaluate("""() => { const n = NEON, p = n.player;
            const car = n.vehicles.filter(v => v.type === 'muscle' && v.driver !== 'ai')
              .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
            p.x = car.x + 2.2; p.z = car.z; n.tryEnterExit(); }""")
        page.wait_for_timeout(500)
        stations = page.evaluate("() => NEON.STATIONS.map(s => ({ name: s.name, tag: s.tag || '', bpm: s.bpm || 0 }))")
        running = page.evaluate("() => !!NEON.player.car && NEON.audio.ctx.state")
        check("the sound engine runs with the player in a car", running == "running", str(running))

        for index, station in enumerate(stations):
            # turn the dial with the real key until this station is on
            for _ in range(len(stations)):
                if page.evaluate("() => NEON.radio.station") == index:
                    break
                page.keyboard.press("r")
                page.wait_for_timeout(150)
            page.wait_for_timeout(1500)          # let the crackle and the fade pass
            toast = page.evaluate("() => (document.getElementById('radio') || {}).textContent || ''")
            take = page.evaluate(RECORD_JS, SECONDS)
            step = 0.01
            curve = resample(take["times"], take["level"], step)
            loud = math.sqrt(sum(v * v for v in curve) / len(curve))
            entry = {"name": station["name"], "tag": station["tag"], "bpm": station["bpm"], "toast": toast,
                     "peak": round(take["peak"], 3), "rms": round(loud, 4), "samples": len(take["times"]),
                     "spectrum": take["spectrum"]}
            if station["bpm"]:
                beat = 60.0 / station["bpm"]
                # every pattern in the game is one bar (four beats) long, so the curve must repeat after a bar
                bar = repeat_strength(curve, round(4 * beat / step))
                # the same curve tested against a tempo that is 12 % off must match worse
                off = max(repeat_strength(curve, round(4 * beat * 1.12 / step)),
                          repeat_strength(curve, round(4 * beat / 1.12 / step)))
                best_lag = max(range(round(1.2 / step), round(3.2 / step)), key=lambda lag: repeat_strength(curve, lag))
                entry.update({"repeat_at_bar": round(bar, 3), "repeat_off_tempo": round(off, 3),
                              "strongest_repeat_seconds": round(best_lag * step, 2), "bar_seconds": round(4 * beat, 2)})
            report["stations"].append(entry)
        page.wait_for_timeout(200)
        browser.close()

    off = report["stations"][0]
    music = report["stations"][1:]
    for entry in music:
        label = f"{entry['name']} ({entry['tag']}, {entry['bpm']} bpm)"
        check(f"{label}: can be heard and does not clip", 0.01 < entry["rms"] and entry["peak"] < 1.0,
              f"rms {entry['rms']}, peak {entry['peak']}")
        check(f"{label}: louder than Radio Off", entry["rms"] > off["rms"] * 2, f"{entry['rms']} against {off['rms']}")
        check(f"{label}: the beat repeats every bar at its own tempo",
              entry["repeat_at_bar"] > 0.25 and entry["repeat_at_bar"] > entry["repeat_off_tempo"] + 0.1,
              f"match at one bar ({entry['bar_seconds']} s) {entry['repeat_at_bar']}, at a tempo 12 % off {entry['repeat_off_tempo']}")
    pairs = []
    for a in range(len(music)):
        for b in range(a + 1, len(music)):
            pairs.append((music[a]["name"], music[b]["name"], round(spectrum_distance(music[a]["spectrum"], music[b]["spectrum"]), 4)))
    report["spectrum_distance"] = pairs
    check("no two stations have the same tone", all(d > 0.01 for _, _, d in pairs), "; ".join(f"{a} / {b}: {d}" for a, b, d in pairs))
    check("no two stations share a tempo", len({e["bpm"] for e in music}) == len(music), str([e["bpm"] for e in music]))
    check("the dial names each station and its style", all(e["tag"] and e["tag"] in e["toast"] for e in music),
          "; ".join(e["toast"] for e in music))
    check("no console errors", not problems, "; ".join(problems[:3]))
    for entry in report["stations"]:
        entry.pop("spectrum")
    report["checks"] = [{"name": name, "passed": ok, "detail": detail} for name, ok, detail in results]
    (ROOT / "test" / "radio-result.json").write_text(json.dumps(report, indent=2), encoding="utf-8")


if __name__ == "__main__":
    run()
    failed = [name for name, ok, _ in results if not ok]
    print(f"\n{len(results) - len(failed)} / {len(results)} checks passed")
    sys.stdout.flush()
    sys.exit(1 if failed else 0)
