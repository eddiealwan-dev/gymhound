# GymHound: handoff to a new session (2026-10-11)

Paste this whole file into the new session as its first message. It is the complete state; the new session has none of the earlier conversation.

## 0. Before the cloud session can start (the owner does this on the PC)

The repo lives only on the owner's PC at `C:\Users\eddie\OneDrive\Documents\GymHound`, and **it has no git remote**. A cloud session sees only what is pushed to GitHub. So first:

1. Create an empty **private** GitHub repo (for example `gymhound`), without a README.
2. On the PC, in the GymHound folder, commit the photo-swap fix if it's there (see 4.2), then push every branch:
   ```
   git remote add origin https://github.com/<you>/gymhound.git
   git push -u origin --all
   ```
3. Start the cloud session on that repo, on branch **`phase-3`**.

What is NOT in git, so the cloud session won't have it unless recreated:
- `.superpowers/` (the SDD ledgers, briefs and reports; gitignored). Everything that matters from them is in this file.
- `.claude/skills/impeccable` and `.claude/agents/` (the Impeccable design skill, installed with `npx impeccable install`, Claude Code, project scope). Reinstall it in the cloud session before the final design pass. `PRODUCT.md`, `DESIGN.md` and `.impeccable/design.json` ARE committed on phase-3.
- `node_modules`: on the PC it is a junction to `C:\Users\eddie\.gymhound\node_modules`. In the cloud just run `npm ci` (package-lock.json is the truth; it includes the devDependency `sharp`, used only by `scripts/build-library.mjs`).
- `scripts/.cache/` (downloaded free-exercise-db photos; gitignored). The vendored data is committed at `scripts/vendor/free-exercise-db/exercises.json`, and the 1,746 WebP photos are committed under `assets/exercises/`.

## 1. The project

- **GymHound**: a local-first Expo / React Native gym log (Expo SDK 57, RN 0.86 Fabric, Expo Router with tabs and hidden routes, expo-sqlite + Drizzle with migrations 0000–0005, zustand `dataVersion` + `useDbQuery`, Jest via jest-expo using better-sqlite3 and react-test-renderer). Node 24.
- **Spec (the authority):** `docs/superpowers/specs/2026-10-09-gymhound-design.md`. §15 lists the phases; §18 holds the owner's later decisions and wins over earlier sections (§18.6 polish, §18.7 phase 2, §18.8 phase 3).
- **Plans:** `docs/superpowers/plans/` (polish, phase-2 and phase-3 plans).
- **Product and design records:** `PRODUCT.md` (platform adaptive; users are lifters in general; brand rules) and `DESIGN.md` (North Star "The Bench-Side Logbook"; the exercise name row and rest row are signatures).
- **Commands:** `npm test` (82 suites / 1,879 tests at the handoff commit), `npm run typecheck`. If typecheck reports Expo Router typed-route errors (`/routines/...` not assignable), regenerate `.expo/types/router.d.ts` by starting `npx expo start` once (it is gitignored and stale per checkout).
- **The owner** tests on an **iPhone in Expo Go** (`npx expo start --offline` on the PC; shake, then Reload). The web build is for development only.
- **Process (superpowers SDD):** spec → plan → per task, an implementer subagent, then a reviewer (opus for the first review, sonnet for scoped re-reviews), fix rounds by resuming the implementer, then a final whole-branch review on the most capable model. Record every decision in a ledger as `Ruling: <what> — <why> — <cost if wrong>`. Rulings go in the spec as notes too. Never stop to ask between tasks; stop only for irreversible, security-sensitive or outside-the-repo actions (merges into main, pushes, publishing).
- **Copy and brand rules:** plain short sentences, straight apostrophes, say what will happen. Red `#E10600` is only for the GYMHOUND wordmark, the active tab and PR marks. The hound mark comes from the owner's GruntHound logo file in `assets/brand/` and is never redrawn. Footer "powered by GRUNTHOUND LLC" on Train, History, Stats, Fuel and Settings only. No motivational quotes, flames or skulls. Every control has a VoiceOver label; targets are at least 44pt; text follows the phone's size, and rows wrap instead of truncating.

## 2. The owner's standing instructions (latest first)

1. **2026-10-11, latest:** "Fix these first [the Round 6 fails]. Once the fixes are done and reviewed, continue through all remaining phases without waiting for me. After all phases are complete, run a final Impeccable design pass on the whole app (keep the existing warm dark palette, red wordmark, and header lockup). I'll review the final product when everything is done."
2. Earlier the same day: "Nothing merges until the fixes are done and reviewed."
3. Merges: only `phase-2 → main` was authorised (done, main = 40a2f00). **Do not merge `phase-3` or later into main**; the owner reviews the final product first. Build each later phase on a branch stacked on the previous one (phase-4 off phase-3, and so on).
4. Programs: the owner asked whether the eight programs are proven programs. Answer given: they're evidence-based custom programs checked against the research guidelines, not copies of named programs. The owner chose **"Keep the evidence-based ones"**.
5. File size: "do not ask about the file size just add them if needed" (the bundled exercise photos are ~10.6 MB).
6. The owner repeatedly asked to go **faster**: parallelise independent work, keep turns short.

## 3. Branches (local; push them all)

| Branch | Head | What |
|---|---|---|
| `main` | 40a2f00 | Phase 1 + polish + phase 2 (Something off and the rule) + Round 5 fixes |
| `design-pass` | 832f665 | Impeccable design pass on Train, Session, Routines, Settings (merged into phase-3) |
| **`phase-3`** | **see `git log`** | **The working branch.** main + design pass + all of phase 3 (library, programs, picker, form demos, routines screens and editor) + 1e079e7 (R94/R95) + the R98 photo swap and this handoff file |
| `phase-3-lib`, `phase-3-routines`, `phase-3-data`, `phase-3-task1`, `phase-3-base` | merged | Already merged into phase-3; can be deleted after review |

Local worktrees under `.claude/worktrees/` (p3-base, p3-lib, p3-routines) are scratch; ignore them in the cloud.

## 4. Do first: the Round 6 fails

Round 6 results are in the checklist artifact's database (see §7). Real Round 6 result: **23 pass, 3 fail**. The owner's summary also listed "date gone at largest text" and "Change routine mid-workout", but in the Round 6 data those two **passed** (`r6-date-large`, `r6-change-routine`); the notes were copied from Round 5. Re-verify both anyway (the code is on phase-3: `app/(tabs)/index.tsx:274` date line has `numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.3}`; `src/ui/WorkoutInProgressSheet.tsx` has the "Workout in progress" sheet). Note: `r5-header-large` was re-touched at 17:08 with that date note and status Pass. If the date really vanishes, the likely culprit is a fixed lineHeight or a parent clipping height again, as in Round 5 (R79).

### 4.1 Not-ready tick: no message, no buzz (failed Rounds 4, 5 AND 6)

The owner taps the tick on a set with no weight: the keyboard opens and selects the weight box, but no "Add a weight to tick" line shows and there is no buzz. Code: `src/ui/session/SetRow.tsx` `toggle()` (~line 229) → `warningHaptic()` (impactAsync Heavy), `setAsked(true)`, `announce(...)`, then after the haptic promise `setFocusAsk({ key })`, which focuses the field. The line renders above the inputs (Body muted 12pt). Tests pass, so this is device-only.

Evidence so far:
- Round 4 used `notificationAsync(Warning)`: no buzz (R65). Rounds 5–6 used `impactAsync(Heavy)`: no buzz.
- The rest timer's `Haptics.notificationAsync(Success)` in `src/ui/session/RestWatcher.tsx` DOES buzz on this phone (checked in Round 1).
- The difference: the not-ready path focuses a TextInput, so the keyboard comes up at the same moment. Strong hypothesis: iOS drops the haptic when the keyboard appears, and the 12pt muted line is missed or covered while the keyboard animates and the ScrollView (`app/session.tsx`, `automaticallyAdjustKeyboardInsets`) scrolls.

Recommended fix (rule it as R99 and note it in spec §18.6): **don't focus the field on a not-ready tap.** The tap buzzes (notificationAsync Warning), keeps the keyboard down, and shows the line clearly. Make the line full text colour at body size with an `alert-circle-outline` icon, still not red. The field gets the needed-field look so the person taps it themselves. Keep the VoiceOver announce. Update the tests that pin focus-after-haptic. Device re-check in Round 7 asks two separate questions: did you feel a buzz, and did the line show?

### 4.2 Form demo photo swap looks off with motion on (Reduce Motion OFF)

Cause: a 250 ms cross-fade between two photos of the same person in the same scene leaves a ghost of the first pose. 869 of the 873 photo pairs are the same size, so it isn't letterboxing.

**R98:** swap instantly, like a flipbook. Keep both Images mounted and stacked, flip the end photo's opacity 0↔1 via state every 1,200 ms (no Animated), and give the overlaid photo an opaque background. Reduce Motion behaviour stays (side by side, still). Spec §18.8 bullet: "swapping every 1.2 seconds (an instant swap, no cross-fade: a blend of two poses shows a ghost, R98)".

**Done and committed on phase-3** (the commit after 1e079e7, together with this handoff file): `src/ui/FormDemo.tsx`, `src/ui/FormDemo.test.tsx` and the spec bullet. 82 suites / 1,879 tests pass; typecheck clean. It still needs its review (fold it into the §4 fix review).

### 4.3 Ab roller: set a rest timer, ticked a set, no rest came up

The owner's own routine; ab roller is `fedb-ab-roller` (bodyweight_plus). The code starts no rest in only two cases (`src/domain/rest.ts` `restAfterTick` / `shouldStartRestAfterTick`; `src/state/sessionActions.ts` ~line 100): the rest length is 0 ("Off"), or the exercise is mid-superset (rest waits for the last exercise of the superset). The owner made a superset in the routine editor during Round 6, so the likeliest cause is that ab roller was the first exercise of a superset. The session shows a superset only as a 3px bar, with no words. Before fixing, write a test that reproduces "rest set on ab roller, tick a set, rest row shows" with ab roller NOT in a superset, to rule out a real bug (e.g. bodyweight_plus with an empty weight, or a rest chosen on the routine instead of the exercise prefs).

Then make the superset visible:
- **R100:** a superset block says so in words (e.g. a quiet "Superset" label by the bar).
- A tick mid-superset shows a quiet line under the set, "Rest after {last exercise in the superset}", where the rest row would be.
- The ⋯ Rest panel for a superset member that isn't last says the same.

### 4.4 "Why can we not have photos on these?" (a question; the check passed)

Six exercises predate the library and have no free-exercise-db entry: Wall sit, Hollow body hold, Reverse lunge (bodyweight), Pike push-up, Split squat (bodyweight), Bird dog. free-exercise-db (the Unlicense photo source) has no photos of them, so they got hand-written steps (R95) and no photos. Using a near match's photos (e.g. a dumbbell rear lunge for the bodyweight reverse lunge) would show the wrong form.

Answer the owner. The options are:
- (a) the owner supplies photos;
- (b) Phase 4's custom exercises gain "add your own photo";
- (c) a different openly licensed source, checked for licence first.

Don't invent or AI-generate form photos.

### 4.5 After the fixes

Review them (opus, then a scoped re-review), run `npm test` + `npm run typecheck`, then publish **Round 7** on the checklist with re-checks for 4.1–4.3 (and 5/6 if touched) plus the still-owed checks below.

## 5. Phase 3 items still owed (do with or right after §4)

- The re-review of the routines fix round (phase-3-routines 6bfc9d2, merged) never ran (usage limit). Its 7 fixes:
  1. a fresh New routine shows no stale errors;
  2. number fields `minWidth: 64`;
  3. a premade's editor address opens its read-only detail;
  4. Dock / Header / Android Back "Discard changes?" guard tests;
  5. a new blank day is "Day {n}" for its place;
  6. a 0 increment reads "reps only";
  7. Seconds accepts "1:30" (R97: it shows "90" after leaving).
- Picker and demo minors from review, not done yet:
  - `src/domain/search.ts:75`: replace the per-keystroke `localeCompare` sort with a stable partition (name-prefix matches first, then input order; the input is already sorted).
  - `src/db/repositories/exercisesRepo.ts:3` imports the 1,746-require photo index on the launch path; compute `hasPhotos` in the UI instead.
  - `app/pick-exercise.tsx` row thumbnail: `resizeMethod="resize"` for Android.
  - Search words "delts", "front delt", "side delt", "rear delt" find those primaries (the chip stays "Shoulders").
- Commit 1e079e7 (the ⓘ cue R94, the six exercises' steps R95, Href typing in the routine editor) had no independent review.
- The browser acceptance walkthrough of phase 3 never finished, and the Phase 3 final whole-branch review (opus) hasn't run. Run both after §4.
- Not added: a Settings developer switch for the Pro debug unlock (debug unlock works only under `__DEV__` or `EXPO_PUBLIC_DEBUG_UNLOCK === '1'`).

## 6. Remaining phases (spec §15 and §18.3; each gets its own plan and SDD run, stacked branches)

- **Phase 4: library, custom exercises, plates, body, PRs.** The library and form demos are already done in phase 3. Remaining:
  - custom exercises (all logging types including weight and time);
  - saved workouts (moved here from phase 3 by §18.8);
  - plates owned in Settings, the calculator and barbell rounding (check what phase 1 already has);
  - the bodyweight log plus measurements (waist, chest, hips, arms, thighs, neck, body fat %), each with a chart;
  - PR flags and finish-summary PRs;
  - **Share a personal best** (an image through the share sheet; nothing uploaded).
- **Phase 5: Pro, paywall, Fuel.**
  - The `Entitlements` interface exists (`src/platform/entitlements/`, free-only). Add the debug implementation and a RevenueCat implementation behind it. Live products need the Apple account, so live purchases are phase 7.
  - The paywall screen; "See Pro" currently says "GymHound Pro is coming.".
  - Fuel: foods seed, log, quick add, custom foods, targets, summary, the training-day switch, macro graphs and trends.
  - The water logger with a custom daily goal (free).
  - The Short on food offer.
  - Pro unlocks more routines and Fuel. Free limit: 1 user routine.
- **Phase 6: History, Stats, CSV.**
  - History list and detail with saved notes; edit and delete with recompute; **Repeat**.
  - Trends for every lift and measurement; Stats charts with mark and stall labels; records.
  - Rule-based analytics: weekly sets per muscle against 10–20, sessions, PRs, the bodyweight trend.
  - A weekly check-in; the consistency calendar; progress photos kept in the app's folder.
  - The pedometer (iPhone: today and the last 7 days).
  - CSV export (with `exercise_note`). No AI coach.
- **Phase 7: native build.** It needs the owner's Apple Developer account and EAS, which a cloud session can't sign or run on a device. Write the code and config:
  - `expo-dev-client`;
  - Live Activity / Android ongoing notification for the rest timer;
  - RevenueCat live products;
  - Apple Health / Health Connect (write-out and three reads, §17.1);
  - the iCloud / Android backup copy of snapshots (§17.2);
  - the music player (§17.3);
  - the bell on the lock screen.
  
  Mark what needs the owner (accounts, builds, device checks). Spec §15 says this phase is outside the acceptance list.
- **Phase 8: watch apps** (Apple Watch, Wear OS, §17.4). Native targets; plan and scaffold what's possible and flag what needs Xcode or Android Studio and the owner's accounts.
- **Then:** the final Impeccable design pass over the whole app: keep the warm dark palette, red wordmark and header lockup. The owner reviews the final product. Don't merge to main without the owner.

## 7. The owner's iPhone checklist

- Artifact: https://claude.ai/artifact/AYRahYDFiPYYoMjRCkQ1wz ("GymHound Phone Check", private, `db` capability).
- Results are in its db collection `results`, one doc per check id (`status` pass/fail/skip, `note`, `item`, `at`). Read them with the ArtifactData tool, action `query`, collection `results`, limit 200.
- The page source was a local scratch file. From a new session, read the artifact (Artifact `action: "read"`), edit the HTML, and republish to the same `url`.
- Rounds: Round 1 (`crash-*`, `set-*`, `p1-*`, etc.), Round 2 (`r2-*`), Round 4 (`r4-*`), Round 5 (`r5-*`), Round 6 (`r6-*`, current). To add Round 7:
  - add a `ROUND7` array of sections;
  - point `ALL` at it and add it to `EVERY`;
  - add a round heading at the top of `render()`, keep older rounds below as "done, kept for reference";
  - update the intro paragraph (which branch is checked out, `npx expo start --offline`, Reload).
- The owner tells you in chat when a round is done; then read the db.
- Still owed on the device: the buzz (4.1); a Round 7 check for the superset wording (4.3); and Round 6 never asked whether the tick's light haptic works.

## 8. Rulings so far (cost if wrong in brackets)

- **R48–R59 (polish):**
  - R48: a tick logs what its row shows.
  - R49: a cleared target field shows the target ghost.
  - R50: a rest length chosen from the countdown applies to future rests only.
  - R54: the Train name row uses flexGrow/Shrink with basis auto.
  - R55: Finish anyway runs after the sheet closes.
  - R56: a routine-day workout is named "{routine} {day}".
  - R57: the Finish sheet names exercises with nothing logged; "Incomplete sets won't count".
  - R58: Change routine › also shows under Resume.
  - R59: Rest's up names the next set of the same exercise until its last set.
- **R65–R78 (phase 2):**
  - R65: the not-ready haptic is impactAsync Heavy (now in question, §4.1).
  - R66: the target is the ghost on ticked sets too.
  - R67: the tick target is 44pt wide, with no slop toward reps.
  - R68: a resumed rest's track uses the current rest length.
  - R69: Up next's subtitle is "Last time: {date}"; marks are per exercise.
  - R70/R72/R76: an assisted raise isn't plate-rounded, shows ↓, and holds at 0.
  - R71: the override pre-fills today's target.
  - R73/R77: Up next's ↑ shows the actual change in the display unit.
  - R74: next weights are written only if the routine slot still holds the same exercise.
  - R75: bodyweight_plus at 0 reads "holds at bodyweight".
  - R78: Done, Discard and Back return to the existing Train screen.
- **R79–R83 (Round 5):**
  - R79: the date shrinks to fit.
  - R80: Change routine mid-workout opens the "Workout in progress" sheet (Resume / Not now), including Set active on Routines.
  - R81: a Something off control in the name row.
  - R82: the not-ready line sits above the inputs.
  - R83: bodyweight finish lines.
- **R84–R93 (phase 3):**
  - R84: the full free-exercise-db library, 882 exercises; the 55 legacy ids are kept, others are `fedb-{slug}`.
  - R85: the equipment, muscle and logging-type mapping.
  - R86: form demo.
  - R87: the eight programs; 5×5 and No equipment retired (hidden unless active or used).
  - R88: Entitlements is free-only; the debug unlock is gated; free holds 1 user routine.
  - R89: the editor.
  - R90: deleting a routine keeps history and clears active.
  - R91: sentence-case imported names.
  - R92: band-assisted moves log as bodyweight_plus.
  - R93: the volume check is 8–24 hard sets per group per week; the shoulder cap counts side and rear delts only; a real press on every pressing day.
- **R94–R97:**
  - R94: a muted ⓘ after the exercise name.
  - R95: hand-written steps for the six source-less exercises (`LEGACY_STEPS` in `src/seed/libraryMapping.ts`, mirrored in `library.generated.ts`; `library.test.ts` checks they match `buildLibrary`).
  - R96: the name-row hit-slop overlap stays.
  - R97: Seconds "1:30" shows "90".
- **To make:** R98 (instant photo swap), R99 (not-ready without focus), R100 (superset in words).

## 9. Gotchas

- The library file `src/seed/library.generated.ts` (~828 KB) is generated by `scripts/build-library.mjs`. Patch it in step with `libraryMapping.ts`, or regenerate it (the photos need the network or `scripts/.cache`). Import it only on the seed path, not at app start. `src/seed/libraryIds.json` guards against ids vanishing.
- Line endings: files are CRLF on the PC. Keep each file's existing endings when scripting edits.
- Seed v2 / migration 0005 added `exercises.instructions`, `exercises.source_id` and `routines.retired`. Version 1 routine rows keep their ids, so next weights survive. An end-to-end restore→seed test exists.
- The shared contract `src/state/pendingPick.ts` (zustand `set` / `take`): the picker route `/pick-exercise?mode=routine` hands a pick back to the routine editor.
- Jest ignores `.claude/` (`testPathIgnorePatterns` and `modulePathIgnorePatterns` in package.json).
