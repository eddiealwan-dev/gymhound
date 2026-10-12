import ExpoModulesCore
import Foundation

/**
 The iCloud Drive copy of GymHound's newest snapshot (spec §17.2, R213, R214).

 One file lives in `<container>/Documents/backup/`: the newest `gymhound-*.db` snapshot. `save` replaces it, `latest` reads it
 back (downloading it first on a new phone). The container is the app's own ubiquity container, written into the entitlements
 and Info.plist by `plugins/withGymhoundBackup.js`; with `NSUbiquitousContainerIsDocumentScopePublic` false the folder does
 not show in the Files app.

 Foundation APIs used (all documented on developer.apple.com):
 - `FileManager.ubiquityIdentityToken` — nil when the user is not signed in to iCloud or iCloud Drive is off for the app.
 - `FileManager.url(forUbiquityContainerIdentifier:)` — the container's local URL; may block, so never on the main thread.
 - `NSFileCoordinator.coordinate(writingItemAt:options:error:byAccessor:)` with `.forReplacing` / `.forDeleting`, and
   `coordinate(readingItemAt:options:error:byAccessor:)` — required for files in a ubiquity container.
 - `FileManager.replaceItemAt(_:withItemAt:backupItemName:options:)`, `moveItem`, `copyItem`, `removeItem`.
 - `URLResourceKey.ubiquitousItemDownloadingStatusKey` (`.current` / `.downloaded` / `.notDownloaded`) and
   `FileManager.startDownloadingUbiquitousItem(at:)`.
 - A file not yet downloaded is listed as a placeholder named `.<name>.icloud`, so names are read through `realName(_:)`.

 Every function runs on this module's own serial queue (never the main thread, and never Expo's shared async queue, which
 `latest` would otherwise hold for up to its timeout). Errors reject the promise with the system's message.
 */
public class GymHoundCloudBackupModule: Module {
  private let queue = DispatchQueue(label: "com.grunthound.gymhound.cloudbackup", qos: .utility)

  public func definition() -> ModuleDefinition {
    Name("GymHoundCloudBackup")

    AsyncFunction("available") { () -> Bool in
      return FileManager.default.ubiquityIdentityToken != nil && GymHoundCloudBackupModule.containerURL() != nil
    }
    .runOnQueue(queue)

    AsyncFunction("save") { (sourcePath: String, name: String) throws in
      try GymHoundCloudBackupModule.save(sourcePath: sourcePath, name: name)
    }
    .runOnQueue(queue)

    AsyncFunction("latest") { (timeoutMs: Double) throws -> [String: String]? in
      return try GymHoundCloudBackupModule.latest(timeoutMs: timeoutMs)
    }
    .runOnQueue(queue)
  }

  // MARK: - Paths

  /// A snapshot's name, as `writeSnapshot` makes it (src/db/snapshots.ts).
  private static let snapshotName = try! NSRegularExpression(pattern: "^gymhound-\\d{8}-\\d{6}-\\d{3}\\.db$")

  private static func isSnapshotName(_ name: String) -> Bool {
    let range = NSRange(name.startIndex..<name.endIndex, in: name)
    return snapshotName.firstMatch(in: name, options: [], range: range) != nil
  }

  /// The first container in Info.plist's `NSUbiquitousContainers` (the plugin writes exactly one), else nil, which makes
  /// `url(forUbiquityContainerIdentifier:)` use the first container in the entitlements.
  private static func containerIdentifier() -> String? {
    let containers = Bundle.main.object(forInfoDictionaryKey: "NSUbiquitousContainers") as? [String: Any]
    return containers?.keys.sorted().first
  }

  private static func containerURL() -> URL? {
    return FileManager.default.url(forUbiquityContainerIdentifier: containerIdentifier())
  }

  /// `<container>/Documents/backup`, created when `create` is true. Nil when iCloud is unavailable.
  private static func backupFolder(create: Bool) throws -> URL? {
    guard FileManager.default.ubiquityIdentityToken != nil, let container = containerURL() else {
      return nil
    }
    let folder = container.appendingPathComponent("Documents", isDirectory: true)
      .appendingPathComponent("backup", isDirectory: true)
    if create {
      try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true, attributes: nil)
    }
    return folder
  }

  /// The real file name of a listed entry: a placeholder `.<name>.icloud` reads as `<name>`.
  private static func realName(_ listed: String) -> String {
    if listed.hasPrefix(".") && listed.hasSuffix(".icloud") {
      return String(listed.dropFirst().dropLast(".icloud".count))
    }
    return listed
  }

  /// The snapshot names in the folder, downloaded or not, oldest first (names sort in time order).
  private static func snapshotNames(in folder: URL) throws -> [String] {
    guard FileManager.default.fileExists(atPath: folder.path) else {
      return []
    }
    let listed = try FileManager.default.contentsOfDirectory(atPath: folder.path)
    return Array(Set(listed.map(realName).filter(isSnapshotName))).sorted()
  }

  // MARK: - Coordination

  private static func coordinateWrite(_ url: URL, options: NSFileCoordinator.WritingOptions, _ work: (URL) throws -> Void) throws {
    var coordinatorError: NSError?
    var workError: Error?
    NSFileCoordinator(filePresenter: nil).coordinate(writingItemAt: url, options: options, error: &coordinatorError) { actual in
      do {
        try work(actual)
      } catch {
        workError = error
      }
    }
    if let error = coordinatorError ?? workError {
      throw CloudBackupException(error.localizedDescription)
    }
  }

  private static func coordinateRead(_ url: URL, _ work: (URL) throws -> Void) throws {
    var coordinatorError: NSError?
    var workError: Error?
    NSFileCoordinator(filePresenter: nil).coordinate(readingItemAt: url, options: [], error: &coordinatorError) { actual in
      do {
        try work(actual)
      } catch {
        workError = error
      }
    }
    if let error = coordinatorError ?? workError {
      throw CloudBackupException(error.localizedDescription)
    }
  }

  // MARK: - save

  /// Copies the snapshot at `sourcePath` (absolute, no `file://`) to `<folder>/<name>`, then removes every other snapshot there.
  /// The copy is made to a local temporary file first and swapped in under coordination, so the container never holds half a file.
  private static func save(sourcePath: String, name: String) throws {
    guard isSnapshotName(name) else {
      throw CloudBackupException("Not a snapshot name: \(name)")
    }
    guard let folder = try backupFolder(create: true) else {
      throw CloudBackupException("iCloud Drive is not available.")
    }
    let fm = FileManager.default
    let source = URL(fileURLWithPath: sourcePath)
    let temp = fm.temporaryDirectory.appendingPathComponent("gymhound-cloud-\(UUID().uuidString).db")
    do {
      try fm.copyItem(at: source, to: temp)
    } catch {
      throw CloudBackupException(error.localizedDescription)
    }
    defer { try? fm.removeItem(at: temp) }

    let target = folder.appendingPathComponent(name)
    try coordinateWrite(target, options: .forReplacing) { url in
      if fm.fileExists(atPath: url.path) {
        _ = try fm.replaceItemAt(url, withItemAt: temp)
      } else {
        try fm.moveItem(at: temp, to: url)
      }
    }

    for old in try snapshotNames(in: folder) where old != name {
      // A placeholder for a file not downloaded here is removed through its real URL, which removes it from iCloud.
      let url = folder.appendingPathComponent(old)
      do {
        try coordinateWrite(url, options: .forDeleting) { actual in
          try fm.removeItem(at: actual)
        }
      } catch {
        // The new copy is saved; an old one left behind costs only space and is removed next time.
        NSLog("GymHound: could not remove an old iCloud copy %@: %@", old, error.localizedDescription)
      }
    }
  }

  // MARK: - latest

  private static func isDownloaded(_ url: URL) -> Bool {
    var fresh = url
    fresh.removeAllCachedResourceValues()
    guard let values = try? fresh.resourceValues(forKeys: [.ubiquitousItemDownloadingStatusKey]) else {
      return false
    }
    guard let status = values.ubiquitousItemDownloadingStatus else {
      // Not an iCloud item (no status): it is a plain local file if it exists.
      return FileManager.default.fileExists(atPath: url.path)
    }
    // A snapshot's content never changes under its name, so an older downloaded version is the same file.
    return status == .current || status == .downloaded
  }

  /// The newest snapshot in the folder, copied into the app's caches folder: `["name": name, "path": path]` (no `file://`).
  /// Starts the download when the file is not on this phone and waits up to `timeoutMs`; nil when there is none or it did not
  /// arrive in time (the download carries on, so a later call can find it).
  private static func latest(timeoutMs: Double) throws -> [String: String]? {
    guard let folder = try backupFolder(create: false), let name = try snapshotNames(in: folder).last else {
      return nil
    }
    let fm = FileManager.default
    let url = folder.appendingPathComponent(name)
    if !isDownloaded(url) {
      do {
        try fm.startDownloadingUbiquitousItem(at: url)
      } catch {
        throw CloudBackupException(error.localizedDescription)
      }
      let deadline = Date().addingTimeInterval(max(0, timeoutMs) / 1000)
      while !isDownloaded(url) {
        if Date() >= deadline {
          return nil
        }
        Thread.sleep(forTimeInterval: 0.2)
      }
    }

    let caches = try fm.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
      .appendingPathComponent("cloud-backup", isDirectory: true)
    try fm.createDirectory(at: caches, withIntermediateDirectories: true, attributes: nil)
    let local = caches.appendingPathComponent(name)
    try coordinateRead(url) { actual in
      if fm.fileExists(atPath: local.path) {
        try fm.removeItem(at: local)
      }
      try fm.copyItem(at: actual, to: local)
    }
    return ["name": name, "path": local.path]
  }
}

/// Rejects the JS promise with the system's message.
internal final class CloudBackupException: GenericException<String> {
  override var reason: String {
    param
  }
}
