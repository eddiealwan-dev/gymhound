const path = require('path');
const fs = require('fs');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push('sql');
config.resolver.assetExts.push('wasm');
const linked = path.join(__dirname, 'node_modules');
const real = fs.realpathSync(linked);
if (real !== linked) config.watchFolders = [...(config.watchFolders ?? []), real];
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  return middleware(req, res, next);
};
module.exports = config;
