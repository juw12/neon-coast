"""Write the fact sheet the council judges (they cannot play the game). Usage: make_sheet.py v0 "note lines..." """
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
version = sys.argv[1]
changes = sys.argv[2:]
result = json.loads((ROOT / "test" / "gates-result.json").read_text(encoding="utf-8"))
features = (ROOT / "hone" / "features.md").read_text(encoding="utf-8").strip()

lines = [
    f"# Neon Coast {version} - fact sheet for judging",
    "",
    "A browser game in one offline HTML file (about 0.8 MB, three.js inlined). The judges see this sheet and",
    "screenshots taken from the running game by the test script: title screen, first view after New Game,",
    "driving, a job in progress, the Sol Wheel at dusk, a police chase, night, pause menu."
    + (" From v4 also: a cab fare, the whole map, the helicopter at four stars, a property by day." if version >= "v4" else "")
    + (" From v5 also: Sol Beach by day, painted walls in three districts, the view from the Sol Wheel ride,"
       " the perk card." if version >= "v5" else "")
    + (" From v7 also: the Rustport quay, the Meridian crowns at dusk, the beach hotel balconies, the Rustport"
       " roofs, a Paper Round in progress and the radio dial." if version >= "v7" else "")
    if version != "v0" and version != "v1"
    else "driving, a police chase, night, pause menu.",
    "",
    features,
    "",
    "## Gate results for this version (from test/gates.py, run in real Chrome)",
    "",
]
for name, gate in result["gates"].items():
    lines.append(f"- {'PASS' if gate['ok'] else 'FAIL'} {name}: {gate['detail']}")
lines += ["", f"Gates passed: {result['passed']} of {result['total']}", ""]
if changes:
    lines += ["## Changed in this version", ""] + [f"- {c}" for c in changes] + [""]
radio_file = ROOT / "test" / "radio-result.json"
if radio_file.exists():
    radio = json.loads(radio_file.read_text(encoding="utf-8"))
    good = sum(1 for c in radio["checks"] if c["passed"])
    lines += ["## Radio, measured (test/radio.py)", "",
              f"{good} of {len(radio['checks'])} checks passed. Per station, recorded at the master output for ten seconds:", ""]
    for s in radio["stations"]:
        if s["bpm"]:
            lines.append(f"- {s['name']} ({s['tag']}, {s['bpm']} bpm): loudness {s['rms']} rms, peak {s['peak']} (1.0 would clip),"
                         f" the loudness curve matches itself one bar later at {s['repeat_at_bar']} (1 is a perfect repeat)"
                         f" and at {s['repeat_off_tempo']} for a tempo 12% off.")
        else:
            lines.append(f"- {s['name']}: loudness {s['rms']} rms (engine only).")
    lines += ["- Tone: distance between average spectra (0 = same tone): "
              + "; ".join(f"{a} / {b} {d}" for a, b, d in radio["spectrum_distance"]) + ".", ""]

lines += [
    "## Not covered by the tests",
    "",
    "- How the driving feels to a person. The radio is measured (in time, three tempos, different tone, no",
    "  clipping) but nobody has listened to it: whether the music is pleasant is not known.",
]
drive_lines = []
for job, file_name in ((1, "drive-result.json"), (2, "drive-result-job2.json"), (4, "drive-result-job4.json")):
    drive_file = ROOT / "test" / file_name
    if not drive_file.exists():
        continue
    drive = json.loads(drive_file.read_text(encoding="utf-8"))
    passed_times = [s["seconds"] for s in drive["samples"] if s["passed"]]
    failed = [s["phase"] for s in drive["samples"] if not s["passed"]]
    tries = [s.get("tries", 1) for s in drive["samples"]]
    downs = sum(s.get("downs", 0) for s in drive["samples"])
    drive_lines.append(
        f"  - Job {job} ({drive.get('name', 'First Wheels')}): finished {drive['passed']} of {drive['runs']} runs"
        + (f", in {min(passed_times)} to {max(passed_times)} s" if passed_times else "")
        + (f", tries per run {tries}" if max(tries) > 1 else "")
        + (f", arrested or taken out {downs} times on the way" if downs else "")
        + (f"; the failed runs ended as: {'; '.join(failed)}" if failed else "") + ".")
if drive_lines:
    lines += [
        "- Real input: test/drive.py plays story jobs with key presses only (W A S D, F and Space, nothing moved by",
        "  script; for jobs 2 and 4 the save file is first set to 'earlier jobs done'). Results of this version:",
    ] + drive_lines + [
        "- The two races (jobs 3 and 6), the three-star getaway (job 5), the odd jobs, the cab fares and the courier",
        "  shift are passed by script (the car or the player is moved between markers), so their difficulty and",
        "  their time limits are not measured.",
    ]
else:
    lines += ["- Jobs are passed by script (the car is moved between markers), so their difficulty is not measured."]
lines += [
    "- Only tested in Chrome on one Windows laptop; no phone or gamepad controls.",
    "- No real players have tried it yet. The scores are from AI judges reading this sheet and the screenshots.",
]
(ROOT / "hone" / f"{version}.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
print("wrote", ROOT / "hone" / f"{version}.md")
