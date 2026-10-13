/** @jest-environment node */
import fs from 'node:fs';
import { renameWithRetry } from './nodeSnapshotFiles';

/** A rename that fails with `code` for the first `failures` calls, then succeeds. */
function flakyRename(code: string, failures: number) {
  let calls = 0;
  return jest.spyOn(fs, 'renameSync').mockImplementation(() => {
    calls += 1;
    if (calls <= failures) throw Object.assign(new Error(code), { code });
  });
}

afterEach(() => jest.restoreAllMocks());

describe('renameWithRetry (a Windows test flake: another process briefly holding the file)', () => {
  it.each(['EPERM', 'EACCES', 'EBUSY'])('retries %s on Windows until the rename goes through', (code) => {
    const rename = flakyRename(code, 3);
    renameWithRetry('a', 'b', 'win32');
    expect(rename).toHaveBeenCalledTimes(4);
  });

  it('gives up after ten tries and throws the last error', () => {
    const rename = flakyRename('EPERM', 100);
    expect(() => renameWithRetry('a', 'b', 'win32')).toThrow('EPERM');
    expect(rename).toHaveBeenCalledTimes(10);
  });

  it('rethrows any other error at once', () => {
    const rename = flakyRename('ENOENT', 1);
    expect(() => renameWithRetry('a', 'b', 'win32')).toThrow('ENOENT');
    expect(rename).toHaveBeenCalledTimes(1);
  });

  it('does not retry on other platforms', () => {
    const rename = flakyRename('EPERM', 1);
    expect(() => renameWithRetry('a', 'b', 'linux')).toThrow('EPERM');
    expect(rename).toHaveBeenCalledTimes(1);
  });
});
