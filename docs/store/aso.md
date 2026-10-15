# GymHound: App Store and Play listing (ASO notes)

Drafted 2026-10-12 for the owner to review before the first store submission (plan Task 7.9); updated 2026-10-14 from the combined strategy and ASO plan (title, subtitle, keywords, rule-first captions, prices), and 2026-10-15 for the twenty programs. Everything here follows `PRODUCT.md`: plain words, no invented claims (no "#1", no user counts, no reviews), no motivational slogans.

**Never** say the app notices, detects or decides an off day: the lifter marks Something off, and the weight holds. No "knows", "smart", "AI" or "coach" in any field, caption or screenshot. Nothing untested on a phone (Live Activity, Apple Health, iCloud, the in-app music controls, watch apps) appears in the listing, not even as "coming soon". Red stays out of the screenshots' captions; it appears only where the app itself shows it (the wordmark, the active tab, PR marks).

## App Store (iOS)

| Field | Limit | Text | Length |
|---|---|---|---|
| App name (title) | 30 | `GymHound: Progressive Overload` | 30 |
| Subtitle | 30 | `Lifting Log & Strength Tracker` | 30 |
| Keywords | 100 | `workout,gym,weightlifting,routine,program,plate,calculator,rest,timer,5x5,offline,powerlifting,split` | 100 |
| Promotional text | 170 | `See the rule behind every weight. Hit the top of your range on every set and next time goes up. Mark an off day and it holds. No account. Your data stays on your phone.` | 168 |

How the keywords were chosen:
- Apple indexes the title, subtitle and keyword field together. Repeating a word wastes space, so no keyword repeats a word from the title or subtitle (gymhound, progressive, overload, lifting, log, strength, tracker). "progressive overload" is the title phrase because it is the rule, in the words lifters search; head terms (workout, gym) stay only as cheap combining words, since a new app won't rank for them alone.
- They use singular forms with no spaces after commas. Apple matches plurals, and combines words across fields ("plate" + "calculator", "rest" + "timer", "strength" + "program").
- No competitor or brand names, which App Review rejects.
- Swap candidates if search data says so: `hypertrophy`, `notebook`, `planner`, `bodybuilding`, `pr`, `rep`, `barbell`, `macro`.

**Category:** Health & Fitness (primary); Sports is a possible secondary.
**Age rating:** 4+.
**Privacy label:** Data Not Collected. Workouts, food and photos stay on the device. Health data goes only to the user's own Health store. The iCloud copy goes to the user's own iCloud. Purchases go through the App Store.

### Description outline (4000 max; the first 3 lines show before "more")

1. GymHound shows you the rule behind every weight. Hit the top of your rep range on every set and next time goes up.
2. Had a rough day? Mark Something off and the weight holds instead of dropping.
3. No account, no feed. Your workouts stay on your phone.

Then short sections, in the app's voice:
- **The rule, in words.** If every working set hits the top of the range on a normal day, next time adds weight. It's written under every exercise, in every program, with why the weight went up or held. Change the weight or the rule yourself.
- **Something off?** Rough sleep, sick, short on food, pain, cutting: you mark it and the weight holds instead of dropping. The rule and Something off are free.
- **Routines.** All 20 programs, five of them free, each with its own card: a short description and the sources it cites. Or build your own. Share a routine with a link or a code.
- **990 exercises with steps and form demos, photos for most.** Add your own exercises and photos.
- **Rest timer.** Per exercise, with -15s, +15s and Skip, with your chosen bell.
- **Personal bests.** Marked as you set them, with share cards for PRs and your week.
- **History and Stats.** A calendar, trends for every lift and body measurement, weekly sets per muscle, CSV export.
- **GymHound Pro.** Routines of your own, saved workouts, all 20 programs (five are always free), and Fuel: food log, macro targets for training and rest days, and trends. $4.99 a month or $29.99 a year, each with a 7-day free trial, or $69.99 once. Water and the food CSV are always free.
- **Privacy.** Everything is on your phone, with a backup after every workout.

### Screenshot order (6.9" and 6.5" iPhone; up to 10)

Most people see only the first three, so those carry the pitch. Each caption is one plain line above the screen, in Barlow Condensed on the app's dark background. Use a sample history that looks like a real week of training, not round numbers.

1. **The rule.** Caption: "Know what to lift next, and why". Shows bench press with the rule line ("Hit 8s on a normal day and next time is 140 lb") and last time's numbers beside each set.
2. **Something off.** Caption: "Rough day? Mark it. The weight holds." Shows Something off: Rough sleep and "Rough sleep today, so 135 lb holds."
3. **Finish summary.** Caption: "Know next time before you leave". Shows next-time lines (one up, one held · Cutting), a red PR mark and Share.
4. **Change the rule.** Caption: "Change the rule. Or the weight." Shows the routine editor's rep range and increment beside today's override.
5. **Privacy.** Caption: "No account. Your data stays on your phone." Shows Settings → Backups, or a plain dark card with the hound mark.
6. **Share cards.** Caption: "Share a PR or your week". Shows the personal record card beside the weekly card.
7. **Routines.** Caption: "20 programs, each with its sources". Shows the PROGRAMS list with one active, or a program's card with its Sources link.
8. **Stats.** Caption: "Every lift, trending up". Shows a lift chart with records.
9. **Fuel (Pro).** Caption: "Food and macros, on training and rest days". Shows Calories left and Protein left.
10. **Session mid-workout.** Caption: "Last time's numbers beside every set". Shows 2 exercises, ghost values, one completed set and the rest countdown.

The Live Activity shot comes back only after it passes a phone check.

Dark mode for every shot, since the warm dark palette is the brand. Make one light-mode set later if a test shows it converts better.

**App preview video (optional, 15–30 s):** start a routine day, tick 3 sets with the rest countdown, finish, see next time's weight and a PR, then share the card.

## Google Play

| Field | Limit | Text | Length |
|---|---|---|---|
| App name | 30 | `GymHound: Progressive Overload` | 30 |
| Short description | 80 | `Lifting log that shows the rule behind every weight. No account, no feed.` | 73 |

- **Full description:** the iOS outline above. Play indexes the description, so work in "progressive overload", "workout tracker", "weightlifting", "strength training", "rest timer" and "plate calculator" naturally, once or twice each, never as a list.
- **Feature graphic:** 1024×500, dark, the hound mark and GYMHOUND lockup at left, "Your gym log, in plain words" at right.
- **Screenshots:** the same order as iOS.

## Still for the owner to decide

- Prices are set (R580): $4.99 a month and $29.99 a year, each with the store's 7-day free trial, and $69.99 lifetime under More payment options. Set the same in App Store Connect, Play Console and RevenueCat.
- The privacy policy and terms URLs (`EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_TERMS_URL`), and a support URL. A simple page on a GruntHound domain is enough.
- Whether the listing name should be just "GymHound" once the brand is known; the current title spends 17 characters on search words.
