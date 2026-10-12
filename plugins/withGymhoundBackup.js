/**
 * Config plugin for the cloud copy of the newest snapshot (spec §17.2, R213).
 * - Android: writes res/xml/gymhound_backup_rules.xml and gymhound_data_extraction_rules.xml (only `cloud-backup/` is
 *   backed up) and points `<application>` at them with backup on.
 * - iOS: the iCloud Documents entitlements and Info.plist `NSUbiquitousContainers` for the container, which
 *   modules/gymhound-cloud-backup uses.
 *
 * app.json: ["./plugins/withGymhoundBackup", { "iCloudContainer": "iCloud.com.grunthound.gymhound" }]
 */
const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
} = require('expo/config-plugins');
const {
  BACKUP_RULES_NAME,
  DATA_EXTRACTION_RULES_NAME,
  fullBackupContentXml,
  dataExtractionRulesXml,
  setBackupAttributes,
  setICloudEntitlements,
  setUbiquitousContainers,
} = require('./lib/backupRules');

function withGymhoundBackup(config, props) {
  const container = props && props.iCloudContainer;
  if (typeof container !== 'string' || !container.startsWith('iCloud.')) {
    throw new Error('withGymhoundBackup needs { iCloudContainer: "iCloud.<bundle id>" }.');
  }

  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const dir = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(path.join(dir, `${BACKUP_RULES_NAME}.xml`), fullBackupContentXml());
      await fs.promises.writeFile(path.join(dir, `${DATA_EXTRACTION_RULES_NAME}.xml`), dataExtractionRulesXml());
      return config;
    },
  ]);

  config = withAndroidManifest(config, (config) => {
    config.modResults = setBackupAttributes(config.modResults);
    return config;
  });

  config = withEntitlementsPlist(config, (config) => {
    config.modResults = setICloudEntitlements(config.modResults, container);
    return config;
  });

  config = withInfoPlist(config, (config) => {
    config.modResults = setUbiquitousContainers(config.modResults, container);
    return config;
  });

  return config;
}

module.exports = withGymhoundBackup;
