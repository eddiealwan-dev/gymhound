/**
 * PHASE 7 (native build): Android's backup carries the snapshot folder, and only that (spec §17.2, R303).
 *
 * Android's Auto Backup copies an app's files to the user's Google account and restores them on a new phone. GymHound
 * keeps its snapshots in `files/snapshots/` (expo-file-system's documents folder). Backing up the live database instead
 * could catch it between a write and its -wal, so it is left out: on a new phone the live database is missing, and the
 * startup restore (§12) copies in the newest backed-up snapshot.
 *
 * Two rule files, because Android changed the format: `fullBackupContent` (Android 6–11) and `dataExtractionRules`
 * (Android 12+, cloud backup and device-to-device transfer). Expo Go never runs this; prebuild and EAS do.
 */
const fs = require('fs');
const path = require('path');

const SNAPSHOT_FOLDER = 'snapshots/';
const BACKUP_RULES = 'gymhound_backup_rules';
const EXTRACTION_RULES = 'gymhound_data_extraction_rules';

const include = (indent) => `${indent}<include domain="file" path="${SNAPSHOT_FOLDER}" />`;

/** `res/xml/gymhound_backup_rules.xml`: Android 6–11. */
function backupRulesXml() {
  return ['<?xml version="1.0" encoding="utf-8"?>', '<full-backup-content>', include('  '), '</full-backup-content>', ''].join('\n');
}

/** `res/xml/gymhound_data_extraction_rules.xml`: Android 12 and later. */
function dataExtractionRulesXml() {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<data-extraction-rules>',
    '  <cloud-backup>',
    include('    '),
    '  </cloud-backup>',
    '  <device-transfer>',
    include('    '),
    '  </device-transfer>',
    '</data-extraction-rules>',
    '',
  ].join('\n');
}

/** Points the manifest's `<application>` at both rule files and keeps backup on. Mutates and returns `manifest`. */
function applyBackupAttributes(manifest) {
  const application = manifest.manifest.application?.[0];
  if (!application) throw new Error('AndroidManifest.xml has no <application>.');
  application.$ = {
    ...application.$,
    'android:allowBackup': 'true',
    'android:fullBackupContent': `@xml/${BACKUP_RULES}`,
    'android:dataExtractionRules': `@xml/${EXTRACTION_RULES}`,
  };
  return manifest;
}

/** The config plugin. Loaded only by `expo prebuild` / EAS (Expo Go never runs plugins). */
function withSnapshotBackupRules(config) {
  const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
  config = withAndroidManifest(config, (c) => {
    c.modResults = applyBackupAttributes(c.modResults);
    return c;
  });
  return withDangerousMod(config, [
    'android',
    async (c) => {
      const dir = path.join(c.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${BACKUP_RULES}.xml`), backupRulesXml());
      fs.writeFileSync(path.join(dir, `${EXTRACTION_RULES}.xml`), dataExtractionRulesXml());
      return c;
    },
  ]);
}

module.exports = withSnapshotBackupRules;
module.exports.backupRulesXml = backupRulesXml;
module.exports.dataExtractionRulesXml = dataExtractionRulesXml;
module.exports.applyBackupAttributes = applyBackupAttributes;
