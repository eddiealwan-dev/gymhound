// EAS runs this after installing packages and before prebuilding (package.json's `eas-build-post-install`). On a store
// profile (production, or tester for TestFlight) it removes the packages whose features haven't passed a phone check
// yet (plugins/nativeConfig.js LEFT_OUT_OF_STORE, §18.28 R590), so their native code, entitlements and permissions never
// reach a store build. Every other profile, and a local `npm install`, is left alone.
const fs = require('fs');
const path = require('path');
const { leftOutFor } = require('../plugins/nativeConfig');

/** Removes each left-out package from `root`'s node_modules; returns the ones it removed. */
function leaveOutUntested(root, profile) {
  const removed = [];
  for (const pkg of leftOutFor(profile)) {
    const dir = path.join(root, 'node_modules', ...pkg.split('/'));
    if (!fs.existsSync(dir)) continue;
    fs.rmSync(dir, { recursive: true, force: true });
    removed.push(pkg);
  }
  return removed;
}

if (require.main === module) {
  const profile = process.env.EAS_BUILD_PROFILE;
  const removed = leaveOutUntested(path.join(__dirname, '..'), profile);
  console.log(
    removed.length > 0
      ? `GymHound: left out of the ${profile} build until tested: ${removed.join(', ')}`
      : `GymHound: nothing to leave out of the ${profile ?? 'local'} build.`,
  );
}

module.exports = { leaveOutUntested };
