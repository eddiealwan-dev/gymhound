import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { bodyCsvRows, foodCsvRows, workoutCsvRows } from '../db/repositories/exportRepo';
import type { Db } from '../db/types';
import { BODY_CSV_COLUMNS, FOOD_CSV_COLUMNS, toCsv, WORKOUT_CSV_COLUMNS, type CsvValue } from '../domain/csv';
import { toLocalDate } from '../domain/dates';
import { fileUri, pathFromUri } from './snapshots/fileUri';

/**
 * Writes `gymhound-{kind}-YYYY-MM-DD.csv` (the local date of `now`) to the cache folder, replacing a file of the same
 * day, and opens the share sheet for it. 'empty' with no rows and 'unavailable' when the phone cannot share, writing
 * nothing either way. A failure to write or to share rejects.
 */
async function shareCsv(
  kind: 'workouts' | 'food' | 'body',
  header: readonly string[],
  rows: CsvValue[][],
  now: number,
  dialogTitle: string,
): Promise<'shared' | 'empty' | 'unavailable'> {
  if (rows.length === 0) return 'empty';
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';

  // Built from the absolute path, as the snapshot files are, so Expo Go's literal %40 folder name survives.
  const uri = fileUri(`${pathFromUri(Paths.cache.uri)}/gymhound-${kind}-${toLocalDate(now)}.csv`);
  const file = new File(uri);
  file.create({ overwrite: true });
  file.write(toCsv(header, rows));

  await Sharing.shareAsync(uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle,
  });
  return 'shared';
}

/**
 * Writes `gymhound-workouts-YYYY-MM-DD.csv` (the local date of `now`) to the cache folder, replacing a file of the same
 * day, and opens the share sheet for it, so the workouts open in Numbers, Excel or anything that reads CSV.
 * - 'empty': no finished workout has a done set; no file is written.
 * - 'unavailable': the phone cannot share; no file is written.
 * - 'shared': the share sheet opened.
 * A failure to write or to share rejects.
 */
export async function exportWorkoutsCsv(db: Db, now: number): Promise<'shared' | 'empty' | 'unavailable'> {
  return shareCsv('workouts', WORKOUT_CSV_COLUMNS, workoutCsvRows(db), now, 'GymHound workouts');
}

/**
 * Writes `gymhound-food-YYYY-MM-DD.csv` (spec §11) the same way, one row per food log entry. Free and Pro alike: a
 * lapsed user still has their food (§9, R153).
 * - 'empty': no food is logged; no file is written.
 * - 'unavailable': the phone cannot share; no file is written.
 * - 'shared': the share sheet opened.
 * A failure to write or to share rejects.
 */
export async function exportFoodCsv(db: Db, now: number): Promise<'shared' | 'empty' | 'unavailable'> {
  return shareCsv('food', FOOD_CSV_COLUMNS, foodCsvRows(db), now, 'GymHound food');
}

/**
 * Writes `gymhound-body-YYYY-MM-DD.csv` (R183) the same way, one row per bodyweight or measurement entry, each in the
 * unit it was logged in. Free.
 * - 'empty': nothing is logged; no file is written.
 * - 'unavailable': the phone cannot share; no file is written.
 * - 'shared': the share sheet opened.
 * A failure to write or to share rejects.
 */
export async function exportBodyCsv(db: Db, now: number): Promise<'shared' | 'empty' | 'unavailable'> {
  return shareCsv('body', BODY_CSV_COLUMNS, bodyCsvRows(db), now, 'GymHound body');
}
