# GymHound Polish Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the owner's seven approved items from the UX review before phase 2:
- Train leads with today's workout.
- Today's values carry to the next set.
- Finish confirms before it drops untouched sets.
- The session header shows progress and Finish.
- Suggested values look like suggestions.
- Exercise blocks are slimmer.
- The rest row is a clear live timer with +15s.

**Architecture:**
- There is no schema change and no new dependency.
- Each item adds pure rules under `src/domain`, tested first with no mocks. They are then wired into the existing screens and `sessionActions`.
- The shared pieces land first: a compact `Button` size and two colour tokens.
- The items that edit the same files (`SetRow`, `ExerciseBlock`, `app/session.tsx`) run one after another.

**Tech Stack:** the same as phase 1: Expo SDK 57 (React Native 0.86, New Architecture), Expo Router, expo-sqlite with Drizzle, zustand and expo-haptics. Tests use Jest (jest-expo), react-test-renderer and better-sqlite3.

**Spec:** `docs/superpowers/specs/2026-10-09-gymhound-design.md` §18.6, which wins over §8.3 and §8.4 where they differ.
- Read §8.2–§8.4, §18.2, §18.4 and §18.6 first.
- Background is the UX review data in `.superpowers/ux-review/`: `synthesis.json`, and `polish-map.json`, which maps each item to its files and line numbers.

## Global Constraints

- **Location:**
  - The project root is `C:\Users\eddie\OneDrive\Documents\GymHound`.
  - `node_modules` is a junction to `C:\Users\eddie\.gymhound\node_modules`. Never run `npm install` in the project.
  - This plan adds no dependency.
  - In Git Bash, first run `export PATH="/c/Users/eddie/AppData/Local/Programs/node-v24.20.0-win-x64:$PATH"`.
- **Platform:** Expo Go and the web build only. No new native module.
- **Network:** no network calls.
- **Time:**
  - Domain and repository functions take `now` as a parameter and never call `Date.now()`.
  - `sessionActions` and UI hooks may call it, as they do today.
- **Colours:**

  | token | dark | light |
  |---|---|---|
  | bg | #100f0c | #f6f3ec |
  | surface | #1a1814 | #ffffff |
  | surfaceRaised | #232019 | #efebe3 |
  | border | #2e2a23 | #ddd7cb |
  | text | #f1ece2 | #15130f |
  | textMuted | #a39d90 | #6b665c |
  | textFaint | #6d675c | #8f897d |
  | borderStrong | #736c60 | #8a8478 |
  | red | #E10600 | #E10600 |

- **Red** is used only for the GYMHOUND wordmark, the active tab and PR marks. The progress line, the rest track and the "Rest's up" check use `text`.
- **Text size:** all text follows the phone's text size. The exceptions are the wordmark (fixed) and, from Task 5, the session header's name, its progress line and its Finish label, which use `maxFontSizeMultiplier={1.3}`. Nothing else gets a cap. Rows wrap instead.
- **Drafts (R29):** a typed value lives in its row until the field is left or `flushAll()` runs.
  - Every control that reads the workout to decide something, or that opens a sheet, calls `flushAll()` first.
  - Every control that opens a sheet also calls `Keyboard.dismiss()` (phase 1 Task 24).
- **Number fields (R43):** keep `returnKeyType="done"`, `selectTextOnFocus`, and no `inputAccessoryViewID`.
- **After a sheet:** open another screen only through `afterSheetCloses` (`src/ui/Sheet.tsx`). iOS cannot present while a Modal fades.
- **Copy:**
  - Use U+2212 in "−15s", U+00B7 in "·" and U+2014 for a missing load "—".
  - Use straight apostrophes ("Rest's up", "won't").
  - Strings are exactly as written in this plan.
- **Hit targets:** at least 44pt. A compact button is 36pt with `hitSlop` 4.
- **Unchanged:** the header wordmark, the hound, the footer, the dock and the database.
- **Tests:**
  - Run `npm test` and `npm run typecheck`.
  - Database tests start with `/** @jest-environment node */`.
  - Test files that mock `ThemeProvider` list `textFaint` and `borderStrong` (Task 1 adds them).
- **Browser checks:**
  - The owner's `npx expo start --offline` serves the web build on port 8081. Never stop it.
  - Use a fresh browser-pane tab at `http://localhost:8081/`, and one tab per origin.
- **Commits:** every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A value typed but not left yet** when Finish, the countdown or a not-ready tick is tapped. Finish and the countdown must save it before they read or open anything. A not-ready tick must keep the keyboard on the field it focuses.
   - Task 4 has "saves typed text before it counts".
   - Task 5 has "Finish in the header saves first".
   - Task 8 has "tapping the countdown saves and closes the keyboard first".
   - Task 3 has "tapping it focuses the weight field…", which asserts that `Keyboard.dismiss` is not called.
2. **Skip versus a natural end.** "Rest's up" shows only after a rest runs out. It never shows after Skip or a −15s that skips, including when the old end time passes later.
   - Task 8 has the `useRestUp` tests.
3. **An empty workout, or one with no routine day.** The header shows only the time, with a 0% line and never "NaN%". Finish says nothing about Up next, and the next set is null.
   - Tasks 4 and 5.
4. **A 320pt screen and the largest text.**
   - Train rows wrap.
   - The block header [name][2/4][+ Note][⋯] keeps ⋯ at 44pt.
   - The rest row's pills wrap under the time.
   - The header stays one row.
   - Structural tests are in Tasks 2, 5, 7 and 8, and the walkthrough at 320 is in Task 9.
5. **What a field shows is what its tick logs**, including for a kg user, a carried weight in the other unit, and a cleared field on a row with a target.
   - Tasks 3 and 6.

## As built (read before Task 1)

- The phase-1 rulings R1–R47 in `.superpowers/sdd/2026-10-09-gymhound-phase-1/progress.md` still hold. New rulings continue from R48.
- Four test files mount `<Session />` with mocked repos: `sessionFinish`, `sessionDock`, `sessionKeyboard` and `sessionRest`. Each mocks `workoutsRepo` and the `useDbQuery` result (the `readSession` shape). A task that changes either shape updates all four, plus `sessionHeader` once Task 5 creates it.
- `src/ui/session/ExerciseBlock.test.tsx` renders the real `SetRow`.
  - Its helpers are `set`, `bench`, `mount`, `byLabel`, `shownText`, `press` and `oneDone`. Block and row tests follow them.
  - Its trees are never unmounted. A test that calls `flushAll()` unmounts its own tree in a `finally`, and asserts with `toHaveBeenCalledWith`, not global call counts.
- **Reading styles:**
  - Read a Pressable's style with `node.props.style({ pressed: false })`.
  - Read a TextInput's style with `StyleSheet.flatten(node.props.style)`.
  - The jest TextInput mock has a `focus` method on each instance. Spy on it with `jest.spyOn(node.instance, 'focus')`.

## File map

| File | Tasks |
|---|---|
| `src/ui/Button.tsx`, `src/ui/theme.ts` | 1 |
| `app/(tabs)/index.tsx`, `src/domain/upNext.ts` (new) | 2 |
| `src/domain/setEntry.ts` | 3, 8 |
| `src/domain/setTable.ts` | 3, 6 |
| `src/ui/session/SetRow.tsx` | 3, 5, 6 |
| `src/domain/sessionProgress.ts` (new) | 4, 5, 8 |
| `src/domain/finishCheck.ts` (new), `src/db/repositories/workoutsRepo.ts`, `src/ui/Sheet.tsx` | 4 |
| `app/session.tsx` | 4, 5, 8 |
| `src/ui/session/ExerciseBlock.tsx` | 5, 7, 8 |
| `src/domain/rest.ts`, `src/state/sessionActions.ts`, `RestInline`, `RestBar`, `RestWatcher`, `ExerciseMenu`, `useRestUp.ts` (new), `src/platform/announce.ts` (new) | 8 |

---

### Task 1: Compact button and two colour tokens

**Files:**
- Modify: `src/ui/Button.tsx`, `src/ui/theme.ts`, `src/ui/theme.test.ts`
- Create: `src/ui/Button.test.tsx`
- Modify, mocks only: every `*.test.tsx` whose `ThemeProvider` mock lists the dark colours. There are 16; find them with `grep -rl "ThemeProvider'" src --include=*.test.tsx`. Add `textFaint: '#6d675c', borderStrong: '#736c60'`.

**Interfaces:**
- Produces:
  - `Colors` gains `textFaint: string` and `borderStrong: string`. The values are in the Global Constraints table.
  - `export type ButtonSize = 'regular' | 'compact'`.
  - `Button` props gain:
    - `size?: ButtonSize`, default `'regular'`;
    - `accessibilityLabel?: string`, passed to the Pressable;
    - `maxFontSizeMultiplier?: number`, passed to the label.
  - `compact`: minHeight 36, paddingHorizontal 12, borderRadius 18 and `hitSlop={4}`, with a label fontSize of 15. With `variant="secondary"`, the border is `colors.borderStrong`.
  - `regular` is exactly today's button:
    - minHeight 48, paddingHorizontal 20, borderRadius 12;
    - the secondary border is `colors.border`;
    - no hitSlop, and the label at Body's default size.
    - None of the 21 existing call sites changes.

- [ ] **Step 1: Write the failing theme tests** in `src/ui/theme.test.ts`. Use a local WCAG helper, `ratio(fg, bg)`, built on relative luminance.

```ts
it('has the dark palette from the spec', () => expect(darkColors).toEqual({ /* the seven existing keys */ textFaint: '#6d675c', borderStrong: '#736c60' }));
it('has the light palette from the spec', () => expect(lightColors).toEqual({ /* … */ textFaint: '#8f897d', borderStrong: '#8a8478' }));
it('suggested text reads at 3:1 or more on the field', () => {
  for (const c of [darkColors, lightColors]) { expect(ratio(c.textFaint, c.bg)).toBeGreaterThanOrEqual(3); expect(ratio(c.textFaint, c.surface)).toBeGreaterThanOrEqual(3); }
});
it('field edges read at 3:1 or more', () => {
  for (const c of [darkColors, lightColors]) for (const g of [c.bg, c.surface, c.surfaceRaised]) expect(ratio(c.borderStrong, g)).toBeGreaterThanOrEqual(3);
});
```

- [ ] **Step 2: Write the failing Button tests** in a new `src/ui/Button.test.tsx`.
  - Copy the act/create header from `src/state/useDraftFlush.test.tsx`.
  - Mock `./ThemeProvider` with the dark colours, including the two new keys.

```ts
it('compact is 36pt tall with a 4pt hitSlop, for a 44pt target')
  // <Button label="+ Set" variant="quiet" size="compact" onPress={fn} />
  // pressable.props.style({ pressed: false }) toMatchObject { minHeight: 36, paddingHorizontal: 12, borderRadius: 18 }
  // pressable.props.hitSlop === 4; label Text flattened style fontSize === 15
it('compact secondary is outlined in borderStrong')       // borderColor '#736c60'
it('regular is unchanged')                                 // secondary: { minHeight: 48, paddingHorizontal: 20, borderRadius: 12, borderColor: '#2e2a23' }, hitSlop undefined
it('passes accessibilityLabel and maxFontSizeMultiplier through')
  // accessibilityLabel 'Add a set to Bench Press' on the Pressable; maxFontSizeMultiplier 1.3 on the label Text
```

- [ ] **Step 3: Run the tests and check they fail.**
  - Command: `npx jest src/ui/theme.test.ts src/ui/Button.test.tsx`
  - Expected: FAIL, because the keys and the size are missing.
- [ ] **Step 4: Implement** the two tokens in `theme.ts`, and `size`, `accessibilityLabel` and `maxFontSizeMultiplier` in `Button.tsx`.
- [ ] **Step 5: Add the two tokens** to every ThemeProvider mock listed under Files.
- [ ] **Step 6: Run** `npm test` and `npm run typecheck`. Expected: all green.
- [ ] **Step 7: Commit.** `git commit -m "feat(ui): compact button size and the textFaint/borderStrong tokens"`

---

### Task 2: Train leads with today's workout

**Files:**
- Create: `src/domain/upNext.ts`, `src/domain/upNext.test.ts`, `src/ui/train.test.tsx`
- Modify: `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes, all unchanged:
  - `UpNext` and `UpNextExercise` (`src/db/repositories/routinesRepo.ts` L16-35);
  - `formatWeight` (`src/domain/units.ts`);
  - `formatRepScheme` and `DAY_MARK_LABELS` (`src/domain/labels.ts`);
  - `formatTrainDate` and `fromLocalDate` (`src/domain/dates.ts`);
  - `afterSheetCloses` (`src/ui/Sheet.tsx`).
- Produces (`src/domain/upNext.ts`):

```ts
export type UpNextLoadInput = { loggingType: LoggingType; nextWeight: number | null; nextWeightUnit: WeightUnit | null };
/** A day needs weights when some exercise's type needs a load and no exercise of the day has a weight. */
export function upNextNeedsWeights(exercises: readonly UpNextLoadInput[]): boolean;
/** The weight; '—' when the type needs a load, it has none, and another exercise of the day has one; else null. */
export function upNextLoad(exercise: UpNextLoadInput, dayHasWeight: boolean): string | null;
export function upNextSubtitle(lastTime: { localDate: string; dayMark: DayMark } | null, needsWeights: boolean, locale: string): string;
/** The day's name, or "{routine} {day}" when the day's name has 1 or 2 characters ("5×5 A"). Task 4 uses it. */
export function dayTitle(routineName: string, dayName: string): string;
export function startDayLabel(routineName: string, dayName: string): string; // `Start ${dayTitle(…)}`
```

- **"Needs a load"** means `weighted`, `weighted_time` or `assisted`.
  - `bodyweight_plus`, `timed` and `distance_time` never show "—" and never make a day need weights. A bodyweight day must not read "Pick weights as you go."
  - A `bodyweight_plus` exercise with a weight still shows it.
- **Screen pieces in `index.tsx`:**
  - `Eyebrow({ children })`: Body 600, fontSize 14, muted, letterSpacing 0.5. The text is the literal uppercase string.
  - `UpNextCard({ upNext, locale, onStart })`, where `upNext` is no longer nullable.
  - `NoRoutineCard({ onStartEmpty })`.
  - `ChangeRoutineLink()`, modelled on Routines' `BackToTrain`:
    - a Pressable with Body 600 "Change routine" and Ionicons `chevron-forward`;
    - minHeight 44, `accessibilityRole="button"`, `accessibilityLabel="Change routine"`;
    - `router.push('/routines')`.
  - `ResumeCard` keeps its props, and its muted "Resume" label becomes `<Eyebrow>IN PROGRESS</Eyebrow>`.
- **Exercise rows:**
  - One line each, paddingVertical 8. The row has `flexDirection: 'row'`, `flexWrap: 'wrap'` and columnGap 8.
  - The name is Body with flex 1 and minWidth 0, and may wrap.
  - The right text is Body muted at fontSize 14, tabular-nums: `formatRepScheme(…)`, plus `` ` · ${load}` `` when `upNextLoad` returns text. It has no `flexShrink: 0`, so large text drops it under the name.
- **The three states and the guard:** see spec §18.6.
  - The guard sheet's Resume runs `setBlocked(false); afterSheetCloses(openSession)`.
- **Removed copy:** "Start this", "Start empty", the "Routines" button, "Pick a routine to see what's up next.", "pick a weight", and the card label "Resume".

- [ ] **Step 1: Write the failing domain tests** in `src/domain/upNext.test.ts`.

```ts
const w = (nextWeight: number | null, unit: WeightUnit | null = nextWeight === null ? null : 'kg') => ({ loggingType: 'weighted' as const, nextWeight, nextWeightUnit: unit });
expect(upNextLoad(w(60), true)).toBe('60 kg'); expect(upNextLoad(w(62.5, 'lb'), true)).toBe('62.5 lb');
expect(upNextLoad(w(null), true)).toBe('—'); expect(upNextLoad(w(null), false)).toBeNull();
expect(upNextLoad({ loggingType: 'timed', nextWeight: null, nextWeightUnit: null }, true)).toBeNull();          // and 'distance_time', 'bodyweight_plus'
expect(upNextNeedsWeights([w(null), { loggingType: 'timed', nextWeight: null, nextWeightUnit: null }])).toBe(true);
expect(upNextNeedsWeights([w(null), w(60)])).toBe(false);
expect(upNextNeedsWeights([{ loggingType: 'bodyweight_plus', nextWeight: null, nextWeightUnit: null }])).toBe(false);
expect(upNextSubtitle(null, true, 'en-GB')).toBe('First time on this day. Pick weights as you go.');
expect(upNextSubtitle(null, false, 'en-GB')).toBe('First time on this day.');
expect(upNextSubtitle({ localDate: '2026-10-07', dayMark: 'rough_sleep' }, false, 'en-GB')).toBe('Last time: WED 7 OCT · Rough sleep');
expect(upNextSubtitle({ localDate: '2026-10-07', dayMark: 'rough_sleep' }, true, 'en-GB')).toBe('Last time: WED 7 OCT · Rough sleep. Pick weights as you go.');
expect(dayTitle('Upper/lower', 'Upper A')).toBe('Upper A'); expect(dayTitle('5×5', 'A')).toBe('5×5 A');
expect(startDayLabel('Upper/lower', 'Upper A')).toBe('Start Upper A'); expect(startDayLabel('5×5', 'B')).toBe('Start 5×5 B');
```

- [ ] **Step 2: Write the failing screen tests** in a new `src/ui/train.test.tsx`, the first render test of Train.
  - **Mocks:**
    - `expo-router` (`router.push`, `useFocusEffect`);
    - `expo-localization` (en-GB);
    - Ionicons;
    - safe area;
    - `useDb` → `'db'`;
    - `useDbQuery` → `mockRead`, which is `{ unit: 'kg', active, upNext, trainingDates: [], weekVolume: 0 }`;
    - `sessionActions` (`startEmpty`, `startFromDay`);
    - `useNow` → `new Date(2026, 9, 10, 9, 0).getTime()`;
    - `./Footer`;
    - the repos (`workoutsRepo` exports a real `ActiveWorkoutExistsError` class for the test to throw);
    - ThemeProvider.
  - **Helpers:** `lines(tree)` from `settingsExport.test.tsx`, `shownText(tree)` and `press(tree, label)` from `sessionFinish.test.tsx`.
  - **Fixture:**
    - The Upper/lower "Upper A" day (`dayId 'ul:upper-a'`, `lastTime null`).
    - Barbell bench press: weighted, 4×5–8, no weight.
    - Barbell row: weighted, 4×6–10, no weight.
    - Plank: timed, 3×30–60, no weight.

```ts
it('Up next comes right after the date and before the stat cards')        // index('UP NEXT') > index(date line), < index('Streak')
it('Start Upper A is the filled button under the title')                  // variant primary; before 'Barbell bench press'; press → startFromDay('db','ul:upper-a'), router.push('/session')
it('one filled button in each state')                                     // Up next, no routine, in progress: exactly one primary Button
it('first run: says pick weights once, and no row says pick a weight')    // 'First time on this day. Pick weights as you go.'; no 'pick a weight'; '4×5–8', '3×30–60s'
it('a row with no weight shows — once another has one')                   // bench 60 kg: '4×5–8 · 60 kg', '4×6–10 · —', plank exactly '3×30–60s'
it('Start empty workout is outlined and after the stat cards')            // variant 'secondary', after 'This week'; press → startEmpty('db'), push('/session'); no 'Start empty', 'Start this', 'Routines'
it('Change routine opens Routines')                                       // accessibilityLabel 'Change routine' → push('/routines')
it('no routine: one card, Choose a routine filled, Start empty workout outlined')
  // 'No routine yet. Pick one and Train will line up your next workout.'; 'Choose a routine' primary → push('/routines');
  // exactly one 'Start empty workout' (secondary); no "Pick a routine to see what's up next." and no 'Change routine'
it('in progress: IN PROGRESS, Resume is the only filled button')          // active { name 'Upper A', startedAt NOW−27 min, setsDone 5 }: 'IN PROGRESS', '27:00 · 5 sets done'; no 'Start empty workout', 'UP NEXT', 'Start Upper A'
it('a one-letter day reads Start 5×5 A')                                  // routineName '5×5', dayName 'A'
it('the guard still blocks a second workout')                             // startFromDay throws ActiveWorkoutExistsError → 'Finish or discard the workout in progress first.'; push not called;
                                                                          // sheet Resume + jest.runAllTimers() → push('/session')
it('a long row wraps instead of squeezing the name')                      // the row View style has flexWrap 'wrap'; the right Text has no flexShrink 0
```

- [ ] **Step 3: Run the tests and check they fail.**
  - Command: `npx jest src/domain/upNext.test.ts src/ui/train.test.tsx`
  - Expected: FAIL.
- [ ] **Step 4: Implement** `upNext.ts`, then rebuild `index.tsx` in the order §18.6 gives. `readTrain`, `begin()`, `startFromDay` and `startEmpty` are unchanged.
- [ ] **Step 5: Run** `npm test` and `npm run typecheck`. Expected: green.
- [ ] **Step 6: Commit.** `git commit -m "feat(train): lead with today's workout; Start {day} above the fold"`

---

### Task 3: Carry today's values, and a not-ready tick that says why

**Files:**
- Modify: `src/domain/setEntry.ts` and `.test.ts`, `src/domain/setTable.ts` and `.test.ts`, `src/ui/session/SetRow.tsx`, `src/ui/session/ExerciseBlock.test.tsx`
- Modify: `src/state/sessionActions.ts` (its doc comment only) and `src/state/sessionActions.test.ts`
- Modify, mocks: the `expo-haptics` mock in `ExerciseBlock.test.tsx` and `sessionRest.test.tsx` gains `notificationAsync: jest.fn(() => Promise.resolve())` and `NotificationFeedbackType: { Warning: 'warning' }`.

**Interfaces:**
- Produces:

```ts
// setEntry.ts
export type Carried = Pick<PrevSet, 'weight' | 'weightUnit' | 'reps' | 'durationS' | 'distance'>;
/** Per field, the nearest set above `index` of the same set type with a stored value (ticked or typed); null if none. Never looks below or at other types. */
export function carryAbove(current: ReadonlyArray<Pick<PrevSet, 'setType'> & Carried>, index: number): Carried | null;
export function placeholdersFor(a: { previous: PrevSet | null; ruleRepMax: number | null; loggingType?: LoggingType; unit?: WeightUnit; carried?: Carried | null }): SetFields;
// setTable.ts
export type RowReading = { /* existing fields */ missing: FieldKey | null };
```

- **`placeholdersFor` with a carry.** `carried` counts only when `previous === null`, because history wins row by row.
  - The weight is the carried weight, converted with the same `roundToHalf(convertWeight(…))` when its unit differs from `unit`. For `bodyweight_plus`, a carried 0 is null.
  - Reps are `ruleIsSeconds ? null : (ruleReps ?? carried.reps)`, so the rule beats today's reps.
  - The duration is `ruleIsSeconds ? (ruleRepMax ?? carried.durationS) : carried.durationS`.
  - The distance is `carried.distance`.
  - Update the doc comment to say this order.
- **`buildRows`** passes `carried: matched[i] === null ? carryAbove(ex.sets, i) : null`.
  - When the row has a target (a working set where `targetFor` is not null), it drops the carried weight. The target wins.
  - `row.previous` (the Previous column) is untouched.
- **`missing`** is the first field in `FIELDS` order that the logging type needs and that has no value from what was entered, the target (weight only) or the placeholder. `bodyweight_plus` needs only reps.
- **`SetRow`:**
  - `const inputs = useRef<Partial<Record<InputKey, TextInput | null>>>({})`, with a `ref` on each input.
  - `const [need, setNeed] = useState<FieldKey | null>(null)`. Typing clears it.
  - `warningHaptic()` calls `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)` with lightHaptic's try/catch and `.catch(() => {})`.
- **`toggle`:**
  - A done set unticks, then calls `Keyboard.dismiss()`.
  - A not-ready set (`!canTick`) does one of two things, then calls `warningHaptic()`. It does **not** call `Keyboard.dismiss()`.
    - With invalid text: it adds those keys to `left`, which shows "Check this number", and focuses `invalid[0]`.
    - Otherwise: it calls `setNeed(reading.missing)` and focuses that input.
  - Otherwise it ticks as today, then calls `Keyboard.dismiss()`.
- **The tick Pressable:**
  - `disabled` is removed.
  - Opacity is `pressed ? 0.8 : 1`.
  - `borderStyle` is `'dashed'` while not ready and `'solid'` otherwise.
  - `accessibilityHint` is `NEED_HINT[reading.missing]` while not ready.
  - The done look is unchanged.
- **The line under the row** shows "Check this number" when `showHint`. Otherwise, when `need !== null && !set.done && !canTick`, it shows `NEED_LINE[need]`, in the same Body muted 12pt with `accessibilityLiveRegion="polite"`.
- **Copy:**

```ts
const NEED_LINE: Record<FieldKey, string> = { weight: 'Add a weight to tick', reps: 'Add reps to tick', durationS: 'Add a time to tick', distance: 'Add a distance to tick' };
const NEED_HINT: Record<FieldKey, string> = { weight: 'Enter a weight first', reps: 'Enter reps first', durationS: 'Enter a time first', distance: 'Enter a distance first' };
```

- **Ruling R48, WYSIWYG:** a tick logs what its row shows. A value typed in another row still being edited carries once that row is left. There is no cross-row flush before a tick.

- [ ] **Step 1: Write the failing `setEntry` tests**, using the file's `P()`, `prev` and `none` helpers.

```ts
describe("carryAbove (spec 18.6: today's own values)", () => {
  it('takes each field from the nearest set above of the same type, ticked or typed')
    // [P(0,'warmup',20,10,{weightUnit:'kg'}), P(1,'working',60,8,{weightUnit:'kg'}), P(2,'working',62.5,null,{weightUnit:'kg'}), P(3,'working',null,null)]
    // carryAbove(c, 3) toEqual { weight: 62.5, weightUnit: 'kg', reps: 8, durationS: null, distance: null }
  it('never carries across types')                 // carryAbove([P(0,'working',60,8), P(1,'warmup',null,null)], 1) toBeNull()
  it('is null for the first set, and never looks below') // carryAbove([P(0,'working',null,null), P(1,'working',60,8)], 0) toBeNull()
});
describe('placeholdersFor with a carry', () => {
  it("carries today's weight, and today's reps only when there is no rule")
    // carried { weight: 60, weightUnit: 'kg', reps: 8, durationS: null, distance: null }, unit 'kg', weighted:
    // ruleRepMax null → { weight: 60, reps: 8, durationS: null, distance: null }; ruleRepMax 12 → reps 12
  it('a previous set wins over the carry')          // previous 180×10 lb, unit 'lb' → { weight: 180, reps: 10, … }
  it('converts a carried weight in the other unit to the nearest 0.5') // 60 kg carried, unit 'lb' → weight 132.5
  it('timed: the rule seconds win, else the carried time') // carried durationS 45: rule null → 45; rule 60 → 60
  it('bodyweight plus never carries a 0 load')       // carried { weight: 0, weightUnit: 'lb', reps: 10 } → { weight: null, reps: 10, … }
});
```

- [ ] **Step 2: Write the failing `setTable` tests**, using `prev`, `set`, `exercise`, `LB_GEAR` and `KG_GEAR`. Pass `rule: null` where the reps must come from the carry.

```ts
describe("buildRows: carrying today's values", () => {
  it('first run: set 1 ticked at 60 × 8 gives sets 2-4 a 60 / 8 ghost and a one-tap tick')
    // rows.slice(1) placeholders each { weight: 60, reps: 8, durationS: null, distance: null }; hintText(rows[1],'weight') '60';
    // readRow(rows[1], {}, 'kg').tickable true; rows.map(r => r.previous) ['', '', '', '']
  it('typed 62.5 on set 3 carries to set 4, not up to set 2') // rows[3].placeholders.weight 62.5, rows[1] 60, rows[3].reps 8
  it("the rule's reps win over today's reps")                // rule { repMax: 12 } → rows[1].placeholders { weight: 60, reps: 12, … }
  it('real history wins row by row; only a set with no match carries')
    // previous [prev(0,'working',135,8), prev(1,'working',140,7)], sets [done 150×5 lb, empty, empty]: rows[1] {140, 7}; rows[2] {150, 5}
  it('a target wins: no carried weight under it')             // plannedWeight 135 lb, set 1 done 140×8: rows[1].placeholders.weight null, reps 8; valueText '135'
  it('a warmup carries from the warmup above, never from a working set')
  it('a carried weight logged in the other unit converts to the entry unit') // 60 kg viewed in lb → 132.5
  it('invents nothing with nothing above')                    // all placeholders null; readRow(rows[1], {}, 'lb').tickable false
});
describe('readRow: missing', () => {
  // row({rule:null}) {} → 'weight'; {weight:'60'} → 'reps'; previous 135×8 → null;
  // bodyweight_plus rule null → 'reps'; distance_time {distance:'5'} → 'durationS'
});
```

- [ ] **Step 3: Write the failing integration and UI tests.**

```ts
// sessionActions.test.ts › describe('tick')
it('ticks set 2 on the weight carried from set 1, with the rule\'s reps (first run)')
  // startFromDay(PUSH_A); tick set 0 at 135 × 6; fresh = bench(); tick(db, fresh, fresh.sets[1], NOTHING) true; reread → { done: true, weight: 135, weightUnit: 'lb', reps: 8 }
it('a typed, unticked weight carries to the next set') // commitSetField(sets[2], { weight: 140, weightUnit: 'lb' }); tick sets[3] with NOTHING → { weight: 140, reps: 8 }
// The existing 'has nothing to accept for a set that did not exist last time' still passes.

// ExerciseBlock.test.tsx › describe('ExerciseBlock: a tick that is not ready says why')
it('stays pressable at full strength, with a hint')   // 'Set 1 done': disabled falsy; hint 'Enter a weight first'; style { opacity: 1, borderStyle: 'dashed' }
it('tapping it focuses the weight field, says "Add a weight to tick", gives a warning haptic, and ticks nothing')
  // focus spy on 'LB, set 1' called once; tick not called; Keyboard.dismiss not called (a not-ready tap keeps the keyboard);
  // shownText has 'Add a weight to tick'; Haptics.notificationAsync('warning'); impactAsync not called
it('the line goes once a weight is typed')
it('Check this number wins over the nudge')           // 'abc' typed → 'Check this number', not 'Add a weight to tick'; tick not called
it("set 2 shows set 1's weight as a ghost and ticks in one tap") // oneDone(): 'LB, set 2' placeholder '135', 'REPS, set 2' '8'; press → tick called
```

- [ ] **Step 4: Run the tests and check they fail.**
  - Command: `npx jest src/domain/setEntry.test.ts src/domain/setTable.test.ts src/state/sessionActions.test.ts src/ui/session/ExerciseBlock.test.tsx`
  - Expected: FAIL.
- [ ] **Step 5: Implement** the pieces above. Update the in-code docs that say the tick is disabled: `setEntry.ts` (`resolveTick`), `setTable.ts` (`buildRows`, `tickable`), `SetRow.tsx` and `sessionActions.ts` (`tick`).
- [ ] **Step 6: Run** `npm test` and `npm run typecheck`. Expected: green.
- [ ] **Step 7: Commit.** `git commit -m "feat(session): carry today's values to the next set; a not-ready tick says why"`

---

### Task 4: Confirm before Finish drops untouched sets

**Files:**
- Create: `src/domain/sessionProgress.ts` and `.test.ts`, `src/domain/finishCheck.ts` and `.test.ts`
- Modify: `src/db/repositories/workoutsRepo.ts` and `.test.ts`, `src/ui/Sheet.tsx`, `src/ui/Sheet.test.tsx`, `app/session.tsx`, `src/ui/session/sessionFinish.test.tsx`
- Modify, mocks: the `workoutsRepo` mock in `sessionFinish`, `sessionDock`, `sessionKeyboard` and `sessionRest` drops `countUntickedWithValues` and gains `getNextDayTitle: jest.fn(() => 'Pull A')`. Their `getActiveWorkoutView` fixtures give each exercise a `name`.

**Interfaces:**
- Consumes: `dayTitle` (Task 2).
- Produces:

```ts
// sessionProgress.ts — one count for the header (Task 5), the block count (Task 5) and Finish
export type Progress = { done: number; total: number };      // every set, warmups included (as FinishSummary.setCount)
export function workoutProgress(exercises: readonly { sets: readonly { done: boolean }[] }[]): Progress;
export function exerciseProgress(ex: { sets: readonly { done: boolean }[] }): Progress;
// finishCheck.ts
export type FinishCheck = Progress & { untouched: string[] };  // names, in order, of exercises with ≥1 set and no done set
export function finishCheck(exercises: readonly { name: string; sets: readonly { done: boolean }[] }[]): FinishCheck;
export function listNames(names: readonly string[]): string;   // 'A' | 'A and B' | 'A, B and C' | 'A, B and {n−2} more'
export type FinishConfirm = { title: string; body: string; safeDefault: boolean };
export function finishConfirm(workoutName: string, check: FinishCheck, nextDayTitle: string | null): FinishConfirm;
// workoutsRepo.ts
export function getNextDayTitle(db: Db, workoutId: string): string | null;
// REMOVED: countUntickedWithValues (and its describe block in workoutsRepo.test.ts)
// Sheet.tsx — ConfirmSheetProps gains:
primary?: 'confirm' | 'cancel'; // default 'confirm'. With 'cancel', the cancel Button renders first as primary and confirm second as 'secondary'.
```

- **`finishConfirm`:**
  - The title is `` `Finish ${workoutName}?` ``.
  - The body is `` `${done} of ${total} sets done.` ``. Then, if any exercise is untouched, `` ` ${listNames(untouched)} ${untouched.length === 1 ? 'has' : 'have'} nothing logged.` ``. Then ` Unticked sets won't count, and Up next moves to ${nextDayTitle}.`, or ` Unticked sets won't count.` when `nextDayTitle` is null.
  - `safeDefault` is `untouched.length > 0`.
- **`getNextDayTitle`:**
  - Pull the rotation in `finishWorkout` (L205-222) into a private `dayAfter(db, routineDayId): { routineId: string; nextIndex: number; routineName: string; dayName: string } | null`. `finishWorkout` uses it and behaves as before.
  - `getNextDayTitle` returns `dayTitle(routineName, dayName)` of the day after.
  - It returns null for an unknown workout, an empty workout, a deleted day, or a routine that is not `getSettings(db).activeRoutineId`. Up next shows only the active routine.
- **`session.tsx`:**
  - `type Ask = 'nothing_ticked' | 'confirm_finish' | 'discard' | 'finish_failed'`.
  - `untickedCount` becomes `finishAsk: FinishConfirm | null`. It is kept after the sheet closes, so the text doesn't change while the sheet fades.
  - `onFinish` runs in this order:
    1. `flushAll()`, then `const view = getActiveWorkoutView(db)`.
    2. Nothing done: `'nothing_ticked'`.
    3. Otherwise `check = finishCheck(view.exercises)`. If `check.done === check.total`, it calls `finishNow()` with no sheet.
    4. Otherwise `setFinishAsk(finishConfirm(view.name, check, getNextDayTitle(db, view.id)))` and `setAsk('confirm_finish')`.
  - The sheet is `<ConfirmSheet title body confirmLabel="Finish anyway" cancelLabel="Keep logging" primary={safeDefault ? 'cancel' : 'confirm'} onConfirm={finishNow} onCancel={() => setAsk(null)} />`.
  - `anySetTicked` folds into the one read.

- [ ] **Step 1: Write the failing domain tests.**

```ts
// sessionProgress.test.ts
expect(workoutProgress([{ sets: [{ done: true }, { done: true }, { done: false }] }, { sets: [{ done: false }] }])).toEqual({ done: 2, total: 4 });
expect(workoutProgress([])).toEqual({ done: 0, total: 0 });
expect(exerciseProgress({ sets: [{ done: true }, { done: false }] })).toEqual({ done: 1, total: 2 });
// finishCheck.test.ts
// Upper A: bench 4 done; Barbell row 4, Overhead press 3, Lat pulldown 3, Dumbbell curl 2, Triceps pushdown 2 all open
//   → { done: 4, total: 18, untouched: ['Barbell row', 'Overhead press', 'Lat pulldown', 'Dumbbell curl', 'Triceps pushdown'] }
// [{ name: 'A', sets: [done, open, open] }] → { done: 1, total: 3, untouched: [] }; an exercise with no sets is never untouched
expect(listNames(['Barbell row'])).toBe('Barbell row'); expect(listNames(['A', 'B'])).toBe('A and B');
expect(listNames(['A', 'B', 'C'])).toBe('A, B and C'); expect(listNames(['A', 'B', 'C', 'D'])).toBe('A, B and 2 more');
expect(listNames(['A', 'B', 'C', 'D', 'E'])).toBe('A, B and 3 more');
expect(finishConfirm('Upper A', upperA, 'Lower A')).toEqual({ title: 'Finish Upper A?',
  body: "4 of 18 sets done. Barbell row, Overhead press and 3 more have nothing logged. Unticked sets won't count, and Up next moves to Lower A.", safeDefault: true });
// one untouched → contains 'Barbell row has nothing logged.'
// { done: 16, total: 18, untouched: [] }, 'Lower A' → body "16 of 18 sets done. Unticked sets won't count, and Up next moves to Lower A.", safeDefault false
// nextDayTitle null → body ends "Unticked sets won't count." and has no 'Up next'
```

- [ ] **Step 2: Write the failing repo tests** in `workoutsRepo.test.ts`, `describe('getNextDayTitle')`.
  - With `setActiveRoutine(db, PPL)`: `PUSH_A` gives 'Pull A', and `'premade-ppl-6:legs-b'` gives 'Push A' (it wraps).
  - With the 5×5 routine (`'premade-5x5-3'`) active: `FIVE_B` gives '5×5 A'.
  - A PPL workout while 5×5 is active gives null. `startEmptyWorkout` gives null. `'no-such-workout'` gives null.
  - "names the day finish moves Up next to": with PPL active, preview → tick the first set → `finishWorkout`. Then `getUpNext(db)!.dayName` is the preview and `nextDayIndex(db, PPL)` is 1.
  - The existing rotation tests stay green unchanged.
- [ ] **Step 3: Write the failing UI tests.**

```ts
// Sheet.test.tsx › ConfirmSheet
// default → Buttons [confirmLabel, cancelLabel], variants [primary, 'secondary']; primary='cancel' → [cancelLabel, confirmLabel], [primary, 'secondary']; backdrop still calls onCancel
// sessionFinish.test.tsx
it('finishes with no question when every set is ticked')                 // router.replace('/finish/w1'); no 'Finish Push A?'
it('asks with Keep logging filled when a whole exercise is untouched')
  // view [{ name: 'Barbell bench press', sets: [done, open] }, { name: 'Overhead press', sets: [open] }], getNextDayTitle 'Pull A':
  // 'Finish Push A?' and "1 of 3 sets done. Overhead press has nothing logged. Unticked sets won't count, and Up next moves to Pull A.";
  // Buttons 'Keep logging' (primary) then 'Finish anyway' (secondary); finish not called
it('Keep logging closes and finishes nothing')
it('Finish anyway finishes and goes to the summary')                      // finish('db','w1'); replace('/finish/w1')
it('asks with Finish anyway filled when every exercise has a tick')
it("never says 'sets aren't ticked'")
it('saves typed text before it counts')                                   // flushAll invocationCallOrder < getActiveWorkoutView's
```

- [ ] **Step 4: Run the tests and check they fail.**
  - Command: `npx jest src/domain src/db/repositories/workoutsRepo.test.ts src/ui/Sheet.test.tsx src/ui/session/sessionFinish.test.tsx`
  - Expected: FAIL.
- [ ] **Step 5: Implement** the pieces above, and update the four session test mocks.
- [ ] **Step 6: Run** `npm test` and `npm run typecheck`. Expected: green.
- [ ] **Step 7: Commit.** `git commit -m "feat(finish): confirm before dropping untouched sets, with Keep logging as the safe default"`

---

### Task 5: Progress and Finish in the session header

**Files:**
- Modify: `src/domain/sessionProgress.ts` and `.test.ts`, `app/session.tsx`, `src/ui/session/ExerciseBlock.tsx`, `src/ui/session/SetRow.tsx`, `src/ui/session/ExerciseBlock.test.tsx`, `src/ui/session/sessionKeyboard.test.tsx`
- Modify: the `sessionDock.test.tsx` comment that calls the bottom Finish "what keeps Finish clear of the bars"
- Create: `src/ui/session/sessionHeader.test.tsx`, starting from the `sessionDock.test.tsx` mock block and its `mockState`

**Interfaces:**
- Consumes: `Progress`, `workoutProgress` and `exerciseProgress` (Task 4), and `Button size="compact"` with `maxFontSizeMultiplier` (Task 1).
- Produces:

```ts
// sessionProgress.ts
export type ProgressExercise = { id: string; name: string; position: number; supersetGroup: number | null;
  sets: readonly { id: string; position: number; setType: SetType; done: boolean }[] };   // WorkoutExerciseView fits
/** The next set to do (spec 18.6), or null when every set is ticked. */
export function nextSetId(exercises: readonly ProgressExercise[]): string | null;
export function progressText(p: Progress, elapsed: string): string;   // `${done}/${total} ${total === 1 ? 'set' : 'sets'} · ${elapsed}`; elapsed alone when total is 0
export function countLabel(p: Progress): string;                      // `${done} of ${total} ${total === 1 ? 'set' : 'sets'} done`
export function progressLabel(p: Progress, elapsed: string): string;  // `${countLabel(p)}. Workout time ${elapsed}`; `Workout time ${elapsed}` when total is 0
// session.tsx
function SessionHeader(p: { name: string; startedAt: number; musicApp: MusicAppId | null; progress: Progress; onFinish: () => void }): JSX.Element;
// ExerciseBlock props gain: nextSetId: string | null
// SetRow props gain: isNext: boolean
```

- **`nextSetId`:** order the exercises and sets by position.
  - A run is one exercise alone, or consecutive exercises with the same non-null `supersetGroup`.
  - Take the first run that has an unticked set.
    - A lone exercise gives its first unticked set.
    - A superset gives the member with the fewest ticked sets among those with an unticked set (the earlier position wins a tie), then that member's first unticked set.
- **Header row:**
  - ‹ Back first.
  - Then a column with flex 1 and minWidth 0:
    - the name: Display 700, fontSize 22, `numberOfLines={1}`, `maxFontSizeMultiplier={1.3}`;
    - the line under it: Body muted, fontSize 13, `numberOfLines={1}`, `maxFontSizeMultiplier={1.3}`, text `progressText`, `accessibilityLabel={progressLabel(…)}`.
  - Then Music (phones only).
  - Then `<Button label="Finish" variant="secondary" size="compact" maxFontSizeMultiplier={1.3} onPress={() => { Keyboard.dismiss(); onFinish(); }} />`.
- **The old clock** `Num` and its paddingRight go.
- **The progress line** is a View on the full-width outer header:
  - `{ position: 'absolute', left: 0, bottom: 0, height: 2, width: \`${total === 0 ? 0 : (done / total) * 100}%\`, backgroundColor: colors.text }`;
  - with `accessibilityElementsHidden` and `importantForAccessibility="no-hide-descendants"`.
- **`Session`:**
  - It computes `progress = workoutProgress(workout.exercises)` and `next = nextSetId(workout.exercises)` once per data change (`useMemo` on `workout`), not in the header every second.
  - It passes `onFinish` (Task 4's) to the header and `nextSetId={next}` to each block.
  - The bottom Finish is removed. "Add exercise" then "Discard workout" (quiet) stay, with marginTop 24.
- **Block header row:** [name][count][⋯]. Task 7 inserts + Note before ⋯.
  - The count is `<Num weight={600} accessibilityLabel={countLabel(p)} style={{ fontSize: 16, color: colors.textMuted }}>{`${p.done}/${p.total}`}</Num>` with `flexShrink: 0`.
  - It is hidden when `total === 0`. It gets no text-size cap; the name wraps instead.
  - Each `SetRow` gets `isNext={row.set.id === nextSetId}`.
- **Tick ring precedence:**
  - Done: unchanged.
  - Not done: `borderWidth: isNext ? 2.5 : 1.5`, `borderColor: isNext ? colors.text : colors.textMuted`.
  - `borderStyle` stays Task 3's: dashed while not ready, so the next set keeps the bold ring even when it is not ready.

- [ ] **Step 1: Write the failing domain tests** in `sessionProgress.test.ts`.

```ts
expect(progressText({ done: 5, total: 18 }, '24:10')).toBe('5/18 sets · 24:10');
expect(progressText({ done: 0, total: 1 }, '0:05')).toBe('0/1 set · 0:05');
expect(progressText({ done: 0, total: 0 }, '0:01')).toBe('0:01');
expect(progressLabel({ done: 2, total: 4 }, '0:01')).toBe('2 of 4 sets done. Workout time 0:01');
expect(progressLabel({ done: 0, total: 0 }, '0:01')).toBe('Workout time 0:01');
// nextSetId: A{a1 done, a2, a3} → 'a2'; A all done + B{b1, b2} → 'b1'; all ticked → null; [] → null; a1 open, a2 done → 'a1'
// superset: A(group 1, pos 0){a1 done, a2}, B(group 1, pos 1){b1, b2} → 'b1'; with b1 done too → 'a2'
```

- [ ] **Step 2: Write the failing header tests** in `sessionHeader.test.tsx`.
  - The fixture is two exercises, each with one done set and one open set (we1: s1 done, s2; we2: s3 done, s4).
  - `startedAt` is 1_000 and `useNow` is 2_000.

```ts
it('shows the progress under the name')        // '2/4 sets · 0:01'; numberOfLines 1; maxFontSizeMultiplier 1.3; label '2 of 4 sets done. Workout time 0:01'
it('the progress line is the share ticked')    // View with style.height 2: width '50%', backgroundColor '#f1ece2'; exercises [] → '0%', text '0:01' only
it('Finish is in the header and not at the bottom') // exactly one 'Finish' (variant 'secondary', size 'compact');
                                                    // ScrollView Buttons ['Add exercise', 'Discard workout']
it('header Finish runs the same checks')       // nothing ticked → 'Nothing is ticked yet.'; all ticked → replace('/finish/w1')
it('Finish in the header saves first')         // flushAll before getActiveWorkoutView (invocationCallOrder)
it('passes each block the next set')           // a recording ExerciseBlock mock: every block gets nextSetId 's2'
// sessionKeyboard.test.tsx
it('closes it when Finish in the header is pressed') // Keyboard.dismiss called once, before onFinish's sheet
```

- [ ] **Step 3: Write the failing block and row tests** in `ExerciseBlock.test.tsx`. `mount` passes `nextSetId`, default null.

```ts
it('shows how many sets are ticked before ⋯')    // 1 of 4 done → '1/4', label '1 of 4 sets done'; bench([]) → no '0/0'
it("the next set's tick has the bolder ring")    // nextSetId 'b': isNext [false, true, false, false]; 'Set 2 done' { borderWidth: 2.5, borderColor: '#f1ece2' };
                                                  // 'Set 3 done' { 1.5, '#a39d90' }; a done row with isNext keeps 1.5
it('the next set keeps the bold ring while not ready') // nextSetId on an empty row: borderWidth 2.5, borderStyle 'dashed'
```

- [ ] **Step 4: Run the tests and check they fail.**
  - Command: `npx jest src/domain/sessionProgress.test.ts src/ui/session`
  - Expected: FAIL.
- [ ] **Step 5: Implement** the pieces above.
- [ ] **Step 6: Run** `npm test` and `npm run typecheck`. Expected: green. The four existing `sessionFinish` tests pass unchanged: `press(tree, 'Finish')` now finds the header pill.
- [ ] **Step 7: Commit.** `git commit -m "feat(session): progress and Finish in the header; set counts and the next set's ring"`

---

### Task 6: Suggested values look like suggestions

**Files:**
- Modify: `src/domain/setTable.ts` and `.test.ts`, `src/ui/session/SetRow.tsx`, `src/ui/session/ExerciseBlock.test.tsx`

**Interfaces:**
- Consumes: `textFaint` and `borderStrong` (Task 1).
- Produces:

```ts
// setTable.ts
export function isTargetValue(row: RowModel, key: InputKey): boolean; // key 'weight' && set.weight === null && !set.done && row.target !== null
export type FieldLook = 'entered' | 'suggested' | 'empty';
/** With a draft: non-blank (after trim) is 'entered', invalid text included; blank is 'suggested' when hintText(row, key) !== '', else 'empty'.
 *  Without one: a stored value is 'entered'; isTargetValue or a non-empty hintText is 'suggested'; else 'empty'. */
export function fieldLook(row: RowModel, key: InputKey, draft: string | undefined): FieldLook;
// SetRow.tsx
export const SUGGESTED_HINT = 'Suggested. Tick the set to log it.';
export function inputLook(look: FieldLook, invalid: boolean, colors: Colors): TextStyle;
```

- **`inputLook`:**
  - `'suggested'` gives `{ backgroundColor: 'transparent', borderStyle: 'dashed', borderWidth: 1, borderColor: colors.borderStrong, color: colors.textFaint, fontFamily: fonts.display600 }`.
  - `'entered'` and `'empty'` give `{ backgroundColor: colors.surface, borderStyle: 'solid', borderWidth: 1, borderColor: colors.borderStrong, color: colors.text, fontFamily: fonts.display800 }`.
  - `invalid` adds today's underline, which only ever happens on an entered field. iOS cannot draw a dashed edge with a thicker bottom.
- **TextInput props:**
  - `placeholderTextColor={colors.textFaint}`.
  - `accessibilityHint={look === 'suggested' ? SUGGESTED_HINT : undefined}`.
  - Unchanged: `value`, `placeholder`, `accessibilityLabel`, `returnKeyType="done"`, `selectTextOnFocus` and `keyboardType`.
- **Ruling R49:**
  - `hintText(row, 'weight')` returns the target's number text when `row.target !== null && !row.set.done`. A cleared weight field on a row with a target then shows the target, which is what `resolveTick` logs.
  - An existing test that expects last time's weight under a target is updated to the target. Say so in the commit.
- **Unchanged:** `valueText`'s output (it reads `isTargetValue`), `readRow`, `resolveTick`, `tick`, and `leave` and its commit.

- [ ] **Step 1: Write the failing `setTable` tests**, `describe('isTargetValue and fieldLook')`.

```ts
it('a target is a suggestion until it is typed over or ticked') // plannedWeight 135 lb: isTargetValue(row,'weight') true; fieldLook(row,'weight',undefined) 'suggested';
                                                                 // ('140') 'entered'; fieldLook(row,'reps',undefined) 'suggested'; isTargetValue(row,'reps') false
it('a stored or ticked value is entered')
it('a done row never shows the target as a suggestion (R29)')   // done, reps 8, plan 135, no previous: isTargetValue false; weight 'empty'
it('placeholders from last time are suggestions')               // previous 135×8: weight and reps 'suggested'; rpe 'empty'
it('a blank draft falls back to the suggestion or empty')        // '' and '   ' → 'suggested'; no rule, no previous → 'empty'; 'abc' → 'entered'
it('no target for a warmup')
it('a cleared target field shows the target as its ghost')       // plan 135, previous 130: hintText(row,'weight') '135'; readRow(row,{weight:''},'lb') resolves 135
```

- [ ] **Step 2: Write the failing UI tests** in `ExerciseBlock.test.tsx`. Read styles with `StyleSheet.flatten`.

```ts
it("draws today's target as a suggestion until it is typed over")
  // plannedWeight 135 lb, rule { repMax: 8 }: 'LB, set 1' { borderStyle: 'dashed', borderColor: '#736c60', backgroundColor: 'transparent', color: '#6d675c',
  // fontFamily: 'BarlowCondensed_600SemiBold' }, value '135', hint SUGGESTED_HINT; after onChangeText('140'):
  // { borderStyle: 'solid', backgroundColor: '#1a1814', color: '#f1ece2', fontFamily: 'BarlowCondensed_800ExtraBold' }, hint undefined
it('a ghost from last time is drawn as a suggestion')  // value '', placeholder '135', placeholderTextColor '#6d675c', dashed
it("a ticked set's values are solid")                  // oneDone(): solid, '#1a1814', '#f1ece2', 800, no hint
it('clearing a typed value brings the suggestion back')
// The R43 'gives every number field the Done key' test still passes unchanged.
```

- [ ] **Step 3: Run the tests and check they fail.**
  - Command: `npx jest src/domain/setTable.test.ts src/ui/session/ExerciseBlock.test.tsx`
  - Expected: FAIL.
- [ ] **Step 4: Implement** the pieces above.
- [ ] **Step 5: Run** `npm test` and `npm run typecheck`. Expected: green.
- [ ] **Step 6: Commit.** `git commit -m "feat(session): suggested values look like suggestions; typed values look entered"`

---

### Task 7: Slimmer exercise blocks

**Files:**
- Modify: `src/ui/session/ExerciseBlock.tsx`, `src/ui/session/ExerciseBlock.test.tsx`

**Interfaces:**
- Consumes: `Button size="compact" accessibilityLabel` (Task 1), and the block header row from Task 5.
- Produces: no prop changes. Inside the block:
  - `const editingNote = noteDraft !== null`.
  - `const openNote = () => setNoteDraft(ex.note ?? '')`.
  - `saveNoteOnBlur` and `useDraftFlush(saveNoteOnBlur)` keep their code and signatures (R29).
- **Header row:** [name][count][+ Note][⋯]. **+ Note** shows only when `!ex.note && !editingNote`.
  - It is a Pressable with `accessibilityRole="button"` and `accessibilityLabel={\`Add a note for ${ex.name}\`}`.
  - It has minHeight 44, paddingHorizontal 8, a row with gap 4, and `flexShrink: 0`.
  - It holds Ionicons `pencil` at size 14 in `textMuted`, and `<Body muted numberOfLines={1} style={{ fontSize: 14 }}>+ Note</Body>`.
  - It never calls `Keyboard.dismiss`.
- **Under the header**, one of three things:
  - While editing, today's note `TextInput` with `value={noteDraft}` and `autoFocus`. It keeps today's handlers, placeholder "Add a note for next time", `multiline`, `submitBehavior="blurAndSubmit"` and label `` `Note for ${ex.name}` ``.
  - With a saved note, a Pressable with `accessibilityRole="button"`, `accessibilityLabel={\`Note for ${ex.name}: ${ex.note}\`}` and `accessibilityHint="Edits the note"`. It has minHeight 44 and wraps `<Body muted style={{ fontSize: 14 }}>` with no `numberOfLines`.
  - Otherwise nothing.
- **Add buttons:** one View with `flexDirection: 'row'`, `justifyContent: 'flex-start'`, `flexWrap: 'wrap'`, gap 8 and marginTop 4. There is no negative margin, so the 44pt targets stay inside the block. It holds:
  - `<Button label="+ Set" variant="quiet" size="compact" accessibilityLabel={\`Add a set to ${ex.name}\`} onPress={() => addSetTo(db, ex.id)} />`;
  - then `<Button label="+ Warmup" variant="quiet" size="compact" accessibilityLabel={\`Add a warmup to ${ex.name}\`} onPress={() => addWarmupTo(db, ex.id)} />`.
- **Docstring:** update the component docstring to describe + Note, the note line, + Set and + Warmup.

- [ ] **Step 1: Write the failing tests.**
  - `beforeEach` also clears `saveNote`, `addSetTo` and `addWarmupTo`.
  - A test that calls `flushAll()` unmounts its tree in `finally`.

```ts
describe('ExerciseBlock: the note (UX item 6, R29)', () => {
  it('an empty note shows "+ Note" in the header and no field')            // label 'Add a note for Bench Press'; no TextInput 'Note for Bench Press'
  it('+ Note opens the field empty and focused')                          // value '', autoFocus true; '+ Note' gone
  it('typing then leaving the field saves the trimmed note once')         // '  Pause on the chest ' → saveNote('db','barbell-bench-press','Pause on the chest'); field gone
  it('leaving an empty field saves nothing and shows + Note again')
  it('a saved note shows in full under the name, muted, with no + Note')  // 'Pause on the chest, 2s'; numberOfLines undefined; color '#a39d90'
  it('tapping the saved note opens it for editing; clearing it saves blank') // saveNote(…, '')
  it('an edited note left unchanged saves nothing')
  it('a note typed but not left is saved by flushAll (R29)')               // 'Slow eccentric'; field closes; a second flushAll adds no call
  it('the field blurs and submits on Return')                             // multiline true, submitBehavior 'blurAndSubmit'
});
describe('ExerciseBlock: + Set and + Warmup (UX item 6)', () => {
  it('shows + Set then + Warmup as compact quiet buttons, left-aligned in one row') // ['+ Set', '+ Warmup'], variant 'quiet', size 'compact';
                                                                                    // shared parent { flexDirection: 'row', justifyContent: 'flex-start' }; no '+ Add set'/'+ Add warmup'
  it('+ Set adds a working set and + Warmup adds a warmup')               // addSetTo('db','we1'); addWarmupTo('db','we1')
  it('the add buttons are named for the exercise')                        // 'Add a set to Bench Press', 'Add a warmup to Bench Press'
  it('the header keeps ⋯ at 44pt beside the count and + Note')            // ⋯ style width 44, height 44; + Note flexShrink 0; name minWidth 0
});
```

- [ ] **Step 2: Run the tests and check they fail.**
  - Command: `npx jest src/ui/session/ExerciseBlock.test.tsx`
  - Expected: FAIL.
- [ ] **Step 3: Implement** the pieces above.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck`. Expected: green. `RestInline.test`, `sessionRest.test`, `sessionKeyboard.test` and `useDraftFlush.test` pass unchanged.
- [ ] **Step 5: Commit.** `git commit -m "feat(session): slimmer blocks with + Note, + Set and + Warmup"`

---

### Task 8: The rest row as a live timer, with +15s

**Files:**
- Modify: `src/domain/rest.ts` and `.test.ts`, `src/domain/setEntry.ts` and `.test.ts`, `src/domain/sessionProgress.ts` and `.test.ts`
- Create: `src/platform/announce.ts`, `src/ui/session/useRestUp.ts` and `useRestUp.test.tsx`, `src/ui/session/RestBar.test.tsx`
- Modify: `src/state/sessionActions.ts` and `.test.ts`
- Modify: `src/ui/session/RestInline.tsx` and `.test.tsx`, `RestBar.tsx`, `RestWatcher.tsx` and `.test.tsx`, `ExerciseMenu.tsx` and `.test.tsx`, `ExerciseBlock.tsx` and `.test.tsx`, `app/session.tsx`
- Modify, mocks: `restSeconds: 120` in the `useDbQuery` mock of `sessionRest`, `sessionDock`, `sessionKeyboard`, `sessionFinish` and `sessionHeader`, and `restPlus15` in every `sessionActions` mock.

**Interfaces:**
- Consumes: `nextSetId` and `ProgressExercise` (Task 5), `Button size="compact"` (Task 1), `borderStrong` (Task 1), and `setLabels` (`setEntry.ts`).
- Produces:

```ts
// rest.ts
export const PLUS_15_MS = 15_000;
export function plus15(endsAt: number): number;                                   // endsAt + 15_000
export type RestChange = /* existing */ | { kind: 'extend'; endsAt: number };
export function restAfterPlus15(endsAt: number, now: number): RestChange;        // { kind: 'extend', endsAt + 15_000 } while endsAt > now, else { kind: 'none' }
export const REST_UP_MS = 10_000;
export function restRowPhase(endsAt: number, now: number): { kind: 'running'; remaining: number } | { kind: 'up' } | { kind: 'gone' };
export function restTrackFraction(remainingSeconds: number, lengthSeconds: number): number; // clamped 0..1; 1 when length <= 0 or not finite
export function spokenRest(seconds: number): string;                              // '2 minutes', '1 minute 30 seconds', '45 seconds', '1 second'
export function tickAnnouncement(setLabel: string, restSeconds: number | null): string; // `${setName(label)} logged. Rest ${spokenRest(s)}.` | `${setName(label)} logged.`
// setEntry.ts
export function setName(label: string): string;   // '2' → 'Set 2', 'W' → 'Warmup', 'D' → 'Drop set', 'F' → 'Failure set'
// sessionProgress.ts
/** "Rest's up · {setName} next" when the next set (nextSetId) is in the exercise holding afterSetId; "Rest's up · {exercise name} next" when it is in another; "Rest's up" when none is left. */
export function restUpText(exercises: readonly ProgressExercise[], afterSetId: string): string;
// platform/announce.ts
export function announce(text: string): void;      // AccessibilityInfo.announceForAccessibility in try/catch; no-op when Platform.OS === 'web'
// sessionActions.ts
export function restPlus15(db: Db, workoutId: string, endsAt: number): void;   // applyRest(…, restAfterPlus15(endsAt, Date.now()), getSettings(db).restBell); bumpData()
// useRestUp.ts
export function useRestUp(restEndsAt: number | null, restSetId: string | null, doneCount: number): { setId: string; endsAt: number } | null;
// RestInline props
{ workoutId: string; endsAt: number; lengthSeconds: number; upText: string; onOpenRest: () => void }
// ExerciseBlock props gain
restUp: { setId: string; endsAt: number } | null; upText: string; settingsRestSeconds: number; onOpenRest: () => void;
// ExerciseMenu props gain
initialPanel?: 'menu' | 'rest';
// session.tsx
menuFor: { id: string; panel: 'menu' | 'rest' } | null;   // readSession adds restSeconds: settings.restSeconds
```

- **`applyRest`** handles `'extend'` like `'shorten'`: `setRestEndsAt` (which keeps `rest_set_id`), then `surface.update(endsAt, withSound)`.
- **`tick`:** after a successful tick, it calls `announce(tickAnnouncement(row.label, change.kind === 'start' ? length : null))`. Its boolean return is unchanged.
- **`RestWatcher`:** at phase `'ring'`, it calls `announce('Rest over')` beside `endHaptic()`.
- **`useRestUp`:**
  - It remembers the last running `{ endsAt, setId }`.
  - When `restEndsAt` turns null and `Date.now() >= endsAt`, it holds that rest. When it turns null earlier (Skip, a −15s that skips, discard), it holds nothing.
  - A change in `doneCount`, or a new running rest, drops the hold.
  - `RestInline` hides itself after `REST_UP_MS`.
- **`RestInline`:**
  - It ticks every 250ms and uses `restRowPhase`.
  - **Running:**
    - A time box: a Pressable with `accessibilityRole="button"`, `accessibilityLabel={\`Rest ${formatRest(remaining)}\`}`, `accessibilityHint="Changes the rest time"` and `onPress={onOpenRest}`.
    - Inside it, the label "REST" (Body 600, fontSize 11, muted, letterSpacing 0.5) over `<Num weight={800} style={{ fontSize: 32 }}>`.
    - Then compact secondary pills:
      - "−15s" (label "Take 15 seconds off the rest");
      - "+15s" ("Add 15 seconds to the rest");
      - "Skip" ("Skip the rest").
    - A 3pt track: absolute, left 0, bottom 0, width `restTrackFraction(…) * 100`%, `colors.text`, hidden from accessibility.
  - **Up:** Ionicons `checkmark-circle` at size 20 in `colors.text`, and Body 600 `upText`, with no buttons.
  - **Gone:** `null`.
  - **Row:**
    - It keeps the G1 wrap rules: `flexDirection: 'row'`, `flexWrap: 'wrap'`, `justifyContent: 'flex-end'`, columnGap 8, rowGap 4, and a time box with flexGrow 1, flexBasis 'auto' and minWidth 0.
    - It has `backgroundColor: colors.surface`, borderWidth 1, `borderColor: colors.borderStrong` and `overflow: 'hidden'`.
- **`RestBar`** (the R41 fallback) gets "−15s", the clock, "+15s" and "Skip", as compact secondary pills with `flexWrap: 'wrap'`. It has no tap-to-change, because its set is gone.
- **`ExerciseBlock`** renders `RestInline` under a row in two cases:
  - When `restEndsAt !== null && row.set.id === restSetId`, with `endsAt` set to `restEndsAt`.
  - Otherwise, when `restUp?.setId === row.set.id`, with `endsAt` set to `restUp.endsAt`.
  - In both cases `lengthSeconds={restLengthFor(ex.restSeconds, settingsRestSeconds)}`, plus `upText` and `onOpenRest`.
- **`session.tsx`:**
  - `restUp = useRestUp(restEndsAt, restSetId, progress.done)`, with Task 5's `progress`.
  - `upText = restUpText(workout.exercises, restSetId ?? restUp?.setId ?? '')`, passed to every block as `upText`.
  - A block's `onOpenRest` runs `flushAll(); Keyboard.dismiss(); setMenuFor({ id: ex.id, panel: 'rest' })`.
  - `onOpenMenu` sets `panel: 'menu'`.
  - `ExerciseMenu` receives `exerciseId={menuFor?.id ?? null}` and `initialPanel={menuFor?.panel}`.
- **`ExerciseMenu`** sets its panel from `initialPanel` during the render in which `exerciseId` turns non-null, so the first visible frame is right. `close()` still resets the panel to `'menu'`.
- **Ruling R50:** a rest length chosen from the countdown sets future rests only. The running rest keeps its end, as `setExerciseRest` already does.

- [ ] **Step 1: Write the failing domain tests.**

```ts
// rest.test.ts (now = 1_000_000)
expect(restAfterPlus15(now + 60_000, now)).toEqual({ kind: 'extend', endsAt: now + 75_000 });
expect(restAfterPlus15(now + 1_000, now)).toEqual({ kind: 'extend', endsAt: now + 16_000 });
expect(restAfterPlus15(now, now)).toEqual({ kind: 'none' }); expect(restAfterPlus15(now - 1, now)).toEqual({ kind: 'none' });
expect(restRowPhase(now + 105_000, now)).toEqual({ kind: 'running', remaining: 105 }); expect(restRowPhase(now + 500, now)).toEqual({ kind: 'running', remaining: 1 });
expect(restRowPhase(now, now)).toEqual({ kind: 'up' }); expect(restRowPhase(now, now + 9_999)).toEqual({ kind: 'up' });
expect(restRowPhase(now, now + REST_UP_MS)).toEqual({ kind: 'gone' }); expect(REST_UP_MS).toBe(10_000);
expect(restTrackFraction(60, 120)).toBe(0.5); expect(restTrackFraction(135, 120)).toBe(1); expect(restTrackFraction(0, 120)).toBe(0);
expect(restTrackFraction(30, 0)).toBe(1); expect(restTrackFraction(30, NaN)).toBe(1);
expect(spokenRest(120)).toBe('2 minutes'); expect(spokenRest(60)).toBe('1 minute'); expect(spokenRest(90)).toBe('1 minute 30 seconds');
expect(spokenRest(150)).toBe('2 minutes 30 seconds'); expect(spokenRest(45)).toBe('45 seconds'); expect(spokenRest(1)).toBe('1 second');
expect(tickAnnouncement('2', 120)).toBe('Set 2 logged. Rest 2 minutes.'); expect(tickAnnouncement('2', null)).toBe('Set 2 logged.');
expect(tickAnnouncement('W', 90)).toBe('Warmup logged. Rest 1 minute 30 seconds.');
// setEntry.test.ts: setName('2') 'Set 2'; 'W' 'Warmup'; 'D' 'Drop set'; 'F' 'Failure set'
// sessionProgress.test.ts › restUpText: bench [s0 done, s1, s2] → afterSetId 's0' → "Rest's up · Set 2 next";
//   bench all done + row [r0] → "Rest's up · Barbell row next"; next set a warmup in the same exercise → "Rest's up · Warmup next"; all done → "Rest's up"
```

- [ ] **Step 2: Write the failing state tests** in `sessionActions.test.ts`. Base them on `describe('restMinus15')`, and mock `../platform/announce`.

```ts
describe('restPlus15', () => {
  it('moves the end 15 seconds later and reschedules')   // restEndsAt NOW + 135_000; mockSurface.update(NOW + 135_000, true); cancel not called; version +1
  it('passes the bell setting on')                        // restBell false → update(NOW + 135_000, false)
  it('does nothing once the rest is over')                // system time NOW + 120_000 → restEndsAt unchanged; update not called
});
it('the rest stays under its set through +15s')           // restSetId() still setId(0, 0)
it('a tick announces the set and the rest')               // 'Set 1 logged. Rest 2 minutes.'; rest Off → 'Set 1 logged.';
                                                          // restSeconds 90 → 'Set 1 logged. Rest 1 minute 30 seconds.'; a refused tick → not called
```

- [ ] **Step 3: Write the failing UI tests.**

```ts
// RestInline.test.tsx (endsAt = Date.now() + 105_000, lengthSeconds 120)
it('shows a big countdown under a REST label')          // '1:45' in Num, fontSize 32, fontFamily 'BarlowCondensed_800ExtraBold'; 'REST'
it('has −15s, +15s and Skip as compact outlined pills') // labels ['−15s', '+15s', 'Skip'], size 'compact', variant 'secondary';
                                                        // presses → restMinus15/restPlus15('db','w1',endsAt), restSkip('db','w1')
it('drains a text-colour track')                        // width '87.5%', backgroundColor '#f1ece2'
it('never looks like a done set')                       // row backgroundColor '#1a1814' (not '#232019'), borderColor '#736c60'
it('tapping the time opens the rest choices')           // onOpenRest called once
it("holds Rest's up for 10 seconds at zero")            // endsAt now + 1_000, upText "Rest's up · Set 2 next": +1_000 → that text, no Buttons; +9_000 → toJSON() null
it('keeps the large-text wrap (G1)')                    // row { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', columnGap: 8 };
                                                        // time box { flexGrow: 1, flexBasis: 'auto', minWidth: 0 }, flex undefined
// RestBar.test.tsx: labels ['−15s', '+15s', 'Skip']; +15s → restPlus15('db','w1',endsAt); row flexWrap 'wrap'
// useRestUp.test.tsx (a probe component, fake timers)
it('holds a rest that ran out')                         // E → null at Date.now() >= E → { setId, endsAt: E }
it('holds nothing after Skip, even once the old end passes') // E → null at Date.now() < E → null; advance past E → still null
it('a tick drops the hold')                             // doneCount changes → null
it('a new rest replaces the hold')                      // restEndsAt non-null again → null
// RestWatcher.test.tsx
it('announces Rest over once when a watched rest runs out') // restEndsAt NOW + 2_000, +2_500 → announce('Rest over') once;
                                                            // not on a rest that already ran out, and not after being away (R31 cases)
// ExerciseMenu.test.tsx
it('opens straight on the rest choices')                // initialPanel 'rest' → first render shows 'Rest time', 'Bench Press', 'Default (2:00)', '1:30'; no 'Reorder';
                                                        // close and reopen without it → menu
// ExerciseBlock.test.tsx — L309's toEqual becomes toMatchObject:
// { workoutId: 'w1', endsAt, lengthSeconds: 120, upText: expect.any(String), onOpenRest: expect.any(Function) };
// restEndsAt null with restUp { setId: 's1', endsAt } → one RestInline under s1; restUp for another exercise's set → none
// sessionRest.test.tsx
it('tapping the countdown saves and closes the keyboard first') // onOpenRest → flushAll and Keyboard.dismiss before ExerciseMenu gets initialPanel 'rest'
```

- [ ] **Step 4: Run the tests and check they fail.**
  - Command: `npx jest src/domain src/state/sessionActions.test.ts src/ui/session`
  - Expected: FAIL.
- [ ] **Step 5: Implement** the pieces above. Update the mocks listed under Files.
- [ ] **Step 6: Run** `npm test` and `npm run typecheck`. Expected: green.
- [ ] **Step 7: Commit.** `git commit -m "feat(rest): a live rest row with +15s, Rest's up, tap-to-change and announcements"`

---

### Task 9: Acceptance

**Files:**
- Modify: the ledger, `.superpowers/sdd/<this plan's workspace>/progress.md`. No app code changes unless a check fails, in which case the fix goes in its own commit with a test.

- [ ] **Step 1: Run** `npm test` and `npm run typecheck`. Expected: green, with 0 errors.
- [ ] **Step 2: Build the iPhone bundle.** `npx expo export --platform ios --output-dir <scratch dir>` must compile offline. Delete the output.
- [ ] **Step 3: Walk through in the browser pane.**
  - Use the owner's dev server on 8081, in a fresh tab. Screenshot each state at 390 and 320 wide, in light and dark.
  - **Train:** the Up next state on a first run ("Pick weights as you go.", no "pick a weight") and after a run; the no-routine state; the in-progress state; "Start 5×5 A" on the 5×5 routine.
  - **Session, first run of Push A:**
    - Set 2 shows set 1's weight dashed and faint after set 1 is ticked, and ticks in one tap.
    - An empty row's tick says "Add a weight to tick" and focuses the field.
    - Typed values turn solid.
  - **Header:** "{done}/{total} sets · {time}" and the line filling as sets are ticked; the bold ring on the next set; superset order.
  - **Block:** + Note opens and saves; a saved note shows as a line; + Set and + Warmup; at 320, ⋯ stays at the right edge.
  - **Rest:** the 32pt countdown, the track draining, +15s, −15s, Skip; "Rest's up · Set 2 next", which goes after 10s or on a tick; tapping the time opens Rest time.
  - **Finish:**
    - With a whole exercise untouched: "Finish Push A?", with Keep logging filled.
    - With all ticked: no sheet.
    - With an empty workout: no Up next clause.
  - The console shows no errors on a clean load.
- [ ] **Step 4: Record** the results and the screenshots' paths in the ledger.
  - The controller then publishes the owner's iPhone checklist for this round. The device-only checks are:
    - dashed edges on iOS fields and ticks;
    - + Note's autoFocus raising the keyboard;
    - the warning haptic;
    - the not-ready tap keeping the keyboard on the field it focuses;
    - the header at the largest text size;
    - VoiceOver: "Set 1 logged. Rest 2 minutes.", "Rest over", and the suggestion hint;
    - +15s rescheduling the lock-screen notification;
    - the Finish sheet over the keyboard.

---

## Out of scope (left for the owner's next pick)

- Warmer zero-state captions on Train.
- Showing Up next loads in the display unit (§7.1).
- A "Run a different day" link.
- A rest chip in the header when the row is scrolled away.
- The rest grid in the ⋯ menu.
- Grouped sheets.
- Borders on every input and button (`borderStrong` is defined now and used only where this plan says).
- Large-text caps anywhere but the session header.
- Announcing −15s and +15s.
