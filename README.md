# Neon Coast

[Play in your browser](https://juw12.github.io/neon-coast/) · [Download the offline build](https://github.com/juw12/neon-coast/raw/refs/heads/main/NeonCoast.html)

An original single-player 3D island sandbox. Not a Rockstar product or mod;
no Grand Theft Auto installation or assets needed.

Open NeonCoast.html in Chrome or Edge on a desktop with WebGL. No server,
network, installer or account needed. Choose New Game or Continue. Walk up
to a car and press F. Drive with WASD; Space is the handbrake. Visit the
yellow J marker for the first of six jobs. Press P to pause. Progress is
stored in your browser, so use the same browser and file location to resume.

## Harbor courier shift

Choose **Harbor courier shift** at the title screen for the Hauler van, or press
**G** between story jobs using any vehicle. Stop in the numbered amber rings:
film cans at Reel Lab, a projector lamp at Electric Works, then Pier 03.
The departure clock starts once you have wheels. Earn $450 plus a time bonus;
your quickest successful run is saved separately from the six story jobs.
Pause to cancel the shift. Existing story saves work without migration.

## Tune-up shop and landmarks

The cyan **T** on the map is the Tune-up shop. Stop your car in the ring to buy the next of three stages
($1,500, $3,000, $6,000). Each stage adds 14% acceleration and 7% top speed to the car you drive and is kept
in the save. Driving through without stopping buys nothing.

Things to steer by: the Sol Wheel (a turning Ferris wheel on a pier off Sol Beach, looks only), the Meridian
Spire on the tallest tower, red-light masts on the other towers, smokestacks over Rustport, and pitched roofs
on the low suburb houses. A new game starts on an open street with the red starter car ahead, a hint for the
first job, and an arrow with the distance to the next job. The pause screen explains the map letters.

## Tests

Needs Python with Playwright and Chrome. Run from this folder after `python build.py`:

- `python test/gates.py` - ten pass/fail gates (offline single file, clean console, the core loop with 22
  checks, all six jobs pay, arrest, mouse look, frame rate, HUD overlap at three sizes, own names, clear first view).
- `python test/harbor.py` - the harbor courier shift from start to payout, cancel and timeout.

The jobs are passed by script (the car is moved between markers), so the tests do not measure how hard they
are for a person. Tested in Chrome on one Windows laptop; no phone or gamepad controls.
`hone/rubric.md` and `hone/refine_log.md` hold the scoring rubric and the round-by-round log.

## Edit and rebuild

Edit the JavaScript modules or the HTML template in src/, then run
`python build.py` from this folder. Three.js r149 is vendored so the rebuild
works offline. See LICENSE for redistribution terms.
