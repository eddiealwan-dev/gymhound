import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { workoutCsvRows } from '../db/repositories/exportRepo';
import type { Db } from '../db/types';
import { toCsv, WORKOUT_CSV_COLUMNS } from '../domain/csv';
import { toLocalDate } from '../domain/dates';
import { fileUri, pathFromUri } from './snapshots/fileUri';

/**
 * Writes `gymhound-workouts-YYYY-MM-DD.csv` (the local date of `now`) to the cache folder, replacing a file of the same
 * day, and opens the share sheet for it, so the workouts open in Numbers, Excel or anything that reads CSV.
 * - 'empty': no finished workout has a done set; no file is written.
 * - 'unavailable': the phone cannot share; no file is written.
 * - 'shared': the share sheet opened.
 * A failure to write or to share rejects.
 */
export async function exportWorkoutsCsv(db: Db, now: number): Promise<'shared' | 'empty' | 'unavailable'> {
  const rows = workoutCsvRows(db);
  if (rows.length === 0) return 'empty';
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';

  // Built from the absolute path, as the snapshot files are, so Expo Go's literal %40 folder name survives.
  const uri = fileUri(`${pathFromUri(Paths.cache.uri)}/gymhound-workouts-${toLocalDate(now)}.csv`);
  const file = new File(uri);
  file.create({ overwrite: true });
  file.write(toCsv(WORKOUT_CSV_COLUMNS, rows));

  await Sharing.shareAsync(uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: 'GymHound workouts',
  });
  return 'shared';
}
