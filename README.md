# Neon Coast

[Play in your browser](https://juw12.github.io/neon-coast/) · [Download the offline build](https://github.com/juw12/neon-coast/raw/refs/heads/main/NeonCoast.html)

![Four stars at night: the police helicopter and its searchlight](docs/night-helicopter.jpg)

| | | |
|---|---|---|
| ![Sol Beach and the Sol Wheel at dusk](docs/sol-wheel.jpg) | ![Meridian at night](docs/night-city.jpg) | ![Road arrows on the way to a job](docs/dusk-drive.jpg) |
| ![Rolling up to a cab fare](docs/cab-fare.jpg) | ![The whole island on M](docs/whole-map.jpg) | ![Sol Beach by day with the Coastliner airship](docs/day-beach.jpg) |
| ![A painted wall on Sol Beach](docs/mural.jpg) | ![The city from the Sol Wheel ride](docs/wheel-ride.jpg) | ![The Rustport quay: containers and gantry cranes](docs/rustport-quay.jpg) |
| ![Meridian crowns at dusk](docs/meridian-crowns.jpg) | ![Sol Beach hotels with balconies](docs/beach-balconies.jpg) | Screenshots are taken from the running game by `test/smoke.py` and `test/city_shots.py`. |

An original single-player 3D island sandbox in one HTML file: steal cars, run jobs, drive a cab, buy
property, outrun the police. Not a Rockstar product or mod; no Grand Theft Auto installation or assets needed.

Open NeonCoast.html in Chrome or Edge on a desktop with WebGL. No server, network, installer or account
needed. Choose New Game or Continue. Walk up to a car and press F. Drive with WASD; Space is the handbrake.
Follow the arrows on the road to the yellow J marker for the first of six jobs. Press M for the whole map
and P to pause. Progress is stored in your browser, so use the same browser and file location to resume.

## Version 1.4 · Skyline

- **Buildings with outlines.** No more plain boxes: roof lips everywhere, slanted and stepped crowns, corner
  fins and water tanks on the Meridian towers, balcony bands and round penthouses on the Sol Beach hotels,
  saw-tooth roofs and yards in Rustport, chimneys in the suburbs. Beyond the Rustport waterline there is a
  quay with container stacks, three gantry cranes and a freighter.
- **Smoother edges.** A second anti-aliasing pass on Pretty graphics.
- **A learner phase.** Until your first job is done, crimes bring no stars, so the first minute cannot end
  in an arrest. After it the police watch you as before.
- **A fifth odd job, on foot.** Paper Round: four envelopes round one block against the clock for $550.
  After the story, **J** asks the contacts for another kind of odd job.
- **Three radio stations in three styles.** Neon FM (synthwave), Coast 98 (beach pop) and Low Tide (late
  night) now differ in drums, bass and tune, not only in speed. **R** in a car turns the dial.
- **More of the game played by key presses in the tests.** `test/drive.py` now plays three story jobs.

Saves from versions 1.0 to 1.3 load as they are.

## Version 1.3 · Clear Day

- **A first job inside a minute.** Get in the red car, drive to the job beam, follow the beach road to the
  Sol Wheel pier. It used to end at the respray shop on the far side of town. Until that job is done your
  car smokes when battered but cannot be wrecked.
- **Ride the Sol Wheel.** Walk to the foot of the pier and press **E** ($25). The camera goes once round the
  wheel over the beach and the city; the ride patches you up and marks the three nearest hidden packages
  with a **?** on the map. **F** gets off early.
- **A city with a daytime look.** 86 painted walls in eight designs, two per district. Parasols and towels
  on the sand, sailing boats, gulls, and the Coastliner airship lapping the island. Teal sea, warm horizon,
  walls shaded from foot to top, new colours for the Meridian towers and the Rustport sheds.
- **Police heat reaches everything.** With stars on you no cab passenger gets in, the Tune-up shop is shut
  and the wheel sells no ticket. Walking into a property you own loses the police at one or two stars.
- **Perks you can see coming.** Each package, fare or job shows a card with the distance to the next perk
  ("Body armour 4 / 5"), and an unlock is announced with what it gives.
- **A quieter screen.** The HUD is cash and health. Stars show only when you are wanted, the weapon line for
  five seconds after it changes, and the clock moved to the map and pause screens. The pause screen is three
  buttons, settings and perks; the map legend sits on the map (**M**). The title screen shows six keys.


## Version 1.2 · City Lights

- **Cab fares.** Take any yellow City Cab and press **T**. A passenger waves from the kerb: stop in the ring
  to pick up, stop in the next ring to drop off before the clock runs out. Pay is $60 plus $0.38 a metre, a
  tip for spare seconds (at most half the fare) and 10% more for each fare in a row, up to 50%.
- **Property.** Four places carry a **$** on the map. Walk into the ring and press **E** to buy ($2,000 to
  $14,000). Each pays rent by the game hour, holds up to six hours of it, and patches you up when you walk
  back in.
- **Police helicopter.** At four stars a helicopter flies in with a searchlight and keeps you in sight from
  above, so a side street no longer hides you. At five stars its gunner fires. A respray still clears it.
- **Finding the way.** Arrows on the road in your lane and a line on the minimap lead to the current
  target. **M** opens a map of the whole island with every place, your properties and the route.
- **Perks.** 5 hidden packages: 25% less damage. 10 packages: respray at half price. 10 cab fares: double
  tips. All six story jobs: 50% more rent. The pause screen shows your progress on each.
- **Odd jobs in four kinds** after the story: Rush Order, Repo Run, Block Dash and Hot Parcel (five since 1.4).
- A brighter night: lit windows, shop fronts, neon and lamps glow on Pretty graphics.

## Harbor courier shift

Choose **Harbor courier shift** at the title screen for the Hauler van, or press
**G** between story jobs using any vehicle. Stop in the numbered amber rings:
film cans at Reel Lab, a projector lamp at Electric Works, then Pier 03.
The departure clock starts once you have wheels. Earn $450 plus a time bonus;
your quickest successful run is saved separately from the six story jobs.
Pause to cancel the shift.

## Tune-up shop and landmarks

The cyan **T** on the map is the Tune-up shop. Stop your car in the ring to buy the next of three stages
($1,500, $3,000, $6,000). Each stage adds 14% acceleration and 7% top speed to the car you drive and is kept
in the save. Driving through without stopping buys nothing.

Things to steer by: the Sol Wheel (a turning Ferris wheel on a pier off Sol Beach), the Coastliner airship, the Meridian
Spire on the tallest tower, red-light masts on the other towers, smokestacks over Rustport and the gantry
cranes on its quay, and pitched roofs on the low suburb houses.

## Tests

Needs Python with Playwright and Chrome. Run from this folder after `python build.py`:

- `python test/gates.py` - ten pass/fail gates (offline single file, clean console, the core loop with 22
  checks, all six jobs pay, arrest, mouse look, frame rate, HUD overlap at three sizes, own names, clear first view).
- `python test/harbor.py` - the harbor courier shift from start to payout, cancel and timeout.
- `python test/city.py` - 39 checks on cab fares, property, perks, the helicopter, the route, the map,
  saves from older versions, the Sol Wheel ride, what the police stars switch off, the learner phase, the
  **J** key, the Paper Round and the building outlines.
- `python test/radio.py` - 14 checks that record the three radio stations at the game's master output and
  measure them: loud enough, no clipping, the beat repeating at each station's own tempo, different tone.
  It cannot tell whether the music is pleasant.
- `python test/drive.py 5` - plays the first story job five times with key presses only (W A S D, F and
  Space; nothing is moved by script) and reports how many runs finished. `python test/drive.py 3 2` plays
  job 2 (Hot Delivery, against its 80 s clock) and `python test/drive.py 3 4` plays job 4 (Borrowed Time,
  a car theft with the police after it); for those two the save file is first set to "earlier jobs done".
  On the 1.4 build: job 1 finished 5 of 5 runs (38.5 to 50.9 s), job 2 finished 3 of 3 (110.2 to 132.0 s),
  job 4 finished 2 of 3 (169.1 s, and 317.4 s after one arrest and a second try); in the third run the
  script was arrested or taken out three times and ran out of its seven minutes. Traffic is random, so
  results vary.

- `python test/fps_ab.py NeonCoast.html other-build.html` - frame rate of two builds measured in turn, for
  when the PC is busy and the frame-rate gate reads low.

Apart from those three driven jobs, jobs are passed by script (the car or the player is moved between
markers), so the tests do not measure how hard the two races, the three-star getaway, the odd jobs, the
cab fares or the courier shift are for a person. Tested in Chrome on one Windows laptop; no phone or gamepad
controls. No real players have tried it yet; the scores in `hone/refine_log.md` come from AI judges reading
a fact sheet and screenshots. `hone/rubric.md` holds the scoring rubric.

## Edit and rebuild

Edit the JavaScript modules or the HTML template in src/, then run
`python build.py` from this folder. Three.js r149 is vendored so the rebuild
works offline. See LICENSE for redistribution terms.
