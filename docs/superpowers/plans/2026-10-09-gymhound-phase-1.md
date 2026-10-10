# GymHound Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the GymHound shell (header, hound mark, both themes, dock, footer), the Train screen, and a session that logs offline from a premade routine day or from empty, then finishes, discards, or resumes. It also includes the parts of the owner's 2026-10-09 additions that phase 1 owns:
- a one-line header with a fixed-size wordmark
- the last result beside every set
- the rest bell
- the note saved with each finished workout
- snapshots with restore
- weight-and-time entry
- Up next advancing only on a finished day

**Revision 2026-10-09:**
- Tasks 1–12 are done (branch `phase-1`, `e0d0a7b..df4ac44`).
- Tasks 12A–12F are new. 12A is the FieldHound footer and runs first.
- Tasks 13–17 are revised.
- Read "As built" below before any task from 12A on.

**Architecture:** Expo Router app in Expo Go. SQLite (`expo-sqlite`) through Drizzle is the source of truth. Rules live in pure TypeScript under `src/domain`, and repositories under `src/db/repositories`. Both are tested with Jest in Node, with repositories running on `better-sqlite3` against the same migrations. Screens read through `useDbQuery`, which re-runs when a zustand `dataVersion` counter is bumped after each write. Session actions write to SQLite first, then bump. This is how the spec's write-through session store (§5) is realized.

**Tech Stack:** Expo (the SDK that App Store Expo Go runs), Expo Router, expo-sqlite, drizzle-orm / drizzle-kit, zustand, react-native-svg, @expo-google-fonts (Barlow Condensed, Inter), expo-notifications, expo-haptics, expo-localization, expo-crypto, Jest + jest-expo, better-sqlite3, patch-package. The revision adds expo-audio, expo-file-system and expo-sharing.

**Spec:** `docs/superpowers/specs/2026-10-09-gymhound-design.md`. Read §5, §6, §7.1, §7.8, §7.9, §8.1–§8.4, §12, §15 and §17.2 before starting.

## Global Constraints

- **Location:** the project root is `C:\Users\eddie\OneDrive\Documents\GymHound`. `node_modules` is a junction to `C:\Users\eddie\.gymhound\node_modules`. Never run `npm install` in the project itself, because npm 11 deletes the junction. Install in `C:\Users\eddie\.gymhound` (copy `patches/` there first) and copy `package.json` and `package-lock.json` back. Fixes to dependency code live only as `patch-package` files in `patches/`, never as hand edits in `node_modules`, and the iPhone build must not need any browser-only patch.
- **Platform:** Phase 1 runs in Expo Go and the web build. No native module outside Expo Go, and no `expo-dev-client`.
- **Network:** no network calls anywhere in the app. No accounts.
- **IDs:** text. Bundled rows use stable slugs. User rows use `randomUUID()` from `expo-crypto`.
- **Time:**
  - Timestamps are epoch milliseconds.
  - `local_date` is `YYYY-MM-DD` in the phone's time zone at the moment the workout started.
  - Every repository and domain function that needs the time takes `now: number` (or a `Date`) as a parameter. None of them calls `Date.now()` itself.
- **Weights:**
  - 1 lb = 0.45359237 kg.
  - Compare weights in kg. Two weights are equal when they differ by less than 0.01 kg.
  - Every logged entry stores the unit it was logged in.
- **Colours:**

  | token | dark | light |
  |---|---|---|
  | bg | #100f0c | #f6f3ec |
  | surface | #1a1814 | #ffffff |
  | surfaceRaised | #232019 | #efebe3 |
  | border | #2e2a23 | #ddd7cb |
  | text | #f1ece2 | #15130f |
  | textMuted | #a39d90 | #6b665c |
  | red | #E10600 | #E10600 |

- **Red** is used only for the GYMHOUND wordmark, the active tab and PR marks. Primary buttons are filled with `text` and labelled in `bg`.
- **Wordmark:** "GYMHOUND", Barlow Condensed ExtraBold, 38px, red, uppercase, letterSpacing −0.5, one line.
  - It sits on the right of the 48px hound with a 10px gap, vertically centred, at every width. It is never stacked.
  - It keeps a fixed size (`allowFontScaling={false}`). Every other text in the app follows the phone's text size.
- **Previous result** (spec §8.4):
  - Every set row shows that same set's last result beside the input, matched by set type and number.
  - The cell is empty with no history, and a number is never invented.
  - A warmup is never the previous result for a working set.
  - Formats: "185 × 5", "70 lb × 40s", "40s" or "1:30".
- **Data safety** (spec §12, §17.2):
  - Never delete the live database file.
  - Never start empty while a snapshot exists.
  - A failed snapshot never fails a finish.
- **Not in phase 1:** Apple Health, Health Connect, the music player, the cloud copy of snapshots, and watch apps. These are phases 7 and 8, and nothing in phase 1 calls them.
- **Bell:** it ducks music for a moment and never stops it.
- **Type:**
  - Display: Barlow Condensed 600, 700 and 800.
  - Body: Inter 400, 500 and 600.
  - Numbers: `fontVariant: ['tabular-nums']`.
- **Footer:** it matches FieldHound exactly.
  - Two centred lines: "powered by" (Inter 400, 10px/12px, `textMuted`, 10px below it), then the GruntHound wordmark image, 153.5px wide. Use `grunthound-on-dark*.png` on dark and `grunthound-on-light*.png` on light.
  - It is pinned to the bottom of short pages. On long pages it follows the content.
  - It appears on Train, History, Stats and Settings only, never on Fuel, the session, or the finish summary.
  - It never contains the hound.
- **Layout:** content is capped at a 512px max width and centred, with a 16px side gutter.
- **Banned imagery:** no quotes, flames or skulls.
- **Hound mark:** the dog from the GruntHound logo, already cut and exported in `assets/brand/`. Never redraw, trace or replace it.
- **Commits:** every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Database tests:** they start with the docblock `/** @jest-environment node */`.

## Review Focus

1. **App killed mid-workout.** Reopening shows Resume with every tick and value intact. A rest timer whose end time has passed shows nothing.
   - Task 4 tests `restRemainingSeconds` with an expired end.
   - Task 8 tests a file-backed database closed and reopened.
2. **Number entry.**
   - "82,5" means 82.5.
   - Blank, "abc", "-5", "1.2.3" and "1e3" are rejected.
   - "8.5" reps is rejected.
   - Task 2 tests `parseDecimal` and `parseReps`.
3. **Starting while a workout is active.** Start this or Start empty while a workout is active creates no second active row.
   - Task 5 tests the partial unique index.
   - Task 8 tests `ActiveWorkoutExistsError`.
4. **Finishing with nothing ticked.** The finish is refused, with "Nothing is ticked yet." and the choices Keep logging and Discard workout. An empty workout must never reach history or the streak.
   - Task 8 tests `NothingTickedError`.
   - Task 16 wires the UI.
5. **Day boundaries.** A workout started at 23:50 belongs to its start date. A streak survives a DST change.
   - Task 2 tests `daysBetween` across DST.
   - Task 8 tests a late-night `local_date`.

### Review Focus — revision 2026-10-09

6. **A failed migration or a missing database file with snapshots present.** The user's finished workouts come back from the newest snapshot. The failed file is kept, and the app never opens empty.
   - Task 12E tests 5–8.
7. **The previous column showing the wrong set.** A warmup must not appear as the previous working set. Set n matches set n of the same type, even after unticked sets left gaps. The cell is empty when there is nothing to match.
   - Task 12C `matchPrevious` tests; Task 14 uses it.
8. **A note edited after finishing.** The finished workout keeps the note it was saved with. A replaced exercise saves its own note.
   - Task 12D tests.
9. **The bell with music playing, or with the ringer on silent.** In the app, the bell plays and ducks the music without stopping it. On a locked phone, the notification follows the phone's own sound settings.
   - Task 15 Step 4; phone check in Task 17.
10. **Phone text at its largest.** GYMHOUND stays fixed and on one line beside the hound, while other text grows.
    - Task 12B; phone check in Task 17.

## As built (Tasks 1–12): read before Task 12A

Where the rulings changed an interface from the original task text, the code is the truth. The changes:

- **Positions** are 0-based everywhere: routine days and exercises, workout exercises, and sets.
- **Ticking:**
  - The signature is `tickSet(db, setId, v: TickValues, unit: WeightUnit, now: number, distanceUnit: DistanceUnit)`. It stores `weight_unit` only with a weight, and `distance_unit` only with a distance.
  - `placeholdersFor({ previous, ruleRepMax, loggingType?, unit? })` converts a previous weight into `unit`. For timed sets, `ruleRepMax` feeds `durationS`.
  - `resolveTick` returns only the fields its logging type uses.
  - `TickInput.target` must already be in the entry unit.
- **Editing a workout:**
  - `replaceExercise` clears the rule snapshot, the planned and override weights, and the routine link.
  - `moveExercise` moves a superset as one block.
  - `finishWorkout` and `discardWorkout` throw a plain `Error` when the workout is missing or not active.
- **App shell:**
  - `src/ui/Footer.tsx` was built in Task 11 as a plain sentence. Task 12A replaces it with the FieldHound footer. `app/index.tsx` was deleted in Task 12, and `(tabs)/index.tsx` owns `/`.
  - Tabs come from `expo-router/js-tabs`, with `backBehavior="history"`. The only hidden tab is `settings` until Task 13 adds `routines/index`.
  - The root Stack has no explicit screens yet. Each task registers the routes it creates.
- **Database:**
  - The app opens the database with `openAppDbAsync()` (a web warm-up, then `openAppDb()`).
  - On web, stock expo-sqlite gives a sync call a fixed spin count, which is about 16–36 ms on a fast CPU. Slow writes to browser storage crashed with "Sync operation timeout" in the owner's check. The patch makes it a 10 s wall-clock wait (`src/db/webSqliteWait.test.ts`). Sync results are capped at 1 MiB.
  - The expo-sqlite web fixes live in `patches/expo-sqlite+57.0.4.patch`, and `.gitattributes` keeps patches byte-exact. Both fixes are web-only.
- **`useDbQuery(query)`:** pass stable, module-level query functions. It skips the first focus after mount.
- **Browser checks from subagents:** `preview_start` cannot find `launch.json`. Run `npm run web` in the background, navigate the browser pane to `http://localhost:8081/`, and use one tab per origin.
- **Commits:** the trailer is `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## File map

```
app/_layout.tsx                    root: splash, fonts, DB open, migrations, settings, seed, providers, root Stack
app/session.tsx                    session screen (full-screen)
app/finish/[id].tsx                finish summary (full-screen)
app/pick-exercise.tsx              exercise picker (modal)
app/(tabs)/_layout.tsx             Header + Dock, hidden routes
app/(tabs)/index.tsx               Train
app/(tabs)/history/index.tsx       stub
app/(tabs)/stats.tsx               stub
app/(tabs)/fuel.tsx                stub (no footer)
app/(tabs)/routines/index.tsx      minimal routines list
app/(tabs)/settings.tsx            Appearance only
src/domain/types.ts                shared unions
src/domain/units.ts                conversion, equality, formatting, default unit
src/domain/input.ts                number, reps, duration, RPE parsing
src/domain/dates.ts                local dates, greeting, train date, clocks
src/domain/streak.ts               §7.8
src/domain/volume.ts               §7.9
src/domain/setEntry.ts             set labels, placeholders, tick resolution, previous formatting
src/domain/rest.ts                 rest timer math, superset rest rule
src/domain/search.ts               phase-1 name and alias search
src/db/schema.ts                   full §6 schema
src/db/types.ts                    Db type
src/db/ids.ts                      newId()
src/db/client.ts                   openAppDb()
src/db/DbProvider.tsx              DbProvider, useDb()
src/db/migrations/                 generated by drizzle-kit
src/db/testing/createTestDb.ts     better-sqlite3 test database
src/db/testing/fixtures.ts         seededDb()
src/db/repositories/settingsRepo.ts
src/db/repositories/routinesRepo.ts
src/db/repositories/workoutsRepo.ts
src/db/repositories/workoutEditRepo.ts
src/db/repositories/workoutViewsRepo.ts
src/db/repositories/exercisesRepo.ts
src/seed/exercises.ts, src/seed/routines.ts, src/seed/seed.ts
src/state/dataVersion.ts           useDataVersion, bumpData(), useDbQuery()
src/state/sessionActions.ts        UI actions: repository write, then rest surface, then bump
src/platform/restTimer/index.ts, expoGoNotification.ts
src/ui/theme.ts, ThemeProvider.tsx, Text.tsx, Button.tsx, Sheet.tsx, Screen.tsx
src/ui/HoundMark.tsx, Header.tsx, Dock.tsx, Footer.tsx
src/ui/session/ExerciseBlock.tsx, SetRow.tsx, RestBar.tsx, ExerciseMenu.tsx
assets/brand/hound-head.png        master hound cut from the GruntHound logo (exists)
assets/brand/mark{,@2x,@3x}.png    40/80/120px header exports (exist)
assets/brand/mark-dark{,@2x,@3x}.png  same, with the #2f8cff outline for dark (exist)

Added by the 2026-10-09 revision:
src/db/snapshots.ts                snapshot names, write/prune, startDatabase (restore order)
src/db/testing/openFileDb.ts       better-sqlite3 file DB without migrating (tests)
src/db/testing/nodeSnapshotFiles.ts  SnapshotFiles over Node fs (tests)
src/platform/snapshots/index.ts, expoSnapshotFiles.ts   SnapshotFiles on the phone; null on web
src/state/backup.ts                takeSnapshotSafely, shareFile
src/platform/restTimer/bell.ts     playBell (expo-audio, ducks other audio)
scripts/make-bells.mjs             writes assets/sounds/{bell,chime,ding}.wav
src/db/migrations/0001_*.sql       workout_exercises.note
assets/brand/grunthound-master.png FieldHound's grunthound-mark.png, unchanged (exists)
assets/brand/grunthound-on-{dark,light}{,@2x,@3x}.png  footer wordmark: white or black GRUNT, blue HOUND (exist)
```

---

### Task 1: Scaffold, tooling, and the OneDrive junction

**Files:**
- Create: `package.json`, `app.json`, `tsconfig.json`, `babel.config.js`, `metro.config.js`, `drizzle.config.ts`, `jest.setup.ts`, `.claude/launch.json`, `app/_layout.tsx` (placeholder), `app/index.tsx` (placeholder), `src/db/testing/sqlite.smoke.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces:
  - npm scripts: `test`, `typecheck`, `db:generate`, `web`.
  - The `@/*` → `src/*` path alias, in both TypeScript and Jest.

- [ ] **Step 1: Confirm Node.**
  - Run: `node --version`. Expected: `v24.*`.
  - If Node is not found, the Windows installer is still waiting for admin approval. Stop and ask the owner.

- [ ] **Step 2: Create the junction before any install (PowerShell, in the project root).**

```powershell
New-Item -ItemType Directory -Force "C:\Users\eddie\.gymhound\node_modules" | Out-Null
New-Item -ItemType Junction -Path node_modules -Target "C:\Users\eddie\.gymhound\node_modules"
```

Expected: `node_modules` is listed with Mode `l`.

- [ ] **Step 3: Scaffold in a temporary folder and copy it in.**
  - Run: `npx create-expo-app@latest "$env:TEMP\gymhound-scaffold" --template blank-typescript --no-install`.
  - Copy everything except `.git`, `.gitignore` and `node_modules` into the project root.
  - Delete `App.tsx` and `index.ts`.
  - Append any template `.gitignore` lines that are not already in ours.

- [ ] **Step 4: Install dependencies.**

```bash
npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar expo-splash-screen expo-sqlite expo-font @expo-google-fonts/barlow-condensed @expo-google-fonts/inter react-native-svg expo-notifications expo-haptics expo-localization expo-crypto react-native-web react-dom @expo/metro-runtime @expo/vector-icons
npm install drizzle-orm zustand
npx expo install jest-expo jest @types/jest -- --save-dev
npm install -D drizzle-kit babel-plugin-inline-import better-sqlite3 @types/better-sqlite3
```

- [ ] **Step 5: Configure.**
  - **`package.json`:**
    - `"main": "expo-router/entry"`.
    - Scripts: `"test": "jest"`, `"typecheck": "tsc --noEmit"`, `"db:generate": "drizzle-kit generate"`, `"web": "expo start --web --port 8081"`.
    - Jest config: `{ "preset": "jest-expo", "setupFiles": ["<rootDir>/jest.setup.ts"], "moduleNameMapper": { "^@/(.*)$": "<rootDir>/src/$1" } }`.
  - **`app.json`:** `name` "GymHound", `slug` "gymhound", `scheme` "gymhound", `userInterfaceStyle` "automatic", `plugins` `["expo-router", "expo-sqlite"]`, `experiments.typedRoutes` true.
  - **`tsconfig.json`:** extends `expo/tsconfig.base`, `strict: true`, `paths: { "@/*": ["./src/*"] }`.
  - **`babel.config.js`:** preset `babel-preset-expo`, plugin `["inline-import", { "extensions": [".sql"] }]`.
  - **`jest.setup.ts`:** `jest.mock('expo-crypto', () => ({ randomUUID: () => require('crypto').randomUUID() }));`
  - **`drizzle.config.ts`:** `{ dialect: 'sqlite', driver: 'expo', schema: './src/db/schema.ts', out: './src/db/migrations' }`.
  - **`.claude/launch.json`:** one configuration `{ "name": "gymhound-web", "runtimeExecutable": "npm", "runtimeArgs": ["run", "web"], "port": 8081 }`. Use `npm.cmd` if spawning `npm` fails.
  - **`metro.config.js`:** these values are pinned.

```js
const path = require('path');
const fs = require('fs');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push('sql');
config.resolver.assetExts.push('wasm');
const linked = path.join(__dirname, 'node_modules');
const real = fs.realpathSync(linked);
if (real !== linked) config.watchFolders = [...(config.watchFolders ?? []), real];
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  return middleware(req, res, next);
};
module.exports = config;
```

  - **Placeholders:** `app/_layout.tsx` renders `<Stack screenOptions={{ headerShown: false }} />`, and `app/index.tsx` renders the text "GymHound".

- [ ] **Step 6: Write the smoke test `src/db/testing/sqlite.smoke.test.ts`.**

```ts
/** @jest-environment node */
import Database from 'better-sqlite3';
it('loads better-sqlite3 through the junction', () => {
  const db = new Database(':memory:');
  expect(db.prepare('select 1 as one').get()).toEqual({ one: 1 });
});
```

- [ ] **Step 7: Verify.**
  - `npm test`: 1 passed.
  - `npm run typecheck`: no errors.
  - Start `gymhound-web` with preview_start. The page shows "GymHound".
  - read_network_requests shows only `localhost:8081` requests.
  - **If Metro fails to resolve modules through the junction:** stop and tell the owner. The fallback is to remove the junction and install normally, which means OneDrive syncs `node_modules`. That is the owner's call.

- [ ] **Step 8: Commit.**
  - `git add -A`
  - `git commit -m "chore: scaffold Expo app with router, sqlite, drizzle, jest"`

---

### Task 2: Domain — types, units, input parsing, dates

**Files:**
- Create: `src/domain/types.ts`, `src/domain/units.ts`, `src/domain/input.ts`, `src/domain/dates.ts`
- Test: `src/domain/units.test.ts`, `src/domain/input.test.ts`, `src/domain/dates.test.ts`

**Interfaces:**
- **`types.ts`:**
  - `WeightUnit = 'lb'|'kg'`
  - `DistanceUnit = 'm'|'km'|'mi'`
  - `LoggingType = 'weighted'|'bodyweight_plus'|'assisted'|'timed'|'distance_time'`
  - `Equipment = 'barbell'|'dumbbell'|'cable'|'machine'|'kettlebell'|'bodyweight'`
  - `Pattern = 'squat'|'hinge'|'lunge'|'horizontal_push'|'vertical_push'|'horizontal_pull'|'vertical_pull'|'carry'|'core'|'isolation'`
  - `Muscle = 'chest'|'front_delts'|'side_delts'|'rear_delts'|'lats'|'upper_back'|'traps'|'biceps'|'triceps'|'forearms'|'abs'|'obliques'|'lower_back'|'glutes'|'quads'|'hamstrings'|'adductors'|'calves'`
  - `SetType = 'working'|'warmup'|'drop'|'failure'`
  - `DayMark = 'normal'|'rough_sleep'|'short_on_food'|'pain'|'cutting'`
  - `ThemePreference = 'system'|'light'|'dark'`
  - `MeasurementSystem = 'us'|'metric'|'uk'|null`
- **`units.ts`:**
  - `LB_TO_KG = 0.45359237`
  - `toKg(v: number, u: WeightUnit): number`
  - `convertWeight(v: number, from: WeightUnit, to: WeightUnit): number`
  - `sameWeight(a: {value: number; unit: WeightUnit}, b: {value: number; unit: WeightUnit}): boolean`
  - `formatWeight(v: number, u: WeightUnit): string`
  - `defaultUnitFor(m: MeasurementSystem): WeightUnit`
- **`input.ts`:**
  - `parseDecimal(t: string): number | null`
  - `parseReps(t: string): number | null`
  - `parseDuration(t: string): number | null` (seconds)
  - `parseRpe(t: string): number | null`
- **`dates.ts`:**
  - `toLocalDate(ms: number): string`
  - `fromLocalDate(s: string): Date` (local midnight)
  - `daysBetween(a: string, b: string): number` (b − a)
  - `mondayOf(localDate: string): string`
  - `greetingFor(d: Date): 'GOOD MORNING'|'GOOD AFTERNOON'|'GOOD EVENING'`
  - `formatTrainDate(d: Date, locale: string): string`
  - `formatElapsed(ms: number): string`
  - `formatRest(seconds: number): string`

- [ ] **Step 1: Write the failing tests.**

```ts
// units.test.ts
expect(toKg(100, 'lb')).toBeCloseTo(45.359237, 6);
expect(convertWeight(2.5, 'kg', 'lb')).toBeCloseTo(5.5116, 4);
expect(sameWeight({ value: 100, unit: 'kg' }, { value: 220.462, unit: 'lb' })).toBe(true);
expect(sameWeight({ value: 100, unit: 'kg' }, { value: 100.02, unit: 'kg' })).toBe(false);
expect(formatWeight(185, 'lb')).toBe('185 lb');
expect(formatWeight(82.5, 'kg')).toBe('82.5 kg');
expect(formatWeight(80, 'kg')).toBe('80 kg');
expect(formatWeight(83.914, 'kg')).toBe('83.91 kg');
expect(defaultUnitFor('us')).toBe('lb');
expect(defaultUnitFor('metric')).toBe('kg');
expect(defaultUnitFor('uk')).toBe('kg');
expect(defaultUnitFor(null)).toBe('kg');

// input.test.ts  (Review Focus 2)
it.each([['82,5', 82.5], ['82.5', 82.5], [' 100 ', 100], ['0', 0]])('parseDecimal(%p)', (t, v) => expect(parseDecimal(t)).toBe(v));
it.each(['', 'abc', '-5', '1.2.3', '1e3', '1,2,3'])('parseDecimal rejects %p', (t) => expect(parseDecimal(t)).toBeNull());
expect(parseReps('8')).toBe(8);
expect(parseReps('0')).toBe(0);
expect(parseReps('8.5')).toBeNull();
expect(parseReps('-1')).toBeNull();
expect(parseDuration('90')).toBe(90);
expect(parseDuration('1:30')).toBe(90);
expect(parseDuration('1:03')).toBe(63);
expect(parseDuration('1:75')).toBeNull();
expect(parseDuration('')).toBeNull();
expect(parseRpe('8')).toBe(8);
expect(parseRpe('8,5')).toBe(8.5);
expect(parseRpe('8.3')).toBeNull();
expect(parseRpe('5.5')).toBeNull();
expect(parseRpe('10.5')).toBeNull();

// dates.test.ts  (Review Focus 5)
expect(toLocalDate(new Date(2026, 9, 9, 23, 50).getTime())).toBe('2026-10-09');
expect(fromLocalDate('2026-10-09').getTime()).toBe(new Date(2026, 9, 9).getTime());
expect(daysBetween('2026-10-06', '2026-10-09')).toBe(3);
expect(daysBetween('2026-03-07', '2026-03-10')).toBe(3);   // spans US DST start
expect(daysBetween('2026-10-24', '2026-10-27')).toBe(3);   // spans EU DST end
expect(mondayOf('2026-10-09')).toBe('2026-10-05');
expect(mondayOf('2026-10-05')).toBe('2026-10-05');
expect(mondayOf('2026-10-11')).toBe('2026-10-05');
it.each([[4, 59, 'GOOD EVENING'], [5, 0, 'GOOD MORNING'], [11, 59, 'GOOD MORNING'], [12, 0, 'GOOD AFTERNOON'], [16, 59, 'GOOD AFTERNOON'], [17, 0, 'GOOD EVENING']])
  ('greeting at %i:%i', (h, m, g) => expect(greetingFor(new Date(2026, 9, 9, h, m))).toBe(g));
expect(formatTrainDate(new Date(2026, 9, 9), 'en-GB')).toBe('FRI 9 OCT');   // 9 Oct 2026 is a Friday
expect(formatTrainDate(new Date(2026, 9, 9), 'en-US')).toBe('FRI OCT 9');
expect(formatElapsed(754_000)).toBe('12:34');
expect(formatElapsed(3_723_000)).toBe('1:02:03');
expect(formatRest(105)).toBe('1:45');
expect(formatRest(5)).toBe('0:05');
```

- [ ] **Step 2: Run the tests.** `npx jest src/domain` → FAIL (modules not found).

- [ ] **Step 3: Implement the four files to the signatures above.**
  - `daysBetween` parses both dates as `Date.UTC(y, m-1, d)` so DST cannot shift the count.
  - `formatTrainDate` uses `Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' })`, removes commas and full stops, collapses whitespace, and uppercases.
  - `formatWeight` rounds to 2 decimals and trims trailing zeros.
  - `parseDecimal` accepts only `^\d+([.,]\d+)?$` after trimming.

- [ ] **Step 4: Run the tests.** `npx jest src/domain` → PASS.

- [ ] **Step 5: Commit.** `git commit -m "feat(domain): units, input parsing, dates"`

---

### Task 3: Domain — streak and volume

**Files:**
- Create: `src/domain/streak.ts`, `src/domain/volume.ts`
- Test: `src/domain/streak.test.ts`, `src/domain/volume.test.ts`

**Interfaces:**
- Consumes: `daysBetween` and `convertWeight` from Task 2.
- Produces:
  - `computeStreak(trainingDates: string[], today: string): number`
  - `type VolumeSet = { loggingType: LoggingType; setType: SetType; done: boolean; weight: number | null; weightUnit: WeightUnit | null; reps: number | null }`
  - `totalVolume(sets: VolumeSet[], displayUnit: WeightUnit): number` (rounded to an integer)
  - `formatVolume(n: number, unit: WeightUnit, locale: string): string`

- [ ] **Step 1: Write the failing tests.**

```ts
// streak.test.ts (spec §7.8)
expect(computeStreak([], '2026-10-09')).toBe(0);
expect(computeStreak(['2026-10-09'], '2026-10-09')).toBe(1);
expect(computeStreak(['2026-10-06'], '2026-10-09')).toBe(4);        // 2 rest days, still alive
expect(computeStreak(['2026-10-05'], '2026-10-09')).toBe(0);        // third rest day passed
expect(computeStreak(['2026-10-08', '2026-10-01', '2026-10-03', '2026-10-06', '2026-10-06'], '2026-10-09')).toBe(9);
expect(computeStreak(['2026-09-20', '2026-10-06', '2026-10-08'], '2026-10-09')).toBe(4);
expect(computeStreak(['2026-03-07', '2026-03-09'], '2026-03-10')).toBe(4);   // across DST

// volume.test.ts (spec §7.9)
const s = (o: Partial<VolumeSet>): VolumeSet => ({ loggingType: 'weighted', setType: 'working', done: true, weight: 100, weightUnit: 'kg', reps: 5, ...o });
expect(totalVolume([s({})], 'kg')).toBe(500);
expect(totalVolume([s({ setType: 'warmup' }), s({ done: false })], 'kg')).toBe(0);
expect(totalVolume([s({ loggingType: 'assisted' }), s({ loggingType: 'timed' })], 'kg')).toBe(0);
expect(totalVolume([s({ loggingType: 'bodyweight_plus', weight: 20, weightUnit: 'lb', reps: 10 })], 'lb')).toBe(200);
expect(totalVolume([s({ reps: 1 })], 'lb')).toBe(220);
expect(totalVolume([s({ setType: 'drop' }), s({ setType: 'failure' })], 'kg')).toBe(1000);
expect(formatVolume(12480, 'lb', 'en-US')).toBe('12,480 lb');
```

- [ ] **Step 2: Run the tests.** `npx jest src/domain/streak src/domain/volume` → FAIL.

- [ ] **Step 3: Implement.**
  - `computeStreak`: deduplicate, sort, and apply the §7.8 rules (alive if `daysBetween(latest, today) <= 3`, and the chain allows gaps of up to 3 days).
  - `totalVolume`: convert each included set to `displayUnit` before summing, then round.

- [ ] **Step 4: Run the tests.** → PASS.

- [ ] **Step 5: Commit.** `git commit -m "feat(domain): streak and weekly volume"`

---

### Task 4: Domain — set entry, rest, search

**Files:**
- Create: `src/domain/setEntry.ts`, `src/domain/rest.ts`, `src/domain/search.ts`
- Test: `src/domain/setEntry.test.ts`, `src/domain/rest.test.ts`, `src/domain/search.test.ts`

**Interfaces:**
- **`setEntry.ts`:**
  - `setLabels(types: SetType[]): string[]`
  - `type PrevSet = { position: number; setType: SetType; weight: number|null; weightUnit: WeightUnit|null; reps: number|null; durationS: number|null; distance: number|null; distanceUnit: DistanceUnit|null }`
  - `placeholdersFor(a: { previous: PrevSet | null; ruleRepMax: number | null }): { weight: number|null; reps: number|null; durationS: number|null; distance: number|null }`
  - `type TickInput = { loggingType: LoggingType; entered: { weight: number|null; reps: number|null; durationS: number|null; distance: number|null }; target: number | null; placeholders: ReturnType<typeof placeholdersFor> }`
  - `type TickValues = { weight: number|null; reps: number|null; durationS: number|null; distance: number|null }`
  - `resolveTick(i: TickInput): TickValues | null`
  - `formatPrevious(p: PrevSet, loggingType: LoggingType, displayUnit: WeightUnit): string`
- **`rest.ts`:**
  - `restRemainingSeconds(endsAt: number | null, now: number): number | null`
  - `minus15(endsAt: number, now: number): number | null`
  - `shouldStartRestAfterTick(exercises: { id: string; position: number; supersetGroup: number | null }[], workoutExerciseId: string): boolean`
- **`search.ts`:**
  - `type SearchItem = { id: string; name: string; aliases: string[] }`
  - `searchExercises<T extends SearchItem>(items: T[], query: string): T[]`

- [ ] **Step 1: Write the failing tests.**

```ts
// setEntry.test.ts (spec §8.4)
expect(setLabels(['warmup', 'working', 'working', 'drop', 'failure', 'working'])).toEqual(['W', '1', '2', 'D', 'F', '3']);
const prev = { position: 1, setType: 'working', weight: 180, weightUnit: 'lb', reps: 10, durationS: null, distance: null, distanceUnit: null } as const;
expect(placeholdersFor({ previous: prev, ruleRepMax: 12 })).toEqual({ weight: 180, reps: 10, durationS: null, distance: null });
expect(placeholdersFor({ previous: null, ruleRepMax: 12 })).toEqual({ weight: null, reps: 12, durationS: null, distance: null });
const none = { weight: null, reps: null, durationS: null, distance: null };
expect(resolveTick({ loggingType: 'weighted', entered: none, target: 180, placeholders: { ...none, reps: 12 } })).toEqual({ ...none, weight: 180, reps: 12 });
expect(resolveTick({ loggingType: 'weighted', entered: { ...none, weight: 185 }, target: 180, placeholders: { ...none, reps: 12 } })).toEqual({ ...none, weight: 185, reps: 12 });
expect(resolveTick({ loggingType: 'weighted', entered: none, target: null, placeholders: none })).toBeNull();
expect(resolveTick({ loggingType: 'bodyweight_plus', entered: { ...none, reps: 10 }, target: null, placeholders: none })).toEqual({ ...none, weight: 0, reps: 10 });
expect(resolveTick({ loggingType: 'assisted', entered: { ...none, reps: 8 }, target: null, placeholders: none })).toBeNull();
expect(resolveTick({ loggingType: 'timed', entered: none, target: null, placeholders: { ...none, durationS: 45 } })).toEqual({ ...none, durationS: 45 });
expect(resolveTick({ loggingType: 'distance_time', entered: { ...none, durationS: 600 }, target: null, placeholders: none })).toBeNull();
expect(formatPrevious({ ...prev, weight: 185, reps: 12 }, 'weighted', 'lb')).toBe('185×12');
expect(formatPrevious({ ...prev, weight: 84, weightUnit: 'kg', reps: 12 }, 'weighted', 'lb')).toBe('84 kg×12');
expect(formatPrevious({ ...prev, weight: 25, reps: 8 }, 'bodyweight_plus', 'lb')).toBe('+25×8');
expect(formatPrevious({ ...prev, weight: 40, reps: 8 }, 'assisted', 'lb')).toBe('−40×8');
expect(formatPrevious({ ...prev, weight: null, reps: null, durationS: 45 }, 'timed', 'lb')).toBe('45 s');
expect(formatPrevious({ ...prev, weight: null, reps: null, distance: 2, distanceUnit: 'km', durationS: 750 }, 'distance_time', 'lb')).toBe('2 km · 12:30');

// rest.test.ts  (Review Focus 1)
const now = 1_000_000;
expect(restRemainingSeconds(null, now)).toBeNull();
expect(restRemainingSeconds(now + 90_500, now)).toBe(91);
expect(restRemainingSeconds(now - 1, now)).toBeNull();
expect(minus15(now + 60_000, now)).toBe(now + 45_000);
expect(minus15(now + 10_000, now)).toBeNull();
const ex = [{ id: 'a', position: 1, supersetGroup: 1 }, { id: 'b', position: 2, supersetGroup: 1 }, { id: 'c', position: 3, supersetGroup: null }];
expect(shouldStartRestAfterTick(ex, 'a')).toBe(false);
expect(shouldStartRestAfterTick(ex, 'b')).toBe(true);
expect(shouldStartRestAfterTick(ex, 'c')).toBe(true);

// search.test.ts
const items = [
  { id: 'rdl', name: 'Romanian deadlift', aliases: ['RDL'] },
  { id: 'ohp', name: 'Overhead press', aliases: ['OHP', 'military press'] },
  { id: 'lat', name: 'Lat pulldown', aliases: ['pulldown'] },
  { id: 'ht', name: 'Hip thrust', aliases: [] },
  { id: 'sq', name: 'Barbell back squat', aliases: ['squat'] },
  { id: 'bd', name: 'Bench dip', aliases: [] },
  { id: 'ib', name: 'Incline bench press', aliases: [] },
];
const ids = (q: string) => searchExercises(items, q).map((i) => i.id);
expect(ids('rdl')).toEqual(['rdl']);
expect(ids('OHP')).toEqual(['ohp']);
expect(ids('lat pull')).toEqual(['lat']);
expect(ids('hip thrust')).toEqual(['ht']);
expect(ids('squat')).toEqual(['sq']);
expect(ids('bench')).toEqual(['bd', 'ib']);          // name starts with the query, then alphabetical
expect(ids('xyz')).toEqual([]);
expect(ids('')).toEqual(['sq', 'bd', 'ht', 'ib', 'lat', 'ohp', 'rdl']);
```

- [ ] **Step 2: Run the tests.** `npx jest src/domain/setEntry src/domain/rest src/domain/search` → FAIL.

- [ ] **Step 3: Implement.**
  - **`resolveTick`:** each field is `entered ?? target (weight only) ?? placeholder`. Required fields by logging type:
    - weighted: weight and reps.
    - bodyweight_plus: reps, with weight defaulting to 0.
    - assisted: weight and reps.
    - timed: durationS.
    - distance_time: distance and durationS.
  - **`formatPrevious`:** shows the unit only when it differs from `displayUnit`, and uses the U+2212 minus sign for assisted.
  - **`searchExercises`:** lowercase, split on non-alphanumerics. Every query token must be a prefix of some word in the name or in any alias. Sort names that start with the query first, then alphabetically.

- [ ] **Step 4: Run the tests.** → PASS.

- [ ] **Step 5: Commit.** `git commit -m "feat(domain): set entry, rest timer math, exercise search"`

---

### Task 5: Database schema, migrations, client, test harness

**Files:**
- Create: `src/db/schema.ts`, `src/db/types.ts`, `src/db/ids.ts`, `src/db/client.ts`, `src/db/testing/createTestDb.ts`, `src/db/migrations/*` (generated)
- Test: `src/db/schema.test.ts`

**Interfaces:**
- Produces:
  - **Drizzle tables:** `exercises`, `exerciseNotes`, `routines`, `routineDays`, `routineExercises`, `workouts`, `workoutExercises`, `sets`, `bodyweight`, `foods`, `foodLog`, `settings`. Columns follow spec §6, with snake_case SQL names and camelCase TypeScript keys.
  - `type Db = BaseSQLiteDatabase<'sync', any, typeof schema>` (from `drizzle-orm/sqlite-core`).
  - `newId(): string`
  - `openAppDb(): Db` (a singleton, `gymhound.db`)
  - `createTestDb(file?: string): { db: Db; close(): void }`

- [ ] **Step 1: Write the failing test.**

```ts
/** @jest-environment node */
it('applies migrations and creates every §6 table', () => {
  const { db } = createTestDb();
  const names = db.all<{ name: string }>(sql`select name from sqlite_master where type='table'`).map((r) => r.name);
  expect(names).toEqual(expect.arrayContaining(['exercises', 'exercise_notes', 'routines', 'routine_days', 'routine_exercises', 'workouts', 'workout_exercises', 'sets', 'bodyweight', 'foods', 'food_log', 'settings']));
});
it('allows only one active workout', () => {   // Review Focus 3
  const { db } = createTestDb();
  const w = { name: 'W', status: 'active', dayMark: 'normal', startedAt: 1, localDate: '2026-10-09' } as const;
  db.insert(workouts).values({ id: 'w1', ...w }).run();
  expect(() => db.insert(workouts).values({ id: 'w2', ...w }).run()).toThrow();
  db.insert(workouts).values({ id: 'w3', ...w, status: 'finished', finishedAt: 2 }).run();
});
it('cascades workout deletes to exercises and sets', () => {
  // insert exercise, workout, workout_exercise and set; delete the workout; both child tables are empty
});
```

- [ ] **Step 2: Run the test.** `npx jest src/db/schema` → FAIL.

- [ ] **Step 3: Implement `schema.ts` from spec §6.**
  - **JSON columns:** `text(..., { mode: 'json' }).$type<T>()`.
  - **Booleans:** `integer(..., { mode: 'boolean' })`.
  - **Defaults:**
    - `workouts.day_mark` = 'normal'
    - `workouts.food_offer_shown` = false
    - `sets.done` = false
    - `sets.pr_flags` = 0
    - `exercises.archived` = false
  - **Cascades:**
    - `routine_days` → `routines`
    - `routine_exercises` → `routine_days`
    - `workout_exercises` → `workouts`
    - `sets` → `workout_exercises`
  - **Exercise foreign keys:** `exercise_id` columns reference `exercises` without cascade.
  - **No foreign key** on `workouts.routine_id`, `workouts.routine_day_id`, or `workout_exercises.routine_exercise_id`. History must survive a routine being deleted in phase 3.
  - **Partial unique index:** `uniqueIndex('one_active_workout').on(t.status).where(sql\`status = 'active'\`)`.
  - **Other indexes:** as listed in §6.

- [ ] **Step 4: Generate the migration and implement the helpers.**
  - Run `npm run db:generate`. Expected: `src/db/migrations/0000_*.sql`, `meta/_journal.json` and `migrations.js`.
  - **`createTestDb`:** better-sqlite3 (`:memory:` or `file`), then `pragma foreign_keys = ON`, then `migrate(db, { migrationsFolder: path.resolve(__dirname, '../migrations') })`.
  - **`openAppDb`:** `openDatabaseSync('gymhound.db')`, then `execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')`, then `drizzle(expo, { schema })`.
  - **`newId`:** `Crypto.randomUUID()`.

- [ ] **Step 5: Run the tests.** `npx jest src/db` → PASS. `npm run typecheck` → no errors.

- [ ] **Step 6: Commit.** `git commit -m "feat(db): full schema, first migration, test harness"`

---

### Task 6: Settings repository and seed data

**Files:**
- Create: `src/db/repositories/settingsRepo.ts`, `src/seed/exercises.ts`, `src/seed/routines.ts`, `src/seed/seed.ts`, `src/db/testing/fixtures.ts`
- Test: `src/db/repositories/settingsRepo.test.ts`, `src/seed/seed.test.ts`

**Interfaces:**
- Consumes: `Db`, the schema, and `createTestDb` from Task 5; `defaultUnitFor` from Task 2.
- Produces:
  - `type Settings = { theme: ThemePreference; unit: WeightUnit; distanceUnit: DistanceUnit; barLb: number; barKg: number; platesLb: Record<string, number>; platesKg: Record<string, number>; defaultIncrementLb: number; defaultIncrementKg: number; restSeconds: number; activeRoutineId: string|null; fuelTargets: null | { training: Macros; rest: Macros }; proDebugUnlock: boolean; proCached: boolean; seedVersion: number }`
  - `Macros = { kcal: number; protein: number; carbs: number|null; fat: number|null }`
  - `defaultSettings(m: MeasurementSystem): Settings`
  - `ensureSettings(db: Db, m: MeasurementSystem): void` writes only the keys that are missing.
  - `getSettings(db: Db): Settings`
  - `setSetting<K extends keyof Settings>(db: Db, key: K, value: Settings[K]): void`
  - **Stored keys** are the spec's snake_case names (`bar_lb`, `rest_seconds`, `active_routine_id`, …).
  - `SEED_VERSION = 1`
  - `PREMADE_ORDER: string[]` (the routine IDs in the order shown in 6.3)
  - `runSeed(db: Db, now: number): void`
  - `seededDb(m: MeasurementSystem = 'us'): Db`, the test fixture: `ensureSettings` then `runSeed`.

- [ ] **Step 1: Write the failing tests.**

```ts
/** @jest-environment node */
// settingsRepo.test.ts
const { db } = createTestDb();
ensureSettings(db, 'us');
expect(getSettings(db)).toMatchObject({ theme: 'system', unit: 'lb', distanceUnit: 'mi', barLb: 45, barKg: 20, defaultIncrementLb: 5, defaultIncrementKg: 2.5, restSeconds: 120, activeRoutineId: null, fuelTargets: null, proDebugUnlock: false });
expect(getSettings(db).platesLb).toEqual({ '45': 4, '35': 1, '25': 1, '10': 2, '5': 1, '2.5': 1 });
setSetting(db, 'theme', 'dark');
ensureSettings(db, 'metric');
expect(getSettings(db).theme).toBe('dark');
expect(getSettings(db).unit).toBe('lb');   // ensure does not overwrite
const m = createTestDb().db;
ensureSettings(m, 'metric');
expect(getSettings(m)).toMatchObject({ unit: 'kg', distanceUnit: 'km' });
expect(getSettings(m).platesKg).toEqual({ '25': 4, '20': 1, '15': 1, '10': 1, '5': 1, '2.5': 1, '1.25': 1 });

// seed.test.ts
const db = seededDb('us');
const days = (id: string) => db.select().from(routineDays).where(eq(routineDays.routineId, id)).all().length;
expect([['premade-fullbody-3', 3], ['premade-upperlower-4', 4], ['premade-ppl-6', 6], ['premade-5x5-3', 2], ['premade-dumbbell-3', 3], ['premade-noequipment-3', 3]].map(([id]) => days(id as string))).toEqual([3, 4, 6, 2, 3, 3]);
// every routine exercise references a seeded exercise
// bench on PPL Push A: set_count 4, rep 5–8, increment 5 lb
// 5x5 B deadlift: set_count 1, rep 5–5, increment 10 lb
// every no-equipment row has increment 0; plank rows have rep_min 30, rep_max 60
// metric: bench increment 2.5 kg; 5x5 deadlift 5 kg
// idempotent: runSeed twice → same row counts
// preserves next_weight: set next_weight=185 on a row, set seed_version=0, runSeed → still 185
```

- [ ] **Step 2: Run the tests.** → FAIL.

- [ ] **Step 3: Write `src/seed/exercises.ts`.**
  - Use these 55 rows, with id, name, equipment, logging type and aliases as given.
  - Choose `pattern` from the §6 list and the muscles from the §10.1 list.
  - Set `is_custom` = false.

| id | name | equip | logging | aliases |
|---|---|---|---|---|
| barbell-back-squat | Barbell back squat | barbell | weighted | squat, back squat |
| barbell-bench-press | Barbell bench press | barbell | weighted | bench, bench press, flat bench |
| barbell-row | Barbell row | barbell | weighted | bent-over row, BB row |
| barbell-deadlift | Deadlift | barbell | weighted | conventional deadlift, DL |
| barbell-overhead-press | Overhead press | barbell | weighted | OHP, military press, shoulder press |
| barbell-romanian-deadlift | Romanian deadlift | barbell | weighted | RDL |
| barbell-hip-thrust | Hip thrust | barbell | weighted | barbell hip thrust, glute thrust |
| barbell-curl | Barbell curl | barbell | weighted | BB curl |
| barbell-incline-bench-press | Incline bench press | barbell | weighted | incline bench |
| barbell-front-squat | Front squat | barbell | weighted | |
| dumbbell-lateral-raise | Dumbbell lateral raise | dumbbell | weighted | lateral raise, side raise |
| dumbbell-walking-lunge | Dumbbell walking lunge | dumbbell | weighted | walking lunge, lunge |
| dumbbell-curl | Dumbbell curl | dumbbell | weighted | DB curl, bicep curl |
| incline-dumbbell-press | Incline dumbbell press | dumbbell | weighted | incline DB press |
| dumbbell-bulgarian-split-squat | Bulgarian split squat | dumbbell | weighted | BSS, rear-foot elevated split squat |
| dumbbell-reverse-fly | Dumbbell reverse fly | dumbbell | weighted | rear delt fly, reverse fly |
| dumbbell-hammer-curl | Hammer curl | dumbbell | weighted | DB hammer curl |
| dumbbell-goblet-squat | Goblet squat | dumbbell | weighted | |
| dumbbell-bench-press | Dumbbell bench press | dumbbell | weighted | DB bench |
| dumbbell-one-arm-row | One-arm dumbbell row | dumbbell | weighted | DB row, single-arm row |
| dumbbell-romanian-deadlift | Dumbbell Romanian deadlift | dumbbell | weighted | DB RDL, RDL |
| dumbbell-seated-shoulder-press | Seated dumbbell shoulder press | dumbbell | weighted | DB shoulder press, OHP |
| dumbbell-reverse-lunge | Dumbbell reverse lunge | dumbbell | weighted | reverse lunge |
| dumbbell-chest-supported-row | Chest-supported dumbbell row | dumbbell | weighted | incline row |
| dumbbell-overhead-triceps-extension | Overhead dumbbell triceps extension | dumbbell | weighted | DB overhead extension |
| dumbbell-standing-calf-raise | Dumbbell standing calf raise | dumbbell | weighted | DB calf raise |
| lat-pulldown | Lat pulldown | cable | weighted | pulldown, lat pull-down |
| cable-triceps-pushdown | Triceps pushdown | cable | weighted | pushdown, rope pushdown |
| seated-cable-row | Seated cable row | cable | weighted | cable row |
| face-pull | Face pull | cable | weighted | |
| cable-lateral-raise | Cable lateral raise | cable | weighted | |
| cable-overhead-triceps-extension | Overhead cable triceps extension | cable | weighted | overhead extension |
| leg-press | Leg press | machine | weighted | |
| lying-leg-curl | Lying leg curl | machine | weighted | leg curl, hamstring curl |
| standing-calf-raise | Standing calf raise | machine | weighted | calf raise |
| leg-extension | Leg extension | machine | weighted | quad extension |
| seated-calf-raise | Seated calf raise | machine | weighted | |
| pull-up | Pull-up | bodyweight | bodyweight_plus | pullup, weighted pull-up |
| dip | Dip | bodyweight | bodyweight_plus | dips, parallel bar dip |
| hanging-leg-raise | Hanging leg raise | bodyweight | bodyweight_plus | leg raise |
| plank | Plank | bodyweight | timed | front plank |
| side-plank | Side plank | bodyweight | timed | |
| wall-sit | Wall sit | bodyweight | timed | |
| hollow-body-hold | Hollow body hold | bodyweight | timed | hollow hold |
| bodyweight-squat | Bodyweight squat | bodyweight | bodyweight_plus | air squat |
| push-up | Push-up | bodyweight | bodyweight_plus | pushup, press-up |
| glute-bridge | Glute bridge | bodyweight | bodyweight_plus | hip bridge |
| superman | Superman | bodyweight | bodyweight_plus | |
| bodyweight-reverse-lunge | Reverse lunge | bodyweight | bodyweight_plus | |
| pike-push-up | Pike push-up | bodyweight | bodyweight_plus | |
| single-leg-glute-bridge | Single-leg glute bridge | bodyweight | bodyweight_plus | |
| dead-bug | Dead bug | bodyweight | bodyweight_plus | |
| bodyweight-split-squat | Split squat | bodyweight | bodyweight_plus | |
| close-grip-push-up | Close-grip push-up | bodyweight | bodyweight_plus | diamond push-up |
| bird-dog | Bird dog | bodyweight | bodyweight_plus | |

- [ ] **Step 4: Write `src/seed/routines.ts`.**
  - **Type:** `SeedRoutine = { id; name; days: { slug; name; exercises: { exercise: string; sets: number; reps: [number, number]; inc: 'default' | 'double' | 'none' }[] }[] }`.
  - **IDs:**
    - day id = `${routineId}:${daySlug}`
    - routine exercise id = `${dayId}:${exerciseId}`
  - **Increment `inc`:** `default` unless marked. `default` means the settings default for the unit (5 lb or 2.5 kg). `double` means 10 lb or 5 kg. `none` means 0.
  - **Timed exercises** use `none`, and their range is in seconds.

| routine id · name | day slug · name | exercises (sets × reps) |
|---|---|---|
| premade-fullbody-3 · Full body | a · A | back squat 3×6–10; bench press 3×6–10; barbell row 3×8–12; DB lateral raise 2×12–15; plank 3×30–60 |
| | b · B | deadlift 3×5–8; overhead press 3×6–10; lat pulldown 3×8–12; DB walking lunge 2×8–12; triceps pushdown 2×10–15 |
| | c · C | leg press 3×10–15; incline DB press 3×8–12; seated cable row 3×10–12; hip thrust 3×8–12; DB curl 2×10–15 |
| premade-upperlower-4 · Upper/lower | upper-a · Upper A | bench press 4×5–8; barbell row 4×6–10; overhead press 3×8–12; lat pulldown 3×8–12; DB curl 2×10–15; triceps pushdown 2×10–15 |
| | lower-a · Lower A | back squat 4×5–8; Romanian deadlift 3×8–12; leg press 3×10–15; lying leg curl 3×10–15; standing calf raise 3×10–15 |
| | upper-b · Upper B | overhead press 4×5–8; pull-up 3×6–10; incline DB press 3×8–12; seated cable row 3×10–12; DB lateral raise 3×12–15; face pull 2×12–15 |
| | lower-b · Lower B | deadlift 3×4–6; Bulgarian split squat 3×8–12; hip thrust 3×8–12; leg extension 3×10–15; seated calf raise 3×12–15; hanging leg raise 3×10–15 (none) |
| premade-ppl-6 · Push/pull/legs | push-a · Push A | bench press 4×5–8; overhead press 3×8–12; incline DB press 3×8–12; DB lateral raise 3×12–15; triceps pushdown 3×10–15 |
| | pull-a · Pull A | deadlift 3×4–6; pull-up 3×6–10; barbell row 3×8–12; face pull 3×12–15; barbell curl 3×8–12 |
| | legs-a · Legs A | back squat 4×5–8; Romanian deadlift 3×8–12; leg press 3×10–15; lying leg curl 3×10–15; standing calf raise 4×10–15 |
| | push-b · Push B | overhead press 4×5–8; incline bench press 3×6–10; dip 3×8–12; cable lateral raise 3×12–15; overhead cable triceps extension 3×10–15 |
| | pull-b · Pull B | barbell row 4×6–10; lat pulldown 3×8–12; seated cable row 3×10–12; DB reverse fly 3×12–15; hammer curl 3×10–15 |
| | legs-b · Legs B | front squat 3×6–10; hip thrust 3×8–12; Bulgarian split squat 3×8–12; leg extension 3×10–15; seated calf raise 4×12–15 |
| premade-5x5-3 · 5×5 | a · A | back squat 5×5–5; bench press 5×5–5; barbell row 5×5–5 |
| | b · B | back squat 5×5–5; overhead press 5×5–5; deadlift 1×5–5 (double) |
| premade-dumbbell-3 · Dumbbell only | a · A | goblet squat 3×8–12; DB bench press 3×8–12; one-arm DB row 3×8–12; DB lateral raise 2×12–15; DB curl 2×10–15 |
| | b · B | DB Romanian deadlift 3×8–12; seated DB shoulder press 3×8–12; DB reverse lunge 3×8–12; chest-supported DB row 3×10–12; overhead DB triceps extension 2×10–15 |
| | c · C | Bulgarian split squat 3×8–12; incline DB press 3×8–12; DB reverse fly 3×12–15; hammer curl 2×10–15; DB standing calf raise 3×12–15 |
| premade-noequipment-3 · No equipment (all none) | a · A | bodyweight squat 3×15–25; push-up 3×8–20; glute bridge 3×12–20; superman 3×12–20; plank 3×30–60 |
| | b · B | reverse lunge 3×10–15; pike push-up 3×6–12; single-leg glute bridge 3×10–15; dead bug 3×10–15; side plank 3×20–45 |
| | c · C | split squat 3×10–15; close-grip push-up 3×6–15; bird dog 3×10–15; wall sit 3×30–60; hollow body hold 3×20–40 |

- [ ] **Step 5: Implement `settingsRepo.ts` and `runSeed`.**
  - `runSeed` runs one transaction. If `seedVersion >= SEED_VERSION`, it does nothing.
  - Otherwise it upserts the bundled exercises (`onConflictDoUpdate` on everything except `is_custom` and `archived`), the routines, the days and the routine exercises.
  - The routine-exercise upsert never touches `next_weight` or `next_weight_unit`.
  - New routine exercise rows get `increment_unit = settings.unit`. The seed never deletes rows.
  - Finally it sets `seed_version`.

- [ ] **Step 6: Run the tests.** `npx jest src/db src/seed` → PASS.

- [ ] **Step 7: Commit.** `git commit -m "feat(db): settings, bundled exercises, premade routines, seed"`

---

### Task 7: Routines repository (list, active, up next)

**Files:**
- Create: `src/db/repositories/routinesRepo.ts`
- Test: `src/db/repositories/routinesRepo.test.ts`

**Interfaces:**
- Consumes: `seededDb`, `getSettings`, `setSetting` and `PREMADE_ORDER` from Task 6.
- Produces:
  - `type RoutineSummary = { id: string; name: string; isPremade: boolean; dayCount: number; isActive: boolean }`
  - `listRoutines(db: Db): RoutineSummary[]` returns premades in `PREMADE_ORDER`, then user routines by `created_at`.
  - `setActiveRoutine(db: Db, routineId: string | null): void`
  - `type UpNextExercise = { routineExerciseId: string; exerciseId: string; name: string; loggingType: LoggingType; setCount: number; repMin: number; repMax: number; nextWeight: number | null; nextWeightUnit: WeightUnit | null }`
  - `type UpNext = { routineId: string; routineName: string; dayId: string; dayName: string; lastTime: { localDate: string; dayMark: DayMark } | null; exercises: UpNextExercise[] }`
  - `getUpNext(db: Db): UpNext | null`

- [ ] **Step 1: Write the failing tests.**

```ts
/** @jest-environment node */
const db = seededDb();
expect(listRoutines(db).map((r) => r.id)).toEqual(PREMADE_ORDER);
expect(getUpNext(db)).toBeNull();
setActiveRoutine(db, 'premade-ppl-6');
expect(listRoutines(db).find((r) => r.id === 'premade-ppl-6')!.isActive).toBe(true);
const u = getUpNext(db)!;
expect([u.routineName, u.dayName, u.lastTime]).toEqual(['Push/pull/legs', 'Push A', null]);
expect(u.exercises[0]).toMatchObject({ exerciseId: 'barbell-bench-press', name: 'Barbell bench press', setCount: 4, repMin: 5, repMax: 8, nextWeight: null });
// next_day_index = 7 on a 6-day routine → day index 1 → 'Pull A' (modulo)
// lastTime: insert a finished workout for 'premade-ppl-6:push-a' with local_date '2026-10-07', day_mark 'rough_sleep' → { localDate: '2026-10-07', dayMark: 'rough_sleep' }
```

- [ ] **Step 2: Run the test.** → FAIL.
- [ ] **Step 3: Implement.** The day is `days[next_day_index % days.length]`, ordered by position. `lastTime` comes from the latest finished workout with that `routine_day_id`, by `finished_at`.
- [ ] **Step 4: Run the test.** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(db): routines list, active routine, up next"`

---

### Task 8: Workout lifecycle repository and active view

**Files:**
- Create: `src/db/repositories/workoutsRepo.ts`, `src/db/repositories/workoutViewsRepo.ts` (`getActiveWorkoutView`, `getPreviousSets`)
- Test: `src/db/repositories/workoutsRepo.test.ts`

**Interfaces:**
- Consumes: `newId`, `toLocalDate`, `seededDb`; `PrevSet` from Task 4.
- **Produces, in `workoutsRepo`:**
  - `class ActiveWorkoutExistsError extends Error`
  - `class NothingTickedError extends Error`
  - `getActiveWorkoutId(db: Db): string | null`
  - `startEmptyWorkout(db: Db, now: number): string` creates a workout named "Workout".
  - `startWorkoutFromDay(db: Db, routineDayId: string, now: number): string`
  - `countUntickedWithValues(db: Db, workoutId: string): number`
  - `finishWorkout(db: Db, workoutId: string, now: number): void`
  - `discardWorkout(db: Db, workoutId: string): void`
  - `setRestEndsAt(db: Db, workoutId: string, endsAt: number | null): void`
  - `tickSet(db: Db, setId: string, v: TickValues, unit: WeightUnit, now: number): void`
  - `untickSet(db: Db, setId: string): void`
- **Produces, in `workoutViewsRepo`:**
  - `type SetView = PrevSet & { id: string; rpe: number | null; done: boolean }`
  - `type WorkoutExerciseView = { id: string; exerciseId: string; name: string; loggingType: LoggingType; equipment: Equipment; position: number; supersetGroup: number | null; showRpe: boolean; note: string | null; rule: { setCount: number; repMin: number; repMax: number; increment: number; incrementUnit: WeightUnit } | null; plannedWeight: number | null; plannedUnit: WeightUnit | null; overrideWeight: number | null; overrideUnit: WeightUnit | null; sets: SetView[]; previous: PrevSet[] }`
  - `type ActiveWorkoutView = { id: string; name: string; startedAt: number; dayMark: DayMark; restEndsAt: number | null; exercises: WorkoutExerciseView[] }`
  - `getActiveWorkoutView(db: Db): ActiveWorkoutView | null`
  - `getPreviousSets(db: Db, exerciseId: string, excludeWorkoutId: string): PrevSet[]`

- [ ] **Step 1: Write the failing tests.**

```ts
/** @jest-environment node */
const NOW = new Date(2026, 9, 9, 9, 0).getTime();
const PUSH_A = 'premade-ppl-6:push-a';
it('starts from a day with the rule snapshot, planned weight and empty working sets', () => {
  const db = seededDb();
  db.update(routineExercises).set({ nextWeight: 185, nextWeightUnit: 'lb' }).where(eq(routineExercises.id, `${PUSH_A}:barbell-bench-press`)).run();
  const id = startWorkoutFromDay(db, PUSH_A, NOW);
  const v = getActiveWorkoutView(db)!;
  expect([v.id, v.name]).toEqual([id, 'Push A']);
  expect(v.exercises[0]).toMatchObject({ exerciseId: 'barbell-bench-press', rule: { setCount: 4, repMin: 5, repMax: 8, increment: 5, incrementUnit: 'lb' }, plannedWeight: 185, plannedUnit: 'lb' });
  expect(v.exercises[0].sets.map((s) => [s.setType, s.done, s.weight])).toEqual(Array(4).fill(['working', false, null]));
});
it('refuses a second active workout', () => {   // Review Focus 3
  const db = seededDb();
  startEmptyWorkout(db, NOW);
  expect(() => startEmptyWorkout(db, NOW)).toThrow(ActiveWorkoutExistsError);
  expect(() => startWorkoutFromDay(db, PUSH_A, NOW)).toThrow(ActiveWorkoutExistsError);
});
it('dates a late-night workout by its start', () => {   // Review Focus 5
  // start at new Date(2026, 9, 9, 23, 50); tick one set; finish at new Date(2026, 9, 10, 0, 30) → workouts.local_date === '2026-10-09'
});
it('finish drops unticked sets and empty exercises, marks finished, advances rotation', () => {
  // start PUSH_A; tick 2 bench sets; finish → bench has 2 sets, other exercises removed, status 'finished', finished_at = finish time; ppl next_day_index = 1
});
it('5x5 rotation alternates A, B, A', () => { /* finish a, then b → next_day_index 0 */ });
it('finishing with nothing ticked throws and stays active', () => {   // Review Focus 4
  // start; db.update(sets).set({ weight: 135, weightUnit: 'lb' }) on one unticked set; expect finishWorkout to throw NothingTickedError; getActiveWorkoutId === id
});
it('discard deletes the workout and children and leaves the rotation alone', () => { /* ... */ });
it('countUntickedWithValues counts only unticked sets that have a value', () => { /* 1 typed (direct db.update) + 1 blank + 1 ticked → 1 */ });
it('survives a restart: a reopened file DB returns ticks, values and rest end', () => {   // Review Focus 1
  // createTestDb(tmpFile) → ensureSettings + runSeed → start, tick set 1 at 185×8, setRestEndsAt(NOW+120000) → close
  // createTestDb(tmpFile) again → getActiveWorkoutView shows set 1 done, weight 185, reps 8, restEndsAt NOW+120000
});
it('previous sets come from the most recent finished workout with the exercise', () => {
  // finish two workouts with bench (180×10 then 185×8); start a third → getActiveWorkoutView(...).exercises[0].previous[0] weight 185, reps 8
});
```

- [ ] **Step 2: Run the tests.** → FAIL.
- [ ] **Step 3: Implement.**
  - **Start from a day:** copy the rule snapshot and `planned_weight`/`planned_unit` from the `routine_exercises` row, along with `superset_group` and position. Create `set_count` working sets with no values.
  - **`tickSet`:** writes the values, `done = 1`, `completed_at` and `weight_unit = unit` when a weight is present.
  - **`finishWorkout`:** one transaction. Throw `NothingTickedError` if there are no done sets. Delete sets where `done = 0`, then delete workout exercises with no sets. Set the status and `finished_at`. If `routine_day_id` is set, set that routine's `next_day_index` to (position of that day + 1) mod day count.
- [ ] **Step 4: Run the tests.** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(db): workout lifecycle and active workout view"`

---

### Task 9: Workout edit repository and exercise notes

**Files:**
- Create: `src/db/repositories/workoutEditRepo.ts`, `src/db/repositories/exercisesRepo.ts`
- Test: `src/db/repositories/workoutEditRepo.test.ts`, `src/db/repositories/exercisesRepo.test.ts`

**Interfaces:**
- **Produces, in `workoutEditRepo`:**
  - `addExerciseToWorkout(db: Db, workoutId: string, exerciseId: string): string` appends the exercise with one working set and no rule.
  - `replaceExercise(db: Db, workoutExerciseId: string, exerciseId: string): void` keeps the set count, clears every set's values and ticks, and clears the rule snapshot and planned weight.
  - `removeExercise(db: Db, workoutExerciseId: string): void` renumbers positions.
  - `moveExercise(db: Db, workoutExerciseId: string, dir: 'up' | 'down'): void` does nothing at either end.
  - `toggleSupersetWithNext(db: Db, workoutExerciseId: string): void`
  - `setShowRpe(db: Db, workoutExerciseId: string, show: boolean): void`
  - `addSet(db: Db, workoutExerciseId: string): string` appends a working set.
  - `removeSet(db: Db, setId: string): void` renumbers positions.
  - `type SetPatch = Partial<{ setType: SetType; weight: number|null; weightUnit: WeightUnit|null; reps: number|null; rpe: number|null; durationS: number|null; distance: number|null; distanceUnit: DistanceUnit|null }>`
  - `updateSet(db: Db, setId: string, patch: SetPatch): void`
- **Produces, in `exercisesRepo`:**
  - `type ExerciseRow = { id; name; aliases: string[]; primaryMuscles: Muscle[]; secondaryMuscles: Muscle[]; equipment: Equipment; pattern: Pattern; loggingType: LoggingType; isCustom: boolean }`
  - `listExercises(db: Db): ExerciseRow[]` returns non-archived exercises sorted by name.
  - `getExerciseNote(db: Db, exerciseId: string): string | null`
  - `setExerciseNote(db: Db, exerciseId: string, text: string, now: number): void` deletes the note when the trimmed text is empty.

- [ ] **Step 1: Write the failing tests.**

```ts
/** @jest-environment node */
// start PUSH_A (5 exercises)
// moveExercise(first, 'up') → no change; moveExercise(first, 'down') → order [ohp, bench, ...]
// toggleSupersetWithNext(ex1) → ex1 and ex2 share a non-null group; toggle again → both null
// toggleSupersetWithNext(last) → no change
// addSet → 5 bench sets, last is working; removeSet(set 2) → positions [1,2,3,4]
// updateSet(setType 'warmup', weight 95, weightUnit 'lb') reflected in view
// replaceExercise(bench, 'dumbbell-bench-press') → exerciseId changed, 4 sets all blank and unticked, rule null, plannedWeight null
// addExerciseToWorkout(id, 'face-pull') → last exercise, 1 working set, rule null
// removeExercise(ex2) → positions contiguous 1..n
// setShowRpe(ex1, true) → view showRpe true
// notes: setExerciseNote('barbell-bench-press', 'Elbows in', NOW) → 'Elbows in' and appears as view.note; setExerciseNote(..., '  ') → null
// listExercises → 55 rows, alphabetical, first is 'Barbell back squat'
```

- [ ] **Step 2: Run the tests.** → FAIL.
- [ ] **Step 3: Implement the signatures above.** A superset group number is `max(existing groups in the workout) + 1`.
- [ ] **Step 4: Run the tests.** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(db): in-session edits and sticky exercise notes"`

---

### Task 10: Train and finish read models

**Files:**
- Modify: `src/db/repositories/workoutViewsRepo.ts`
- Test: `src/db/repositories/workoutViewsRepo.test.ts`

**Interfaces:**
- Consumes: `VolumeSet` and `totalVolume` from Task 3.
- Produces:
  - `getTrainingDates(db: Db): string[]` returns the distinct `local_date` values of finished workouts.
  - `getVolumeSetsSince(db: Db, fromLocalDate: string): VolumeSet[]` covers finished and active workouts with `local_date >= from`.
  - `type FinishSummary = { id: string; name: string; durationMs: number; volume: number; setCount: number }`
  - `getFinishSummary(db: Db, workoutId: string, displayUnit: WeightUnit): FinishSummary`

- [ ] **Step 1: Write the failing tests.**
  - Finish workouts dated 2026-10-01 and 2026-10-06, plus an active one dated 2026-10-09.
  - `getTrainingDates` → `['2026-10-01', '2026-10-06']`.
  - `getVolumeSetsSince('2026-10-05')` includes the sets from 2026-10-06 and from the active workout, and none from 2026-10-01.
  - `getFinishSummary`: duration = finished − started; volume = `totalVolume` of its sets; `setCount` = number of done sets.
- [ ] **Step 2: Run the tests.** → FAIL.
- [ ] **Step 3: Implement the signatures above.**
- [ ] **Step 4: Run the tests.** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(db): training dates, weekly volume sets, finish summary"`

---

### Task 11: App root, providers, theme and fonts

**Files:**
- Create: `src/db/DbProvider.tsx`, `src/state/dataVersion.ts`, `src/ui/theme.ts`, `src/ui/ThemeProvider.tsx`, `src/ui/Text.tsx`, `src/ui/Button.tsx`, `src/ui/Sheet.tsx`, `src/ui/Screen.tsx`
- Modify: `app/_layout.tsx` (replace the placeholder); delete `app/index.tsx`
- Test: `src/ui/theme.test.ts`

**Interfaces:**
- **Data:**
  - `DbProvider({ db, children })`
  - `useDb(): Db`
  - `useDataVersion` (zustand `{ version: number; bump(): void }`)
  - `bumpData(): void`
  - `useDbQuery<T>(query: (db: Db) => T): T` re-runs when the version changes and when the screen gains focus.
- **Theme:**
  - `type Colors = { bg; surface; surfaceRaised; border; text; textMuted; red }`
  - `darkColors`, `lightColors`
  - `resolveScheme(pref: ThemePreference, system: 'light' | 'dark' | null | undefined): 'light' | 'dark'`
  - `fonts = { display600: 'BarlowCondensed_600SemiBold', display700: 'BarlowCondensed_700Bold', display800: 'BarlowCondensed_800ExtraBold', body400: 'Inter_400Regular', body500: 'Inter_500Medium', body600: 'Inter_600SemiBold' }`
  - `ThemeProvider`
  - `useTheme(): { scheme: 'light' | 'dark'; colors: Colors }`
- **Components:**
  - `Display` (Barlow Condensed, uppercase optional)
  - `Body` (Inter)
  - `Num` (Barlow Condensed with tabular-nums)
  - `Button({ label, onPress, variant: 'primary' | 'secondary' | 'quiet' })`
  - `Sheet({ visible, onClose, children })` (a bottom Modal)
  - `ConfirmSheet({ visible, title, body?, confirmLabel, cancelLabel, onConfirm, onCancel })`
  - `Screen({ children, footer?: boolean })` (ScrollView, max width 512, centred, 16px gutter, with `<Footer/>` at the end when `footer`)

- [ ] **Step 1: Write the failing test.**

```ts
expect(darkColors).toEqual({ bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600' });
expect(lightColors).toEqual({ bg: '#f6f3ec', surface: '#ffffff', surfaceRaised: '#efebe3', border: '#ddd7cb', text: '#15130f', textMuted: '#6b665c', red: '#E10600' });
expect(resolveScheme('system', 'dark')).toBe('dark');
expect(resolveScheme('light', 'dark')).toBe('light');
expect(resolveScheme('dark', 'light')).toBe('dark');
expect(resolveScheme('system', null)).toBe('light');
```

- [ ] **Step 2: Run the test.** → FAIL.
- [ ] **Step 3: Implement the theme and components.**
- [ ] **Step 4: Write `app/_layout.tsx`.**
  - Call `SplashScreen.preventAutoHideAsync()`.
  - Open `openAppDb()` and run `useMigrations(db, migrations)` from `drizzle-orm/expo-sqlite/migrator` with `./src/db/migrations/migrations`.
  - Load the six fonts with `useFonts`.
  - When migrations succeed:
    - `ensureSettings(db, getLocales()[0]?.measurementSystem ?? null)`
    - `runSeed(db, Date.now())`
    - hide the splash screen
  - **If migrations fail**, render this text on `bg` and nothing else: "GymHound couldn't update its database." followed by the error message.
  - Wrap everything in `DbProvider` and `ThemeProvider`. The theme preference comes from `useDbQuery(getSettings).theme`.
  - **Root `Stack`:** `headerShown: false`.
    - `session`: `presentation: 'fullScreenModal'`, `gestureEnabled: false`
    - `finish/[id]`: `presentation: 'fullScreenModal'`
    - `pick-exercise`: `presentation: 'modal'`
  - The `StatusBar` style follows the scheme.
- [ ] **Step 5: Run the tests.** `npm test` and `npm run typecheck` → PASS.
- [ ] **Step 6: Commit.** `git commit -m "feat(app): root layout, DB init, theme, base components"`

---

### Task 12: Brand and shell — hound mark, header, dock, footer, stub tabs, Settings appearance

**Files:**
- Create: `src/ui/HoundMark.tsx`, `src/ui/Header.tsx`, `src/ui/Dock.tsx`, `src/ui/Footer.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx` (temporary Train placeholder), `app/(tabs)/history/index.tsx`, `app/(tabs)/stats.tsx`, `app/(tabs)/fuel.tsx`, `app/(tabs)/settings.tsx`

**Interfaces:**
- Consumes: `useTheme`, `Screen`, `Display` and `Body` from Task 11; `getSettings` and `setSetting` from Task 6; `bumpData`.
- Produces:
  - `HoundMark({ size: number })`
  - `Header()`
  - `Dock(props: BottomTabBarProps)`
  - `Footer()`

- [ ] **Step 1: Wire the hound mark (spec §8.2).**
  - `HoundMark({ size })` renders `<Image>` of `require('../../assets/brand/mark.png')` in the light scheme and `mark-dark.png` in the dark scheme, at `size × size`, with `accessibilityLabel="GruntHound hound"`.
  - React Native picks up `@2x` and `@3x` automatically.
  - Do not draw, trace or edit the art.
- [ ] **Step 2: Build the header.**
  - `HoundMark size={40}` with "GYMHOUND" in `fonts.display800`, 32px, red, `letterSpacing: -0.5`, `numberOfLines={1}`.
  - The wordmark always sits beside the mark, on one line and vertically centred, at every width including under 360pt. Never stacked (owner, 2026-10-09).
  - On the right is a round 40px button with Ionicons `settings-outline` and `accessibilityLabel="Settings"`, which pushes `/settings`.
  - When the pathname is `/settings`, the icon is `close` with `accessibilityLabel="Close settings"`, and it calls `router.back()`.
- [ ] **Step 3: Build the dock and footer.**
  - **Dock:** four items:
    - Train (`barbell-outline`) → `index`
    - History (`time-outline`) → `history/index`
    - Stats (`stats-chart-outline`) → `stats`
    - Fuel (`nutrition-outline`) → `fuel`
  - The focused item's icon and label are `colors.red`. The others are `textMuted`.
  - Hidden routes highlight nothing.
  - **Footer:** "Powered by GruntHound LLC" in Inter 400, 12px, `textMuted`, centred, with 24px vertical padding.
- [ ] **Step 4: Write `(tabs)/_layout.tsx`.**
  - `<Tabs screenOptions={{ header: () => <Header/> }} tabBar={(p) => <Dock {...p}/>}>`.
  - Hidden screens (`href: null`): `settings`. Task 13 adds `routines/index`. Register only routes that exist.
- [ ] **Step 5: Build the stubs.**
  - History and Stats: `Screen footer` with the title and the muted line "Not built yet."
  - Fuel: the same, with **no footer**.
  - Settings: `Screen footer` with the title "Settings" and an **Appearance** segmented control (Light, Dark, System). It calls `setSetting(db, 'theme', …)` and then `bumpData()`.
- [ ] **Step 6: Verify in the browser pane at 390×844 (resize_window), in both themes (`colorScheme` light, then dark).**
  - The header shows the mark and the red GYMHOUND.
  - The dock highlights Train in red.
  - The footer text is exact on Train, History, Stats and Settings, and absent on Fuel.
  - The Settings button opens Settings, and the close button returns.
  - Switching Appearance to Dark and Light overrides the system scheme.
  - At widths 340 and 320 the mark and wordmark stay on one line.
  - Take screenshots.
- [ ] **Step 7: Owner checkpoint (controller).**
  - Send the owner the light and dark header screenshots with SendUserFile.
  - **Wait for approval of how the mark sits in the header.** Adjust spacing or the dark outline, never the art, and resend until they approve.
- [ ] **Step 8: Commit.** `git commit -m "feat(ui): hound mark, header, dock, footer, settings appearance"`

---

### Task 12A: Footer matches FieldHound

**Files:**
- Modify: `src/ui/Footer.tsx`, `src/ui/Screen.tsx`
- Uses (already in the repo): `assets/brand/grunthound-on-dark.png`, `@2x`, `@3x` and `assets/brand/grunthound-on-light.png`, `@2x`, `@3x`

**Interfaces:**
- Consumes: `useTheme()` (scheme, colors), `fonts.body400`.
- Produces: unchanged signatures, `Footer()` and `Screen({ children, footer?: boolean })`.

- [ ] **Step 1: Rebuild `Footer`** as two centred lines, with 24px of bottom padding.
  1. "powered by", exactly that text and lower case, in Inter 400 at 10px with a 12px line height, `textMuted`, and a 10px margin below.
  2. An `Image` of the GruntHound wordmark, 153.5 × 16.2 (the 776:82 ratio):
     - `require('../../assets/brand/grunthound-on-dark.png')` when the scheme is dark;
     - `require('../../assets/brand/grunthound-on-light.png')` when it is light.
  - The footer group is one accessible element labelled "Powered by GruntHound LLC".
  - No hound image anywhere in the footer.
- [ ] **Step 2: Pin it to the bottom** in `Screen`.
  - The ScrollView's `contentContainerStyle` gets `flexGrow: 1`.
  - After the children, when `footer` is set, add a spacer `View` with `flex: 1` and `minHeight: 32` (FieldHound's `.home-spacer`), then the `Footer`.
  - A short page puts the footer at the bottom of the visible area, just above the dock. A long page puts it after the content.
- [ ] **Step 3: Verify in the browser pane.** Use `npm run web` in the background and one browser tab.
  - **Size 390×844, light and dark:**
    - On Train, History, Stats and Settings, the footer sits at the bottom just above the dock.
    - "powered by" is over the wordmark.
    - GRUNT is white on dark and black on light, and HOUND is blue in both.
    - Fuel has no footer.
  - **Size 390×420 on Settings:** the page scrolls and the footer comes after the content.
  - **Size 320×844:** the footer is centred and fits.
  - **Screenshots:** save `footer-light.png` and `footer-dark.png` (390×844, Train) into the `shots` folder with the headless-Edge method from Task 12.
- [ ] **Step 4:** Run `npm run typecheck` and `npm test`, both green.
- [ ] **Step 5: Commit.** `git commit -m "fix(ui): footer matches FieldHound, pinned to the bottom"`

---

### Task 12B: GYMHOUND keeps a fixed size

**Files:**
- Modify: `src/ui/Header.tsx` (the wordmark), and `src/ui/Text.tsx` only if `Display` does not already forward `allowFontScaling`.

**Interfaces:** none new.

- [ ] **Step 1: Pin the wordmark size.** The GYMHOUND `Display` gets `allowFontScaling={false}`. No other text in the app sets `allowFontScaling` or `maxFontSizeMultiplier`, so everything else still follows the phone's text size.
- [ ] **Step 2: Verify.**
  - `git grep -n "allowFontScaling" -- src app` shows exactly one hit, on the wordmark.
  - `npm run typecheck` and `npm test` are green.
  - The phone check, with system text at its largest, is in Task 17.
- [ ] **Step 3: Commit.** `git commit -m "fix(ui): GYMHOUND keeps a fixed size when phone text is enlarged"`

---

### Task 12C: Domain — weight and time, and the previous result per set

**Files:**
- Modify: `src/domain/types.ts`, `src/domain/setEntry.ts`
- Test: `src/domain/setEntry.test.ts`, `src/domain/volume.test.ts`

**Interfaces:**
- Consumes: `PrevSet`, `placeholdersFor`, `resolveTick` and `formatPrevious` as built (see "As built"); `convertWeight`.
- Produces:
  - `LoggingType` gains `'weighted_time'`.
  - `type BellSound = 'bell' | 'chime' | 'ding'` in `types.ts` (Task 12D and Task 15 use it).
  - `matchPrevious(current: ReadonlyArray<{ setType: SetType }>, previous: ReadonlyArray<PrevSet>): (PrevSet | null)[]`
    - It matches each current set to the previous set with the same type and the same number within that type.
    - Numbers count in position order.
    - No match gives `null`.
  - `formatPrevious(p: PrevSet | null, loggingType: LoggingType, displayUnit: WeightUnit): string`
    - It now accepts `null`.
    - It returns `''` when `p` is null or lacks a value its type needs. It never returns "—".
  - `placeholdersFor` and `resolveTick` handle `weighted_time`: weight and durationS are used, reps and distance are null, and both weight and durationS are required to tick.

- [ ] **Step 1: Write the failing tests.** Add the new tests. Then replace the old `formatPrevious` expectations (`'185×12'`, `'84 kg×12'`, `'+25×8'`, `'−40×8'`, `'45 s'`, and any `'—'`) with the spec §8.4 formats below.

```ts
const P = (position: number, setType: SetType, weight: number | null, reps: number | null, extra: Partial<PrevSet> = {}): PrevSet =>
  ({ position, setType, weight, weightUnit: 'lb', reps, durationS: null, distance: null, distanceUnit: null, ...extra });
const none = { weight: null, reps: null, durationS: null, distance: null };

// matchPrevious — Review Focus 7
const last = [P(0, 'warmup', 95, 10), P(1, 'working', 185, 5), P(2, 'working', 185, 4), P(3, 'failure', 185, 2)];
expect(matchPrevious([{ setType: 'warmup' }, { setType: 'working' }, { setType: 'working' }, { setType: 'working' }], last))
  .toEqual([last[0], last[1], last[2], null]);
expect(matchPrevious([{ setType: 'working' }, { setType: 'working' }], last)).toEqual([last[1], last[2]]); // a warmup is never the previous working set
expect(matchPrevious([{ setType: 'failure' }, { setType: 'drop' }], last)).toEqual([last[3], null]);
expect(matchPrevious([{ setType: 'working' }], [])).toEqual([null]);
const gaps = [P(2, 'working', 185, 5), P(0, 'working', 180, 6)];               // unsorted, with a gap left by a dropped unticked set
expect(matchPrevious([{ setType: 'working' }, { setType: 'working' }], gaps)).toEqual([gaps[1], gaps[0]]);

// formatPrevious — spec §8.4
expect(formatPrevious(P(1, 'working', 185, 5), 'weighted', 'lb')).toBe('185 × 5');
expect(formatPrevious(P(1, 'working', 84, 12, { weightUnit: 'kg' }), 'weighted', 'lb')).toBe('84 kg × 12');
expect(formatPrevious(P(1, 'working', 25, 8), 'bodyweight_plus', 'lb')).toBe('+25 × 8');
expect(formatPrevious(P(1, 'working', 40, 8), 'assisted', 'lb')).toBe('−40 × 8');
expect(formatPrevious(P(1, 'working', 70, null, { durationS: 40 }), 'weighted_time', 'lb')).toBe('70 lb × 40s');
expect(formatPrevious(P(1, 'working', 32, null, { weightUnit: 'kg', durationS: 75 }), 'weighted_time', 'lb')).toBe('32 kg × 1:15');
expect(formatPrevious(P(1, 'working', null, null, { durationS: 40 }), 'timed', 'lb')).toBe('40s');
expect(formatPrevious(P(1, 'working', null, null, { durationS: 59 }), 'timed', 'lb')).toBe('59s');
expect(formatPrevious(P(1, 'working', null, null, { durationS: 90 }), 'timed', 'lb')).toBe('1:30');
expect(formatPrevious(P(1, 'working', null, null, { distance: 2, distanceUnit: 'km', durationS: 750 }), 'distance_time', 'lb')).toBe('2 km · 12:30');
expect(formatPrevious(null, 'weighted', 'lb')).toBe('');
expect(formatPrevious(P(1, 'working', null, null), 'weighted', 'lb')).toBe('');          // never invent a number

// weight and time entry
expect(placeholdersFor({ previous: P(1, 'working', 70, null, { durationS: 40 }), ruleRepMax: 60, loggingType: 'weighted_time', unit: 'lb' }))
  .toEqual({ weight: 70, reps: null, durationS: 40, distance: null });
expect(placeholdersFor({ previous: null, ruleRepMax: 60, loggingType: 'weighted_time', unit: 'lb' }))
  .toEqual({ weight: null, reps: null, durationS: 60, distance: null });
expect(resolveTick({ loggingType: 'weighted_time', entered: { ...none, weight: 90 }, target: null, placeholders: { ...none, durationS: 60 } }))
  .toEqual({ weight: 90, reps: null, durationS: 60, distance: null });
expect(resolveTick({ loggingType: 'weighted_time', entered: none, target: null, placeholders: { ...none, durationS: 60 } })).toBeNull();

// volume.test.ts: weight-and-time adds nothing
expect(totalVolume([s({ loggingType: 'weighted_time', reps: null })], 'kg')).toBe(0);
```

- [ ] **Step 2: Run the tests.** `npx jest src/domain` → FAIL. The new cases fail, and the old format assertions fail once replaced.
- [ ] **Step 3: Implement.**
  - **Duration formatting:** under 60 seconds is `{s}s`; from 60 seconds it is `m:ss`.
  - **Units:** weight-and-time always shows its unit. Other weights show a unit only when it differs from `displayUnit`.
  - **Separator:** ` × ` is U+00D7 with spaces.
  - **Exhaustive switches:** every `switch` on `LoggingType` stays exhaustive, so typecheck finds any missed case.
- [ ] **Step 4: Run the tests.** `npx jest src/domain` → PASS. `npm test` and `npm run typecheck` → green. Also update `src/db/repositories/workoutsRepo.test.ts` if it asserts an old format string.
- [ ] **Step 5: Commit.** `git commit -m "feat(domain): weight-and-time sets; previous result matched per set"`

---

### Task 12D: Database — the note saved at finish, bell and snapshot settings, Up next guards

**Files:**
- Modify: `src/db/schema.ts`, `src/db/repositories/workoutsRepo.ts`, `src/db/repositories/settingsRepo.ts`
- Create: `src/db/migrations/0001_*.sql` and its meta files (generated)
- Test: `src/db/schema.test.ts`, `src/db/repositories/workoutsRepo.test.ts`, `src/db/repositories/settingsRepo.test.ts`

**Interfaces:**
- Consumes: `BellSound` (Task 12C); `setExerciseNote`, `getExerciseNote`, `replaceExercise`, `addExerciseToWorkout` (Task 9); `setActiveRoutine`, `getUpNext` (Task 7).
- Produces:
  - `workoutExercises.note` (SQL `note`, text, nullable).
  - `Settings` gains three fields, which `ensureSettings` adds for existing installs without touching other keys:
    - `restBell: boolean` (key `rest_bell`, default `true`)
    - `restBellSound: BellSound` (key `rest_bell_sound`, default `'bell'`)
    - `lastSnapshotAt: number | null` (key `last_snapshot_at`, default `null`)
  - `finishWorkout` also does two things inside its transaction:
    - It copies each remaining exercise's current `exercise_notes.text` into `workout_exercises.note` (null when the exercise has no note).
    - It sets `workouts.rest_ends_at` to null.

- [ ] **Step 1: Write the failing tests.**

```ts
// schema.test.ts
it('migration 0001 adds workout_exercises.note', () => {
  const { db } = createTestDb();
  const cols = db.all<{ name: string }>(sql`pragma table_info(workout_exercises)`).map((c) => c.name);
  expect(cols).toContain('note');
});

// workoutsRepo.test.ts — Review Focus 8
it('saves the note with the finished workout and keeps it after later edits', () => {
  // setExerciseNote(bench, 'Elbows in'); start PUSH_A; tick bench set 0; finish
  // setExerciseNote(bench, 'Wrists straight')
  // raw finished workout_exercises row for bench: note === 'Elbows in'
  // getExerciseNote(db, 'barbell-bench-press') === 'Wrists straight'
});
it('saves null for an exercise with no note');
it('a replaced exercise saves its own note, not the old one', () => {
  // note on barbell-bench-press 'Elbows in', note on dumbbell-bench-press 'Neutral grip'
  // start PUSH_A; replaceExercise(bench row → 'dumbbell-bench-press'); tick; finish → that row's note === 'Neutral grip'
});
it('clears rest_ends_at on finish');
it('an empty workout never moves Up next', () => {
  // setActiveRoutine('premade-ppl-6'); startEmptyWorkout; addExerciseToWorkout('barbell-bench-press'); tick; finish
  // getUpNext(db)!.dayName === 'Push A' and next_day_index === 0
});
// The discard and refused-finish guards already exist from Task 8. Keep them, and group all three under describe('Up next only advances on a finished day').

// settingsRepo.test.ts
expect(getSettings(db)).toMatchObject({ restBell: true, restBellSound: 'bell', lastSnapshotAt: null });
// A DB whose settings rows predate these keys gets them from ensureSettings, and its stored theme is unchanged.
```

- [ ] **Step 2: Run the tests.** `npx jest src/db` → FAIL.
- [ ] **Step 3: Implement.**
  - Add the column to `schema.ts`, then run `npm run db:generate`. Expected output: `0001_*.sql` containing `ALTER TABLE \`workout_exercises\` ADD \`note\` text;` plus the meta and `migrations.js` updates.
  - Extend `finishWorkout` and `settingsRepo` to the interfaces above.
- [ ] **Step 4: Run the tests.** `npx jest src/db` → PASS. `npm test` and `npm run typecheck` → green.
- [ ] **Step 5: Commit.** `git commit -m "feat(db): save the note with each finished workout; bell and snapshot settings"`

---

### Task 12E: Snapshots and restore — the core

**Files:**
- Create: `src/db/snapshots.ts`, `src/db/testing/nodeSnapshotFiles.ts`, `src/db/testing/openFileDb.ts`
- Test: `src/db/snapshots.test.ts`

**Interfaces:**
- Consumes: `Db`, `createTestDb` (Task 5); `startWorkoutFromDay`, `tickSet`, `finishWorkout` (Task 8); `seededDb`-style setup on a file database.
- Produces (all in `src/db/snapshots.ts`):

```ts
export interface SnapshotFiles {
  list(): string[];                  // file names in the snapshot folder
  pathFor(name: string): string;     // absolute path, no file:// prefix (used by VACUUM INTO)
  remove(name: string): void;
  liveIsMissingOrEmpty(): boolean;   // live DB file absent or 0 bytes
  setAsideLive(tag: string): string; // renames the live file to `gymhound.${tag}.db`, returns that name; never deletes
  copyToLive(name: string): void;    // copies a snapshot over the live DB path
}
export const KEEP_SNAPSHOTS = 7;
export function snapshotName(now: number): string;      // `gymhound-YYYYMMDD-HHmmss-SSS.db`, UTC
export function snapshotTime(name: string): number;     // inverse of snapshotName (epoch ms)
export function newestSnapshot(names: string[]): string | null;
export function snapshotsToPrune(names: string[], keep?: number): string[];
export function writeSnapshot(db: Db, files: SnapshotFiles, now: number): string; // VACUUM INTO, then prune; returns the name
export type StartupDeps = {
  files: SnapshotFiles;
  open(): Db;
  close(db: Db): void;
  migrate(db: Db): Promise<void> | void;
  now: number;
};
export type StartupResult =
  | { kind: 'ok'; db: Db; restoredFrom: string | null }
  | { kind: 'failed'; error: Error; newestSnapshot: string | null; setAside: string | null };
export function startDatabase(deps: StartupDeps): Promise<StartupResult>;
```

- Only names matching `/^gymhound-\d{8}-\d{6}-\d{3}\.db$/` count as snapshots. Other files are never listed, pruned or restored.
- `src/db/testing/openFileDb.ts` exports `openFileDb(file: string): { db: Db; close(): void }`. It opens better-sqlite3 with `foreign_keys = ON` and does not migrate.
- `src/db/testing/nodeSnapshotFiles.ts` exports `nodeSnapshotFiles(dir: string, liveFile: string): SnapshotFiles`, backed by Node `fs`, with snapshots kept in `${dir}/snapshots`.

- [ ] **Step 1: Write the failing tests** (`/** @jest-environment node */`, each in a fresh temp dir that is removed afterwards). Review Focus 6:
  1. `writeSnapshot` writes a file that opens with `openFileDb` and contains the one finished workout.
  2. Nine snapshots at increasing `now` leave 7: the newest 7, by name.
  3. `snapshotName(t1) < snapshotName(t2)` for `t1 < t2`. `snapshotTime(snapshotName(t)) === t`. `newestSnapshot` ignores `gymhound.failed-x.db` and `notes.txt`.
  4. **Fresh install** (no live file, no snapshots): `ok`, with `restoredFrom` null.
  5. **Live file missing, snapshot present:** `ok`, with `restoredFrom` set to the newest, and the finished workout is present. The app never starts empty.
  6. **Migration fails once, with a snapshot:**
     - The result is `ok`, with `restoredFrom` set to the newest, and the finished workout is present.
     - The set-aside file `gymhound.failed-*.db` exists with the original bytes.
  7. **Migration always fails, with a snapshot:**
     - The result is `failed`, with both `newestSnapshot` and `setAside` set.
     - The set-aside file still exists, and no file was deleted.
  8. **Migration fails with no snapshot:** `failed`, with `setAside` null. The live file is byte-identical to before.
- [ ] **Step 2: Run the tests.** `npx jest src/db/snapshots` → FAIL.
- [ ] **Step 3: Implement.**
  - **`writeSnapshot`** runs `VACUUM INTO '<path>'`, with single quotes doubled, outside any transaction. It then removes `snapshotsToPrune(list())`.
  - **`startDatabase`** follows exactly this order:

```
newest = newestSnapshot(files.list()); restoredFrom = null
if files.liveIsMissingOrEmpty() and newest: files.copyToLive(newest); restoredFrom = newest
db = open(); try { await migrate(db); return ok(db, restoredFrom) }
catch first: close(db)
  if !newest: return failed(first, null, null)
  setAside = files.setAsideLive(`failed-${stamp(now)}`); files.copyToLive(newest); db = open()
  try { await migrate(db); return ok(db, newest) } catch second: close(db); return failed(second, newest, setAside)
```

- [ ] **Step 4: Run the tests.** `npx jest src/db/snapshots` → PASS. `npm test` and `npm run typecheck` → green.
- [ ] **Step 5: Commit.** `git commit -m "feat(db): snapshots after finish and restore on a failed migration"`

---

### Task 12F: The app uses snapshots — startup restore, export, Backups row

**Files:**
- Create: `src/platform/snapshots/index.ts`, `src/platform/snapshots/expoSnapshotFiles.ts`, `src/state/backup.ts`
- Modify: `app/_layout.tsx`, `src/db/client.ts`, `app/(tabs)/settings.tsx`, `package.json` / `package-lock.json` (new dependencies)

**Interfaces:**
- Consumes: everything in Task 12E; `getSettings` / `setSetting` (`lastSnapshotAt`); `ConfirmSheet` / `Sheet` / `Button`.
- Produces:
  - `getSnapshotFiles(): SnapshotFiles | null`. It returns null on web, where snapshots never run.
  - `expoSnapshotFiles(): SnapshotFiles`:
    - the live file is `gymhound.db` in expo-sqlite's `defaultDatabaseDirectory`;
    - snapshots live in a `snapshots` folder in the app's documents directory;
    - paths carry no `file://`.
  - `closeAppDb(): void` and `liveDbPath(): string` in `client.ts`. `openAppDb()` stays a singleton that can be reopened after `closeAppDb()`.
  - `takeSnapshotSafely(db: Db, now: number): boolean` in `src/state/backup.ts`:
    - It writes a snapshot when `getSnapshotFiles()` is non-null and sets `lastSnapshotAt`.
    - On any error it logs and returns false. It never throws.
  - `shareFile(path: string): Promise<void>` in `src/state/backup.ts`, using `expo-sharing`.

- [ ] **Step 1: Add dependencies** using the shadow procedure in environment.md: `npx expo install expo-file-system expo-sharing` in `C:\Users\eddie\.gymhound`, then copy the manifests back.
- [ ] **Step 2: Wire startup** in `app/_layout.tsx`.
  - **Native:** `startDatabase({ files: expoSnapshotFiles(), open: openAppDb, close: closeAppDb, migrate: (db) => migrate(db, migrations), now: Date.now() })`, with `migrate` from `drizzle-orm/expo-sqlite/migrator`. Then `ensureSettings` and `runSeed` run as before.
  - **Web:** keeps the current path through `openAppDbAsync()`. It never restores.
  - **`ok` with `restoredFrom`:** show a `Sheet` once, with "GymHound restored your data from {date and time of the snapshot, local}. A workout that was in progress may be missing." and **OK**.
  - **`failed`:** keep the existing error screen text.
    - Add **Export my data**, which shares the newest snapshot. It is shown only when there is one.
    - Add **Export the file that failed**, which shares the set-aside file. It is shown only when there is one.
- [ ] **Step 3: Add a Backups section to Settings**, below Appearance.
  - It reads "Last snapshot: {local date and time}" or "No snapshot yet." On web it reads "Backups run in the phone app."
  - **Share latest snapshot** (secondary) is shown when a snapshot exists.
- [ ] **Step 4: Verify.**
  - `npm run typecheck` and `npm test` are green.
  - **Web:** the app boots, and Settings shows the web line. Use `npm run web` in the background and one browser tab.
  - **iOS bundle:** `npx expo export --platform ios --output-dir <temp>` compiles offline. Delete the output.
  - The phone checks are in Task 17.
- [ ] **Step 5: Commit.** `git commit -m "feat(app): restore from snapshot at startup; export and Backups in Settings"`

---

### Task 12G: A bigger hound and GYMHOUND

The owner asked on 2026-10-10 for the hound and GYMHOUND to be a little bigger.

**Files:**
- Modify: `src/ui/Header.tsx`
- Uses (already re-exported): `assets/brand/mark{,@2x,@3x}.png` and `mark-dark{,@2x,@3x}.png`, now 48, 96 and 144px.

**Interfaces:** none new.

- [ ] **Step 1: Resize.**
  - `HoundMark size={48}` (was 40).
  - The wordmark `fontSize: 38` (was 32).
  - The header row is 72px tall (was 64), with everything vertically centred.
  - **Unchanged:** the 10px gap, red, letterSpacing −0.5, `numberOfLines={1}`, `allowFontScaling={false}`, the round 40px Settings button, and the dark-mode outline art.
- [ ] **Step 2: Verify in the browser pane** at widths 390, 340 and 320, light and dark. Use `npm run web` in the background and one tab.
  - The hound and GYMHOUND stay on one line, vertically centred.
  - Nothing overlaps the Settings button. At 320 the wordmark ends at least 40px before the button.
  - Record the measured x positions in the report.
  - Regenerate the screenshots in the `shots` folder with the headless-Edge-over-DevTools method: `header-light.png`, `header-dark.png` (390), `header-narrow.png` (340) and `header-320.png` (320). View each with Read.
- [ ] **Step 3:** Run `npm run typecheck` and `npm test`, both green.
- [ ] **Step 4: Commit.** `git commit -m "feat(ui): a bigger hound and GYMHOUND in the header"`

---

### Task 13: Train screen and minimal Routines list

**Files:**
- Modify: `app/(tabs)/index.tsx`
- Create: `app/(tabs)/routines/index.tsx`, `src/state/sessionActions.ts` (start actions only for now)

**Interfaces:**
- Consumes:
  - `getUpNext`, `listRoutines`, `setActiveRoutine` (Task 7)
  - `getActiveWorkoutView`, `getTrainingDates`, `getVolumeSetsSince` (Tasks 8 and 10)
  - `computeStreak`, `totalVolume`, `formatVolume`, `greetingFor`, `formatTrainDate`, `mondayOf`, `toLocalDate`, `formatElapsed`, `formatWeight`
- Produces, in `sessionActions.ts` (each writes, then calls `bumpData()`):
  - `startFromDay(db: Db, routineDayId: string): void`
  - `startEmpty(db: Db): void`

- [ ] **Step 1: Build the Train screen** with `Screen footer`, in this order:
  1. **Greeting:** `greetingFor(now)` in Barlow Condensed 700, 20px. Under it, `formatTrainDate(now, locale)` in Barlow Condensed 800, 56px, one line, shrinking to fit.
  2. **Resume card,** only when a workout is active.
     - Title "Resume", the workout name, and "{formatElapsed} · {n} sets done".
     - A primary **Resume** button that opens `/session`.
     - This card sits directly under the date.
  3. **Two equal cards.**
     - **Streak:** label "Streak", `Num` 44px value, and "days" ("day" when 1).
     - **This week:** label "This week", the `formatVolume` number, and "{unit} moved".
  4. **Start empty** (primary) and **Routines** (secondary), both full width.
  5. **Up next card,** only when no workout is active.
     - Title "{routineName} · {dayName}".
     - "Last time: {formatTrainDate(fromLocalDate(lastTime.localDate), locale)} · {mark label}", or "First time on this day."
     - One row per exercise: name, "{setCount}×{repMin}–{repMax}" ("{setCount}×{repMin}" when min = max, and "s" appended for timed and weight-and-time), and today's load (`formatWeight(nextWeight)` or "pick a weight").
     - A primary **Start this** button.
     - With no active routine, the card reads "Pick a routine to see what's up next." with a **Routines** button.
  - The mark labels are: Normal, Rough sleep, Short on food, Pain, Cutting.
- [ ] **Step 2: Block starting while a workout is active.** If Start empty or Start this is pressed while a workout is active, show `Sheet` with "Finish or discard the workout in progress first." and **Resume**. Otherwise start, then `router.push('/session')`.
- [ ] **Step 3: Build the Routines list.**
  - Register `routines/index` as a hidden screen (`href: null`) in `(tabs)/_layout.tsx`.
  - `Screen footer`, titled "Routines", with a section heading "Premade".
  - Each row shows the name, "{dayCount} days", and either a secondary **Set active** button or an "Active" badge.
  - **Set active** calls `setActiveRoutine`, then `bumpData()`.
- [ ] **Step 4: Verify in the browser pane, in both themes.**
  - With no routine active, the Up next prompt shows.
  - Set PPL active, return, and the Up next card lists Push A with 5 exercises and "pick a weight".
  - Streak shows 0 days, and This week shows 0 lb moved.
- [ ] **Step 5: Commit.** `git commit -m "feat(train): greeting, stats cards, up next, resume, routines list"`

---

### Task 14: Session screen — blocks, set rows, the previous result, ticks, set types, notes

**Files:**
- Create: `app/session.tsx`, `src/ui/session/ExerciseBlock.tsx`, `src/ui/session/SetRow.tsx`
- Modify: `src/state/sessionActions.ts`, `app/_layout.tsx` (register `session` in the root Stack as `fullScreenModal`, `gestureEnabled: false`)

**Interfaces:**
- Consumes:
  - `getActiveWorkoutView` and `ActiveWorkoutView` (Task 8)
  - `tickSet` with `distanceUnit`, and `untickSet` (Task 8, as built)
  - `updateSet`, `addSet`, `removeSet`, `setExerciseNote` (Task 9)
  - `setLabels`, `placeholdersFor`, `resolveTick` (Task 4, as built)
  - `matchPrevious` and `formatPrevious` (Task 12C)
  - `convertWeight` (Task 2)
  - `parseDecimal`, `parseReps`, `parseDuration`, `parseRpe` (Task 2)
  - `getSettings` (`unit`, `distanceUnit`)
- Produces, in `sessionActions.ts`:
  - `commitSetField(db: Db, setId: string, patch: SetPatch): void`
  - `tick(db: Db, ex: WorkoutExerciseView, set: SetView, entered: TickValues): boolean`. It returns false when `resolveTick` returns null. It calls `tickSet(db, set.id, values, settings.unit, now, settings.distanceUnit)`.
  - `untick(db: Db, setId: string): void`
  - `addSetTo(db: Db, workoutExerciseId: string): void`
  - `removeSetFrom(db: Db, setId: string): void`
  - `saveNote(db: Db, exerciseId: string, text: string): void`
  - Task 15 adds the rest-timer side effect to `tick`.

- [ ] **Step 1: Build the session header.** It has no app header and no dock.
  - A chevron back button (`accessibilityLabel="Back to Train"`) that calls `router.back()` and leaves the workout active.
  - The workout name in Barlow Condensed 700.
  - The running clock, `formatElapsed(now - startedAt)`, updated every second.
- [ ] **Step 2: Build `ExerciseBlock`.**
  - The name (Barlow Condensed 700, 22px) and a ⋯ button (wired in Task 15).
  - The note as an inline `TextInput` with the placeholder "Add a note for next time", saved on blur. It is the exercise's own note (`ex.note`), so it is already there wherever the exercise appears.
  - **Set table header:** SET, PREVIOUS, the input columns, ✓, plus RPE when `showRpe`. The input columns depend on the logging type:

| logging type | inputs | headers |
|---|---|---|
| weighted | load, reps | `LB` or `KG`, REPS |
| bodyweight_plus | load, reps | `+LB` or `+KG`, REPS |
| assisted | load, reps | `−LB` or `−KG`, REPS |
| weighted_time | load, time | `LB` or `KG`, TIME |
| timed | time | TIME |
| distance_time | distance, time | DIST, TIME |

  - "+ Add set" at the bottom.
- [ ] **Step 3: Build `SetRow`.**
  - **The previous result** (spec §8.4). Review Focus 7 applies.
    - The block computes `const matched = matchPrevious(ex.sets, ex.previous)` once.
    - Row i shows `formatPrevious(matched[i], ex.loggingType, settings.unit)` in its own PREVIOUS column, beside the inputs, in `textMuted`.
    - An empty string renders as an empty cell. Nothing is ever shown above the exercise or behind a tap.
  - **Placeholders:** `placeholdersFor({ previous: matched[i], ruleRepMax: ex.rule?.repMax ?? null, loggingType: ex.loggingType, unit: settings.unit })`.
  - **Target:** `overrideWeight ?? plannedWeight`, converted to `settings.unit` with `convertWeight` before it is shown or passed to `resolveTick`, because `TickInput.target` must be in the entry unit.
  - **Columns:**
    - The label from `setLabels`. Tapping it opens a `Sheet` with Working, Warmup, Drop and Failure, which calls `commitSetField({ setType })`.
    - Previous.
    - The inputs, per the table in Step 2.
    - The tick.
  - **The load input:** its value is `set.weight ?? target` in normal text. When both are null, it shows `placeholders.weight` in `textMuted`.
  - **Reps or time inputs:** their placeholders are `placeholders.reps` or `placeholders.durationS` (formatted as "40s" or "1:30"), in `textMuted`.
  - **Parsing:** `parseDecimal` for load and distance (distance is stored with `settings.distanceUnit`), `parseReps`, `parseDuration` for time, and `parseRpe`.
    - Inputs keep local text and parse on blur.
    - **Blank text is "no value" and never an error.**
    - Only non-blank text that fails to parse is invalid. It gets a `textMuted` underline (red is reserved) with the hint "Check this number", and the tick is disabled.
    - A valid value is committed with `commitSetField`.
  - **The tick** runs `tick()`.
    - A done row gets the `surfaceRaised` background and a filled check in `text`, plus a light haptic (`Haptics.impactAsync(Light)`).
    - Tapping a done tick unticks.
  - **Long-press a row** to open a `Sheet` with "Remove set" and "Cancel".
  - **Font scaling:** all session text follows the phone's text size. Only the GYMHOUND wordmark is fixed.
- [ ] **Step 4: Verify in the browser pane.** Use `npm run web` in the background and one browser tab.
  - Start Push A. The block shows 4 bench rows with an empty PREVIOUS column.
  - Type 135 and 8, then tick. The row turns done.
  - Change set 1 to Warmup. The labels read W, 1, 2, 3.
  - Add a set, then long-press it and remove it.
  - Write a note, go back to Train, and confirm Resume shows the name, time and "1 sets done". Resume, and the note and values are still there.
  - Clear a filled input to blank. No error hint appears.
- [ ] **Step 5: Commit.** `git commit -m "feat(session): exercise blocks, set rows with last result, ticks, set types, notes"`

---

### Task 15: Session — exercise picker, ⋯ menu, rest timer and bell

**Files:**
- Create: `app/pick-exercise.tsx`, `src/ui/session/ExerciseMenu.tsx`, `src/ui/session/RestBar.tsx`, `src/platform/restTimer/index.ts`, `src/platform/restTimer/expoGoNotification.ts`, `src/platform/restTimer/bell.ts`, `scripts/make-bells.mjs`, `assets/sounds/bell.wav`, `assets/sounds/chime.wav`, `assets/sounds/ding.wav`
- Modify: `src/state/sessionActions.ts`, `app/session.tsx`, `app/_layout.tsx` (register `pick-exercise` as `modal`), `app/(tabs)/settings.tsx` (Rest timer section), `package.json` / `package-lock.json`

**Interfaces:**
- Consumes:
  - `listExercises` (Task 9) and `searchExercises` (Task 4)
  - `addExerciseToWorkout`, `replaceExercise`, `removeExercise`, `moveExercise` (blocks), `toggleSupersetWithNext`, `setShowRpe` (Task 9, as built)
  - `setRestEndsAt` (Task 8)
  - `restRemainingSeconds`, `minus15`, `shouldStartRestAfterTick` (Task 4)
  - `formatRest` (Task 2)
  - `getSettings` (`restSeconds`, `restBell`, `restBellSound`) and `setSetting` (Task 12D)
  - `BellSound` (Task 12C)
- Produces:
  - `interface RestTimerSurface { start(endsAt: number, withSound: boolean): Promise<void>; update(endsAt: number, withSound: boolean): Promise<void>; cancel(): Promise<void> }`
  - `getRestTimerSurface(): RestTimerSurface`, which is a no-op on web and `expoGoNotification` elsewhere.
  - `playBell(sound: BellSound): Promise<void>` in `bell.ts`.
  - Session actions:
    - `restMinus15(db: Db, workoutId: string, endsAt: number): void`
    - `restSkip(db: Db, workoutId: string): void`
    - `restEnded(db: Db, workoutId: string): void`

- [ ] **Step 1: Build the picker.**
  - Route params: `mode: 'add' | 'replace'`, `workoutExerciseId?`.
  - A search input with the placeholder "Search exercises". Results come from `searchExercises(listExercises(db), q)`, and each row shows the name with the equipment in `textMuted`.
  - Tapping a row adds or replaces, calls `bumpData()`, and goes back.
  - With no results, it shows "No exercises match."
  - **"Add exercise"** sits at the bottom of the session as a secondary button.
- [ ] **Step 2: Build the ⋯ menu** as a `Sheet` with these items:
  - "Show RPE" or "Hide RPE".
  - "Superset with next" or "Remove from superset". This item is hidden on the last exercise.
  - "Reorder" opens a sheet listing the exercises with ↑ and ↓ buttons that call `moveExercise`. A superset moves as one block.
  - "Replace" opens the picker with `mode=replace`. The replacement shows its own note.
  - "Remove". If the exercise has done sets, a `ConfirmSheet` asks "Remove {name}?" with the body "Its sets will be deleted.", and the buttons **Remove** and **Keep**.
  - **Superset display:** members of a superset show a 3px `text`-coloured bar on their left edge.
- [ ] **Step 3: Make the bells.**
  - `scripts/make-bells.mjs` (Node, no dependencies) writes three 16-bit PCM, 44.1 kHz, mono WAV files to `assets/sounds/`. Each has a peak of −3 dBFS, no clipping, and an exponential decay to silence.

| file | sound | length |
|---|---|---|
| `bell.wav` | 880 Hz plus a 2,640 Hz partial at a third of the amplitude | 1.0 s |
| `chime.wav` | 1,047, 1,319 and 1,568 Hz, starting 80 ms apart | 1.1 s |
| `ding.wav` | 1,320 Hz | 0.5 s |

  - Run it once and commit both the script and the three files.
- [ ] **Step 4: Add the bell player.**
  - Install `expo-audio` with the shadow procedure (`npx expo install expo-audio` in `C:\Users\eddie\.gymhound`).
  - `bell.ts` sets the audio mode so the bell **ducks** other audio and never stops it (expo-audio's `interruptionMode: 'duckOthers'`), and plays even with the ringer switch on silent (`playsInSilentMode: true`).
  - It plays the chosen file through `expo-audio`. Bell failures are logged and swallowed.
  - On web, `playBell` uses the same files through `expo-audio`'s web support, or is a no-op if that fails.
- [ ] **Step 5: Add the rest surface (`expoGoNotification`).**
  - At module load, call `setNotificationHandler`, returning `{ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false }`, so the notification only appears when the app is in the background.
  - **`start(endsAt, withSound)`:**
    1. Check permissions. If the status is undetermined and it can ask again, request permission.
    2. If permission isn't granted, resolve and do nothing.
    3. Otherwise schedule `{ title: "Rest's up.", sound: withSound }` with `{ type: SchedulableTriggerInputTypes.DATE, date: endsAt }`, and keep the id.
       - In Expo Go `sound: true` is the system sound.
       - The chosen bell on the lock screen is phase 7.
       - The phone's own settings decide vibration.
  - **`update`:** cancel, then start.
  - **`cancel`:** cancel the kept id.
- [ ] **Step 6: Wire rest into `tick`.** After a successful tick:
  - If `shouldStartRestAfterTick(view.exercises, ex.id)`, set `endsAt = now + settings.restSeconds * 1000`, then call `setRestEndsAt` and `surface.start(endsAt, settings.restBell)`.
  - `restMinus15` computes `minus15(endsAt, now)`. If there is a value, call `setRestEndsAt` and `surface.update(…, settings.restBell)`. If it's null, call `restSkip`.
  - `restSkip` calls `setRestEndsAt(null)` and `surface.cancel()`.
- [ ] **Step 7: Build `RestBar`.**
  - It shows only when `restRemainingSeconds(restEndsAt, now)` is not null, re-rendering every 250ms.
  - It is fixed above the bottom safe area, in `surfaceRaised` with a top border.
  - Layout: **−15s** (secondary), the clock (`Num` 40px, `formatRest`), and **Skip** (quiet).
  - **When the remaining time crosses into null:**
    - Call `Haptics.notificationAsync(Success)`.
    - If `settings.restBell`, call `playBell(settings.restBellSound)`.
    - Then call `restEnded`, which sets null without cancelling, because the notification already fired.
  - The scroll content gets bottom padding while the bar is visible.
- [ ] **Step 8: Add a Rest timer section to Settings**, below Appearance.
  - **Bell at the end:** a switch bound to `restBell`, default on.
  - **Bell sound:** a segmented Bell / Chime / Ding control bound to `restBellSound`. Choosing one plays it once as a preview.
  - Both call `setSetting`, then `bumpData()`.
- [ ] **Step 9: Verify in the browser pane.** Use `npm run web` in the background and one browser tab.
  - Tick a set and the bar shows 2:00 counting down. −15s shows 1:44 or 1:45. Skip hides the bar.
  - Superset bench with OHP. Ticking bench starts no rest, and ticking OHP does.
  - Reorder (a superset moves as one block), Replace and Remove work.
  - Add "RDL" through the search.
  - Reload the page mid-rest and the bar resumes with the remaining time.
  - Settings shows the Rest timer section, and switching the sound previews it.
- [ ] **Step 10: Commit.** `git commit -m "feat(session): exercise picker, menu, supersets, rest timer with bell"`

---

### Task 16: Finish, discard, the finish summary, and the snapshot

**Files:**
- Create: `app/finish/[id].tsx`
- Modify: `app/session.tsx`, `src/state/sessionActions.ts`, `app/_layout.tsx` (register `finish/[id]` as `fullScreenModal`)

**Interfaces:**
- Consumes:
  - `countUntickedWithValues`, `finishWorkout` (which saves notes and clears rest), `NothingTickedError`, `discardWorkout` (Tasks 8 and 12D)
  - `getFinishSummary` (Task 10)
  - `takeSnapshotSafely` (Task 12F)
  - `formatElapsed`, `formatVolume`
- Produces, in `sessionActions.ts`:
  - `finish(db: Db, workoutId: string): 'finished' | 'nothing_ticked'`. On success, in this order:
    1. It cancels the rest surface.
    2. It calls `takeSnapshotSafely(db, Date.now())`. A false result never changes the outcome.
    3. It bumps.
  - `discard(db: Db, workoutId: string): void` cancels the rest surface and bumps. It never snapshots, and never moves Up next.

- [ ] **Step 1: Add Finish** (primary, at the bottom of the session).
  - If no set is ticked, show a `Sheet` with "Nothing is ticked yet." and the buttons **Keep logging** and **Discard workout**.
  - Else, if `countUntickedWithValues` is above 0, show a `ConfirmSheet` with "{n} sets aren't ticked. They won't count.", **Finish anyway** and **Keep logging**.
  - Then call `finish` and `router.replace('/finish/' + id)`.
- [ ] **Step 2: Add Discard** (quiet, under Finish).
  - A `ConfirmSheet` with "Discard this workout?", the body "Its sets will be deleted.", **Discard** and **Keep logging**.
  - Then call `discard` and `router.replace('/')`.
- [ ] **Step 3: Build the finish summary.** Full-screen, with no header, dock or footer.
  - "WORKOUT DONE" in Barlow Condensed 800, then the workout name.
  - Three figures: duration (`formatElapsed`), volume (`formatVolume`), and "{setCount} sets".
  - A primary **Done** button that calls `router.replace('/')`.
  - Phase 2 adds the next-time lines and phase 4 adds the PRs.
- [ ] **Step 4: Verify in the browser pane.** Use `npm run web` in the background and one browser tab.
  - Finish with nothing ticked shows "Nothing is ticked yet."
  - Finish with one ticked and one typed-but-unticked set shows "1 sets aren't ticked. They won't count."
  - Finish anyway goes to the summary. Done returns to Train, where:
    - Streak is 1 day.
    - This week shows the volume.
    - Up next has moved to Pull A.
  - **The previous result:**
    1. Set PPL back to Push A by finishing the rest of the rotation, or start empty and add Barbell bench press.
    2. Each row shows that set's last result as "135 × 8", and warmup rows match warmups only.
    3. A row beyond last time's count is empty.
  - **Up next guard:**
    1. Start this, then Discard. Up next is unchanged.
    2. Start empty, add an exercise, tick, then finish. Up next is unchanged.
  - Snapshots are skipped on web, and Settings still reads "Backups run in the phone app."
- [ ] **Step 5: Commit.** `git commit -m "feat(session): finish with snapshot, discard, finish summary"`

---

### Task 17: Phase 1 acceptance

**Files:** none. Commit only if fixes were needed.

- [ ] **Step 1: Automated checks.**
  - `npm test` and `npm run typecheck` → all pass, 0 errors.
  - `npx expo export --platform ios --output-dir <temp>` compiles offline. Delete the output.
- [ ] **Step 2: Web check** in the browser pane, at 390×844 and 320×844, light then dark, with screenshots of each.
  - **Header:** the hound sits on the left of red GYMHOUND on one line at both widths, on Train, History, Stats, Fuel and Settings.
  - **Dock:** the active tab is red.
  - **Footer:** "powered by" over the GruntHound wordmark is pinned to the bottom of Train, History, Stats and Settings. GRUNT is white on dark and black on light, and HOUND is blue. It is absent on Fuel, the session and the summary, and it never shows the hound.
  - **A premade day end to end:**
    - Set active, Start this, log, rest, finish, then Done.
    - On the next run of that day, every set row shows that set's last result beside the input.
  - **Recovery:** Resume works after a reload mid-workout. Discard works, and leaves Up next unchanged.
  - **Network:** read_network_requests during the run shows only `localhost:8081` (dev server) requests.
- [ ] **Step 3: iPhone check (owner).** The owner runs `npx expo start --offline` (or `--tunnel` if the LAN blocks it), opens it in Expo Go, and repeats Step 2. Also check:
  - **Large text:** with iPhone text size at its largest (Settings → Display & Brightness → Text Size), GYMHOUND stays the same size on one line beside the hound, while other text grows.
  - **Bell, app open:** with music playing, the rest bell plays and the music dips for a moment, then carries on.
  - **Bell, locked phone:** the "Rest's up." notification arrives with sound and vibration. In Expo Go this is the system sound, and it follows the ringer switch.
  - **Snapshot:** after a finish, Settings shows "Last snapshot: {time}", and **Share latest snapshot** opens the share sheet.
- [ ] **Step 4: Report.**
  - Send the owner the screenshots with SendUserFile.
  - List anything that failed with its output.
  - Phase 1 is done only when the owner confirms Step 3.

---

## Phase 1 patch (owner's device check, 2026-10-10)

Spec §18.2 is the requirement. Tasks 18–23 land on `phase-1` before the merge. Crashes 1–5 from the report were fixed first, in commit 295a0e1 (ruling R33).

### Task 18: Set controls — remove a set, add a warmup, several workouts a day

**Files:**
- Modify: `src/db/repositories/workoutEditRepo.ts`, `src/state/sessionActions.ts`, `src/ui/session/ExerciseBlock.tsx`
- Test: `src/db/repositories/workoutEditRepo.test.ts`, `src/db/repositories/workoutsRepo.test.ts`

**Interfaces:**
- Consumes: `removeSet`, `removeSetFrom`, `addSet`, `renumberSets` (Tasks 9 and 15); `matchPrevious` (Task 12C).
- Produces:
  - `addWarmupSet(db, workoutExerciseId): string` in `workoutEditRepo.ts`. It inserts an empty, undone `warmup` set right after the exercise's last leading warmup. That is position 0 when there are none, or the end when every set is a warmup. Later sets shift down one place. Returns the new id.
  - `addWarmupTo(db, workoutExerciseId): void` in `sessionActions.ts`, which calls it and bumps.

- [ ] **Step 1: Write the failing tests.**
  - `addWarmupSet`:
    - With sets [working, working], the order becomes [warmup, working, working].
    - With [warmup, working, working], it becomes [warmup, warmup, working, working], and the new set is at position 1.
    - With [warmup], it becomes [warmup, warmup].
    - With no sets, it becomes [warmup].
    - Positions stay 0..n−1 with no gaps, and the existing sets keep their values and done flags.
  - **Previous after a warmup:** an exercise last finished with [W 60×10, W 80×5, 1: 100×5]. The second warmup added today matches "80 × 5", and working set 1 still matches "100 × 5".
  - **Two workouts on one day** (`workoutsRepo.test.ts`):
    - Finish a workout, then start an empty one on the same `local_date`, tick a set and finish it. Both rows are `finished` with the same `local_date`.
    - This week's volume counts both workouts.
    - The streak counts that date once.
- [ ] **Step 2:** `npx jest src/db` → FAIL (`addWarmupSet` is not defined). The two-a-day test may already pass. If it does, keep it as a guard and say so in the report.
- [ ] **Step 3: Implement.**
  - `addWarmupSet` runs in one transaction.
  - **ExerciseBlock:**
    - The "Set type" sheet gets a destructive **Remove set** button below the four types. It calls `removeSetFrom`. Long-press keeps working.
    - The add row becomes two buttons side by side: **+ Add warmup** and **+ Add set**.
- [ ] **Step 4:** `npx jest src/db`, `npm test`, `npm run typecheck` → green.
- [ ] **Step 5: Commit.** `feat(session): remove a set from the set-type sheet; add warmup sets`

### Task 19: Plates and switching the unit — rules and repository

**Files:**
- Create: `src/domain/plates.ts`, `src/domain/plates.test.ts`, `src/db/repositories/unitsRepo.ts`, `src/db/repositories/unitsRepo.test.ts`
- Modify: `src/domain/units.ts`, `src/domain/units.test.ts`

**Interfaces:**
- Produces:
  - `loadPlates(target: number, bar: number, platesOwned: Record<string, number>): { perSide: number[]; total: number }` (spec 7.7).
    - The unit is implied by which plate set is passed.
    - `platesOwned` maps a plate weight (as a string) to the number of pairs owned.
    - `perSide` is heaviest first.
    - Per side, it takes the combination closest to (target − bar) ÷ 2 without going over. On a tie, it takes fewer plates.
    - The search is exact.
    - If target < bar, it returns `{ perSide: [], total: bar }`.
  - `nearestLoadable(value: number, bar: number, platesOwned: Record<string, number>): number`: the loadable total (bar + 2 × an achievable per-side sum) closest to `value` on either side. On a tie, it takes the lower. It returns `bar` when `value ≤ bar`.
  - `convertIncrement(v: number, from: WeightUnit, to: WeightUnit): number`: the gym convention, kg = lb ÷ 2 and lb = kg × 2. It returns `v` when the units match.
  - `roundToHalf(v: number): number`: the nearest 0.5.
  - `switchDisplayUnit(db, to: WeightUnit): void` in `unitsRepo.ts`, one transaction (spec 7.1):
    - It does nothing when `getSettings(db).unit === to`.
    - Each `routine_exercises` row with `next_weight` not null and `next_weight_unit` different from `to`:
      - Convert with `convertWeight`.
      - For a barbell exercise (`exercises.equipment = 'barbell'`), round with `nearestLoadable` using the new unit's bar (`barLb`/`barKg`) and plates (`platesLb`/`platesKg`). Round anything else with `roundToHalf`.
      - Set `next_weight_unit = to`.
    - Each row whose `increment_unit` differs from `to`: `increment = convertIncrement(...)`, `increment_unit = to`.
    - It sets the `unit` setting to `to`.
    - It never touches `workouts`, `workout_exercises` or `sets`, so history and the active workout are unchanged.

- [ ] **Step 1: Write the failing tests.** Default lb plates are `{45:4, 35:1, 25:1, 10:2, 5:1, 2.5:1}` with a 45 bar. Default kg plates are `{25:4, 20:1, 15:1, 10:1, 5:1, 2.5:1, 1.25:1}` with a 20 bar.
  - `loadPlates`:
    - 225 → perSide [45, 45], total 225.
    - 230 → [45, 45, 2.5], total 230.
    - 232 → total 230 (never over).
    - 40 → { perSide: [], total: 45 }.
    - 45 → { perSide: [], total: 45 }.
    - With plates {10:1, 5:2}, bar 45 and target 65 → [10], not [5, 5] (fewer plates on a tie).
    - Never uses more pairs than owned: 405 → [45, 45, 45, 45], and 500 → still four 45s plus the best fill below.
  - `nearestLoadable`:
    - 227 → 225.
    - 227.5 → 225 (tie goes lower).
    - 228 → 230.
    - kg 102.06 → 102.5 (20 + 2 × 41.25).
    - 10 → 45.
  - `convertIncrement`:
    - 5 lb → 2.5 kg.
    - 2.5 kg → 5 lb.
    - 10 lb → 5 kg.
    - Same unit returns the input.
  - `roundToHalf`: 22.68 → 22.5, 22.75 → 23.
  - `switchDisplayUnit` (createTestDb, seed, settings in lb):
    - A barbell row with next 225 lb becomes 102.5 kg.
    - A dumbbell row with next 50 lb becomes 22.5 kg.
    - A null next_weight stays null.
    - Increments of 5 lb become 2.5 kg.
    - `getSettings(db).unit === 'kg'`.
    - Switching back gives lb, with increment 5.
    - An active workout's `workout_exercises` rows and its sets are identical before and after.
    - A finished workout's sets are unchanged.
    - Calling with the current unit changes nothing.
- [ ] **Step 2:** `npx jest src/domain/plates src/domain/units src/db/repositories/unitsRepo` → FAIL.
- [ ] **Step 3: Implement.**
  - Exact search: expand pairs into a list of plates and walk subsets with memoised reachable sums. Ten or so plates is tiny.
  - Compare sums in integer hundredths, so 2.5 and 1.25 add exactly.
- [ ] **Step 4:** targeted tests, `npm test`, `npm run typecheck` → green.
- [ ] **Step 5: Commit.** `feat(domain): plates, nearest loadable weight, and switching the display unit`

**Amendment (ruling R36, 2026-10-10, after review).** Spec 7.1 now converts a plan when it is used, not at the switch.
- `switchDisplayUnit(db, to)` only sets the `unit` setting. Routine rows are never rewritten.
- New domain function in `src/domain/plates.ts`: `planInUnit(weight: number, from: WeightUnit, to: WeightUnit, isBarbell: boolean, bar: number, platesOwned: Record<string, number>): number`.
  - When the units match, it returns `weight` unchanged.
  - For a barbell, it converts, then applies `nearestLoadable`. Above the heaviest loadable total, it rounds to `bar + step × round((v − bar) / step)` instead, where `step` = 2 × the smallest owned plate.
  - Anything else is converted, then `roundToHalf`.
- `startWorkoutFromDay` snapshots the plan in the display unit:
  - `plannedWeight = planInUnit(nextWeight, nextWeightUnit ?? unit, unit, …)` and `plannedUnit = unit`.
  - `ruleIncrement = convertIncrement(...)` and `ruleIncrementUnit = unit`.
- Tests:
  - lb → kg → lb round trip: a 135 lb barbell plan starts at 60 kg in kg, at 135 lb back in lb, and the stored row is unchanged.
  - A non-barbell 15 lb plan becomes 7 kg, not the bar.
  - A barbell 300 kg plan in lb becomes 660 (step 5 above the 45 bar), not 580.

### Task 20: Settings units and bar; the plate calculator

**Files:**
- Create: `src/ui/BarPicker.tsx`, `src/ui/session/PlateSheet.tsx`
- Modify: `app/(tabs)/settings.tsx`, `src/ui/session/ExerciseMenu.tsx`, `src/domain/sessionMenu.ts` (+ test)

**Interfaces:**
- Consumes: `switchDisplayUnit`, `loadPlates` (Task 19); `getSettings`, `setSetting`; `bumpData`; `WorkoutExerciseView.equipment`.
- Produces:
  - `BAR_PRESETS: Record<WeightUnit, { label: string; weight: number }[]>` in `src/ui/BarPicker.tsx`:
    - lb: Standard 45, Women's 35, Technique 15.
    - kg: Standard 20, Women's 15, Technique 5.
  - `<BarPicker />`:
    - It shows the presets for the display unit plus **Custom**.
    - Custom takes a number above 0, up to 100 lb or 45 kg. It accepts a comma or a dot. An invalid entry is rejected inline.
    - It writes `barLb` or `barKg`, then bumps.
  - `plateTarget(ex: WorkoutExerciseView, unit: WeightUnit): number | null` in `sessionMenu.ts`. It returns the weight to load:
    - the first undone working set's own value, converted to `unit`;
    - otherwise the override, then the planned weight;
    - otherwise the newest done working set's weight;
    - otherwise null.

- [ ] **Step 1: Write the failing tests.** `plateTarget` covers each fallback step and converts kg values to lb.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
  - **Settings**, before Rest timer:
    - **Units:** Weight (lb or kg) as a two-choice control that calls `switchDisplayUnit` then bumps. Distance (mi or km) as a two-choice control that writes `distanceUnit`.
    - **Bar:** `<BarPicker />` with the line "Used by the plate calculator."
  - **The ⋯ menu** shows **Plate calculator** only when `ex.equipment === 'barbell'`. It opens `PlateSheet` after `afterSheetCloses`.
  - **PlateSheet:**
    - A weight field prefilled from `plateTarget`.
    - The bar line, for example "Bar 45 lb", with `<BarPicker />` under it, so the bar can be changed here too.
    - "Per side: 45 · 25 · 2.5".
    - "Loads 230 lb" whenever the total differs from the target.
    - "Below the bar: just the bar." when target < bar.
    - It uses the display unit's plates from Settings.
- [ ] **Step 4:** tests and typecheck → green. Check in the browser pane at 390 wide, in light and dark:
  - Switch lb ↔ kg and the session's weight column header follows.
  - Change the bar.
  - Open the plate calculator on Barbell bench press.
  - It is absent on Dumbbell curl.
- [ ] **Step 5: Commit.** `feat(settings): units and bar; plate calculator in the exercise menu`

### Task 21: Rest per exercise, and the countdown under the set

**Files:**
- Modify: `src/db/schema.ts`, `src/db/repositories/workoutViewsRepo.ts`, `src/state/sessionActions.ts`, `src/domain/rest.ts`, `src/ui/session/ExerciseMenu.tsx`, `src/ui/session/ExerciseBlock.tsx`, `app/session.tsx`
- Create: `src/db/repositories/exercisePrefsRepo.ts` (+ test), `src/db/migrations/0002_*` (generated), `src/ui/session/RestInline.tsx`

**Interfaces:**
- Produces:
  - **Table `exercise_prefs`:**
    - `exercise_id` text PK, references `exercises.id`.
    - `rest_seconds` integer null. A missing row or null means "use Settings", and 0 means Off.
    - `updated_at` integer not null.
  - `getRestSeconds(db, exerciseId): number | null` and `setRestSeconds(db, exerciseId, seconds: number | null, now: number): void` (an upsert).
  - `WorkoutExerciseView.restSeconds: number | null` (the exercise's pref).
  - `SetView.completedAt: number | null`.
  - `REST_CHOICES = [0, 30, 45, 60, 90, 120, 150, 180, 240, 300]` in `src/domain/rest.ts`.
  - `restLengthFor(exerciseRest: number | null, settingsRest: number): number`, which returns `exerciseRest ?? settingsRest`.
  - `restAnchorSetId(exercises: { sets: { id: string; done: boolean; completedAt: number | null }[] }[]): string | null`: the done set with the latest `completedAt`. Ties go to the later set in workout order. Null when nothing is done.
  - `tick` uses `restLengthFor(ex.restSeconds, settings.restSeconds)`, so 0 means no rest.

- [ ] **Step 1: Write the failing tests.**
  - `0002` creates `exercise_prefs`.
  - `setRestSeconds` then `getRestSeconds` round-trips: 90 → 90, then null → null, then 0 → 0.
  - The view carries `restSeconds` and `completedAt`.
  - `tick` with the bench pref at 90 → `rest_ends_at = now + 90 s`.
  - With the pref at 0 → no rest.
  - With no pref → `settings.restSeconds`.
  - A superset round's last member uses its own pref.
  - `restAnchorSetId`: latest wins, ties go to the later set, and it is null when nothing is done.
  - The pref follows the exercise: set it, start a different routine day containing that exercise, and the view shows the pref.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
  - Schema, then `npm run db:generate`, which adds `0002_*.sql`, the meta files and `migrations.js`.
  - **⋯ menu:** **Rest time · {current}**. {current} reads "Default (2:00)", "Off" or "1:30". It opens a sheet listing **Default (m:ss)**, then each `REST_CHOICES` entry, with 0 shown as **Off**. The current choice is highlighted. Choosing one calls `setRestSeconds` then bumps. A running rest is not changed.
  - **RestInline**, under the anchor set's row, only while the rest is running:
    - "Rest 1:45", **−15s** and **Skip**, wired to `restMinus15` and `restSkip`.
    - The session screen passes `restEndsAt`, `now` and the anchor id to the blocks.
    - The bottom `RestBar` stays as it is.
- [ ] **Step 4:** tests and typecheck → green. Browser check:
  - Set bench rest to 1:30, tick, and the countdown appears under that set from 1:30.
  - −15s and Skip work from both places.
  - With Off, ticking starts no rest.
- [ ] **Step 5: Commit.** `feat(session): rest time per exercise; the countdown shows under the set that started it`

**Amendment (ruling R38, 2026-10-10, after review).** "The latest ticked set" is not "the set that started the rest" (spec §18.2). It breaks in three cases: a tick on an Off exercise, a tick on a superset member that is not last in its round, and an untick.
- Migration 0003 adds `workouts.rest_set_id` (text, nullable). It is additive, and 0002 is left as it is.
- `rest_set_id` is written with `rest_ends_at`:
  - A tick that starts a rest sets it to that set's id.
  - −15s keeps it.
  - Skip, `clearRestEndsAtIf` and `finishWorkout` clear it.
  - A tick whose `RestChange` is `none` leaves both alone.
- `ActiveWorkoutView.restSetId` carries it, and `RestInline` shows under that set's row.
- `restAnchorSetId` is removed.
- Tests:
  - A tick on an Off exercise while bench's rest runs leaves the anchor on bench.
  - A tick on a mid-superset member does the same.
  - Unticking the anchor set keeps the anchor id.
  - Skip, the end of the rest and finish clear it.

### Task 22: Back on Routines; music buttons

**Files:**
- Modify: `app/(tabs)/routines/index.tsx`, `app/session.tsx`
- Create: `src/ui/session/MusicSheet.tsx`, `src/platform/music.ts` (+ test)

**Interfaces:**
- Produces:
  - `MUSIC_APPS`: `{ id: 'apple-music' | 'spotify' | 'audible'; label: string; url: string; platforms: ('ios' | 'android')[] }[]`.
    - Apple Music: `music://`, iOS only.
    - Spotify: `spotify://`, iOS and Android.
    - Audible: `audible://`, iOS and Android.
  - `musicAppsFor(os: string)` filters it by platform. It returns `[]` for web.
  - `openMusicApp(app): Promise<'opened' | 'missing'>` calls `Linking.openURL`. A rejection means 'missing'.

- [ ] **Step 1: Write the failing tests.**
  - `musicAppsFor('ios')` lists all three.
  - `musicAppsFor('android')` lists Spotify and Audible.
  - `musicAppsFor('web')` is empty.
  - `openMusicApp` maps a resolved `Linking.openURL` to 'opened' and a rejected one to 'missing' (mock `Linking`).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
  - **Routines:** a back control at the top, a chevron plus "Train" with `accessibilityLabel="Back to Train"`. It calls `router.back()` when it can go back, else `router.navigate('/')`.
  - **Session header:** a music-notes icon button with `accessibilityLabel="Music"`, shown only when `musicAppsFor(Platform.OS)` is not empty.
    - It opens `MusicSheet`, with one button per app: "Open Apple Music", "Open Spotify", "Open Audible".
    - On 'missing', it shows "{label} isn't on this phone." inline.
    - Leaving for the music app relies on the existing flush on AppState leaving active (R32).
- [ ] **Step 4:** tests and typecheck → green. Browser check:
  - Routines → Back to Train lands on Train.
  - No music button on web.
- [ ] **Step 5: Commit.** `feat: back to Train from Routines; open-app music buttons in the session`

### Task 23: Patch acceptance

- [ ] **Step 1:**
  - `npm test` and `npm run typecheck` → green.
  - `npx expo export --platform ios --output-dir <temp>` compiles. Delete the output.
- [ ] **Step 2:** Web walkthrough at 390×844, light and dark, with screenshots:
  - Remove a set from the sheet.
  - + Add warmup.
  - Two workouts in one day.
  - lb ↔ kg.
  - Bar change.
  - The plate calculator.
  - Rest time per exercise, and the countdown under the set.
  - Back on Routines.
  - The crash paths from the report (set active ×2, Start this, tick, −15s, Show RPE).
- [ ] **Step 3: Owner, in Expo Go on the iPhone:**
  - Everything in Step 2.
  - The music buttons open Apple Music, Spotify and Audible.
  - The Task 17 Step 3 list.
- [ ] **Step 4:** Report to the owner. The merge waits for their OK.

## Owner device check fixes (2026-10-10)

The owner's iPhone check gave 33 pass, 2 fail and 4 skipped. The fails were "keyboard stays up unless you tap a blank spot; need an option to close the keyboard", and "Snapshot after a finish: no share option". The second is diagnosed separately before its fix.

### Task 24: Closing the keyboard

**Root cause.**
- iOS `decimal-pad` and `number-pad` have no return key.
- The session ScrollView uses `keyboardShouldPersistTaps="handled"`, so tapping a control (tick, set number, ⋯) leaves the keyboard up.
- Only a tap on a blank spot closes it.
- The Sheet's dismiss-on-open effect (F1) is the only programmatic dismiss.

**Files:**
- Create: `src/ui/KeyboardDoneBar.tsx` (+ test).
- Modify:
  - `src/ui/session/SetRow.tsx`;
  - `src/ui/session/ExerciseBlock.tsx`;
  - `app/session.tsx`;
  - `src/ui/session/PlateSheet.tsx`;
  - `src/ui/BarPicker.tsx`;
  - the ⋯ and music openers;
  - `src/state/sessionActions.ts` only if tick needs it.

**Interfaces:**
- `KEYBOARD_DONE_ID = 'gymhound-keyboard-done'`.
- `<KeyboardDoneBar />` renders, on iOS only, an `InputAccessoryView` with that `nativeID`. It holds one right-aligned **Done** button (`accessibilityLabel="Close keyboard"`) that calls `Keyboard.dismiss()`. Elsewhere it renders null.
- Every numeric `TextInput` sets `inputAccessoryViewID={KEYBOARD_DONE_ID}` and `returnKeyType="done"`:
  - set weight, reps, RPE, duration and distance;
  - the plate calculator's weight;
  - the custom bar.

  Android gets its own Done key from `returnKeyType`, and submit blurs.
- The session ScrollView sets `keyboardDismissMode="on-drag"`.

**Behaviour.**
- **Ticking a set closes the keyboard:** after the row reads its typed values (owner note: "keyboard should disappear after selecting the checkmark"). The value typed in that field is kept.
- **Controls that open a sheet close the keyboard first:**
  - tapping a set number;
  - long-pressing a set;
  - the ⋯ button;
  - the Music button;
  - Add exercise.

  They call `Keyboard.dismiss()` before opening, in addition to the Sheet's own effect. The draft commits on blur as now.
- **Done:** tapping Done keeps the typed value (blur commit) and the keyboard goes away.

**Tests.**
- KeyboardDoneBar renders an InputAccessoryView with the id on iOS, and null on Android and web. Its button calls `Keyboard.dismiss`.
- The SetRow numeric inputs carry the id and `returnKeyType="done"`.
- Tick calls `Keyboard.dismiss`, and the typed weight is the one stored.
- The set-number and ⋯ handlers call `Keyboard.dismiss` before opening.
- The session ScrollView has `keyboardDismissMode="on-drag"`.

**Commit.** `fix(session): a Done key above the number pad; tick, scroll and sheet openers close the keyboard`
