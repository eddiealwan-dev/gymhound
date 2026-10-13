import type { WeightUnit } from '../../domain/types';
import type { Db } from '../types';
import { getSettings, setSetting } from './settingsRepo';

/**
 * Switches the display unit (spec 7.1). Only the `unit` setting changes: routine plans and increments keep the
 * unit they were written in and convert when a workout starts from them (`startWorkoutFromDay`), and workouts,
 * their exercises and sets keep the unit they were logged in. Does nothing when the unit is already `to`.
 */
export function switchDisplayUnit(db: Db, to: WeightUnit): void {
  if (getSettings(db).unit === to) return;
  setSetting(db, 'unit', to);
}
