/** @jest-environment node */
const { XML } = require('expo/config-plugins');
const {
  APPLE_MUSIC_USAGE,
  LISTENER_ACTION,
  LISTENER_PERMISSION,
  LISTENER_SERVICE,
  addMediaListenerService,
  ensureAppleMusicUsage,
} = require('./mediaManifest');
const withGymhoundMedia = require('../withGymhoundMedia');

const MINIMAL = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application android:name=".MainApplication">
    <activity android:name=".MainActivity"/>
  </application>
</manifest>`;

function listenerServices(manifest) {
  const services = manifest.manifest.application[0].service ?? [];
  return services.filter((s) => s.$['android:name'] === LISTENER_SERVICE);
}

describe('addMediaListenerService', () => {
  it('adds the notification listener service with the permission and the filter', async () => {
    const manifest = addMediaListenerService(await XML.parseXMLAsync(MINIMAL));
    const found = listenerServices(manifest);
    expect(found).toHaveLength(1);
    expect(found[0].$).toEqual({
      'android:name': 'expo.modules.gymhoundmedia.GymHoundMediaListener',
      'android:exported': 'false',
      'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
    });
    expect(LISTENER_PERMISSION).toBe('android.permission.BIND_NOTIFICATION_LISTENER_SERVICE');
    expect(found[0]['intent-filter']).toEqual([
      { action: [{ $: { 'android:name': 'android.service.notification.NotificationListenerService' } }] },
    ]);
    expect(LISTENER_ACTION).toBe('android.service.notification.NotificationListenerService');
  });

  it('adds it once when run twice', async () => {
    const once = addMediaListenerService(await XML.parseXMLAsync(MINIMAL));
    const twice = addMediaListenerService(once);
    expect(listenerServices(twice)).toHaveLength(1);
  });

  it('replaces a stale copy of the service and keeps other services', async () => {
    const manifest = await XML.parseXMLAsync(MINIMAL);
    manifest.manifest.application[0].service = [
      { $: { 'android:name': 'com.other.Service' } },
      { $: { 'android:name': LISTENER_SERVICE, 'android:exported': 'true' } },
    ];
    const out = addMediaListenerService(manifest);
    const services = out.manifest.application[0].service;
    expect(services).toHaveLength(2);
    expect(services[0].$['android:name']).toBe('com.other.Service');
    expect(listenerServices(out)[0].$['android:exported']).toBe('false');
  });

  it('keeps the rest of the application', async () => {
    const out = addMediaListenerService(await XML.parseXMLAsync(MINIMAL));
    expect(out.manifest.application[0].activity[0].$['android:name']).toBe('.MainActivity');
    expect(out.manifest.application[0].$['android:name']).toBe('.MainApplication');
  });

  it('formats as XML with the service inside <application>', async () => {
    const xml = XML.format(addMediaListenerService(await XML.parseXMLAsync(MINIMAL)));
    expect(xml).toMatch(
      /<service android:name="expo\.modules\.gymhoundmedia\.GymHoundMediaListener" android:exported="false" android:permission="android\.permission\.BIND_NOTIFICATION_LISTENER_SERVICE">\s*<intent-filter>\s*<action android:name="android\.service\.notification\.NotificationListenerService"\/>\s*<\/intent-filter>\s*<\/service>/,
    );
  });

  it('throws when the manifest has no <application>', () => {
    expect(() => addMediaListenerService({ manifest: { $: {} } })).toThrow(/application/);
  });
});

describe('ensureAppleMusicUsage', () => {
  it('sets the R223 string when missing', () => {
    expect(ensureAppleMusicUsage({})).toEqual({ NSAppleMusicUsageDescription: APPLE_MUSIC_USAGE });
    expect(APPLE_MUSIC_USAGE).toBe('GymHound shows and controls the song playing in Apple Music during a workout.');
  });

  it("keeps app.json's string when it is set", () => {
    expect(ensureAppleMusicUsage({ NSAppleMusicUsageDescription: 'Custom.' })).toEqual({
      NSAppleMusicUsageDescription: 'Custom.',
    });
  });
});

describe('withGymhoundMedia', () => {
  it('registers an Android manifest mod and an iOS Info.plist mod that apply the rules', async () => {
    const config = withGymhoundMedia({ name: 'GymHound', slug: 'gymhound' });
    const manifest = await XML.parseXMLAsync(MINIMAL);
    const android = await config.mods.android.manifest({ ...config, modResults: manifest, modRequest: {} });
    expect(listenerServices(android.modResults)).toHaveLength(1);
    const ios = await config.mods.ios.infoPlist({ ...config, modResults: {}, modRequest: {} });
    expect(ios.modResults.NSAppleMusicUsageDescription).toBe(APPLE_MUSIC_USAGE);
  });
});
