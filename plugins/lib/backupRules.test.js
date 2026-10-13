/** @jest-environment node */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  BACKUP_RULES_NAME,
  DATA_EXTRACTION_RULES_NAME,
  fullBackupContentXml,
  dataExtractionRulesXml,
  setBackupAttributes,
  setICloudEntitlements,
  setUbiquitousContainers,
} = require('./backupRules');
const withGymhoundBackup = require('../withGymhoundBackup');

const CONTAINER = 'iCloud.com.grunthound.gymhound';

/** Every `<include .../>` or `<exclude .../>` element in an XML string. */
const rules = (xml) => xml.match(/<(include|exclude)\b[^>]*\/>/g) ?? [];

describe('fullBackupContentXml', () => {
  const xml = fullBackupContentXml();

  it('is a full-backup-content document', () => {
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="utf-8"\?>/);
    expect(xml).toMatch(/<full-backup-content>[\s\S]*<\/full-backup-content>/);
  });

  it('includes only cloud-backup/ in the file domain, so nothing else is backed up', () => {
    expect(rules(xml)).toEqual(['<include domain="file" path="cloud-backup/"/>']);
  });
});

describe('dataExtractionRulesXml (Android 12+)', () => {
  const xml = dataExtractionRulesXml();

  it('has a cloud-backup and a device-transfer section, each including only cloud-backup/', () => {
    const cloud = /<cloud-backup>([\s\S]*?)<\/cloud-backup>/.exec(xml);
    const transfer = /<device-transfer>([\s\S]*?)<\/device-transfer>/.exec(xml);
    expect(cloud).not.toBeNull();
    expect(transfer).not.toBeNull();
    expect(rules(cloud[1])).toEqual(['<include domain="file" path="cloud-backup/"/>']);
    expect(rules(transfer[1])).toEqual(['<include domain="file" path="cloud-backup/"/>']);
    expect(rules(xml)).toHaveLength(2);
    expect(xml).toMatch(/<data-extraction-rules>[\s\S]*<\/data-extraction-rules>/);
  });
});

const minimalManifest = () => ({
  manifest: {
    $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android', package: 'com.grunthound.gymhound' },
    application: [{ $: { 'android:name': '.MainApplication', 'android:allowBackup': 'false' } }],
  },
});

describe('setBackupAttributes', () => {
  it('points the application at both rule files and turns backup on', () => {
    const app = setBackupAttributes(minimalManifest()).manifest.application[0].$;
    expect(app['android:allowBackup']).toBe('true');
    expect(app['android:fullBackupContent']).toBe(`@xml/${BACKUP_RULES_NAME}`);
    expect(app['android:dataExtractionRules']).toBe(`@xml/${DATA_EXTRACTION_RULES_NAME}`);
  });

  it('marks the attributes to replace a library value and declares the tools namespace', () => {
    const manifest = minimalManifest();
    manifest.manifest.application[0].$['tools:replace'] = 'android:label';
    const result = setBackupAttributes(manifest).manifest;
    expect(result.$['xmlns:tools']).toBe('http://schemas.android.com/tools');
    expect(result.application[0].$['tools:replace'].split(',').sort()).toEqual(
      ['android:allowBackup', 'android:dataExtractionRules', 'android:fullBackupContent', 'android:label'].sort(),
    );
  });

  it('is idempotent', () => {
    const once = setBackupAttributes(minimalManifest());
    const twice = setBackupAttributes(JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
  });
});

describe('iOS', () => {
  it('sets both container arrays and CloudDocuments in the entitlements, keeping others', () => {
    const result = setICloudEntitlements({ 'aps-environment': 'development' }, CONTAINER);
    expect(result['com.apple.developer.icloud-container-identifiers']).toEqual([CONTAINER]);
    expect(result['com.apple.developer.ubiquity-container-identifiers']).toEqual([CONTAINER]);
    expect(result['com.apple.developer.icloud-services']).toEqual(['CloudDocuments']);
    expect(result['aps-environment']).toBe('development');
  });

  it('adds to existing container arrays and services without duplicates', () => {
    const result = setICloudEntitlements(
      {
        'com.apple.developer.icloud-container-identifiers': ['iCloud.other', CONTAINER],
        'com.apple.developer.icloud-services': ['CloudKit'],
      },
      CONTAINER,
    );
    expect(result['com.apple.developer.icloud-container-identifiers']).toEqual(['iCloud.other', CONTAINER]);
    expect(result['com.apple.developer.icloud-services']).toEqual(['CloudKit', 'CloudDocuments']);
  });

  it('declares the private container in Info.plist', () => {
    const result = setUbiquitousContainers({ CFBundleName: 'GymHound' }, CONTAINER);
    expect(result.NSUbiquitousContainers).toEqual({
      [CONTAINER]: {
        NSUbiquitousContainerIsDocumentScopePublic: false,
        NSUbiquitousContainerName: 'GymHound',
        NSUbiquitousContainerSupportedFolderLevels: 'None',
      },
    });
    expect(result.CFBundleName).toBe('GymHound');
  });
});

describe('withGymhoundBackup', () => {
  const base = () => ({ name: 'GymHound', slug: 'gymhound' });
  const run = (mod, modResults, modRequest = {}) => mod({ ...base(), modResults, modRequest });

  it('requires the iCloud container', () => {
    expect(() => withGymhoundBackup(base(), {})).toThrow(/iCloudContainer/);
  });

  it('wires the manifest, entitlements and Info.plist mods', async () => {
    const config = withGymhoundBackup(base(), { iCloudContainer: CONTAINER });

    const manifest = (await run(config.mods.android.manifest, minimalManifest())).modResults;
    const app = manifest.manifest.application[0].$;
    expect(app['android:allowBackup']).toBe('true');
    expect(app['android:fullBackupContent']).toBe('@xml/gymhound_backup_rules');
    expect(app['android:dataExtractionRules']).toBe('@xml/gymhound_data_extraction_rules');

    const entitlements = (await run(config.mods.ios.entitlements, {})).modResults;
    expect(entitlements['com.apple.developer.icloud-container-identifiers']).toEqual([CONTAINER]);
    expect(entitlements['com.apple.developer.ubiquity-container-identifiers']).toEqual([CONTAINER]);

    const plist = (await run(config.mods.ios.infoPlist, {})).modResults;
    expect(Object.keys(plist.NSUbiquitousContainers)).toEqual([CONTAINER]);
  });

  it('writes both rule files into res/xml', async () => {
    const config = withGymhoundBackup(base(), { iCloudContainer: CONTAINER });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gymhound-backup-plugin-'));
    try {
      await run(config.mods.android.dangerous, undefined, { platformProjectRoot: root, platform: 'android' });
      const xmlDir = path.join(root, 'app', 'src', 'main', 'res', 'xml');
      expect(fs.readFileSync(path.join(xmlDir, 'gymhound_backup_rules.xml'), 'utf8')).toBe(fullBackupContentXml());
      expect(fs.readFileSync(path.join(xmlDir, 'gymhound_data_extraction_rules.xml'), 'utf8')).toBe(
        dataExtractionRulesXml(),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
