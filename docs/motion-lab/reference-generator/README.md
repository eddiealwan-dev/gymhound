# Reference generator (Python)

Produced the approved Motion Lab mockups in `../mockups/`. It's a reference for porting to TypeScript, not app code.

- `rig2.py`: skeleton, forward kinematics, root anchoring, the squat/deadlift bar-path solvers, the pull-up path + two-joint arm solve, dip keyframes, proportions.
- `draw2.py`: draw order, joint caps, the pelvis-attached glute, flex wrappers, overhand grip mirroring, slimmer calves and flatter feet.
- `head.py`, `extremities.py`, `figure.py`: muscle, face, hand and foot paths.
- `pop.py`: contrast and definition values (applied in order).
- `screens.py` + `screen_template.html`: phases, effort and flex curves, cue and check timing, screen layout.

Run it with `pip install cairosvg`, then `python3 screens.py` (writes `../mockups/*.dc.html`).
