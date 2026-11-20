## What is in the game

- One island city, 10 x 10 blocks, four districts with their own look: Meridian (downtown towers that step
  back in tiers), Sol Beach (pastel hotels, palms, sand), Rustport (industry), suburbs and parks with street
  trees. Every building has a separate ground floor of shop fronts with awnings and doors, and windows with
  frames and blinds. Day and night cycle with lit windows and shop fronts, street lamps at corners and
  mid-block, neon trim, a moon, drifting clouds and moving water.
- Pretty graphics adds a glow pass (neon, lamps, lit windows and tail lights bleed light at night) and a soft
  vignette; Fast graphics turns it off.
- Landmarks to steer by: the Sol Wheel (a turning Ferris wheel on a pier off Sol Beach; since 1.3 you can
  ride it), the Meridian Spire on the tallest tower, red-light masts on the other towers, striped
  smokestacks over Rustport, pitched roofs on the low suburb houses, and since 1.3 the Coastliner, an
  airship with NEON COAST on its side that laps the island every five minutes.
- The city by day (release 1.3): 86 painted walls, two designs per district (a sunset palm and a SOL BEACH
  postcard on the beach, colour blocks and a striped-sun skyline in Meridian, citrus and a flower in the
  suburbs, RUSTPORT stencil lettering and a cog in the docks). Parasols and towels on the sand, sailing
  boats off the shore, gulls over the beach. Deep blue sky over a warm haze, a teal sea, golden sand. Every
  wall is darker at the foot and lighter at the top instead of one flat colour; Meridian towers are aqua,
  coral, cream and lilac instead of grey, Rustport is rust, ochre and sea-green. The player stands with a
  slow breathing sway instead of frozen.
- On foot (walk, sprint, jump, punch, pistol) and seven vehicle types (Tidal, Vanta GT, Ravager, Brawler,
  Hauler, City Cab, Patrol Cruiser) with arcade handling, handbrake, damage and fire. Each type has its own
  body outline (raked windscreens, a pickup bed, a rear wing on the fast ones), hubcaps, mirrors and a grille;
  at night every car throws a pool of light on the road.
- Traffic that follows lanes, pedestrians that flee from shots, occupied cars can be taken.
- Police: wanted level 1 to 5, patrol cars chase and ram, officers shoot from 2 stars, an arrest when stopped
  beside a patrol car, escape by staying out of sight or paying for a respray.
- Six story jobs from three contacts (delivery against the clock, two checkpoint races, a car theft, a
  getaway with 3 stars). Rewards from $250 to $3,500. After the story, odd jobs come in four kinds taken in
  turn: Rush Order (timed delivery), Repo Run (take a marked car, bring it to the garage with one star on
  you), Block Dash (a checkpoint lap round a few blocks) and Hot Parcel (collect, then shake two stars).
- Cab fares (release 1.2): in any City Cab, T starts a shift. A passenger waves from the kerb; stop in the
  ring to pick up, stop in the next ring to drop off before the clock runs out. Pay is $60 plus $0.38 a
  metre, a tip for spare seconds capped at half the fare, and 10% more for each fare in a row up to 50%.
  Fares and the best run are saved.
- Property (release 1.2): four places to buy on foot with E ($2,000 to $14,000). Each pays rent by the game
  hour ($120 to $950), holds up to six hours of it, and restores health when you walk back in. Kept in the
  save.
- Police helicopter (release 1.2): from four stars a helicopter flies in, follows with a searchlight and
  keeps you in sight within 55 m, so side streets no longer hide you; at five stars its gunner fires. It
  climbs away when the stars go.
- Finding the way (release 1.2): the game works out the way along the streets to the current target, draws
  arrows on the road in your lane while you drive and a line on the minimap, and M opens a map of the
  whole island with every place, your properties and the route.
- Perks (release 1.2) tie the side activities together: 5 packages give 25% less damage, 10 packages halve
  the respray price, 10 cab fares double tips, all six story jobs raise rent by half. The pause screen lists
  them with progress bars. Since 1.3 a card under the cash shows it in play: each package, fare or job says
  how far the next perk is ("Body armour 4 / 5") and an unlock is announced with what it gives.
- Sol Wheel ride (release 1.3): walk to the foot of the pier, E buys a $25 ride. The camera goes once round
  the wheel looking back over the beach at the city; the ride restores health and marks the three nearest
  unfound packages with a ? on the minimap and the big map. F gets off early. No rides with stars on you or
  during a job.
- Police heat now reaches the other systems (release 1.3): a cab passenger will not get in while you are
  wanted, the Tune-up shop pulls its shutters down, the Sol Wheel will not sell a ticket, and walking into a
  property you own makes the police lose you at one or two stars (at three or more it refuses).
- The first job (release 1.3) is shorter and ends at a landmark: get in the red car, drive to the job beam,
  follow the beach road to the Sol Wheel pier. It used to end at the respray shop on the far side of town. Until that job is
  done the car you drive gets battered and smokes but cannot be wrecked, so a first minute cannot end in a
  burning car; after it, cars wreck as before.
- A quieter screen (release 1.3): the HUD is cash and health; the stars appear only when you are wanted, the
  weapon line only for five seconds after it changes or when ammo is low, and the clock moved to the map and
  pause screens. The pause screen is three buttons, settings and perks; the map legend moved onto the map
  itself (M). The title screen shows six keys and folds the other eight away.
- Every gain or loss of money shows as a green or red amount under the cash figure.
- The title screen has a "what changed" line that opens the release history (1.0 to 1.3).
- Harbor courier shift (release 1.1, from the title screen or G in free roam): three timed stops, $450 plus
  a time bonus, best time saved; checked by `test/harbor.py`.
- Money sinks: property, respray and repair $150 ($75 with the perk), ammo $80, hospital and bail fees of 10% of cash, and the Tune-up
  shop in three stages ($1,500, $3,000, $6,000; each stage adds 14% acceleration and 7% top speed to the
  car you drive, kept in the save).
- Each hidden package pays $100, all 15 pay a $5,000 bonus.
- Health pickups, a round minimap with markers, district names, a car radio with
  synth stations made in the browser (no audio files).
- Title screen with settings (difficulty Easy / Normal / Hard, graphics Fast / Pretty, sound), a controls
  list, pause with Resume / Restart / Main menu, progress saved in the browser. A new player who stands
  still for 3.5 seconds is shown the walking keys; one who sets off never sees them.
- Tests in the repository: `test/gates.py` (10 gates), `test/harbor.py` (the courier shift), `test/city.py`
  (31 checks: cab fares, property, perks, helicopter, route, map, old saves, and for 1.3 the safehouse rule,
  the wheel ride, the refusals while wanted and the perk card) and `test/drive.py`, which finishes the first
  story job using key presses only (W A S D and F, nothing moved by script).
- Own city, names and art. One line on the title screen says it is an original game and is not affiliated
  with the publisher or the series it is often compared to.
