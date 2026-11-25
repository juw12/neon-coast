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

## Release 1.6 "Sharp" (2026-11-21, from the MacBook Pro; not a hone run, no judges)

Ask, after Juwen tried 1.5 on his phone: "phone not that good, make it 10/10 better than gta6". He did not say
what was not good. Read as: the picture and the feel on a phone. 1.5 started every phone on Fast graphics,
1.5 drawn pixels per point with no glow and no shadows, which on a 3x screen is soft and flat. The second half
of the ask cannot be met by a one-file browser game and is not claimed.

- Added: Auto graphics with a frame-rate governor (a phone starts on it; phones from 1.5 move over once),
  aim assist on touch, Steering: Stick or Arrows, CAR lit when a car is in reach, a tick under the thumb.
- An emulated 844 x 390 phone at 3x: the 3D view went from 1266 x 585 drawn pixels (1.5) to 1688 x 780 (1.6),
  with the glow pass and shadows on the top rung.
- GitHub repo: [PR 9](https://github.com/juw12/neon-coast/pull/9) squash-merged, main `e6177c5`; release
  [v1.6.0](https://github.com/juw12/neon-coast/releases/tag/v1.6.0) with `NeonCoast.html` (869,030 bytes).
- Live check: the public page has the same bytes as the local build; opened as a phone it starts on Auto at
  2 drawn pixels per point, reloads with the network off, and starts a game on WebKit as an iPhone 13.
- `test/touch.py` 10/10 (new: sharpness of the picture, the governor fed with frame times, aim assist, arrows,
  the CAR button). Older suites with fixed waits three times as long on the busy Mac: `gates.py` 8/10 (G6
  pointer lock in headless Chrome on macOS, G7 51 fps), `harbor.py` pass, `city.py` 39/39.
- Portfolio: catalog `juw12/projects` `5922bfe`, card sync run passed. Landing page `juw12/juw12.github.io`
  `359852e`.
- Not done: the frame rate on a real phone is still not measured (Auto decides on the phone). No judges, no score.

## Run 5 (2026-11-21, `/hone` again, from the shipped 1.5 build)

Ask: check that the MacBook Pro edit is finished and, if so, hone again. It was finished: PR 8 merged, release
v1.5.0 out, no open PR, the Mac hand-over closed. On the ASUS `build.py` gave the committed bytes again
(861,360) and the suites passed (gates 10/10, city 39/39, harbor, radio 14/14, touch 8/8 with WebKit not
yet installed).

The Mac was not finished for the day. At 17:16 it started another edit and at 17:53 it shipped release 1.6
"Sharp" (PR 9, see the section above), while this run was testing a build made from 1.5 that it also called
1.6. Found by `git fetch` just before shipping. So: main was merged into the branch, this run's release became
1.7 "Tail Lights", and every suite was run again on the merged build. Below, "Tail Lights on the 1.5 base"
is the build measured before the merge (`NeonCoast.html` 872,677 bytes) and "1.7" is the merged one.

Goal beyond the goal, unchanged: a stranger opens one link, knows what to do within a minute and has something
worth doing for ten, now also on a phone. The open asks of the run-4 judges are the queue, plus the first
judged pass of the phone version. Score to beat: the 1.5 build scored in this session, plus 0.3, with a blind
pair win.

### Run queue (run 5)

- [x] R5-0 Check the Mac edit is done; rebuild 1.5 on the ASUS and run its suites
- [x] R5-1 Queue from the open asks of the run-4 judges
- [x] R5-2 Baseline: score 1.5 in this session; first judged pass of the phone version (two phone pictures)
- [x] R5-3 A shorter way to the first job beam (asked in run 4, C1)
- [x] R5-4 An odd job that is not a timed marker run: Shadow Run, tail a car without being seen (asked in run 4, C3)
- [x] R5-5 Say "on foot" more loudly when a Paper Round is offered (asked in run 4, C1)
- [x] R5-6 Job 4: a head start before the stars and a route to the respray. Done, but it did not make the
      key-press script finish job 4; see the test runs
- [x] R5-7 Ground detail on the Rustport quay: the dock apron (asked in run 4, C2)
- [x] R5-8 Key-press tests for the two races, the three-star getaway and Shadow Run (asked in run 4)
- [x] R5-9 See-through touch buttons, so the road shows through them on a phone
- [x] R5-10 Suites, council score, blind pair, keep or drop, ship, Sync
- [x] R5-13 Merge the Mac's 1.6 Sharp into the branch, rename to 1.7, run every suite again on the merged
      build, score it against 1.6 Sharp
- [ ] R5-11 A real person plays it, and a real iPhone and Android phone run it: cannot be produced by the
      agent, reported as `needs you`

- [ ] R5-12 Police chase balance, so that Borrowed Time and Heat Wave can be finished (found by the
      key-press runs of this run and asked by all three judges): not done, see the Handoff below

### Assumptions (run 5)

- Assumed: `/hone it again` means Loop mode on the game, starting from the shipped 1.5 build.
- Assumed: the frozen rubric v1 stays; proposed changes go in the final message only.
- Assumed: the judged picture set gains the two phone pictures 1.5 added (16 pictures); for Tail Lights the Shadow Run
  picture takes the place of the Meridian crowns picture, so both versions are judged on 16.
- Assumed: moving the first job beam, the head start, the respray route, the rule that a Paper Round cannot
  be started from a car, and Shadow Run's opening 20 s and its car appearing ahead are design changes, not
  test fixes.
- Assumed: city check 13 was rewritten to the new first-beam rule, and the "route longer than 50 m" check was
  moved to a far target, so it is as strict as before. The Shadow Run checks shorten 40 s to 3 s and set the
  state, as the other city checks do.
- Assumed: the drive numbers on the 1.5 fact sheet are the 1.4 measurements (1.5 did not change the driving).
  For the blind pair the 1.5 sheet also carries the 1.5 and 1.4 runs made in the same hour as the Tail Lights runs
  (`hone/judge/v8b.md`), so both sheets show what a busy PC does to the script.
- Assumed: release name 1.7 "Tail Lights" (it was 1.6 until the Mac's 1.6 "Sharp" took that number).
- Assumed: Playwright's WebKit may be installed on the ASUS (`playwright install webkit`) to run the Safari check.
- Assumed: in `test/drive.py` the walk along the pavements, counting a crashed run as a failed sample and
  writing the result file after every run are script fixes; what counts as a pass did not change.
- Assumed: job 4 and job 5 runs made through a wrapper that also records the game state every 2 s count as
  samples; the wrapper calls the same `run()`.
- Assumed: the police were left as they are. Changing how hard they ram changes every chase in the game, and
  on a busy PC the effect could not be measured well enough to decide; it is the first open ask.
- Assumed: the official drive numbers of Tail Lights are the runs made one at a time with the final script; every
  other run is listed under the test runs and on the fact sheet (`hone/drive-notes-v9.md`).
- Assumed: 1.7 ships although its score did not move, because all three judges preferred it to 1.6 Sharp
  in both orders of the blind pair and it removes nothing; runs 2 and 3 set that precedent.
- Assumed: the Shadow Run and head-start checks in `test/city.py` may wait on the game's own clock
  (`mission.tail.age`, `mission.heat`) instead of a fixed time. What has to be true to pass is the same or
  stricter (the head start must have 8 to 10 s left when it is read).
- Assumed: the Safari-engine check failing on the ASUS for 1.7 is a limit of this laptop and not of the
  build, because the released 1.6 fails it the same way here (2 of 2 runs each) and passed on the Mac.
- Assumed: both judged sheets (v10 for 1.6 Sharp, v11 for 1.7) carry the same radio numbers, measured once
  on 1.7 in a quieter hour, because the radio code is the same and 1.6 was only measured on the busiest hour.
- Assumed: on the v11 sheet jobs 2 to 6 are the runs made before the merge (the driving, police and job
  code did not change in the merge) and the sheet says so; job 1 and Shadow Run were played again on 1.7.

| round | change | gates | judge score | pairwise win | kept? | note |
|---|---|---|---|---|---|---|
| 0 (v8, release 1.5 Pocket) | none: the shipped build, scored twice in this session as the baseline; first judged pass of the phone version | 10/10 | 8.50 and 8.60, mean 8.55 (V 9.6 / 9.2, T 8.35 / 8.35, G 8.5 / 8.6) | - | baseline | the sheet carried the 1.4 drive numbers |
| 8 (v9, Tail Lights on the 1.5 base) | first job beam 40 m ahead; Shadow Run; Paper Round ON FOOT; head start in Borrowed Time and Repo Run; route to the respray; Rustport dock apron; see-through touch buttons; key-press tests for all six jobs and Shadow Run | 10/10 | 8.75 and 8.45, mean 8.60 (V 9.6 / 9.35, T 8.35 / 8.35, G 8.75 / 8.2) | 3-0, every judge in both orders | kept on the branch, then merged with 1.6 Sharp (round 9); not a new best | the gain of 0.05 is noise (two readings of one sheet differ by 0.3); needed 8.85 |
| 0b (v10, release 1.6 Sharp) | none: the build the Mac shipped at 17:53, rebuilt byte for byte on the ASUS and scored twice as the new baseline | 10/10 | 8.50 and 8.60, mean 8.55 (V 9.6 / 9.1, T 8.5 / 8.6, G 8.1 / 8.6) | - | baseline | sheet: drive numbers of 1.4, touch 10/10 on the Mac and 7/10 on the busy ASUS |
| 9 (v11, release 1.7 Tail Lights) | round 8 merged with 1.6 Sharp: everything in Sharp plus everything in round 8 | 10/10 | 8.20 and 8.70, mean 8.45 (V 8.7 / 9.85, T 8.35 / 8.35, G 8.2 / 8.45) | 3-0 against 1.6 Sharp, every judge in both orders | shipped as the superset build; not a new best | needed 8.85; two readings of this one sheet differ by 0.5, so 8.45 against 8.55 is noise. The sheet lists every failed suite run of the busy evening and the job 5 result, which the 1.6 sheet does not have. Two judges gave 82 against 72 fps as a reason: that is the PC, not the build |

Test runs on Tail Lights on the 1.5 base (`NeonCoast.html` 872,677 bytes, sha256 `9072f227`), every one. The PC was busy
with other work all day, and for part of the afternoon two or three of these suites ran at once.

- `test/gates.py` 10/10 (frame-rate gate 144 fps). `test/city.py` 54/54. `test/harbor.py` pass. `test/smoke.py` pass.
- `test/radio.py` 12/14 in the chain of suites (two timing checks), then 14/14 twice alone; the 1.5 build
  also read 14/14 alone.
- `test/touch.py` 7/9 in the chain (the WebKit check lost its WebGL context, which also failed the
  clean-console check), then 9/9 alone. WebKit alone, upright and landscape: Tail Lights passed 2 of 2, 1.5 passed 1 of 2.
- `test/drive.py`, one run at a time, final script: job 1 3 of 3 (29.7, 47.9, 35.9 s); job 2 2 of 2 (222.1,
  146.8 s); job 4 1 of 2 (204.9 s on the first try; the other run lost the stolen car twice, "The car was
  destroyed."); job 5 0 of 3 (8 tries, taken out or arrested 8 times, up to five stars; one of the three
  runs stopped at 271 s because no parked car was left to walk to); job 6 1 of 1 (211.2 s, first try);
  Shadow Run 3 of 3 (109.5, 205.8, 161.8 s; tries 1, 2, 2; "They spotted you in the mirror." once, "You
  lost them." once). Job 3, with one other test running: 1 of 2 (279.7 s on the second try; three tries ran
  out of the race clock).
- `test/drive.py` with two or three browsers at once (frame rate 18 to 50 a second in the worst runs): job 2
  1 of 4 (232.2 s); job 4 0 of 4; job 5 0 of 4; job 6 0 of 2 (five tries, all out of the race clock); job 3
  two runs without a pass whose result file was lost when the suite hit its own time limit.
- Job 4 before the script walked along the pavements: 0 of 4 (three in the chain, one traced alone at 140
  frames a second). In one run the script spent 270 s walking into the walls of a dead-end alley by the
  hospital. With the pavement walk the same walk took 43 to 66 s (three times measured).
- Other builds in the same busy hour, same script: 1.5 finished job 4 0 of 2 (the stolen car wrecked 9 to 13 s
  after the stars came on) and job 2 0 of 1; 1.4 finished job 2 1 of 1 (146.4 s). A 1.4 run of job 4 was
  stopped by the agent before it ended.
- Earlier builds of this run, before the final one: city 51/52 (the new check read a field that does not
  exist; the check was fixed), 52/52, then 52/54 (the first version of Shadow Run's opening rule was wrong and
  was redesigned as a plain 20 s window), then 54/54. Shadow Run's first version passed 3 of 3 but took 3, 2
  and 4 tries, which is why it was tuned. Several chains of suites were stopped by the agent to rebuild.

Test runs on the merged 1.7 build (`NeonCoast.html` 880,315 bytes, sha256 `a6853497`), every one, 18:40 to 21:05.
The PC was busier than in the afternoon (65 to 85% of its eight cores taken by other work the whole time); the
frame rate of the same build read anything from 7 to 137 a second.

- `test/gates.py`: the first run broke on a click that timed out, the second read 9/10 (G3, the respawn check
  of the smoke test), the third 10/10 (82 fps). `test/smoke.py` alone: pass. `test/harbor.py`: pass.
  `test/radio.py`: 14/14.
- `test/city.py`: 52/54, 51/54, 51/54, 49/54 and one run that crashed. The failures were always checks that
  wait a fixed time while the game, held to a longest step of 0.05 s, runs slower than the clock under 20
  frames a second. After the Shadow Run and head-start checks were moved to the game's own clock: 52/54 (a
  cab fare paid $0, the next fare not offered), 52/54 (the helicopter had not left, the property did not
  hide the player yet), then 54/54.
- `test/touch.py` (ten checks since 1.6): 7/10, 9/10, 7/10. In the 9/10 run every Chrome check passed and
  only the Safari-engine check failed (4 frames in 1.5 s). In the others the small-phone checks timed out and
  the aim-assist check failed once. The Safari-engine check alone, two runs each: released 1.6 failed both (7
  frames, then a lost WebGL context), 1.7 failed both the same way (7 and 3 frames, context lost). The whole
  suite on released 1.6 in the same hour: 7/10 (two phone sizes timed out, WebKit 9 and 3 frames).
- `test/drive.py 3` on 1.7: job 1 3 of 3 (56.4, 80.8, 187.0 s). `test/drive.py 3 tail`: Shadow Run 2 of 3
  (211.5 s on the second try after "They spotted you in the mirror.", 199.0 s on the first try; in the third
  run the player was taken out on the way to the job beam and did not reach it in 421 s, so the job never
  started). Jobs 2 to 6 were not played again on 1.7.
- Released 1.6 on the ASUS for its sheet: gates 10/10 on the first run (72 fps); radio 11, 9, 12 and 10 of 14
  in the busiest half hour (the radio code is the same as in 1.7, which read 14/14 two hours earlier).
- Frame rate of 1.7, 1.6 and the build before the merge, measured in turn: 7 to 121 for every one of them,
  in no order. The merge did not change the frame rate that this PC could show.

What the failed runs say about the game, not the script: the two police jobs are the hard ones. At two or
more stars a police car with a clear line inside 50 m drives at the player at 47 m/s. Crash damage is
(0.8 x closing speed - 4) x 1.7, so one head-on hit costs up to about 78 of the Vanta GT's 90 points. Every
police hit above 5 m/s also adds 1.3 wanted points even when the police did the ramming, so two stars become
five within about 12 s. The code is the same since 1.4; the head start of Tail Lights gives ten quiet seconds and then
the same chase. No timer and no police rule was changed in this run.

stop: blocked on a quiet PC for the one queue item an agent can still do (R5-12). 1.7 shipped. Round 9 did not
reach the 8.85 it needed to count as a gain (8.45 against a baseline of 8.55 for 1.6 Sharp; best ever stays
9.00, release 1.4 in run 4), but won the blind pair against 1.6 Sharp 3-0 in both orders, and the build
before the merge won 3-0 against 1.5. The score did not move for a reason the judges gave themselves: the 1.7
sheet is the first to say that the script cannot finish Heat Wave and finishes Borrowed Time only half the
time. That was just as true of 1.4, 1.5 and 1.6; nobody had measured it. A 10 is not claimed: the judges read
a fact sheet and screenshots, and nobody has played it.

Open asks from the run-5 judges: police chase balance (all three, first, both times; R5-12); a real person and
a real phone (all three; R5-11); job clocks tuned to human times; less text on the title screen; lift the
plainest views (the grey dock apron, dark night roads). One judge asked that the game keep its speed under 20
frames a second (today it slows down instead of skipping, by design, so timed jobs get harder on a slow
machine): worth a look together with R5-12.

## Handoff (run 5)

- Done: R5-0 to R5-10 and R5-13. Release 1.7 "Tail Lights" is out and synced (see Sync below).
- In progress: nothing.
- Left: R5-12, police chase balance. What is known: `src/02-entities.js`, the police drive at the player at
  47 m/s from two stars; crash damage (0.8 x closing speed - 4) x 1.7; each police hit above 5 m/s adds 1.3
  wanted points to the player (near line 762). Three changes to try, one at a time: (1) a police hit counts
  as a crime only when the player drove into them; (2) at two stars police box the player in and match speed,
  and ram only from three stars; (3) cap the damage of one crash. Measure each with
  `python test/drive.py 3 4` and `python test/drive.py 3 5`, alone on a quiet PC (about 7 minutes a run);
  today's numbers to beat are job 4 1 of 2 and job 5 0 of 3. Then all suites, a new sheet, score and pair.
  Blocked today: on this PC the same build read 7 to 137 frames a second within an hour, and the drive
  script's result follows the frame rate, so a before/after could not be told from noise.
- Left: one clean run of `python test/touch.py` and `python test/city.py` for 1.7 on a quiet PC or on the Mac
  (the Safari-engine check has not passed for 1.7 anywhere yet; it fails for 1.6 too on the ASUS).
- Left: `test/city.py` still has about sixty fixed waits (`page.wait_for_timeout`). Idea, not done: count the
  game clock in the page (`Math.min(0.05, frame time)` per frame) and wait until it has moved by the same
  amount, so a slow PC cannot fail a timer check.
- Left: R5-11, a real person plays ten minutes and a real iPhone and Android phone open the link (needs Juwen).
- Next command: `/hone neon-coast` (run 6 starts from the 1.7 build; first item R5-12, on a quiet PC).

## Sync (run 5, 2026-11-21)

- GitHub repo: [PR 10](https://github.com/juw12/neon-coast/pull/10) squash-merged, main `81e953f`; release
  [v1.7.0](https://github.com/juw12/neon-coast/releases/tag/v1.7.0) with `NeonCoast.html` (880,315 bytes).
- Live check: https://juw12.github.io/neon-coast/NeonCoast.html has the same bytes as the local build and
  `sw.js` names the cache `neon-coast-1.7.0`. Opened at the public URL in Chrome: the title shows 1.7 and the
  Tail Lights news, Shadow Run is in the build, New Game starts play with "JOB 40 m" on the HUD, no console
  problems (`live_check_17.py`, kept outside the repo).
- Profile README: `juw12/juw12` `ea32e9a`.
- Portfolio: catalog `juw12/projects` `44ebb63` and `c308f52` (the summary cut to 118 characters; the 1.6
  summary had 126 against a limit of 120), card sync run 44914561680 passed.
- Landing page: `juw12/juw12.github.io` `ca1f305`, https://juw12.github.io/p/neon-coast/ shows
  TAIL LIGHTS / 01.7 and the three new items above the 1.6 ones.
- Obsidian: `GitHub/neon-coast.md` and `Update Log/2026-11-21 2135 neon-coast hone.md`.

## Run 6 (2026-11-25, "neon coast continue hone", from the shipped 1.7 build)

Ask: continue the hone. The first open item of run 5 was R5-12, police chase balance, so this run did that
one item and nothing else. On the ASUS `build.py` gave the committed 1.7 bytes again (880,315) before any
change.

Goal beyond the goal, unchanged: a stranger opens one link, knows what to do within a minute and has
something worth doing for ten. A chase that raises its own stars and wrecks the car in one hit ends the two
police jobs before that.

### Run queue (run 6)

- [x] R6-0 Rebuild 1.7 on the ASUS, read the police code, write a test that shows the three rules of the
      run-5 handoff on 1.7 (`test/chase.py`: 1.7 fails 4 of the first 8 checks)
- [x] R6-1 A way to measure a chase that does not follow the frame rate: `test/chase_bench.py`, a car held
      at a set speed for 30 s of game time
- [x] R6-2 Rule 1: a crash with a police car is a crime only when the player drove into it
- [x] R6-3 Rule 2: one crash with a police car takes at most 40% of the car
- [x] R6-4 Rule 3: officers hit a moving car less often (not in the handoff; added because the bench showed
      rules 1 and 2 alone left 2 of 7 three-star runs not wrecked, with gunfire doing the rest)
- [x] R6-5 Rule 4: at two stars a cruiser slows down and stays behind the car; it rams from three stars
- [x] R6-6 Bench and key-press runs of jobs 4 and 5, 1.7 against 1.8; all suites
- [x] R5-12 Police chase balance: the four rules are in and measured. Whether the two police jobs can now
      be finished by a person is not shown; see "What was measured" and the Handoff
- [ ] R6-7 Council score and blind pair: not done this run. No new sheet, no judges
- [ ] R5-11 A real person plays it, and a real iPhone and Android phone run it: needs Juwen

### Assumptions (run 6)

- Assumed: "continue hone" means run 6 in Loop mode on the game, starting from the shipped 1.7 build, first
  item R5-12.
- Assumed: the four rules are design changes. No existing check was changed; `test/chase.py` and
  `test/chase_bench.py` are new files.
- Assumed: the numbers are 40% of full health for one crash on Normal, 0.6 s for what counts as one crash,
  60% fewer hits at 30 m/s, and for the two-star cruiser a 4 m/s closing speed, an 8 m gap and 18 m/s2 of
  braking. They were set from the code and the bench rounds listed below, and not tuned further.
- Assumed: the bench may remove the other traffic and hold the car's speed by script. It measures the police
  rules, not the driving; the key-press script measures the whole job.
- Assumed: a bench run the police never found is listed but not counted as survived.
- Assumed: three-star bench runs made on the build without the two-star rule count for 1.8, because that
  rule only acts at exactly two stars. The same for the job 5 key-press runs.
- Assumed: 1.8 ships without a council score. Run 5 could not tell builds apart with the sheet (two readings
  of one sheet differed by 0.5), and this run has a direct measurement instead: the rule test (4 of 8 on
  1.7, 13 of 13 on 1.8) and the bench. The rubric score of 1.8 is unknown and nothing here claims one.
- Assumed: release name 1.8 "Fair Cop".

| round | change | gates | judge score | pairwise win | kept? | note |
|---|---|---|---|---|---|---|
| 10 (candidate A) | rules 1 and 2: blame and the crash cap | - | not judged | - | kept, not enough | bench at three stars: 2 of 7 not wrecked (1.7: 0 of 3); gunfire about 54 health in 30 s. Jobs by key press: job 4 2 of 3, job 5 0 of 2 |
| 11 (candidate B) | A plus rule 3: gunfire against a moving car | - | not judged | - | kept, not enough | bench at three stars: 5 of 8 not wrecked, gunfire about 37; at two stars 3 of 8 wrecked, 1 never found. Jobs by key press: job 4 1 of 3, job 5 0 of 3 (most stars 3, 4, 3) |
| 12 (release 1.8 Fair Cop) | B plus rule 4: the two-star pursuit | 10/10 | not judged | - | shipped | bench at two stars: 0 of 5 chased runs wrecked (1.7: 4 of 4), crash damage 0; at three stars 3 of 3 not wrecked (one with under 1% health left), gunfire about 51. `test/chase.py` 13/13. Job 4 by key press 2 of 3, stars stayed at two |

What was measured, every run (`NeonCoast.html` 883,569 bytes, sha256 `b3d2cc17`). The PC was busy with other
work the whole day; the bench and `test/chase.py` wait on the game's clock, the key-press runs do not.

- `test/chase.py`: 1.7 4 of the first 8 checks; candidate A fails the gunfire check; candidate B 12 of 13
  (fails the two-star pursuit check); 1.8 13 of 13.
- `test/gates.py` 10/10, `test/city.py` 54/54, `test/harbor.py` pass, `test/radio.py` 14/14, in one chain on
  the final build. `test/smoke.py` and `test/touch.py` were not run on 1.8 (the touch code did not change).
- Bench, Vanta GT held at 21 m/s for 30 s, traffic removed. Two stars: 1.7, 7 runs, 3 never found, the 4
  chased runs wrecked after 12.7, 15.5, 20.4 and 23 s, stars at three in 4 of 7. Candidate B, 8 runs, 3
  wrecked (18, 21.9, 23.1 s), 1 never found. An earlier setting of the two-star rule, 8 runs, 3 never found, 0 of 5 chased runs wrecked, crash damage 0, 6,
  0, 19, 0. 1.8, 6 runs, 1 never found, the 5 chased runs still driving with 47, 19, 7, 47 and 13% health,
  crash damage 0, gunfire 48 to 84 of 90 health, stars at two. Three stars: 1.7, 3 runs, all wrecked (27.4,
  20.7, 29.2 s), stars at four in all. Candidate A 2 of 7 not wrecked. Candidate B 5 of 8 and 1.8 3 of 3 not
  wrecked (one of the three with under 1% health left), together 8 of 11, stars at three in all. Gunfire
  at three stars: about 55 health on 1.7, 54 on A, 37 on B, 51 on 1.8 (three runs).
- `test/drive.py`, two builds playing at the same time. Job 4: 1.7 2 of 3 (most stars 5, 2, 4), then 1 of 3
  (4, 5, 3); candidate A 2 of 3; candidate B 1 of 3; 1.8 2 of 3 (stars stayed at two; the car was destroyed
  4 times in the three runs). Job 5: 1.7 0 of 3 (five stars in all); candidate A 0 of 2; candidate B 0 of 3
  (most stars 3, 4, 3); 1.8 itself was not run on job 5.
- A result once showed the player's health at -899: that is the old rule that a car explosion hurts the
  driver by 999, not a new fault.

What this means. The three faults named in the run-5 handoff are gone and a test now holds them: a chase no
longer raises its own stars, one crash no longer takes the car, and a two-star cruiser no longer rams. The
bench shows the car lasting. The key-press script does not finish the two police jobs more often than
before, with samples of three: job 4 3 of 6 against 2 of 3, job 5 0 of 3 against 0 of 3. So 1.8 is shipped
as a rule fix that is measured, not as "the police jobs can now be finished".

## Handoff (run 6)

- Done: R6-0 to R6-6, R5-12. Release 1.8 "Fair Cop" (see Sync below).
- In progress: nothing.
- Left: gunfire against a car at two stars. With the ramming gone a cruiser now sits within 15 m behind the
  car, where officers shoot with their close-range bonus, and in the bench that took 48 to 84 of 90 health
  in 30 s. To try: no shooting at a moving car at two stars, or a longer gap. Measure with
  `python test/chase_bench.py NeonCoast.html 2 21 6`.
- Left: `test/drive.py` stops for traffic while it is chased and never tries to get out of the police's
  sight. Until it does, its job 4 and job 5 numbers say more about the script than about the police.
- Left: why the player is taken out on foot in Heat Wave (0 of 3 on both builds) was not looked into.
- Left: R6-7, a new fact sheet with the bench table, a council score and a blind pair of 1.8 against 1.7.
- Left: one clean run of `python test/touch.py` for 1.8 on a quiet PC or on the Mac; the fixed waits in
  `test/city.py` (both from run 5, not touched).
- Left: R5-11, a real person plays ten minutes, with one of the two police jobs in it, and a real iPhone and
  Android phone open the link (needs Juwen). This is the only measurement that can say whether 1.8 is more
  fun.
- Next command: `/hone neon-coast` (run 7 starts from the 1.8 build; first item the two-star gunfire).

## Sync (run 6, 2026-11-25)

- GitHub repo: [PR 11](https://github.com/juw12/neon-coast/pull/11) squash-merged, main `8942e82`; release
  [v1.8.0](https://github.com/juw12/neon-coast/releases/tag/v1.8.0) with `NeonCoast.html` (883,569 bytes).
  The repo has no CI; the suites above were run on the ASUS before the merge.
- Live check: https://juw12.github.io/neon-coast/NeonCoast.html has the same bytes as the local build
  (sha256 `b3d2cc17`) and `sw.js` names the cache `neon-coast-1.8.0` (read with `curl`). The live page was
  not opened in a browser this run.
- Profile README: unchanged. Its sentence about the game names nothing that 1.8 changed.
- Portfolio: catalog `juw12/projects` [PR 135](https://github.com/juw12/projects/pull/135), `df223dc`: the
  description names 1.8; the summary, the order and the card are unchanged. Card sync run 45551047421 failed on its
  push (another push to `juw12/portfolio` came in between); run 45551143685 passed.
- Landing page: `juw12/juw12.github.io` [PR 3](https://github.com/juw12/juw12.github.io/pull/3), `7d72ec9`;
  https://juw12.github.io/p/neon-coast/ shows FAIR COP / 01.8 and the three police items above the 1.7 ones.
- Obsidian: a line in `journal/2026-11-25.md`, saved through Cairn.
- Not done: the four-versions gate (`platforms.py`), Featured (`featured.py`), a fact sheet, a council score.
