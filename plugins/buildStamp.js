// The build stamp (§18.22, R540): the commit and its date, read from git when `npx expo start` (or an EAS build) reads
// app.config.js, and shown in Settings → Developer. The owner compares it with the commit the PC printed, so a phone
// still on an older build is caught before a check (Round 9 ran on the Round 8 build without anyone knowing).
const { execFileSync } = require('node:child_process');

/** `{ commit, date }` for the checkout at `root` (seven-character hash, commit date as YYYY-MM-DD), or null without git. */
function buildStamp(root) {
  try {
    const run = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const [commit, date] = run(['log', '-1', '--format=%h %cs', '--abbrev=7']).split(' ');
    if (!/^[0-9a-f]{7,}$/.test(commit) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    return { commit, date };
  } catch {
    return null;
  }
}

/** The config with `extra.build` set to the stamp, when there is one. */
function withBuildStamp(config, root) {
  const build = buildStamp(root);
  return build === null ? config : { ...config, extra: { ...config.extra, build } };
}

module.exports = { buildStamp, withBuildStamp };
