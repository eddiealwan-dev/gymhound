# Wear OS app (phase 8) — not built yet

This folder is where the Wear OS app's Android Studio project goes (spec §17.4, R316–R318). It holds only this
README today; nothing here is part of the Expo build, so Expo Go and the phase 7 builds are unaffected.

**Plan:** docs/superpowers/plans/2026-10-12-gymhound-phase-7-8.md, "Phase 8".

## What goes here

- A standalone Gradle project (`wear/app`, Kotlin, Jetpack Compose for Wear OS, minSdk 30) with the **same
  application id as the phone app**, `com.grunthound.gymhound`, and the same signing key: the Wearable Data Layer only
  connects a phone app and a watch app that match.
- `PhoneLink.kt` — the Data Layer: the phone's `WatchState` arrives as a `DataItem` at `/gymhound/state` (kept while
  the phone is away); commands go to the phone with `MessageClient` at `/gymhound/command`.
- The screens: the next set, a rotary-input stepper for weight and reps, Tick, and the rest countdown with +15s and
  Skip; an ongoing activity keeps the countdown on the watch face.

## The rules it follows

- The phone owns the workout. The watch shows what the phone sends and never keeps its own log (R316).
- Messages are the JSON in `src/domain/watchProtocol.ts`, version `WATCH_PROTOCOL`.
- A tick names its workout and set; the phone answers a stale one with its current state (R317).

## Owner-only

Android Studio, a Wear OS device or emulator paired with the phone, and the Play Console listing for the Wear form
factor (the watch app ships in the same listing as the phone app).
