// PHASE 7: what Metro bundles in place of a native-only package that is not installed yet (metro.config.js, R306).
// `loadOptional` (optional.ts) sees the marker and reports the package as unavailable, so the app keeps its Expo Go
// behaviour. Nothing here runs in Expo Go: the guard stops before the require.
module.exports = { __gymhoundMissingNative: true };
