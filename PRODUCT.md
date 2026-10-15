# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Lifters in general. The person using it is logging a strength session in the gym on their phone, between sets, often one-handed, with music playing and the phone on a bench or in a pocket during rests. The owner builds and tests it on an iPhone first; Android follows (phase 7).

## Product Purpose

GymHound is a local-first gym log that runs a progression rule in plain words. If every working set hits the top of the rep range on a normal day, next time adds weight; a day when something is off holds the weight instead. It shows last time's result beside every set, carries today's values to the next set, times rests with a bell, and keeps routines lining up the next workout. Success is a lifter who opens it, sees today's workout, logs every set in a tap or two, and trusts what it plans for next time.

## Positioning

Per-exercise "Something off" (Rough sleep, Sick, Short on food, Pain, Cutting) means an off day never sets your progression back, and the rule is spelled out in words under every exercise instead of hidden in a formula. Everything stays on the phone: no account, no cloud, no AI coach. The only things that go online are purchases and, in Fuel, a barcode or a search you ask Open Food Facts about; nothing about you.

## Operating Context

- Used on the gym floor, between sets, often one-handed and with sweaty hands; rests are timed, and the bell and lock-screen notification matter when the phone is put away.
- Music is usually playing; the bell ducks it and never stops it.
- Runs in Expo Go today; a native build (Live Activity, Health, a music player, cloud copy of backups) is phase 7. The web build is for development only and is not shipped.
- Data is SQLite on the phone, with a snapshot after every finish and restore on a failed migration; a workouts CSV and a food CSV can be shared.

## Capabilities and Constraints

- Logging: routines with an Up next day, empty workouts, set types (warmup, working, drop, failure), weight and reps, timed, weight and time, distance and time, bodyweight plus and assisted; RPE optional.
- The rule (spec §7.3) with per-exercise Something off, today's weight override, a finish summary of next time's weights, and Up next showing last time's outcome.
- Units: lb or kg, mi or km, and in or cm for body measurements (the length unit goes with the weight unit until the lifter picks one); a logged entry keeps the unit it was logged in and converts for display; bar and plates per unit for the plate calculator and barbell rounding.
- Rest timer per exercise with −15s, +15s and Skip; the bell and its volume are settings.
- GymHound Pro (built in phase 5; live store purchases come with the native build in phase 7): the five Pro programs (Push/pull/legs, Upper/lower, Advanced full body, Bro split, Calisthenics), routines of your own and saved workouts, and Fuel — about 8,300 foods on the phone from USDA (staples, restaurant and fast-food items, branded groceries), Search online and barcode scanning through Open Food Facts, quick add, your own foods, training-day and rest-day targets, a two-number summary (Calories left, Protein left), macro bars, trends over 1M / 3M / 1Y, and the Short on food offer in the session. Everything else is free, including four programs (Beginner full body, 5×5, Dumbbell full body and Mobility), Stats, water with your own daily goal (on the Fuel tab) and the food CSV. Pro is $4.99 a month or $29.99 a year, each with the store's 7-day free trial, or $69.99 once under More payment options (R580). GymHound has no trial of its own (R563). A lapse deletes nothing: Fuel locks with its data kept, and your routines and saved workouts are kept, ready again with Pro. In Expo Go and every build until phase 7 there is no store; a developer switch turns Pro on for testing.
- Data sources: exercises from free-exercise-db (the Unlicense); foods from USDA FoodData Central SR Legacy (CC0 1.0).
- Planned phases: routines editor and premade programs, nine today (3), library with photos, custom exercises, plates, bodyweight and measurements, PRs (4), Pro and Fuel (5), History, Stats and progress tools (6), native build (7), watch apps (8).
- Undecided: App Store launch timing.
- Never say the app notices, detects or decides an off day. The lifter marks Something off, and the weight holds.

## Brand Commitments

- The name GymHound, with the GYMHOUND wordmark beside the hound mark on one line at every width; the wordmark keeps a fixed size.
- The hound mark is the dog from the GruntHound logo, cut from the owner's logo file. It is never redrawn, traced or replaced.
- Red #E10600 is used only for the GYMHOUND wordmark, the active tab and PR marks.
- The footer "powered by GRUNTHOUND LLC" (the GruntHound wordmark image) appears on Train, History, Stats, Fuel and Settings, never on the session or the finish summary, and never contains the hound.
- No flames or skulls. The one motivational line is Train's daily line under the greeting (the owner asked for it after Round 8): short, plain, in GymHound's own voice, never an exclamation.
- Voice: plain, short sentences; say what will happen ("Incomplete sets won't count"); straight apostrophes.

## Evidence on Hand

- Brand assets in `assets/brand/` (hound mark and the GruntHound wordmark, light and dark).
- The design spec `docs/superpowers/specs/2026-10-09-gymhound-design.md` records every confirmed decision; §18 holds the owner's later decisions.
- No testimonials, user counts, reviews or press exist yet. Do not invent them.

## Product Principles

1. An off day never punishes you: flag it, and the weight holds.
2. What a set shows is what it logs; suggestions look like suggestions.
3. Fast one-handed in the gym: the next action is always in reach.
4. Your data stays on your phone and survives a crash.
5. Plain words over jargon, including the rule itself.

## Accessibility & Inclusion

- All text follows the phone's text size; only the wordmark is fixed, and the session header's name, progress line and Finish label stop growing at 1.3× so the header stays one row. Rows wrap instead of truncating.
- Every control has a VoiceOver label; touch targets are at least 44pt.
- Suggested values and field edges keep at least 3:1 contrast in light and dark themes.
