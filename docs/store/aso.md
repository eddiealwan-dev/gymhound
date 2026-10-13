# GymHound: App Store and Play listing (ASO notes)

Drafted 2026-10-12 for the owner to review before the first store submission (plan Task 7.9). Everything here follows `PRODUCT.md`: plain words, no invented claims (no "#1", no user counts, no reviews), no motivational slogans. Red stays out of the screenshots' captions; it appears only where the app itself shows it (the wordmark, the active tab, PR marks).

## App Store (iOS)

| Field | Limit | Text | Length |
|---|---|---|---|
| App name (title) | 30 | `GymHound: Gym Workout Log` | 25 |
| Subtitle | 30 | `Lifting Tracker & Progression` | 29 |
| Keywords | 100 | `weightlifting,strength,routine,program,rest,timer,barbell,plate,calculator,pr,bodybuilding,macro,rep` | 100 |
| Promotional text | 170 | `Today's workout, last time's numbers beside every set, and next time's weight in plain words. An off day holds the weight. No account. Your data stays on your phone.` | 165 |

How the keywords were chosen:
- Apple indexes the title, subtitle and keyword field together. Repeating a word wastes space, so no keyword repeats a word from the title or subtitle (gym, workout, log, lifting, tracker, progression).
- They use singular forms with no spaces after commas. Apple matches plurals, and combines words across fields ("plate" + "calculator", "rest" + "timer", "strength" + "program").
- No competitor or brand names, which App Review rejects.
- Swap candidates if search data says so: `offline`, `planner`, `fitness`, `split`, `5x5`, `hypertrophy`, `notebook`.

**Category:** Health & Fitness (primary); Sports is a possible secondary.
**Age rating:** 4+.
**Privacy label:** Data Not Collected. Workouts, food and photos stay on the device. Health data goes only to the user's own Health store. The iCloud copy goes to the user's own iCloud. Purchases go through the App Store.

### Description outline (4000 max; the first 3 lines show before "more")

1. GymHound is a gym log that tells you next time's weight in plain words.
2. Log a set in one tap, with last time's numbers beside it. Rest with a bell, even with the phone locked.
3. No account, no sign-up. Your data stays on your phone.

Then short sections, in the app's voice:
- **The rule, in words.** If every working set hits the top of the range on a normal day, next time adds weight. It's written under every exercise.
- **Something off?** Rough sleep, sick, short on food, pain, cutting: mark it and the weight holds instead of dropping.
- **Routines.** 8 evidence-based programs, or build your own. Share a routine with a link or a code.
- **882 exercises with form photos.** Add your own exercises and photos.
- **Rest timer.** Per exercise, with -15s, +15s and Skip. On the lock screen with your chosen bell.
- **Personal bests.** Marked as you set them, with share cards for PRs and your week.
- **History and Stats.** A calendar, trends for every lift and body measurement, weekly sets per muscle, CSV export.
- **GymHound Pro.** As many routines as you like, plus Fuel: food log, macro targets for training and rest days, and trends. Your first 7 days after your first workout are full access. Water and the food CSV are always free.
- **Privacy.** Everything is on your phone, with a backup after every workout.

### Screenshot order (6.9" and 6.5" iPhone; up to 10)

Most people see only the first three, so those carry the pitch. Each caption is one plain line above the screen, in Barlow Condensed on the app's dark background. Use a sample history that looks like a real week of training, not round numbers.

1. **Train with Up next.** Caption: "Today's workout, one tap away". Shows the date, Up next with Start, streak and this week.
2. **Session mid-workout.** Caption: "Last time's numbers beside every set". Shows 2 exercises, ghost values, one ticked set and the rest countdown.
3. **Rule line and Something off.** Caption: "Next time's weight, in plain words". Shows the exercise header with the rule line and Something off: Rough sleep.
4. **Finish summary.** Caption: "Know next time before you leave". Shows next-time lines, a red PR mark and Share.
5. **Lock screen Live Activity.** Caption: "Your rest on the lock screen". Shoot it on a device after the native build.
6. **Share cards.** Caption: "Share a PR or your week". Shows the personal best card beside the weekly card.
7. **Routines.** Caption: "8 programs, or build your own". Shows the premade list with one active.
8. **Stats.** Caption: "Every lift, trending up". Shows a lift chart with records.
9. **Fuel (Pro).** Caption: "Food and macros, on training and rest days". Shows Calories left and Protein left.
10. **Privacy.** Caption: "No account. Your data stays on your phone." Shows Settings → Backups, or a plain dark card with the hound mark.

Dark mode for every shot, since the warm dark palette is the brand. Make one light-mode set later if a test shows it converts better.

**App preview video (optional, 15–30 s):** start a routine day, tick 3 sets with the rest countdown, finish, see next time's weight and a PR, then share the card.

## Google Play

| Field | Limit | Text | Length |
|---|---|---|---|
| App name | 30 | `GymHound: Gym Workout Log` | 25 |
| Short description | 80 | `Log every set in a tap. Plain-word progression. Your data stays on your phone.` | 78 |

- **Full description:** the iOS outline above. Play indexes the description, so work in "workout tracker", "weightlifting", "strength training", "rest timer" and "plate calculator" naturally, once or twice each, never as a list.
- **Feature graphic:** 1024×500, dark, the hound mark and GYMHOUND lockup at left, "Your gym log, in plain words" at right.
- **Screenshots:** the same order as iOS.

## Still for the owner to decide

- Pro's price and period, and whether to add a store introductory offer in RevenueCat. Today's 7-day trial is an in-app unlock, not a store trial.
- The privacy policy and terms URLs (`EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_TERMS_URL`), and a support URL. A simple page on a GruntHound domain is enough.
- Whether the listing name should be just "GymHound" once the brand is known; the current title spends 17 characters on search words.
