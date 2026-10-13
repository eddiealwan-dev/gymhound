// Pure parts of the media plugin (Task 8a, R216, R223). CommonJS so the config
// plugin can require it in Node during `expo prebuild` / EAS Build.

/** The do-nothing NotificationListenerService that lets MediaSessionManager list other apps' sessions. */
const LISTENER_SERVICE = 'expo.modules.gymhoundmedia.GymHoundMediaListener';
const LISTENER_PERMISSION = 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE';
const LISTENER_ACTION = 'android.service.notification.NotificationListenerService';
/** R223's copy; app.json's `ios.infoPlist` carries the same string and wins when set. */
const APPLE_MUSIC_USAGE = 'GymHound shows and controls the song playing in Apple Music during a workout.';

function listenerServiceEntry() {
  return {
    $: {
      'android:name': LISTENER_SERVICE,
      'android:exported': 'false',
      'android:permission': LISTENER_PERMISSION,
    },
    'intent-filter': [{ action: [{ $: { 'android:name': LISTENER_ACTION } }] }],
  };
}

/**
 * Adds the listener `<service>` to the first `<application>` of an AndroidManifest object
 * (the xml2js shape `withAndroidManifest` hands over). Idempotent: an existing entry with the
 * same name is replaced in place, so a second run leaves exactly one.
 */
function addMediaListenerService(androidManifest) {
  const application = androidManifest?.manifest?.application?.[0];
  if (!application) {
    throw new Error('withGymhoundMedia: AndroidManifest.xml has no <application>');
  }
  const services = Array.isArray(application.service) ? application.service : [];
  const entry = listenerServiceEntry();
  const at = services.findIndex((s) => s?.$?.['android:name'] === LISTENER_SERVICE);
  application.service = at === -1 ? [...services, entry] : services.map((s, i) => (i === at ? entry : s));
  return androidManifest;
}

/** Sets NSAppleMusicUsageDescription only when app.json has not. */
function ensureAppleMusicUsage(infoPlist) {
  if (typeof infoPlist.NSAppleMusicUsageDescription === 'string' && infoPlist.NSAppleMusicUsageDescription !== '') {
    return infoPlist;
  }
  return { ...infoPlist, NSAppleMusicUsageDescription: APPLE_MUSIC_USAGE };
}

module.exports = {
  APPLE_MUSIC_USAGE,
  LISTENER_ACTION,
  LISTENER_PERMISSION,
  LISTENER_SERVICE,
  addMediaListenerService,
  ensureAppleMusicUsage,
};
