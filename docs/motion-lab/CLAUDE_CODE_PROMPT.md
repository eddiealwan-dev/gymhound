# Build "Motion Lab": animated anatomical exercise figure for GymHound (v2, 2026-10-17)

This replaces v1. The approved design changed a lot on 2026-10-17. Everything you need is in this folder.

## What I want

1. **Every exercise detail screen** gets an animated, skinless anatomical figure performing the exercise.
   - The worked muscles glow by tier and **visibly flex** in time with the rep.
   - The screen layout and behavior match the mockups.
2. **Program pictures:** read the rule in "Program pictures" below and **ask me** before building anything for programs.

## Reference files (in `docs/motion-lab/`)

| File | What it is |
|---|---|
| `mockups/*.dc.html` | The six approved mockups: Back Squat (`Main`), Deadlift, Pull-up, Dips, Dumbbell Curl and the Face study. Look-and-behavior source of truth. They are SVG + CSS-keyframe prototypes, so read them; don't port the markup. |
| `motion-lab-rig.v2.json` | **The exact figure and motion data:** pivots, skeleton hierarchy, every muscle path (final, after all edits), face, hands, feet, joint caps, flex constants, CSS/gradient values, tier colors, and per-exercise phases, cues, checks, muscle tiers and grip. It also has **49 sampled frames per exercise** (angles, root translation, joint positions) to use as test ground truth. |
| `reference-generator/*.py` | The Python that produced the mockups: `rig2.py` (skeleton, forward kinematics, solvers, pull-up IK), `draw2.py` (layering, joint caps, flex wrappers, grip mirroring), `head.py`, `extremities.py`, `pop.py` (contrast values) and `screens.py` (phases, effort and flex curves, cues). Port its algorithms to TypeScript; don't guess them. |

## What changed since v1 (all must be in the build)

- **Hip-rooted skeleton with working arms.** Thigh, shin, foot, torso, upper arm and forearm are all separate joints. A root translation keeps the anchor fixed: the ankle for squat, deadlift and curl, the hand for pull-up and dips.
- **Proportions:** the upper arm is about 5% shorter and the forearm about 10% shorter. The grip sits in the palm. The calves are 18% slimmer and the feet 16% lower.
- **Per-exercise solvers:**
  - **Squat and deadlift:** the torso angle is solved each frame so the bar stays over midfoot.
  - **Pull-up:** the shoulder follows a set path (under the bar, then about 5 in behind it at the top), and a two-joint arm solve picks the elbow on the low side.
  - **Dips:** the shoulders drop about 7.5 in to roughly 90° at the elbow, finishing just in front of the hands.
- **Angle unwrapping:** unwrap joint angles between frames so no joint spins the long way around.
- **Face:** faceless no longer applies. Profile with a strong jaw, short crop (procedural strands from the crown), calm relaxed lids, defined upper and lower lips, and a detailed flat ear (rim, rim groove, Y-ridge, front flap, lobe).
- **Hands:** a C-grip around the bar. Overhand grip mirrors the hand about the forearm axis: deadlift, squat and pull-up are overhand, the curl is underhand, dips are neutral.
- **Feet:** arched sole, heel pad with Achilles insertion, ball pad, toes with a nail, ankle bone.
- **Joint caps:** rounded deep-tissue caps sit under the hip, knee and elbow so bending never opens a gap. The hip cap takes the hamstring tier color.
- **Glute:** attached to the **pelvis** (torso group), not the thigh. An upper-hamstring piece fills the back of the thigh, so the glute flows into the hamstring in a hinge.
- **Flex:** primary muscles scale by `1 + 0.20·c` wide and `1 − 0.06·c` long, and secondary muscles by 0.10 / 0.03.
  - `c` follows effort, which rises through the lifting phase and eases off on the way down.
  - Scale each muscle about its own center, and scale its shading and sheen with it.
- **Contrast:** brighter muscle tissue, deeper grooves, stronger edge lighting and more visible fibers. The exact values are in `style.css` in the JSON.
- **Bigger biceps**, and five exercises instead of one.

## Non-negotiables (unchanged from v1)

- **Offline and local-only.** No network, no remote assets.
- **No video or GIF files.** The figure is procedural, so it plays at the user's tempo.
- **Muscle tiers come from data:**
  - library primary → primary;
  - library secondary → secondary;
  - pattern defaults → stabilizer.
- **No competitor names** in the UI.
- **Never** say the app notices, detects or decides an off day. The form checks describe the demo figure, not the user.
- **The existing test suite stays green.** Work on `feature/motion-lab`, and commit at the end of each phase.

## Program pictures: ask first

`DESIGN.md` R632/R642 says program pictures are **real grayscale photos, "nothing is generated or drawn"**. v1 asked for drawn figure stills on program cards, and that conflicts. Don't build program stills. Raise it at the Phase 0 checkpoint and wait for my decision.

## Design-system alignment: ask first

The mockups use a cool blue-black palette, cyan accents, Chakra Petch/IBM Plex, colored tiers, glow and gradients. `DESIGN.md` calls for warm neutrals, Barlow Condensed + Inter, near-monochrome emphasis and "no shadows, gradients or glass".

- At Phase 0, propose a **GymHound-native** version of the screen chrome (warm tokens, Barlow/Inter, `Segmented`, compact pills, 14px labels that scale with text size), keeping the figure's look.
- Then ask me to choose between that and the mockup's look.
- Either way:
  - all text follows the phone's text size;
  - every touch target is at least 44pt;
  - the screen opens from the ⓘ on the exercise name row ("opens the form demo").

## Skills to use

- **Process:** superpowers:writing-plans, superpowers:test-driven-development, superpowers:verification-before-completion.
- **Figure and motion:** hzblj-skills:skia, hzblj-skills:reanimated-core, hzblj-skills:reanimated-timing.
- **Code:** hzblj-skills:type-safety, hzblj-skills:objects-and-data, hzblj-skills:atomic-design, hzblj-skills:hooks, hzblj-skills:performance.
- **UI (any screen, card or control you build):**
  - **impeccable:** use the project's `DESIGN.md`, `PRODUCT.md` and `.impeccable/design.json` as context;
  - **21st** (`21st:21st-ui`): for component patterns and inspiration. GymHound is React Native, so adapt ideas; never import web-only components;
  - frontend-design;
  - hzblj-skills:ui-motion, ui-interactions, ui-typography, ui-surfaces and native-feel.
- **Design review:** design:design-critique, design:accessibility-review and design:design-handoff.
- **Before each checkpoint:**
  - run impeccable's audit/critique on the touched screens;
  - then design:design-critique and design:accessibility-review;
  - then hzblj-skills:polish and hzblj-skills:clean-review.
  - Fix what they find and list anything you chose not to fix.
- **Crash reports:** no crash or bug-reporting SDK. Rely on the TestFlight / App Store Connect and Google Play Console crash reports.

## Architecture (same as v1, updated)

- **Data contracts first:** `type` only, no `any` or `as`, validated at load. `MotionPattern` (keyframes, phases, tempo, `stillT`, anchor, solver id, cues, checks, stabilizers) and `ExerciseMotion` (exerciseId, patternId, equipment, grip, tiers).
- **Pure core, worklet-safe:**
  - `poseAt(pattern, t)`;
  - `solve(patternSolver, pose, t)` for the squat/deadlift bar-path solver, pull-up IK and dip path;
  - `forwardKinematics(pose)`;
  - `rootForAnchor(pose, anchor)`;
  - `effortAt(phases, t)`;
  - `flexScale(tier, effort)`;
  - `unwrapAngles(series)`.
- **Renderer:** `@shopify/react-native-skia` driven by one Reanimated clock on the UI thread, with no per-frame `setState`.
  - Parse paths once and memoize them.
  - Pause when the screen loses focus or the app goes to the background.
  - Target 60fps on a mid-range Android phone.
  - Expo Go compatibility: confirm it in Phase 0, and if Skia isn't viable, propose `react-native-svg` + Reanimated and say what you'd give up.
- **Placement:**
  - the shared rig/renderer (`FigureRig`, `FigureStill`, the pure functions) goes in the shared UI library;
  - the screen pieces (`MotionStage`, `TempoStrip`, `ModeToggle`, `MuscleChipGrid`, `PhaseLabel`, `PlayPauseButton`, `SpeedButton`) stay local to the exercise-detail feature;
  - the hooks are `useRepClock`, `useWeeklyMuscleLoad` (real SQLite sets for the last 7 days) and `useExerciseMotion`.
- **Mapping all ~990 exercises:**
  - `scripts/motion/map-exercises.ts` assigns each a pattern, equipment and grip using explicit keyword tables.
  - It writes `unmapped.csv` with reasons and never defaults silently.
  - An unmapped exercise keeps its form photo.
- **Patterns:** start with the five that exist (squat, hinge/deadlift, vertical pull, dip, elbow flexion). Add the rest of the v1 pattern table in Phase 2.

## Tests

- `forwardKinematics` + solvers reproduce every `sampledFrames` joint in `motion-lab-rig.v2.json` within 0.5 units, for all five exercises.
- Anchors never slip: across the rep the ankle (or hand) stays fixed within 0.5 units.
- Squat and deadlift bar x stays within ±1 of its target. The pull-up elbow is always below the shoulder–hand line.
- `unwrapAngles` never jumps more than 180° between samples.
- `flexScale` returns 1 at rest and hits the peak values at full effort; stabilizers never scale.
- Tier resolution, mapping-script coverage, My week aggregation and reduced motion (a static frame at `stillT`, no flex) are covered.

## Phases (stop at each checkpoint)

0. **Inventory and plan:**
   - confirm the renderer;
   - report on the two "ask first" items above (program pictures, design-system alignment) with your recommendation.
   - **Stop for my approval.**
1. **Rig engine + Back Squat on its exercise detail screen.**
   - Commit, then tell me how to test it in Expo Go.
   - **Stop for my review on device.**
2. **Deadlift, Pull-up, Dips and Curl,** then the remaining patterns and equipment props.
3. **Mapping script + `unmapped.csv`.** **Stop so I can review the CSV.**
4. **Programs, only as decided at Phase 0.**
5. **Polish and performance pass:**
   - the full skill review chain above;
   - profiler numbers;
   - accessibility labels for every muscle chip and the stage;
   - reduced motion.
   - Then a final summary.

At each stop, give me: what changed (files), test results, the review findings, open questions, and a screenshot or description of what I'll see.
