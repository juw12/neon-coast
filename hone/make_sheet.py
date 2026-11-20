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
    "driving, a job in progress, the Sol Wheel at dusk, a police chase, night, pause menu." if version != "v0" and version != "v1"
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
    "- Jobs are passed by script (the car is moved between markers), so their difficulty is not measured.",
    "- Only tested in Chrome on one Windows laptop; no phone or gamepad controls.",
]
(ROOT / "hone" / f"{version}.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
print("wrote", ROOT / "hone" / f"{version}.md")
