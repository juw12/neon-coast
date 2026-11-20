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
    "A browser game in one offline HTML file (about 0.7 MB, three.js inlined). The judges see this sheet and",
    "screenshots taken from the running game by the test script: title screen, first view after New Game,",
    "driving, a job in progress, the Sol Wheel at dusk, a police chase, night, pause menu."
    + (" From v4 also: a cab fare, the whole map, the helicopter at four stars, a property by day." if version >= "v4" else "")
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
lines += [
    "## Not covered by the tests",
    "",
    "- How the driving feels to a person, and how the synth radio sounds.",
]
drive_file = ROOT / "test" / "drive-result.json"
if drive_file.exists():
    drive = json.loads(drive_file.read_text(encoding="utf-8"))
    passed_times = [s["seconds"] for s in drive["samples"] if s["passed"]]
    failed = [s["phase"] for s in drive["samples"] if not s["passed"]]
    lines += [
        f"- Real input: test/drive.py plays the first story job with key presses only (W A S D and F, nothing moved"
        f" by script). It finished {drive['passed']} of {drive['runs']} runs"
        + (f", in {min(passed_times)} to {max(passed_times)} s" if passed_times else "")
        + (f"; the failed runs ended as: {'; '.join(failed)}" if failed else "")
        + ". Only that one job is driven this way.",
        "- Every other job, the cab fares and the courier shift are passed by script (the car is moved between",
        "  markers), so their difficulty and their time limits are not measured.",
    ]
else:
    lines += ["- Jobs are passed by script (the car is moved between markers), so their difficulty is not measured."]
lines += [
    "- Only tested in Chrome on one Windows laptop; no phone or gamepad controls.",
    "- No real players have tried it yet. The scores are from AI judges reading this sheet and the screenshots.",
]
(ROOT / "hone" / f"{version}.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
print("wrote", ROOT / "hone" / f"{version}.md")
