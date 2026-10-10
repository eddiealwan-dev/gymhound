const path = require('path');
const fs = require('fs');
const http = require('http');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push('sql');
config.resolver.assetExts.push('wasm');

const linked = path.join(__dirname, 'node_modules');
const real = fs.realpathSync(linked);
if (real !== linked) {
  config.watchFolders = [...(config.watchFolders ?? []), real];
  // Metro names a bundle after its path under the project, so the web worker that expo-sqlite loads from the real
  // (outside-the-project) node_modules gets a URL with `../` segments, which the browser collapses and Metro then
  // 404s. Resolve that one file through the junction so its URL stays under the project.
  config.resolver.resolveRequest = (context, moduleName, platform) =>
    moduleName === './worker' && /expo-sqlite[\\/]web[\\/]/.test(context.originModulePath)
      ? { type: 'sourceFile', filePath: path.join(linked, 'expo-sqlite', 'web', 'worker.ts') }
      : context.resolveRequest(context, moduleName, platform);
}

// expo-sqlite 57.0.4 on web: its synchronous results are corrupted from 256 bytes up; metro.transformer.js fixes it.
config.transformer.babelTransformerPath = require.resolve('./metro.transformer.js');

// expo-sqlite on web needs SharedArrayBuffer, which needs the page to be cross-origin isolated (COEP + COOP).
// `server.enhanceMiddleware` (the documented hook) runs after Expo's first middleware, which answers `/`,
// `/manifest` and `/index.exp` itself, so the HTML at `/` never got the headers. The `expo-router` `headers`
// plugin option only applies to `web.output` static/server, and those fail to bundle expo-sqlite's web worker.
// So set the headers when each request arrives, before any middleware runs.
const createServer = http.createServer;
http.createServer = function (...args) {
  const server = createServer.apply(this, args);
  server.prependListener('request', (req, res) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  });
  return server;
};

module.exports = config;
