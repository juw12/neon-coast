# Neon Coast - /hone run log (2026-11-20)

## Run queue

- [x] 1. Freeze rubric v1 (`hone/rubric.md`)
- [x] 2. Write the gate checker `test/gates.py` (G1-G10) without touching the game
- [x] 3. Baseline v0: gates + council score
- [~] 4. Loop rounds (max 5) - rounds 1 and 2 kept, rounds 3-5 not run (see stop line): fix failed gates first, then the council's top fixes
- [x] 5. Sync GitHub: new public repo `juw12/neon-coast`, MIT, GitHub Pages so it plays from a link
- [x] 6. Sync profile README `juw12/juw12` (game section)
- [x] 7. Sync portfolio card (juwenlie.pages.dev)
- [x] 8. Sync landing page (juw12.github.io/p/neon-coast/)
- [x] 9. Sync Obsidian: project note + Update Log, vault pushed (`juw12/obsidian` f013d213)
- [x] 10. `P --log`, lessons, final message

## Assumptions

- Assumed: `/hone` alone means this chat's project, Neon Coast (Loop mode).
- Assumed: the project becomes a new public repo `juw12/neon-coast` (his other games are public under the
  game section); the local clone stays in this chat's working folder, GitHub is the lasting copy.
- Assumed: all GitHub work runs as `juw12` with a per-command token; the active `gh` account on this PC
  (`juwpegatron`) is not used and not switched.
- Assumed: after round 2 the game is shipped first (queue items 5-9) and further rounds follow only if
  the session budget allows; a later kept round is pushed to the same repo.
- Assumed: `juw12/neon-coast` was created by another session while this run was in round 2 (it shipped the v0
  code plus a harbor courier shift). This run does not overwrite it: v2 is merged on top and goes in by pull request.
- Assumed: judges cannot play the game, so they score a fact sheet (generated from the gate results) plus screenshots.

## Rounds

| round | change | gates | judge score | pairwise win | kept? | note |
|---|---|---|---|---|---|---|
| 2026-11-20 15:06 | council score | 6.95 | split: C2,C3 | Pega-Vision=7.5, Pega-Thinking=6.1, GLM-5.3-Flash=6.7 |
| 2026-11-20 15:14 | council score | 7.85 | split: C2,C3 | Pega-Vision=9.35, Pega-Thinking=7.6, GLM-5.3-Flash=7.5 |
| 2026-11-20 15:14 | council pair | B wins: True | votes A/B/tie 0/3/0 | council-judged (3 judges) |
| 2026-11-20 15:30 | council score | 8.35 | split: - | Pega-Vision=9.35, Pega-Thinking=7.75, GLM-5.3-Flash=8.35 |
| 2026-11-20 15:32 | council pair | B wins: True | votes A/B/tie 0/3/0 | council-judged (3 judges) |
| v0 baseline | first build | 9/10 (G10 fail) | 6.95 | - | baseline | palm and wall blocked the first view |
| 1 (v1) | new start spot, first-job guidance, waypoint arrow, shop signs, pause legend | 10/10 | 7.85 | 3-0 | kept | +0.90 |
| 2 (v2) | landmarks (Sol Wheel, Meridian Spire, masts, smokestacks, pitched roofs), Tune-up shop, no start banner, shorter legend | 10/10 (22 checks) | 8.35 | 3-0 | kept | +0.50; judged set grew by 2 screenshots (job running, Sol Wheel) |
| merge | v2 merged with the harbor courier release (1.1) that another session shipped to `juw12/neon-coast` from the v0 code; 3 small conflicts (save fields) | 10/10 (22 checks) + `test/harbor.py` passes | not rescored (8.35 is v2 before the merge) | - | shipped by PR | both features kept |

stop: session budget. Best is v2 at 8.35 (rubric v1, council of 3), below the done score of 8.5, no plateau yet.
The remaining budget went to merging with the 1.1 harbor release from the parallel session and to the sync.

## Sync (2026-11-20 15:44)

- GitHub: `juw12/neon-coast` already existed (made by the parallel session at 15:32 with the v0 code plus the
  harbor courier shift). v2 went in by PR #2 (squash dafc8ae), favicon fix by PR #3 (squash 945c37e).
  Live https://juw12.github.io/neon-coast/ serves the merged build (checked: Sol Wheel, Tune-up place, ferry
  button, six jobs present; console clean after PR #3).
- Profile README, portfolio card, landing page: all three were added by the parallel session
  (profile b1faee7, catalog juw12/projects 120651a, site 998ccd6) and are live. Left unchanged: their text is
  still true for the merged build. The landing page is a hand-made page outside the landing skill's state
  (`L status` lists it as NEW), so it was not rebuilt.
- Obsidian: project note and Update Log written by this run.

## Handoff

- Done: rubric v1, gate checker, baseline, rounds 1-2 (6.95 -> 7.85 -> 8.35), merge with release 1.1,
  PRs #2 and #3 merged, live site verified, Obsidian notes.
- In progress: nothing.
- Left: loop rounds 3-5. The council's open fixes: more varied building silhouettes at street level (C2),
  a job-difficulty check that is not a teleport (C3), label the health bar and the clock (C4).
- Next command: in a fresh chat, `/hone neon-coast` with the clone of `juw12/neon-coast`; rubric and log are in
  `hone/`, run `python test/gates.py` and `python test/harbor.py` before judging. Rescore the merged build
  first (8.35 is v2 before the harbor merge).

## Run 2 (2026-11-20, continued on the merged 1.1 build)

Goal beyond the goal: the widest honest open-world sandbox that still fits in one offline HTML file, with
every system checked by a script and every limit stated.

- Assumed: Juwen's "don't stop until 10/10" means run the loop to its hard stops. The scores below are from
  three AI judges looking at a fact sheet and screenshots. No score is called perfect and none is invented.
- Assumed: "be the top repo" cannot be made true by this run. Stars come from real people. Nothing was
  starred, botted or faked.
- Assumed: the rescore of the merged 1.1 build (8.35) is the baseline for this run.
- Assumed: from round 4 the judged set grew by four screenshots (cab fare, whole map, helicopter, property),
  because the new features cannot be seen in the first eight. The pair vote therefore compares 8 shots with 12.
- Assumed: the start position was not moved. The first job still takes a scripted driver 80 to 109 s, over the
  rubric's 60 s anchor; the judges saw that figure.
- Assumed: `test/drive.py` covers the first job only; jobs 2 to 6 are still passed by script (`G4`).
- Assumed: round 4 is shipped although its score did not rise (see the row). It holds everything round 3 has
  plus the 1.2 features, all three judges preferred it in the blind pair in both orders, and the 0.15 gap is
  inside the judges' spread (8.1 to 9.5 on the same build). Same rule as earlier runs: a unanimous pair win
  ships a superset. The best score stays 8.75 (round 3); 1.2 is not reported as a score gain.

| round | change | gates | judge score | pairwise win | kept? | note |
|---|---|---|---|---|---|---|
| rescore (v2m) | merged 1.1 build, nothing changed | 10/10 | 8.35 (V 8.7, T 7.75, G 8.35) | - | baseline | C1 9, C2 8, C3 8, C4 8, C5 9 |
| 3 (v3) | look pass: glow at night on Pretty, tiered towers, shop fronts with awnings, car outlines per type, headlight pools, labelled health and clock | 10/10 | 8.75 (V 8.85, T 8.35, G 8.75) | 3-0 vs v2m | kept | +0.40; C3 8 -> 9, C4 8 -> 9. Over the 8.5 bar: loop "done" |
| 4 (v4, release 1.2 City Lights) | cab fares, four properties with rent, police helicopter at 4+ stars, road arrows and minimap route, whole map on M, four perks, four odd-job kinds, money pop-up, idle-only keys hint, title and pause re-laid for 720p, 34 m walker-free start | 10/10 on the final build | 8.6 (V 9.5, T 8.1, G 8.6) | 3-0 vs v3 | shipped, not a new best | -0.15, inside noise; C4 9 -> 8 (pause screen and always-on HUD stack called dense). Stall 1 by the score rule |

Gate runs on round-4 builds, every one: 10/10; 9/10 (G3: the star count changed during the 7 s wait, passed on
the next two runs); 9/10 and 9/10 (G7 read 26 and 29 fps while the PC sat near 90% CPU from other work; the
same build measured alone gave 135 to 139 fps against 144 for the released 1.1, `test/fps_ab.py`); 8/9 (G10: a
walker reached the first view, fixed by spawning walkers 34 m out instead of 20 m); 10/10 on the final build.
`test/city.py` 19/19, `test/harbor.py` pass, `test/drive.py` 5 of 5.

stop: done by the bar at round 3 (8.75 against 8.5, gates 10/10), then one extra round on Juwen's request that
stalled on score and won the pair; session budget ends the run. Best score 8.75 (rubric v1, council of 3).

Open asks from the judges, none done: real people playing the first job and the later jobs; a daytime look as
recognisable as dusk; thinner pause screen and a HUD that hides the pistol and clock when idle; a perk
unlock notice in play; a shorter first job; an idle sway on the player model.

## Sync (run 2, 2026-11-20)

- Repo: [PR 4](https://github.com/juw12/neon-coast/pull/4) `0229be1`, favicon fix [PR 5](https://github.com/juw12/neon-coast/pull/5) `b9c6396`, release [v1.2.0](https://github.com/juw12/neon-coast/releases/tag/v1.2.0) with `NeonCoast.html`; description and 10 topics updated.
- Live game: https://juw12.github.io/neon-coast/ serves the same bytes as the local build; play test passed (title shows 1.2, cab fare, big map, helicopter at 4 stars).
- Profile: `juw12/juw12` `94174dd`.
- Portfolio: catalog `juw12/projects` `63f9b72`, card sync run passed, card text live at https://juwenlie.pages.dev/.
- Landing page: `juw12/juw12.github.io` `b4e0b47`, https://juw12.github.io/p/neon-coast/ returns 200 with the 1.2 text.
- Obsidian: `GitHub/neon-coast.md` and `Update Log/2026-11-20 1728 neon-coast hone.md`, vault commit `d7b6724`.

## Run 3 (2026-11-20, `/hone neon-coast` again, from the shipped 1.2 build)

Goal beyond the goal, unchanged: a stranger opens one link, knows what to do within a minute and has something
worth doing for ten. Score to beat: 8.75 (round 3). A round is kept at 9.05 or more with a pair win.

### Run queue (run 3)

- [x] R3-1 First job inside a minute: shorter route that ends at the Sol Wheel (judge ask, C1)
- [x] R3-2 Title screen: six keys up front, the rest folded away (judge ask, C1)
- [x] R3-3 HUD: stars, pistol and clock only when they matter (judge ask, C4)
- [x] R3-4 Pause screen: buttons, settings, perks only; the map legend moves to the map on M (judge ask, C4)
- [x] R3-5 Perk progress and unlock notices in play (judge ask, C3)
- [x] R3-6 Police heat touches fares, shops and property; the Sol Wheel can be ridden (judge ask, C3)
- [x] R3-7 Daytime look with its own identity; idle movement on the player (judge ask, C2)
- [x] R3-8 Gates, city, harbor, drive tests; council score and blind pair; keep or drop
- [x] R3-9 Ship by PR and release if kept or preferred; Sync (repo, profile, portfolio, landing, Obsidian)
- [ ] R3-10 A real person plays it: cannot be produced by the agent, reported as `needs you` (still open)

### Assumptions (run 3)

- Assumed: `/hone neon-coast` means Loop mode on the game again, starting from the shipped 1.2 build.
- Assumed: the frozen rubric v1 stays; proposed changes go in the final message only.
- Assumed: the first job may end somewhere new. It now ends at the Sol Wheel pier, because the rubric's
  first-minute anchor could not be met with the old route across town.
- Assumed: a mural, airship and beach props are "own city" art (drawn in code, own names), so G9 still holds.
- Assumed: rounds 5 and 6 are shipped as release 1.3 although neither is a new best by the rule (9.05 needed).
  Each holds everything the build before it has, and each won its blind pair 3-0 in both orders. Same rule
  as runs 1 and 2: a unanimous pair win ships a superset. 1.3 is not reported as a score gain.
- Assumed: the learner-car rule (no wreck before the first job is done) is a design change, not a test fix.
  `test/drive.py` was not changed in what it measures; the one arrest in ten runs is reported as a failed run.

| round | change | gates | judge score | pairwise win | kept? | note |
|---|---|---|---|---|---|---|
| 5 (v5) | first job ends at the Sol Wheel pier; Sol Wheel ride; police heat stops fares, tune-ups and rides, own property clears 1-2 stars; perk card in play; HUD down to cash and health; thinner pause and title; day look (86 murals, wall gradient, palettes, beach props, boats, gulls, airship, teal sea); idle sway | 10/10 (three runs) | 8.85 (V 9.5, T 8.35, G 8.85) | 3-0 vs v4 | preferred, not a new best | +0.10 over 8.75, inside noise. C1 9, C2 8, C3 9, C4 9, C5 10. Stall 1 by the score rule |
| 6 (v6, release 1.3 Clear Day) | learner car: no wreck until the first job is done (two judges asked for it after a scripted run wrecked the car) | 10/10 | 8.75 (V 9.5, T 8.75, G 8.25) | 3-0 vs v5 | shipped, not a new best | 0.00 against 8.75. C5 10 -> 9. Stall 2: plateau, loop stops |

Test runs on run-3 builds, every one. v5: gates 10/10 three times; `test/city.py` 29/30 (the older check
"helicopter leaves when the stars go" failed once, a fixed 8.5 s wait while the PC was busy), then 30/30;
`test/harbor.py` pass; `test/fps_ab.py` 144 fps against 144 for release 1.2 (display cap);
`test/drive.py` 4 of 5 (47.8, 50.0, 111.3, 45.2 s; one run wrecked the car in traffic at 105.6 s), a
logging copy 4 of 4 (39.5 to 51.2 s), then 5 of 5 (38.9 to 47.5 s): 13 of 14 in all. v6: gates 10/10,
`test/city.py` 31/31, `test/harbor.py` pass, `test/drive.py` 5 of 5 (38.6 to 43.2 s) and 4 of 5 (39.6 to
47.3 s; the fifth hit a pedestrian 25 m short of the job beam, got one star and was arrested): 9 of 10.
The first job took the same scripted driver 80.5 to 108.5 s on release 1.2.

stop: plateau. Two rounds in a row gained less than 0.3 (8.85, then 8.75, against a best of 8.75), so the
loop ends by its own rule with rounds left. Both rounds won their blind pairs 3-0 and are shipped as release
1.3. Best score stays 8.75 (rubric v1, council of 3 AI judges; their spread on one build is 8.25 to 9.5).
A 10 is not claimed and cannot be reached this way: the judges read a fact sheet and screenshots, nobody has
played it.

Open asks from the judges, none done: real people playing the first job and the later jobs; key-press tests
for the other five jobs, the fares and the courier shift; no stars or arrests before the first job is done;
more varied building outlines per district; anti-aliasing on Pretty; a judged pass on the radio.

## Sync (run 3, 2026-11-20)

- Repo: [PR 6](https://github.com/juw12/neon-coast/pull/6) `5fef5c1`, release [v1.3.0](https://github.com/juw12/neon-coast/releases/tag/v1.3.0) with `NeonCoast.html`.
- Live game: https://juw12.github.io/neon-coast/ serves the same bytes as the local build; play check passed (title shows 1.3, first job ends at the pier, 86 murals, airship, wheel ride takes $25 and marks 3 packages, no console problems).
- Profile: `juw12/juw12` `b6b0df0`.
- Portfolio: catalog `juw12/projects` `cd83281`, card sync run passed, card text live at https://juwenlie.pages.dev/.
- Landing page: `juw12/juw12.github.io` `5b3ada6` (text) and `1373651` (picture), https://juw12.github.io/p/neon-coast/ shows the 1.3 text.
- Obsidian: `GitHub/neon-coast.md` and a new note in `Update Log/`.

## Run 4 (2026-11-20, `/hone neon-coast` again, from the shipped 1.3 build)

Goal beyond the goal, unchanged: a stranger opens one link, knows what to do within a minute and has something
worth doing for ten. The open asks of the run-3 judges are the queue. Score to beat: the 1.3 build re-scored in
this session (council scores drift about 0.6 between sessions), plus 0.3, with a blind pair win.

### Run queue (run 4)

- [x] R4-1 Learner phase: no stars and no arrest until the first job is done (asked by two judges, C1)
- [x] R4-2 Title screen: Sprint and Handbrake among the keys shown first (asked by one judge, C1)
- [x] R4-3 Building outlines: roof edges and a roof form per district, balconies on the beach hotels, saw-tooth roofs, silos and containers in Rustport (asked by two judges, C2)
- [x] R4-4 Smoother edges on Pretty (asked by one judge, C2)
- [x] R4-5 Odd jobs: the player picks the kind; one kind done on foot (asked by one judge, C3)
- [x] R4-6 Key-press tests for more than the first job: `test/drive.py` takes a job name (asked by two judges)
- [x] R4-7 Radio: a measured check of what the stations put out (asked by one judge; judges cannot hear)
- [x] R4-8 Gates, city, harbor, drive tests; re-score 1.3, council score and blind pair; keep or drop
- [x] R4-9 Ship by PR and release if kept or preferred; Sync (repo, profile, portfolio, landing, Obsidian)
- [ ] R4-10 A real person plays it: cannot be produced by the agent, reported as `needs you`

### Assumptions (run 4)

- Assumed: `/hone neon-coast` means Loop mode on the game again, starting from the shipped 1.3 build.
- Assumed: the frozen rubric v1 stays; proposed changes go in the final message only.
- Assumed: the learner phase stops stars from crimes only. Stars set by a job step and the test hook are
  untouched. It is a design change that makes the opening easier, not a test fix.
- Assumed: the quay, cranes and freighter are scenery beyond the waterline with no collision; own art.
- Assumed: the council cannot hear, so the radio is checked by measurement (`test/radio.py`) and the sheet
  says nobody has listened to it.
- Assumed: for key-press runs of jobs 2 and 4 the save file may be set to "earlier jobs done" first; the
  job itself is played with keys only. The docstring and the fact sheet say so.
- Assumed: a key-press run that is arrested may try again inside its time limit, as a player would; tries
  and arrests are reported with the result. With stars on it the script still stops for people but no
  longer queues behind cars.
- Assumed: release name 1.4 "Skyline".
- Assumed: the keep rule set at the start of this run (re-scored 1.3 plus 0.3, and a blind pair win) decides
  "new best". Against the 8.75 written down in earlier sessions the gain is 0.25, which is inside the
  session-to-session drift; both numbers are reported.

| round | change | gates | judge score | pairwise win | kept? | note |
|---|---|---|---|---|---|---|
| 0 (v6 again, release 1.3) | none: the shipped build, scored again in this session as the baseline | 10/10 (run 3) | 8.35 (V 9.35, T 8.35, G 8.35) | - | baseline | it read 8.75 in run 3; drift -0.40. C1 8, C2 8, C3 9, C4 8, C5 9 |
| 7 (v7, release 1.4 Skyline) | learner phase (no stars before the first job is done); building outlines and the Rustport quay; FXAA; Paper Round on foot and the J key; three radio styles with a limiter, measured; Sprint on the title; key-press tests for jobs 2 and 4 | 10/10 | 9.00 (V 9.5, T 8.35, G 9.0) | 3-0 vs v6 (all six picks) | new best | +0.65 over the same-session baseline. C1 9, C2 9, C3 9, C4 9, C5 9. One judge (T) gave scores without evidence text (salvaged answer) |

Test runs on the 1.4 build, every one: `test/gates.py` 10/10 (frame-rate gate read 120 fps while other
tests had just run; `test/fps_ab.py` then measured 144 fps against 144 for release 1.3, the display cap);
`test/city.py` 39/39 twice; `test/harbor.py` pass; `test/radio.py` 14/14 twice; `test/drive.py` job 1
5 of 5 (38.5 to 50.9 s); job 2 Hot Delivery 1 of 1 (115.9 s) and then 3 of 3 (110.2 to 132.0 s); job 4
Borrowed Time: a first single run failed (the script stopped when the player was taken out; it now waits
for the respawn like a player), then 2 of 3 (169.1 s; 317.4 s after one arrest and a second try; the third
run was arrested or taken out three times and ran out of its 420 s). No timer was changed.

stop: done threshold. Round 7 scored 9.00 against a threshold of 8.5 with all gates passing and a 3-0 blind
pair, so the loop ends after one round by its own rule. Best score: 9.00 (rubric v1, council of 3 AI judges,
spread 8.35 to 9.5). A 10 is not claimed and cannot be reached this way: the judges read a fact sheet and
screenshots, nobody has played it, and one judge's answer carried scores only.

Open asks from the run-4 judges, none done: real people playing it (first minute, driving feel, whether the
radio is pleasant); job 4 fails one key-press run in three, and the races and the three-star getaway are
still unmeasured; the five odd jobs are all timed marker runs; ground detail on the Rustport quay; say "on
foot" more loudly when a Paper Round is offered; a shorter way to the first job beam.

## Sync (run 4, 2026-11-20)

- GitHub repo: [PR 7](https://github.com/juw12/neon-coast/pull/7) squash-merged, main `fde4675`; release
  [v1.4.0](https://github.com/juw12/neon-coast/releases/tag/v1.4.0) with `NeonCoast.html`.
- Live check: https://juw12.github.io/neon-coast/NeonCoast.html has the same bytes as the local build (837,248).
  Played at the public URL in Chrome: title shows 1.4, outlines 780 boxes / 52 wedges / 42 drums, a crime before
  the first job brings no stars, J names the next job during the story and deals five kinds after it, no console
  problems (`live_check_14.py`, kept outside the repo).
- Profile README: `juw12/juw12` `b8f6a49`.
- Portfolio: catalog `juw12/projects` `f9c3c79` (3 lines), card sync run 44745291295 passed, card text live
  at https://juwenlie.pages.dev/.
- Landing page: `juw12/juw12.github.io` `24fcef5` (text) and `1482de1` (picture, the Meridian
  crowns shot), https://juw12.github.io/p/neon-coast/ shows the 1.4 text and the new picture.
- Obsidian: `GitHub/neon-coast.md` and `Update Log/2026-11-20 2034 neon-coast hone.md`, vault commit `81554415`.

## Release 1.5 "Pocket" (2026-11-21, from the MacBook Pro; not a hone run, no judges)

Ask: a phone version for iPhone and Android, landscape or upright or both. Built as one web version with touch
controls and a home-screen install; see the README for what it does.

- GitHub repo: [PR 8](https://github.com/juw12/neon-coast/pull/8) squash-merged, main `4292e34`; release
  [v1.5.0](https://github.com/juw12/neon-coast/releases/tag/v1.5.0) with `NeonCoast.html` (861,360 bytes).
- Live check: https://juw12.github.io/neon-coast/NeonCoast.html has the same bytes as the local build. Opened as a
  phone in Chrome it turns touch on, finds the manifest and icons, and starts a game after a reload with the
  network off. It also starts a game on Playwright WebKit as an iPhone 13.
- `test/touch.py` 9/9.
- Desktop suites on the MacBook Pro, which was running several other jobs (load average 30 to 120) and whose
  frame rate swung between 60 and 6 fps for 1.4 and 1.5 alike:
  - `gates.py` 8/10, as 1.4 scores there. G6: headless Chrome on macOS grants no pointer lock; with the lock
    stood in for, a mouse move of 100 px turned the view by 0.240 rad as it should and a left click fired.
    G7: 12 to 60 fps depending on the minute.
  - `harbor.py` pass, `radio.py` 14/14, `drive.py 3` 3 of 3 (106 to 113 s, slow motion at that frame rate).
  - `city.py` 35/39 as written; 1.4 scored 36 and 34 in the same hour. The checks that miss wait a fixed time
    while the game, which counts at most 0.05 s per frame, runs slower than the clock. With every fixed wait
    three times as long: 38/39, and the one miss is made by the longer wait itself (the idle hint replaces the
    hint the check reads).
- Found and fixed: on Fast graphics Safari drew the sky black (the sky wrote alpha 0 straight to the page).
- Profile README: `juw12/juw12` `50035ec`.
- Portfolio: catalog `juw12/projects` `e4b8440` (text, tag PWA) and `5f34de6` (card label and alt text), card
  picture `juw12/portfolio` `bf35d1b` (house style, touch play), card sync runs passed, live at
  https://juwenlie.pages.dev/.
- Landing page: `juw12/juw12.github.io` `99881a0` (text and picture), https://juw12.github.io/p/neon-coast/.
- Cairn: `GitHub/neon-coast.md` and `Update Log/2026-11-21 0958 neon-coast 1.5 pocket.md`.
- Not done: no real iPhone or Android phone has run it. Not scored by the judges.
