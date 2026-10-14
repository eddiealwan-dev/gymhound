# GymHound — Design Spec

Date: 2026-10-09
Status: Approved; §18 added 2026-10-10 from the owner's device check
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
- Barcode scanning (a seam is left for it, see 8.10). (Round 9: the owner asked for it; built in §18.22, R547.)
- Automatic deloads. A stall is a chart label only.
- A watch app. Apple Watch and Wear OS come in a later phase (§17.4). Watches otherwise reach GymHound only through the phone's health store (§17.1).
- Private cloud logins for Garmin, Whoop or any other watch brand, ever.
- A music library, search or playlists inside GymHound (§17.3).
- Widgets other than the rest timer, and a calendar view of history.

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
| Header layout | The hound sits on the left of red GYMHOUND, on one line and vertically centred, at every width including under 360pt. Never stacked. 48px hound, 38px wordmark, 10px gap, blue outline in dark mode (sizes raised by the owner on 2026-10-10). GYMHOUND keeps a fixed size when phone text is enlarged; everything else scales |
| Footer | Matches FieldHound: "powered by" over the GruntHound wordmark image (white GRUNT on dark, black on light, blue HOUND, small LLC). Pinned to the bottom of short pages. No hound in the footer |
| Previous result | Every set row shows that same set from last time, beside the input. Matched by set type and number. Empty when there is no history. A warmup is never the previous result for a working set (§8.4) |
| Up next | Advances only when that routine day is finished. Rest days, discarded sessions and empty workouts never consume it (§8.3) |
| Notes | A note lives on the exercise and follows it into every routine. A finished workout keeps the note it was saved with (§6, §8.4) |
| Weight and time | A logging type for carries and sleds: weight and duration, no reps. Hitting the top of the time range on a Normal day raises the weight (§7.3) |
| Rest bell | A short bell plus a haptic at zero, including on a locked phone. On by default. The sound can be changed (§8.4) |
| Data safety | The live database plus a snapshot after every finish, with the newest 7 kept. A failed migration restores the newest snapshot and never starts empty (§17.2) |
| Health and watches | Apple Health on iPhone, Health Connect on Android. Finished workouts write out. Sleep, body weight and heart rate are read only to offer a day mark or fill the body-weight card. The app database stays the source of truth (§17.1) |
| Music | A small session player that controls what is already playing (§17.3). Phone builds only. Apple Music always. Spotify on iPhone through Spotify's kit and a one-time connect, falling back to an open-Spotify button |

## 4. Platform and environment

- **Development machine:** Windows 11, Node.js 24 LTS, git. iOS cannot be built locally.
- **Expo SDK:** the version supported by the App Store build of Expo Go at the time of scaffolding, because Expo Go only runs the current SDK.
- **Phases 1–6** run in Expo Go on the owner's iPhone. The PC and phone share Wi-Fi, with `--tunnel` as a fallback.
- **Phase 7** runs once the Apple Developer account exists: EAS development builds, the Live Activity, the Android ongoing notification, live RevenueCat products, Apple Health and Health Connect (§17.1), the cloud copy of snapshots (§17.2), the music player (§17.3), and the bundled bell sound on the lock screen (§8.4).
- **Phase 8** adds the watch apps for Apple Watch and Wear OS (§17.4).
- **Phone-only features** (Health, music, cloud backup, watch apps) are never built or checked in the browser build.
- **Web build:** used only so Claude can check layout and themes in the browser pane. It is not a shipped target. `expo-sqlite` on web needs WASM and the COOP/COEP headers, which are set in `metro.config.js`.
- **OneDrive:** the project lives in `Documents\GymHound` inside OneDrive. `node_modules` is a junction to `C:\Users\eddie\.gymhound\node_modules`, so installed packages do not sync. That folder is outside AppData because the Claude app redirects new AppData folders into its own private copy. npm 11 deletes a junctioned `node_modules`, so packages are installed in `C:\Users\eddie\.gymhound` (a copy of `package.json`) and the manifest files are copied back.
- **Patches to dependencies:** any fix to a dependency's code is a `patch-package` file in `patches/`, re-applied by the `postinstall` script, and never a hand edit inside `node_modules`. `patches/` is copied into `C:\Users\eddie\.gymhound` before installing. `.gitattributes` keeps patch files byte-exact (`patches/*.patch -text`). The only patch so far fixes a sync-result truncation bug in expo-sqlite 57.0.4's browser-only worker channel. It never reaches the iPhone bundle, which was verified with an offline iOS export. `.expo`, `dist`, `web-build`, `ios` and `android` are git-ignored, and none of them is committed.

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
- **Network:** RevenueCat's entitlement check (phase 7 live, phase 5 code), and since Round 9 Fuel's Open Food Facts lookups: a barcode when you scan one, a search when you tap Search online (R546). Nothing else, and nothing waits on either: everything else works with no network.

Libraries
- **App:** `expo-router`, `expo-sqlite`, `drizzle-orm`, `zustand`, `react-native-svg`, `@expo-google-fonts/barlow-condensed`, `@expo-google-fonts/inter`, `expo-notifications`, `expo-haptics`, `expo-localization`, `expo-file-system`, `expo-sharing`, `expo-crypto`, `react-native-purchases`.
- **Development:** `drizzle-kit`, `babel-plugin-inline-import` (SQL migrations), `jest`, `jest-expo`, `better-sqlite3`, `typescript`.
- **Phase 1 addition:** `expo-audio` for the rest bell (it runs in Expo Go).
- **Phase 7:** `expo-dev-client`, `@notifee/react-native`, a Live Activity module, a HealthKit module, a Health Connect module, and media-control modules (§17.3). The phase 7 plan chooses each module from what supports the Expo SDK at that time.

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
| logging_type | text | weighted, bodyweight_plus, assisted, timed, distance_time, weighted_time (weight and duration, no reps: carries and sleds) |
| is_custom | int | |
| archived | int | custom exercises used in history are archived, never deleted. Phase 4 (R109): "used" is any workout (active or finished), routine slot or saved workout |
| created_at | int | |

### exercise_notes
`exercise_id` (PK, FK), `text`, `updated_at`. One note per exercise. It is shown inside that exercise every time the exercise appears, in any routine or in an empty workout.

### exercise_prefs
`exercise_id` (PK, FK), `rest_seconds` (int null), `updated_at`. Per-exercise preferences that follow the exercise everywhere, like its note (§18.2). A missing row or a null `rest_seconds` uses the Settings rest length, and 0 means rest is off for that exercise. Added in migration 0002.

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
| rep_min, rep_max | int | seconds for `timed` and `weighted_time` exercises. Unused for `distance_time` |
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
| rest_set_id | text null | the set whose tick started the running rest. The countdown also shows under it. Written and cleared with `rest_ends_at`, and not a foreign key (ruling R38, migration 0003) |
| food_offer_shown | int | the Short on food offer appears at most once per workout |
| health_status | text null | phase 7. Null means not attempted, otherwise `done` or `failed`. Never blocks anything (§17.1) |
| health_record_id | text null | phase 7. The id of the record GymHound wrote to Apple Health or Health Connect |
| saved_workout_id | text null | phase 4 (migration 0006): the saved workout this workout was started from (R119). Not a foreign key, so history survives a deleted saved workout |

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
| note | text null | the exercise's note as it was when the workout finished. Copied at finish and never changed by later note edits. History shows this copy |

### sets
| column | type | notes |
|---|---|---|
| id | text PK | |
| workout_exercise_id | FK cascade | |
| position | int | |
| set_type | text | working, warmup, drop, failure |
| weight | real null | the load: weight for `weighted` and `weighted_time`, added weight for `bodyweight_plus`, assistance for `assisted` |
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
`id`, `local_date`, `measured_at`, `weight`, `unit`. Each entry keeps the unit it was logged in (R112). Several a day are allowed (R115).

### measurements (phase 4, migration 0006)
`id`, `kind` (waist, chest, hips, arms, thighs, neck, body_fat), `local_date`, `measured_at`, `value` (real), `unit` (in, cm or %). Bodyweight stays in its own table. Arms and thighs are one value each (R113). Each entry keeps the unit it was logged in (R112). Index `measurements(kind, local_date)`.

### exercise_photos (phase 4, migration 0006)
`exercise_id` (PK, FK to exercises, cascade), `start_file` (text null), `end_file` (text null), `updated_at`. Your own start and end photos for an exercise with no bundled photos (R111). The columns hold **file names only** (`{exerciseId}-{slot}-{time}.jpg`), never paths or URIs: the files are in the documents folder's `exercise-photos/`, resolved against the documents folder each time they are shown, because iOS moves the app's folder on update. A name whose file is missing (a restored snapshot) reads as no photo.

### saved_workouts (phase 4, migration 0006)
`id`, `name` (trimmed, 1–60 characters), `created_at`, `updated_at` (the finish time of the last workout that updated it, R120). Free and unlimited; never counted as a routine (R118).

### saved_workout_exercises (phase 4, migration 0006)
| column | type | notes |
|---|---|---|
| id | text PK | |
| saved_workout_id | FK cascade | |
| exercise_id | FK | an archived exercise stays and still starts (R119, R130) |
| position | int | |
| superset_group | int null | a group left with one member is stored as null |
| sets | json | the remembered sets in set order: `{setType, weight, weightUnit, reps, durationS, distance, distanceUnit}` each, the done sets only (R118). Default `[]` |

Index `saved_workout_exercises(saved_workout_id)`.

### foods
`id`, `name`, `serving_label` (e.g. "1 large egg", "100 g"), `serving_grams` (null ok), `kcal`, `protein_g`, `carbs_g`, `fat_g` (per serving), `source` (bundled or custom), `barcode` (null, the scanner seam), `archived`.

### food_log
`id`, `local_date`, `logged_at`, `food_id` (null for quick add), `name`, `servings`, `kcal`, `protein_g`, `carbs_g`, `fat_g`, `serving_label` (text null, phase 5, migration 0007). Macros are the entry's totals, copied at the time, so editing a custom food never rewrites past days. `local_date` is the day the entry is logged for, which may be an earlier day viewed on Fuel (R148). `serving_label` is the food's serving label copied at log time (R158), so a later change to the food or to a seed label never changes history; it is null for a quick add and for rows logged before 0007, which show "{n} servings" instead.

### water_log (phase 5, migration 0007)
`id`, `local_date` (the day it is logged for), `logged_at`, `amount_ml` (real). Water is stored in ml whatever the display unit (R150). Index `water_log_local_date_idx` on `water_log(local_date)`. Free; no chart and no CSV.

### settings
A key/value table with JSON values.

| key | default |
|---|---|
| theme | system |
| unit | lb if the device measurement system is US, else kg |
| distance_unit | mi if unit is lb, else km |
| bar_lb, bar_kg | 45, 20 |
| plates_lb | pairs owned: 45×4, 35×1, 25×1, 10×2, 5×1, 2.5×1. Edited in Settings → Plates from phase 4 (R107): a map of size to whole pairs, 0–20 each, at least one pair kept |
| plates_kg | pairs owned: 25×4, 20×1, 15×1, 10×1, 5×1, 2.5×1, 1.25×1. As plates_lb |
| default_increment_lb, default_increment_kg | 5, 2.5. One per unit, edited for the display unit in Settings → Progression from phase 4; new routine slots start with it (R124) |
| rest_seconds | 120 |
| rest_bell | true |
| rest_bell_sound | `bell` (one of the bundled bell sounds) |
| last_snapshot_at | null until the first snapshot (§17.2) |
| active_routine_id | null |
| fuel_targets | null until set: `{training:{kcal,protein,carbs,fat}, rest:{…}}` |
| pro_debug_unlock | false |
| pro_cached | false (last known store entitlement) |
| seed_version | integer |
| pr_flags_backfilled | false. Phase 4 (R127): turned on once the PR flags of workouts finished before phase 4 have been written at launch. A fresh install turns it on at once |
| water_goal_ml | null. Phase 5 (R150): the daily water goal in ml, unset until the user sets one (no health default); 8 fl oz (236.6 ml) to 10,000 ml, checked in ml in both units. An existing install gets the key as null |
| hint_units_dismissed | false. §18.15 (R407): Train's first-run units line was dismissed. An existing install gets it as false but has a finished workout, so never sees the line |
| hint_session_dismissed | false. §18.15 (R408): the session's first-run tip was dismissed |
| trial_started_at | null. §18.19 (R480): when the 7-day full access trial started (epoch ms), set once at a finish |
| trial_start_workout_id | null. §18.19 (R486): the workout whose finish started the trial |
| trial_ended_seen | false. §18.19 (R490): Train's "Your full access trial has ended" line was answered |

Indexes: `workouts(status)`, `workouts(local_date)`, `workout_exercises(workout_id)`, `workout_exercises(exercise_id)`, `workout_exercises(routine_exercise_id)`, `sets(workout_exercise_id)`, `food_log(local_date)`, `bodyweight(local_date)`, from phase 4 `measurements(kind, local_date)` and `saved_workout_exercises(saved_workout_id)`, and from phase 5 `water_log(local_date)`.

## 7. Rules (`src/domain`)

Each rule is a pure function with unit tests written first.

### 7.1 Units
- 1 lb = 0.45359237 kg. All comparisons happen in kg, with two weights treated as equal if they differ by less than 0.01 kg.
- Logged entries always display in the unit they were logged in. Totals and charts use the display unit.
- **Switching the display unit** changes nothing in history, nothing in the active workout, and nothing stored on routines. A routine's `next_weight` and increment keep the unit they were written in. (Revised 2026-10-10, ruling R36: converting at the switch made lb → kg → lb drift, for example 135 → 60 → 130.)
- **Converting a plan when it is used.** A workout started from a routine day snapshots the plan in the display unit.
  - **Same unit:** the stored value is used as it is.
  - **Different unit, barbell exercises:** converted, then rounded to the nearest loadable weight with the display unit's bar and plates (7.7). Above the heaviest loadable total, it rounds instead to the nearest step of twice the smallest owned plate above the bar, so a heavy target is never cut down to what the plates can load.
  - **Different unit, everything else:** converted, then rounded to the nearest 0.5.
  - **Increments:** converted by the gym convention, kg = lb ÷ 2 and lb = kg × 2 (5 lb ↔ 2.5 kg).
  - Up next and the routine editor show plans through the same conversion.

### 7.2 Day marks
Normal, Rough sleep, Short on food, Pain, Cutting. Normal is the default. The mark can change any time before finishing, and later from History.

### 7.3 Progression

`computeOutcome(input) → { workingWeight, outcome, nextWeight }`

Input: the rule snapshot (`set_count`, `rep_min`, `rep_max`, `increment`, `increment_unit`), `planned_weight`, the logging type, the equipment, the day mark, the sets, and the owner's bar and plates.

1. **Counted sets** are those of type `working` or `failure` with `done = 1`.
2. **Working weight** is the easiest load among counted sets: the lowest weight for `weighted`, `weighted_time` and `bodyweight_plus` (an empty load counts as 0), and the highest assistance for `assisted`. It is null for `timed` and `distance_time`. It is computed even when there is no rule, because the Stats chart uses it.
3. **No rule** (no `routine_exercise_id`), or the logging type is `timed` or `distance_time`: outcome `no_rule`, with no next weight. Otherwise, if there are no counted sets: outcome `no_sets`, next weight = `planned_weight`.
4. **All hit** means:
   - the number of counted sets is at least `set_count`, and
   - every counted set has `reps ≥ rep_max`, or for `weighted_time` `duration_s ≥ rep_max` (the top of the time range, in seconds).
5. **Marked day:** outcome `held_marked`. Next weight = `planned_weight`, or the working weight if there was no plan yet. Today's sets still count for history and PRs.
6. **Normal and all hit, with increment > 0:** outcome `raised`.
   - `weighted`, `weighted_time` and `bodyweight_plus`: next = working weight + increment.
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
| weighted_time | "If every working set reaches {rep_max}s on a normal day, add {inc}. A marked day holds the weight." |
| increment 0 | "No weight to add. Beat last time's reps." |
| timed | "Last time: {sets} × {s} s. Timed holds don't go up automatically." |
| distance_time | "Last time: {distance} in {time}." |
| no rule, logged before | "No rule here. Last time: {sets} × {reps} at {weight}." |
| no rule, never logged | "First time logging this." |

Today's read, which follows the rule for `weighted`, `weighted_time`, `bodyweight_plus` and `assisted` with increment > 0. For `weighted_time`, "Hit {rep_max}s" reads "Reach {rep_max}s":

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
| weighted_time | **Heaviest:** load greater than every earlier load.<br>**Longest hold:** duration greater than every earlier duration |
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

**As built in phase 5 (R152, R161; this replaces the list above where they differ):**
- It is judged **as of the workout's `started_at`**, not "now": the protein of food entries of the workout's `local_date` logged at or before `started_at` (`proteinLoggedBy`), the pace f at `started_at`, and the **training-day** protein target. So the answer stays the same while the session is open and after a resume. A workout started before 06:00 has f = 0 and is never offered.
- All must hold: Pro is on (read live, so turning Pro off hides the banner at once); the workout is the active one and `food_offer_shown` is 0; some food was logged that date by the start; a training protein target is set and above 0; protein so far < target × f.
- Marks are per exercise since phase 2 (§18.7), so "The day mark is Normal" became: the offer is **blocked only by an exercise already marked Short on food**. An exercise marked Pain or any other reason does not block it.
- It is not due while the workout has **no exercise left to flag** (none yet, or every one marked for some reason) (R161). So mid-session: an empty workout shows it when its first exercise is added; a workout where every exercise is marked shows it once a mark is cleared; clearing a Short on food mark set from the ⋯ menu can bring it back, while `food_offer_shown` is still 0.
- **Mark it** flags every exercise with no mark as Short on food in one transaction (others keep their mark), sets `food_offer_shown`, and announces "Marked Short on food." when it flagged any. Exercises added later are not flagged. × sets `food_offer_shown` only. Both save what is typed first (`flushAll`).
- The banner is a `surface` row with a `borderStrong` bottom edge directly under `SessionHeader`, outside the scroll view, with a compact filled **Mark it** and a 44pt × (VoiceOver "Dismiss"); at large text the buttons wrap under the line (DESIGN.md).

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
  - The hound mark at 48px on the left of the red GYMHOUND (38px), 10px apart, on one line and vertically centred with it. This holds at every phone width, including under 360pt. The wordmark never wraps or drops under the mark.
  - A round Settings icon button on the right.
  - On Settings, the round button closes Settings.
  - The header is hidden on the session screen and the finish summary.
- **Dock:** four fixed tabs, Train, History, Stats, Fuel. The active tab's icon and label are red.
  - Routines, library, history detail and Settings open inside the tabs, so the header and dock stay. On Settings no tab is highlighted. Stats stays highlighted on a body detail and Fuel on `/fuel-targets` (Fuel → Targets).
  - The session screen, the finish summary and the paywall are full-screen routes above the tabs, so the dock is hidden there.
- **Width:** content is capped at 512px (32rem) and centred.
- **Footer:** on Train, History, Stats, Fuel and Settings (Fuel added by the owner, §18.4). It matches FieldHound's footer exactly.
  - **Two lines, centred:**
    1. "powered by" in small muted type (Inter 400, 10px).
    2. The GruntHound wordmark: GRUNT in bold, HOUND in electric blue (#007EF8), and a small raised LLC beside it, 153.5px wide. On dark, GRUNT is white. On light, GRUNT is black. HOUND stays blue in both.
  - **Pinned to the bottom:** on a short page the footer sits at the bottom of the screen, above the dock. On a long page it follows the content.
  - **No hound:** the hound appears in the header only, never in the footer.

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
| textFaint | #6d675c | #8f897d |
| borderStrong | #736c60 | #8a8478 |

`textFaint` is for suggested values in set fields and `borderStrong` for set-field edges and compact pill outlines (§18.6).

- **Red** is used only for the GYMHOUND wordmark, the active tab, and PR marks. Primary buttons use the `text` colour filled with `bg`-coloured labels. Ticks use the `text` colour.
- **Wordmark:** "GYMHOUND", Barlow Condensed ExtraBold, uppercase, tight tracking (−0.5), one line. It is a logo, so it keeps a fixed size when the phone's text size is turned up. All other text in the app follows the phone's text size.
- **Type:** display and big numbers in Barlow Condensed 600/700/800, body in Inter 400/500/600. Numbers use `fontVariant: ['tabular-nums']`. Both fonts are bundled.
- **Hound mark:** the dog from the GruntHound logo, cut from the owner's logo file with its background removed. It is never redrawn.
  - **Master:** `assets/brand/hound-head.png`, a 650px transparent square.
  - **Header exports:** `mark.png`, `mark@2x.png` and `mark@3x.png` (48, 96 and 144px).
  - **Dark exports:** `mark-dark*.png`, the same sizes with a thin #2f8cff outline baked in, so the navy reads against #100f0c.
  - `src/ui/HoundMark.tsx` renders the right export for the scheme.
  - The owner approves how the mark sits in the header, in both themes, before phase 1 is done.
- **GruntHound wordmark (footer):** FieldHound's own `grunthound-mark.png`, copied unchanged as `assets/brand/grunthound-master.png` (776×82).
  - `grunthound-on-dark*.png` is that image as is (white GRUNT and LLC).
  - `grunthound-on-light*.png` is the same image with only its white parts turned black. HOUND keeps its blue.
  - Both come at 1x, 2x and 3x.
  - It is never redrawn.
- **App icon and splash:** the mark on #100f0c.
- **Not allowed:** quotes, flames, skulls.

### 8.3 Train
> Revised by §18.6: Up next now comes straight after the date.

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
   - **Up next advances only when that routine day is finished.** A rest day, a discarded session, an empty workout, or a finish refused because nothing was ticked never consumes it. Monday's workout is still Monday's workout on Wednesday. Time passing never moves the pointer.
6. **Footer.**

**Starting a workout while another is active** is blocked by a sheet: "Finish or discard the workout in progress first." with **Resume**.

### 8.4 Session
> Revised by §18.6: the header, the note, the add buttons, prefill and the tick, the rest row, and the Finish confirm.

- **Header:**
  - **Back**, which leaves the workout active and returns to Train.
  - The workout name.
  - A running clock.
  - The **day-mark chip**, which shows "Normal" and opens a five-choice sheet with one tap.
- **The Short on food banner** (7.10), when it applies.
- **Exercise blocks**, in order. Each block has:
  - The name and a ⋯ menu.
  - The note, which can be edited inline.
    - It lives on the exercise, so the next time that exercise appears, in any routine or an empty workout, the note is already there.
    - Replacing an exercise shows the new exercise's own note. The old note stays with the old exercise.
  - The rule line (7.4).
  - The set table.
- **Set table columns:** set, previous, weight, reps, tick. RPE appears when it is enabled for that exercise.
  - The weight column label changes with the logging type: "+lb" for added weight, "−lb" for assistance.
  - Timed and distance types use time and distance columns.
  - Weight-and-time types use weight and time columns, with no reps.
- **Set rows:**
  - **Set column:** shows the set number for working sets and W, D or F for the other types. Tapping it changes the type.
  - **Previous:** every set row shows the last result for that same set, in its own column beside the inputs. It is never above the exercise and never behind a tap.
    - **Which set:** from the most recent finished workout that contains this exercise, take the set with the same type and the same number within that type.
      - Working set 2 shows what working set 2 was last time, not the best set.
      - Warmup 1 shows warmup 1. Drop and failure sets match drop and failure sets the same way.
      - A warmup is never the previous result for a working set.
    - **No history:** if that workout has no matching set, or the exercise has never been logged, the spot is empty. A number is never invented.
    - **Format:**
      - Weight and reps: "185 × 5".
      - Weight and time: "70 lb × 40s".
      - Time only: "40s", or "1:30" from 60 seconds up.
      - Distance and time: "2 km · 12:30".
      - Bodyweight plus: "+25 × 8".
      - Assisted: "−40 × 8".
    - **Units:** weight-and-time always shows its unit. Other weights show their unit only when it differs from the display unit ("84 kg × 12").
  - **Prefill:** working sets start with today's target weight. With no target, the previous set's weight is the placeholder, converted to the entry unit. Reps show the previous reps as a placeholder, or `rep_max` if there is no previous. For timed and weight-and-time sets, the duration placeholder is the previous duration, or `rep_max` seconds.
  - **Ticking a set with empty fields accepts the placeholders.** If a field is empty and has no placeholder, the tick stays disabled until it has a value.
  - **Ticking** gives no haptic (R538; it gave a light one until Round 8). It starts the rest timer, unless the exercise is in a superset and is not the last member of its round.
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
  - The countdown, with **−15s** and **Skip**, shows under the set that started it (§18.4). A bar docked above the bottom safe area appears only as a fallback when that set no longer exists (ruling R41).
  - Ticking a set starts it.
  - It is driven by `rest_ends_at`, so it survives the app being killed.
  - **When it ends:** a short bell and a haptic, including when the phone is locked.
    - When the app is open, the bell plays in the app, even with the ringer switch on silent (owner decision).
    - When the app is in the background or the phone is locked, the scheduled notification "Rest's up." carries the sound and vibration. It follows the phone's own sound settings. It is rescheduled on −15s and cancelled on Skip.
    - The bell ducks any music for a moment and never stops it.
    - Settings can turn the bell off or change its sound. The default is on.
    - In Expo Go the lock-screen notification can only use the system sound. The chosen bell sound on the lock screen arrives with the phase 7 build.
  - Notification permission is asked the first time a timer starts, not at launch.
- **Music player** (phone builds only, phase 7): a small player on the session screen (§17.3).
- **Finish:**
  - If any sets with values are not ticked, a confirmation reads "{n} sets aren't ticked. They won't count." with **Finish anyway** and **Keep logging**.
  - Un-ticked sets are dropped.
  - Finishing runs one transaction:
    - status → finished
    - `computeOutcome` per exercise
    - PR flags
    - routine `next_weight`
    - each exercise's current note copied onto its workout row
    - the routine's `next_day_index` advanced to the day after the one run
  - **After the transaction commits:**
    - A snapshot is written (§17.2).
    - On phone builds, the workout is written to Apple Health or Health Connect (§17.1).
    - Neither step can fail or undo the finish.
- **Discard:** confirm, then delete the workout. The rotation pointer does not move.

### 8.5 Finish summary
- Duration, volume, and the PR list.
- For each exercise with a rule, one line:
  - "Bench press — next time 185 lb ↑"
  - "Holds at 180 lb · Rough sleep"
  - "Holds at 180 lb"
- **Done** returns to Train, where Up next already shows the new weights.
- **Phase 4 (§18.9):**
  - **Personal bests** (R105), after the next-time lines and hidden when there are none: a Label, then one row per exercise per PR kind, a red "PR" mark (Barlow 800, 14) before the line ("Bench press — heaviest: 185 lb × 5"), read as "Personal best. {line}".
  - **Share** (R106), a compact secondary pill on each row, on a phone whose share sheet is available only: it draws the personal best card, captures it as a 1080 × 1350 PNG and opens the share sheet. A failure shows "Couldn't make the image. Try again." (muted) under the row.
  - **Save as a workout** (R118), a secondary button just above Done when something was done: a sheet "Save as a workout" with the name prefilled, **Save** / **Cancel**; then the muted line "Saved as {name}.". A workout started from a saved workout that still exists shows "{name} remembers today's sets." instead (R120).

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
- **Saved workouts (phase 4, R122):**
  - A third group after Yours, "Saved workouts": each row is the name and "{n} exercises" (muted), opening the saved workout, with a compact **Start** pill (a workout in progress opens the in-progress sheet instead). Empty: "Finish a workout and tap Save as a workout to keep it here." (muted).
  - **Saved workout screen** (`/saved/{id}`): Back to Routines, the name, each exercise with its remembered sets on one line ("185 × 5, 185 × 5, 175 × 8"; warmups "W 95 × 10"), a filled **Start**, and **Rename** (name sheet) and **Delete** ("Delete {name}?", "Workouts you've finished keep their history.", **Delete** / **Keep**) as secondary buttons.
  - **Editor:** under Add day, a secondary **Add a saved workout** (hidden when there are none) opens a list of saved workouts; choosing one appends it as a day (R121). The editor's Save writes it.

### 8.7 Library and custom exercises
- **Search:** a single box. It matches whole words and word prefixes across name, aliases, muscles and equipment, ignoring case. "RDL", "OHP", "lat pulldown" and "hip thrust" all resolve.
- **Filters:** chips for muscle and equipment.
- **Rows:** name, equipment, primary muscle.
- **Custom exercise:** available on free and Pro. Name, primary and secondary muscles, equipment, logging type. Custom exercises can be edited. Deleting one that is used in history archives it, which hides it from the picker but keeps the name in history.
- **As built in phase 4 (§18.9):**
  - **Picker:** a compact **New exercise** under the search box opens the editor with the search text as the name; a saved exercise is chosen at once in the picker's mode (add, replace or routine) (R110). Your own exercises' rows end " · Custom".
  - **Exercise editor** (`/exercise/new` or `/exercise/{id}`, a modal over the picker or the form demo): "New exercise" / "Edit exercise"; Name; **Primary muscles** and **Secondary muscles** as wrapping multi-select chips (the three delts apart; a muscle chosen as primary leaves secondary); **Equipment** as single-select chips, none chosen for a new exercise (R128); **Logging** as radio rows (Weight and reps, Bodyweight plus weight, Assisted, Time, Weight and time, Distance and time), or, once the exercise is in use, the type as text with "It's in use, so this stays." (R108, R129); **Photos** (a saved exercise, phone builds only, R111). What stops Save is listed in muted lines over **Save** once Save is tapped: "Give the exercise a name.", "Keep the name to 60 characters.", "You already have an exercise called {name}.", "Pick at least one primary muscle.", "Pick the equipment.". A quiet **Delete exercise** (not on an archived one) asks "Delete {name}?" with "It stays in your history and routines but leaves the exercise list." (used) or "This can't be undone." (unused), **Delete** / **Keep** (R109). Leaving with changes asks "Discard changes?" (**Keep editing** / **Discard**).
  - **Form demo:** your own exercise with no steps shows "No steps for your own exercise." and **Edit exercise**, which opens the editor once the sheet has closed (not offered from the routine editor's picker). On an exercise with no bundled photos, a phone build shows **Start photo** and **End photo** slots: **Add**, or a thumbnail with **Replace** and **Remove** ("Remove this photo?"). Add and Replace open **Take photo**, **Choose a photo**, **Cancel**; a refused camera reads "Camera access is off. Turn it on in Settings to take a photo." The demo shows your own photos as it shows bundled ones (one photo stands still; two swap, R98).

### 8.8 History
- Finished workouts grouped by month, newest first.
- **Card:** date, workout name, duration, volume, the mark if not Normal, and the PR count.
- **Detail:** exercises and sets with PR marks, and each exercise's note as it was saved with that workout.
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
- **Body, as built in phase 4 (R114–R117):** Stats is "Stats", then a **Body** Label (phase 6 puts the lift charts above it):
  - The **Bodyweight** card: the latest entry (a 44pt number in the unit it was logged in, its unit and date, muted) or "No entries yet."; the quick entry (a number field in the display unit, its unit, a filled **Log**; out of bounds or not a number → "Check this number", nothing written); the chart with 3M (default), 1Y and All, or "No entries in this range."; a quiet "All entries ›".
  - A **Measurements** Label and one 44pt row per kind (Waist, Chest, Hips, Arms, Thighs, Neck, Body fat): the latest "{value} · {date}" or "No entries" (muted), opening its detail.
  - **Body detail** (`/body/{kind}`): Back to Stats, the kind's name, the same entry row and chart, then every entry newest first. Tapping an entry opens a sheet "{Kind} on {date}" with the value field (in the entry's unit), **Save**, **Delete** ("Delete this entry?", **Delete** / **Keep**) and **Cancel**.

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
- **As built in phase 5** (§18.10), top to bottom; the footer shows in every state:
  - **Title and day header** (R148): Display "Fuel"; under it a 44pt **‹** (VoiceOver "Previous day"), the day ("Today", "Yesterday", else "Sat, Oct 10" in the phone's locale, with the year when not this year's) centred in Display, and a 44pt **›** ("Next day", dimmed and disabled on today). ‹ steps back to any earlier day; › never passes today. Each step says the new day to VoiceOver. Under it, muted, "Training day" or "Rest day" (§7.11), shown only when targets apply (Pro with targets). Today is re-read when the tab regains focus or the app returns to the foreground: a screen left on Today moves to the new Today past midnight; one left on an earlier day stays there.
  - **Water card** (R150), free, Pro or not, for the day shown: a surface card with Label "Water"; the total in Barlow, then muted " of {goal}" with a 3pt bar (capped full) when a goal is set (tap to change it), or a quiet **Set a daily goal**; compact pills "+250 ml" "+500 ml" (or "+8 fl oz" "+16 fl oz" for lb users) and **Other**; a quiet **Entries ›** when the day has any. A pill logs for the day shown and announces "Added 250 ml. 1,250 ml today." ("yesterday", "on {day}"). Sheets: "Add water" (1–3,000 ml or 0.1–100 fl oz), "Daily water goal" (**Save**, **Clear goal** when set, **Cancel**), and the day's entries ("Water today"), each with a compact **Delete** and no question; today's entries show their time, an earlier day's the amount alone. Amounts: whole ml with separators, whole fl oz (one decimal under 1, "<0.1 fl oz" for a sip, never "0 fl oz"); VoiceOver says "fluid ounces". Bad input: "Check this number".
  - **Locked** (free, or lapsed, R151): the pitch (`ProPitch` in its tab form, §8.12) under the water card. Food entries and targets are kept and come back with Pro.
  - **No targets yet:** a card with Label "Set your targets", "Fuel counts down from a target. Set one for training days and one for rest days." and the targets form with **Save targets**.
  - **Summary** (R147): exactly two big numbers side by side (Barlow 44, wrapping only at large text), "Calories left" and "Protein left", whole numbers with separators; past the target "120 over" / "12 g over", never red. Then muted "Target: {kcal} kcal · {protein} g protein" (the day header above already says Training day or Rest day, so it is said once). Spoken amounts are in words and singular for exactly 1 ("Protein left, 1 gram", "1 calorie over").
  - **Macro bars** (R147, §18.1's "macro graphs" for the day): "Protein {eaten} / {target} g" over a 3pt text-colour bar on a surfaceRaised track, capped full; Carbs and Fat the same only when their target is set; a macro without a target is one muted line "Carbs 210 g · Fat 64 g".
  - **Entries:** Label "Food"; empty "Nothing logged on this day."; each row the name (Body 600), muted "{servings} × {serving label} · {kcal} kcal · {protein} g protein" (a quick add: just the macros; an entry from before 0007: "{n} servings"), then smaller "Carbs {c} g · Fat {f} g". Tap opens the entry sheet: servings with chips ½ 1 1½ 2 and a live line (rescaling the entry's own totals, R142), or for a quick add its name and four fields; **Save**, **Delete** ("Delete this entry?" **Delete** / **Keep**), **Cancel**. A quiet total row "Total · {kcal} kcal · {p} g protein · {c} g carbs · {f} g fat", summed unrounded and rounded once (R156).
  - **Add food** (filled) and **Quick add** (secondary) open `/food/add` for the day shown.
  - **Trends** (R149, R160): a card with Label "Trends", a segmented control Calories / Protein / Carbs / Fat (default Calories; four in a row when they fit, else two, else one, by measured width), the line chart of one point per logged day, the summary line "Average 2,140 kcal a day over 24 logged days.", and the range control **1M** (default, 30 days) / **3M** (91) / **1Y** (365), read "1M, last month" and so on. Today is left out (its day isn't over); an unlogged day is not a zero; no target line. "Nothing logged in this range." when the range is empty. The card is hidden until a day before today has food.
  - **Targets ›** (quiet) opens `/fuel-targets`: a hidden tab route with BackLink "Back" (it is opened from Fuel or Settings), Display "Targets", muted "Training days are days you finish a workout. Every other day uses the rest day targets.", and the form: Label "Training day" and Label "Rest day" (with a quiet **Same as training day**), each Calories, Protein (g), Carbs (g, optional), Fat (g, optional); errors "Needed." / "Check this number" beside each field; **Save** writes both and goes back. Unsaved changes ask "Discard changes?" (**Keep editing** / **Discard**) on Back, the Android back button, the dock or the header. Without Pro it shows the pitch.
  - **Add screen** (`/food/add?date&mode`, a modal over Fuel, R140, R141): a **Done** text button; Display "Add food"; muted "Logging for {today|yesterday|day}" (lower case mid-sentence, "Logging for Sat, Oct 3") (the `date` param wins over today); a Search / Quick add segmented control (`mode=quick` opens Quick add). Search: "Search foods", word-prefix matching (names starting with the query first), your own foods first in the list and tagged " · Yours"; with no query, Label **Recent** and up to 12 recently logged foods, or "Search the food list, or make your own."; no match "No food called {query}."; a compact **New food**. A food opens the servings sheet (its serving label and grams when known, servings default 1, chips ½ 1 1½ 2, a live line, **Add**, **Cancel**, and **Edit food** for your own). **Add** logs for the day, clears the search, stays open and shows and says **"Added {name}."** so a meal goes in one visit. Quick add: Calories, Protein (g), Carbs (g), Fat (g) and an optional name ("Quick add" when blank), needing calories or protein ("Enter calories or protein."). Closing with a quick add typed asks first; with nothing behind it (opened by address) it lands on Fuel.
  - **Your own foods** (`/food/new`, `/food/{id}`, a modal, R144): "New food" / "Edit food"; Name (≤ 60, unique among your foods ignoring case: "You already have a food called {name}."), "Serving" (placeholder "1 cup"), "Serving weight (g, optional)", Calories per serving (required), protein, carbs, fat (blank = 0); errors beside each field once Save is tapped; **Delete food** ("Delete {name}?", "Days you've logged keep it. It leaves the food list.") archives it. A food made from the add screen comes back and opens its servings. A bundled food can't be edited. Unsaved changes ask "Discard changes?".
  - The add screen searches through `createLocalFoodLookup` (the `FoodLookup` seam), given the app's data version: the food list is read and its names folded once per data version, so a keystroke only searches what was read, and a food saved since shows once its write bumps the version.

### 8.11 Settings
- Appearance (Light, Dark, System).
- Units (lb or kg, and distance).
- Plates (bar and pairs owned for each unit).
- Progression default increments.
- Rest timer length, the rest bell (on or off, default on) and the bell sound.
- Fuel targets (Pro).
- Apple Health or Health Connect (phone builds, phase 7): writing workouts, and each read (sleep, body weight, heart rate) switched on separately.
- Backups: the time of the last snapshot and the export buttons.
- GymHound Pro (status, Unlock, Restore purchases).
- Export (workouts CSV, food CSV).
- Developer, shown only when debug unlock is allowed (9): the Pro debug switch.
- About (version).
- Footer.
- **As built through phase 4**, in this order: Appearance, Units, Bar, **Plates**, **Progression**, Rest timer, Backups, Export, then **Developer** where the debug unlock is allowed (R126). Fuel, Health, Pro and About come with their phases.
  - **Plates** (R107), for the display unit only, as Bar is: "Pairs you own, for the plate calculator and barbell rounding." (muted); one 44pt row per size (the standard sizes always, your own sizes too, heaviest first) with a − count + stepper, 0–20 pairs; the last pair can't be removed ("Keep at least one pair."); "Add a plate size" (a multiple of 0.25 up to 100 lb or 50 kg, else "Check this number"); a quiet **Reset to defaults**.
  - **Progression** (R124): "Default increment", "New exercises in a routine start with this. Change any one in the routine editor." (muted), and a segmented control for the display unit: 2.5, 5, 10 lb or 1, 1.25, 2.5, 5 kg.
  - **Developer:** one switch, "Unlock Pro for testing" (R126).
- **As built through phase 5**, in this order: Appearance, Units, Bar, Plates, Progression, Rest timer, **Fuel**, Backups, Export, **GymHound Pro**, then Developer where the debug unlock is allowed. Health and About come with their phases.
  - **Fuel** (R145): Pro with targets: "Training day: {kcal} kcal · {p} g protein", "Rest day: …" and a secondary **Edit targets**; Pro with none: "No targets yet." and a filled **Set targets**; both open Fuel → Targets (`/fuel-targets`), once per tap. Not Pro (free, or lapsed with targets kept): "Fuel targets are part of GymHound Pro." and a secondary **See Pro** (the paywall). It follows Pro on and off with the screen open.
  - **Export** gains **Export food (CSV)** under Export workouts (R153): free, Pro or lapsed, phone app only (the web says "Export runs in the phone app."); nothing logged → "No food logged yet."; a failed share → "Couldn't open the share sheet."; while an export runs both buttons are faded and ignore presses.
  - **GymHound Pro** (R138): "Pro is on." (from the store), "Pro is on for testing." (only the debug unlock), or free "Free holds one routine of your own. Pro adds more routines and Fuel." with a filled **See Pro** (the paywall, once per tap); then **Restore purchases** (secondary) always, with the paywall's result lines, disabled under "Purchases aren't available in this build." when the build has no store. A store subscription that is on (RevenueCat, Pro not only for testing, an offer with a period) adds a quiet **Manage subscription**, which opens the store's own page.
  - **Developer:** the switch shows the stored debug unlock (`proDebugUnlock`), not whether Pro is on, so it can still be turned off where Pro was also bought (under RevenueCat with `pro_cached` on, Pro would stay on).

### 8.12 Paywall
- **Content:**
  - The title "GymHound Pro".
  - "Unlimited routines".
  - "Fuel: calories and protein, with training and rest day targets".
  - "Everything else stays free: logging, history, premade routines, your first routine, timer, plates, PRs, day marks."
- **Buttons:** **Unlock**, **Restore purchases**, **Not now**.
- ~~**No price is written in the app.** Unlock opens the store's purchase sheet, which shows the price. If Pro is sold as a subscription, the store's localized price string is shown at runtime under the button, as Apple requires.~~ Superseded in phase 5 (R157, R159): the app still writes no price of its own, but the store's price string is always shown before purchase, as below.
- **When no store is available** (Expo Go, or products missing), Unlock is disabled with "Purchases aren't available in this build."
- **As built in phase 5** (`src/ui/pro/ProPitch.tsx`, `app/paywall.tsx`):
  - Display "GymHound Pro"; two rows each led by a 20pt checkmark in the text colour: "Unlimited routines" and "Fuel: calories and protein, with training and rest day targets, and macro graphs"; muted "Everything else stays free: logging, history, premade routines, your first routine, saved workouts, timer, plates, PRs, Something off, body measurements and water." (R137).
  - Filled **Unlock**; under it, muted and centred, the store's price whenever there is an offer (R157, R159): "{price} a {day|week|month|year}", "{price} every {n} {units}" for a longer period, or "{price} once" for a one-time unlock. A subscription adds "Renews automatically until you cancel in your App Store or Google Play account." Then secondary **Restore purchases**, and on the full screen secondary **Not now**.
  - No store in the build (Expo Go, debug, free-only): Unlock and Restore purchases are disabled under "Purchases aren't available in this build." A store that is configured but has nothing to sell yet: only Unlock is disabled, under "The store isn't answering. Try again later." Opening the pitch asks the store for its offer again.
  - Results (R136): while either runs both are disabled over "Working…" (said once); Pro coming on says "Pro is on." and closes the screen (in the Fuel tab the pitch goes because Pro is on); a cancel says nothing; "Couldn't finish the purchase. Try again."; "Waiting for approval. Pro comes on once it's approved." (Ask to Buy or a delayed payment); "No earlier purchase found."; "Couldn't reach the store. Try again." Each line is announced.
  - **Terms of use** and **Privacy policy** links (44pt, muted, underlined) under the buttons, each only when the build sets `EXPO_PUBLIC_TERMS_URL` / `EXPO_PUBLIC_PRIVACY_URL` (R159); phase 7 supplies them, so none show yet.
  - The full screen (`/paywall`, R154) is a `fullScreenModal` above the tabs: no header, dock or footer; it scrolls, keeps clear of the notch and home indicator, and is at most 512 wide. Not now, or Pro coming on, goes back once (a purchase finishing after Not now doesn't pop the screen under it). Opened with Pro already on, it shows "GymHound Pro", "Pro is on." and a filled **Done**.
  - **See Pro** on the routine limit sheet (R138) closes the sheet and then opens `/paywall`; "GymHound Pro is coming." is gone. See Pro taps closer than 1 s apart open one paywall.

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
  - Water stays free (it always was), and a lapsed user's food CSV still exports (R153).
- **As built in phase 5** (`src/platform/entitlements/`, R133–R136, R157):
  - `Entitlements`: `isPro()` (synchronous, never waits on the network), `subscribe(onChange)` (fires when `isPro`, `isDebugPro`, the offer or `canPurchase` may have changed; fits `useSyncExternalStore`), `canPurchase()` (a store is configured and its `default` offering has a package), `canRestore()` (a store is configured), `refreshOffer()` (asks for the offering again; the paywall calls it on open), `offer()` (`{ priceString, period }`, `period` a `{ count, unit: 'day'|'week'|'month'|'year' }` from any single ISO 8601 period such as P3M, or null for a one-time purchase), `purchase()` → `'purchased' | 'cancelled' | 'pending' | 'unavailable' | 'failed'`, `restore()` → `'restored' | 'none' | 'unavailable' | 'failed'`, and `manageSubscription()` (opens the store's page; false when there is none, never throws). `AppEntitlements` adds `kind` (`'free' | 'debug' | 'revenuecat'`), `setDebugUnlock(on)`, `isDebugPro()` and `dispose()`.
  - **Free-only:** always false; nothing to buy or restore. **Debug:** Pro = `pro_debug_unlock` where the debug unlock is allowed; nothing to buy or restore. **RevenueCat:** `isPro()` = `pro_cached`, or the debug unlock where allowed (so the Developer switch still works in a TestFlight build). It configures the SDK, then without waiting reads customer info and the `default` offering (falling back to the current one; its first package); it reads customer info again whenever the app returns to the foreground and hears the store's own updates. Every customer-info result writes `pro_cached` from the `pro` entitlement. Every SDK failure is swallowed and Pro keeps `pro_cached` (§12). `purchase()` waits up to 10 s for the offering, then 'unavailable'.
  - **Selection** (`selectKind`, `createEntitlements`): RevenueCat when not in Expo Go and a key is set for the platform; if the SDK loader returns null or throws, debug or free answers. `entitlementsFor(db)` keeps one object per app (R126). Hooks: `useIsPro()` and `useEntitlementsState()` (`isPro`, `isDebugPro`, `canPurchase`, `canRestore`, `offer`, `kind`).
  - **RevenueCat isolation** (R134): `react-native-purchases` 9.15.3 is installed, pinned exactly, but only `revenuecatSdk.native.ts` names it, by a `require` inside `loadPurchasesSdk()`, which runs only outside Expo Go and only with a key; the web build resolves the `.ts` twin, which returns null, so the web bundle never contains it. Tests use a fake `PurchasesSdk`.
  - **Environment keys:** `EXPO_PUBLIC_REVENUECAT_IOS_KEY` and `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` (unset or empty = no store; never on the web), `EXPO_PUBLIC_TERMS_URL` and `EXPO_PUBLIC_PRIVACY_URL` (the paywall's links), all supplied in phase 7; `EXPO_PUBLIC_DEBUG_UNLOCK=1` allows the debug unlock outside `__DEV__`. No key is committed, so every phase 5 build runs debug or free.

## 10. Seed data

`seed_version` in settings controls upserts on launch. Bundled exercises, premade routines and foods are upserted by stable ID. User rows are never touched. Upserting a premade routine preserves `next_weight` on routine exercises that keep their ID.

### 10.1 Exercises
- **Count:** about 250. It may ship below that rather than block a phase.
- **Equipment:** barbell, dumbbell, cable, machine, kettlebell, bodyweight.
- **Patterns:** squat, hinge, lunge, horizontal and vertical push and pull, carry, core, isolation.
- **Muscles:** chest, front delts, side delts, rear delts, lats, upper back, traps, biceps, triceps, forearms, abs, obliques, lower back, glutes, quads, hamstrings, adductors, calves.
- **Aliases** include RDL, OHP, lat pulldown, hip thrust, and the common short names.
- **Weight and time:** farmer's carry, suitcase carry, yoke walk, sled push and sled drag are `weighted_time`. Custom exercises can choose that logging type too. Every other exercise stays as it is.

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
About 300 common foods with typical serving sizes, taken from USDA FoodData Central generic foods (public domain), stored in `src/seed/foods.json`. As built in phase 5: 305 foods from SR Legacy, seed version 5; source, licence and build in §18.10 (R139).

## 11. CSV export

- **Encoding:** RFC 4180 quoting, UTF-8 with a BOM so Excel reads it correctly.
- **Sharing:** files are written to the cache directory and opened in the share sheet.
- **`gymhound-workouts-YYYY-MM-DD.csv`:** one row per done set of finished workouts. Columns: `workout_id, date, started_at, finished_at, workout, routine, routine_day, day_mark, exercise, exercise_id, set_number, set_type, weight, weight_unit, reps, rpe, duration_s, distance, distance_unit, pr, exercise_note`. `exercise_note` is the note saved with that workout. The `pr` column holds kinds joined by `|`. Times are ISO 8601 with offset.
- **`gymhound-food-YYYY-MM-DD.csv`:** one row per entry. Columns: `date, logged_at, name, servings, kcal, protein_g, carbs_g, fat_g`.
  - As built in phase 5 (R153): rows by `date` (the day the entry is logged for) then `logged_at` (ISO 8601 with the offset at that instant); the entry's own copied name (through the formula guard) and totals, never the food's current ones; servings and totals to 2 decimals, unrounded beyond that. `serving_label` (R158) is **left out on purpose**: these columns are the whole file, and `name` with `servings` already says what was eaten. Free and kept after a lapse; share title "GymHound food". There is **no water CSV** (R150).

## 12. Failure handling

- **Transactions:** finishing a workout, saving a history edit, and deleting a workout are each a single transaction.
- **A finished workout cannot disappear.** The live database is one copy and the snapshots are the second (§17.2). Data is never wiped to recover, and the app never starts from an empty database while a snapshot exists.
- **Migrations:** they run at startup.
  - If the database is missing or empty while snapshots exist, the newest snapshot is restored first.
  - If a migration fails (including after a bad app update):
    1. The failed database file is set aside under a new name and never deleted.
    2. The newest snapshot is copied in and migrated.
    3. If that works, a one-time notice says "GymHound restored your data from {date}. A workout that was in progress may be missing."
    4. If it still fails, the app shows "GymHound couldn't update its database." with the error text, plus **Export my data**. Export shares the newest snapshot and the set-aside file (and the CSV files once phase 6 exists).
- **Snapshots:** a failed snapshot never fails the finish. It is retried at the next finish, and Settings shows the time of the last good one.
- **Health:** a failed write to Apple Health or Health Connect never blocks finish and never deletes or changes the workout. It is retried later (§17.1).
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
  - previous-result matching by set type and number, including warmups and empty history
  - Up next not advancing on discard, an empty workout, or a refused finish
  - the note copied at finish staying the same after later note edits
  - snapshot rotation (newest 7) and restore after a simulated migration failure, never ending with an empty database
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
  exercise/[id].tsx           phase 4: the custom exercise editor (`new` or an id), a modal over the picker. It takes
                              the place of the (tabs)/exercise/edit/[id].tsx planned above
  (tabs)/saved/[id].tsx       phase 4: a saved workout (hidden tab)
  (tabs)/body/[kind].tsx      phase 4: one body kind's chart and entries (hidden tab)
src/domain/                   progression.ts, ruleText.ts, stall.ts, prs.ts, plates.ts, units.ts,
                              streak.ts, volume.ts, fuelPace.ts, csv.ts (+ *.test.ts)
src/db/                       schema.ts, client.ts, migrations/, repositories/
src/seed/                     exercises.ts, routines.ts, foods.json, seed.ts
src/platform/entitlements/    index.ts, freeOnly.ts, debug.ts, revenuecat.ts
src/platform/restTimer/       index.ts, expoGoNotification.ts (phase 7: liveActivity.ts, androidOngoing.ts)
src/platform/sharePb.ts       phase 4: captures the personal best card and opens the share sheet (R106)
src/platform/exercisePhotoFiles.ts  phase 4: picks, crops, saves and resolves your own exercise photos (R111)
src/state/                    sessionStore.ts
src/ui/                       theme.ts, fonts.ts, Header.tsx, HoundMark.tsx, Dock.tsx, Footer.tsx, components/
src/ui/finish/                phase 4: FinishPrs.tsx, PbCard.tsx, PbCardHost.tsx, SaveAsWorkout.tsx (finish summary slots)
src/ui/body/                  phase 4: BodyLog.tsx (field, quick entry, chart with ranges), BodyEntrySheet.tsx
src/ui/charts/                phase 4: LineChart.tsx (hand-drawn SVG, R116; phase 6 reuses it)
app/food/add.tsx              phase 5: add food (search, Recent, servings) and Quick add, a modal over Fuel (R140, R141)
app/food/[id].tsx             phase 5: your own food (`new` or an id), a modal (R144)
app/(tabs)/fuel-targets.tsx   phase 5: Fuel → Targets (hidden tab, R145)
src/domain/                   phase 5: fuel.ts, fuelPace.ts, foodSearch.ts, water.ts, fuelTrends.ts; chart.ts gains
                              pointsInDays; dates.ts gains dayTitle and shiftDay
src/db/repositories/          phase 5: foodsRepo.ts, foodLogRepo.ts, foodOfferRepo.ts, waterRepo.ts; exportRepo.ts gains
                              foodCsvRows
src/db/migrations/0007_*.sql  phase 5: water_log and food_log.serving_label
src/seed/                     phase 5: foods.json (305 foods), foods.ts (loadSeedFoods, seed path only); SEED_VERSION 5
scripts/build-foods.mjs       phase 5: builds foods.json from USDA FoodData Central SR Legacy (R139)
scripts/vendor/usda-fdc/      phase 5: picklist.json (the hand-picked foods) and sr-legacy-subset.json (vendored data)
src/platform/entitlements/    phase 5: index.ts (interface), freeOnly.ts, debug.ts, revenuecat.ts, select.ts, useIsPro.ts,
                              revenuecatSdk.native.ts (the only file naming react-native-purchases), revenuecatSdk.ts (web)
src/platform/runtime.ts       phase 5: isExpoGo, revenueCatApiKey
src/platform/foodLookup.ts    phase 5: the FoodLookup seam (searchLocal)
src/state/createdFood.ts      phase 5: hands a food made from the add screen back to it
src/ui/pro/                   phase 5: ProPitch.tsx, useStoreAction.ts, openPaywall.ts
src/ui/fuel/                  phase 5: DayHeader, WaterCard, WaterSheet, FuelSummary, MacroBars, FoodEntries,
                              FoodEntrySheet, ServingsSheet, QuickAddForm, MacroFields, TargetsForm, FuelTrends (.tsx)
src/ui/session/FoodOfferBanner.tsx  phase 5: the Short on food offer (§7.10)
assets/brand/                 hound-head.png (master, from the logo), mark*.png, mark-dark*.png, icon, splash
```

## 15. Phases

Each phase gets its own implementation plan and ends with its acceptance check.

1. **Header, themes, Train, offline session**
   - Scaffold, OneDrive junction, schema and migrations, seed premade routines plus the exercises they use, theme and fonts, hound mark (owner approval), header, dock, footer, Train.
   - The header keeps the hound and GYMHOUND on one line at every width.
   - Session: start empty or from Up next, log sets, tick, rest timer with the Expo Go notification, finish, discard, resume.
   - The previous result on every set row, matched by set type and number (§8.4).
   - The rest bell and haptic, and the bell settings (§8.4).
   - The note copied at finish (§6).
   - Snapshots after every finish, and restore on a failed migration (§17.2).
   - Up next advancing only on a finished day (§8.3).
   - The `weighted_time` logging type in entry, tick and the previous column.
   - A basic name search for adding exercises.
2. **Day marks and the rule**
   - Mark chip, `computeOutcome` (including `weighted_time`), rule line and today's read, override, finish summary with next weight, Up next showing last time's outcome and today's load.
3. **Routines and the free limit**
   - Routines screen, detail, set active, duplicate, editor, the `Entitlements` interface with the free-only implementation, and the one-sentence stop on the second user routine.
4. **Library, custom exercises, plates, bodyweight, PRs**
   - Full seed (about 250, including the carries and sleds as `weighted_time`), search with filters, custom exercises (all logging types, including weight and time), plate settings, calculator and barbell rounding, the bodyweight log, PR flags and finish-summary PRs.
   - **Built (2026-10-11; owner review pending):** as §18.9. The library, search and form demos moved to phase 3 (§18.8); the calculator and barbell rounding were built earlier; phase 4 built custom exercises with your own photos, saved workouts, plates owned and the default increment in Settings, bodyweight and seven measurements with charts, PR flags with personal bests on the finish summary, and sharing a personal best as an image.
5. **Pro, paywall, Fuel**
   - Debug and RevenueCat implementations, paywall screen, Fuel (foods seed, log, quick add, custom foods, targets, summary, training-day switch), and the Short on food offer.
   - **Built (2026-10-11; owner review pending):** as §18.10, at `phase-5` 3fc8818 (134 suites, 2,964 tests). Entitlements (free-only, debug, RevenueCat code that stays asleep without a key), the paywall and See Pro, Settings → GymHound Pro and Fuel, 305 USDA foods, the Fuel day (water, summary, macro bars, entries, add food, quick add, your own foods, targets, trends) and the Short on food offer, the food CSV. Water with your own goal is free. Live store products are phase 7. Fixes from the final review are open (§18.10).
6. **History, Stats, CSV**
   - History list, detail (with the saved notes), edit and delete with recompute, Stats charts with mark and stall labels, records, bodyweight chart, CSV export (with `exercise_note`).
7. **Native build** (when the Apple Developer account exists)
   - EAS development builds, the iOS Live Activity and Android ongoing notification for the rest timer, and live RevenueCat products.
   - Apple Health and Health Connect: write-out and the three reads (§17.1).
   - The cloud copy of snapshots: iCloud on iPhone, Android backup (§17.2).
   - The music player (§17.3).
   - The chosen bell sound on the lock screen.
   - This phase is outside the acceptance list below.
8. **Watch apps** (later): Apple Watch and Wear OS only (§17.4).

## 16. Done when

- The hound head and the red GYMHOUND are at the top in light and dark.
- A free user can run a premade day, log sets, see last time, rest, finish, and see next time already raised if the day was Normal and they hit the range.
- A marked day keeps the weight and says why on the chart.
- A free user can save one routine and is stopped, in one sentence, on the second.
- Pro unlocks more routines and Fuel, and a finished workout uses the training-day targets.
- The FieldHound-style footer ("powered by" over the GRUNTHOUND LLC wordmark) is pinned to the bottom of Train, History, Stats, Fuel, and Settings.
- The app opens with no network and no account.

Added by the owner on 2026-10-09:
- The hound sits on the left of red GYMHOUND, on one line, at every phone width including under 360pt.
- Every set row shows that same set's last result beside the input. It is empty with no history, and a warmup is never the previous result for a working set.
- Up next only advances when that day is finished.
- A finished workout survives a failed migration, because it is restored from the newest snapshot. The app never starts empty while a snapshot exists.
- The rest timer ends with a bell and a haptic, including on a locked phone. The bell can be turned off.
- A note follows its exercise, and a finished workout keeps the note it was saved with.

## 17. Phone integrations and data safety

### 17.1 Apple Health, Health Connect and watches (phase 7)
- **The sync:** Apple Health on iPhone, Health Connect on Android.
  - Apple Watch, Garmin, Galaxy Watch, Pixel Watch, Fitbit, Polar, Coros, Suunto and the rest already write to those stores. So GymHound never talks to a watch brand and never asks for a brand's cloud login.
- **Write-out:**
  - After a workout finishes and its transaction commits, GymHound writes it as one strength-training session with the start and end times and the workout name.
    - Apple Health: a traditional strength training workout.
    - Health Connect: a strength-training exercise session.
  - The returned id is kept in `workouts.health_record_id`, and `health_status` becomes `done`.
  - A failure sets `failed`, and the write is retried at the next app start and the next finish.
  - Deleting a workout in History also removes the record GymHound wrote. This is best effort: if Health refuses, the workout is still deleted in GymHound.
- **Reads:** each is switched on separately in Settings, and none is ever used as the log.
  - **The Rough sleep offer:** offered when last night's sleep is under 6 hours, or resting heart rate is 10 bpm or more above its 28-day average.
    - It is one offer, not two, even if both conditions hold.
    - It is made once per session, at the start, with the same no-nagging rule as the Short on food offer.
    - The user taps it. GymHound never marks the day by itself.
    - The owner confirmed these thresholds.
  - **Body weight:** a newer reading than the app's latest fills the body-weight card.
- **Never:**
  - Workouts are never read back from Health.
  - Health is never the source of truth and never the backup.
  - A Health failure never blocks finish and never deletes or changes a workout.

### 17.2 Snapshots and backup
- **Snapshot:** after every successful finish, GymHound writes a complete copy of the database (SQLite `VACUUM INTO`) to `snapshots/gymhound-{timestamp}.db` in the app's documents folder.
  - It keeps the newest 7 and removes older snapshot files only.
  - `last_snapshot_at` records the last good one.
  - The phone builds do this from phase 1. The browser build skips it.
- **Restore:** the newest snapshot is restored when the database is missing or empty, or when a migration fails (§12). The live file is never deleted.
- **Export** stays available from Settings, and from the error screen even when the database cannot open.
- **Your own exercise photos (phase 4, R111)** are files in the documents folder's `exercise-photos/`, not in the database. They are **not** in a snapshot or in "Save a backup copy": a restored snapshot names files that may be gone, and a missing file reads as no photo.
- **The copy that survives a dead phone (phase 7, once the developer accounts exist):**
  - On iPhone, the newest snapshot is copied to iCloud.
  - On Android, the snapshot folder is included in Android's backup.
  - Restoring on a new phone uses the newest backed-up snapshot.

### 17.3 Music player (phase 7, phone builds only)
- **Shown on:** the session screen only, as a small bar above the rest timer.
- **Controls:**
  - The current song.
  - Play / pause.
  - **Previous** and **next** change the song.
  - **Skip back** and **skip forward** move 15 seconds inside the song.
- **What it controls:** whatever is already playing, Apple Music or Spotify, through the phone's media controls.
  - If nothing is playing, it shows two buttons instead: one opens Apple Music and one opens Spotify.
  - It has no library, search or playlists.
- **The bell** ducks the song for a moment and never stops it.
- **Platform limits** (stated so phase 7 plans around them):
  - **Android:** any player that publishes a media session (Spotify, Apple Music for Android, others) can be shown and controlled, after the user grants notification access once.
  - **iPhone, Apple Music:** controlled through Apple's music player, with the song, play/pause, previous/next and seek.
  - **iPhone, Spotify:** Apple lets an app control another app's playback only for Apple Music. Spotify can be controlled only through Spotify's own App Remote SDK. That needs GymHound registered as a Spotify developer app, plus a one-time "connect" in the Spotify app. No GymHound account is involved.
    - **The owner chose to include it.**
    - If the Spotify registration is not ready in phase 7, Spotify on iPhone falls back to the open-Spotify button.
    - Apple Music support is never dropped.
  - **Other players on iPhone** get the open-app buttons only.

### 17.4 Watch apps (phase 8)
- A watch app that logs each set on the wrist, for Apple Watch and Wear OS only.

### 17.5 Camera, photos and sharing (phase 4, phone builds only)
- **Permission strings** (`app.json`, the `expo-image-picker` plugin; used by the phase 7 builds, Expo Go shows its own):
  - Photos: "GymHound uses your photos only for exercise pictures you choose."
  - Camera: "GymHound uses the camera only to take an exercise picture."
  - The camera is asked for on the first **Take photo**. Choosing a photo asks for nothing: the phone's own picker hands over only the photo chosen.
  - Photos only, never video, so no microphone access is needed. The image picker plugin sets `microphonePermission: false`, so no microphone prompt is added on iOS and Android's `RECORD_AUDIO` is removed.
- **Your own photos:** cropped 3:2 (iOS's picker crops square, so GymHound crops again) and saved 720 px wide as JPEG at 0.7 in `exercise-photos/` (§6 `exercise_photos`, §17.2).
- **Share a personal best:** the card is captured as a 1080 × 1350 PNG into the app's cache (the temporary folder) and handed only to the share sheet; on iOS it is released once the sheet is done, and Android's are cleared by the capture module. Nothing is written anywhere else and nothing is uploaded.
- None of this exists in the browser build: no photo controls, no Share pill.
- Garmin, Whoop and other brands cannot run it. They reach GymHound only through Health (§17.1).

## 18. Owner additions after the first device check (2026-10-10)

The owner's report is kept in the build log. Where this section and an earlier one disagree, this section wins.

### 18.1 Decisions
| Topic | Decision |
|---|---|
| Landing | A phase 1 patch lands on `phase-1` before the merge (§18.2). Everything else folds into phases 2–6, each with its own plan and branch (§18.3) |
| Marks | **Per exercise only.** The session-wide day-mark chip is dropped. Each exercise's ⋯ menu has **Something off**, with a reason (Rough sleep, Sick, Short on food, Pain, Cutting). A flagged exercise holds its weight next time, and its chart says why. The Short on food offer (7.10) and the Rough sleep offer (§17.1) become one-tap offers to flag every exercise in the session. The phase 2 plan settles the details and replaces `workouts.day_mark` with a per-exercise mark |
| Exercise library | Built from **free-exercise-db** (github.com/yuhonas/free-exercise-db, public domain under the Unlicense): about 300 exercises picked from its ~870, each with a few lines of steps and two photos (start and end) that flip as the form demo. Photos are shrunk to keep the app small (under 10 MB in total). This replaces "about 250" in §3 and §10.1 |
| Saved workouts | A saved workout remembers the last weights, sets and reps. Start it any time, or add it as a day in one of your routines |
| Pro | Unchanged: more than one routine of your own, and Fuel (now including macro graphs). Everything else added here is free |

### 18.2 Phase 1 patch (on `phase-1`, before the merge)
- **Remove a set:** the set-type sheet (tap the set number) gets **Remove set**. Long-press stays.
- **Add a warmup:** **+ Add warmup** beside **+ Add set** inserts a warmup after the exercise's existing warmups and before its first other set. (Labels superseded by §18.6: **+ Set** and **+ Warmup**.)
- **More than one workout a day:** works. Each finished workout keeps its own row, and the streak and This week count them.
- **Back on Routines:** a visible back control returns to Train. The dock's Train tab stays the home button.
- **Units and bar:** Settings gets Units (lb or kg, and mi or km) and Bar (Standard 45 lb / 20 kg, Women's 35 lb / 15 kg, Technique 15 lb / 5 kg, or a custom weight) for each unit. Switching the unit follows 7.1.
- **Plate calculator** (the ⋯ menu, barbell exercises): bar plus plates per side for a target weight, using the Settings bar and plates (7.7).
- **Rest per exercise:** the ⋯ menu gets **Rest time**. It belongs to the exercise, like its note, and follows it everywhere. **Off** turns rest off for that exercise, and **Default** uses the Settings length.
- **Rest under the set:** while a rest runs, its countdown, **−15s** and **Skip** also show under the set that started it. (Superseded by §18.4: the bottom bar is now only a fallback. §18.6 adds **+15s**.)
- **Music in Expo Go:** a music button in the session header opens a sheet with buttons that open Apple Music (iPhone only), Spotify and Audible. Not in the browser build. Real controls stay in phase 7 (§17.3). Audible on iPhone only ever gets the open button.

### 18.3 Folded into later phases
- **Phase 2 (marks and the rule):** the per-exercise Something off flag (§18.1).
- **Phase 3 (routines):** create and edit your own routines; saved workouts. The premade programs become eight, built on current evidence: about 10–20 hard sets per muscle per week, and each muscle trained at least twice a week where the split allows:
  - Push/pull/legs
  - 4-day upper/lower
  - Beginner full body
  - Advanced full body
  - Bro split (once a week per muscle, as the owner asked)
  - Dumbbell full body
  - Calisthenics
  - Mobility (timed holds)

  5×5 and No equipment leave the Premade list. A user who has one active or in history keeps it.
- **Phase 4 (library, plates, body):** the free-exercise-db library with the photo demo and steps on tap; custom exercises; plates owned in Settings; bodyweight plus measurements (waist, chest, hips, arms, thighs, neck, body fat %), each with a chart; PR flags; **Share a personal best** (an image through the share sheet; GymHound uploads nothing).
- **Phase 5 (Pro, Fuel):** Fuel, with macro graphs and trends; the water logger with a custom daily goal (free).
- **Phase 6 (History, Stats):**
  - History, including **Repeat**, which starts a new workout copied from a past one.
  - Trends for every lift and every measurement.
  - Rule-based analytics: weekly sets per muscle against 10–20, sessions, PRs, and the bodyweight trend.
  - A weekly check-in.
  - The consistency tracker, a calendar of finished workouts.
  - Progress photos, kept in the app's own folder on the phone.
  - The pedometer: on iPhone, steps today and the last 7 days. On Android, Health Connect in phase 7.
  - CSV.
- **No AI coach:** "smart analytics" means rules and counts.
- **§2 non-goals lifted:** the calendar view of history (the consistency tracker), and sharing, for a personal-best image only.

### 18.4 After the owner's iPhone check (2026-10-10)
The check gave 33 pass, 2 fail and 4 skipped. The owner decided the following. Where this section and an earlier one disagree, this section wins.
- **Keyboard:** a Done bar sits above the iOS number pad. Ticking a set, scrolling the workout, and every control that opens a sheet also close the keyboard (plan Task 24).
- **Snapshot diagnostics:** Settings → Backups shows why the last snapshot failed, with its time. If a snapshot was recorded but its file can't be listed, it says that and shows what the listing found. Phone builds only (plan Task 25).
- **Footer on Fuel:** the footer appears on Train, History, Stats, Fuel and Settings. This changes §8.1, §16 and the global constraints.
- **Bell volume:** the three bundled bells are re-made near full scale. Settings gets **Bell volume**: 25%, 50%, 75% or 100%, default 100%, stored as `rest_bell_volume`. It sets the in-app bell's volume within the phone's own volume. The lock-screen notification in Expo Go still uses the system sound (§8.4).
- **Rest bar:** the countdown shows only under the set that started the rest. The bottom rest bar is removed, which changes §8.4 and §18.2. When that set no longer exists (removed or replaced), the bottom bar shows as a fallback, so a running rest is never invisible (ruling R41).
- **Music bar (owner, 2026-10-10):** the session's Music button at the top picks Apple Music (iPhone), Spotify or Audible. Picking one slides up a music bar at the bottom of the session, where the rest bar was. In Expo Go it shows the chosen app with **Open {app}** and a close ×, and it remembers the choice (`music_app`) until closed. In phase 7 the same bar gains the song, play/pause, previous/next and ±15s (§17.3). It is never in the browser build.
- **Keyboard (ruling R43):** the iOS Done key is React Native's built-in Done toolbar on number pads (`returnKeyType="done"`), not a custom accessory bar.

### 18.5 After the owner's second iPhone check (2026-10-10)
- **Result:** 15 pass, 1 fail, 1 skipped (VoiceOver, optional). The keyboard and the music bar passed, and so did every owner note.
- **Snapshot root cause, found and fixed:**
  - On iOS, `Directory.list()` hands back a URI form whose `File.size` reads null. So `expoSnapshotFiles().list()` dropped every snapshot.
  - That hid the Share button, and it also meant the startup restore and the keep-7 pruning could not see any snapshot.
  - Reading the size through the app's own path (final fix G2) made Share appear and open the share sheet on the iPhone.
- **Backup wording:** the snapshot is a backup only GymHound can read, so the owner expected the shared file to open somewhere. The button now reads **Save a backup copy**, with the line "A backup file for restoring GymHound. Keep it in Files or iCloud Drive; it won't open in other apps."
- **Workouts CSV, brought forward from phase 6:** Settings gets an **Export** section with **Export workouts (CSV)**, per §11.
  - One row per done set of finished workouts, with the §11 columns.
  - RFC 4180 quoting, UTF-8 with a BOM.
  - Written to the cache folder, then opened in the share sheet ("Open in Numbers", Save to Files, and so on).
  - Phone builds only. The food CSV stays with Fuel (phase 5).
  - Until phase 2 and phase 4, `day_mark` is the workout's stored mark and `pr` lists the kinds in `pr_flags`, which may be empty.
- **Bells:** "each level needs to be a little louder". The bundled bells gain about 3 dB more average loudness, with the peak still at −1 dBFS and the tone kept clean. The 25/50/75/100% steps keep their meaning.

### 18.6 Polish pass after the UX review (2026-10-10)
The owner picked the seven highest-impact items from the UX review and approved the Train reorder and **+15s**. The plan is `docs/superpowers/plans/2026-10-10-gymhound-polish.md`. Where this section and an earlier one disagree, this section wins.

- **Colour tokens:** `textFaint` and `borderStrong` join the §8.2 table.
  - Both read at 3:1 or better on `bg` and `surface`, and `borderStrong` also on `surfaceRaised`.
  - The review's light `textFaint` (#9a9386) measured 2.75:1 on `bg`, so #8f897d replaces it.
- **Train leads with today's workout** (replaces the order in §8.3):
  1. The greeting and date, unchanged.
     - Round 5 (the date was gone at the largest text, R79): the date is one line that shrinks to fit (`numberOfLines={1}`, `adjustsFontSizeToFit`, `minimumFontScale` 0.3) at any text size, with no fixed line height. iOS shrinks only the font to fit, never a fixed line height, which grows with the text size. The greeting wraps if it needs to.
  2. One of three cards:
     - **Up next**, when no workout is active and a routine is:
       - The eyebrow "UP NEXT", then the title "{routine} · {day}".
       - One line: "First time on this day." or "Last time: {date} · {mark}".
       - A filled **Start {day}**, for example "Start Upper A". A day whose name has one or two characters, or is still named "Day {n}" as the routine editor names a day left unnamed, reads "Start {routine} {day}", for example "Start 5×5 A" or "Start My split Day 1". A workout started from the day is named the same way (R56); workouts already stored keep the names they were stored with.
       - One line per exercise: the name on the left, and the scheme and load on the right ("4×5–8 · 60 kg").
       - A loadable exercise with no weight shows "—" when another exercise that day has a weight.
       - When no exercise has a weight, the rows show no load, and the line under the title ends "Pick weights as you go." The words "pick a weight" are gone.
       - A quiet **Change routine ›** at the foot of the card opens Routines.
     - **No routine:** one card reads "No routine yet. Pick one and Train will line up your next workout.", with a filled **Choose a routine** and an outlined **Start empty workout**.
     - **In progress:** the Resume card, with the eyebrow "IN PROGRESS". Resume is the only filled button. Start empty workout and Up next are hidden.
       - Round 4: the same quiet **Change routine ›** sits at the foot of the Resume card, under Resume, so Routines is reachable while a workout runs.
       - Round 5 (R80): the routine can't change while a workout runs, so this Change routine opens a sheet instead of Routines: the title "Workout in progress", the text "Finish or discard the workout in progress before changing routines.", a filled **Resume** that opens the session once the sheet has closed, and **Not now**. **Set active** on Routines shows the same sheet while a workout runs, and changes nothing (before, it changed the routine silently, and Train, showing the workout in progress, never showed it).
  3. Streak and This week.
  4. An outlined **Start empty workout**, in the Up next state only.
  5. The footer.
  - The "Finish or discard the workout in progress first." sheet stays as a guard against a stale screen or a double tap. Its **Resume** opens the session once the sheet has closed.
  - Not in this pass: warmer zero-state captions, and showing Up next loads in the display unit (§7.1).
- **Carry today's values** (adds to §8.4 Prefill):
  - A set with no matching previous set takes today's own values as placeholders.
    - Each field comes from the nearest set above it of the same type, ticked or typed and saved, converted to the entry unit.
    - Typed 62.5 on set 3 carries to set 4.
  - Today's target still wins for the weight, and real history wins for the whole row.
  - `rep_max` (reps or seconds) wins over carried reps or time.
  - Bodyweight plus never carries a 0 load.
  - The Previous column never shows a carried value.
  - What a set shows is what its tick logs. A value typed in another row carries once that row is left.
- **A tick that is not ready says why** (replaces "the tick stays disabled" in §8.4):
  - The tick keeps a full-strength dashed ring and stays pressable.
  - The tick's column is 44pt wide, with the 40pt ring centred in it. Its tap area reaches 4pt above, below and right of the ring but not left, so a tap just left of the ring never lands on the reps field (R67).
  - A tap ticks nothing. It focuses the missing field, shows a muted line under the row and gives a warning haptic. The line is "Add a weight to tick", "Add reps to tick", "Add a time to tick" or "Add a distance to tick".
  - Round 4 (the phone gave no buzz and the keyboard opened on reps):
    - The haptic comes first, before anything moves the keyboard, which can swallow it. It is a heavy impact (`Haptics.impactAsync(Heavy)`), distinct from the tick's light one, in place of the warning notification.
    - The field to focus is the first missing one in column order (weight before reps). It is focused once the row has drawn its line, so nothing that tap re-renders (the line, or a blur that saves another field) comes after the focus.
    - The line is also announced (`announce`), since VoiceOver does not read a live region on iOS. "Check this number" is announced the same way.
  - Round 5 (still no line and no buzz on the phone, R82):
    - The line sits above the row's inputs, not under them. It was drawn, but the keyboard comes up for the focused field and the session scrolls only that field clear of it, so a line under the row was under the keyboard.
    - The heavy haptic is still the first thing the tap does. The field is focused only once the haptic has played (its promise settles), so the keyboard no longer comes up in the same moment as the buzz.
  - Round 6 (still no line and no buzz, R99): a not-ready tick buzzes (notification Warning) and shows the line without focusing the field; the keyboard coming up was swallowing the buzz and hiding the line.
    - The tap leaves the keyboard as it was. The line is in the full text colour at body size (it follows the phone's text size), led by an `alert-circle-outline` icon inside the text, still never red. "Check this number" looks the same.
    - The field the line asks for gets the heavier muted underline a number to check has, so the person taps it themselves. Typing in the row clears both.
  - A number that needs another look shows "Check this number" instead.
  - The line names the field that is missing now, which a value carried from the set above can change after the tap. Typing in the row clears the line until the next tap.
  - The tick's VoiceOver hint is "Enter a weight first" (or "Enter reps first", "Enter a time first", "Enter a distance first").
- **Finish confirm** (replaces "{n} sets aren't ticked" in §8.4):
  - Finish first saves whatever is typed, then reads the workout.
  - Nothing ticked: the "Nothing is ticked yet." sheet, as before.
  - Every set ticked: Finish goes straight through.
  - Otherwise a sheet asks first (R57, Round 4):
    - When whole exercises have no tick, the title names them: "{names} has nothing logged" or "{names} have nothing logged". Up to three names are listed in full; more read "A, B and {n} more".
    - Otherwise the title is "Finish {workout}?".
    - The body is "{done} of {total} sets done. Incomplete sets won't count, and Up next moves to {day}." The Up next part appears only when the workout's routine is the active routine. Otherwise the body ends "Incomplete sets won't count."
    - The word "Unticked" is not used in this sheet.
  - The buttons are **Keep logging** and **Finish anyway**. Keep logging is the filled default when a whole exercise has no tick. Otherwise Finish anyway is.
  - Counts include warmups. An exercise with no sets is never listed.
  - Finish anyway finishes once the sheet has gone (R55). Until then, a second tap on Finish anyway, Finish or Discard does nothing. If the finish fails or is refused, they work again.
  - Finish puts the keyboard away first, since it can open a sheet.
- **Session header** (replaces the §8.4 Header; §18.1 already dropped the day-mark chip):
  - Back, then the workout name with a muted line under it, "{done}/{total} sets · {elapsed}". A workout with no sets shows only the time.
  - Then Music (phones only) and a small outlined **Finish**.
  - The bottom Finish is gone. Add exercise and Discard stay at the bottom.
  - A 2pt text-colour line along the header's bottom edge fills with the share of sets ticked.
  - The name, the line under it and the Finish label stop growing at 1.3× the phone's text size, so the header stays one row. This is the only exception to §8.2's text-size rule besides the wordmark.
  - Round 4 (the header clipped at the bottom and right at the largest text):
    - At 1.3× the name and the line under it need about 55pt, which left under 1pt in the 56pt row, and the 2pt progress line was drawn over the bottom of the row. The row now has 4pt above and below its text, so the header grows instead, and the progress line has its own 2pt strip under the row.
    - The header has no fixed height. Back and Music are 44pt and never shrink; the name column takes what is left and truncates.
    - The line under the name is two parts in a row, read as one label: the count ("5/18 sets") shrinks and truncates first, and the time (" · 24:10") is never cut.
    - Music has 8pt to Finish, so their 4pt hit slops never overlap.
  - Each exercise block shows a muted "{done}/{total}" before ⋯.
    - Design pass (2026-10-11, pending the owner's iPhone check): the count leads the quiet group described under §18.7 R81, which follows the name. ⋯ stands alone at the right edge, level with the name.
  - The next set to do has a bolder tick ring (2.5pt, text colour). It is the first unticked set in workout order. In a superset, it is in the member with the fewest ticked sets, with the earlier member winning a tie.
- **Suggested values look like suggestions:**
  - Today's target and every placeholder (from last time, the rule or a carry) draw with no fill, a dashed `borderStrong` outline, `textFaint` and Barlow 600.
    - VoiceOver adds the hint "Suggested. Tick the set to log it.", except on a ticked set, where a tap on the tick would untick it.
  - A typed, saved or ticked value draws solid: a `surface` fill, a `borderStrong` outline, the `text` colour and Barlow 800.
  - A cleared weight field on a row with a target shows the target as its placeholder, which is what the tick logs. A ticked set does too: leaving the weight blank takes the tick off, and the open row then shows the target.
- **Slimmer exercise blocks** (replaces the always-open note in §8.4 and the §18.2 button labels):
  - An empty note shows a quiet **+ Note** with a pencil in the name row. It opens the note field, focused.
    - Design pass (2026-10-11, pending the owner's iPhone check): + Note sits in the name row's quiet group (see §18.7 R81), beside the name when it fits, else on the line under it.
  - A saved note shows in full as a muted line under the name. Tap it to edit.
    - Round 5: the line leads with + Note's 14pt pencil. With a note saved there is no + Note, and the plain muted line read as the first line of the rule under it (phase 2), so the note looked missing on those exercises.
  - The note saves when the field is left and on every flush (R29). A blank note clears it.
  - **+ Set**, then **+ Warmup**, as quiet compact buttons (36pt, with 44pt targets) on one line under the table. They behave as §18.2 says.
    - Compact buttons (these and the rest pills) are at least 44pt wide.
- **Rest row as a live timer** (replaces the countdown line in §8.4):
  - Under its set, the row shows:
    - a small REST label over the countdown, in Barlow 800 at 32pt;
    - a 3pt text-colour track that drains;
    - outlined pills **−15s**, **+15s** and **Skip**.
  - With large text the three pills wrap together under the countdown, 8pt apart, and wrap among themselves when one line cannot hold all three.
  - The track keeps the length the rest started with: +15s or a new choice from the countdown does not rescale it.
  - If you leave the session and come back mid-rest, the track uses the exercise's current rest length.
  - The row has a `surface` fill and a `borderStrong` edge, so it never looks like a done set.
  - +15s moves the end and reschedules the notification, as −15s does. Once the rest has ended it does nothing.
  - −15s and Skip, like +15s, do nothing once the rest has ended.
  - Tapping the countdown opens this exercise's rest choices. A choice sets future rests. The running rest keeps its end.
  - At zero the row reads "Rest's up · Set {n} next" for 10 seconds, or until a set is ticked.
    - The Rest's up row keeps the running row's height, so the sets below don't move.
    - It reads "Warmup next" (or "Drop set" or "Failure set") for those types, and the exercise's name when the next set is in another exercise. With nothing left, it reads just "Rest's up".
    - Round 4: it names another exercise only after the last set of this one. While the exercise holding the rest (in a superset, its run) has a set left, it names that set, or in a superset the member whose turn it is. Once it is done, it names the workout's next set (which may be an earlier exercise left open).
    - Skip shows nothing.
  - **VoiceOver:**
    - A tick announces "Set 2 logged. Rest 2 minutes.", or "Set 2 logged." when no rest starts.
    - The bell announces "Rest over".
    - On iOS every announcement is said half a second later, so VoiceOver reading the tapped tick again does not cut it off.
    - The countdown reads as a duration: "Rest, 1 minute 45 seconds left". The bottom bar's countdown does too.
  - The fallback bottom bar (R41) gets +15s and the same pills.

### 18.7 Phase 2: Something off and the rule (2026-10-11)
The owner asked for phase 2 to start overnight without a review stop, so the choices below are Claude's rulings (R60–R66), for the owner to check in the morning. The plan is `docs/superpowers/plans/2026-10-11-gymhound-phase-2.md`. Where this section and an earlier one disagree, this section wins.

- **Something off, per exercise (R60):**
  - Each exercise in a session can be flagged from its ⋯ menu: **Something off** opens a sheet with Rough sleep, Sick, Short on food, Pain and Cutting, plus **Nothing off** to clear it. It is stored as `workout_exercises.mark` (null = nothing off).
  - A flagged exercise shows a muted line under its name, "Something off: {reason}".
    - Round 5 (R81): that line is gone. The name row has a quiet **Something off** control beside + Note, in the same compact style (a 14pt `alert-circle-outline` and the words), in the order [name][count][+ Note][Something off][⋯]. Flagged, it shows the reason instead ("Rough sleep"), muted, never red. Tapping it saves what is typed, puts the keyboard away and opens the ⋯ sheet straight on the Something off reasons. VoiceOver reads "Something off for {name}" or "Something off for {name}: {Reason}". Wider than the row (the largest text), the controls wrap among themselves, right-aligned.
    - Design pass (2026-10-11, the design pass's change, pending the owner's iPhone check; it replaces the layout in the line above): the count, + Note and Something off with ⋯ never fitted beside a name on a phone (about 217pt of icons and words before any spacing, against 288 to 358pt of row and 101 to 179pt names), so every block spent a 44pt row on them, and at 320pt ⋯ wrapped onto a third line. Now:
      - ⋯ stands alone at the right edge, a 44pt box level with the name's first line, over the tick column. The name always keeps the width beside it.
      - The count, + Note and Something off are one quiet group that follows the name: beside it on the same line when both fit (a short name, a flagged day with a saved note, a tablet), otherwise on a line under it, left-aligned with the name. The order stays [name][count][+ Note][Something off][⋯].
      - + Note and Something off draw a 24pt line and reach 10pt above and below it (44pt targets) and 6pt to each side (half the 12pt gap). Whatever is drawn under the name row (the note line, the note field, the rule line) starts 10pt down, so no later sibling takes part of those targets. The block's header is 53pt on a phone (was about 70pt at 390pt and 114pt at 320pt).
      - At large text the name wraps, the group wraps among itself (20pt apart, so the reaches never overlap) and words wrap rather than end in "…".
  - `workouts.day_mark` stays in the database but the app no longer reads or writes it. The CSV keeps its `day_mark` column and fills it from the exercise's mark ("normal" when nothing is off).
  - The Short on food and Rough sleep one-tap offers wait for Fuel (phase 5) and Health (phase 7).
- **The rule (§7.3) runs at finish, per exercise.** "Marked day" means the exercise is flagged.
  - The working weight keeps the unit of the set it came from; the next weight uses that unit, with the increment converted by the gym convention (R62). `planned_weight` keeps its own unit.
  - `routine_exercises.next_weight` is written from the workout exercise that just finished.
- **The rule line and today's read (§7.4)** show under each exercise's name, muted. On a flagged exercise, "Today is marked, so {planned} holds." reads "{Reason} today, so {planned} holds." (R61), for example "Rough sleep today, so 185 lb holds."
- **Override today's weight** (⋯ menu): a sheet with one number field in the display unit, **Save**, **Clear** and **Cancel**. It changes today's target only and is never written back to the rule.
- **Finish summary (§8.5):** one line per exercise with a rule, each starting with the exercise's name: "Bench press — next time 185 lb ↑", "Bench press — holds at 180 lb · Rough sleep", "Bench press — holds at 180 lb" (R64).
- **Up next (§8.3, §18.6):** each row's right side becomes "{scheme} · {load}" plus last time's outcome: " · ↑ 5 lb", " · held · Rough sleep" or " · held". Loads show in the display unit through `planInUnit` (R63; closes the §18.6 deferral).
- **After the final review (R74–R78):**
  - Finish writes `routine_exercises.next_weight`, and Up next reads last time, only while the routine slot still holds the same exercise (R74).
  - A bodyweight_plus exercise at 0 added load shows no load on Up next, doesn't count as the day's weight, and its finish line reads "Dip — holds at bodyweight" (with " · {Reason}" when flagged) until it rises above 0; in the session its read says "bodyweight" for the plan ("Sick today, so bodyweight holds.") while the raise stays a weight (R75).
    - Round 5 (R83): a bodyweight_plus exercise ticked with no added weight reads "{name} — holds at bodyweight" when it holds, and "{name} — next time {w} ↑" when every set hit the top of the range; the line is never missing for an exercise with a rule. A tick with the reps left as suggested logs the top of the range, so that counts as every set hitting it. An exercise added or swapped in on the day has no rule, so it has no line.
  - An assisted exercise already at 0 assistance with every set hit holds at 0, as a barbell holds when nothing heavier loads; a raise known to have moved nothing shows no rise on Up next, never the increment (R76).
  - Up next's rise is the difference between the loads it shows: the next and last working weights each through `planInUnit` in the display unit with its gear, so after a unit switch the rise matches the shown loads (R77).
  - Done (and Back to Train) on the finish summary, and the session's Back to Train and Discard, return to the Train screen already open, `router.dismissTo('/')`, instead of stacking another (R78).
- Not in phase 2: History, Stats and charts (phase 6), stall labels (phase 6), PR flags (phase 4), recompute after history edits (phase 6).

### 18.8 Phase 3: routines, the eight programs, the full library and form demos (2026-10-11)
The owner set this scope and asked for it to run without a review stop, so the choices below are Claude's rulings (R84–R90) for the owner to check. The plan is `docs/superpowers/plans/2026-10-11-gymhound-phase-3.md`. Where this section and an earlier one disagree, this section wins.

- **Scope (owner):** the routine editor, the eight built-in programs, the full exercise library, and form demos. The library and form demos move here from phase 4 (§18.3). Saved workouts and custom exercises stay for phase 4.
- **The library (R84):**
  - Every exercise in free-exercise-db (github.com/yuhonas/free-exercise-db, the Unlicense): 876 entries. This replaces "about 300" in §18.1.
  - The 55 exercises GymHound already has keep their ids and names, so history, notes, rest times and next weights carry on. Each is linked to its free-exercise-db entry for steps and photos. Every other entry gets the id `fedb-{slug}`.
  - Each exercise stores its steps and its source id. Two photos per exercise (start and end) are bundled, compressed to a small size; the owner waived the 10 MB cap ("do not ask about the file size just add them if needed").
- **Mapping free-exercise-db to GymHound (R85):**
  - Equipment gains `ez_bar`, `band`, `medicine_ball`, `exercise_ball`, `foam_roller` and `other`. Only `barbell` uses the plate calculator and barbell rounding.
  - Muscles map onto GymHound's list (shoulders split by the movement: pushes to front delts, pulls to rear delts, raises to side delts).
  - Logging type: stretches and static holds are timed; distance cardio is distance and time, other cardio timed; carries and sleds are weight and time; bodyweight strength and plyometrics are bodyweight plus; machine-assisted moves are assisted; everything else is weighted.
- **Finding exercises (§8.7):** search matches word prefixes across name, aliases, muscles and equipment; chips filter by muscle and by equipment; each row shows the name, equipment, primary muscle and a small start photo.
- **Form demo (R86):** tapping an exercise's name in a workout (or the info button on a library row) opens a sheet with the start and end photos swapping every 1.2 seconds (an instant swap, no cross-fade: a blend of two poses shows a ghost, R98), the primary and secondary muscles, and the first three steps with **Show all steps**. With Reduce Motion on, the two photos sit side by side and don't animate. An exercise without photos shows its steps only. A small muted ⓘ after the exercise name (the picker's info glyph) shows that the name opens the demo (R94). The six existing exercises with no free-exercise-db entry get short hand-written steps (R95).
- **The eight programs (R87):** Push/pull/legs, 4-day upper/lower, Beginner full body, Advanced full body, Bro split, Dumbbell full body, Calisthenics, Mobility.
  - Programs that continue keep their ids, so their next weights survive: Push/pull/legs, Upper/lower → 4-day upper/lower, Full body → Beginner full body, Dumbbell only → Dumbbell full body.
  - 5×5 and No equipment are retired: hidden from the list unless active or used by a finished workout.
  - A test checks each program: about 10–20 working sets per major muscle per week (a primary muscle counts 1 set, a secondary ½), and each major muscle trained at least twice a week where the split allows. The bro split trains each muscle once; Mobility uses timed holds and is not volume-checked.
  - The check reads "about 10–20" as 8–24 sets per major muscle group; shoulders are capped on side and rear delts only, since front delts get plenty from pressing (their floor counts side + rear + ½ front) (R93).
- **Routines screen (§8.6):** two sections, Premade and Yours. A routine's detail shows its days and exercises with **Set active** and **Duplicate**, plus **Edit** and **Delete** for your own. Premades are read-only but still progress.
  - **The free limit:** free holds one routine of your own. A second one (new or duplicated) opens "Free holds one routine of your own. GymHound Pro holds as many as you like." with **See Pro** and **Not now**. Until Pro exists (phase 5), See Pro says "GymHound Pro is coming." The `Entitlements` interface lands with a free-only implementation; the existing debug unlock turns Pro on for testing (R88).
  - **The Pro debug switch (R126, after the final Phase 3 review):** Settings ends with a **Developer** group holding one switch, "Unlock Pro for testing", shown only where the debug unlock is allowed (a development build, or `EXPO_PUBLIC_DEBUG_UNLOCK=1`). It calls `setDebugUnlock`. The app has one entitlements object (`entitlementsFor`), so the routine limit on every screen hears the switch at once; turning it on lifts the one-routine limit.
- **The editor (§8.6, R89):** the routine's name; days (add, rename, reorder, delete); exercises from the library (add, reorder, remove); and for each exercise the set count, rep range (seconds for timed), increment (default 5 lb or 2.5 kg in the display unit; 0 means reps only) and superset with the next exercise. **Save** writes; leaving with unsaved changes asks first. An exercise that stays keeps its next weight. Editing never touches a workout in progress.
- **Deleting a routine** keeps its history (workouts don't reference routines by foreign key). If it was active, no routine is active (R90).
- **Supersets in words (R100, after Round 6):** the owner set a rest on ab roller, ticked a set and saw no rest. Tests rule out a bug: ab roller (bodyweight plus, weight left empty) starts its own rest, the Settings rest or a rest chosen before the workout, in a routine or an empty workout, and when it ends a superset. A rest is skipped only when the length is Off or the exercise is mid-superset, and the session showed a superset only as its 3px bar. (The routine editor has no rest of its own: a rest lives on the exercise, from ⋯ Rest time.)
  - The block that opens a superset shows a quiet "Superset" label beside the bar, above the name: muted, Inter 500 at 13pt, growing with the phone's text size. VoiceOver reads "Superset of {names}".
  - A tick on a set of an exercise mid-superset (not the last of the superset) shows a quiet muted line under that set, where the rest row would be: "Rest after {the last exercise of the superset}". It sits under the set ticked last in the workout and goes once another set is ticked. It is hidden while a rest is running anywhere in the workout, so two rests never seem to show, and it never shows when the last member's rest time is Off (no rest will come).
  - The block's "Superset" label ends 9pt above the name, clear of the name's hit slop, so a tap on it doesn't open the form demo.
  - VoiceOver hears it with the tick: "Set 2 logged. Rest after Ab roller." When the last member's rest time is Off, it hears just "Set 2 logged."
- **The rest time in a superset (R101):** the rest after a superset round takes its length from the last member's rest time. The ⋯ Rest time panel of a member that isn't last says so under the exercise's name: "Rest comes after {last}, using its rest time.", or "No rest after {last}: its rest time is Off." when that resolves to Off. The choices stay: they apply whenever the exercise isn't mid-superset.
- **Library details settled while building (R91, R92):** imported names are in sentence case, keeping acronyms and proper nouns ("EZ-bar curl", "Romanian deadlift"); band-assisted moves log as bodyweight plus, since a band's assistance can't be weighed; `src/seed/libraryIds.json` lists every library id, and the build refuses to drop one, so an exercise with history never vanishes when the source data is updated.

### 18.8a Round 7 fixes (2026-10-12)
- **Form demo:** the end photo sits in an opaque view that fills the 3:2 frame; an Image given only absoluteFill drew at its own size on the phone, so the start photo showed along the right and bottom.
- **R170:** on iPhone a not-ready tick buzzes with a plain vibration (`Vibration.vibrate()`), not a haptic — no haptic played in Rounds 4 to 7 even with haptics set to always play, and a vibration does not depend on them — it is longer than a haptic; the light tick tap stays a haptic and is checked again in Round 8.
- **R171:** a switch's thumb swaps colour with its state (on: background colour on a text-colour track; off: text colour on a Strong Seam track) — with one dark thumb on both tracks, on was hard to tell in dark mode — none.
- **R172:** **Sissy squat** (bodyweight, logged as bodyweight plus, quads) joins the bundled exercises with hand-written steps and no bundled photos, beside Weighted sissy squat; seed version 6 adds it — the owner asked for a bodyweight version — none.
- The not-ready line reads "Add weight to complete set" (or reps, time, distance), the owner's words.

### 18.9 Phase 4 (owner decisions and rulings) (2026-10-11)
The owner said to continue without waiting, so the plan's open questions were decided by the controller and the choices below are Claude's rulings (R102–R125, R127–R130) for the owner to check. R126 and R131 belong to phase 3 (§18.8, DESIGN.md). The plan is `.superpowers/sdd/2026-10-11-gymhound-phase-4/plan-draft.md`, its ledger `progress.md` beside it. Each ruling reads: what — why — cost if wrong, as built at `phase-4` c535b84; where the build differs from the plan, it says so. Where this section and an earlier one disagree, this section wins.

- **Scope delivered:** your own exercises (every logging type) from the picker, with your own start and end photos where none are bundled; saved workouts (save from the finish summary, start from Routines, remember the last sets, add one as a routine day); the plates you own and the default increment in Settings; bodyweight and seven measurements, each with a hand-drawn chart; PR flags at finish, personal bests on the finish summary, and sharing one as an image. Screens: §8.5, §8.6, §8.7, §8.9, §8.11. Data: §6 (migration 0006). Files: §14. Phone-only parts: §17.5. Everything here is free (§9); nothing calls `Entitlements`, and saved workouts never count toward the one-routine limit. The library, search and form demos were already moved to phase 3 (§18.8); the plate calculator and barbell rounding were built earlier, so phase 4 adds only the editing of plates owned.
- **Not in phase 4:** live PR marks in the session (R104); back-dated body entries (R115); left and right arms and thighs (R113); saving a workout from History or from scratch, or starting one from Train (R118, R122); lift charts, records and stall labels on Stats (phase 6).
- **Fixed after c535b84** (the final whole-branch review and the browser walkthrough, branch `phase-4-fixes`): the PR backfill has its own try/catch (R127); deleting an exercise, deleting a saved workout and logging a body entry each catch a failure and say "Couldn't delete. Try again." or "Couldn't log. Try again." in a muted line, announced; the exercise editor's problems are announced once, with no live region, so TalkBack no longer reads them twice; the image picker sets `microphonePermission: false` (§17.5); "{name} remembers today's sets." is no longer announced as the finish screen opens; the dock highlights Stats on `/body/{kind}` (Settings, Routines and a saved workout still highlight nothing); Delete in a body entry sheet no longer blanks the web build (React Native Web has no `sendAccessibilityEvent`; screen reader focus goes through `focusOn` in `src/platform/announce.ts`); the chart's y labels show on the web; and small leftovers.

**Rulings:**
- **R102:** one migration (0006) adds every phase 4 table (`measurements`, `exercise_photos`, `saved_workouts`, `saved_workout_exercises`) and `workouts.saved_workout_id`, written by the first task with stub contracts (`writePrFlags`, `rememberSavedWorkout`), the finish summary's slots and placeholder routes — parallel worktrees can't each generate a migration without clashing journal numbers — none; the stubs were filled in place.
- **R103:** PR time order is the workout's start, then the set's tick time (unticked last), then exercise and set position. "First session" means no earlier finished workout has an eligible (done, not warmup) set of the exercise; within a workout a set is still compared with the earlier sets of that workout — §7.6 says "time order" and "contains the exercise" without defining either, and a warmup-only earlier session should not make every set a PR — a different order flags a different set of a tie-free pair; a recompute fixes all history.
- **R104:** PRs are computed at finish only, inside the finish transaction after the status becomes finished; the session shows no live PR marks — a live mark could vanish when a set is edited — the owner may want a live mark; it can come later from the same rule.
- **R105:** the finish summary lists one line per exercise per PR kind, the best set of that kind, in the order heaviest, best estimated 1RM, most reps at a weight, longest hold, each after a red "PR" mark: "Bench press — heaviest: 185 lb × 5", "Bench press — best estimated 1RM: 210 lb", "Bench press — most reps at 185 lb: 8" ("Dip — most reps at bodyweight: 15"), "Plank — longest hold: 1:30". Weights are in the unit logged; e1RM is rounded to a whole number in that unit — §8.5 only says "the PR list", and one line per set would repeat when two sets both beat history — copy only.
- **R106:** **Share** on a personal best makes a 1080 × 1350 PNG on the phone from a 360 × 450 card: always the dark palette whatever the app theme, the dark hound mark beside the red GYMHOUND, the red PERSONAL BEST (a PR mark), the exercise, the value and caption ("185 lb × 5", "Heaviest set"), and the day ("SUN 11 OCT 2026"); every text at a fixed size; no footer and no quotes. Phone builds only, where the share sheet is available; the file stays in the cache and goes only to the share sheet (§17.5). As built (differs from the plan): the card is drawn at the screen's top left under the finish screen's opaque scroll view rather than off-screen (an off-screen view can be culled), waits for the hound mark to load (at most 1.5 s) and one frame before the capture, and iOS asks for the size in points so it comes out 1080 × 1350 on any iPhone — the spec says only "an image through the share sheet; nothing uploaded"; dark is the brand's default and a shared image has no theme — a light variant or a "powered by GRUNTHOUND" footer is a small change.
- **R107:** the plates you own are edited for the display unit only (as Bar is), as 0–20 pairs per size, the standard sizes always listed (lb 45, 35, 25, 15, 10, 5, 2.5; kg 25, 20, 15, 10, 5, 2.5, 1.25, 0.5) and your own sizes addable (as built: a multiple of 0.25 up to 100 lb or 50 kg, which keeps the plate maths small); at least one pair is kept; **Reset to defaults** restores §6's — matches the Bar control; with no plates every barbell raise would hold forever — a lifter who trains in both units switches units to edit the other set.
- **R108:** your own exercise has a name (at most 60 characters, unique as R129 says), at least one primary muscle, secondary muscles, one equipment (R128) and one logging type; its pattern is derived (weight and time → carry; abs or obliques first → core; else isolation); there is no steps editor. The logging type locks once the exercise is used anywhere (any workout, routine or saved workout) — §8.7 lists those fields, and changing the type would make logged sets unreadable — a lifter who picked the wrong type makes a new exercise.
- **R109:** deleting your own exercise archives it if anything references it (a finished or active workout, a routine slot, a saved workout) and otherwise deletes it with its note, rest time and own photos (the row and the files) — §8.7 archives "used in history", and routines and the active workout need the row too — an archived exercise in a routine still runs but can't be picked again. An archived exercise offers no **Delete exercise**.
- **R110:** **New exercise** in the picker opens the editor with the search text as the name, and the saved exercise is chosen at once in the picker's mode (add, replace or a routine slot) — saves a second search for what was just made — the picker could instead just list it. The routine editor's picker doesn't offer **Edit exercise** in the form demo, so a routine draft never holds an exercise edited under it (the editor also re-checks its draft's exercises when it comes back into view).
- **R111:** your own photos (start and end, from the camera or the library, cropped 3:2 and saved 720 px wide as JPEG) go only on exercises with no bundled photos and never replace a bundled one. Today that is every custom exercise and nine library exercises: the six without a source (Wall sit, Hollow body hold, Reverse lunge, Pike push-up, Split squat, Bird dog) and three kettlebell ones whose source has no photos (Kettlebell halo, Kettlebell halo with overhead extension, Kettlebell overhead triceps extension) — `canHaveOwnPhotos` is simply "no bundled photo". The files live in the documents folder's `exercise-photos/` and the database stores **file names only**, resolved against the documents folder each time; a photo is kept as soon as it is taken, apart from the editor's Save; **Remove** asks first. Own photos are not in a snapshot or the backup copy (§17.2). Phone builds only — the owner was offered "add your own photo" for those exercises (handoff §4.4), and a name survives iOS moving the app's folder on update where a stored path would break — if the owner wants own photos on any exercise, `canHaveOwnPhotos` widens and the demo needs a "bundled or yours" choice; Own photo files are removed only when a custom exercise is deleted (R109); a library exercise's own photos stay on the phone until the user removes them. If a later seed bundles photos for one of the nine, the bundled pair shows instead. If that happens, the own photos can no longer be removed in the app; they're deleted with the app.
- **R112:** lengths follow the weight unit (lb → in, kg → cm); body fat is in %; every entry keeps the unit it was logged in (the latest on Stats shows that unit) and charts convert to the display unit's — no new setting, and lb users almost always measure in inches — a separate length setting later.
- **R113:** arms and thighs are one value each, not left and right — the owner's list names one of each — two more kinds per limb if wanted.
- **R114:** body lives on the Stats tab: a Bodyweight card (latest, quick entry, chart, all entries) and a Measurements list, each kind opening a detail screen with its chart and entries — §8.9 already puts the bodyweight card on Stats, and eight charts on one screen would be too long — phase 6 adds the lift charts above it.
- **R115:** entries are for today only; several a day are allowed and all listed; the chart uses each day's latest; tapping an entry edits or deletes it — the simplest honest log — a date picker later (phase 6 with History) if the owner logs late.
- **R116:** charts are hand-drawn SVG (§3) through one shared `LineChart` (phase 6 reuses it): a 2px text-colour line, 4px dots, border-colour grid lines at the y ticks, y labels and the first and last dates in Inter 12 muted with tabular figures (an exception to "numbers in Barlow", noted in DESIGN.md), ranges 3M (91 days, default), 1Y (365) and All as a segmented control, never red; one point is a dot; none in the range says "No entries in this range."; the chart is one accessible element that reads its series in words — no chart library is allowed — none.
- **R117:** value bounds: bodyweight 20–1000 lb or 10–450 kg; lengths 5–100 in or 12–250 cm; body fat 2–75 %; outside, or not a number → "Check this number" (muted, announced), nothing written — catches typos like 1855 — a real value outside is very unlikely.
- **R118:** a saved workout is saved from the finish summary (**Save as a workout**, shown only when a set was done; the repository refuses an empty one with "Nothing logged to save.") and holds each exercise in order with its superset group (a group left with one member is no superset) and its done sets (type, weight, reps, time, distance); the name is 1–60 characters (counted by character, not code unit). Saved workouts are free, unlimited and not counted in the one-routine limit — §18.1 "remembers the last weights, sets and reps" and "everything else added here is free" — saving from History or from scratch can come later.
- **R119:** starting a saved workout creates a workout with the saved name, linked by `saved_workout_id`, with no routine, no rule and no planned weight; each exercise (an archived one too) gets its remembered sets' types and count, empty, with RPE off; Previous and the placeholders come from history as in any workout. A workout in progress stops it with the in-progress sheet — one source of "last time" on screen; a planned weight would show one target on every set of a pyramid — if the owner wants the saved values as targets, `planned_weight` can come from the first working set.
- **R120 (as built; differs from the plan):** finishing a workout started from a saved workout that still exists updates it inside the finish transaction: the k-th saved row of an exercise, in position order, takes the done sets of the k-th **logged** block of that exercise today (a block with no done set doesn't count), so a top-set block and a back-off block each keep their own sets. Saved rows without a logged block keep their sets; extra logged blocks and exercises added on the day are not added (save again to change the list); `updated_at` becomes the finish time. The summary says "{name} remembers today's sets." The plan had "the first block with that id", which would give both rows of a repeated exercise the first block's sets — a skipped exercise must not vanish from the template — a lifter who wants added exercises kept saves a new one.
- **R121:** **Add a saved workout** in the routine editor appends a day: per exercise the set count is its working and failure sets (1–10, at least 1), the rep range their lowest to highest reps (seconds for timed and weight and time; 1–1 for distance and time) within the editor's limits, the increment the display unit's default (0 for timed and distance and time), and the easiest working load (the lowest; the most assistance for assisted; bodyweight plus with no weight counts as 0) as the new slot's first next weight, written when the routine is saved and only for new slots; supersets carry over; a blank day name becomes "Day {n}" and a name in use gets " 2" — §18.1's "add it as a day in one of your routines" needs a rule, and these are the values the lifter actually did — the lifter edits the range in the editor before saving.
- **R122:** saved workouts are a third group on Routines ("Saved workouts", with Start on each row) and have their own screen with Start, Rename and Delete; started from Routines only — Routines is where workouts are picked, and Train's layout is fixed by §18.6 — a Train entry point later.
- **R123:** the task order and file ownership in the plan (stubs and slots in the first task, one owner per shared file per wave) is the phase 4 contract, as `src/state/pendingPick.ts` was in phase 3 — keeps worktrees from editing the same file — none.
- **R124 (amended):** Settings → Progression edits **one default increment per unit** (`default_increment_lb`, `default_increment_kg`), for the display unit, as Bar and Plates are: 2.5, 5 or 10 lb; 1, 1.25, 2.5 or 5 kg (a stored value outside these, from a restored backup, is kept and shown). It is used by **new routine slots only** (Add exercise and Add a saved workout in the routine editor); your own exercises have no increment of their own. The decision first read "per equipment class as §8.11 describes", but §8.11 names no classes and the settings hold one value per unit, so per-equipment defaults were not built — §8.11 lists "Progression default increments" and it had never been built — one more Settings group; per-equipment defaults are a later addition if the owner wants them.
- **R125:** two loads are the same load within 0.01 kg (§7.1), or, in different units, when one converted to the other's unit and rounded to 0.1 equals the other, so 60 kg and 132.3 lb (60 kg is 132.28 lb, 0.0103 kg away) are the same for "most reps at a weight" and are neither heavier — a lifter who switches units logs the converted number rounded, and a strict 0.01 kg would make that a new weight — a rare cross-unit PR flagged or missed (the app pre-fills 132.5 lb, which counts as heavier).
- **R127:** a one-time PR backfill at launch: after the seed, while `pr_flags_backfilled` is off, every exercise in a finished workout is recomputed in one transaction (batched updates) and the setting turned on; a fresh install has nothing to do and just turns it on; a restored older snapshot has no setting and is backfilled on the launch that opens it. A failure must never block the app: it is caught on its own, the setting stays off and it runs again on the next launch. (At c535b84 the backfill ran inside the startup try, so a throw there showed the startup error screen; it now has its own try/catch, `tryBackfillPrFlags`, which logs the failure and lets the app start.) — without it, workouts finished before phase 4 never get PR flags, so the first PR after the update would be judged against an unflagged history and History (phase 6) would show none for them — one slow first launch after the update (about 1–2 s on years of history).
- **R128:** a new exercise has no equipment chosen; Save asks "Pick the equipment." — a default Barbell would turn on barbell rounding and the plate calculator unseen — one more tap.
- **R129:** a name must be unique, ignoring case, among the exercises you can see (not archived): an archived exercise's name can be used again, so history may show two exercises with the same name. The locked logging type reads "It's in use, so this stays." (the plan's "It's been logged, so this stays." was wrong for an exercise only in a routine or a saved workout) — an archived name would otherwise be taken forever by something you can't see or edit — two same-named exercises in stats.
- **R130:** an archived exercise in a saved workout still starts (R119), and can enter a routine day through **Add a saved workout**, although the picker hides it — the saved workout is what the lifter actually did, and dropping an exercise silently would change it — an exercise the picker hides shows up in a routine.

### 18.10 Phase 5 (owner decisions and rulings) (2026-10-11)
The owner said to continue without waiting, so the plan's open questions were decided by the controller and the choices below are Claude's rulings (R132–R161; R157–R161 were added during the build as amendments) for the owner to check. The plan is `.superpowers/sdd/2026-10-11-gymhound-phase-5/plan-draft.md`, its ledger `progress.md` beside it. Each ruling reads: what — why — cost if wrong, as built at `phase-5` 3fc8818 (134 suites, 2,964 tests, typecheck clean); where the build differs from the plan, it says so. Where this section and an earlier one disagree, this section wins.

- **Scope delivered:** GymHound Pro behind one `Entitlements` object with three implementations (free-only, debug, and RevenueCat code that stays asleep in Expo Go, on the web and without a key, §9); the full-screen paywall, opened by **See Pro** on the routine limit and from Settings; Settings → GymHound Pro (status, See Pro, Restore purchases, Manage subscription) and Settings → Fuel; Fuel for Pro: 305 bundled USDA foods, search with Recent, servings, quick add, your own foods, training-day and rest-day targets, the two-number summary, macro bars, entries on any earlier day, trends; the Short on food offer in the session; the food CSV. Water, with your own daily goal, is free and sits on the Fuel tab. Screens: §8.10, §8.11, §8.12. Rules: §7.10. Data: §6 (migration 0007). Interface: §9. CSV: §11. Files: §14.
- **Not in phase 5:** live store products, and therefore real purchases (phase 7 supplies the RevenueCat keys and the Terms and Privacy links); a barcode scanner (the `FoodLookup` seam and `foods.barcode` column only); a manual "today is a training day" switch; a water chart or water CSV; a bigger food list (FNDDS).
- **Controller decisions on the open questions** (all nine recommended defaults): install `react-native-purchases` now and keep it inert (R134); the training day is automatic only (R146); the water goal is unset until you set one (R150); water lives on the Fuel tab (R150); trends use 1M / 3M / 1Y (R149); one-time unlock or subscription is decided in phase 7 with the store products, and the code handles both (R157, R159); the paywall's free list is the updated one (R137); 300 generic foods now (R139); **Mark it** flags only the exercises in the workout at that moment (R152).

**Rulings:**
- **R132 (as built; differs from the plan):** one migration (0007, `0007_cheerful_sauron`) adds `water_log` (`id`, `local_date`, `logged_at`, `amount_ml`) with its `local_date` index, and — added during the build by R158, while 0007 was still unreleased — `food_log.serving_label`; `foods` and `food_log` already existed from 0000. The first task wrote it with the stubs, slots and placeholder routes — parallel worktrees can't each generate a migration — none; the stubs were filled in place.
- **R133:** three implementations behind `Entitlements`, chosen once at startup by §9's order: RevenueCat outside Expo Go with a key; else debug where the debug unlock is allowed; else free-only, which is now always false (the phase 3 free-only honoured the debug unlock; that logic moved to `debug.ts`). The RevenueCat one also honours the debug unlock where allowed, so the Developer switch keeps working in the owner's TestFlight builds — §9 lists the three and §3 allows debug in TestFlight — a TestFlight tester can test Fuel without buying; harmless, release builds never allow it.
- **R134:** `react-native-purchases` is installed now, pinned exactly at 9.15.3 (the current 9.x when installed; 10.x exists and was not taken), but is named only in `revenuecatSdk.native.ts`, by a `require` inside `loadPurchasesSdk()`, called only outside Expo Go and only with `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `_ANDROID_KEY` set; the web build resolves the `.ts` twin, which returns null, so the web bundle never contains the package; tests use a fake adapter; no key is committed, so every phase 5 build runs debug or free — §9 wants phase 5 code and phase 7 live, and Expo Go can't run its native code — if a future version runs code at import, the inline require still keeps it off the start path; deferring the install to phase 7 is the fallback.
- **R135:** `isPro()` is synchronous from `pro_cached` (plus the debug unlock); RevenueCat reads customer info at start, whenever the app returns to the foreground and from the store's own update listener, writes `pro_cached` from the `pro` entitlement, and swallows every error — §5/§12: no screen waits on the network and Pro works offline — a refund shows up only at the next refresh.
- **R136 (as built; differs from the plan):** `purchase()` returns purchased / cancelled / **pending** / unavailable / failed, and `restore()` restored / none / unavailable / failed. Pending (Ask to Buy, a delayed payment) was added at review so it isn't shown as a failure: "Waiting for approval. Pro comes on once it's approved." While either runs, both buttons are disabled over "Working…"; a second tap is ignored. The interface also gained `canRestore()` (Restore works with a store even when there is nothing to buy), `refreshOffer()`, `manageSubscription()` and `dispose()` — the paywall must say what happened, and Restore must not depend on a product loading — copy only.
- **R137 (as built; amended by R157 and R159):** the paywall keeps §8.12's lines with "and macro graphs" added (§18.1) and the free list brought up to date ("saved workouts", "Something off" for "day marks", "body measurements and water"). With no store in the build, Unlock and Restore purchases are both disabled under "Purchases aren't available in this build."; with a store that has nothing to sell yet, only Unlock is, under "The store isn't answering. Try again later." The plan's "price only for a subscription" is replaced by R159 — §8.12 predates §18 — the owner may prefer the original sentence.
- **R138:** **See Pro** closes the limit sheet and, once it has gone, opens the full-screen paywall; Settings gains a GymHound Pro group (status, See Pro, Restore purchases; Manage subscription for a store subscription) as §8.11 lists. Taps closer than 1 s open one paywall. "GymHound Pro is coming." retires with the stub — none.
- **R139:** foods are 305 generic foods from USDA FoodData Central SR Legacy, picked by hand with plain names and a typical serving from FDC's own portions, ids `fdc-{fdcId}`, shipped as `src/seed/foods.json` (43 KB; per serving, kcal whole, grams to 0.1) and loaded only on the seed path (`loadSeedFoods`, a `require` inside the function); seed version 5 upserts them by id, refreshing name, serving and macros but never `archived`, and never touching your own foods; past entries are copies and never change. After review, poultry pieces are 3 oz, spaghetti 1 cup, cream of wheat is "Farina", ricotta ½ cup, fries "1 serving", and no serving says "restaurant". A few SR Legacy entries that come from a named product are listed under plain names, and the whey scoop is ⅓ cup (32 g) — §10.3 names this source; SR Legacy is the FDC set with household portions — a larger list (FNDDS, thousands of foods, ~1–2 MB) is a later step.
- **R140 (as built):** food search matches word prefixes of names, ignoring case and accents, names starting with the whole query first; an empty query shows up to 12 recently logged foods under **Recent**; your own foods come first and are tagged "Yours"; archived foods never show. The add screen searches through `createLocalFoodLookup` with a per-data-version cache (`indexFoods`, each name folded once per version) — the exercise search is the model; no aliases column for foods — "PB" won't find peanut butter.
- **R141:** food is logged in servings (more than 0 up to 50, 2 decimals, a comma or a dot, with ½ 1 1½ 2 chips), and **Add** keeps the add screen open with "Added {name}." shown and said, so a meal goes in one visit; **Done** closes — §8.10 says "then servings"; a meal is several foods — a lifter who wants grams uses a "100 g" food or their own.
- **R142:** editing an entry's servings rescales the entry's own stored totals, never re-reads the food; quick-add entries edit their name and macros; delete asks first ("Delete this entry?") — §6: past days never change when a food does — none.
- **R143:** quick add needs calories or protein ("Enter calories or protein."); blank carbs and fat are 0; a blank name is "Quick add"; kcal 0–10,000, grams 0–1,000 — §8.10 makes the name optional and the macros the point — none.
- **R144:** your own food: name (at most 60 characters, unique among your own foods ignoring case), one serving's label, optional grams, calories required, other macros default 0; deleting archives it (logged days keep their copies; `getFood` still names it) — the `archived` column exists for this — a name may match a bundled food.
- **R145:** targets: calories (500–10,000) and protein (1–500) required for both days ("Needed."), carbs (0–1,500) and fat (0–500) optional; **Same as training day** copies; set from Fuel's setup card, Fuel → Targets ›, or Settings → Fuel — §6/§8.10 — bounds may need widening for very large lifters.
- **R146:** the training-day switch is automatic only, per §7.11 (a finished workout with that date; an active one doesn't count yet), and the day header says "Training day" or "Rest day" — §7.11 is explicit — a lifter who trains at night sees rest targets until they finish.
- **R147:** the summary is exactly the two numbers (§8.10) plus a muted target line; "macro graphs" (§18.1) are the day's protein, carbs and fat bars against their targets and the trends chart; nothing is red, "over" included — §8.10 forbids more big numbers; red is reserved — none.
- **R148:** the day header steps back to any earlier day and forward to today, never past it; entries and water added while viewing a day are logged for that day (`local_date` is the day viewed, `logged_at` the real time); Fuel left on Today follows midnight — §8.10 has arrows to earlier days; late logging needs it — none.
- **R149 (as built):** trends: Calories, Protein, Carbs, Fat over 1M (30 days, default), 3M (91) or 1Y (365), one point per logged day, no target line; `pointsInDays` was added to `chart.ts` rather than widening its range type (Body keeps 3M / 1Y / All). As built, today is left out of the chart and the average (its day isn't over), the card is hidden until a day before today has food, and the controls are a local segmented control laid out by measured width (Calories / Protein / Carbs / Fat four in a row, else two, else one; range labels start with their visible text, "1M, last month") — food is daily, so a month is the useful default — a different range set is a constant.
- **R150 (as built):** water is free and sits on the Fuel tab under the day header, above the food or the pitch; stored in ml and shown in fl oz for lb users, ml for kg users; quick adds 250 / 500 ml or 8 / 16 fl oz plus Other (1–3,000 ml or 0.1–100 fl oz); the goal is unset until you set it (no health default), checked in ml in both units, 8 fl oz (236.6 ml) to 10,000 ml (the plan had separate 250 ml and 8–340 fl oz bounds, which refused a goal set in one unit when shown in the other); entries can be deleted without a question; VoiceOver says "fluid ounces"; a sip shows "<0.1 fl oz", never "0 fl oz"; today's entries show their time; no chart and no CSV — §18.3 "custom daily goal (free)"; the Fuel tab is the food-and-drink place — a Train or Stats home is a move later.
- **R151:** locked Fuel (free or lapsed) shows the day header, water and the pitch inside the tab; food data and targets are kept and come back with Pro — §8.10 and §9 — none.
- **R152 (as built):** the Short on food offer is judged as of the workout's start (protein of that date logged by `started_at`, pace at `started_at`, the training protein target), shows while `food_offer_shown` is 0, Pro is on and no exercise is already Short on food — an exercise marked for any other reason does not block it; **Mark it** flags every exercise that has no mark (others keep theirs); both buttons set `food_offer_shown` — §7.10 "checked once, when a session starts" with §18.7's per-exercise marks; judging at start keeps it stable across resume — exercises added later aren't flagged.
- **R153:** the food CSV (§11 columns) is in Settings → Export for everyone with entries, Pro or lapsed — §9 keeps it after a lapse — none.
- **R154 (as built):** routes: `/paywall` full-screen above the tabs, `/food/add` and `/food/[id]` as modals over Fuel, `/fuel-targets` a hidden tab route (header and dock stay). Its BackLink says "Back", not the plan's "Fuel", since it is opened from Fuel and from Settings — follows the picker and exercise-editor pattern — none.
- **R155:** task order, stubs and slots in the first task and the entitlements folder owned by one task are the phase 5 contract, as R123 was for phase 4 — keeps worktrees off the same file — none.
- **R156:** kcal and grams display as whole numbers with the locale's separators; totals sum unrounded values and round once (three entries of 33.3 kcal total "100"); servings show up to 2 decimals — a day of rounded rows otherwise drifts from its total — none.
- **R157 (amendment):** the store offer carries any ISO 8601 period (`P{n}D|W|M|Y`) as a count and a unit; the paywall says "{price} a {unit}" or "{price} every {n} {units}"; a null period means a one-time unlock — the plan mapped only P1W / P1M / P1Y — cost if wrong: an odd period phrase.
- **R158 (amendment):** `food_log` copies the serving label at log time (nullable `serving_label`, added to the unreleased migration 0007); older rows show no label ("{n} servings") — reading the label live from `foods` meant history changed when a food or a seed label changed — cost if wrong: one more column.
- **R159 (amendment):** the paywall always shows the store's price before purchase ("{price} once" for a one-time unlock); a subscription adds "Renews automatically until you cancel in your App Store or Google Play account."; Terms of use and Privacy policy links come from `EXPO_PUBLIC_TERMS_URL` / `EXPO_PUBLIC_PRIVACY_URL` and show only when set (phase 7 supplies them); a store subscription gets **Manage subscription** in Settings — App Store guideline 3.1.2 asks for price, renewal terms and both links before purchase — cost if wrong: App Review rejection until the links exist.
- **R160 (amendment):** R149's "average line" is the summary text line under the chart ("Average 2,140 kcal a day over 24 logged days."), not a drawn reference line — the plan's phrase could be read either way, and the summary line was what got built — cost if wrong: a later visual add.
- **R161 (amendment):** the Short on food offer isn't due while the workout has no exercise left to flag; so an empty workout shows it when its first exercise is added, a workout where every exercise is marked shows it once a mark is cleared, and clearing a Short on food mark set from the menu can bring the offer back (§7.10) — Mark it would otherwise do nothing and still use up the offer — cost if wrong: the banner appears mid-session.

**Ledger notes (as built):**
- A workout that crosses midnight counts for its start date (`workouts.local_date`), for the training day and for the offer's food.
- `proteinLoggedBy` sums the **current** totals of the entries logged by `started_at`, so editing such an entry mid-workout can change the offer's answer while `food_offer_shown` is still 0.
- `dailySeries` includes today's partial day; `FuelTrends` drops it (R149).
- Jest's `testTimeout` is 15 s in `package.json`, for a form-demo test that hit the 5 s default on a cold first render under load.

**The foods' source:** U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, 2019. fdc.nal.usda.gov. USDA National Nutrient Database for Standard Reference, Legacy Release (SR Legacy), April 2018 CSV release (`FoodData_Central_sr_legacy_food_csv_2018-04.zip`, from https://fdc.nal.usda.gov/download-datasets). Public domain under CC0 1.0 Universal; USDA asks for this citation. 305 foods. `scripts/build-foods.mjs` (`node scripts/build-foods.mjs`) reads the hand-picked `scripts/vendor/usda-fdc/picklist.json` and writes `src/seed/foods.json`; it reads the zip from the gitignored `scripts/.cache/` when present and otherwise the committed subset `scripts/vendor/usda-fdc/sr-legacy-subset.json` (per 100 g energy 1008, protein 1003, carbohydrate 1005 and fat 1004, and the picked foods' portions, with the citation in its header), so a rebuild needs no download unless the picklist adds a food. The build stops on a food with no energy value, an unmatched or ambiguous portion, or a repeated name or id.

**RevenueCat isolation:** only `src/platform/entitlements/revenuecatSdk.native.ts` requires `react-native-purchases`, inside `loadPurchasesSdk()`, which `createEntitlements` calls only outside Expo Go and only with a key; nothing on the start path imports it; the web uses the `.ts` twin, which returns null. Environment keys: `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`, `EXPO_PUBLIC_TERMS_URL`, `EXPO_PUBLIC_PRIVACY_URL` (phase 7 supplies all four) and `EXPO_PUBLIC_DEBUG_UNLOCK` (`1` allows the debug unlock outside a development build).

**Fixed after 3fc8818** (the final whole-branch review and the browser walkthrough, branch `phase-5-fixes`):
- The water, servings and food entry sheets called `AccessibilityInfo.sendAccessibilityEvent` directly, which React Native Web lacks, so opening one blanked the app on the web. They share one `SheetTitle` (`src/ui/SheetTitle.tsx`) that focuses through `focusOn()`; MusicBar's iOS announcement goes through `announce()`; no direct `AccessibilityInfo` speech or focus call is left outside `announce.ts`.
- The food screens (`/food/add`, `/food/[id]`) are Pro-locked: without Pro the pitch takes their place under their title, with Done or Close, so a lapse while one is open, or a deep link, logs nothing (R151).
- `/fuel-targets` Back and Save go back when they can and otherwise land on Fuel.
- One `calendarDayTitle` (dates.ts; Up next keeps its own `dayTitle`) and `calendarDayInSentence` ("Logging for today", the water phrases); one `SheetTitle`; one `SERVING_CHIPS` list with one set of VoiceOver labels; one `kcalProteinText`; the add screen searches through the `FoodLookup` seam; BodyField and CheckLine live in `src/ui/fields.tsx`, `deviceLocale` in `src/platform/locale.ts`, `formatEntryDate` in dates.ts; the water card takes Fuel's `today`; a 1 s once-guard (`useOnce`) on Add food, Quick add, Targets › and New food; the dock highlights Fuel on `/fuel-targets`; "Training day" / "Rest day" is said once (the day header); "Added {name}." clears when switching between Search and Quick add; spoken grams and calories are singular for exactly 1; the stale test file is `tabsLayoutPhase5.test.tsx`.

**Still open (minor):** three segmented controls (Settings, the add screen, Fuel trends); Manage subscription is keyed to the current offer's period rather than the active purchase; the global test timeout.

### 18.13 Phases 7 and 8 (native) (2026-10-12)

Built on `phase-7` (from `phase-6` 3d35dbb) as far as it can go without the developer accounts, a Mac or a phone; the plan is `docs/superpowers/plans/2026-10-12-gymhound-phase-7-8.md`, whose owner-only steps (accounts, `eas init`, the first development build, every device check, the music and watch native code) are still open. Nothing here changes Expo Go or the web.

- **R300:** the identifiers are `com.grunthound.gymhound` (iOS bundle id and Android package), `com.grunthound.gymhound.widgets` (the Live Activity extension), `group.com.grunthound.gymhound` (app group, shared with the phase 8 watch app) and `iCloud.com.grunthound.gymhound`; EAS has `development` (dev client, debug unlock), `preview` (internal, APK) and `production` (remote, auto-incremented version) — a bundle id cannot change once the store records exist — cost if wrong: a new store listing and losing the old one's users and reviews.
- **R301:** a running rest shows on the lock screen as a Live Activity on iPhone (lock screen and Dynamic Island, a system countdown from `startedAt` to `endsAt`, stale "Rest's up." at the end) and as a low-importance ongoing notification with a countdown chronometer on Android, both beside the existing scheduled "Rest's up." notification, which still does the ringing; −15s/+15s keep the start, Skip and finish remove it, and a rest's end takes it down only if that rest is still the stored one — the countdown runs in the system, so nothing has to run in the background — cost if wrong: a stale or missing countdown on the lock screen, never a wrong log.
- **R302:** Health is read only when the app opens or a session starts, never by background delivery (`background: false` for HealthKit) — the reads only feed an offer at a session's start — cost if wrong: none for the log; a reading taken after the session opened is not offered.
- **R303:** after each finish, the newest snapshot is copied to the iCloud container's hidden app data (`/snapshots`), keeping the newest 3 there; on a phone with no data and no local snapshot, the newest cloud copy is brought down before the database opens (15 seconds at most, then start without it), and the normal restore runs; on Android, Auto Backup includes only `files/snapshots/` (both `fullBackupContent` and `dataExtractionRules`) — snapshots are complete, self-contained files, and the live database is not safe to copy while open — cost if wrong: a dead phone loses the history (it is no worse than today).
- **R304:** the bell chosen in Settings rings on the lock screen: the three bells are bundled as notification sounds; iOS names the file, Android uses one channel per bell (`rest-bell`, `rest-chime`, `rest-ding`) because a channel's sound is fixed once made; Expo Go keeps the default sound and the old channels — cost if wrong: the default sound on the lock screen.
- **R305:** no `UIBackgroundModes` and no background task — the notification, the Live Activity and the ongoing notification are scheduled with their end time, so nothing needs to run; App Review questions background audio or processing it cannot see used — cost if wrong: none.
- **R306:** every native-only package is required only through `loadOptional` (`src/platform/native/optional.ts`): never in Expo Go (`StoreClient`) or on the web, and a package that is not installed is null (Metro bundles `missingNativeModule.js` in its place; under Jest the require fails quietly), so `expo start`, `expo export` and the tests work before the packages exist; each package's config plugin is added by `app.config.js` only when the package is installed — Expo Go has none of this native code, and some of the packages throw when required there — cost if wrong: Expo Go crashes on start.
- **R307:** Apple Health (iPhone) and Health Connect (Android) sit behind one `HealthStore`; Settings → Apple Health / Health Connect has four switches, all off until turned on (save workouts; read sleep; read resting heart rate; read body weight), and is shown only where a store exists; a finished workout is written as a traditional strength training workout / a strength-training exercise session with its name, start and end and the workout id as its external id (`HKExternalUUID`, `clientRecordId`); `health_status` is `done` with `health_record_id`, or `failed` and retried at the next start and finish, oldest first, at most 20 a pass; a workout under a second is skipped; a History delete removes the record, best effort (migration 0009 adds `health_status`, `health_record_id`, `sleep_offer_shown`) — §17.1 — cost if wrong: a missing or duplicate entry in Health; GymHound's log is never touched.
- **R308:** turning on "Save workouts" writes workouts finished from then on (`health_workouts_since`), not the history before it — a backfill of years of workouts into Health is a surprise and can duplicate what another app already wrote — cost if wrong: owner may want a one-off "Save past workouts" later.
- **R309:** the Rough sleep offer is checked once, when a session opens, and shows under the Short on food offer while `sleep_offer_shown` is 0, some exercise has no mark and none is already Rough sleep (as R161); Mark it flags every unmarked exercise, and both buttons set the flag; one offer even if both conditions hold (short sleep is named) — §17.1, same no-nagging rule as R152 — cost if wrong: one extra or missing banner.
- **R310:** "last night" is 6pm the day before to 2pm (or now, if earlier), asleep spans merged (in bed only when no asleep data); short means under 6 hours; resting heart rate is the newest reading of the last 36 hours against the mean of the 28 days before it (at least 7 readings, none within 12 hours of it), offered at 10 bpm or more above — the owner's thresholds (§17.1) need a fixed window and baseline to mean anything — cost if wrong: the offer appears on the wrong mornings.
- **R311:** a body weight in Health newer than the app's latest entry is offered on the body-weight card, in the display unit to 0.1, and logged only when the user adds it (the card's UI is plan Task 7.8, after the design pass) — §17.1 "never the log" — cost if wrong: a stale offer.
- **R312:** Android's Stats steps card reads today's steps from Health Connect (`READ_STEPS`, aggregated) in a development or store build; iPhone keeps the pedometer; Expo Go on Android still shows nothing — Android has no pedometer API Expo Go can use (R182) — cost if wrong: no steps card on Android.
- **R313:** the music player is two local Expo modules, found with `requireOptionalNativeModule` (null until they exist and always in Expo Go): `GymHoundNowPlaying` (iPhone: Apple's system music player, so Apple Music; Android: any media session, after notification access) and `GymHoundSpotifyRemote` (iPhone only, Spotify's App Remote) — §17.3's platform limits; there is no maintained package for either — cost if wrong: the modules are written to the JS contract in `src/platform/nowPlaying/index.ts`, which may need a field more.
- **R314:** the bar shows controls for a loaded song, playing or paused (a pause between sets is still what is playing), a playing song before a paused one and then the newest; play/pause, previous/next, and ±15 seconds kept inside the song (no seek for a stream with no length); with nothing loaded, the open buttons for Apple Music and Spotify as the platform has them; on Android without notification access, a line that opens that setting; Expo Go keeps the Task 26 bar — §17.3 — cost if wrong: a bar that hides a paused song.
- **R315:** Spotify on iPhone is controlled only once GymHound is registered with Spotify (`EXPO_PUBLIC_SPOTIFY_CLIENT_ID`) and the user connects once in the Spotify app; until then it keeps the open-Spotify button; Apple Music is never dropped — the owner's §17.3 choice — cost if wrong: none; it is the stated fallback.
- **R316:** in phase 8 the phone owns the workout: the watch shows the state the phone sends (the active workout, progress, the next set with what a tick logs) and sends commands back; the watch keeps no log of its own; the messages are the JSON in `src/domain/watchProtocol.ts`, carried by WatchConnectivity and the Wearable Data Layer — one source of truth means no merge and no duplicate sets — cost if wrong: a watch can't log while the phone is out of reach (it queues until it is back).
- **R317:** a watch command is applied through the session screen's own actions (tick, +15s, Skip), so it starts the same rest, rings the same bell and shows on the phone; a command for another workout, an already ticked set or a rest that has changed is stale and answered with the current state; a tick with nothing to log (no weight yet) is refused and the watch says to log it on the phone — cost if wrong: a tick lost on the wrist, never a wrong one.
- **R318:** the protocol has a version (`WATCH_PROTOCOL = 1`); a message of another version is ignored and the watch asks for an app update — phone and watch apps update separately — cost if wrong: a watch that does nothing until updated.
- **R319:** `package.json` and `package-lock.json` are not changed on `phase-7`; the native packages are installed once with `npx expo install` (list in the plan) — the worktrees share one `node_modules`, and a manifest out of step with its lock file breaks `npm ci` and EAS — cost if wrong: one install step at merge.
- **R320:** the new screens' pieces are separate files (`src/ui/native/HealthSettings.tsx`, `SleepOfferBanner.tsx`) mounted with one line each (Settings after Backups; the session under the Short on food offer), and the startup hook is two lines in `app/_layout.tsx` — the design pass was editing `app/**` and `src/ui/**` at the same time — cost if wrong: the design pass restyles them afterwards.

**As built:** commits dd6fef3 (config, gate), 7281c23 (rest timer surfaces, bell), b71dca9 (Health), 60aeb3e (iCloud copy and hooks), 594ad07 (Health UI, startup hooks), 79a9f85 (music seam), 36e68c5 (watch protocol). Migration `0009_amazing_loa` is this branch's: if another branch merges a migration first, regenerate after the merge.

### 18.14 Final design pass
The owner asked for one design pass over the whole app once every phase was in, keeping the warm dark palette, the red wordmark and the header lockup. The pass fixes inconsistencies between screens without redesigning anything or changing behaviour, and DESIGN.md records the result. Branch `design-final`, based on `phase-6`. The rulings below are Claude's, for the owner to check.

**Rulings:**
- **R350:** the pass was done by hand to the Impeccable standard. `npx impeccable install` could not fetch its skill bundle through the network proxy (the site and GitHub both answered 403). The Impeccable detector (`npx impeccable detect app src/ui`) still ran. It now flags only one advisory: the sheet scrim, `rgba(0,0,0,0.5)`, is the one colour outside the tokens, and DESIGN.md now names it.
- **R351:** every sheet opens with the one `SheetTitle` (Display 700, 28px, a header that VoiceOver moves to). A title alone sits 16pt over the sheet's content. With a muted subtitle, the title sits 4pt over the subtitle and the subtitle 16pt over the content. ConfirmSheet's body is that subtitle. Before, the session, exercise menu, plate, music, name, photo, history edit, saved workout and form demo sheets each drew their own title, at four different spacings, and most were not headings. Cancel in a sheet is now always quiet: the remove-exercise, name, photo, saved workout and servings sheets each had their own outlined Cancel. The order is the one primary answer, then any secondary answers, then quiet Cancel.
- **R352:** every text field has a 1px Strong Seam (borderStrong) edge and 8px corners. This covers search, names, notes, food entry, macros, the bar and plate editors, lifts and the exercise editor. Before, these used the faint Seam edge at 8 to 12px corners, which nearly vanished in dark mode, while the set and body fields already used Strong Seam.
- **R353:** there is one segmented control, `src/ui/Segmented.tsx`. Settings (Appearance, units, bell sound and volume, rest length, increment), Add food's Search / Quick add, the body and lift chart ranges and both Fuel trends controls use it. With `fit`, it lays out by measured width, as Fuel trends' measure control did. This closes §18.10's open minor of three copies. One visible change: labels are now centred in their segment.
- **R354:** there is one step arrow, `src/ui/StepArrow.tsx`: ‹ and › in Barlow 700 at 32px in a 44pt box. A disabled arrow is drawn at 0.4 opacity and tells VoiceOver it is dimmed; a pressed arrow drops to 0.8. Fuel's day header (which used 0.3 and 0.6), History's month calendar and the photo viewer use it. The 0.4 and 0.8 now hold for every pressable in the app (Fuel's entries had used 0.7).
- **R355:** every page title is `ScreenTitle`, a Display title that VoiceOver reads as a heading (before, only some were headings, and the exercise picker's title was not). The title sits 24pt over the page. A muted line under a title (a routine's days, a saved workout's exercises, the photos and targets explainers) sits 4pt under it, not 0 or 8. History's calendar moved from 16 to 24pt under its title.
- **R356:** a quiet button that starts or ends a line steps back by its own side padding (20pt regular, 12pt compact), so its words line up with the text around it: Reset to defaults in the plates editor, and Add food's Done. A routine's Delete was a full-width secondary button in the middle of the page. It is now a quiet, centred **Delete routine** at the foot, 24pt under the content, matching Discard workout. It still asks before deleting.
- **R357:** the exercise and food editors (and their locked forms) share one `ModalHeader`: the Display title as a heading on the left, and a 44pt close × on the right whose glyph ends on the gutter, 24pt over the form. The form demo's title is a `SheetTitle` 4pt over its cue lines.
- **R358:** the small caption over a big number is the Label style (Inter 600, 12px, upper case, letter-spaced) everywhere: Train's STREAK and THIS WEEK, and the finish summary's DURATION, VOLUME and LOGGED. They match Fuel's CALORIES LEFT and Stats' cards. VoiceOver reads them as plain text, not as headings.
- **R359:** a missing routine or saved workout says "That routine isn't here." or "That saved workout isn't here.", the same voice as the app's other not-found lines ("That photo isn't here.", "That workout isn't here."); "Routine not found." read like an error code. Each Targets heading sits 8pt over its fields, like every other field label (it was 12).
- **R360:** Train's "Finish or discard the workout in progress first." uses the shared `WorkoutInProgressSheet`, as Routines, a saved workout and History already did. It gains the "Workout in progress" title and a quiet **Not now**; Resume behaves as before.
- **R361:** two rows that squeezed at large text now wrap: Settings' "Bell at the end" switch row, and the routine editor's "Superset with next". The Steps card's gaps are 16pt, like every other card.

**Left for the owner to judge on the phone:**
- The photo viewer's quiet **Close** sits at the top left; the editors use × at the top right.
- In the locked Fuel tab, the Pro pitch's title is as large as the page title.
- Stats' Bodyweight card heads itself with a 22px Display line; the other cards use a Label.
- Field fills are mixed: the name and food entry sheets fill with the background colour, other fields with surface.
- Things to try on the phone: VoiceOver focus moving to every sheet's title; the stronger field edges in dark mode; STREAK and THIS WEEK in upper case; the Train in-progress sheet; the arrows on Fuel, History and the photo viewer.

### 18.15 Onboarding and empty states
The owner asked for a pass so that a new lifter opening an empty app knows what to do in one look, and every screen with no data says what will fill it and offers the one next action. No tutorial, no carousel, no account. Branch `pass-onboarding`, based on f88f613, alongside the performance and errors passes. The rulings below are Claude's, for the owner to check.

**Rulings:**
- **R400:** the first run is Train's existing no-routine card, word for word: "No routine yet. Pick one and Train will line up your next workout.", a filled **Choose a routine** and an outlined **Start empty workout** (§18.6). Nothing is added in front of it: no welcome screen, carousel or tutorial — the app explains itself where things are. Streak and This week still show 0 under it — they are true, and §18.6 left warmer zero captions for later. Cost if wrong: a lifter reads "0 days" before the card; one line to hide the two cards before the first workout.
- **R401:** one `EmptyState` (`src/ui/EmptyState.tsx`) for every list or screen with nothing in it: a muted body line saying what will show and how it gets there, then at most one action as a compact secondary pill 12pt under it, like the Show steps and Add a photo pills before it. The pill is outlined, not filled — an empty state is quiet, and the screen's own filled button keeps its weight. Where the next step is already a button beside the line, the line names it and adds no pill. The lines: History "No workouts yet. Finish one on Train and it shows here, with its day marked on the calendar." with **Go to Train**; Stats → Lifts and the Lifts screen "Finish a workout and each lift you log shows here, with its chart and records."; the Bodyweight card "No entries yet. Log your weight here and the chart starts."; a body detail "No entries yet. Log one above and it shows here."; Progress photos "No photos yet. Each one you add shows here, newest first." (under Add a photo); Routines → Yours "Routines you make or duplicate show here." (over New routine); Saved workouts unchanged; Fuel's food "Nothing logged on this day. Food you add shows here and counts down from your targets." (over Add food and Quick add). The Stats sections get no pill: the weekly check-in already offers its three actions and Train is on the dock. Unchanged because they already said it: the This week and check-in cards, the measurement rows' "No entries", Steps, water, Fuel's setup card and locked pitch, Add food's "Search the food list, or make your own.", the calendar. There is no list of custom exercises to be empty: they live in the picker. Cost if wrong: the owner may want filled pills or a Go to Train on Stats; one prop.
- **R402:** a chart with one point says how its line starts. A lift with exactly one session: "One session so far. Your next one starts the line."; a body kind with exactly one day: "One day logged so far. Log on another day to start the line." A range that holds one of many points shows its dot as before, with no line. Cost if wrong: a muted line too many under a lone dot.
- **R403:** Routines says "Set one active and Train lines up its next workout." under its title (muted, 4pt, R355) while no routine is in use: the first run lands there from Choose a routine, and the list alone doesn't say what Set active does. Set active still leaves you on Routines; the Train back link is the way back. Cost if wrong: one more tap after choosing; jumping back would surprise someone still comparing routines.
- **R404:** the exercise picker with no match says what was looked for: "No exercise called {search}." ("… with these filters." when a chip is on), with **New exercise called {search}**, which opens the editor with that name like the New exercise pill above it. With only the chips narrowing it to nothing: "No exercises match these filters." and no pill. The line is left-aligned like every other empty line (it was centred). A small change inside `app/pick-exercise.tsx`'s empty list only.
- **R405:** the first finished workout never sets a personal best (R103), so its summary said nothing about them. Now, on the lifter's first finished workout only, the Personal bests heading shows over "Personal bests start with your next workout. Today's sets are the ones to beat." (muted, no red: nothing there is a PR). Every later workout with none still hides the section. Cost if wrong: the owner may read "the ones to beat" as a nudge; it states the rule.
- **R406:** an empty workout (Start empty workout) says "No exercises yet. Add one and it shows here, ready to log." over **Add exercise**, which is filled while the workout is empty and outlined once it has an exercise. A two-line change in `app/session.tsx`.
- **R407:** units already default from the phone's measurement system (§6). Train adds a one-time line before the first finished workout, under the first card: "Weights are in {lb|kg} and distances in {mi|km}, from your phone's region. Change them in Settings.", with a × that stores `hint_units_dismissed`. It hides while a workout runs, and an install that already has a finished workout never sees it. Cost if wrong: one more card on the first screen; a lifter who lifts in the other unit would otherwise find out mid-set.
- **R408:** the session's not-obvious bits get one tip, over the first exercise, before the first finished workout, until dismissed (`hint_session_dismissed`): "Tap an exercise's name to see how it's done. ⋯ has its rest time, the plates to load and more." (VoiceOver: "… Its Options button has …"). The ⓘ at the end of the name already hints the form demo, but the plate calculator lives only behind ⋯, and the rest time there or behind a running rest's countdown. Something off, + Note and the rule line are words on screen already, so the tip leaves them out. No tip on an empty workout. It is its own component (`src/ui/SessionTip.tsx`) with one line in `app/session.tsx`. Cost if wrong: the owner may find the ⓘ and ⋯ enough; remove that line.
- **R409:** every "… access is off. Turn it on in Settings …" line now has a compact **Open Settings** pill under it (camera on Progress photos and an exercise's photos, motion on Steps, notifications on Settings), which opens the app's page in the phone's Settings. In Expo Go that is Expo Go's page, which holds the permission there.
- **R410:** notifications are still asked the first time a rest starts — in context, never at launch. Settings → Rest timer gains a line: before the phone has asked, "With the phone locked, a notification says when rest is up." and **Allow notifications**; refused, "Notifications are off, so a locked phone won't say when rest is up. Turn them on in Settings." and Open Settings; nothing once allowed or on the web. It reads again when the app comes back to the front. No line was added in the session before the first ask: the rest row is the busiest place on the screen, the session is being reworked by the other passes, and the question comes the moment a rest starts. Cost if wrong: iOS gives the notification question no custom words, so the session's first ask stays unexplained; a pre-ask line there is the follow-up.
- **R411:** a one-time tip is a `Hint` (`src/ui/Hint.tsx`): a card (surface, Seam edge, 16pt corners) with one body sentence that wraps, and a 44pt × at its right, "Dismiss tip", hint "It won't show again". It is not the Short on food banner: that is a passing prompt outside the scroll, this sits in the page. Dismissals are settings keys, so they survive a restart and ride along in snapshots.
- **R412:** the camera is still asked on the first **Take photo** (§17.5) with no extra explainer first: the button says what it will do, Choose a photo asks for nothing, and Progress photos already says "They stay on this phone."

**Left for the owner to judge on the phone:**
- The first run: Train's card, the units line under it, then Routines' new line after Choose a routine. Whether the units line earns its place.
- The session tip on the first workout: whether it reads well over the first exercise and whether the ⋯ glyph in the sentence matches the one in the name row.
- Empty pills outlined rather than filled, and History's Go to Train.
- The Rest timer notification line in Settings before and after answering the question, and Open Settings landing on Expo Go's page.
- Streak and This week at 0 under the first-run card (R400).

### 18.16 Edge-case follow-ups (2026-10-12)
Four questions the edge-case pass raised. The owner had asked for the work to continue without waiting, so these are the coordinator's rulings for the owner to check on the phone.

- **R420 (open):** a late iCloud copy should never be lost. When a new phone's start gives up waiting for iCloud after 15 seconds, the copy that lands later is a local snapshot nobody restores, and later trims can delete it and the old phone's copies. The ruling is to keep it, pause the trims, and offer a restore in Settings → Backups. It was not built this round (the work was interrupted), and it matters only for a new phone with a slow iCloud, which needs the native build (phase 7). Cost if wrong: a new phone with a slow iCloud starts empty, and the old copy is trimmed after 3 finishes.
- **R421:** with every snapshot damaged and no live data, the startup error screen offers **Start fresh**. It asks first, renames each damaged snapshot to `.damaged`, sets the empty live file aside, and opens a new empty database. Nothing is deleted, and the error text stays on screen (§12). The screen is `src/ui/StartupError.tsx`. Cost if wrong: someone who could have recovered the files starts again (the files are still on the phone).
- **R422:** after a field is left, a set row asks for a second look ("Check this number") at an unlikely number: a working weight over 1,000 lb or 450 kg, more than 1.5 times the exercise's best and at least 20 lb or 10 kg heavier, or more than 100 reps. Warmups are never flagged, typing clears it, VoiceOver hears it, and the tick still logs what the row shows (R48). Cost if wrong: a rare honest PR gets a second look.
- **R423:** after a unit switch, the plate calculator opens at the weight the row shows: a barbell rounds to the nearest weight the plates load, anything else to the nearest 0.5. Before, a 135 lb plan opened at 61.23 kg while the row showed 60 kg. Cost if wrong: none for the log.

### 18.17 Share cards (2026-10-12)
The owner asked for premium share cards for personal bests and weekly summaries, keeping the existing visual language. The rulings are Claude's, for the owner to check.

- **R440:** share cards are free. They are how new lifters hear about the app, and a lapse never locks something already shared. Cost if wrong: a Pro feature given away.
- **R441:** one frame for every card, always dark. It is 360 × 450 points captured at 1080 × 1350 (4:5, which feeds and stories crop safely), at a fixed text size. It holds the header lockup (the hound mark, never redrawn, beside the red GYMHOUND) and a hairline over the footer.
- **R442:** red only in the wordmark and on PR marks, as everywhere else. No quotes, flames or skulls.
- **R443:** the footer is "GymHound · gym log", one constant. There is no URL until there is a store listing.
- **R444:** the personal best card draws the figure large with its unit beside it ("185" and "lb × 5"), the lift, and what kind of best it is.
- **R445:** it says how far it beat the best of the workouts before it: "Up 5 kg from 135 kg on 2 Sep.". When the gap rounds to nothing it says "Previous best … on …" instead, and on a lift's first best it says nothing. Sharing an old best from History leaves later workouts out, so the card says what was true that day.
- **R446:** the card's foot has the day and the lift's session count to that day ("12 SESSIONS"), warm-ups left out. (Round 8: the count is gone, R532.)
- **R447:** the card's words are read when it is shared (`pbCardFor`). If that read fails, the card still shares with the best alone.
- **R448:** VoiceOver reads each Share button with the lift and the best: "Share your bench press personal best as an image. Heaviest: 185 lb × 5".
- **R449:** **Share this week** is a quiet compact pill on Stats' This week card, shown once the week has a finished workout and only on a phone that can share. A failure says "Couldn't make the image. Try again." and is logged.
- **R450:** the weekly card lists the week's personal bests, one row per lift with red PR marks (up to three). With none, it lists the top three lifts by volume.
- **R451:** the week is Monday to Sunday, with seven dots for the days trained, then workouts, sets (warm-ups left out), volume in the display unit, and time trained from start to finish.
- **R452:** the streak shows on this week's card only, when it is above 0.
- **R453:** a card is drawn under the page while it is captured (`Screen`'s `under`, or `PbCardHost`), so it is on screen and drawn but never seen. It waits for the hound mark (1.5 s at most), and is removed after.

### 18.18 Routine sharing (2026-10-12)
The owner asked for easy routine sharing by link or code. GymHound has no server, no account and no network, so the routine itself travels inside the link and the code. The rulings are Claude's, for the owner to check.

- **R460:** only the routine travels: its name, days, each exercise's sets, rep range, increment, superset links and the exercise's own rest. No history, next weights, notes, photos or anything about the person. Cost if wrong: none.
- **R461:** a code reads `GH1.<payload>.<check>`. The payload is the routine as positional JSON in base64url, and the check is 24 bits of FNV-1a, so a changed or missing character is caught. Beginner full body is about 430 characters. The codec is `src/domain/routineShare.ts`. Decoding never trusts its input: every field is bounded, and anything off is refused. Cost if wrong: a long line in a message. (Round 8: version 2 is shorter, R472.)
- **R462:** a library exercise travels by its place in `src/seed/libraryIds.json`, which only ever grows, so a place means the same exercise on every version. An exercise of your own travels with its name, logging type, equipment and muscles. A place past this phone's list (a code from a newer GymHound) is skipped and said so.
- **R463:** **Share routine** is a quiet action on every routine's page, premade or your own. It opens the share sheet with text, so the routine goes into any messaging app.
- **R464:** the link is `gymhound://routine/<code>` (app.json's scheme). It opens Routines → Add from code with the code already in the field, and nothing is added until the person taps Add routine. In Expo Go the custom scheme doesn't open the app, so the message also carries the code on its own line.
- **R465:** the message: "My {routine} routine on GymHound. Open this link on your phone, or paste the code in Routines → Add from code: {link}", then a blank line and "Code: {code}". (Round 8: no link, R473.)
- **R466:** **Add from code** (quiet, under New routine) is a page. Paste the code, the link or the whole message. A preview shows the name, days and exercises, any exercise of the sender's own it will make, and any it can't find; then **Add routine**.
- **R467:** the code is found anywhere in the pasted text, and one a mail app broke over lines is joined again.
- **R468:** the added routine is a new routine of your own, with new ids, never written over another. A name already in use gets " (2)", " (3)" and so on. An exercise of the sender's own matches one here with the same name (any case) and logging type, or is made. A shared rest is set only where this phone has none, so importing never changes rests you chose.
- **R469:** the check comes last, so a code copied short has lost it, and that reads as cut short.
- **R470:** a refused code says why: "That code isn't a GymHound routine.", "That code is from a newer version of GymHound. Update the app and try again." or "That code is cut short. Copy the whole code and try again."
- **R471:** adding counts as making a routine. With the free limit reached, the limit sheet shows instead, and Pro holds more. A shared premade becomes a copy under Yours, like Duplicate. (Round 8: adding is Pro, R521, and a premade opens instead, R474.)

### 18.19 Full access trial (2026-10-12)
The owner asked for a 7-day full-access trial that starts after the first finished workout, with a clear days-left indicator. The rulings are Claude's, for the owner to check.

- **R480:** the trial starts at the first finish after it ships, once per install. It is kept in the database, so a restore keeps it and deleting history doesn't restart it. People who already had workouts get it at their next finish rather than never. Cost if wrong: a lifter with history gets seven more days of Fuel.
- **R481:** a refused finish ("nothing ticked") and a discard never start it. `startTrialIfDue` runs after the finish has committed, and a failure there is logged and never stops the finish.
- **R482:** it ends at the same clock time 7 calendar days later. Days left are counted in calendar days as a person reads them: 7 on the day it starts, 1 the day before it ends, and the last day reads "Last day of your trial".
- **R483:** it grants everything Pro grants. `withTrial` wraps the build's entitlements (free, debug or RevenueCat), so every Pro gate follows with no change of its own, and a timer tells open screens the moment it ends. Cost if wrong: none; a store purchase still wins.
- **R484:** a clock set back before the start reads as the first day. The trial is always measured from its stored start, so moving the clock can't make it longer.
- **R485:** Settings → GymHound Pro reads "Full access trial · 5 days left", then "Fuel and as many routines as you like, free until it ends. Nothing is charged.", and **See Pro**. Before the trial, the free text gains "Your next finished workout starts a 7-day full access trial. Nothing to set up."
- **R486:** Fuel's header shows a small muted chip, "Trial · 5 days left", which VoiceOver reads in full. The summary of the finish that started the trial says "Your 7-day full access trial starts now: Fuel and as many routines as you like. Nothing to set up." with **See what's included** (the paywall).
- **R487:** Train says nothing about the trial until its last two days, then shows one muted line: "Your full access trial ends tomorrow." or "… ends today at 6:40 PM.", followed by "Then Fuel locks and you can't add more routines. Your routines and food log stay." No red and no countdown pressure. (Round 8: the line names everything that locks, §18.21.)
- **R488:** it is an in-app unlock, not a store trial. There is no StoreKit or Play introductory offer and no auto-renew, and no line says it will charge or renew. A store introductory offer can be added in RevenueCat later. Cost if wrong: none; App Review allows a free in-app unlock.
- **R489:** during the trial the paywall still pitches, topped by "5 days left in your full access trial", instead of "Pro is on."
- **R490:** after it ends, with no Pro, Train shows once: "Your full access trial has ended. Your routines and food log are kept. GymHound Pro brings back Fuel and more routines." with **See Pro** and **Not now**. Either answers it for good (`trial_ended_seen`). The ending itself is the existing lapse (§9): nothing is deleted, and Fuel locks with its data kept. (Round 8: the wording follows the new Pro, §18.21.)
- **R491:** the trial's lines are calm. They are muted text, never red, and shown only while the trial is what gives Pro. A purchase or the debug unlock hides them. (Round 8: the debug unlock no longer hides them, R534.)
- **R492:** Settings → Developer (shown only where the Pro debug switch is) gains a "Full access trial" control: Off, Day 1, Last day, Ended. Each sets the stored start from now, so every state can be checked on the phone.

### 18.20 Microcopy pass (2026-10-12)
A read of every on-screen sentence, button label, confirmation sheet and error line, against PRODUCT.md's voice (plain short sentences, straight apostrophes, say what will happen).

- **R500:** "tick" is gone from the words people see, following the owner's Round 4 and Round 7 notes ("Use incomplete sets"; "Add weight to complete set"). A set is "complete". The Finish sheet reads "No sets completed yet"; History's editor reads "Some completed sets need a value.", "{name} has no completed sets, so it leaves this workout." and "Keep at least one set complete, or delete the workout."; History's not-ready lines match the session ("Add weight to complete set"); Replace says "Its completed sets will be cleared."; removing a done set says "It's complete. What it logged will be deleted."; a suggested field tells VoiceOver "Suggested. Complete the set to log it." The code keeps its own word for it (`tick`).
- **R501:** a failure sheet is a short title with what to do under it, like every other sheet: "Couldn't finish" or "Couldn't discard", then "Your workout is still here, as you left it. Try again." Before, the whole sentence was the title, and the two used different punctuation.
- **R502:** a missing item says "That {thing} isn't here.": the workout in History and its editor, and a body measurement (which said only "That isn't here.").
- **R503:** the plate calculator, for a weight under the bar, says "That's less than the bar. Load no plates." (it said "Below the bar: just the bar.").
- **Checked, unchanged:** button labels are consistent (Delete / Keep, Discard / Keep editing, Remove / Keep, Resume / Not now). Every failure line reads "Couldn't {verb}. Try again." There are no curly quotes or exclamation marks in on-screen text. "OK" stays only where a sheet just reports something.


### 18.21 Round 8: the owner's free and Pro rules, Train's date and line, the scroll fix (2026-10-12)
The owner's Round 8 phone check found a scrolling bug and set new free and Pro rules and two changes to Train. The rules marked "owner" are theirs; the rest are Claude's, for the owner to check. Where a ruling here changes an earlier one, the earlier one says so.

**Scrolling**
- **R510:** content can never be left out of reach. The cause was iOS's keyboard insets: every mounted scroll view adjusts for every keyboard, the hidden tabs (which stay mounted) included, so a tab could be left with an inset or an offset from a keyboard on another screen and scroll past its end with no way back. `useSafeScroll` (`src/ui/useSafeScroll.ts`, used by `Screen` and the session) lets only the focused screen follow the keyboard, clears an inset left over once the keyboard is down, and after a drag or a fling ends past the content (600 ms, the bounce's time) or when the screen comes back into focus, scrolls back to the nearest end. Cost if wrong: a stray scroll back after a long bounce.

**Free and Pro (owner)**
- **R520 (owner):** free holds four programs: Beginner full body, 5×5, Dumbbell full body and Mobility. The other five (Push/pull/legs, Upper/lower, Advanced full body, Bro split, Calisthenics) are Pro. 5×5 is back (`premade-5x5-3`: A is squat, bench press and row, B is squat, overhead press and one set of 5 deadlifts), and the free four come first in Routines.
- **R521 (owner):** routines of your own and saved workouts are Pro: making, duplicating, editing, adding from code, starting a saved workout and saving one from the finish summary. Free keeps the limit sheet's place with "Routines of your own are part of GymHound Pro." (`FREE_ROUTINE_LIMIT` is 0; supersedes R88's one free routine and R471's free limit.)
- **R522 (owner):** Stats is free. Fuel is Pro, as before (R151). Water and body measurements stay free.
- **R523 (owner):** the 7-day trial unlocks everything Pro does (R483 unchanged).
- **R524 (owner):** after the trial ends with no purchase, routines of your own and saved workouts are kept but can't be used until Pro: they show with a "Pro" pill in place of Set active, their page says "{name} is kept. It's ready to use again with GymHound Pro." with **See Pro**, and nothing is deleted.
- **R525:** a Pro program is listed for everyone, so free can see what Pro holds. Its row shows a quiet "Pro" pill instead of Set active (VoiceOver: "{name} is part of GymHound Pro"); its page shows the days and exercises, "{name} is part of GymHound Pro. Free includes Beginner full body, 5×5, Dumbbell full body and Mobility." and **See Pro**.
- **R526:** an active routine that locks (a trial ends with a Pro program active) stays active and Train's Up next says so: the routine's name, why it is locked, **See Pro**, and Change routine. Nothing switches it for you, so buying Pro picks up where you were.
- **R527:** 5×5 keeps its fixed 5 reps and its one deadlift set; the checks that every premade has a rep range and enough weekly volume pass it by name.
- The paywall's three Pro lines are "All nine programs", "Routines of your own and saved workouts" and Fuel; the free line names the four programs and Stats. The trial's lines say what locks at the end: "Then Fuel, the Pro programs, your own routines and saved workouts lock. Everything you made stays." (R487, R490 updated.)

**Train (owner)**
- **R530 (owner):** the date on Train is half its size (28 pt). Under the greeting, one short line changes each day (`src/domain/quotes.ts`, 91 lines written for GymHound in its plain voice: no exclamation marks, no flames, straight apostrophes). The day picks the line by a stride that shares no factor with the list's length, so every line comes once before any comes again and two days in a row never read alike. It is the same all day on a phone and changes at local midnight. PRODUCT.md's "no motivational quotes" gives way to the owner here.

**Round 8 notes**
- **R531:** "personal best" is "personal record" in every word people read: the finish summary, the share cards ("PERSONAL RECORD"), History and Stats. The code keeps `pb`.
- **R532:** the personal record card drops the session count (R446): its foot is the day alone.
- **R533:** the Fuel targets form drops "optional" from Carbs and Fat; they still may be left blank. Stats' week note reads "Sets so far this week" (no "Hard").
- **R534:** the trial's chip and lines show while the trial is what gives Pro, the debug unlock included (R491 said the debug unlock hid them, which hid the trial from the owner's own check). Only a store purchase hides them.
- **R535:** a photo chosen from the library is opened without iOS's crop step, which used the older picker that can't fetch a photo kept in iCloud and handed back nothing. The newer picker fetches it, asking for the compatible format (JPEG rather than HEIC), and the 3:2 cut is made from the middle, as it already was for iOS's square crop. The camera keeps its crop step. Progress photos ask for the compatible format too.
- **R536:** the bodyweight sissy squat shows the weighted sissy squat's photos (free-exercise-db has no other), with "Shown with a plate held to the chest. Leave it out." under them. It can no longer take photos of your own (R111).
- **R537:** Fuel lets you log food before targets are set: the day's food, **Add food** and **Quick add** come first, then the setup card. Before, with no targets, the targets form was all Fuel showed.
- **R538:** completing a set plays no tap. The owner found it not needed, and it never played on their phone (Rounds 7 and 8). The not-ready buzz (R170) and the rest's end stay.
- **Not done, for the owner:** barcode scanning. §2 lists it as a non-goal, and a barcode is only useful with a lookup (Open Food Facts), which would be the app's first network call besides RevenueCat and breaks "everything stays on the phone". The `foods.barcode` seam is still there. The Round 9 checklist asks.

**Routine codes, version 2 (Round 8: "the link is not a clickable link", "can the code not be shorter. It was like 15 lines")**
- **R472:** a code is `GH2.<payload>.<check>`, the payload compact bytes, not JSON: numbers as variable-length integers, names as UTF-8 with their length first, muscles as lists of places in the version 1 table (the first primary decides a custom exercise's pattern), a slot that repeats the sets, reps and increment of the one before it as a flag alone, and the usual increments (5, 10, 2.5, 0, 1.25, 1, 2) inside the flags. A premade program travels as its place in a frozen table, so sharing Beginner full body is 12 characters (`GH2.AAA.nUj7`); a routine of your own is about 40% of its version 1 length (Beginner full body's content as your own: 167 characters, from 432). Version 1 codes still read. A premade place past this phone's table reads as from a newer GymHound. (Supersedes R461's length.)
- **R473:** the message has no link: "My {routine} routine for GymHound. In the app, open Routines → Add from code and paste this code:", a blank line, then the code. A `gymhound://` link isn't tappable in Messages or Notes and Expo Go can't open it, so it only confused. The app still opens such a link (R464). (Supersedes R465.)
- **R474:** a premade program's code adds nothing. Every phone has the program, so Add from code shows it ("Program", its name, "3 days · already in your Routines") with **Open program**, which opens its page, free or Pro; a Pro program's page then says so (R525). (Supersedes R471's copy under Yours for premades.)

### 18.22 Round 9: the build stamp, the daily quote, routine options, and Fuel's food database (2026-10-12)
Round 9 ran on the Round 8 build: the phone showed none of Round 8's changes (the smaller date, the daily line, the Pro pills, the new wording). Those fails are checked again in Round 10 on the right build. The owner's new notes follow. Rules marked "owner" are theirs; the rest are Claude's, for the owner to check.

- **R540:** the build is checkable. app.config.js puts the commit and its date in `extra.build` when Expo starts, and Settings → Developer shows "Build 1a2b3c4 · 2026-10-12". `scripts/phone-check.cmd` (PowerShell inside) brings the PC's folder to the branch: it sets any local changes aside with git stash (never deletes them), checks the branch out exactly as GitHub has it, installs packages only when package-lock.json changed (in the folder node_modules links to, `C:\Users\eddie\.gymhound`, as §4 describes), prints the commit the phone must show, and starts Expo with a clean cache. Cost if wrong: a stash to pop by hand.
- **R541 (owner):** the daily line is a real quote with who said it: Stoic, training, sport and motivation. 76 quotes, each with a well-documented source (Seneca, Marcus Aurelius, Epictetus, Muhammad Ali, Arnold Schwarzenegger, Eliud Kipchoge, John Wooden, Henry Rollins, Mark Rippetoe, Jocko Willink and more); popular misattributions are left out or given their real author ("We are what we repeatedly do" is Will Durant's summary of Aristotle). The name shows under the quote in muted 13 pt with a dash, and VoiceOver reads the two as one. Supersedes R530's house-written lines.
- **R542 (owner):** each routine on Routines ends in ⋯, which opens its options: Set active (See Pro for a locked one; none for the routine in use), Edit and Delete routine for your own, Duplicate and Share routine. There is no long press. The page and the sheet share `useRoutineActions`, so the gates, the workout-in-progress check and Delete's question are the same in both.
- **R545 (owner):** Fuel's list is about 8,300 foods. To the 305 hand-picked foods (R139) are added about 8,000 from USDA's Standard Reference, Release 28 (public domain): grocery staples, fast-food and restaurant items (McDonald's, Burger King, Taco Bell, Subway, KFC, Chick-Fil-A, Pizza Hut, Domino's, Applebee's, Olive Garden and others) and branded groceries (Kellogg's, Campbell's, Keebler and others). Baby foods and the American Indian/Alaska Native group are left out, and so is anything already hand-picked. Names read as people write them (McDonald's, not McDONALD'S); servings as the hand-picked foods write them (½ cup, 0.8 oz, no NLEA notes). All of it is on the phone and works offline. A search ranks your own foods first, then the hand-picked staples and foods found online, then the library; within each, names that start with the query, then shorter names. Seed version 8 adds it; the food upsert writes 500 rows per statement (a few dozen ms). The bundled foods are folded once per visit to Add food. Cost if wrong: about 800 KB of app size.
- **R546 (owner):** **Search online** on Add food (shown while searching) asks Open Food Facts for packaged foods. It runs only when tapped, because Open Food Facts allows few searches a minute, on the site for the phone's country (us.openfoodfacts.org in the US), most scanned first. Results show first, under "Online · Open Food Facts", then "On your phone". Tapping one keeps it on the phone as `off-{barcode}` (source `online`) and opens its servings; from then on it is in search, Recent and barcode scans offline. A product becomes a food only with a name and calories that make sense (no more than 900 kcal or 100 g of a macro per 100 g). kJ, per-serving-only values and ml servings are handled. Only the search words or the barcode are sent, with the app's name as Open Food Facts asks, and nothing about the person. Each call gives up after 10 s. Offline it says "Couldn't reach Open Food Facts. Check your connection and try again."; a busy or failing site says "Open Food Facts didn't answer. Try again in a minute." Data from Open Food Facts is under the Open Database License, named as the source on screen. Tradeoff, as the owner asked: this is the app's first network use besides purchases. It never blocks logging. Claude's reading is that the App Store privacy answers can stay "Data Not Collected", since nothing that identifies the person is sent or kept by GymHound; check it when filling in the form in phase 7. PRODUCT.md's "no network" line now says so.
- **R547 (owner):** **Scan barcode** on Add food opens a full-screen camera (expo-camera, which Expo Go includes) reading EAN-13, EAN-8, UPC-A and UPC-E. A code already on the phone (your own food made for it, or one found before) opens at once. Otherwise Open Food Facts is asked; UPC-A is tried in both its forms and UPC-E as the UPC-A it stands for. Found, it is kept on the phone and Add food opens its servings, as New food does. Not found, or offline, it offers **Add as your own food**: the food editor opens with "For barcode {code}. Copy the label's numbers for one serving.", and the code stays on the food, so the next scan finds it. The camera asks for access the first time; refused, it says how to turn it on in Settings. Fuel stays Pro outside the trial (R522); the scanner, like Add food, shows the pitch without Pro.
- **R548:** a food whose serving weight is known can be logged by weight: the servings sheet gains **Servings | Grams**, and grams are logged as servings (weight over the serving's weight, to 2 decimals, within the same bounds), so a 170 g chicken breast logs as 2 servings of 3 oz (85 g). Switching keeps the amount (1.5 servings of 85 g reads 127.5 g). The chips show only by servings.
- **R543:** the share link (Round 9 note: "can you not have the link but it actually work"). A link that Messages and Notes make tappable must be a web address (https). A `gymhound://` link is never made tappable there, and in Expo Go no link can open GymHound at all, because the app on the phone is Expo Go. A working link needs a web address GymHound owns: a page at, say, `https://gymhound.app/r/{code}` that opens the app when it is installed (an iOS universal link, which needs the App Store build from phase 7) and otherwise shows the code with a Copy button and the App Store link. The domain is also needed for the store listing's privacy policy and support pages. Until the owner has a domain, the message stays the short code (R473). The Round 10 checklist asks.


### 18.23 Round 10: the hang, Modify and Stats, program lengths, and Pro pricing (2026-10-12)
Round 10 ran on the right build. Its notes: pages stopped answering taps until another tab was chosen; Share routine did nothing after ⋯; the trial started on a finished workout with Developer set to Off; saved workouts showed no Pro pill; the weekly check-in still said "hard sets"; Fuel's "Today" was clipped at the largest text; food needed ounces. The owner asked for Modify, per-exercise Stats, program lengths and the Pro prices. Rules marked "owner" are theirs; the rest are Claude's, for the owner's next check.

- **R550:** the hang. Round 8's snap-back (R510: a page scrolled back to its content when a scroll came to rest past it) could start a scroll whose own end started another, so a page kept scrolling, stuck at its edges and swallowed taps. It is gone. `useSafeScroll` now only decides which pages follow the keyboard: a page adjusts for the keyboard while it is in view, and keeps adjusting after it leaves view until a keyboard it raised has gone; a page leaving view closes its keyboard. Pages out of view never answer a keyboard another page raised, which was R510's cause.
- **R551:** a step after a sheet closes (Share after ⋯, a confirm after a menu) waits for iOS to say the sheet has gone (the Modal's `onDismiss`), with one second as the fallback, instead of a fixed 400 ms that iOS could outlast, dropping the step. Developer's trial setting gains **Free**: no trial, now or after a workout. **Not started** still starts one at the next finished workout. Saved workouts show the Pro pill on free; the check-in says "sets"; Fuel's day heading has room at every text size.
- **R552 (owner):** the servings sheet reads **Servings | Grams | Ounces** (1 oz = 28.35 g); ounces log as servings like grams (R548).
- **R553 (owner):** **Modify** swaps an exercise for one that works the same muscles. "Choose a new exercise" lists up to eight from the library with the same main muscle and the same kind of logging (reps, time or distance), leaving out what the day or workout already has and specialty moves (stretches, Olympic lifts, balance work) unless the exercise is one. Same movement pattern ranks first, then shared muscles, staples, then the same equipment. In a workout it sits under the exercise's name beside Stats, swaps for that workout only (asking first when sets are done, as Replace does) and says so. On a routine's page, tapping an exercise offers Modify and Stats; Modify there changes the routine from the next workout, keeps its sets and reps, and asks for a starting weight next time. A premade program's swap stays through app updates, and the program's own exercise is offered first, marked "(program's)", to go back.
- **R554 (owner):** **Stats** on an exercise opens its chart and history. From a workout it opens over the workout, whose rows don't open other workouts; from a routine's page it opens the exercise's page under Stats. An exercise never logged says so under its name.
- **R555 (owner):** each premade program says how long it runs and who it suits, on its card and its page: "3 days a week · 12 weeks · Beginner". Beginner full body, 5×5 and Push pull legs run 12 weeks; Dumbbell full body, Upper lower, Advanced full body and the Bro split 8; Calisthenics 6; Mobility 4. Photo cards (Round 10's optional request) wait for licensed photos.
- **R556 (owner):** Pro's prices: **Yearly** $119.99 a year ($9.99 a month), marked **Save 50%**; **Monthly** $19.99 a month; **Lifetime** $199 once. Both subscriptions have a 7-day free trial in the store. The paywall offers the three as radio cards, Yearly first and chosen; the saving is worked out from the store's prices. The button reads **Start your free trial** on a plan with the store's trial (Subscribe without one, Buy lifetime for Lifetime), with "7 days free, then $119.99 a year. Cancel before the trial ends and you won't be charged." and the renewal line (R159) under it; Restore purchases and Not now follow. The store's plans and prices are shown wherever there is a store; a build with none (Expo Go) shows these planned prices with buying disabled, so the screen can be checked. RevenueCat's `default` offering holds the annual, monthly and lifetime packages. Manage subscription in Settings now shows only for Pro from a renewing subscription, not Lifetime. Open: whether the in-app 7-day trial (§18.19) stays alongside the store's trial.

### 18.24 Round 11: the scroll cause found, large text that fits, one free trial, 200 quotes, and Import data (2026-10-12)
Round 11: 19 passed, 3 failed. The fails: a workout scrolled to the bottom showed a black screen and wouldn't scroll back (Train too); the pricing cards at the largest text were cut off; at the largest text the tab labels, Stats' step and bodyweight numbers and Fuel's "Today" were cut off, and lines didn't wrap. The owner's answers: the App Store's trial only; $119.88 a year; text program cards; this pricing layout. New: Import data; 200 daily quotes in a random order. Rules marked "owner" are theirs; the rest are Claude's, for the next check.

- **R560:** the scroll bug's cause (Rounds 8 to 11) is react-native#57755: on iOS a ScrollView with `automaticallyAdjustKeyboardInsets` keeps that behaviour after Fabric recycles its native view, so a later page reusing the view can inherit a keyboard's height of empty space below its content that takes no touches, for instance after a sheet closes while its keyboard is still moving. The fix shipped after the React Native in Expo Go (0.86.3). So the prop is used nowhere (a test fails if it comes back). A page whose own field raises the keyboard adds that much room under its content and scrolls the field into view; the room goes with the keyboard, and a page left past its new end is scrolled back once, never on a scroll's own end (R550). A sheet lifts above the keyboard and scrolls its field into view; Add food's results get room under them. A keyboard raised elsewhere (a sheet over the page, another tab) changes nothing on a page.
- **R561 (owner):** in the servings, water and quick add sheets the keyboard's Done only puts the keyboard away; Add adds. The exercise's name row reads [count] [Something off] [Modify] [Stats] [+ Note], Note last.
- **R562:** text at the largest sizes. iOS's own title styles grow about 2× at the largest accessibility size while body text grows about 3×; titles, big numbers and Label headings (Display, Num, Label) now stop at 2× (`TITLE_MAX_SCALE`), and body text is not capped. Tab labels grow 1.35× at most and shrink to fit, as iOS's tab bars barely grow. Above 1.3× a plan's price moves under its title, and a routine's or saved workout's buttons go under its name. Every segmented control measures its labels and goes to two rows or one when they don't fit. A button is never wider than its row and its label wraps. A set's fields and the body fields cap their numbers at 1.5× so "182.5" and "1:00" stay whole. Fuel's day title has room under it that grows with the text. `scripts/web-text-scale` (the web dev server with `GH_TEXT_SCALE` set) draws the app at an iOS text size, so layouts are checked in a browser before a phone check.
- **R563 (owner):** the App Store's 7-day free trial is the only one: GymHound's own trial (§18.19, R480–R492, R551) is removed, with its lines on Train, the finish, Fuel, Settings and the paywall, its Developer presets and its settings keys. RevenueCat reports Pro during the store's trial, so every Pro gate follows. "Unlock Pro for testing" is how a phone check turns Pro on. The planned yearly price is $119.88 ($9.99 a month); program cards stay text; the pricing layout stays.
- **R564 (owner):** the daily quote list is 200: 69 of the first 76 (seven dropped by the owner; Rocky stays) and 131 new, Stoic and classical, strength and lifting, coaches, athletes, and discipline, each checked against its source (the review document names them). The day's quote is chosen at random: each pass through the 200 is shuffled from its number (the same all day, on every phone), a different order each pass, and a pass never opens with the quote the last one ended on, so a quote comes back only once every quote has had its day.
- **R565 (owner):** Settings → Import (Pro): **Import data** opens a page that reads one CSV file at a time, of workouts (a row per set, or a sets count), body measurements (a column each, or a kind and a value) or food (a row per thing eaten), told apart by its columns. GymHound's own exports and Strong, Hevy, FitNotes and food-tracker exports read as they are (loose column names, units in headers, comma, semicolon or tab files, European decimals, ISO, US and day-first dates). Exercise names are matched to the library and your own (written out and in any order, the usual version's word optional, the equipment named in the file required); a name nothing matches is added as your own exercise, its equipment, main muscle and logging guessed from its name and sets. The page shows what would be added first: workouts and sets and the days they span, matches and new exercises, the weight unit when the file doesn't say, and rows it can't read by row number. Import writes it all in one transaction, works personal records out again, and says what was added; the same file imported twice adds nothing. Sample workouts, body and food files can be downloaded from the page. expo-document-picker chooses the file.

### 18.25 Round 12: the form-demo photos, the name row, and the Profile (2026-10-13)
Round 12: 26 passed, 0 failed. The owner found that no exercise's form-demo photos showed any more, noted that only + Note should wrap under the name, and asked for a Profile after Strong's: photo, name and goal, account details, sign-in with other services, a dashboard of widgets (workouts per week, daily macros) and a danger zone with Delete account, in GymHound's style and Pro-friendly where it makes sense.

- **R566a:** the form demo's photos. Round 11 made the Sheet animate its content with `LayoutAnimation` as the keyboard came and went, and wrapped its children in a measured View. On iOS `LayoutAnimation.configureNext` animates the whole next commit, which then held the demo's images at no size, so they never drew. The Sheet no longer animates, and its ScrollView's own content view (`innerViewRef`) is what the keyboard code measures, so the children sit in the ScrollView as before Round 11. The keyboard's padding, the sheet's height less the keyboard and the scroll that keeps a field in view stay.
- **R566b (owner):** an exercise's quiet controls (count, Something off, Modify, Stats, + Note) are a line of their own under [name][⋯] across the card's whole width, the space under ⋯ too, so on a phone only + Note goes to a second line. ⋯'s 44pt box reaches 18pt above the name's line rather than 9pt above and below, and the controls start 8pt under the name, so a control under ⋯ never takes a tap on its glyph; the name's target is as wide as the name.
- **R566 (owner):** the **Profile**, opened from a Profile button in the header left of Settings (the photo in a 40pt circle, else the name's initials, else the person glyph; Close on the Profile, as Settings' button is on Settings; asks a guarding screen first, R89). The page: a card with the photo, the name (else "Add your name and a goal"), "{n} workouts" finished, and the goal, which opens **Edit profile**: the photo with **Change** (Take photo, front camera, iOS's square crop; Choose a photo, no crop step (Round 8), cut to the middle square here) and **Remove**; **Name (optional)** (40 characters) and **Goal (optional)** (140), kept as typed and tidied when the field is left or the page goes; **Account**; **Danger zone**. The photo is 480 px square, a JPEG at 0.8, kept by name in `profile/` like progress photos (R181); on the web the page says the photo is set in the phone app. At over 1.3× text the card stacks (R562). New settings keys: `profile_name`, `profile_goal`, `profile_photo`, `profile_widgets`, `weekly_workout_goal`.
- **R566c:** **Account** says what is true: GymHound has no account. What is logged stays on the phone, so there is no username, email or password to remember or reset, and no sign-in with Apple, Google or Facebook; Backups bring everything to a new phone, and Pro comes back with Restore purchases on the same Apple ID. Real accounts (sign-in, sync across devices) need a server, a privacy policy that covers it, and in-app account deletion (App Store rule 5.1.1(v)); that is the owner's call, asked in the Round 13 check.
- **R567 (owner):** the Profile's **Dashboard**: widgets in the lifter's order, **+ Widget** while any is left to add (a sheet of what is left, each with what it shows, "Pro" on Pro's for a free lifter), and on each ⋯: Move up, Move down, Remove from dashboard, and for Workouts per week its **Weekly goal** (None, 1 to 7). A new profile has Workouts per week and Daily macros. **Workouts per week** (Activity, free): a bar for each of the last 8 weeks (Monday to Sunday, as Stats' week), this week's in the text colour, the count over each bar and the Monday under it ("8/24", the phone's way); with a goal a dashed red line across and "2 of 3 this week" ("goal met" once met), else "2 workouts this week"; History ›. **Daily macros** (Nutrition, Pro): today's calories in a ring against today's target (training or rest day), then Fuel's macro bars (R147); no targets: today's totals, "No targets yet." and Set targets; free or lapsed: what it shows, "Part of GymHound Pro." and See Pro; Fuel ›. **Body weight** (Body, free): the latest weigh-in, the last 3 months' line and its change in words (R175); none yet: Log weight; Body weight ›. At over 1.3× text the macro bars go under the ring.
- **R568 (owner):** **Delete all data** (Edit profile → Danger zone), the local stand-in for Delete account: a question with Cancel first ("Every workout, routine and saved workout of your own, exercise of your own, body entry, photo, food and water entry, your profile and your settings are deleted from this phone, with GymHound's backups on the phone and in iCloud. This can't be undone. Workouts already in Apple Health stay there. Pro stays with your Apple ID."). **Delete everything** empties every table in one transaction and puts back the settings' defaults for the phone's region and the bundled library, programs and foods, as at first launch; Pro's cached answer and the debug unlock are kept. Then the photo folders, the phone's snapshots and GymHound's iCloud snapshots are deleted (best effort, each part on its own), a running rest notification is cancelled, and the app lands on Train. A backup copy saved elsewhere with Save a backup copy is the lifter's own and is not touched. A failure deletes nothing and says so.

### 18.26 Round 13: largest text without cut-offs, Daily macros on one line, and Send feedback (2026-10-13)
Round 13: 16 passed, 1 failed. The fail: at the largest text, text was cut off in several places on Fuel, some on other tabs and on the Profile. A note on Daily macros: calories should be on the same line as the macros, and the amounts over the bars were too big and hard to read. The owner's answers: stay account-free for now; the three widgets are enough. Asked mid-round: a Send feedback option that opens the mail app.

- **R569:** text at the largest sizes, checked screen by screen with a web build at React Native's largest factor (3.571) and a detector that lists text that is clipped, runs off the screen or breaks a word over two lines. What it found, and the rules that fix it:
  - Body text grows as iOS's own Body style does, 17pt to 53pt (`BODY_MAX_SCALE` = 53/17 ≈ 3.12): past it, words such as "measurements" were wider than the screen and broke mid-word. A caller's own cap still wins. Titles stay at 2× (R562).
  - Past 1.3× text (`STACK_ABOVE_SCALE`, `useLargeText`), things that shared a row take a line or a width of their own: Fuel's Calories left and Protein left ("1,440" broke into "1,44" and "0"), Train's Streak and This week ("moved" broke into "move" and "d"), the Profile card, and Daily macros. Settings' Default increment, Rest length and Bell volume choices each take their label's width and wrap ("1.25 kg" spilled out, "100%" ran off the screen); the bar list puts the weight under the name ("Standard" broke over three lines).
  - Fixed-size things keep their size: the plate stepper's − and + are glyphs in 44pt buttons and don't scale; the set table's column headings grow to 1.5×, as the set fields under them do ("PREVIOUS" was cut); chart axis labels grow to 1.5× (`CHART_LABEL_MAX_SCALE`; Fuel's trend labels read "59…"), the chart's spoken summary carrying its numbers.
  - A program's or exercise's name may break after a slash ("Push/pull/legs", "Adductor/groin"), through a zero-width space VoiceOver doesn't say (`breakableName`).
- **R569b (owner):** Daily macros is one line: today's calories in a 76pt ring ("1,160 kcal", "of 2,600" under it), then Protein, Carbs and Fat beside it, each its name, a 4pt bar and "94 / 180 g" in 12pt type that grows to 1.6× at most; a macro with no target shows its grams and no bar. Past 1.3× text the ring has its own line and each macro the card's whole width, name and amount over its bar.
- **R570 (owner):** Settings → **Feedback** (after GymHound Pro): "Found a bug, or have an idea? Tell us. It opens an email in your mail app." and **Send feedback**, which opens the mail app with a new email to grunthound@gmail.com, subject "GymHound feedback", and a body that asks what would make GymHound better or what went wrong (for a bug: what you did, what you expected, what happened), then under a rule the build and the phone's system ("Build abc1234 · 2026-10-13 · iOS 18.2"). No form in the app. With no mail app to take it: "Couldn't open Mail. Write to grunthound@gmail.com."
- **R571 (owner):** GymHound stays account-free for now (R566c stands): no sign-in, no username, email or password; the Profile and Delete all data are as built. The dashboard keeps its three widgets.

### 18.27 Round 14: the calorie ring's track (2026-10-13)
Round 14: 11 passed, 1 failed. The fail: on Daily macros there seemed to be no calorie ring.

- **R572:** the ring's track was drawn in the raised surface colour, which all but vanishes on the card, so with little or nothing eaten the ring looked absent. The track is now the strong border colour at 60%, plainly a ring at 0 kcal; the eaten arc stays the text colour.

### 18.28 Before launch: prices, the rule test, the rating prompt, tester mode and the store build (2026-10-14)
From the owner's strategy review (`marketing/gymhound-combined-plan.md` in the project's files): test the rule with lifters before locking the store copy or paywall, change the prices now, and keep untested features out of the store build. Rules marked "owner" are theirs; the rest are Claude's, for the owner to check.

**Prices (owner)**
- **R580 (owner):** Pro is **$4.99 a month** and **$29.99 a year** ($2.50 a month, marked Save 50%), each with the store's **7-day free trial**, and **$69.99 lifetime**. Lifetime is not one of the radio cards: a quiet **More payment options** under Yearly and Monthly adds it to them. A store that sells only lifetime shows it without the link. The planned prices (`PLANNED_PLANS`) change to match; App Store Connect, Play Console and RevenueCat must be set the same. (Supersedes R556's prices and R563's $119.88.)

**The rule test (stage 1)**
- **R581:** Settings → Developer → **Rule test** opens a full-screen page. Three still screens of bench press (3 × 6–8, +5 lb, planned 135 lb), drawn like a workout's exercise with every line from the rule's own functions: **Rule** (8, 8, 8 at 135: "next time 140 lb ↑"), **Hold** (Rough sleep, 8, 8, 8 at 125: "holds at 135 lb · Rough sleep") and **Miss** (8, 8, 7 at 135: "holds at 135 lb"). The miss is there because a miss holds too: a lifter who can't tell it from the hold hasn't seen what Something off adds.
- **R582:** each screen shows for 5 seconds, then the next; nothing on them can be tapped.
- **R583:** then five questions, each with a field: What will happen next time? Why? What does "Something off" mean here? What would you do if you disagreed? Who decided to hold the weight, you or the app?
- **R584:** Save keeps them on the phone (`rule_test_answers`), under the name typed or "Tester n"; **Share answers** sends every entry as text. Developer only, so lifters never see it.

**The rating prompt**
- **R585:** the store's own prompt (`expo-store-review`), with no question of ours first, asked only when: 3 or more finished workouts; this workout set a personal record or the rule raised a weight; no exercise in it was marked Something off; not asked in the last 60 days; not a tester build.
- **R586:** checked once when the finish summary opens, and asked 1 second later so the summary is seen first. The time it asked is kept (`review_asked_at`). The store decides whether it shows (iOS at most three times a year).
- **R587:** the rules' answer at the last finish is kept (`review_last_check`) and shown in Settings → Developer ("Rating prompt: Something off was marked, so not today."), since the prompt may not show in Expo Go.
- **R588:** a failure is logged and never reaches the screen.

**The store build**
- **R589:** Apple Health, Health Connect, the iCloud copy and the Live Activity (`LEFT_OUT_OF_STORE` in `plugins/nativeConfig.js`) are left out of the `production` and `tester` EAS builds until they pass a phone check on a development build. A left-out package counts as not installed: no plugin, entitlement or permission in the app config, and Metro bundles the stub, so the app's gate (R306) hides the feature as in Expo Go. Development and preview builds keep them, for testing.
- **R590:** `scripts/leave-out-untested.js` runs as `eas-build-post-install` and removes the left-out packages on a store profile before EAS prebuilds, so none of their native code is linked. Taking a package off the list is how a feature joins the store build.
- **R591:** Delete all data names the iCloud copy and Apple Health only where the build has them. The in-app music controls (Task 7.6) aren't built yet; the music bar that opens your player (owner-tested) stays.

**Tester mode (stages 2 and 3)**
- **R592:** a new `tester` EAS profile (production plus `EXPO_PUBLIC_TESTER=1`) is for TestFlight. Pro is on for every tester from the start, with no store and no switch, so testers see the rule on routines of their own. A tester build is never submitted for App Store review.
- **R593:** in a tester build, the finish summary of the 2nd finished workout asks: Did you lift the weight it showed today? If not, why not? Did anything about the rule confuse you? The 3rd asks: Did the rule help you? How? Was there a time it held or raised the weight and you thought it was wrong? Would you pay to set your own rule on your own routines? Each set once; Save keeps them (`tester_answers`).
- **R594:** Settings → **Test answers** (tester builds only) says how many sets are saved, and **Send test answers** shares them as text. Nothing leaves the phone unless the tester sends it.

**Shares**
- **R595:** `EXPO_PUBLIC_STORE_URL`, once set, puts the store link under every share card's footer (without "https://" or "www.") and ends the routine-code message with "Get GymHound: {link}". One link for both stores: a GruntHound page that sends each phone to its store. Unset (now), nothing changes. (Completes R443.)

**Words**
- Store copy, screenshots and docs lead with the rule, and never say the app notices, detects or decides an off day: the lifter marks Something off (`CLAUDE.md`, `PRODUCT.md`, `docs/store/aso.md`).
