"""Bundle the game into one offline HTML file: NeonCoast.html."""
import urllib.request
from pathlib import Path

ROOT = Path(__file__).parent
THREE_URL = "https://unpkg.com/three@0.149.0/build/three.min.js"
THREE_FILE = ROOT / "vendor" / "three.min.js"
PARTS = ["01-world.js", "02-entities.js", "03-systems.js", "03b-touch.js", "03c-havoc.js", "04-main.js"]


def main():
    if not THREE_FILE.exists():
        THREE_FILE.parent.mkdir(exist_ok=True)
        with urllib.request.urlopen(THREE_URL, timeout=40) as response:
            THREE_FILE.write_bytes(response.read())

    three = THREE_FILE.read_text(encoding="utf-8")
    game = "\n".join((ROOT / "src" / name).read_text(encoding="utf-8") for name in PARTS)
    for label, code in (("three.js", three), ("game", game)):
        if "</script" in code.lower():
            raise SystemExit(f"{label} contains a closing script tag and cannot be inlined")

    page = (ROOT / "src" / "template.html").read_text(encoding="utf-8")
    page = page.replace("/*__THREE__*/", three).replace("/*__GAME__*/", game)
    out = ROOT / "NeonCoast.html"
    # the same bytes whichever system builds it: the file has had Windows line ends since 1.0
    with open(out, "w", encoding="utf-8", newline="\r\n") as handle:
        handle.write(page)
    print(f"{out}  {out.stat().st_size / 1024:.0f} KB, game code {len(game.splitlines())} lines")


if __name__ == "__main__":
    main()
