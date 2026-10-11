import { and, desc, eq } from 'drizzle-orm';
import { BODY_KINDS, type BodyEntry, type BodyKind, type BodyUnit, unitFitsKind } from '../../domain/body';
import { toLocalDate } from '../../domain/dates';
import type { MeasurementKind, MeasurementUnit, WeightUnit } from '../../domain/types';
import { newId } from '../ids';
import { bodyweight, measurements } from '../schema';
import type { Db } from '../types';

// Bodyweight lives in the `bodyweight` table (0000); the seven measurements in `measurements` (0006). Every entry
// keeps the unit it was logged in (R112); screens convert for charts with `dailySeries`.

function assertUnit(kind: BodyKind, unit: BodyUnit): void {
  if (!unitFitsKind(kind, unit)) throw new Error(`${unit} is not a unit for ${kind}`);
}

function listBodyweight(db: Db, limit?: number): BodyEntry[] {
  const q = db.select().from(bodyweight).orderBy(desc(bodyweight.measuredAt), desc(bodyweight.id));
  const rows = limit === undefined ? q.all() : q.limit(limit).all();
  return rows.map((r) => ({
    id: r.id,
    kind: 'bodyweight',
    localDate: r.localDate,
    measuredAt: r.measuredAt,
    value: r.weight,
    unit: r.unit,
  }));
}

function listMeasurements(db: Db, kind: MeasurementKind, limit?: number): BodyEntry[] {
  const q = db
    .select()
    .from(measurements)
    .where(eq(measurements.kind, kind))
    .orderBy(desc(measurements.measuredAt), desc(measurements.id));
  const rows = limit === undefined ? q.all() : q.limit(limit).all();
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    localDate: r.localDate,
    measuredAt: r.measuredAt,
    value: r.value,
    unit: r.unit,
  }));
}

/** Every entry of one kind, newest first (several a day are all listed, R115). */
export function listBodyEntries(db: Db, kind: BodyKind): BodyEntry[] {
  return kind === 'bodyweight' ? listBodyweight(db) : listMeasurements(db, kind);
}

/** Each kind's newest entry; kinds with no entry are left out. */
export function latestBodyEntries(db: Db): Partial<Record<BodyKind, BodyEntry>> {
  const out: Partial<Record<BodyKind, BodyEntry>> = {};
  for (const kind of BODY_KINDS) {
    const [entry] = kind === 'bodyweight' ? listBodyweight(db, 1) : listMeasurements(db, kind, 1);
    if (entry) out[kind] = entry;
  }
  return out;
}

/** Logs a value for today (R115: no back-dating): local_date is the local day of `now`. Returns the new id. */
export function addBodyEntry(db: Db, kind: BodyKind, value: number, unit: BodyUnit, now: number): string {
  assertUnit(kind, unit);
  const id = newId();
  const localDate = toLocalDate(now);
  if (kind === 'bodyweight') {
    db.insert(bodyweight).values({ id, localDate, measuredAt: now, weight: value, unit: unit as WeightUnit }).run();
  } else {
    db.insert(measurements)
      .values({ id, kind, localDate, measuredAt: now, value, unit: unit as MeasurementUnit })
      .run();
  }
  return id;
}

/** Changes an entry's value and unit; its date and time stay. Only touches an entry of `kind`. */
export function updateBodyEntry(db: Db, kind: BodyKind, id: string, value: number, unit: BodyUnit): void {
  assertUnit(kind, unit);
  if (kind === 'bodyweight') {
    db.update(bodyweight).set({ weight: value, unit: unit as WeightUnit }).where(eq(bodyweight.id, id)).run();
  } else {
    db.update(measurements)
      .set({ value, unit: unit as MeasurementUnit })
      .where(and(eq(measurements.id, id), eq(measurements.kind, kind)))
      .run();
  }
}

/** Deletes an entry of `kind`. */
export function deleteBodyEntry(db: Db, kind: BodyKind, id: string): void {
  if (kind === 'bodyweight') {
    db.delete(bodyweight).where(eq(bodyweight.id, id)).run();
  } else {
    db.delete(measurements)
      .where(and(eq(measurements.id, id), eq(measurements.kind, kind)))
      .run();
  }
}
