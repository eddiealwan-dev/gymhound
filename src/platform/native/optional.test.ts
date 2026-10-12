import { isMissingNative, isNativeBuild, loadOptional } from './optional';

const IOS_BUILD = { os: 'ios', expoGo: false };
const ANDROID_BUILD = { os: 'android', expoGo: false };
const EXPO_GO = { os: 'ios', expoGo: true };
const WEB = { os: 'web', expoGo: false };

describe('loadOptional (R306)', () => {
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('never runs the require in Expo Go or on the web', () => {
    const load = jest.fn(() => ({ ok: true }));
    expect(loadOptional(load, EXPO_GO)).toBeNull();
    expect(loadOptional(load, { os: 'android', expoGo: true })).toBeNull();
    expect(loadOptional(load, WEB)).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('hands back the module in a development or store build', () => {
    const module = { ok: true };
    expect(loadOptional(() => module, IOS_BUILD)).toBe(module);
    expect(loadOptional(() => module, ANDROID_BUILD)).toBe(module);
  });

  it("treats Metro's stand-in for a package that is not installed as missing", () => {
    expect(loadOptional(() => require('./missingNativeModule'), IOS_BUILD)).toBeNull();
  });

  it('treats a require that throws, or gives nothing, as missing', () => {
    expect(
      loadOptional(() => {
        throw new Error("Cannot find module 'expo-widgets'");
      }, IOS_BUILD),
    ).toBeNull();
    expect(console.warn).toHaveBeenCalled();
    expect(loadOptional(() => undefined, IOS_BUILD)).toBeNull();
    expect(loadOptional(() => null, IOS_BUILD)).toBeNull();
  });

  it('says nothing when the package is simply not installed (Jest)', () => {
    const notInstalled = Object.assign(new Error("Cannot find module 'expo-widgets'"), { code: 'MODULE_NOT_FOUND' });
    expect(
      loadOptional(() => {
        throw notInstalled;
      }, IOS_BUILD),
    ).toBeNull();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('knows a native build and the stand-in', () => {
    expect(isNativeBuild(IOS_BUILD)).toBe(true);
    expect(isNativeBuild(EXPO_GO)).toBe(false);
    expect(isNativeBuild(WEB)).toBe(false);
    expect(isMissingNative({ __gymhoundMissingNative: true })).toBe(true);
    expect(isMissingNative({})).toBe(false);
    expect(isMissingNative(null)).toBe(false);
  });
});
