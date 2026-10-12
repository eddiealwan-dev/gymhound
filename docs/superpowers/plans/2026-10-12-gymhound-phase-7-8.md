# GymHound Phase 7 and 8 Implementation Plan — the native build, then the watch apps

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Steps marked **(owner)** need the owner's accounts, a Mac with Xcode, Android Studio or a phone, and cannot be done by an agent.

**Goal (phase 7):** a development, preview and store build of GymHound for iPhone and Android that adds the rest timer on the lock screen (Live Activity / ongoing notification) with the chosen bell, Apple Health and Health Connect (write-out plus sleep, resting heart rate and body weight), the copy of the snapshots that survives a dead phone (iCloud / Android backup), the session's music player, and live RevenueCat products, while the same code keeps running unchanged in Expo Go and on the web.

**Goal (phase 8):** an Apple Watch app and a Wear OS app that log each set on the wrist, with the phone owning the workout.

**Architecture:** every native-only package is loaded behind one gate, `loadOptional` (`src/platform/native/optional.ts`, R306): never in Expo Go or on the web, and never when the package is missing (Metro bundles `src/platform/native/missingNativeModule.js` in its place, see `metro.config.js`). Each feature is a pure rule module (tested) plus a thin adapter over the package's API (tested with fakes), behind the seam that already existed (`RestTimerSurface`, `StepsSource`, `SnapshotFiles`, the music bar). `app.config.js` wraps `app.json` with `plugins/nativeConfig.js`, which adds each config plugin only when its package is installed, so `expo config` and Expo Go work before anything is installed. Phase 8's protocol is plain JSON (`src/domain/watchProtocol.ts`) and the phone side is ordinary state code (`src/state/watchBridge.ts`); only the transport and the watch apps are native.

**Spec:** `docs/superpowers/specs/2026-10-09-gymhound-design.md` §15 (phases 7 and 8), §17.1–§17.4, §18.13 (R300–R320, wins over this plan).

## Global Constraints
- **Expo Go is unchanged.** Nothing outside the gate requires a native-only package; `npx expo start` in Expo Go, `npx expo export` and the web build must keep working with none of them installed. A new native package goes in `OPTIONAL_NATIVE_PACKAGES` and `OPTIONAL_PLUGINS` (plugins/nativeConfig.js) and is loaded only through `loadOptional`.
- **No `npm install` in a worktree** (node_modules is shared). Packages are installed once, by the owner or the coordinator, in the main checkout (see "Packages").
- The identifiers are permanent once the store records exist (R300): `com.grunthound.gymhound`, `com.grunthound.gymhound.widgets`, `group.com.grunthound.gymhound`, `iCloud.com.grunthound.gymhound`.
- A Health, iCloud, Live Activity or music failure never blocks finish, never changes a workout and never throws into the UI (`src/state/nativeServices.ts` swallows and logs).
- Tests: `npm test`, `npm run typecheck`; DB tests start with `/** @jest-environment node */`. Commits end with the session's Co-Authored-By lines.

## Packages (install once, in the main checkout, with the Expo-matched versions)

```sh
npx expo install expo-dev-client expo-build-properties expo-widgets @expo/ui \
  @kingstinct/react-native-healthkit react-native-nitro-modules \
  react-native-health-connect react-native-cloud-storage @notifee/react-native
```

| Package | Version checked (2026-10-12) | For |
|---|---|---|
| `expo-dev-client` | ~57.0.19 | the development build |
| `expo-build-properties` | ~57.0.22 | Android minSdk 26 for Health Connect |
| `expo-widgets` + `@expo/ui` | ~57.0.23 + ~57.0.22 | the iOS Live Activity (R301) |
| `@kingstinct/react-native-healthkit` + `react-native-nitro-modules` | 16.1.0 + 0.37.1 (≥ 0.35) | Apple Health (R307) |
| `react-native-health-connect` | 4.1.3 | Health Connect and Android steps (R307, R312) |
| `react-native-cloud-storage` | 3.2.0 | the iCloud copy (R303) |
| `@notifee/react-native` | 9.1.8 | the Android ongoing countdown (R301) |

`package.json` was deliberately **not** edited on `phase-7`: a manifest out of step with `package-lock.json` makes `npm ci` fail for every other worktree and for EAS. `npx expo install` updates both together. After installing, run `npx expo config --type introspect` and check that each plugin in `OPTIONAL_PLUGINS` appears; `npx expo-doctor` should be clean. Nothing in the code has to change: the gate and the plugin list pick the packages up.

---

## Phase 7

### Task 7.1: EAS profiles, the native app config and the gate (DONE: dd6fef3)
**Files:** `eas.json`, `app.json` (bundle id / package), `app.config.js`, `plugins/nativeConfig.js` (+ test), `plugins/withSnapshotBackupRules.js`, `metro.config.js`, `src/platform/native/{optional.ts,missingNativeModule.js}` (+ test).
- `development` (dev client, internal, `EXPO_PUBLIC_DEBUG_UNLOCK=1`), `preview` (internal, APK on Android), `production` (auto-increment, remote app version).
- Always added, inert in Expo Go: the three bells as notification sounds, Android backup rules for `files/snapshots/` only, `ITSAppUsesNonExemptEncryption: false`. Never `UIBackgroundModes` (R305).

### Task 7.2: Accounts and the first development build **(owner)**
- [ ] **Apple Developer Program** membership (individual or organisation) for the team that will own GymHound.
- [ ] In the Apple Developer portal, the App IDs: `com.grunthound.gymhound` with **HealthKit**, **App Groups** (`group.com.grunthound.gymhound`), **iCloud** (CloudKit not needed; iCloud Documents with container `iCloud.com.grunthound.gymhound`) and **Push Notifications** (expo-notifications asks for it; Live Activities started from the app need no push token); `com.grunthound.gymhound.widgets` with **App Groups**. EAS can create these on the first build if allowed to manage credentials; check the capabilities afterwards.
- [ ] App Store Connect: the app record for `com.grunthound.gymhound`.
- [ ] Google Play Console: the app for `com.grunthound.gymhound`; the **Health Connect permissions declaration** (exercise write; sleep, resting heart rate, weight and steps read) with the privacy policy URL; Data safety form (health data stays on the device and in the user's own Health store).
- [ ] `npm i -g eas-cli`, `eas login`, then in the main checkout `eas init` (writes `extra.eas.projectId` and `owner` into the config: put them in `app.json`).
- [ ] `eas env:create` for each environment (`development`, `preview`, `production`): `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`, `EXPO_PUBLIC_TERMS_URL`, `EXPO_PUBLIC_PRIVACY_URL`, and later `EXPO_PUBLIC_SPOTIFY_CLIENT_ID` (Task 7.6). Visibility "plain text" is fine for these public keys.
- [ ] Install the packages above (one `npx expo install`), commit `package.json` + `package-lock.json`.
- [ ] `eas device:create` for each test iPhone, then `eas build --profile development --platform ios` and `--platform android`. Install, then `npx expo start --dev-client`.
- [ ] Expo Go check on the same commit: `npx expo start`, open in Expo Go on both phones; the app must look and behave exactly as before (no Health section in Settings, no sleep offer, the plain rest notification).

### Task 7.3: The rest timer on the lock screen and the chosen bell (code DONE: 7281c23; device check open)
**Files:** `src/platform/restTimer/{index.ts,chooseSurface.ts,liveActivity.ts,liveActivitySdk.ts,androidOngoing.ts,androidOngoingSdk.ts,lockScreenSound.ts,expoGoNotification.ts}`, `widgets/restTimerActivity.js`, `src/state/sessionActions.ts` (`restAlert`, `ended`), tests.
- iPhone: a Live Activity (`RestTimer`) with the countdown on the lock screen and in the Dynamic Island, started, moved (−15s/+15s keep `startedAt`) and ended with the rest; stale (reads "Rest's up.") at its end.
- Android: an ongoing notification with a chronometer counting down (`rest-ongoing` channel, low importance), removed at the end (`timeoutAfter`) or on Skip.
- The "Rest's up." notification rings the bell chosen in Settings: iOS by file name; Android on one channel per bell (`rest-bell`, `rest-chime`, `rest-ding`), since a channel's sound is fixed once made (R304). Expo Go keeps the default sound and the old channels.
- [ ] **(owner, iPhone)** Start a rest: the Live Activity appears on the lock screen and in the Dynamic Island, counting down; −15s / +15s move it; Skip and a finish remove it; after the end it reads "Rest's up." until the app is opened. If `expo-widgets` rejects the layout, check `widgets/restTimerActivity.js` against the installed `@expo/ui/swift-ui` exports (`Text` `timerInterval` / `countsDown`) and the `createLiveActivity` signature.
- [ ] **(owner, iPhone)** Lock the phone during a rest with each bell chosen: the notification plays that bell. With sounds off it is silent.
- [ ] **(owner, Android)** The ongoing notification counts down in the shade and on the lock screen, cannot be swiped away, and goes at the end; the bell chosen rings on its own channel (Settings → Apps → GymHound → Notifications lists "Rest timer (bell)", "Rest timer (chime)", "Rest timer (ding)" and "Rest countdown").
- [ ] **(owner)** The bell ducks music and never stops it (unchanged from phase 1; §17.3).

### Task 7.4: Apple Health and Health Connect (code DONE: b71dca9, UI 594ad07; device check open)
**Files:** migration `0009` (`workouts.health_status`, `health_record_id`, `sleep_offer_shown`), `src/domain/health.ts`, `src/platform/health/{types,appleHealth,healthConnect,healthSteps,index}.ts`, `src/db/repositories/healthRepo.ts`, `src/state/healthSync.ts`, `src/state/nativeServices.ts`, `src/ui/native/{HealthSettings,SleepOfferBanner}.tsx`, the Settings keys `health_*`, tests.
- Write-out after finish and at start (retry), oldest first, at most 20 a pass; only workouts finished since the switch was turned on (R308). History delete removes the record, best effort.
- Reads, each its own switch: sleep and resting heart rate feed the one Rough sleep offer at the start of a session (R309, R310); body weight offers a newer reading (R311). Android's steps card reads Health Connect (R312).
- [ ] **(owner, iPhone)** Settings → Apple Health: each switch shows Apple's sheet once; finish a workout → Health app → Browse → Activity → Workouts shows a "Traditional Strength Training" with GymHound's name, start and end; delete it in History → it goes from Health. Check the metadata (`HKExternalUUID` = the workout id) with a Health export if in doubt.
- [ ] **(owner, Android)** Install Health Connect (Android 13) or use the built-in one (14+); Settings → Health Connect asks per permission; a finished workout appears as Strength training; the Stats steps card shows today's steps.
- [ ] **(owner)** Sleep under 6 hours (or add a short sleep sample by hand in Health): start a session → "Under 6 hours of sleep last night. Mark this session Rough sleep?" (`roughSleepOfferLine`); Mark it flags every unmarked exercise; × hides it for the workout.
- [ ] Merge note: `0009` is this branch's migration number. If another branch adds a migration first, regenerate with `npx drizzle-kit generate` after the merge and renumber.

### Task 7.5: The copy that survives a dead phone (code DONE: 60aeb3e; device check open)
**Files:** `src/platform/cloud/{cloudCopy,iCloudFolder}.ts`, `src/state/nativeServices.ts`, `plugins/withSnapshotBackupRules.js`, tests; startup hook in `app/_layout.tsx` (two lines).
- iPhone: after each finish the newest snapshot goes to the iCloud container's hidden app data (`/snapshots`), keeping the newest 3 (R303). On a phone with no data and no snapshot, the newest cloud snapshot is brought down before the database opens (15 s at most), then the normal restore runs.
- Android: Auto Backup includes `files/snapshots/` only; restore on a new phone puts the snapshots back and the normal restore picks the newest.
- [ ] **(owner, iPhone)** Finish a workout, then check Settings → Apple ID → iCloud → Manage Storage → GymHound shows data. Delete and reinstall the app (same Apple ID): the history comes back on first open. Verify `readdir` returns names (not paths) and that `uploadFile` overwrote nothing (the names are unique by time).
- [ ] **(owner, Android)** `adb shell bmgr backupnow com.grunthound.gymhound`, uninstall, reinstall (`adb shell bmgr restore` or a new-device setup): the history comes back.

### Task 7.6: The music player (seam DONE: 79a9f85; native modules and the bar open)
**Files:** `src/platform/nowPlaying/{types,rules,index}.ts` (+ test). To create: `modules/gymhound-now-playing/` and `modules/gymhound-spotify-remote/` (local Expo modules, `npx create-expo-module@latest --local`), the music bar wiring in `src/ui/session/MusicBar.tsx`.
- The JS contract is fixed in `src/platform/nowPlaying/index.ts`: `getNowPlaying() → {title, artist, isPlaying, positionMs, durationMs} | null`, `play`, `pause`, `skipToPrevious`, `skipToNext`, `seekTo(ms)`, an `onChange` event; Android adds `hasNotificationAccess()` and `openNotificationAccessSettings()`; Spotify adds `connect(clientId, redirectUri)`. `requireOptionalNativeModule` gives null until the modules exist, so nothing changes until then.
- [ ] **Module `GymHoundNowPlaying`, iOS (Swift):** `MPMusicPlayerController.systemMusicPlayer` (`nowPlayingItem.title/artist/playbackDuration`, `currentPlaybackTime`, `playbackState`, `play/pause/skipToPreviousItem/skipToNextItem`, setting `currentPlaybackTime`); `beginGeneratingPlaybackNotifications` → `onChange`. Needs `NSAppleMusicUsageDescription` ("GymHound shows and controls the song Apple Music is playing.") added by the module's config plugin. **Mac needed** to compile.
- [ ] **Module `GymHoundNowPlaying`, Android (Kotlin):** a `NotificationListenerService` declared in the module's manifest (`BIND_NOTIFICATION_LISTENER_SERVICE`); `MediaSessionManager.getActiveSessions(component)`, the first controller with a playing state (else the most recent); `metadata` title/artist/duration; position from `PlaybackState.position + (elapsedRealtime − lastPositionUpdateTime) × speed`; `transportControls.play/pause/skipToPrevious/skipToNext/seekTo`; `addOnActiveSessionsChangedListener` + `MediaController.Callback` → `onChange`.
- [ ] **Module `GymHoundSpotifyRemote`, iOS only (Swift):** Spotify iOS SDK (`SpotifyiOS.xcframework`), `SPTAppRemote` with the client id and `gymhound://spotify-connect`; first connect via `authorizeAndPlayURI("")`, the URL handled by an `AppDelegateSubscriber`; `playerAPI.getPlayerState` / `subscribe` → the same track shape; `resume/pause/skipToPrevious/skipToNext/seekToPosition`. Reconnect on foreground (App Remote drops in the background). `LSApplicationQueriesSchemes: ["spotify"]`.
- [ ] **(owner)** Register GymHound at developer.spotify.com (iOS bundle id `com.grunthound.gymhound`, redirect URI `gymhound://spotify-connect`), then `eas env:create EXPO_PUBLIC_SPOTIFY_CLIENT_ID`. Until then Spotify on iPhone keeps its open button (R315).
- [ ] **The bar** (a UI task, after the design pass): when `getNowPlaying().players` is not empty, the bar reads every player on mount, on `onChange` and once a second while visible; `musicBarMode` picks controls (the song, play/pause, previous, next, −15s/+15s via `seekTarget`, spoken with `trackSpoken`) or the open buttons; on Android with access missing, a line "Allow GymHound to see what's playing" opens `openSettings()`. Expo Go keeps today's bar.
- [ ] **(owner)** Device check: Apple Music and Spotify on iPhone; Spotify and YouTube Music on Android; seek near the start and end of a song; a radio stream (no seek buttons).

### Task 7.7: Live RevenueCat products **(owner + check)**
- [ ] **(owner)** Create the products in App Store Connect and Play Console, the RevenueCat project, offering and `pro` entitlement (as §9); put the public SDK keys in EAS env (Task 7.2). `react-native-purchases` is already in `package.json` and loaded only outside Expo Go with a key (RevenueCat isolation note, §18.10).
- [ ] **(owner)** Preview build with sandbox accounts: buy, restore, lapse (sandbox renewals), Manage subscription; the paywall shows the price, the renewal line and both links (R159).

### Task 7.8: Body weight from Health on the body-weight card (open; UI)
- `healthBodyweightOffer(db, store)` (`src/state/healthSync.ts`) returns the newer reading in the display unit, or null. The card shows "Apple Health has 182.4 lb from today. Add it?" with Add / ×; Add logs it through the body-weight repository as if typed. Left for after the design pass (`src/ui/**` was being edited in parallel).

### Task 7.9: Store submission **(owner)**
- [ ] App Privacy (iOS) and Data safety (Android): health and fitness data, not collected (stays on the device and in the user's Health store); purchases via the store.
- [ ] HealthKit review note: what is written and read and why; the Settings path.
- [ ] `eas build --profile production`, `eas submit --profile production`.

---

## Phase 8

### Task 8.1: The watch protocol and the phone's side (DONE: 36e68c5)
**Files:** `src/domain/watchProtocol.ts`, `src/state/watchBridge.ts` (+ test), `targets/watch/README.md`, `wear/README.md`.
- Phone → watch: `WatchState` (the active workout, progress, the next set with what a tick logs). Watch → phone: `tick`, `restPlus15`, `restSkip`, `hello`; each names its workout; stale commands are answered with the current state (R316, R317). Version `WATCH_PROTOCOL = 1`; another version is ignored (R318).

### Task 8.2: The phone's transport (local Expo module `GymHoundWatchLink`) — Mac / Android Studio
- [ ] iOS: `WCSession` default session, `updateApplicationContext(state)` on every data-version bump while a workout is active (and once with `workout: null` after finish/discard); `didReceiveMessage` / `didReceiveUserInfo` → JS event `onCommand(json)`; reply with the state.
- [ ] Android: `Wearable.getDataClient` `PutDataMapRequest("/gymhound/state")` with the JSON; `MessageClient` listener on `/gymhound/command` → `onCommand(json)`. A `WearableListenerService` is not needed while the phone app is in the foreground; for background ticks add one that starts the JS headless task.
- [ ] JS: `src/platform/watchLink.ts` loads the module with `requireOptionalNativeModule` (null in Expo Go), subscribes `useDataVersion` → `send(JSON.stringify(watchStateFor(db)))`, and `onCommand` → `parseWatchCommand` → `applyWatchCommand` → resend on `'stale'`/`'refused'`.

### Task 8.3: The Apple Watch app **(owner: Xcode)**
- [ ] Add `@bacons/apple-targets` (`npx expo install @bacons/apple-targets`) and its plugin to `OPTIONAL_PLUGINS`; add `targets/watch/expo-target.config.js` (`type: "watch"`, bundle id `com.grunthound.gymhound.watchkitapp`, the app group) and the SwiftUI sources described in `targets/watch/README.md`.
- [ ] Register the watch App ID in the developer portal; `eas build --profile development --platform ios` builds both.
- [ ] Device check on a paired Apple Watch: the next set shows; Tick logs it on the phone (the phone's set row ticks, the rest starts and the Live Activity appears); +15s and Skip; a tick made while the phone was asleep arrives when it wakes; a stale tick shows the phone's state.

### Task 8.4: The Wear OS app **(owner: Android Studio)**
- [ ] The Gradle project in `wear/` (same application id and signing key as the phone), Compose for Wear OS, the Data Layer link, an ongoing activity for the rest; upload in the same Play listing (Wear form factor).
- [ ] Device check on a Wear OS watch paired with the Android phone, as 8.3.

## Review Focus
1. Expo Go: nothing native-only is required outside `loadOptional`; Settings shows no Health section and the session no sleep offer.
2. Health never blocks or changes a workout; the write-out starts only from the switch-on time and never repeats a written workout.
3. iCloud restore runs only on a phone with no data and no snapshot, and never longer than 15 seconds.
4. The lock-screen countdown of an old rest never removes a newer rest's (the `ended` check in `restEnded`).
5. Watch commands are applied only to the workout and set they name; malformed or other-version messages are ignored.
