# Neon Coast - rubric v1 (frozen 2026-11-20, before any /hone change)

Goal beyond the goal: a stranger opens one file (or one link), understands what to do within a minute,
and has something worth doing for ten. 10-anchors = what a well-liked small browser sandbox ships.

## Hard gates (checked by code: `test/gates.py`; a failed gate overrides any judge score)

| Gate | Check |
|---|---|
| G1 | One offline file: with the network blocked, the page makes zero requests outside itself |
| G2 | No console errors, warnings or page errors during the whole play-test |
| G3 | Core loop (`test/smoke.py`): walk, enter car, drive, steer, police at 3 stars, pause, resume, job 1, respray, shoot, wasted, save/continue, Fast graphics |
| G4 | All six jobs start and pass by script; each pays exactly its listed reward |
| G5 | An arrest by a patrol car ends in BUSTED and a respawn at the police station |
| G6 | Mouse look turns the camera while the pointer is captured |
| G7 | 60 fps or more at 1280 x 720, Pretty graphics, on this laptop (Intel Arc 140V) |
| G8 | HUD boxes do not overlap at 1024 x 640, 1280 x 720 and 1920 x 1080 while driving with a hint, an objective and a timer shown |
| G9 | Own names only: no Rockstar game, city or brand names anywhere except the one "not affiliated" line |
| G10 | The view at the start is clear: sight lines through the middle of the screen (central 40% x 40%) meet nothing but the player and the ground within 14 m of the camera |

## Soft criteria (council, from the fact sheet and the screenshots)

- C1 First minute (w=0.25): 4 = player has to guess what to do or the first view is blocked, 7 = goal and controls are shown and the first job is easy to find, 10 = the first screen and first 60 seconds lead a stranger from title to a finished first job without reading anything twice
- C2 Look and atmosphere (w=0.25): 4 = plain boxes with flat colours, 7 = a consistent style with lighting, neon and a readable city, 10 = a place with its own mood by day and by night that you would recognise from one screenshot
- C3 Things to do (w=0.25): 4 = driving around only, 7 = several different activities with rewards and a reason to continue, 10 = jobs, police, money sinks and secrets that feed each other so ten minutes feel varied
- C4 HUD and menus (w=0.15): 4 = cluttered or hard to read, 7 = clean, readable, nothing overlaps, settings easy to reach, 10 = every element earns its place and reads at a glance while driving at speed
- C5 Honest and original (w=0.10): 4 = leans on another game's names or look, 7 = own names and an honest note about what it is, 10 = clearly its own world; limits and what was tested are stated plainly
