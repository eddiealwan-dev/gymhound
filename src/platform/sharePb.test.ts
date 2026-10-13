import { createRef } from 'react';
import { PixelRatio, Platform } from 'react-native';
import type { View } from 'react-native';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { canSharePb, pbCaptureSize, sharePbImage, toFileUri } from './sharePb';

jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(), releaseCapture: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));

const ANDROID_URI = 'file:///data/user/0/host.exp.exponent/cache/ReactNative-snapshot-image1.png';
/** iOS view-shot hands back a bare path for a tmpfile, with no scheme. */
const IOS_PATH = '/var/mobile/Containers/Data/Application/ABC/tmp/ReactNative/1F2E.png';

const originalOS = Platform.OS;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(captureRef).mockReset().mockResolvedValue(ANDROID_URI);
  jest.mocked(releaseCapture).mockReset();
  jest.mocked(Sharing.isAvailableAsync).mockReset().mockResolvedValue(true);
  jest.mocked(Sharing.shareAsync).mockReset().mockResolvedValue(undefined);
  Platform.OS = 'android';
});
afterEach(() => {
  Platform.OS = originalOS;
  jest.restoreAllMocks();
});

const SHARE_OPTIONS = { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share a personal record' };

describe('toFileUri', () => {
  it('adds file:// to a bare path and leaves a URI alone', () => {
    expect(toFileUri(IOS_PATH)).toBe(`file://${IOS_PATH}`);
    expect(toFileUri(ANDROID_URI)).toBe(ANDROID_URI);
  });
});

describe('pbCaptureSize', () => {
  it('is 1080 × 1350 pixels on Android', () => {
    jest.spyOn(PixelRatio, 'get').mockReturnValue(2.625);
    expect(pbCaptureSize()).toEqual({ width: 1080, height: 1350 });
  });

  it('is given in points on iOS, so the PNG still comes out 1080 × 1350 pixels', () => {
    Platform.OS = 'ios';
    jest.spyOn(PixelRatio, 'get').mockReturnValue(3);
    expect(pbCaptureSize()).toEqual({ width: 360, height: 450 });
    jest.spyOn(PixelRatio, 'get').mockReturnValue(2);
    expect(pbCaptureSize()).toEqual({ width: 540, height: 675 });
  });
});

describe('sharePbImage (R106)', () => {
  it('on Android captures a 1080 × 1350 PNG in the cache and shares it, leaving the file for the receiving app', async () => {
    const ref = createRef<View>();
    await expect(sharePbImage(ref)).resolves.toBe('shared');

    expect(captureRef).toHaveBeenCalledWith(ref, { format: 'png', result: 'tmpfile', width: 1080, height: 1350 });
    expect(Sharing.shareAsync).toHaveBeenCalledWith(ANDROID_URI, SHARE_OPTIONS);
    expect(releaseCapture).not.toHaveBeenCalled();
  });

  it("on iOS captures in points, hands the share sheet a file:// URL, not view-shot's bare path, then releases the file", async () => {
    Platform.OS = 'ios';
    jest.spyOn(PixelRatio, 'get').mockReturnValue(3);
    jest.mocked(captureRef).mockResolvedValue(IOS_PATH);
    const ref = createRef<View>();
    await expect(sharePbImage(ref)).resolves.toBe('shared');

    expect(captureRef).toHaveBeenCalledWith(ref, { format: 'png', result: 'tmpfile', width: 360, height: 450 });
    expect(Sharing.shareAsync).toHaveBeenCalledWith(`file://${IOS_PATH}`, SHARE_OPTIONS);
    expect(releaseCapture).toHaveBeenCalledWith(IOS_PATH);
    expect(jest.mocked(releaseCapture).mock.invocationCallOrder[0]).toBeGreaterThan(jest.mocked(Sharing.shareAsync).mock.invocationCallOrder[0]);
  });

  it('makes no image when the phone cannot share', async () => {
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(false);
    await expect(sharePbImage(createRef<View>())).resolves.toBe('unavailable');

    expect(captureRef).not.toHaveBeenCalled();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('rejects when the capture fails, and shares and releases nothing', async () => {
    jest.mocked(captureRef).mockRejectedValue(new Error('no view'));
    await expect(sharePbImage(createRef<View>())).rejects.toThrow('no view');

    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    expect(releaseCapture).not.toHaveBeenCalled();
  });

  it('rejects when the share sheet fails, on iOS still releasing the file', async () => {
    Platform.OS = 'ios';
    jest.mocked(captureRef).mockResolvedValue(IOS_PATH);
    jest.mocked(Sharing.shareAsync).mockRejectedValue(new Error('busy'));
    await expect(sharePbImage(createRef<View>())).rejects.toThrow('busy');

    expect(releaseCapture).toHaveBeenCalledWith(IOS_PATH);
  });

  it('on Android releases nothing when the share sheet fails either', async () => {
    jest.mocked(Sharing.shareAsync).mockRejectedValue(new Error('busy'));
    await expect(sharePbImage(createRef<View>())).rejects.toThrow('busy');

    expect(releaseCapture).not.toHaveBeenCalled();
  });

  it('ignores a failure to release the file on iOS', async () => {
    Platform.OS = 'ios';
    jest.mocked(captureRef).mockResolvedValue(IOS_PATH);
    jest.mocked(releaseCapture).mockImplementation(() => {
      throw new Error('gone');
    });
    await expect(sharePbImage(createRef<View>())).resolves.toBe('shared');
  });
});

describe('canSharePb', () => {
  it('follows the share sheet on a phone', async () => {
    await expect(canSharePb()).resolves.toBe(true);
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValueOnce(false);
    await expect(canSharePb()).resolves.toBe(false);
    jest.mocked(Sharing.isAvailableAsync).mockRejectedValueOnce(new Error('no module'));
    await expect(canSharePb()).resolves.toBe(false);
  });

  it('is false in the browser build without asking', async () => {
    Platform.OS = 'web';
    await expect(canSharePb()).resolves.toBe(false);
    expect(Sharing.isAvailableAsync).not.toHaveBeenCalled();
  });
});
