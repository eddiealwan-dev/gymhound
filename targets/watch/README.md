# Apple Watch app (phase 8) — not built yet

This folder is where the watchOS app's sources go (spec §17.4, R316–R318). It holds only this README today, so
nothing here is compiled, autolinked or prebuilt, and Expo Go and the phase 7 builds are unaffected.

**Plan:** docs/superpowers/plans/2026-10-12-gymhound-phase-7-8.md, "Phase 8".

## What goes here

- `expo-target.config.js` — the `@bacons/apple-targets` description of a `watch` target (SwiftUI, watchOS 10+,
  bundle id `com.grunthound.gymhound.watchkitapp`, the app group `group.com.grunthound.gymhound`). Adding this file is
  what makes `npx expo prebuild` create the Xcode target, so add it only together with the Swift sources and the
  `@bacons/apple-targets` plugin entry in `plugins/nativeConfig.js`.
- `GymHoundWatchApp.swift`, `SessionView.swift`, `RestView.swift` — the screens: the next set (exercise, set name,
  weight × reps), a Digital Crown stepper for weight and reps, Tick, and the rest countdown with +15s and Skip.
- `PhoneLink.swift` — `WCSession`: receives the phone's `WatchState` (application context, so the newest state is
  kept while the phone is away) and sends `WatchCommand`s (`sendMessage` when reachable, else `transferUserInfo`).

## The rules it follows

- The phone owns the workout. The watch shows what the phone sends and never keeps its own log (R316).
- Messages are the JSON in `src/domain/watchProtocol.ts`, version `WATCH_PROTOCOL`. A message of another version is
  ignored and the watch asks for an app update.
- A tick names its workout and set; the phone answers a stale one by sending its current state (R317).
- The rest countdown is drawn from `restEndsAt` on the watch's own clock, as the Live Activity does (R301).

## Owner-only

Xcode 26+, the Apple Developer account, a paired Apple Watch, and the watch App ID with the app group capability.
