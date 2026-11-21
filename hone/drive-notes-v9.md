  - The lines above are runs made one at a time (job 3 with one other test running). The same script does
    much worse when the PC is busy: earlier the same day, with two or three browsers at once and the frame
    rate down to 18 to 50 a second, job 2 finished 1 of 4 runs, job 5 0 of 4 and job 6 0 of 2. Job 4
    finished 0 of 8 (four with other browsers running, four before the script learnt to walk along the
    pavements). Two more runs of job 3 did not finish and their result file was lost.
  - Releases 1.5 and 1.4 were tried in the same busy hour with the same script: 1.5 finished job 4 0 of 2
    and job 2 0 of 1; 1.4 finished job 2 1 of 1 (146.4 s). On a quiet PC the day before, 1.4 finished job 4
    2 of 3.
  - What the failed police runs show: at two stars a police car with a clear view drives straight at the
    player at top speed; one head-on hit takes most of the stolen car's health and also counts as a crime,
    so the stars climb. The ten-second head start did not change that. Not fixed in this version.
  - Other suites on this version: the radio check read 12 of 14 once while other tests were running (two
    timing checks) and 14 of 14 twice alone; test/city.py 54 of 54; the harbor shift test passed.
