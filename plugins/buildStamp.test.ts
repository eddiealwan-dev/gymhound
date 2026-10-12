/** @jest-environment node */
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the config plugins are CommonJS, as app.config.js loads them
const { buildStamp, withBuildStamp } = require('./buildStamp') as typeof import('./buildStamp');

describe('the build stamp (R540)', () => {
  it('reads the commit and its date from git', () => {
    const stamp = buildStamp(join(__dirname, '..'));
    expect(stamp).toEqual({ commit: expect.stringMatching(/^[0-9a-f]{7,}$/), date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  });

  it('adds it to extra, keeping what is there, and leaves the config alone without git', () => {
    const config = { name: 'GymHound', extra: { eas: { projectId: 'x' } } };
    expect(withBuildStamp(config, join(__dirname, '..')).extra).toEqual({ eas: { projectId: 'x' }, build: expect.any(Object) });
    expect(withBuildStamp(config, tmpdir())).toBe(config);
  });
});
