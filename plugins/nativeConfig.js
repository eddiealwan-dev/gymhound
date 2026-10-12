/**
 * PHASE 7 (native build) — what a development, preview or store build adds to the app config (spec §15, §17, R300–R305).
 *
 * Expo Go never runs config plugins: it reads only the plain fields of app.json. So everything here is inert for
 * `npx expo start` in Expo Go. Each plugin from a phase 7 package is added only when that package is installed, so the
 * config still resolves before the owner installs them (an uninstalled plugin would make `expo config` fail).
 *
 * The identifiers below are permanent once the App Store and Play records exist (R300).
 */
const path = require('path');

const IDS = {
  /** The app on both stores (R300). */
  bundleId: 'com.grunthound.gymhound',
  /** The Live Activity's widget extension (expo-widgets). */
  widgetBundleId: 'com.grunthound.gymhound.widgets',
  /** Shared between the app and its widget extension (and, in phase 8, the watch app). */
  appGroup: 'group.com.grunthound.gymhound',
  /** The iCloud container the snapshot copy goes to (§17.2, R303). */
  iCloudContainer: 'iCloud.com.grunthound.gymhound',
};

/** The bundled bells (scripts/make-bells.mjs), also bundled as notification sounds so the lock screen rings the chosen one (R304). */
const BELL_SOUND_FILES = ['./assets/sounds/bell.wav', './assets/sounds/chime.wav', './assets/sounds/ding.wav'];

/** The Health Connect records GymHound writes or reads (§17.1): workouts out; sleep, resting heart rate, weight and steps in. */
const HEALTH_CONNECT_PERMISSIONS = [
  'android.permission.health.WRITE_EXERCISE',
  'android.permission.health.READ_SLEEP',
  'android.permission.health.READ_RESTING_HEART_RATE',
  'android.permission.health.READ_WEIGHT',
  // The Stats steps card on Android (§18.3, R312).
  'android.permission.health.READ_STEPS',
];

const HEALTH_SHARE = 'GymHound reads your sleep, resting heart rate and body weight, only if you turn each on in Settings.';
const HEALTH_UPDATE = 'GymHound saves each finished workout to Apple Health, if you turn it on in Settings.';

/**
 * The phase 7 packages and the plugin entry each one needs. A package with no entry (`plugin: null`) needs no config
 * plugin, only installing. Kept in the order they are applied.
 */
const OPTIONAL_PLUGINS = [
  { pkg: 'expo-dev-client', plugin: 'expo-dev-client' },
  {
    // Android: Health Connect needs minSdk 26 (Android 8). iOS keeps Expo's default deployment target.
    pkg: 'expo-build-properties',
    plugin: ['expo-build-properties', { android: { minSdkVersion: 26 } }],
  },
  {
    // iOS: the HealthKit entitlement and both usage strings. No background delivery: GymHound only reads when it opens (R302).
    pkg: '@kingstinct/react-native-healthkit',
    plugin: [
      '@kingstinct/react-native-healthkit',
      { NSHealthShareUsageDescription: HEALTH_SHARE, NSHealthUpdateUsageDescription: HEALTH_UPDATE, background: false },
    ],
  },
  // Android: Health Connect's permission rationale activity and the permission delegate.
  { pkg: 'react-native-health-connect', plugin: 'react-native-health-connect' },
  {
    // iOS: the Live Activity's widget extension, its app group and NSSupportsLiveActivities (R301).
    pkg: 'expo-widgets',
    plugin: ['expo-widgets', { bundleIdentifier: IDS.widgetBundleId, groupIdentifier: IDS.appGroup, widgets: [] }],
  },
  {
    // iOS: the iCloud Documents entitlement and container for the snapshot copy (R303). Android needs nothing here.
    pkg: 'react-native-cloud-storage',
    plugin: ['react-native-cloud-storage', { iCloudContainerIdentifier: IDS.iCloudContainer, iCloudContainerEnvironment: 'Production' }],
  },
  // Android: the rest timer's ongoing notification (R301). Autolinked; it adds its own Maven repository.
  { pkg: '@notifee/react-native', plugin: null },
];

/** The packages the JavaScript loads only in a development or store build (src/platform/native/optional.ts, metro.config.js). */
const OPTIONAL_NATIVE_PACKAGES = [
  'expo-widgets',
  '@expo/ui',
  '@kingstinct/react-native-healthkit',
  'react-native-nitro-modules',
  'react-native-health-connect',
  'react-native-cloud-storage',
  '@notifee/react-native',
];

/** Whether `name` is installed for the project at `root`. */
function isInstalled(name, root) {
  try {
    require.resolve(`${name}/package.json`, { paths: [root] });
    return true;
  } catch {
    return false;
  }
}

/** Whether `moduleName` (a bare import such as `expo-widgets` or `@expo/ui/swift-ui`) belongs to `pkg`. */
function belongsTo(moduleName, pkg) {
  return moduleName === pkg || moduleName.startsWith(`${pkg}/`);
}

/** The optional native package `moduleName` belongs to, or null. */
function optionalPackageOf(moduleName) {
  return OPTIONAL_NATIVE_PACKAGES.find((pkg) => belongsTo(moduleName, pkg)) ?? null;
}

const pluginName = (entry) => (Array.isArray(entry) ? entry[0] : entry);

/**
 * The app config with the phase 7 additions (R300–R305). `isInstalledFn(name)` says whether a package is installed.
 * Never mutates `config`.
 * - Always (inert in Expo Go): the bell sounds bundled for notifications, the Android backup rules for the snapshot
 *   folder, and `ITSAppUsesNonExemptEncryption: false` (GymHound uses no encryption beyond the system's).
 * - When installed: each package's plugin from `OPTIONAL_PLUGINS`, and the Health Connect permissions.
 * - Never: `UIBackgroundModes`. The scheduled notification rings at the end of a rest; nothing runs in the background (R305).
 */
function withPhase7Native(config, isInstalledFn) {
  const existing = config.plugins ?? [];
  const has = (name) => existing.some((entry) => pluginName(entry) === name);
  const plugins = [...existing];
  if (!has('expo-notifications')) {
    plugins.push(['expo-notifications', { sounds: BELL_SOUND_FILES }]);
  }
  if (!has('./plugins/withSnapshotBackupRules')) plugins.push('./plugins/withSnapshotBackupRules');
  for (const { pkg, plugin } of OPTIONAL_PLUGINS) {
    if (plugin !== null && isInstalledFn(pkg) && !has(pluginName(plugin))) plugins.push(plugin);
  }

  const healthConnect = isInstalledFn('react-native-health-connect');
  const permissions = [...(config.android?.permissions ?? [])];
  if (healthConnect) {
    for (const permission of HEALTH_CONNECT_PERMISSIONS) if (!permissions.includes(permission)) permissions.push(permission);
  }

  return {
    ...config,
    ios: {
      ...config.ios,
      bundleIdentifier: config.ios?.bundleIdentifier ?? IDS.bundleId,
      infoPlist: { ...config.ios?.infoPlist, ITSAppUsesNonExemptEncryption: false },
    },
    android: {
      ...config.android,
      package: config.android?.package ?? IDS.bundleId,
      ...(permissions.length > 0 ? { permissions } : null),
    },
    plugins,
  };
}

/** The app config for the project at `root`, as app.config.js returns it. */
function appConfig(config, root = path.join(__dirname, '..')) {
  return withPhase7Native(config, (name) => isInstalled(name, root));
}

module.exports = {
  IDS,
  BELL_SOUND_FILES,
  HEALTH_CONNECT_PERMISSIONS,
  OPTIONAL_PLUGINS,
  OPTIONAL_NATIVE_PACKAGES,
  isInstalled,
  optionalPackageOf,
  withPhase7Native,
  appConfig,
};
