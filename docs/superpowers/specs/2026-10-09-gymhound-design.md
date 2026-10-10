# GymHound — Design Spec

Date: 2026-10-09
Status: Draft for review
Owner: GruntHound LLC

## 1. Summary

GymHound is a local-first gym log for iOS and Android, built once in Expo / React Native. It works fully offline with no account, no cloud, no social feed, no AI coach, and no ads.

It is a fast, Strong-style log with one addition: the **day mark**. One tap on the session (Normal, Rough sleep, Short on food, Pain, Cutting) decides whether next time's weight goes up or holds, and the chart says why.

Free covers everything except two things. **GymHound Pro** adds unlimited user routines and **Fuel** (calories and protein).

## 2. Goals and non-goals

Goals
- Log a set in a couple of taps, with last time visible on the row.
- Next time's weight is already written when a workout finishes, and it is honest about marked days.
- Opens and works with no network and no account.
- One codebase, light and dark, with the GruntHound hound head and a red GYMHOUND wordmark on every main screen.

Non-goals for v1
- Accounts, cloud sync, sharing, a social feed, AI coaching, ads.
- Barcode scanning (a seam is left for it, see 8.10).
- Automatic deloads. A stall is a chart label only.
- Apple Watch, widgets other than the rest timer, a calendar view of history.

## 3. Decisions made in brainstorming

| Topic | Decision |
|---|---|
| Stack | Expo Router, `expo-sqlite` through Drizzle ORM, rules in plain TypeScript (approach A) |
| First test device | The owner's iPhone, in Expo Go |
| Apple Developer account | Not yet. Phases 1–6 run in Expo Go. Native features wait for phase 7 |
| Hound head | The dog from the GruntHound logo, cut from the owner's logo art. Never redrawn or replaced |
| Routine | A whole program that holds days. **Up next** is the next day of the active routine |
| Free routine limit | One user-created or duplicated routine, with any number of days |
| Progression | Double progression, gated by the day mark (7.3) |
| Stall | Three Normal sessions in a row at the same working weight without a raise. Marked sessions are skipped. Label only |
| "Short on food" offer | Fuel unlocked, food logged today, and protein behind pace for the time of day (6am–10pm). Once per session |
| Streak | Calendar days since the current run began. Survives 2 rest days in a row and breaks on the third |
| Estimated 1RM | Epley, only sets of 12 reps or fewer |
| First session of an exercise | No PR marks |
| Library size | About 250 bundled exercises. Custom exercises cover the gaps |
| Debug unlock | Expo Go and the owner's debug or TestFlight builds only. Never in a store release |
| Pro lapses | Nothing is deleted. Extra routines stay visible and runnable. Fuel data is kept and locks again. No new routines until Pro is back |
| History edits | Editing or deleting a past workout re-runs the rule and the PR check. It never changes a workout that is in progress |
| Charts | Hand-drawn SVG, no chart library |

## 4. Platform and environment

- **Development machine:** Windows 11, Node.js 24 LTS, git. iOS cannot be built locally.
- **Expo SDK:** the version supported by the App Store build of Expo Go at the time of scaffolding, because Expo Go only runs the current SDK.
- **Phases 1–6** run in Expo Go on the owner's iPhone. The PC and phone share Wi-Fi, with `--tunnel` as a fallback.
- **Phase 7** runs once the Apple Developer account exists: EAS development builds, the Live Activity, the Android ongoing notification, and live RevenueCat products.
- **Web build:** used only so Claude can check layout and themes in the browser pane. It is not a shipped target. `expo-sqlite` on web needs WASM and the COOP/COEP headers, which are set in `metro.config.js`.
- **OneDrive:** the project lives in `Documents\GymHound` inside OneDrive. `node_modules` is a junction to `%LOCALAPPDATA%\GymHound\node_modules`, so installed packages do not sync. `.expo`, `dist`, `web-build`, `ios` and `android` are git-ignored, and none of them is committed.

## 5. Architecture

```
app/            Expo Router screens (UI only)
src/domain/     Pure TypeScript rules. No React, no database
src/db/         Drizzle schema, SQL migrations, repositories
src/seed/       Bundled exercises, premade routines, foods
src/platform/   Interfaces with Expo Go fallbacks: entitlements, rest timer surface
src/state/      Zustand store for the active session (write-through to SQLite)
src/ui/         Theme tokens, fonts, Header, HoundMark, Dock, Footer, shared components
```

- **Source of truth:** SQLite. Screens read through repositories.
- **Active session:** held in a Zustand store for instant input. Every action writes to SQLite first and then updates the store, so a crash or force-quit loses nothing and reopening shows Resume.
- **Repositories:** typed against Drizzle's synchronous SQLite database type, so the same code runs on `expo-sqlite` in the app and on `better-sqlite3` in Node tests.
- **Domain functions:** take plain data and return plain data. Repositories load the inputs and save the outputs.
- **Network:** the only network call anywhere is RevenueCat's entitlement check (phase 7 live, phase 5 code). It never blocks the UI.

Libraries
- **App:** `expo-router`, `expo-sqlite`, `drizzle-orm`, `zustand`, `react-native-svg`, `@expo-google-fonts/barlow-condensed`, `@expo-google-fonts/inter`, `expo-notifications`, `expo-haptics`, `expo-localization`, `expo-file-system`, `expo-sharing`, `expo-crypto`, `react-native-purchases`.
- **Development:** `drizzle-kit`, `babel-plugin-inline-import` (SQL migrations), `jest`, `jest-expo`, `better-sqlite3`, `typescript`.
- **Phase 7:** `expo-dev-client`, `@notifee/react-native`, and a Live Activity module. The phase 7 plan chooses the module from what supports the Expo SDK at that time.

## 6. Data model

All IDs are text. Bundled rows use stable slugs (`barbell-back-squat`, `premade-ppl-6`). User rows use `crypto.randomUUID()`. Timestamps are epoch milliseconds. `local_date` is `YYYY-MM-DD` in the phone's time zone at the moment the workout or entry started. Booleans are integers 0/1. JSON columns hold arrays or objects as text.

### exercises
| column | type | notes |
|---|---|---|
| id | text PK | slug for bundled, UUID for custom |
| name | text | |
| aliases | json | e.g. `["RDL"]`, `["OHP","overhead press"]` |
| primary_muscles | json | values from the muscle list in 10.1 |
| secondary_muscles | json | |
| equipment | text | barbell, dumbbell, cable, machine, kettlebell, bodyweight |
| pattern | text | squat, hinge, lunge, horizontal_push, vertical_push, horizontal_pull, vertical_pull, carry, core, isolation |
| logging_type | text | weighted, bodyweight_plus, assisted, timed, distance_time |
| is_custom | int | |
| archived | int | custom exercises used in history are archived, never deleted |
| created_at | int | |

### exercise_notes
`exercise_id` (PK, FK), `text`, `updated_at`. One sticky note per exercise, shown inside that exercise every time it appears.

### routines
`id`, `name`, `is_premade`, `next_day_index` (int, the rotation pointer), `created_at`.

### routine_days
`id`, `routine_id` (FK, cascade), `name`, `position`.

### routine_exercises
| column | type | notes |
|---|---|---|
| id | text PK | |
| routine_day_id | FK cascade | |
| exercise_id | FK | |
| position | int | |
| superset_group | int null | exercises on a day with the same number form a superset |
| set_count | int | |
| rep_min, rep_max | int | seconds for `timed` exercises. Unused for `distance_time` |
| increment | real | 0 means progression by reps only |
| increment_unit | text | lb or kg |
| next_weight | real null | cached result of the rule (7.3). Null until first run |
| next_weight_unit | text null | |

### workouts
| column | type | notes |
|---|---|---|
| id | text PK | |
| name | text | routine day name, or "Workout" for empty |
| routine_id, routine_day_id | text null | set when started from a routine day |
| status | text | `active` or `finished`. Discard deletes the row. A partial unique index allows only one `active` |
| day_mark | text | normal, rough_sleep, short_on_food, pain, cutting. Default normal |
| started_at, finished_at | int | |
| local_date | text | local date at start. Used for history, streak, and training day |
| rest_ends_at | int null | absolute end time of the running rest timer |
| food_offer_shown | int | the Short on food offer appears at most once per workout |

### workout_exercises
| column | type | notes |
|---|---|---|
| id | text PK | |
| workout_id | FK cascade | |
| exercise_id | FK | |
| routine_exercise_id | text null | null for exercises in an empty workout or added ad hoc |
| position, superset_group, show_rpe | | |
| rule_set_count, rule_rep_min, rule_rep_max, rule_increment, rule_increment_unit | null if no rule | **snapshot** of the rule when the workout started |
| planned_weight, planned_unit | null | the rule's target when the workout started |
| override_weight, override_unit | null | today-only override. Never written back to the rule |
| working_weight, working_unit | null | computed at finish (7.3) |
| outcome | text null | raised, held, held_marked, no_rule, no_sets. Computed at finish |
| next_weight, next_unit | null | computed at finish |

### sets
| column | type | notes |
|---|---|---|
| id | text PK | |
| workout_exercise_id | FK cascade | |
| position | int | |
| set_type | text | working, warmup, drop, failure |
| weight | real null | the load: weight for `weighted`, added weight for `bodyweight_plus`, assistance for `assisted` |
| weight_unit | text null | unit as logged |
| reps | int null | |
| rpe | real null | 6–10 in steps of 0.5 |
| duration_s | int null | |
| distance | real null | |
| distance_unit | text null | m, km, mi |
| done | int | |
| pr_flags | int | bitmask: 1 heaviest, 2 reps at weight, 4 estimated 1RM, 8 longest hold |
| completed_at | int null | |

### bodyweight
`id`, `local_date`, `measured_at`, `weight`, `unit`.

### foods
`id`, `name`, `serving_label` (e.g. "1 large egg", "100 g"), `serving_grams` (null ok), `kcal`, `protein_g`, `carbs_g`, `fat_g` (per serving), `source` (bundled or custom), `barcode` (null, the scanner seam), `archived`.

### food_log
`id`, `local_date`, `logged_at`, `food_id` (null for quick add), `name`, `servings`, `kcal`, `protein_g`, `carbs_g`, `fat_g`. Macros are the entry's totals, copied at the time, so editing a custom food never rewrites past days.

### settings
A key/value table with JSON values.

| key | default |
|---|---|
| theme | system |
| unit | lb if the device measurement system is US, else kg |
| distance_unit | mi if unit is lb, else km |
| bar_lb, bar_kg | 45, 20 |
| plates_lb | pairs owned: 45×4, 35×1, 25×1, 10×2, 5×1, 2.5×1 |
| plates_kg | pairs owned: 25×4, 20×1, 15×1, 10×1, 5×1, 2.5×1, 1.25×1 |
| default_increment_lb, default_increment_kg | 5, 2.5 |
| rest_seconds | 120 |
| active_routine_id | null |
| fuel_targets | null until set: `{training:{kcal,protein,carbs,fat}, rest:{…}}` |
| pro_debug_unlock | false |
| pro_cached | false (last known store entitlement) |
| seed_version | integer |

Indexes: `workouts(status)`, `workouts(local_date)`, `workout_exercises(workout_id)`, `workout_exercises(exercise_id)`, `workout_exercises(routine_exercise_id)`, `sets(workout_exercise_id)`, `food_log(local_date)`, `bodyweight(local_date)`.

## 7. Rules (`src/domain`)

Each rule is a pure function with unit tests written first.

### 7.1 Units
- 1 lb = 0.45359237 kg. All comparisons happen in kg, with two weights treated as equal if they differ by less than 0.01 kg.
- Logged entries always display in the unit they were logged in. Totals and charts use the display unit.
- **Switching the display unit** changes nothing in history and nothing in the active workout. Every routine's `next_weight` is converted and rounded once: barbell exercises to the nearest loadable weight with the new unit's bar and plates (7.7), everything else to the nearest 0.5. Every increment is converted by the gym convention, kg = lb ÷ 2 and lb = kg × 2 (5 lb ↔ 2.5 kg).

### 7.2 Day marks
Normal, Rough sleep, Short on food, Pain, Cutting. Normal is the default. The mark can change any time before finishing, and later from History.

### 7.3 Progression

`computeOutcome(input) → { workingWeight, outcome, nextWeight }`

Input: the rule snapshot (`set_count`, `rep_min`, `rep_max`, `increment`, `increment_unit`), `planned_weight`, the logging type, the equipment, the day mark, the sets, and the owner's bar and plates.

1. **Counted sets** are those of type `working` or `failure` with `done = 1`.
2. **Working weight** is the easiest load among counted sets: the lowest weight for `weighted` and `bodyweight_plus` (an empty load counts as 0), and the highest assistance for `assisted`. It is null for `timed` and `distance_time`. It is computed even when there is no rule, because the Stats chart uses it.
3. **No rule** (no `routine_exercise_id`), or the logging type is `timed` or `distance_time`: outcome `no_rule`, with no next weight. Otherwise, if there are no counted sets: outcome `no_sets`, next weight = `planned_weight`.
4. **All hit** means:
   - the number of counted sets is at least `set_count`, and
   - every counted set has `reps ≥ rep_max`.
5. **Marked day:** outcome `held_marked`. Next weight = `planned_weight`, or the working weight if there was no plan yet. Today's sets still count for history and PRs.
6. **Normal and all hit, with increment > 0:** outcome `raised`.
   - `weighted` and `bodyweight_plus`: next = working weight + increment.
   - `assisted`: next = max(0, working weight − increment).
   - Barbell exercises then round with 7.7. The next weight becomes the loadable weight nearest to the raised value that is still heavier than the working weight. If nothing heavier can be loaded, it stays at the working weight and the outcome is `held`.
7. **Normal and not all hit, or increment = 0:** outcome `held`. Next = working weight.

**Overrides** change today's displayed target only. On a Normal day the rule works from what was actually lifted (step 3). On a marked day it holds `planned_weight`, not the override.

**Writing the next weight:** `routine_exercises.next_weight` is always taken from the most recent finished `workout_exercise` linked to it. That value is recomputed on finish, on edit, and on delete (7.12).

### 7.4 The rule line and today's read
The line above an exercise's sets is the rule plus today's read.

The rule:

| case | sentence |
|---|---|
| weighted or bodyweight_plus | "If every working set hits {rep_max} on a normal day, add {inc}. A marked day holds the weight." |
| assisted | "If every working set hits {rep_max} on a normal day, take {inc} of assistance off. A marked day holds it." |
| increment 0 | "No weight to add. Beat last time's reps." |
| timed | "Last time: {sets} × {s} s. Timed holds don't go up automatically." |
| distance_time | "Last time: {distance} in {time}." |
| no rule, logged before | "No rule here. Last time: {sets} × {reps} at {weight}." |
| no rule, never logged | "First time logging this." |

Today's read, which follows the rule for `weighted`, `bodyweight_plus` and `assisted` with increment > 0:

| case | text |
|---|---|
| no plan yet | "Pick a starting weight. Next time builds from it." |
| Normal | "Hit {rep_max}s on a normal day and next time is {raised}." |
| marked | "Hit {rep_max}s on a normal day and next time is {raised}. Today is marked, so {planned} holds." |
| override, Normal | "Today is set to {override} by you. The rule still says {planned}." |
| override, marked | "Today is set to {override} by you. Today is marked, so {planned} holds." |

`{raised}` is the planned weight plus the increment, rounded as in 7.3 step 6.

### 7.5 Stall
`stallPoints(points)`. The points are one exercise's finished sessions in time order. A session is considered only if it has a rule and an outcome of `raised` or `held`. Marked sessions are skipped: they neither count nor break the run.

A session is labelled **Stall** when it and the two sessions considered before it:
- all have the same working weight, and
- all have the outcome `held`.

Every later session that continues the same run is labelled too.

### 7.6 PRs
`computePrFlags(history, workout)`.

- **Eligible sets:** done, not warmup, from finished workouts.
- **Order:** sets are compared in time order. A set is checked against every earlier eligible set of the same exercise, including earlier sets in the same workout.
- **First session:** if no earlier finished workout contains the exercise, no set gets a flag.

| logging type | flags |
|---|---|
| weighted, bodyweight_plus (load = weight or added weight) | **Heaviest:** load greater than every earlier load.<br>**Reps at weight:** an earlier set exists at the same load, and these reps are more than any of them.<br>**Estimated 1RM:** reps 1–12, e1RM = load if reps = 1, otherwise load × (1 + reps ÷ 30), greater than every earlier e1RM. |
| timed | **Longest hold:** duration greater than every earlier duration |
| assisted, distance_time | none in v1 |

### 7.7 Plates
`loadPlates(target, unit, bar, platesOwned)` returns the plates per side and the loaded total.

- Per side, find the combination of owned plates whose total is as close as possible to (target − bar) ÷ 2 without going over. On a tie, use fewer plates. The search is exact, because plate counts are small.
- If the target is below the bar weight, the result is the bar alone.
- `nearestLoadable(value, …)` uses the same search and serves 7.1 and 7.3.

### 7.8 Streak
- **Training dates:** the distinct `local_date` values of finished workouts.
- **Alive:** the run is alive if today minus the latest training date is 3 days or less.
- **Run start:** walk back from the latest training date while consecutive training dates are no more than 3 days apart. The run starts at the earliest date reached.
- **Streak:** today minus the run start, plus 1, if the run is alive. Otherwise 0.

### 7.9 This week
- **Period:** Monday 00:00 local to now.
- **Sets included:** done sets, warmups excluded, from finished workouts and the active workout.
- **Volume per set:** load × reps for `weighted` and `bodyweight_plus`. Other logging types add nothing.
- **Display:** totalled in the display unit, rounded to a whole number, with thousands separators.

### 7.10 The Short on food offer
The offer is checked once, when a session starts.

It appears when all of these are true:
- Pro is unlocked.
- At least one `food_log` entry exists for today.
- The day mark is Normal.
- The workout has not shown the offer yet.
- Protein logged today is below the training-day protein target × f, where f = clamp((now − 06:00) ÷ 16 h, 0, 1).

The offer is a slim banner under the session header: "Protein is behind today. Mark this session Short on food?" It has **Mark it** and a dismiss ×. Either choice sets `food_offer_shown`, and it never appears again for that workout.

### 7.11 Training day and Fuel targets
- A date is a training day if a finished workout has that `local_date`. Fuel uses the training targets on training days and the rest targets otherwise.
- Finishing a workout today switches today to training targets immediately.

### 7.12 Recompute after history edits
Saving an edit to a finished workout, or deleting one, runs one transaction:
1. Re-run `computeOutcome` for that workout's exercises, using their own stored rule snapshot and planned weight. This step is skipped on delete.
2. Recompute `pr_flags` for every finished set of each affected exercise, in time order.
3. Recompute `next_weight` for each affected routine exercise from its most recent finished workout.

**The active workout is never touched.** Its rule snapshot, planned weights and sets stay as they were. It is only evaluated when it finishes. Later finished workouts keep their stored planned weights, because they are history.

## 8. Screens

### 8.1 Shell
- **Header** (Train, History, Stats, Fuel, Settings):
  - The hound mark at 40px, with GYMHOUND in red next to it. If the window is narrower than 360pt, the wordmark sits under the mark.
  - A round Settings icon button on the right.
  - On Settings, the round button closes Settings.
  - The header is hidden on the session screen and the finish summary.
- **Dock:** four fixed tabs, Train, History, Stats, Fuel. The active tab's icon and label are red.
  - Routines, library, history detail and Settings open inside the tabs, so the header and dock stay. On Settings no tab is highlighted.
  - The session screen, the finish summary and the paywall are full-screen routes above the tabs, so the dock is hidden there.
- **Width:** content is capped at 512px (32rem) and centred.
- **Footer:** "Powered by GruntHound LLC", small and muted, at the end of the scroll content on Train, History, Stats and Settings only.

### 8.2 Theme and brand
Settings offers Light, Dark or System, with System the default.

| token | dark | light |
|---|---|---|
| bg | #100f0c | #f6f3ec |
| surface | #1a1814 | #ffffff |
| surfaceRaised | #232019 | #efebe3 |
| border | #2e2a23 | #ddd7cb |
| text | #f1ece2 | #15130f |
| textMuted | #a39d90 | #6b665c |
| red | #E10600 | #E10600 |

- **Red** is used only for the GYMHOUND wordmark, the active tab, and PR marks. Primary buttons use the `text` colour filled with `bg`-coloured labels. Ticks use the `text` colour.
- **Wordmark:** "GYMHOUND", Barlow Condensed ExtraBold, uppercase, tight tracking (−0.5), one line.
- **Type:** display and big numbers in Barlow Condensed 600/700/800, body in Inter 400/500/600. Numbers use `fontVariant: ['tabular-nums']`. Both fonts are bundled.
- **Hound mark:** the dog from the GruntHound logo, cut from the owner's logo file with its background removed. It is never redrawn.
  - **Master:** `assets/brand/hound-head.png`, a 650px transparent square.
  - **Header exports:** `mark.png`, `mark@2x.png` and `mark@3x.png` (40, 80 and 120px).
  - **Dark exports:** `mark-dark*.png`, the same sizes with a thin #2f8cff outline baked in, so the navy reads against #100f0c.
  - `src/ui/HoundMark.tsx` renders the right export for the scheme.
  - The owner approves how the mark sits in the header, in both themes, before phase 1 is done.
- **App icon and splash:** the mark on #100f0c.
- **Not allowed:** quotes, flames, skulls.

### 8.3 Train
In order:
1. **Greeting:** "GOOD MORNING", "GOOD AFTERNOON" or "GOOD EVENING" (05:00–11:59, 12:00–16:59, 17:00–04:59), and below it the date in huge uppercase condensed type, for example "FRI 9 OCT". The date is formatted for the device locale.
2. **Resume:** shown only if a workout is active. It shows the workout name, elapsed time, sets done, and a **Resume** button.
3. **Streak and This week:** two equal cards.
4. **Start empty** and **Routines:** full-width buttons.
5. **Up next:** shown if no workout is active.
   - Title: the routine and day, for example "Push/pull/legs · Push A".
   - "Last time: {date} · {mark}", from the most recent finished workout of that day. If the day has never been run, it reads "First time on this day."
   - One row per exercise: name, set count × rep range, today's load, and last time's outcome.
     - Raised: "185 lb · ↑ 5 lb".
     - Held on a marked day: "180 lb · held · Rough sleep".
     - Held on a Normal day: "180 lb · held".
     - No weight yet: "pick a weight".
   - One button: **Start this**.
   - If no routine is active, the card reads "Pick a routine to see what's up next." with a button to Routines.
6. **Footer.**

**Starting a workout while another is active** is blocked by a sheet: "Finish or discard the workout in progress first." with **Resume**.

### 8.4 Session
- **Header:**
  - **Back**, which leaves the workout active and returns to Train.
  - The workout name.
  - A running clock.
  - The **day-mark chip**, which shows "Normal" and opens a five-choice sheet with one tap.
- **The Short on food banner** (7.10), when it applies.
- **Exercise blocks**, in order. Each block has:
  - The name and a ⋯ menu.
  - The sticky note, which can be edited inline.
  - The rule line (7.4).
  - The set table.
- **Set table columns:** set, previous, weight, reps, tick. RPE appears when it is enabled for that exercise. The weight column label changes with the logging type: "+lb" for added weight, "−lb" for assistance. Timed and distance types use time and distance columns.
- **Set rows:**
  - **Set column:** shows the set number for working sets and W, D or F for the other types. Tapping it changes the type.
  - **Previous:** the set in the same position from the most recent finished workout with this exercise, shown in its logged unit.
  - **Prefill:** working sets start with today's target weight. With no target, the previous set's weight is the placeholder. Reps show the previous reps as a placeholder, or `rep_max` if there is no previous.
  - **Ticking a set with empty fields accepts the placeholders.** If a field is empty and has no placeholder, the tick stays disabled until it has a value.
  - **Ticking** gives a light haptic. It starts the rest timer, unless the exercise is in a superset and is not the last member of its round.
- **⋯ menu:**
  - Override today's weight.
  - Plate calculator.
  - Show RPE.
  - Superset with the next exercise.
  - Reorder, which opens a sheet with up and down controls.
  - Replace.
  - Remove.
- **Footer of the screen:** Add set (inside each block), Add exercise (library picker), **Finish**, Discard.
- **Rest timer:**
  - A bar docked just above the bottom safe area, with **−15s**, the clock, and **Skip**.
  - It is driven by `rest_ends_at`, so it survives the app being killed.
  - When it ends: a haptic.
  - If the app is in the background, a local notification "Rest's up." is scheduled for the end time. It is rescheduled on −15s and cancelled on Skip.
  - Notification permission is asked the first time a timer starts, not at launch.
- **Finish:**
  - If any sets with values are not ticked, a confirmation reads "{n} sets aren't ticked. They won't count." with **Finish anyway** and **Keep logging**.
  - Un-ticked sets are dropped.
  - Finishing runs one transaction: status → finished, `computeOutcome` per exercise, PR flags, routine `next_weight`, and the routine's `next_day_index` advanced to the day after the one run.
- **Discard:** confirm, then delete the workout. The rotation pointer does not move.

### 8.5 Finish summary
- Duration, volume, and the PR list.
- For each exercise with a rule, one line:
  - "Bench press — next time 185 lb ↑"
  - "Holds at 180 lb · Rough sleep"
  - "Holds at 180 lb"
- **Done** returns to Train, where Up next already shows the new weights.

### 8.6 Routines
- **Two sections:**
  - **Premade:** the six routines, each with its name and days per week.
  - **Yours.**
- **Routine detail:** days and exercises, with **Set active**, **Duplicate**, and for user routines **Edit** and **Delete**. Premades are read-only but still progress when run.
- **Free limit:**
  - Creating or duplicating when the user already has one routine of their own, and Pro is not unlocked, shows a sheet with one sentence: "Free holds one routine of your own. GymHound Pro holds as many as you like."
  - The sheet has **See Pro** and **Not now**.
  - Deleting the user routine frees the slot.
- **Editor:**
  - Name.
  - Days: add, rename, reorder, delete.
  - Per exercise: set count, rep range, increment (pre-filled from the default for the unit), and superset pairing.

### 8.7 Library and custom exercises
- **Search:** a single box. It matches whole words and word prefixes across name, aliases, muscles and equipment, ignoring case. "RDL", "OHP", "lat pulldown" and "hip thrust" all resolve.
- **Filters:** chips for muscle and equipment.
- **Rows:** name, equipment, primary muscle.
- **Custom exercise:** available on free and Pro. Name, primary and secondary muscles, equipment, logging type. Custom exercises can be edited. Deleting one that is used in history archives it, which hides it from the picker but keeps the name in history.

### 8.8 History
- Finished workouts grouped by month, newest first.
- **Card:** date, workout name, duration, volume, the mark if not Normal, and the PR count.
- **Detail:** exercises and sets with PR marks.
  - **Edit** allows changing set values, type and done; adding or removing sets; and changing the mark.
  - **Delete** asks for confirmation first.
  - Both run 7.12.

### 8.9 Stats
- **Exercise chart:**
  - Pick an exercise, then a range: 3M, 1Y or All.
  - The y-axis is working weight in the display unit, one point per session.
  - Normal points are filled. Marked points are hollow and carry the mark's name.
  - **Stall** labels follow 7.5.
  - Timed exercises chart the longest hold per session instead. Distance exercises show records only, with no chart, in v1.
- **Records** under the chart: heaviest, best estimated 1RM, longest hold, with dates.
- **Bodyweight:** a card with a quick entry field and a line chart.

### 8.10 Fuel (Pro)
- **Locked:** the paywall content appears inside the tab.
- **Targets not set yet:** a setup card for training-day and rest-day calories and protein, with carbs and fat optional.
- **Header:** the day, with arrows to step to earlier days.
- **Summary:** exactly two big numbers, **Calories left** and **Protein left**. Negative values read "over", for example "120 over".
- **Entries:** name, servings, calories, protein, with carbs and fat smaller. Tapping an entry edits it. A quiet daily total row follows.
- **Add:**
  - **Search foods:** bundled and custom foods, then servings.
  - **Quick add:** calories, protein, carbs, fat, and an optional name.
  - **New custom food:** name, serving label, serving grams (optional), and macros per serving.
- **Barcode seam:** a `FoodLookup` interface with only `searchLocal(query)` implemented, plus the `foods.barcode` column. No scanner UI.

### 8.11 Settings
- Appearance (Light, Dark, System).
- Units (lb or kg, and distance).
- Plates (bar and pairs owned for each unit).
- Progression default increments.
- Rest timer length.
- Fuel targets (Pro).
- GymHound Pro (status, Unlock, Restore purchases).
- Export (workouts CSV, food CSV).
- Developer, shown only when debug unlock is allowed (9): the Pro debug switch.
- About (version).
- Footer.

### 8.12 Paywall
- **Content:**
  - The title "GymHound Pro".
  - "Unlimited routines".
  - "Fuel: calories and protein, with training and rest day targets".
  - "Everything else stays free: logging, history, premade routines, your first routine, timer, plates, PRs, day marks."
- **Buttons:** **Unlock**, **Restore purchases**, **Not now**.
- **No price is written in the app.** Unlock opens the store's purchase sheet, which shows the price. If Pro is sold as a subscription, the store's localized price string is shown at runtime under the button, as Apple requires.
- **When no store is available** (Expo Go, or products missing), Unlock is disabled with "Purchases aren't available in this build."

## 9. Pro and purchases

- **Interface:** `Entitlements` in `src/platform/entitlements/` has `isPro()`, `subscribe(listener)`, `purchase()`, and `restore()`.
- **Implementations:**
  - **Free-only:** phase 3. Always false.
  - **Debug:** phase 5. Reads `pro_debug_unlock`.
  - **RevenueCat:** phase 5 code, phase 7 live. Entitlement id `pro`, offering `default`. It caches the result in `pro_cached`, so Pro works offline.
- **Selection at startup:**
  - The RevenueCat implementation is used when not running in Expo Go and an API key is configured.
  - Otherwise the debug implementation is used when debug unlock is allowed.
  - Otherwise the free-only implementation is used.
- **Debug unlock is allowed** only when `__DEV__` is true or the build sets `EXPO_PUBLIC_DEBUG_UNLOCK=1`. Store release builds set neither.
- **Lapse:** if `isPro()` turns false, nothing is deleted.
  - Extra routines stay visible and runnable.
  - Fuel locks, and its data is kept.
  - Food CSV export stays available.
  - Creating a new routine is blocked while the user has one or more routines of their own.

## 10. Seed data

`seed_version` in settings controls upserts on launch. Bundled exercises, premade routines and foods are upserted by stable ID. User rows are never touched. Upserting a premade routine preserves `next_weight` on routine exercises that keep their ID.

### 10.1 Exercises
- **Count:** about 250. It may ship below that rather than block a phase.
- **Equipment:** barbell, dumbbell, cable, machine, kettlebell, bodyweight.
- **Patterns:** squat, hinge, lunge, horizontal and vertical push and pull, carry, core, isolation.
- **Muscles:** chest, front delts, side delts, rear delts, lats, upper back, traps, biceps, triceps, forearms, abs, obliques, lower back, glutes, quads, hamstrings, adductors, calves.
- **Aliases** include RDL, OHP, lat pulldown, hip thrust, and the common short names.

### 10.2 Premade routines
Every exercise has sets, rep range and increment. Increments are 5 lb or 2.5 kg unless noted.

| id | name | days |
|---|---|---|
| premade-fullbody-3 | Full body | A, B, C |
| premade-upperlower-4 | Upper/lower | Upper A, Lower A, Upper B, Lower B |
| premade-ppl-6 | Push/pull/legs | Push A, Pull A, Legs A, Push B, Pull B, Legs B |
| premade-5x5-3 | 5×5 | A, B (alternating). Ranges 5–5. Deadlift 1×5 at +10 lb or +5 kg |
| premade-dumbbell-3 | Dumbbell only | A, B, C |
| premade-noequipment-3 | No equipment | A, B, C. Increment 0 throughout. Planks are timed |

### 10.3 Foods
About 300 common foods with typical serving sizes, taken from USDA FoodData Central generic foods (public domain), stored in `src/seed/foods.json`.

## 11. CSV export

- **Encoding:** RFC 4180 quoting, UTF-8 with a BOM so Excel reads it correctly.
- **Sharing:** files are written to the cache directory and opened in the share sheet.
- **`gymhound-workouts-YYYY-MM-DD.csv`:** one row per done set of finished workouts. Columns: `workout_id, date, started_at, finished_at, workout, routine, routine_day, day_mark, exercise, exercise_id, set_number, set_type, weight, weight_unit, reps, rpe, duration_s, distance, distance_unit, pr`. The `pr` column holds kinds joined by `|`. Times are ISO 8601 with offset.
- **`gymhound-food-YYYY-MM-DD.csv`:** one row per entry. Columns: `date, logged_at, name, servings, kcal, protein_g, carbs_g, fat_g`.

## 12. Failure handling

- **Transactions:** finishing a workout, saving a history edit, and deleting a workout are each a single transaction.
- **Migrations:** they run at startup. If one fails, the app shows "GymHound couldn't update its database." with the error text, and touches nothing. Data is never wiped to recover.
- **Number input:** accepts a comma or a dot as the decimal point. Negatives and non-numbers are rejected inline, and the tick stays disabled.
- **Network:** RevenueCat failures are ignored and `pro_cached` is used. No screen waits on the network.
- **Notifications:** if permission is denied, the in-app timer still works and no further prompts appear.

## 13. Testing and verification

- **Rules:** every function in `src/domain` is written test-first with Jest. That covers progression, stall, PRs and Epley, plates and nearest-loadable, units, streak, weekly volume, food pace, rule text, and CSV.
- **Repositories:** tested in Node on `better-sqlite3`, with the same Drizzle schema and SQL migrations. Covered:
  - the finish transaction
  - history edit and delete recompute, including the active-workout-untouched case
  - the free routine limit
  - the seed upsert
- **Layout:** the web build is checked in the browser pane in light and dark at phone width, against the phase's acceptance list.
- **iPhone:** the owner checks each phase on their iPhone in Expo Go.

## 14. Project layout

```
app/
  _layout.tsx                 fonts, theme, DB init, migrations. Root stack
  session.tsx                 full-screen, no header or dock
  finish/[id].tsx             full-screen
  paywall.tsx                 full-screen
  (tabs)/_layout.tsx          header + dock. The routes below without a tab are hidden tabs (href: null)
  (tabs)/index.tsx            Train
  (tabs)/history/index.tsx, (tabs)/history/[id].tsx
  (tabs)/stats.tsx
  (tabs)/fuel.tsx
  (tabs)/routines/index.tsx, (tabs)/routines/[id].tsx, (tabs)/routines/edit/[id].tsx
  (tabs)/library.tsx, (tabs)/exercise/edit/[id].tsx
  (tabs)/settings.tsx
src/domain/                   progression.ts, ruleText.ts, stall.ts, prs.ts, plates.ts, units.ts,
                              streak.ts, volume.ts, fuelPace.ts, csv.ts (+ *.test.ts)
src/db/                       schema.ts, client.ts, migrations/, repositories/
src/seed/                     exercises.ts, routines.ts, foods.json, seed.ts
src/platform/entitlements/    index.ts, freeOnly.ts, debug.ts, revenuecat.ts
src/platform/restTimer/       index.ts, expoGoNotification.ts (phase 7: liveActivity.ts, androidOngoing.ts)
src/state/                    sessionStore.ts
src/ui/                       theme.ts, fonts.ts, Header.tsx, HoundMark.tsx, Dock.tsx, Footer.tsx, components/
assets/brand/                 hound-head.png (master, from the logo), mark*.png, mark-dark*.png, icon, splash
```

## 15. Phases

Each phase gets its own implementation plan and ends with its acceptance check.

1. **Header, themes, Train, offline session**
   - Scaffold, OneDrive junction, schema and migrations, seed premade routines plus the exercises they use, theme and fonts, hound mark (owner approval), header, dock, footer, Train.
   - Session: start empty or from Up next, log sets, previous column, tick, rest timer with the Expo Go notification, finish, discard, resume.
   - A basic name search for adding exercises.
2. **Day marks and the rule**
   - Mark chip, `computeOutcome`, rule line and today's read, override, finish summary with next weight, Up next showing last time's outcome and today's load.
3. **Routines and the free limit**
   - Routines screen, detail, set active, duplicate, editor, the `Entitlements` interface with the free-only implementation, and the one-sentence stop on the second user routine.
4. **Library, custom exercises, plates, bodyweight, PRs**
   - Full seed (about 250), search with filters, custom exercises, plate settings, calculator and barbell rounding, the bodyweight log, PR flags and finish-summary PRs.
5. **Pro, paywall, Fuel**
   - Debug and RevenueCat implementations, paywall screen, Fuel (foods seed, log, quick add, custom foods, targets, summary, training-day switch), and the Short on food offer.
6. **History, Stats, CSV**
   - History list, detail, edit and delete with recompute, Stats charts with mark and stall labels, records, bodyweight chart, CSV export.
7. **Native build** (when the Apple Developer account exists)
   - EAS development builds, the iOS Live Activity and Android ongoing notification for the rest timer, and live RevenueCat products.
   - This phase is outside the acceptance list below.

## 16. Done when

- The hound head and the red GYMHOUND are at the top in light and dark.
- A free user can run a premade day, log sets, see last time, rest, finish, and see next time already raised if the day was Normal and they hit the range.
- A marked day keeps the weight and says why on the chart.
- A free user can save one routine and is stopped, in one sentence, on the second.
- Pro unlocks more routines and Fuel, and a finished workout uses the training-day targets.
- "Powered by GruntHound LLC" is at the bottom of Train, History, Stats, and Settings.
- The app opens with no network and no account.
