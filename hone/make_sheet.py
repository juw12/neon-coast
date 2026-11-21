"""Write the fact sheet the council judges (they cannot play the game). Usage: make_sheet.py v0 "note lines..." """
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
version = sys.argv[1]
number = int("".join(ch for ch in version[1:3] if ch.isdigit()) or 0)   # "v11" sorts after "v9"
changes = sys.argv[2:]
result = json.loads((ROOT / "test" / "gates-result.json").read_text(encoding="utf-8"))
features = (ROOT / "hone" / "features.md").read_text(encoding="utf-8").strip()

lines = [
    f"# Neon Coast {version} - fact sheet for judging",
    "",
    "A browser game in one offline HTML file (about 0.8 MB, three.js inlined). The judges see this sheet and",
    "screenshots taken from the running game by the test script: title screen, first view after New Game,",
    "driving, a job in progress, the Sol Wheel at dusk, a police chase, night, pause menu."
    + (" From v4 also: a cab fare, the whole map, the helicopter at four stars, a property by day." if number >= 4 else "")
    + (" From v5 also: Sol Beach by day, painted walls in three districts, the view from the Sol Wheel ride,"
       " the perk card." if number >= 5 else "")
    + (" From v7 also: the Rustport quay, the Meridian crowns at dusk, the beach hotel balconies, the Rustport"
       " roofs, a Paper Round in progress and the radio dial." if number >= 7 else "")
    + (" From v8 also: the game on a phone held on its side and upright (an emulated phone in Chrome)."
       if number >= 8 else "")
    + (" From v9 also: the Rustport dock apron and a Shadow Run in progress." if number >= 9 else "")
    if number >= 2
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
measured = set()
for job, file_name in ((1, "drive-result.json"), (2, "drive-result-job2.json"), (3, "drive-result-job3.json"),
                       (4, "drive-result-job4.json"), (5, "drive-result-job5.json"), (6, "drive-result-job6.json"),
                       ("odd", "drive-result-tail.json")):
    drive_file = ROOT / "test" / file_name
    if not drive_file.exists():
        continue
    measured.add(job)
    drive = json.loads(drive_file.read_text(encoding="utf-8"))
    passed_times = [s["seconds"] for s in drive["samples"] if s["passed"]]
    failed = [s["phase"] + (" (" + s["error"] + ")" if s.get("error") else "") for s in drive["samples"] if not s["passed"]]
    tries = [s.get("tries", 1) for s in drive["samples"]]
    downs = sum(s.get("downs", 0) for s in drive["samples"])
    reasons = {}
    for s in drive["samples"]:
        for why in s.get("fails", []):
            reasons[why] = reasons.get(why, 0) + 1
    drive_lines.append(
        f"  - {'Odd job' if job == 'odd' else 'Job ' + str(job)} ({drive.get('name', 'First Wheels')}): finished {drive['passed']} of {drive['runs']} runs"
        + ((f", in {min(passed_times)} to {max(passed_times)} s" if min(passed_times) != max(passed_times)
            else f", in {passed_times[0]} s") if passed_times else "")
        + (f", tries per run {tries}" if max(tries) > 1 else "")
        + (f", arrested or taken out {downs} time{'s' if downs != 1 else ''} on the way" if downs else "")
        + ("; failed tries ended with: " + ", ".join(f"'{why}' x{count}" for why, count in reasons.items()) if reasons else "")
        + (f"; the failed runs ended as: {'; '.join(failed)}" if failed else "") + ".")
# runs that are not in the result files (made earlier, or in other conditions) are told in a notes file
notes_file = ROOT / "hone" / f"drive-notes-{version}.md"
drive_notes = notes_file.read_text(encoding="utf-8").rstrip("\n").split("\n") if notes_file.exists() else []
if drive_lines:
    by_script = []
    if not {3, 6} <= measured:
        by_script.append("the two races (jobs 3 and 6)")
    if 5 not in measured:
        by_script.append("the three-star getaway (job 5)")
    by_script.append("the other odd jobs" if "odd" in measured else "the odd jobs")
    by_script += ["the cab fares", "the courier shift"]
    lines += [
        "- Real input: test/drive.py plays jobs with key presses only (W A S D, F, Space and J, nothing moved by",
        "  script; for every job but the first the save file is first set to 'earlier jobs done'). A script is not a",
        "  person: it reads the game state and never gets lost, and it cannot say whether a job is fun. Results"
        + (" (" + os.environ["DRIVE_NOTE"] + "):" if os.environ.get("DRIVE_NOTE") else " of this version:"),
    ] + drive_lines + drive_notes + [
        "- Passed by script only (the car or the player is moved between markers), so their difficulty and their",
        "  time limits are not measured: " + ", ".join(by_script[:-1]) + " and " + by_script[-1] + ".",
    ]
else:
    lines += ["- Jobs are passed by script (the car is moved between markers), so their difficulty is not measured."]
lines += [
    "- Tested in Chrome on one Windows laptop and (release 1.5) on one Mac. Since 1.5 there are touch controls for"
    if number >= 8 else "- Only tested in Chrome on one Windows laptop; no phone or gamepad controls.",
] + ([
    "  phones and tablets; test/touch.py checks them on an emulated phone in Chrome (" + os.environ.get("TOUCH_NOTE", "result not recorded") + ").",
    "  No real phone or tablet has run the game yet, so thumb reach, heat and frame rate on a phone are not known.",
    "  No gamepad controls.",
] if number >= 8 else []) + [
    "- No real players have tried it yet. The scores are from AI judges reading this sheet and the screenshots.",
]
(ROOT / "hone" / f"{version}.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
print("wrote", ROOT / "hone" / f"{version}.md")
