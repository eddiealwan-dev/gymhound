// Expo's Babel transformer, plus a one-line fix for a bug in expo-sqlite's web build (see metro.config.js).
const crypto = require('crypto');
const fs = require('fs');
const upstream = require(require.resolve('@expo/metro-config/babel-transformer', {
  paths: [require.resolve('expo/package.json')],
}));

// The web worker sends a synchronous result as [4-byte length][JSON]. It writes the length with
// `Uint8Array.set(Uint32Array)`, which converts element by element, so only the low byte lands and a result of
// 256 bytes or more reaches the app as `length % 256` bytes of broken JSON. Write the 4 bytes through a Uint32 view.
const BUGGY = 'resultArray.set(new Uint32Array([length]), 0);';
const FIXED = 'new Uint32Array(resultBuffer, 0, 1)[0] = length;';
const WORKER_CHANNEL = /expo-sqlite[\\/]web[\\/]WorkerChannel\.ts$/;

const thisFile = crypto.createHash('sha1').update(fs.readFileSync(__filename)).digest('hex');

module.exports = {
  ...upstream,
  transform(args) {
    // If a later expo-sqlite fixes this, BUGGY is gone and the source passes through unchanged.
    if (WORKER_CHANNEL.test(args.filename) && args.src.includes(BUGGY)) {
      args = { ...args, src: args.src.replace(BUGGY, FIXED) };
    }
    return upstream.transform(args);
  },
  getCacheKey: () => `${upstream.getCacheKey?.() ?? ''}:${thisFile}`,
};
