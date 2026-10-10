# GymHound Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the GymHound shell (header, hound mark, both themes, dock, footer), the Train screen, and a session that logs offline from a premade routine day or from empty, then finishes, discards, or resumes.

**Architecture:** Expo Router app in Expo Go. SQLite (`expo-sqlite`) through Drizzle is the source of truth. Rules live in pure TypeScript under `src/domain`, and repositories under `src/db/repositories`. Both are tested with Jest in Node, with repositories running on `better-sqlite3` against the same migrations. Screens read through `useDbQuery`, which re-runs when a zustand `dataVersion` counter is bumped after each write. Session actions write to SQLite first, then bump. This is how the spec's write-through session store (§5) is realized.

**Tech Stack:** Expo (the SDK that App Store Expo Go runs), Expo Router, expo-sqlite, drizzle-orm / drizzle-kit, zustand, react-native-svg, @expo-google-fonts (Barlow Condensed, Inter), expo-notifications, expo-haptics, expo-localization, expo-crypto, Jest + jest-expo, better-sqlite3.

**Spec:** `docs/superpowers/specs/2026-10-09-gymhound-design.md`. Read §5, §6, §7.1, §7.8, §7.9, §8.1–§8.4, §12 and §15 before starting.

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
- **Wordmark:** "GYMHOUND", Barlow Condensed ExtraBold, uppercase, letterSpacing −0.5, one line.
- **Type:**
  - Display: Barlow Condensed 600, 700 and 800.
  - Body: Inter 400, 500 and 600.
  - Numbers: `fontVariant: ['tabular-nums']`.
- **Footer:** the exact text "Powered by GruntHound LLC". It appears on Train, History, Stats and Settings only, never on Fuel, the session, or the finish summary.
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
  - When `useWindowDimensions().width < 360`, the wordmark sits under the mark. Otherwise it sits beside it.
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
  - At width 340 the wordmark stacks under the mark.
  - Take screenshots.
- [ ] **Step 7: Owner checkpoint (controller).**
  - Send the owner the light and dark header screenshots with SendUserFile.
  - **Wait for approval of how the mark sits in the header.** Adjust spacing or the dark outline, never the art, and resend until they approve.
- [ ] **Step 8: Commit.** `git commit -m "feat(ui): hound mark, header, dock, footer, settings appearance"`

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
     - One row per exercise: name, "{setCount}×{repMin}–{repMax}" ("{setCount}×{repMin}" when min = max, and "s" appended for timed), and today's load (`formatWeight(nextWeight)` or "pick a weight").
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

### Task 14: Session screen — blocks, set rows, ticks, set types, notes

**Files:**
- Create: `app/session.tsx`, `src/ui/session/ExerciseBlock.tsx`, `src/ui/session/SetRow.tsx`
- Modify: `src/state/sessionActions.ts`

**Interfaces:**
- Consumes:
  - `getActiveWorkoutView` and `ActiveWorkoutView` (Task 8)
  - `tickSet`, `untickSet` (Task 8)
  - `updateSet`, `addSet`, `removeSet`, `setExerciseNote` (Task 9)
  - `setLabels`, `placeholdersFor`, `resolveTick`, `formatPrevious` (Task 4)
  - `parseDecimal`, `parseReps`, `parseDuration`, `parseRpe` (Task 2)
- Produces, in `sessionActions.ts`:
  - `commitSetField(db: Db, setId: string, patch: SetPatch): void`
  - `tick(db: Db, ex: WorkoutExerciseView, set: SetView, entered: TickValues): boolean` returns false when `resolveTick` returns null.
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
  - The note as an inline `TextInput` with the placeholder "Add a note for next time", saved on blur.
  - **Set table header:** SET, PREVIOUS, the load column, REPS, ✓, plus an RPE column when `showRpe`.
    - The load column reads `unit.toUpperCase()` for weighted, "+LB" or "+KG" for bodyweight plus, "−LB" or "−KG" for assisted, and "TIME" for timed.
    - Distance and time exercises show "DIST" and "TIME".
  - "+ Add set" at the bottom.
- [ ] **Step 3: Build `SetRow`.**
  - **Columns:**
    - The label from `setLabels`. Tapping it opens a `Sheet` with Working, Warmup, Drop and Failure, which calls `commitSetField({ setType })`.
    - Previous, from `formatPrevious` (empty when there is none).
    - The load input. Its value is `set.weight ?? target`, where target is `overrideWeight ?? plannedWeight`, shown in normal text. When both are null, the input shows `placeholders.weight` in `textMuted`.
    - The reps input, whose placeholder is `placeholders.reps`, in `textMuted`.
    - The tick.
  - **Inputs by logging type:**
    - weighted, bodyweight plus and assisted: load and reps.
    - timed: one TIME input, parsed with `parseDuration`, with the placeholder `placeholders.durationS`.
    - distance and time: DIST (`parseDecimal`, stored with `settings.distanceUnit`) and TIME.
    - RPE, when shown: parsed with `parseRpe`.
  - Inputs keep local text and parse on blur. Invalid text gets a `textMuted` underline (red is reserved) with the hint "Check this number", and the tick is disabled. A valid value is committed with `commitSetField`.
  - **The tick** runs `tick()`. A done row gets the `surfaceRaised` background and a filled check in `text`, plus a light haptic (`Haptics.impactAsync(Light)`). Tapping a done tick unticks.
  - **Long-press a row** to open a `Sheet` with "Remove set" and "Cancel".
  - **Units:** weights are written in `settings.unit`. When the target is in a different unit, convert it for display with `convertWeight`.
- [ ] **Step 4: Verify in the browser pane.**
  - Start Push A. The block shows 4 bench rows.
  - Type 135 and 8, then tick. The row turns done.
  - Change set 1 to Warmup. The labels read W, 1, 2, 3.
  - Add a set, then long-press it and remove it.
  - Write a note, go back to Train, and confirm Resume shows the name, time and "1 sets done".
  - Resume, and the note and values are still there.
- [ ] **Step 5: Commit.** `git commit -m "feat(session): exercise blocks, set rows, ticks, set types, notes"`

---

### Task 15: Session — exercise picker, ⋯ menu, rest timer

**Files:**
- Create: `app/pick-exercise.tsx`, `src/ui/session/ExerciseMenu.tsx`, `src/ui/session/RestBar.tsx`, `src/platform/restTimer/index.ts`, `src/platform/restTimer/expoGoNotification.ts`
- Modify: `src/state/sessionActions.ts`, `app/session.tsx`

**Interfaces:**
- Consumes:
  - `listExercises` (Task 9) and `searchExercises` (Task 4)
  - `addExerciseToWorkout`, `replaceExercise`, `removeExercise`, `moveExercise`, `toggleSupersetWithNext`, `setShowRpe` (Task 9)
  - `setRestEndsAt` (Task 8)
  - `restRemainingSeconds`, `minus15`, `shouldStartRestAfterTick` (Task 4)
  - `formatRest` (Task 2)
- Produces:
  - `interface RestTimerSurface { start(endsAt: number): Promise<void>; update(endsAt: number): Promise<void>; cancel(): Promise<void> }`
  - `getRestTimerSurface(): RestTimerSurface` returns a no-op on web and `expoGoNotification` elsewhere.
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
  - "Reorder" opens a sheet listing the exercises with ↑ and ↓ buttons that call `moveExercise`.
  - "Replace" opens the picker with `mode=replace`.
  - "Remove". If the exercise has done sets, a `ConfirmSheet` asks "Remove {name}?" with the body "Its sets will be deleted.", and the buttons **Remove** and **Keep**.
  - **Superset display:** members of a superset show a 3px `text`-coloured bar on their left edge.
- [ ] **Step 3: Add the rest surface (`expoGoNotification`).**
  - At module load, call `setNotificationHandler`, returning `{ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false }`, so the notification only appears when the app is in the background.
  - **`start`:**
    1. Check permissions. If the status is undetermined and it can ask again, request permission.
    2. If permission isn't granted, resolve and do nothing.
    3. Otherwise schedule `{ title: "Rest's up.", sound: true }` with `{ type: SchedulableTriggerInputTypes.DATE, date: endsAt }`, and keep the id.
  - **`update`:** cancel, then start.
  - **`cancel`:** cancel the kept id.
- [ ] **Step 4: Wire rest into `tick`.** After a successful tick:
  - If `shouldStartRestAfterTick(view.exercises, ex.id)`, set `endsAt = now + settings.restSeconds * 1000`, then call `setRestEndsAt` and `surface.start(endsAt)`.
  - `restMinus15` computes `minus15(endsAt, now)`. If there is a value, call `setRestEndsAt` and `surface.update`. If it's null, call `restSkip`.
  - `restSkip` calls `setRestEndsAt(null)` and `surface.cancel()`.
- [ ] **Step 5: Build `RestBar`.**
  - It shows only when `restRemainingSeconds(restEndsAt, now)` is not null, re-rendering every 250ms.
  - It is fixed above the bottom safe area, in `surfaceRaised` with a top border.
  - Layout: **−15s** (secondary), the clock (`Num` 40px, `formatRest`), and **Skip** (quiet).
  - When the remaining time crosses into null, call `Haptics.notificationAsync(Success)` and `restEnded` (which sets null without cancelling, because the notification already fired).
  - The scroll content gets bottom padding while the bar is visible.
- [ ] **Step 6: Verify in the browser pane.**
  - Tick a set and the bar shows 2:00 counting down. −15s shows 1:44 or 1:45. Skip hides the bar.
  - Superset bench with OHP. Ticking bench starts no rest, and ticking OHP does.
  - Reorder, Replace and Remove work.
  - Add "RDL" through the search.
  - Reload the page mid-rest and the bar resumes with the remaining time.
- [ ] **Step 7: Commit.** `git commit -m "feat(session): exercise picker, exercise menu, supersets, rest timer"`

---

### Task 16: Finish, discard, and the finish summary

**Files:**
- Create: `app/finish/[id].tsx`
- Modify: `app/session.tsx`, `src/state/sessionActions.ts`

**Interfaces:**
- Consumes: `countUntickedWithValues`, `finishWorkout`, `NothingTickedError`, `discardWorkout` (Task 8); `getFinishSummary` (Task 10); `formatElapsed`, `formatVolume`.
- Produces, in `sessionActions.ts`:
  - `finish(db: Db, workoutId: string): 'finished' | 'nothing_ticked'` cancels the rest surface and bumps on success.
  - `discard(db: Db, workoutId: string): void` cancels the rest surface and bumps.

- [ ] **Step 1: Add Finish** (primary, at the bottom of the session).
  - If no set is ticked, show a `Sheet` with "Nothing is ticked yet." and the buttons **Keep logging** and **Discard workout**. This covers Review Focus 4.
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
- [ ] **Step 4: Verify in the browser pane.**
  - Finish with nothing ticked shows "Nothing is ticked yet.".
  - Finish with one ticked and one typed-but-unticked set shows "1 sets aren't ticked. They won't count.".
  - Finish anyway goes to the summary. Done returns to Train, where:
    - Streak is 1 day.
    - This week shows the volume.
    - Up next has moved to Pull A.
  - Start empty, then add Barbell bench press. The previous column shows the sets just logged.
  - Discard returns to Train with no Resume card.
- [ ] **Step 5: Commit.** `git commit -m "feat(session): finish, discard, finish summary"`

---

### Task 17: Phase 1 acceptance

**Files:** none. Commit only if fixes were needed.

- [ ] **Step 1: Automated checks.** `npm test` and `npm run typecheck` → all pass, 0 errors.
- [ ] **Step 2: Web check (browser pane, 390×844, light then dark), screenshots of each.**
  - Hound mark and red GYMHOUND at the top of Train, History, Stats, Fuel and Settings.
  - The dock's active tab is red.
  - "Powered by GruntHound LLC" appears at the bottom of Train, History, Stats and Settings. It is absent on Fuel, the session and the summary.
  - Run a premade day end to end: set active, Start this, log, see previous on the second run, rest, finish, then Done.
  - Resume after a reload mid-workout.
  - Discard.
  - read_network_requests during the run shows only `localhost:8081` (dev server) requests.
- [ ] **Step 3: iPhone check (owner).**
  - The owner runs `npx expo start --offline` (or `--tunnel` if the LAN blocks it), opens it in Expo Go, and repeats Step 2.
  - The owner also confirms the rest notification arrives with the app in the background.
- [ ] **Step 4: Report.**
  - Send the owner the screenshots with SendUserFile.
  - List anything that failed with its output.
  - Phase 1 is done only when the owner confirms Step 3.
