/* eslint-disable @typescript-eslint/no-require-imports */
type Config = {
  name: string;
  ios?: { bundleIdentifier?: string; infoPlist?: Record<string, unknown> };
  android?: { package?: string; permissions?: string[] };
  plugins?: (string | [string, unknown])[];
};

const native = require('./nativeConfig') as {
  IDS: Record<string, string>;
  BELL_SOUND_FILES: string[];
  HEALTH_CONNECT_PERMISSIONS: string[];
  OPTIONAL_PLUGINS: { pkg: string; plugin: unknown }[];
  OPTIONAL_NATIVE_PACKAGES: string[];
  optionalPackageOf(moduleName: string): string | null;
  withPhase7Native(config: Config, isInstalled: (name: string) => boolean): Config;
  appConfig(config: Config, root?: string, profile?: string): Config;
  LEFT_OUT_OF_STORE: string[];
  leftOutFor(profile: string | undefined): string[];
};
const { leaveOutUntested } = require('../scripts/leave-out-untested') as { leaveOutUntested(root: string, profile: string | undefined): string[] };
const backup = require('./withSnapshotBackupRules') as {
  backupRulesXml(): string;
  dataExtractionRulesXml(): string;
  applyBackupAttributes(manifest: { manifest: { application?: { $: Record<string, string> }[] } }): {
    manifest: { application: { $: Record<string, string> }[] };
  };
};
const appJson = require('../app.json') as { expo: Config };

const names = (config: Config) => (config.plugins ?? []).map((entry) => (Array.isArray(entry) ? entry[0] : entry));
const none = () => false;
const all = () => true;

describe('the phase 7 app config (R300–R305)', () => {
  it('adds no phase 7 package plugin while none is installed, so `expo start` resolves in Expo Go', () => {
    const config = native.withPhase7Native(appJson.expo, none);
    for (const { pkg } of native.OPTIONAL_PLUGINS) expect(names(config)).not.toContain(pkg);
    // The plugins of installed packages and the app's own are kept, in order, first.
    expect(names(config).slice(0, names(appJson.expo).length)).toEqual(names(appJson.expo));
  });

  it('always bundles the three bells as notification sounds and adds the Android backup rules', () => {
    const config = native.withPhase7Native(appJson.expo, none);
    expect(config.plugins).toContainEqual(['expo-notifications', { sounds: native.BELL_SOUND_FILES }]);
    expect(names(config)).toContain('./plugins/withSnapshotBackupRules');
    expect(native.BELL_SOUND_FILES).toEqual(['./assets/sounds/bell.wav', './assets/sounds/chime.wav', './assets/sounds/ding.wav']);
  });

  it('adds each package plugin once it is installed, and the Health Connect permissions with it', () => {
    const config = native.withPhase7Native(appJson.expo, all);
    expect(names(config)).toEqual(
      expect.arrayContaining([
        'expo-dev-client',
        'expo-build-properties',
        '@kingstinct/react-native-healthkit',
        'react-native-health-connect',
        'expo-widgets',
        'react-native-cloud-storage',
      ]),
    );
    expect(names(config)).not.toContain('@notifee/react-native');
    expect(config.android?.permissions).toEqual(expect.arrayContaining(native.HEALTH_CONNECT_PERMISSIONS));
    expect(native.withPhase7Native(appJson.expo, none).android?.permissions ?? []).not.toContain(native.HEALTH_CONNECT_PERMISSIONS[0]);
  });

  it('adds only what is installed', () => {
    const config = native.withPhase7Native(appJson.expo, (name) => name === 'expo-widgets');
    expect(names(config)).toContain('expo-widgets');
    expect(names(config)).not.toContain('@kingstinct/react-native-healthkit');
  });

  it('sets the bundle ids, keeps app.json values and never adds background modes', () => {
    const config = native.withPhase7Native({ name: 'x' }, all);
    expect(config.ios?.bundleIdentifier).toBe('com.grunthound.gymhound');
    expect(config.android?.package).toBe('com.grunthound.gymhound');
    expect(config.ios?.infoPlist).toEqual({ ITSAppUsesNonExemptEncryption: false });
    expect(config.ios?.infoPlist).not.toHaveProperty('UIBackgroundModes');
    const kept = native.withPhase7Native({ name: 'x', ios: { bundleIdentifier: 'a.b' }, android: { package: 'c.d' } }, none);
    expect(kept.ios?.bundleIdentifier).toBe('a.b');
    expect(kept.android?.package).toBe('c.d');
  });

  it('does not add a plugin twice or change the config it was given', () => {
    const input: Config = { name: 'x', plugins: [['expo-notifications', {}], 'expo-widgets'] };
    const copy = JSON.parse(JSON.stringify(input));
    const config = native.withPhase7Native(input, all);
    expect(names(config).filter((n) => n === 'expo-notifications')).toHaveLength(1);
    expect(names(config).filter((n) => n === 'expo-widgets')).toHaveLength(1);
    expect(input).toEqual(copy);
  });

  it('resolves for this project with what is installed now', () => {
    const config = native.appConfig(appJson.expo);
    expect(config.ios?.bundleIdentifier).toBe(native.IDS.bundleId);
    expect(names(config)).toContain('expo-router');
  });

  it('names the optional native package of a module, sub-paths included', () => {
    expect(native.optionalPackageOf('expo-widgets')).toBe('expo-widgets');
    expect(native.optionalPackageOf('@expo/ui/swift-ui')).toBe('@expo/ui');
    expect(native.optionalPackageOf('@notifee/react-native')).toBe('@notifee/react-native');
    expect(native.optionalPackageOf('expo-widgets-extra')).toBeNull();
    expect(native.optionalPackageOf('react-native')).toBeNull();
  });
});

describe('untested features left out of store builds (§18.28, R589–R591)', () => {
  const fs = require('fs') as typeof import('fs');
  const os = require('os') as typeof import('os');
  const path = require('path') as typeof import('path');

  /** A project folder with these packages "installed". */
  function projectWith(pkgs: string[]): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-native-'));
    for (const pkg of pkgs) {
      const dir = path.join(root, 'node_modules', ...pkg.split('/'));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: pkg, version: '1.0.0' }));
    }
    return root;
  }

  const installed = ['expo-dev-client', '@kingstinct/react-native-healthkit', 'react-native-health-connect', 'react-native-cloud-storage', 'expo-widgets', '@expo/ui'];

  it('leaves Apple Health, Health Connect, the iCloud copy and the Live Activity out of production and tester only', () => {
    expect(native.leftOutFor('production')).toEqual(native.LEFT_OUT_OF_STORE);
    expect(native.leftOutFor('tester')).toEqual(native.LEFT_OUT_OF_STORE);
    expect(native.leftOutFor('development')).toEqual([]);
    expect(native.leftOutFor('preview')).toEqual([]);
    expect(native.leftOutFor(undefined)).toEqual([]);
    expect(native.LEFT_OUT_OF_STORE).toEqual(expect.arrayContaining(['@kingstinct/react-native-healthkit', 'react-native-health-connect', 'react-native-cloud-storage', 'expo-widgets']));
  });

  it('a store build gets none of their plugins or Health Connect permissions; a development build gets them all', () => {
    const root = projectWith(installed);
    const store = native.appConfig(appJson.expo, root, 'production');
    for (const pkg of native.LEFT_OUT_OF_STORE) expect(names(store)).not.toContain(pkg);
    expect(names(store)).toContain('expo-dev-client');
    expect(store.android?.permissions ?? []).not.toContain('android.permission.health.READ_SLEEP');

    const dev = native.appConfig(appJson.expo, root, 'development');
    expect(names(dev)).toEqual(expect.arrayContaining(['@kingstinct/react-native-healthkit', 'react-native-health-connect', 'react-native-cloud-storage', 'expo-widgets']));
    expect(dev.android?.permissions).toEqual(expect.arrayContaining(native.HEALTH_CONNECT_PERMISSIONS));
  });

  it('the EAS post-install step removes them from a store build only', () => {
    const root = projectWith(installed);
    expect(leaveOutUntested(root, 'development')).toEqual([]);
    expect(leaveOutUntested(root, 'production').sort()).toEqual([...native.LEFT_OUT_OF_STORE].sort());
    for (const pkg of native.LEFT_OUT_OF_STORE) expect(fs.existsSync(path.join(root, 'node_modules', ...pkg.split('/')))).toBe(false);
    expect(fs.existsSync(path.join(root, 'node_modules', 'expo-dev-client'))).toBe(true);
    // Nothing left to remove the second time.
    expect(leaveOutUntested(root, 'tester')).toEqual([]);
  });
});

describe('the Android backup rules (§17.2, R303)', () => {
  it('include only the snapshot folder, for Android 6–11 and 12+', () => {
    expect(backup.backupRulesXml()).toContain('<include domain="file" path="snapshots/" />');
    expect(backup.backupRulesXml().match(/<include/g)).toHaveLength(1);
    const rules = backup.dataExtractionRulesXml();
    expect(rules).toContain('<cloud-backup>');
    expect(rules).toContain('<device-transfer>');
    expect(rules.match(/<include domain="file" path="snapshots\/" \/>/g)).toHaveLength(2);
    expect(rules).not.toContain('database');
  });

  it('point the manifest at both files and keep backup on', () => {
    const manifest = backup.applyBackupAttributes({ manifest: { application: [{ $: { 'android:name': '.MainApplication' } }] } });
    expect(manifest.manifest.application[0].$).toEqual({
      'android:name': '.MainApplication',
      'android:allowBackup': 'true',
      'android:fullBackupContent': '@xml/gymhound_backup_rules',
      'android:dataExtractionRules': '@xml/gymhound_data_extraction_rules',
    });
    expect(() => backup.applyBackupAttributes({ manifest: {} })).toThrow('no <application>');
  });
});
