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
  appConfig(config: Config, root?: string): Config;
};
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
