import { eq } from 'drizzle-orm';
import { nearestLoadable } from '../../domain/plates';
import type { WeightUnit } from '../../domain/types';
import { convertIncrement, convertWeight, roundToHalf } from '../../domain/units';
import { exercises, routineExercises } from '../schema';
import type { Db } from '../types';
import { getSettings, setSetting } from './settingsRepo';

/**
 * Switches the display unit (spec 7.1), in one transaction. Each routine exercise's next weight is
 * converted and rounded to something liftable: a barbell to the nearest loadable total with the new unit's
 * bar and plates, anything else to the nearest 0.5. Increments convert by the gym convention. Workouts,
 * their exercises and sets are never touched, so history and the active workout keep the unit they were
 * logged in. Does nothing when the unit is already `to`.
 */
export function switchDisplayUnit(db: Db, to: WeightUnit): void {
  db.transaction((tx) => {
    const s = getSettings(tx);
    if (s.unit === to) return;
    const bar = to === 'lb' ? s.barLb : s.barKg;
    const plates = to === 'lb' ? s.platesLb : s.platesKg;

    const rows = tx
      .select({
        id: routineExercises.id,
        nextWeight: routineExercises.nextWeight,
        nextWeightUnit: routineExercises.nextWeightUnit,
        increment: routineExercises.increment,
        incrementUnit: routineExercises.incrementUnit,
        equipment: exercises.equipment,
      })
      .from(routineExercises)
      .innerJoin(exercises, eq(routineExercises.exerciseId, exercises.id))
      .all();

    for (const row of rows) {
      const changes: Partial<typeof routineExercises.$inferInsert> = {};
      if (row.nextWeight !== null && row.nextWeightUnit !== null && row.nextWeightUnit !== to) {
        const converted = convertWeight(row.nextWeight, row.nextWeightUnit, to);
        changes.nextWeight =
          row.equipment === 'barbell' ? nearestLoadable(converted, bar, plates) : roundToHalf(converted);
        changes.nextWeightUnit = to;
      }
      if (row.incrementUnit !== to) {
        changes.increment = convertIncrement(row.increment, row.incrementUnit, to);
        changes.incrementUnit = to;
      }
      if (Object.keys(changes).length > 0) {
        tx.update(routineExercises).set(changes).where(eq(routineExercises.id, row.id)).run();
      }
    }

    setSetting(tx, 'unit', to);
  });
}
