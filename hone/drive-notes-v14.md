  - Heat Wave, what the nine runs of this version show: all 9 were finished at the first try, in 100 to 139 s,
    never arrested or taken out. In 8 of the 9 the car never caught fire. In the ninth it did, three times
    in one try: each time the script got out (F), ran to the nearest standing car and drove on; each time
    that car was a police cruiser that had pulled up (after 1.2 s, 0.8 s and 10.0 s on foot). Taking a police
    car adds stars: that run went from three to five stars and still finished, the slowest of the nine.
    So a jump out of a burning car has now saved a try: three jumps, three saved, all in one run.
  - The same script on the release before (2.1), same day, same kind of computer: 8 runs counted (a ninth
    broke in the test tool: a screenshot timed out), 8 finished, 3 at the first try, 13 tries. Lost tries: 5.
    Four of them the same way as in sheet v13: out of the burning car and dead on foot within seconds
    (WASTED); one arrested in the car. 5 jumps out of a burning car, 1 saved (a car 0.6 s away on foot).
  - This version was built in two steps and the first step was measured on its own: with only the 8 s
    without police gunfire, 9 runs had 7 jumps out of a burning car and none was saved. Six of the seven
    were dead within about 1.5 s of the jump: the police cars drove through the player at full speed (the
    game took 1.5 health for every m/s of the hit). That is why a police car now pulls up 6.5 m short of a
    player on foot and does not hurt in those 8 s. (Those 9 runs were played with the script of sheet v13,
    which stands still after the jump.)
  - How much weight this carries: little. Three saved jumps in one run against one of five is too few to
    be sure. Why the car caught fire in only one of nine runs this time (in 2.1 the same day: in five of
    eight) is not explained: nothing in this version changes a chase while the player is in the car, and
    the runs are on different computers. The script changed too: after a jump it now runs (Shift) to the
    nearest standing car, a police car included. A person might not think of taking a police car.
  - Four and five stars, measured for the first time (test/chase_bench.py: a Vanta GT held at 21 m/s on a
    straight road for 30 s with the police after it, eight runs each; not pass/fail). Cars wrecked within
    the 30 s, this version against 2.0.1: three stars 0 of 8 against 6 of 8; four stars 0 of 8 against 7 of
    8; five stars 1 of 8 against 7 of 8. Health left on the car at the end, median: 60%, 45% and 19%
    (2.0.1: 0, 0, 0). Police crashes per run: 0 to 1, 1 to 2, 1 to 3 (2.0.1: 2 to 4, 2 to 5, 1 to 5). At
    three stars 3 of the 8 runs lost the police inside the 30 s. The rules behind this are those of 2.1
    (one ram at a time; a crash takes at most 25% up to three stars); 2.2 does not change them. Whether
    five stars is now too easy or four too hard for a person is not known: the script drives straight.
  - Money from smashing, measured for the first time (test/economy.py: three runs of five minutes, the
    script drives into everything that stands on the street; not pass/fail): $74 a minute at the median
    ($50 to $160), $30 a minute after fines and hospital fees ($2 to $96); 37 things smashed a minute; the
    nitro tank filled 2.4 times a minute and burned 8 s a minute. The script was arrested or taken out 7
    to 9 times in each five minutes, which is where the fees come from: it drives far worse than a
    person. For scale: job 1 pays $250 and job 6 $3500. Nothing was changed after reading this.
