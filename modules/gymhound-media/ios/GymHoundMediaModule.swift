import ExpoModulesCore
import MediaPlayer

/// GymHound's media control on iPhone (Task 8a, R216).
///
/// Apple lets an app read and control another app's playback only through
/// `MPMusicPlayerController.systemMusicPlayer`, which is the Music app's player: this controls
/// Apple Music content only (Spotify and others stay open-only in the bar).
///
/// Platform APIs used (MediaPlayer framework, iOS 3.0+ unless noted):
/// - `MPMediaLibrary.authorizationStatus()` / `requestAuthorization(_:)` (iOS 9.3+): the
///   "Media & Apple Music" permission; needs `NSAppleMusicUsageDescription` in Info.plist.
/// - `MPMusicPlayerController.systemMusicPlayer` (iOS 10+): `nowPlayingItem` (`title`, `artist`,
///   `playbackDuration`), `playbackState`, `play()`, `pause()`, `skipToNextItem()`,
///   `skipToPreviousItem()`, `currentPlaybackTime`.
/// - `beginGeneratingPlaybackNotifications()` / `endGeneratingPlaybackNotifications()` with
///   `.MPMusicPlayerControllerNowPlayingItemDidChange` and `.MPMusicPlayerControllerPlaybackStateDidChange`.
/// The player is main-thread only, so every function runs on the main queue.
public class GymHoundMediaModule: Module {
  private var observers: [NSObjectProtocol] = []

  public func definition() -> ModuleDefinition {
    Name("GymHoundMedia")

    Events("change")

    AsyncFunction("access") { () -> String in
      return Self.accessName(MPMediaLibrary.authorizationStatus())
    }

    AsyncFunction("requestAccess") { (promise: Promise) in
      let status = MPMediaLibrary.authorizationStatus()
      if status != .notDetermined {
        promise.resolve(Self.accessName(status))
        return
      }
      MPMediaLibrary.requestAuthorization { newStatus in
        promise.resolve(Self.accessName(newStatus))
      }
    }
    .runOnQueue(.main)

    AsyncFunction("nowPlaying") { (promise: Promise) in
      let player = MPMusicPlayerController.systemMusicPlayer
      guard let item = player.nowPlayingItem else {
        promise.resolve(nil)
        return
      }
      let body: [String: Any] = [
        "title": Self.orNull(item.title),
        "artist": Self.orNull(item.artist),
        "playing": player.playbackState == .playing,
        "source": "apple-music"
      ]
      promise.resolve(body)
    }
    .runOnQueue(.main)

    AsyncFunction("play") {
      try Self.playerWithItem().play()
    }
    .runOnQueue(.main)

    AsyncFunction("pause") {
      MPMusicPlayerController.systemMusicPlayer.pause()
    }
    .runOnQueue(.main)

    AsyncFunction("next") {
      try Self.playerWithItem().skipToNextItem()
    }
    .runOnQueue(.main)

    AsyncFunction("previous") {
      try Self.playerWithItem().skipToPreviousItem()
    }
    .runOnQueue(.main)

    AsyncFunction("seekBy") { (seconds: Double) in
      let player = try Self.playerWithItem()
      guard let item = player.nowPlayingItem else {
        throw Self.noPlayer()
      }
      var target = max(0, player.currentPlaybackTime + seconds)
      let duration = item.playbackDuration
      if duration > 0 {
        target = min(target, duration)
      }
      player.currentPlaybackTime = target
    }
    .runOnQueue(.main)

    OnStartObserving("change") {
      DispatchQueue.main.async {
        self.startObserving()
      }
    }

    OnStopObserving("change") {
      DispatchQueue.main.async {
        self.stopObserving()
      }
    }

    OnDestroy {
      DispatchQueue.main.async {
        self.stopObserving()
      }
    }
  }

  private func startObserving() {
    guard observers.isEmpty else {
      return
    }
    let player = MPMusicPlayerController.systemMusicPlayer
    player.beginGeneratingPlaybackNotifications()
    let names: [Notification.Name] = [
      .MPMusicPlayerControllerNowPlayingItemDidChange,
      .MPMusicPlayerControllerPlaybackStateDidChange
    ]
    for name in names {
      let token = NotificationCenter.default.addObserver(forName: name, object: player, queue: .main) { [weak self] _ in
        self?.sendEvent("change", [:])
      }
      observers.append(token)
    }
  }

  private func stopObserving() {
    guard !observers.isEmpty else {
      return
    }
    for token in observers {
      NotificationCenter.default.removeObserver(token)
    }
    observers.removeAll()
    MPMusicPlayerController.systemMusicPlayer.endGeneratingPlaybackNotifications()
  }

  /// The system player when it has an item; otherwise the same rejection Android uses
  /// (`ERR_NO_PLAYER`), so the bar shows "Couldn't reach the player."
  private static func playerWithItem() throws -> MPMusicPlayerController {
    let player = MPMusicPlayerController.systemMusicPlayer
    guard player.nowPlayingItem != nil else {
      throw noPlayer()
    }
    return player
  }

  private static func noPlayer() -> Exception {
    return Exception(name: "NoPlayerException", description: "Apple Music has no song loaded", code: "ERR_NO_PLAYER")
  }

  private static func accessName(_ status: MPMediaLibraryAuthorizationStatus) -> String {
    switch status {
    case .authorized:
      return "granted"
    case .notDetermined:
      return "undetermined"
    case .denied, .restricted:
      return "denied"
    @unknown default:
      return "denied"
    }
  }

  private static func orNull(_ value: String?) -> Any {
    if let value, !value.isEmpty {
      return value
    }
    return NSNull()
  }
}
