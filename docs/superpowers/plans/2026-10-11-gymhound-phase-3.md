# GymHound Phase 3 Implementation Plan — routines, the eight programs, the full library, form demos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every free-exercise-db exercise is in the library with its steps and a start/end photo demo; the premade list becomes the eight evidence-based programs; you can create, edit, duplicate and delete your own routines within the free limit; tapping an exercise in a workout shows its form demo.

**Architecture:** A build-time script turns the vendored free-exercise-db JSON and its photos into generated TypeScript data and compressed WebP assets; pure mapping functions in `src/seed` decide equipment, muscles, logging type and pattern and are unit-tested. One additive migration (exercise steps and source id, routine `retired`). Seed version 2 upserts the library, keeps the 55 existing ids, retires two premades and prunes stale premade rows. Routine writes and the editor's draft state are pure/repository code tested first; screens follow the existing sheet and draft patterns.

**Tech Stack:** as phase 2, plus `sharp` as a devDependency for the one-off image script (installed in the shadow node_modules folder, never in the project).

**Spec:** `docs/superpowers/specs/2026-10-09-gymhound-design.md` §18.8 (wins), §8.6, §8.7, §9, §10, §18.1, §18.3.

## Global Constraints
- Location, node_modules junction, Node PATH prefix, no `npm install` in the project (a new devDependency is installed in `C:\Users\eddie\.gymhound` and package.json/package-lock.json copied back): as `environment.md` says.
- Expo Go and the web build only; no network at runtime — every exercise, step and photo is bundled.
- Generated files (`src/seed/library.generated.ts`, `src/seed/exercisePhotos.generated.ts`, `assets/exercises/*`) are written only by `scripts/build-library.mjs`; never hand-edit them.
- Migrations are additive; an older snapshot migrates forward.
- Exercise ids that exist today never change (history, notes, rest prefs, previous sets and next weights are keyed by them). Premade routine and routine-exercise ids that continue never change.
- Domain and repository functions take `now`; weights keep their unit; R29 drafts, R43 Done key, afterSheetCloses between sheets; text follows the phone's text size (rows wrap); 44pt targets; red only for wordmark, active tab, PR marks; copy exactly as written.
- Tests: `npm test`, `npm run typecheck`; DB tests start with `/** @jest-environment node */`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Branch `phase-3`; never merge it.

## Review Focus
1. History continuity: a workout logged with `barbell-bench-press` before the upgrade still shows its previous sets, note, rest time and Up next weight after seed v2.
2. Re-seeding is idempotent and leaves no duplicate or stale rows (a premade day's removed exercise is gone; nothing duplicates in the picker).
3. Saving an edited routine keeps next weights for exercises that stay; a deleted routine leaves its finished workouts intact.
4. The free limit can't be bypassed (new, duplicate, or re-create after delete) and lifts with the debug unlock.
5. 876 exercises: the picker scrolls smoothly (virtualized) and search returns in under ~50 ms on a phone.

---

### Task 1: Library mapping and the build script (DONE: 0170374..650fed3, merged dc1ea31)
**Files:** Create `src/seed/libraryMapping.ts` + test; `scripts/build-library.mjs`; vendor `scripts/vendor/free-exercise-db/exercises.json` (from raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json) and a LICENSE note; outputs `src/seed/library.generated.ts`, `src/seed/exercisePhotos.generated.ts`, `assets/exercises/{id}-0.webp`, `{id}-1.webp`; `package.json` (devDependency `sharp`, script `"build:library"`).

**Interfaces (Produces):**
```ts
export type FedbExercise = { id: string; name: string; force: string | null; level: string; mechanic: string | null; equipment: string | null; primaryMuscles: string[]; secondaryMuscles: string[]; instructions: string[]; category: string; images: string[] };
export type LibraryExercise = { id: string; sourceId: string; name: string; aliases: string[]; equipment: Equipment; loggingType: LoggingType; pattern: Pattern; primaryMuscles: Muscle[]; secondaryMuscles: Muscle[]; instructions: string[] };
export function mapEquipment(e: FedbExercise): Equipment;
export function mapMuscles(names: string[], e: FedbExercise): Muscle[];      // deduped, order kept
export function mapLoggingType(e: FedbExercise): LoggingType;
export function mapPattern(e: FedbExercise): Pattern;
export function libraryId(fedbId: string): string;                            // 'fedb-' + lowercase, non-alphanumerics → '-', collapsed, trimmed
export const LEGACY_SOURCE: Record<string, string>;                           // each of the 55 existing ids → its free-exercise-db id
export function buildLibrary(src: FedbExercise[], legacy: readonly LegacyExercise[]): LibraryExercise[]; // legacy ids/names/aliases/loggingType kept, steps+source from fedb; others mapped; sorted by name
```
- Rules (§18.8 R85): equipment barbell→barbell, e-z curl bar→ez_bar, dumbbell, cable, machine, kettlebells→kettlebell, bands→band, medicine ball→medicine_ball, exercise ball→exercise_ball, foam roll→foam_roller, body only/null→bodyweight, other→other. Muscles abdominals→abs, quadriceps→quads, middle back→upper_back, lower back→lower_back, shoulders→front_delts (push) / rear_delts (pull) / side_delts (name contains "lateral" or "raise" and not push/pull) , abductors→glutes, neck→traps, others by name. Logging: category stretching or force static → timed; category cardio → distance_time when the name names a distance machine or run/row/bike/cycle/elliptical/treadmill/walk, else timed; strongman with carry/walk/yoke/sled/drag/push in the name → weighted_time; name contains "assisted" and equipment machine → assisted; equipment bodyweight (strength/plyometrics) → bodyweight_plus; otherwise weighted. Pattern from force/mechanic/primary muscle and name keywords (squat, deadlift/hinge, lunge, press, row, pulldown/pull-up, carry, core muscles) with `isolation` as the fallback.
- `LEGACY_SOURCE` covers all 55 existing exercises; any with no good match maps to `null` and keeps no photos (list them in the report). Duplicates: a fedb entry used as a legacy source is not added again.
- Photos: download each `images[i]` from raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/{path} into a gitignored cache (`scripts/.cache/`), convert with sharp to WebP, longest side 360 px, quality chosen so the total stays as small as possible while legible (target ≤ ~20 MB; report the total).

- [ ] Steps: failing tests for each mapper with real fedb samples (Barbell Bench Press - Medium Grip → barbell/weighted/chest; Plank → bodyweight/timed/abs; Farmer's Walk → weighted_time; Treadmill/Running → distance_time; a stretch → timed; Dumbbell Lateral Raise → side_delts; Machine-Assisted pull-up → assisted; EZ-bar curl → ez_bar) and for libraryId and buildLibrary (legacy id kept, not duplicated, count = 876 − legacy matches + 55) → implement → run the script → commit `feat(library): every free-exercise-db exercise with steps and photos`.

### Task 2: Schema, types and seed version 2
**Files:** `src/db/schema.ts` + migration 0005 (exercises.instructions json text not null default '[]', exercises.source_id text null, routines.retired integer not null default 0); `src/domain/types.ts` (Equipment gains the six values), `src/domain/labels.ts` (equipment labels: "EZ bar", "Band", "Medicine ball", "Exercise ball", "Foam roller", "Other"); `src/seed/seed.ts` (SEED_VERSION 2: upsert all library exercises; retire premades no longer in the seed (`retired = 1`); delete premade routine_exercises and days no longer in the seed); `src/db/repositories/exercisesRepo.ts` (`getExercise(db, id)` returns steps and source id); tests (seed.test, exercisesRepo.test, schema.test, snapshots.test and every test that counts exercises).
- Exercises referenced by history are never deleted; nothing user-made is touched; `next_weight` survives on routine exercises that keep their id.
- [ ] Steps: failing tests (migration 0004→0005 forward; seed v2 from a v1 DB keeps the 55 ids with their notes/prefs/history readable, adds the rest, no duplicate names from legacy matches; re-running the seed changes nothing; a dropped premade exercise row is gone; a retired premade keeps its rows) → implement → commit `feat(library): seed version 2 with the full library`.

### Task 3: The eight programs
**Files:** `src/seed/routines.ts` (eight programs; kept ids: premade-ppl-6, the upper/lower id, the full body id, the dumbbell id — renamed "4-day upper/lower", "Beginner full body", "Dumbbell full body"; new ids for Advanced full body, Bro split, Calisthenics, Mobility); `src/domain/programVolume.ts` + test; `src/db/repositories/routinesRepo.ts` (`listRoutines` hides `retired` premades unless active or referenced by a finished workout); tests.
```ts
export function weeklySetsByMuscle(days: readonly { exercises: readonly { exerciseId: string; sets: number }[] }[], muscles: (exerciseId: string) => { primary: Muscle[]; secondary: Muscle[] }): Record<Muscle, number>;   // primary 1, secondary 0.5 per set; each day once a week
export function weeklyFrequency(…same args…): Record<Muscle, number>;  // days a muscle is trained as primary
```
- Program design: evidence-based (≈10–20 hard sets per major muscle per week — chest, upper back/lats, quads, hamstrings, glutes, shoulders (front+side+rear combined), biceps, triceps — and each at least twice a week), rep ranges 5–8 for main compounds, 8–12 / 10–15 for accessories, 12–20 for calves and lateral raises; increments 5 lb (default) on most, 10 lb ('double') on lower-body barbell lifts, 0 on bodyweight-only. Bro split: one muscle group per day, 5 days, each muscle once a week with 10–20 sets. Calisthenics: bodyweight_plus and timed only. Mobility: stretches and holds (timed, seconds), 3 days.
- [ ] Steps: failing tests: each program's volume and frequency rules (bro split frequency 1; Mobility skipped), every exercise id exists in the library, day names are unique, `listRoutines` order = the eight in the spec's order then retired-but-kept ones → implement → commit `feat(routines): the eight evidence-based programs`.

### Task 4: Finding exercises
**Files:** `src/domain/search.ts` + test (word-prefix across name, aliases, muscle labels and equipment labels; `filterExercises(list, { muscle?: Muscle; equipment?: Equipment })`); `src/db/repositories/exercisesRepo.ts` (list rows carry primary muscle and whether photos exist); `app/pick-exercise.tsx` (FlatList; search; two chip rows — muscles, equipment; rows: 44pt start-photo thumbnail, name, "{Equipment} · {Primary muscle}", an info button opening the form demo; modes add | replace | routine); tests (a new `src/ui/pickExercise.test.tsx`).
- `routine` mode returns the chosen id to the editor through a small zustand store (`usePendingPick`) and closes; add/replace unchanged.
- [ ] Steps: failing tests (search "chest" finds bench press by muscle, "band" by equipment, "rdl" by alias; chips combine; 876 rows render virtualized; info opens the demo) → implement → commit `feat(library): search and filters for every exercise`.

### Task 5: Form demo
**Files:** Create `src/ui/FormDemo.tsx` + test; modify `src/ui/session/ExerciseBlock.tsx` (the exercise name is a Pressable "Show form for {name}", opens the demo after flushAll + Keyboard.dismiss), `app/pick-exercise.tsx` (info button).
- Sheet: name (Display), the two photos alternating every 1200 ms with a 250 ms cross-fade (Animated opacity), `accessibilityLabel` "{name}, start position" / "end position"; with Reduce Motion (`AccessibilityInfo.isReduceMotionEnabled` + listener) both photos side by side, no animation; muscles line "Chest · Shoulders, Triceps"; the first 3 steps numbered, then **Show all steps**; no photos → steps only; **Close**.
- [ ] Steps: failing tests (alternation with fake timers; reduce motion shows two images and no timer; 3 steps then all; no-photo case; tapping the name in a block opens it and dismisses the keyboard) → implement → commit `feat(session): a form demo for every exercise`.

### Task 6: Entitlements, the Routines screen and routine detail (data layer DONE: 9b11483..929bb43, merged db9d7b1 — screens remain)
**Files:** Create `src/platform/entitlements/index.ts` (`Entitlements` { isPro(): boolean; subscribe(fn): () => void; purchase(): Promise<'unavailable'>; restore(): Promise<boolean> }) and `freeOnly.ts` (isPro = Settings `proDebugUnlock`); `src/db/repositories/routinesRepo.ts` (`getRoutineDetail`, `duplicateRoutine(db, id, now)` → new id, name "{name} copy", days/exercises copied with new uuids and no next weights; `deleteRoutine(db, id)` — user routines only; clears activeRoutineId if it was active; `userRoutineCount`); `src/domain/routineLimit.ts` (`canAddRoutine(userCount, isPro)`); screens `app/(tabs)/routines/index.tsx` (Premade / Yours sections, **New routine**), `app/(tabs)/routines/[id].tsx` (detail), the limit sheet and "GymHound Pro is coming." sheet; tests.
- [ ] Steps: failing tests (limit: 0 → allowed, 1 → blocked unless Pro; duplicate copies days/exercises and no next weights; delete keeps finished workouts and clears active; premade can't be deleted; detail screen buttons per kind) → implement → commit `feat(routines): your routines, detail and the free limit`.

### Task 7: The routine editor (routineDraft + saveRoutine DONE in the data layer — the screen remains)
**Files:** Create `src/domain/routineDraft.ts` + test (pure reducer: name, days add/rename/reorder/delete, exercises add/reorder/remove/update fields, superset toggle with next; `validateDraft` → errors: "Give the routine a name.", "Add at least one day.", "{Day} has no exercises."), `app/(tabs)/routines/edit/[id].tsx` (`new` creates), `src/db/repositories/routinesRepo.ts` (`saveRoutine(db, draft, now)`: one transaction; existing day/exercise ids updated in place (next weights kept), new ones get uuids, removed ones deleted); tests.
- Per exercise: set count (1–10 stepper), rep range (two number fields; seconds for timed; min ≤ max), increment (number field in the display unit; default 5 lb / 2.5 kg; 0 = reps only), "Superset with next". Leaving with unsaved changes asks "Discard changes?" (**Keep editing** / **Discard**).
- [ ] Steps: failing tests (reducer ops; validation copy; save keeps an unchanged exercise's next weight; removed rows gone; reorder positions; a new routine counts toward the limit; editing the active routine updates Up next; an active workout from that routine is untouched) → implement → commit `feat(routines): create and edit your own routines`.

### Task 8: Acceptance
- [ ] `npm test`, `npm run typecheck`, `npx expo export --platform ios` offline (report the bundle and asset size; delete the output).
- [ ] Browser walkthrough on the dev server: search and filter the library, open a demo, the eight programs listed (5×5 hidden unless active), set active and start a day of each new program, create / edit / duplicate / delete a routine, the limit sheet, a workout's form demo, an existing workout's history intact.
- [ ] Ledger; Round 6 on the phone checklist.
