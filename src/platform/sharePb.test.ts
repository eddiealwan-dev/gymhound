import { createRef } from 'react';
import { Platform } from 'react-native';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { canSharePb, sharePbImage } from './sharePb';

jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(async () => 'file:///cache/ReactNative-snapshot-image1.png') }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => {}) }));

beforeEach(() => jest.clearAllMocks());

describe('sharePbImage (R106)', () => {
  it('captures the card as a 1080 × 1350 PNG in the cache and hands it to the share sheet', async () => {
    const ref = createRef<View>();
    await expect(sharePbImage(ref)).resolves.toBe('shared');

    expect(captureRef).toHaveBeenCalledWith(ref, { format: 'png', result: 'tmpfile', width: 1080, height: 1350 });
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/ReactNative-snapshot-image1.png', {
      mimeType: 'image/png',
      UTI: 'public.png',
      dialogTitle: 'Share a personal best',
    });
  });

  it('makes no image when the phone cannot share', async () => {
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValueOnce(false);
    await expect(sharePbImage(createRef<View>())).resolves.toBe('unavailable');

    expect(captureRef).not.toHaveBeenCalled();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('rejects when the capture fails, and shares nothing', async () => {
    jest.mocked(captureRef).mockRejectedValueOnce(new Error('no view'));
    await expect(sharePbImage(createRef<View>())).rejects.toThrow('no view');

    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('rejects when the share sheet fails', async () => {
    jest.mocked(Sharing.shareAsync).mockRejectedValueOnce(new Error('busy'));
    await expect(sharePbImage(createRef<View>())).rejects.toThrow('busy');
  });
});

describe('canSharePb', () => {
  const originalOS = Platform.OS;
  afterEach(() => {
    Platform.OS = originalOS;
  });

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
