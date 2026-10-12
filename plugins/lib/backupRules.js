/**
 * The pure parts of plugins/withGymhoundBackup.js (spec §17.2, R213): Android's backup rules and the iCloud settings.
 * Plain CommonJS for `npx expo config` and EAS; unit-tested in backupRules.test.js.
 *
 * Android: only `cloud-backup/` in the files folder (expo-file-system's documents folder, `Context.getFilesDir()`) is backed
 * up. An include list backs up nothing else, so the live database, the seven snapshots and photos never push the app past
 * Auto Backup's 25 MB cap. `full-backup-content` is read on Android 11 and lower; `data-extraction-rules` on 12 and higher
 * (cloud backup and device-to-device transfer).
 */

const BACKUP_RULES_NAME = 'gymhound_backup_rules';
const DATA_EXTRACTION_RULES_NAME = 'gymhound_data_extraction_rules';
const INCLUDE = '<include domain="file" path="cloud-backup/"/>';
const TOOLS_NS = 'http://schemas.android.com/tools';

function fullBackupContentXml() {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<!-- Written by plugins/withGymhoundBackup.js: only the cloud copy of the newest snapshot is backed up. -->',
    '<full-backup-content>',
    `  ${INCLUDE}`,
    '</full-backup-content>',
    '',
  ].join('\n');
}

function dataExtractionRulesXml() {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<!-- Written by plugins/withGymhoundBackup.js: only the cloud copy of the newest snapshot is backed up or transferred. -->',
    '<data-extraction-rules>',
    '  <cloud-backup>',
    `    ${INCLUDE}`,
    '  </cloud-backup>',
    '  <device-transfer>',
    `    ${INCLUDE}`,
    '  </device-transfer>',
    '</data-extraction-rules>',
    '',
  ].join('\n');
}

/**
 * Sets `allowBackup`, `fullBackupContent` and `dataExtractionRules` on `<application>`. They are also listed in
 * `tools:replace` so a library manifest that sets one of them cannot fail the manifest merge.
 */
function setBackupAttributes(androidManifest) {
  const root = androidManifest.manifest;
  root.$ = root.$ || {};
  root.$['xmlns:tools'] = TOOLS_NS;
  const app = root.application && root.application[0];
  if (!app) throw new Error('withGymhoundBackup: AndroidManifest.xml has no <application>.');
  app.$ = app.$ || {};
  app.$['android:allowBackup'] = 'true';
  app.$['android:fullBackupContent'] = `@xml/${BACKUP_RULES_NAME}`;
  app.$['android:dataExtractionRules'] = `@xml/${DATA_EXTRACTION_RULES_NAME}`;
  const replace = new Set(
    String(app.$['tools:replace'] || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  for (const attr of ['android:allowBackup', 'android:fullBackupContent', 'android:dataExtractionRules']) replace.add(attr);
  app.$['tools:replace'] = [...replace].join(',');
  return androidManifest;
}

/** Adds `values` to the array at `key`, keeping what is there and adding nothing twice. */
function addAll(object, key, values) {
  const current = Array.isArray(object[key]) ? object[key] : [];
  object[key] = [...current, ...values.filter((v) => !current.includes(v))];
}

/** The iCloud Drive (iCloud Documents) entitlements for the container. */
function setICloudEntitlements(entitlements, container) {
  addAll(entitlements, 'com.apple.developer.icloud-container-identifiers', [container]);
  addAll(entitlements, 'com.apple.developer.ubiquity-container-identifiers', [container]);
  addAll(entitlements, 'com.apple.developer.icloud-services', ['CloudDocuments']);
  return entitlements;
}

/** Info.plist `NSUbiquitousContainers`: the container is private (not shown in the Files app). */
function setUbiquitousContainers(infoPlist, container) {
  infoPlist.NSUbiquitousContainers = {
    ...(infoPlist.NSUbiquitousContainers || {}),
    [container]: {
      NSUbiquitousContainerIsDocumentScopePublic: false,
      NSUbiquitousContainerName: 'GymHound',
      NSUbiquitousContainerSupportedFolderLevels: 'None',
    },
  };
  return infoPlist;
}

module.exports = {
  BACKUP_RULES_NAME,
  DATA_EXTRACTION_RULES_NAME,
  fullBackupContentXml,
  dataExtractionRulesXml,
  setBackupAttributes,
  setICloudEntitlements,
  setUbiquitousContainers,
};
