// The app config. app.json holds everything Expo Go reads; `appConfig` adds what only a development, preview or store
// build uses (phase 7: plugins, bundle ids, Health Connect permissions). Expo Go never runs config plugins, and each
// phase 7 plugin is added only once its package is installed, so `npx expo start` works before and after. See
// plugins/nativeConfig.js and spec §18.13 (R300–R305). `withBuildStamp` adds the commit shown in Settings → Developer
// (R540).
const { appConfig } = require('./plugins/nativeConfig');
const { withBuildStamp } = require('./plugins/buildStamp');

module.exports = ({ config }) => withBuildStamp(appConfig(config, __dirname), __dirname);
