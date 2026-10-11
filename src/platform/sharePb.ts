import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import { Platform } from 'react-native';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

/**
 * Captures a mounted personal best card (`PbCard`, 360 × 450 points) as a 1080 × 1350 PNG and opens the share sheet
 * for it (R106). view-shot writes the file to the app's cache folder; nothing is uploaded and nothing is written
 * anywhere else. Phone builds only.
 * - 'unavailable': the phone cannot share; no image is made.
 * - 'shared': the share sheet opened.
 * A failure to capture or to share rejects.
 */
export async function sharePbImage(view: RefObject<View | null>): Promise<'shared' | 'unavailable'> {
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  const uri = await captureRef(view, { format: 'png', result: 'tmpfile', width: 1080, height: 1350 });
  await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share a personal best' });
  return 'shared';
}

/** Whether a personal best can be shared: a phone build whose share sheet is available. The browser build never asks. */
export async function canSharePb(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return await Sharing.isAvailableAsync();
  } catch {
    return false;
  }
}
