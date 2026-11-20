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
- [ ] 9. Sync Obsidian: project note + Update Log, vault pushed
- [ ] 10. `P --log`, lessons, final message

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
