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
- Barcode scanning (a seam is left for it, see 8.10).
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
- **Network:** the only network call anywhere is RevenueCat's entitlement check (phase 7 live, phase 5 code). It never blocks the UI.

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
| archived | int | custom exercises used in history are archived, never deleted |
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
| rest_bell | true |
| rest_bell_sound | `bell` (one of the bundled bell sounds) |
| last_snapshot_at | null until the first snapshot (§17.2) |
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
  - Routines, library, history detail and Settings open inside the tabs, so the header and dock stay. On Settings no tab is highlighted.
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
- Rest timer length, the rest bell (on or off, default on) and the bell sound.
- Fuel targets (Pro).
- Apple Health or Health Connect (phone builds, phase 7): writing workouts, and each read (sleep, body weight, heart rate) switched on separately.
- Backups: the time of the last snapshot and the export buttons.
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
About 300 common foods with typical serving sizes, taken from USDA FoodData Central generic foods (public domain), stored in `src/seed/foods.json`.

## 11. CSV export

- **Encoding:** RFC 4180 quoting, UTF-8 with a BOM so Excel reads it correctly.
- **Sharing:** files are written to the cache directory and opened in the share sheet.
- **`gymhound-workouts-YYYY-MM-DD.csv`:** one row per done set of finished workouts. Columns: `workout_id, date, started_at, finished_at, workout, routine, routine_day, day_mark, exercise, exercise_id, set_number, set_type, weight, weight_unit, reps, rpe, duration_s, distance, distance_unit, pr, exercise_note`. `exercise_note` is the note saved with that workout. The `pr` column holds kinds joined by `|`. Times are ISO 8601 with offset.
- **`gymhound-food-YYYY-MM-DD.csv`:** one row per entry. Columns: `date, logged_at, name, servings, kcal, protein_g, carbs_g, fat_g`.

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
5. **Pro, paywall, Fuel**
   - Debug and RevenueCat implementations, paywall screen, Fuel (foods seed, log, quick add, custom foods, targets, summary, training-day switch), and the Short on food offer.
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
  2. One of three cards:
     - **Up next**, when no workout is active and a routine is:
       - The eyebrow "UP NEXT", then the title "{routine} · {day}".
       - One line: "First time on this day." or "Last time: {date} · {mark}".
       - A filled **Start {day}**, for example "Start Upper A". A day whose name has one or two characters reads "Start {routine} {day}", for example "Start 5×5 A".
       - One line per exercise: the name on the left, and the scheme and load on the right ("4×5–8 · 60 kg").
       - A loadable exercise with no weight shows "—" when another exercise that day has a weight.
       - When no exercise has a weight, the rows show no load, and the line under the title ends "Pick weights as you go." The words "pick a weight" are gone.
       - A quiet **Change routine ›** at the foot of the card opens Routines.
     - **No routine:** one card reads "No routine yet. Pick one and Train will line up your next workout.", with a filled **Choose a routine** and an outlined **Start empty workout**.
     - **In progress:** the Resume card, with the eyebrow "IN PROGRESS". Resume is the only filled button. Start empty workout and Up next are hidden.
       - Round 4: the same quiet **Change routine ›** sits at the foot of the Resume card, under Resume, so Routines is reachable while a workout runs.
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
  - The next set to do has a bolder tick ring (2.5pt, text colour). It is the first unticked set in workout order. In a superset, it is in the member with the fewest ticked sets, with the earlier member winning a tie.
- **Suggested values look like suggestions:**
  - Today's target and every placeholder (from last time, the rule or a carry) draw with no fill, a dashed `borderStrong` outline, `textFaint` and Barlow 600.
    - VoiceOver adds the hint "Suggested. Tick the set to log it.", except on a ticked set, where a tap on the tick would untick it.
  - A typed, saved or ticked value draws solid: a `surface` fill, a `borderStrong` outline, the `text` colour and Barlow 800.
  - A cleared weight field on a row with a target shows the target as its placeholder, which is what the tick logs. A ticked set does too: leaving the weight blank takes the tick off, and the open row then shows the target.
- **Slimmer exercise blocks** (replaces the always-open note in §8.4 and the §18.2 button labels):
  - An empty note shows a quiet **+ Note** with a pencil in the name row. It opens the note field, focused.
  - A saved note shows in full as a muted line under the name. Tap it to edit.
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
