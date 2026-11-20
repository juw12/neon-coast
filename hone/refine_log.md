# Neon Coast - /hone run log (2026-11-20)

## Run queue

- [x] 1. Freeze rubric v1 (`hone/rubric.md`)
- [x] 2. Write the gate checker `test/gates.py` (G1-G10) without touching the game
- [x] 3. Baseline v0: gates + council score
- [ ] 4. Loop rounds (max 5): fix failed gates first, then the council's top fixes
- [ ] 5. Sync GitHub: new public repo `juw12/neon-coast`, MIT, GitHub Pages so it plays from a link
- [ ] 6. Sync profile README `juw12/juw12` (game section)
- [ ] 7. Sync portfolio card (juwenlie.pages.dev)
- [ ] 8. Sync landing page (juw12.github.io/p/neon-coast/)
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
