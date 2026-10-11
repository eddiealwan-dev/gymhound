# GymHound Phase 2 Implementation Plan — Something off and the rule

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The rule works: each exercise can be flagged Something off; finishing computes the outcome and the next weight and writes it back to the routine; the session shows the rule line and today's read; today's weight can be overridden; the finish summary and Up next show what happens next time.

**Architecture:** One additive migration (`workout_exercises.mark`). The rule is a pure function in `src/domain/progression.ts`, tested first from the spec's tables, and called inside `finishWorkout`'s existing transaction. The copy is pure functions in `src/domain/ruleLine.ts`. UI changes reuse the session's sheet patterns (`ExerciseMenu` panels, `afterSheetCloses`, R29 flushes).

**Tech Stack:** as phase 1 — Expo SDK 57 (RN 0.86), Expo Router, expo-sqlite + Drizzle (drizzle-kit migrations), zustand, Jest (jest-expo) with better-sqlite3 and react-test-renderer.

**Spec:** `docs/superpowers/specs/2026-10-09-gymhound-design.md` §18.7 (wins), §7.1, §7.3, §7.4, §8.3, §8.4, §8.5, §18.1, §18.6.

## Global Constraints
- Location, node_modules junction, Node PATH prefix, no npm install in the project, patch-package only: as `.superpowers/sdd/<plan>/environment.md` says.
- Expo Go and the web build only; no new dependency; no network.
- Domain and repository functions take `now` and never call `Date.now()`.
- Weights: 1 lb = 0.45359237 kg; compare in kg, equal within 0.01 kg; every logged entry keeps the unit it was logged in.
- Migrations are additive (no dropped columns); an older snapshot must migrate forward (§12, §17.2).
- Colours and type: the §8.2 table including textFaint and borderStrong; red only for the wordmark, the active tab and PR marks.
- All text follows the phone's text size except the wordmark and the session header's name, line and Finish label (1.3×). Rows wrap instead of capping.
- Drafts (R29): every control that reads the workout or opens a sheet calls `flushAll()` first; controls that open a sheet also call `Keyboard.dismiss()`. Number fields keep `returnKeyType="done"` (R43). Open a screen or another sheet after a sheet only through `afterSheetCloses`.
- Copy exactly as written here and in §18.7; straight apostrophes; U+00B7 "·", U+2191 "↑", U+2014 "—".
- Tests: `npm test`, `npm run typecheck`; DB tests start with `/** @jest-environment node */`; test ThemeProvider mocks list textFaint and borderStrong.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Branch `phase-2`; never merge it.

## Review Focus
1. **Units:** a set logged in kg on an lb plan, a barbell raise in kg with kg plates, an assisted raise that would go below 0 — Task 2 tests each.
2. **Barbell rounding past the plates:** a raise above the heaviest loadable total still goes up (step rule) — Task 2.
3. **Flag then unflag:** clearing Something off before finishing gives a normal outcome — Tasks 1 and 3.
4. **An override on a flagged exercise** holds the planned weight, not the override — Task 2 and Task 4.
5. **No plan yet (first run):** the read says "Pick a starting weight…", a flagged first run holds the working weight — Tasks 2 and 4.

---

### Task 1: The per-exercise mark, and the writers for mark and override
**Files:** Create `drizzle/0004_*.sql` via `npm run db:generate` (plus the journal/`migrations.js` entries, following 0002/0003); modify `src/db/schema.ts`, `src/domain/types.ts`, `src/domain/labels.ts`, `src/db/repositories/workoutViewsRepo.ts`, `src/db/repositories/workoutEditRepo.ts`, `src/state/sessionActions.ts`, `src/db/repositories/exportRepo.ts` / `src/domain/csv.ts`; tests beside each.

**Interfaces (Produces):**
```ts
// types.ts
export type ExerciseMark = 'rough_sleep' | 'sick' | 'short_on_food' | 'pain' | 'cutting';
export type DayMark = 'normal' | ExerciseMark;           // 'sick' added
// labels.ts
export const MARK_LABELS: Record<ExerciseMark, string>;   // 'Rough sleep','Sick','Short on food','Pain','Cutting'; DAY_MARK_LABELS gains sick: 'Sick'
// schema.ts: workoutExercises.mark: text('mark').$type<ExerciseMark>() (nullable)
// workoutViewsRepo: WorkoutExerciseView gains mark: ExerciseMark | null
// workoutEditRepo
export function setExerciseMark(db: Db, workoutExerciseId: string, mark: ExerciseMark | null): void;
export function setOverride(db: Db, workoutExerciseId: string, weight: number | null, unit: WeightUnit | null): void;
// sessionActions (bumpData after each)
export function markExercise(db: Db, workoutExerciseId: string, mark: ExerciseMark | null): void;
export function overrideWeight(db: Db, workoutExerciseId: string, weight: number | null, unit: WeightUnit | null): void;
```
- Both writers act only on an exercise of the **active** workout (throw like the other edit functions otherwise).
- CSV: the `day_mark` column is the exercise's mark, or `normal` when null. Header unchanged.
- `replaceExercise` keeps the mark (it is about today, not the movement) and still clears the override.

- [ ] Step 1: failing tests — migration applies on a fresh DB and on a DB at 0003 (existing rows get mark null); the snapshot-restore migration test still passes; setExerciseMark/setOverride round-trip through getActiveWorkoutView; both throw for a finished workout; CSV day_mark 'rough_sleep' / 'normal'; MARK_LABELS values.
- [ ] Step 2: run, see them fail. Step 3: implement. Step 4: `npm test`, `npm run typecheck` green. Step 5: commit `feat(marks): something off per exercise in the database; override writer`.

### Task 2: computeOutcome
**Files:** Create `src/domain/progression.ts`, `src/domain/progression.test.ts`.

**Interfaces (Produces):**
```ts
export type Outcome = 'raised' | 'held' | 'held_marked' | 'no_rule' | 'no_sets';
export type OutcomeInput = {
  rule: { setCount: number; repMin: number; repMax: number; increment: number; incrementUnit: WeightUnit } | null;
  plannedWeight: number | null; plannedUnit: WeightUnit | null;
  loggingType: LoggingType; equipment: Equipment;
  marked: boolean;
  sets: readonly { setType: SetType; done: boolean; weight: number | null; weightUnit: WeightUnit | null; reps: number | null; durationS: number | null }[];
  gear: { lb: Gear; kg: Gear };
};
export type OutcomeResult = { workingWeight: number | null; workingUnit: WeightUnit | null; outcome: Outcome; nextWeight: number | null; nextUnit: WeightUnit | null };
export function computeOutcome(input: OutcomeInput): OutcomeResult;
export function raiseLoadable(raised: number, working: number, gear: Gear): number | null; // nearest loadable > working, step rule above the plates; null if none heavier
```
- Implements §7.3 steps 1–7 exactly, with "marked day" = `marked`.
- Working weight: easiest counted load, compared in kg; `workingUnit` is the unit of the set it came from (R62); an empty load counts 0 (in the plan's unit, else the first counted set's unit, else 'lb'). Null for timed/distance_time.
- Next weight unit = workingUnit; the increment converts with `convertIncrement`; barbell raises round with that unit's gear via `raiseLoadable`; above the heaviest loadable total, step by twice the smallest owned plate (as `planInUnit`). held_marked/no_sets keep `plannedWeight`/`plannedUnit` (held_marked falls back to the working weight when there is no plan).

- [ ] Step 1: failing tests (exact values): no rule → no_rule, no next, working weight still computed; timed → no_rule, null working; rule + no counted sets → no_sets, next = planned; 3×8 at 135 lb all reps ≥ rep_max 8, increment 5 lb, dumbbell → raised 140 lb; one set short → held 135; increment 0 → held; marked all hit → held_marked next = planned 135 (and = working when no plan); barbell 135 lb raise 5 with default lb gear → 140; barbell above heaviest loadable keeps rising by the step; nothing heavier loadable → held at working; assisted 40 lb all hit inc 10 → raised 30, and 5 lb inc 10 → 0; weighted_time uses duration ≥ rep_max seconds; bodyweight_plus empty load counts 0 → raised to increment; mixed units: sets 60 kg and 135 lb → working is the lower in kg with its own unit; increment 5 lb on a kg working weight → 2.5 kg; failure sets count, warmups and drops don't.
- [ ] Step 2–5: fail, implement, green, commit `feat(rule): computeOutcome (§7.3)`.

### Task 3: Finish writes the outcome and the routine's next weight
**Files:** Modify `src/db/repositories/workoutsRepo.ts` (`finishWorkout`), `src/db/repositories/workoutsRepo.test.ts`; read settings gear via `getSettings` + `gearFor`.

**Interfaces:** Consumes Task 1's `mark` and Task 2's `computeOutcome`. Produces: after `finishWorkout`, each kept `workout_exercises` row has `working_weight/working_unit/outcome/next_weight/next_unit`; for rows with `routine_exercise_id` and an outcome other than `no_rule`, `routine_exercises.next_weight/next_weight_unit` = that row's next weight/unit — all inside the existing transaction, after unticked sets are dropped.

- [ ] Step 1: failing tests on a seeded DB: Push A bench 4 sets all at 135 × 8 (rule 5–8, inc 5 lb) → workout_exercise raised 140 lb and routine_exercises.next_weight 140 lb; the next startWorkoutFromDay plans 140; one set at 7 → held 135; flagged rough_sleep → held_marked keeps planned; flag then clear → raised; no ticks on an exercise → it's dropped (unchanged) and next_weight untouched; an empty workout (no routine) writes outcomes no_rule and no routine row; a finish refused (nothing ticked) writes nothing. Existing finishWorkout and rotation tests stay green.
- [ ] Step 2–5: fail, implement, green, commit `feat(rule): finish computes the outcome and writes next time's weight`.

### Task 4: The rule line and today's read
**Files:** Create `src/domain/ruleLine.ts` + test; modify `src/ui/session/ExerciseBlock.tsx` + `ExerciseBlock.test.tsx`; `src/db/repositories/workoutViewsRepo.ts` if the view lacks last time's sets summary for the no-rule rows.

**Interfaces (Produces):**
```ts
export function ruleSentence(a: { rule: Rule | null; loggingType: LoggingType; unit: WeightUnit; last: LastSummary | null }): string;   // §7.4 rule table, all 8 rows
export function todaysRead(a: { rule: Rule | null; loggingType: LoggingType; planned: { weight: number; unit: WeightUnit } | null; override: { weight: number; unit: WeightUnit } | null; mark: ExerciseMark | null; equipment: Equipment; gear: Gear }): string | null; // §7.4 read table, R61 copy for marks; null where the spec shows no read
export type LastSummary = { sets: number; reps: number | null; weight: number | null; weightUnit: WeightUnit | null; durationS: number | null; distance: number | null; distanceUnit: DistanceUnit | null };
```
- `{inc}` formats with its unit ("5 lb"); `{raised}` is planned + increment rounded as in §7.3 step 6 (use `raiseLoadable`); `{rep_max}s` for weighted_time reads "Reach {rep_max}s".
- Marked copy (R61): "Hit {rep_max}s on a normal day and next time is {raised}. {Reason} today, so {planned} holds." and "Today is set to {override} by you. {Reason} today, so {planned} holds."
- Block: under the name row (and under the note line, above the table) a muted Body 14 paragraph: the rule sentence, then today's read; a flagged exercise also shows "Something off: {Reason}" (muted, its own line). No caps; wraps.

- [ ] Step 1: failing tests: every row of both §7.4 tables with exact strings (lb and kg, inc 5 lb / 2.5 kg, rep_max 8, weighted_time 60s), the two R61 marked strings, override strings, no plan → "Pick a starting weight. Next time builds from it."; block shows the sentence, the read and the Something off line; no read for timed/distance/increment 0.
- [ ] Step 2–5: fail, implement, green, commit `feat(session): the rule line and today's read`.

### Task 5: Something off and Override in the ⋯ menu
**Files:** Modify `src/ui/session/ExerciseMenu.tsx` + test, `app/session.tsx` only if wiring is needed.

- Menu gains **Something off** (shows " · {Reason}" when flagged) → panel 'mark': title "Something off", the exercise name, buttons Rough sleep, Sick, Short on food, Pain, Cutting (the current one `selected`), **Nothing off** (only when flagged), **Cancel**. Choosing calls `markExercise` and closes.
- Menu gains **Override today's weight** (shows " · {weight}" when set; hidden for timed and distance_time) → panel 'override': title "Today's weight", the exercise name, one number field (display unit label, `keyboardType="decimal-pad"`, `returnKeyType="done"`, prefilled with the override or the planned weight), **Save** (parseDecimal; invalid shows "Check this number" and saves nothing), **Clear** (only when set), **Cancel**. Saving stores the display unit.
- Sheet sequencing as the existing panels (afterSheetCloses); the menu already flushes and dismisses on open.

- [ ] Step 1: failing tests: menu shows both items with their current values; choosing Pain calls markExercise('db', weId, 'pain'); Nothing off → null; Save 145 → overrideWeight('db', weId, 145, 'lb'); "abc" → "Check this number", no call; Clear → overrideWeight(…, null, null); timed exercise has no override item; the number field has returnKeyType done.
- [ ] Step 2–5: fail, implement, green, commit `feat(session): something off and today's weight in the ⋯ menu`.

### Task 6: Finish summary next-time lines
**Files:** Modify `src/db/repositories/workoutViewsRepo.ts` (`getFinishSummary` gains `next: { name: string; outcome: Outcome; nextWeight: number; nextUnit: WeightUnit; mark: ExerciseMark | null }[]` for exercises with a rule and a next weight, in workout order), `app/finish/[id].tsx`, tests; pure `finishLine(n)` in `src/domain/ruleLine.ts`.
- Lines (R64): raised "Bench press — next time 185 lb ↑"; held "Bench press — holds at 180 lb"; held_marked "Bench press — holds at 180 lb · Rough sleep"; no_sets "Bench press — holds at 185 lb".
- [ ] Steps: failing tests (domain strings; repo summary after a real finish; screen shows the lines under the stats) → implement → green → commit `feat(finish): next time's weight for each exercise`.

### Task 7: Up next shows last time's outcome, in the display unit
**Files:** Modify `src/db/repositories/routinesRepo.ts` (`UpNextExercise` gains `lastOutcome: Outcome | null`, `lastMark: ExerciseMark | null`, from the most recent finished workout_exercise linked to that routine exercise), `src/domain/upNext.ts` (`upNextLoad` converts via `planInUnit` to the display unit with the display unit's gear; new `upNextOutcome(e, displayUnit): string | null` → " · ↑ 5 lb" (the routine increment, display unit by convertIncrement), " · held · Rough sleep", " · held"; null for no history, no_rule, no_sets), `app/(tabs)/index.tsx`, tests.
- [ ] Steps: failing tests (repo: after a raised finish the next getUpNext row has lastOutcome 'raised'; domain strings; a kg user sees a 135 lb plan as 60 kg on a barbell with kg plates; Train row "4×5–8 · 140 lb · ↑ 5 lb") → implement → green → commit `feat(train): Up next shows last time's outcome, in your unit`.

### Task 8: Acceptance
- [ ] `npm test`, `npm run typecheck`, `npx expo export --platform ios` offline (delete the output).
- [ ] Browser walkthrough on the owner's dev server (http://localhost:8082): finish Push A with all sets hit → summary "Bench press — next time … ↑", Train row "· ↑ 5 lb", next start plans the raised weight; flag Pain → summary "holds … · Pain"; override → read copy; kg display.
- [ ] Ledger results; publish Round 5 on the phone checklist (device-only checks).
