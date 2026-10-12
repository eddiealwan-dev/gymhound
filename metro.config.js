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
}

// WEB DEV SERVER ONLY. The two hooks below, and patches/expo-sqlite+57.0.4.patch, exist so expo-sqlite can run in the
// browser pane. They are tied to Expo CLI 57.0.28 and expo-sqlite 57.0.4 and do nothing for iOS or Android. If a
// later version breaks them, the web startup screen shows "SharedArrayBuffer is not defined" (the headers hook) or
// "Unexpected end of JSON input" (the patch, e.g. after the patch no longer applies).

// Hook 1: the worker. Metro names a bundle after its path under the project, so the web worker that expo-sqlite loads
// from the real (outside-the-project) node_modules gets a URL with `../` segments, which the browser collapses and
// Metro then 404s. Resolve that one file through the junction so its URL stays under the project.
if (real !== linked) {
  config.resolver.resolveRequest = (context, moduleName, platform) =>
    moduleName === './worker' && /expo-sqlite[\\/]web[\\/]/.test(context.originModulePath)
      ? { type: 'sourceFile', filePath: path.join(linked, 'expo-sqlite', 'web', 'worker.ts') }
      : context.resolveRequest(context, moduleName, platform);
}

// PHASE 7: the native-only packages (plugins/nativeConfig.js OPTIONAL_NATIVE_PACKAGES) are required only inside a guard
// that never runs in Expo Go (src/platform/native/optional.ts). Metro still resolves every require when it bundles, so
// one that is not installed yet resolves to a stub instead of failing the bundle. Once installed, the real package is
// bundled and the guard keeps Expo Go from running it (R306).
const { isInstalled, optionalPackageOf } = require('./plugins/nativeConfig');
const missingNative = path.join(__dirname, 'src', 'platform', 'native', 'missingNativeModule.js');
const installed = new Map();
const resolveBefore = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const pkg = optionalPackageOf(moduleName);
  if (pkg !== null) {
    if (!installed.has(pkg)) installed.set(pkg, isInstalled(pkg, __dirname));
    if (!installed.get(pkg)) return { type: 'sourceFile', filePath: missingNative };
  }
  return resolveBefore ? resolveBefore(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
};

// Hook 2: the headers. expo-sqlite on web needs SharedArrayBuffer, which needs the page to be cross-origin isolated
// (COEP + COOP). `server.enhanceMiddleware` (the documented hook) runs after Expo's first middleware, which answers
// `/`, `/manifest` and `/index.exp` itself, so the HTML at `/` never got the headers. The `expo-router` `headers`
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
