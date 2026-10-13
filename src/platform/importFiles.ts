import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { IMPORT_SAMPLES, type SampleKind } from '../domain/importSamples';
import { fileUri, pathFromUri } from './snapshots/fileUri';

/** The largest file Import data reads: years of sets in a CSV are a few megabytes. */
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

export type PickedFile = { name: string; text: string } | { name: string; tooBig: true };

/**
 * Lets you choose a CSV file from Files (iCloud Drive, On My iPhone, Downloads, another app's folder) and reads it as
 * text (R565). Text files of any kind can be chosen, so a CSV an app saved as plain text still can be. Null when
 * nothing was chosen. A file over `MAX_IMPORT_BYTES` is not read. A failure to read rejects.
 */
export async function pickCsvFile(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/*', 'text/csv', 'text/comma-separated-values', 'application/csv', 'application/vnd.ms-excel'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  if ((asset.size ?? 0) > MAX_IMPORT_BYTES) return { name: asset.name, tooBig: true };
  // On the web the picker hands over the browser's own file; on a phone, a copy in the cache folder.
  const text = asset.file ? await asset.file.text() : await new File(asset.uri).text();
  return { name: asset.name, text };
}

/**
 * Writes `gymhound-sample-{kind}.csv` to the cache folder and opens the share sheet for it (R565), so it can be saved
 * to Files, opened in Numbers or Excel, or sent to a computer. 'unavailable' when the phone cannot share. A failure to
 * write or to share rejects.
 */
export async function shareSample(kind: SampleKind): Promise<'shared' | 'unavailable'> {
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  const uri = fileUri(`${pathFromUri(Paths.cache.uri)}/gymhound-sample-${kind}.csv`);
  const file = new File(uri);
  file.create({ overwrite: true });
  // A BOM, so Excel reads the file as UTF-8, as the exports have.
  file.write(`﻿${IMPORT_SAMPLES[kind]}\r\n`);
  await Sharing.shareAsync(uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: `GymHound sample ${kind} file` });
  return 'shared';
}
