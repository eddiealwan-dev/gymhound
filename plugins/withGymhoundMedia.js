// Config plugin for modules/gymhound-media (Task 8a, R216, R223).
// Android: declares GymHoundMediaListener, the NotificationListenerService that MediaSessionManager
//   needs before it lists other apps' media sessions (the person enables it once in system settings).
// iOS: makes sure NSAppleMusicUsageDescription exists (app.json's string wins); MPMediaLibrary's
//   permission prompt crashes the app without it.
const { withAndroidManifest, withInfoPlist } = require('expo/config-plugins');
const { addMediaListenerService, ensureAppleMusicUsage } = require('./lib/mediaManifest');

function withGymhoundMedia(config) {
  config = withAndroidManifest(config, (c) => {
    c.modResults = addMediaListenerService(c.modResults);
    return c;
  });
  config = withInfoPlist(config, (c) => {
    c.modResults = ensureAppleMusicUsage(c.modResults);
    return c;
  });
  return config;
}

module.exports = withGymhoundMedia;
