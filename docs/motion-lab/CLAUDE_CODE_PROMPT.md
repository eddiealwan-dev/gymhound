# Build "Motion Lab": animated anatomical exercise figures for GymHound

## What I want

1. **Every exercise detail screen** shows an animated, skinless, faceless anatomical figure performing that exercise. Worked muscles glow by tier and pulse in time with the rep.
2. **Every program card / program detail header** shows a **still** of the same figure mid-rep in that program's signature exercise, with the program's equipment.
   - Example: "Dumbbell Full Body" shows the figure doing a dumbbell exercise, such as a goblet squat.

## Reference files

They are in `docs/motion-lab/` (this folder).

- `motion-lab-mockup.reference.html` is the approved visual mockup. Treat it as the look-and-behavior source of truth, not code to port.
  - It's an SVG + CSS-keyframe prototype of the back squat screen.
  - Read it for layout, colors, layering, timing, cues and copy.
- `motion-lab-rig.json` holds the exact data for the approved figure:
  - the figure geometry: pivots, silhouettes, every muscle path, fibers and tendons, all in the standing pose;
  - the layer order and styles;
  - the tier colors and pulse curves;
  - the complete **squat** pattern: keyframes, easing, phases, depth check, cues and muscle tiers.
- Reproduce the figure from this data. Don't redraw it from scratch.

## Non-negotiables

- **Offline and local-only, as GymHound already is.**
  - No network calls, no remote assets, no accounts.
  - All figure data ships in the bundle.
- **No video or GIF files.** The figure is procedural: one rig, pose keyframes and vector muscle shapes. This keeps the app small and lets the figure follow the user's tempo.
- **Faceless head, always.** No eyes, nose or mouth.
- **No competitor names anywhere in the UI.**
- **Muscle accuracy comes from data, never invention.**
  - Primary and secondary tiers come from the exercise library's existing primary/secondary muscle fields.
  - Stabilizers come from the movement pattern's defaults.
- **Don't break anything.** The full existing test suite must stay green after every phase.
- **Work on a branch** (`feature/motion-lab`) and commit at the end of each phase.

## Phase 0: inventory and plan. Stop and report before writing code.

1. Read the repo and report:
   - the Expo SDK version;
   - navigation setup;
   - where exercise detail and program screens live;
   - the exercise data schema;
   - how the 882 exercises store name, equipment, primary/secondary muscles and form photos;
   - how programs are defined;
   - where the existing design tokens and fonts live;
   - how SQLite stores logged sets.
2. Confirm the renderer.
   - **Default:** `@shopify/react-native-skia` driven by `react-native-reanimated` (installed with `npx expo install`).
   - Check it works in Expo Go *and* the dev build for this SDK.
   - If Skia is not viable, propose `react-native-svg` + Reanimated `useAnimatedProps` and say what you'd give up.
3. Propose the folder placement for the components below, following the repo's existing structure. Report your plan and **wait for my go-ahead.**

## Architecture

### Data contracts (define these first)

These are data structures plus pure functions, not classes. Use `type`, not `interface`, and strict typing with no `any` or `as` casts. Validate generated data at load time.

```ts
type JointName = 'ankle' | 'knee' | 'hip' | 'spine' | 'neck' | 'shoulder' | 'elbow' | 'wrist'
type Side = 'near' | 'far'                    // near limb drawn on top, far limb behind and darker
type View = 'side' | 'front'                  // side first; front needed for raises and abduction
type Posture = 'standing' | 'seated' | 'supine' | 'prone' | 'hanging' | 'kneeling' | 'quadruped'
type MuscleId = 'quads' | 'glutes' | 'adductors' | 'hams' | 'calves' | 'erectors' | 'core' | 'upperback'
  | 'chest' | 'frontDelts' | 'sideDelts' | 'rearDelts' | 'biceps' | 'triceps' | 'forearms' | 'lats' | 'traps' | 'obliques' | 'hipFlexors' | 'abductors' | 'neck'
type MuscleTier = 'primary' | 'secondary' | 'stabilizer'
type EquipmentProp = 'barbell' | 'dumbbell' | 'kettlebell' | 'cable' | 'machine' | 'smith' | 'band' | 'bench' | 'pullupBar' | 'bodyweight' | 'ezBar' | 'trapBar' | 'plate' | 'medicineBall'

type CubicBezier = readonly [number, number, number, number]
type MotionKeyframe = {
  t: number                                        // 0..1 of one rep
  angles: Partial<Record<`${Side}.${JointName}` | JointName, number>>  // relative to parent, degrees
  root?: { x: number; y: number; rotation: number }
  easeOut?: CubicBezier
}
type MovementPattern = {
  id: PatternId
  view: View
  posture: Posture
  keyframes: readonly [MotionKeyframe, MotionKeyframe, ...MotionKeyframe[]]
  phases: readonly { name: string; from: number; to: number }[]
  tempoDefault: readonly [number, number, number, number]   // lower, hold, drive, brace (seconds)
  stillT: number                                              // the most recognizable moment, used for program stills
  propAttach: 'hands' | 'shoulders' | 'chest' | 'hips' | 'none'
  checks: readonly RangeCheck[]                               // e.g. squat depth line
  cues: readonly TimedCue[]                                   // short, anchored to a joint
  stabilizers: readonly MuscleId[]
}
type ExerciseMotion = {
  exerciseId: string
  patternId: PatternId
  equipment: EquipmentProp
  tiers: Partial<Record<MuscleId, MuscleTier>>
  cuesOverride?: readonly TimedCue[]
  mirror?: boolean                                            // unilateral moves
}
```

The pure core functions need unit tests. `poseAt` and `tierStyle` must be worklet-safe.

- `poseAt(pattern, t): Pose` interpolates the keyframes with per-segment easing.
- `jointPositions(pose): Record<...>` computes forward kinematics for anchors, props and cues.
- `tierStyle(tier, t): { glow, sheen }` evaluates the pulse curves from the rig JSON.
- `phaseAt(pattern, t)` returns the current phase.

### Rig

- Extend the reference rig, which has only ankle, knee, hip and torso with the arm fixed, to a full skeleton.
  - Near and far legs and arms, plus spine, neck, elbow and wrist.
  - A root transform for posture: lying on a bench, hanging, seated, and so on.
- Keep the approved art style exactly:
  - silhouette, then glow aura, tier-colored worked muscles, base tissue, volume and rim-light pass, screen-blend sheen, fibers, tendons;
  - the colors in `motion-lab-rig.json`.
- Add muscle art for the new muscles: chest, delts, arms, lats and so on.
  - Draw the far limbs in the same art, one shade darker, behind the body.
- The side view comes first. Add front-view art only for patterns that need it.

### Movement patterns

There are about 18. Each one covers many exercises. Each pattern is a data file, with `squat` already authored in the JSON.

| Pattern | Covers (examples) | View |
|---|---|---|
| squat | back/front/goblet/box/hack/smith squat, leg press (seated variant) | side |
| hinge | deadlift, RDL, good morning, KB swing | side |
| lunge | lunges, split squat, Bulgarian, step-up | side |
| hipThrust | hip thrust, glute bridge | side |
| horizontalPush | bench (flat/incline/decline), push-up, DB press, chest press machine | side |
| verticalPush | overhead press, DB shoulder press, push press | side |
| horizontalPull | barbell/DB/cable/machine row, inverted row | side |
| verticalPull | pull-up, chin-up, lat pulldown | side |
| elbowFlexion | curls (all) | side |
| elbowExtension | pushdown, skull crusher, overhead extension, dips | side |
| shoulderRaise | lateral raise, front raise, rear-delt fly | front / side |
| chestFly | fly, pec deck, cable crossover | front |
| calfRaise | standing/seated calf raise | side |
| kneeExtension / kneeFlexion | leg extension, leg curl | side |
| coreFlexion | crunch, sit-up, hanging leg raise, cable crunch | side |
| isometricHold | plank, side plank, wall sit, dead hang | side |
| carry | farmer/suitcase carry | side |
| rotation / hipAbduction | woodchop, Russian twist, abduction machine/band | front |

### Equipment props

- Draw props as thin holographic line art in the hologram blue (`#5EC8FF`) with low fill, matching the mockup's see-through barbell plate.
- They attach to joints computed by `jointPositions`. A bench or machine frame is static in pattern space.
- Dumbbells, kettlebells and bars must read correctly at small sizes for the program stills.

### Mapping all 882 exercises

- Write `scripts/motion/map-exercises.ts`. It assigns each exercise a `patternId` and an `equipment` value from its name, equipment field and muscles.
- The rules are explicit keyword tables, so they're easy to review.
- It outputs:
  - a generated `exerciseMotion` data file, committed;
  - `docs/motion-lab/unmapped.csv`, listing every exercise it couldn't map confidently, with the reason;
  - a coverage summary showing counts per pattern.
- **Never default silently.** An unmapped exercise keeps its existing form photo, plus a static muscle-tier still if possible, until I review the CSV.
- Map the library's primary/secondary muscle names to `MuscleId`. Report any library muscle names that don't map.

## Exercise detail screen (match the mockup)

**Stage:** the animated figure with:

- a phase readout (Lower / Hold / Drive / Brace + seconds);
- range checks, such as depth;
- timed form cues anchored near joints;
- the tempo label "TEMPO x-x-x-x · FROM YOUR PROGRAM".

**Tempo:**

- If the exercise is in the user's active program and the program has a tempo rule, the figure plays at that tempo.
- Otherwise it uses the pattern default.
- This ties into GymHound's "visible rule" positioning.

**Controls and data:**

- **Tempo strip** with a progress fill (transform only).
- **Play/pause:** cross-fade the icon (scale 0.25 to 1, opacity, no bounce) and keep the hit area at least 44×44.
- **Speed:** 1× / ½×.
- **Segmented toggle:**
  - **Activation** colors muscles by tier.
  - **My week** shades muscles by **real** sets logged in the last 7 days from local SQLite. It uses the exercises' muscle tiers: primary counts 1 set and secondary counts 0.5. Show an empty state when there's no data.
- **Muscle chips:** a 4-column grid of the exercise's worked muscles with their tier labels.
  - Tapping a chip isolates that muscle: the others dim to 12%.
  - The one-line description below explains the tapped muscle or the color key.

**Behavior and performance:**

- **Feel:**
  - Press feedback is scale 0.96, and haptics are `selectionAsync` on toggles and chips.
  - Use tabular numbers for times and counts.
- **Reduced motion:** show a still at `stillT` with static glow, and no loop.
- **Performance:**
  - One Reanimated clock drives everything on the UI thread, with no `setState` per frame.
  - Parse the Skia paths once and memoize them.
  - Pause when the screen loses focus or the app goes to the background.
  - Target 60fps on a mid-range Android device.

## Program stills

- Add `heroExerciseId` to every program definition, using the most representative compound lift that matches the program's equipment and goal. For example, a Dumbbell Full Body program gets a dumbbell goblet squat or dumbbell bench press.
  - Note: I'm replacing the premade programs with a new set of 10–12. Apply this to whatever program list is current, and make it easy to set for new programs.
- **List your picks in a table in your summary so I can approve or swap them.**
- `FigureStill` renders the pattern at `stillT` with:
  - the program's equipment;
  - primary and secondary muscles lit with a static glow;
  - no animation, no controls.
- It must look sharp at card size and at header size.
- Program cards currently use text-only cards by design. Add the still without breaking that layout: a right-aligned figure panel on the card, and a larger figure in the program header. Show me before committing to the card layout.

## Component structure

Follow the repo's existing conventions.

- **The shared rig is used in two places from day one** (exercise detail and programs), so the renderer belongs in the shared UI library, not inside one feature:
  - `FigureRig` (core renderer: pose + tiers + mode → Skia canvas);
  - `FigureStill`;
  - the pure motion functions.
- **Screen-specific parts stay local to the exercise-detail feature:**
  - **Atoms:** `MuscleChip`, `PhaseLabel`, `PlayPauseButton`, `SpeedButton`.
  - **Molecules:** `TempoStrip`, `ModeToggle`, `MuscleChipGrid`.
  - **Organism:** `MotionStage`.
- **Hooks:** keep logic out of views.
  - `useRepClock(tempo, isPlaying, speed)` returns a shared value for `t`.
  - `useWeeklyMuscleLoad()` reads SQLite.
  - `useExerciseMotion(exerciseId)`.
- **Names:** clear names, `as const` constants for every duration, color and size, and no magic numbers.

## Tests (add to the existing suite)

- `poseAt`: matches the keyframes exactly at keyframe times, interpolates monotonically between them, and loops correctly.
- `jointPositions`: the squat bar x stays within ±12 units of mid-foot across the rep.
- The mapping script's coverage: every exercise is either mapped or listed in `unmapped.csv`.
- Every library muscle name either maps to a `MuscleId` or is reported.
- Tier resolution: library primary → `primary`, library secondary → `secondary`, pattern stabilizers → `stabilizer`, and no muscle gets two tiers.
- My-week aggregation from fixture sets.
- Reduced motion renders the still.
- A `FigureStill` render test (snapshot) for one program.

## Phases (stop at each checkpoint)

1. **Phase 0:** inventory and plan. **Stop for my approval.**
2. **Phase 1:**
   - The rig engine, the squat pattern from the JSON, and the full exercise detail screen on the squat exercises only.
   - Commit, then tell me how to test it in Expo Go.
   - **Stop for my review on device.**
3. **Phase 2:** the remaining patterns and equipment props, with new muscle art.
4. **Phase 3:**
   - The mapping script for all 882 exercises, plus `unmapped.csv` and a coverage report.
   - **Stop so I can review the CSV.**
5. **Phase 4:** program stills with `heroExerciseId` picks. **Stop for approval of the picks and the card layout.**
6. **Phase 5:** a polish and performance pass covering the profiler, reduced motion, accessibility labels, Android ripple and focus pausing. Then a final summary.

At each stop, give me:

- what changed (the files);
- test results;
- open questions;
- one screenshot or description of what I'll see.
