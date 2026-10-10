/** @jest-environment node */
import { fileUri, pathFromUri } from './fileUri';

describe('fileUri and pathFromUri', () => {
  it('encodes each segment, so a space and an @ survive', () => {
    expect(fileUri('/var/mobile/Documents/My Data/@anonymous/a b.db')).toBe(
      'file:///var/mobile/Documents/My%20Data/%40anonymous/a%20b.db',
    );
  });

  it("encodes a literal % too: Expo Go's own folder is named %40anonymous%2F…, and its URI reads %2540anonymous%252F…", () => {
    const folder = '/var/mobile/Documents/ExponentExperienceData/%40anonymous%2Fgymhound-1234';
    expect(fileUri(folder)).toBe('file:///var/mobile/Documents/ExponentExperienceData/%2540anonymous%252Fgymhound-1234');
  });

  it.each([
    '/var/mobile/Documents/ExponentExperienceData/%40anonymous%2Fgymhound-1234/SQLite/gymhound.db',
    '/data/user/0/dev.gymhound/files/SQLite/gymhound.db',
    '/Users/Ed Alwan/Library/@scope/#1 (copy)/100%/a?b.db',
    '/plain/path',
  ])('round-trips %s', (path) => {
    expect(pathFromUri(fileUri(path))).toBe(path);
  });

  it('decodes once, so a native URL for the Expo Go folder gives back its on-disk name', () => {
    expect(pathFromUri('file:///docs/%2540anonymous%252Fgymhound-1234/')).toBe('/docs/%40anonymous%2Fgymhound-1234');
  });

  it('drops the trailing slash a directory URI carries', () => {
    expect(pathFromUri('file:///var/mobile/Documents/')).toBe('/var/mobile/Documents');
  });
});
