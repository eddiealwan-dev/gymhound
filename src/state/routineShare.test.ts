// Ruling R-t9a: a Duplicate of a program copies its slots as they are; the editor's limits apply on the next save, and
// sharing a copy with a target past what a code carries says why it can't.
import { eq } from 'drizzle-orm';
import { Share } from 'react-native';
import { duplicateRoutine, routineToDraft, saveRoutine } from '../db/repositories/routinesRepo';
import { routineDays, routineExercises } from '../db/schema';
import { seededDb } from '../db/testing/fixtures';
import { shareRoutine } from './routineShare';

const mockShare = jest.spyOn(Share, 'share').mockImplementation(async () => ({ action: Share.sharedAction }));
jest.mock('../platform/runtime', () => ({ storeUrl: () => 'https://example.com/gymhound' }));

const NOW = new Date(2026, 9, 12, 9, 0).getTime();

describe('a Duplicate of a program past the share limits (ruling R-t9a)', () => {
  beforeEach(() => mockShare.mockClear());

  it('copies the long run as it is, and your own routine saves it unchanged (ruling R-t11a)', async () => {
    const db = seededDb();
    const copy = duplicateRoutine(db, 'program-hybrid-athlete', NOW);
    const days = db.select({ id: routineDays.id }).from(routineDays).where(eq(routineDays.routineId, copy)).all();
    const rows = days.flatMap((d) => db.select().from(routineExercises).where(eq(routineExercises.routineDayId, d.id)).all());
    const longRun = rows.find((r) => r.exerciseId === 'long-run')!;
    expect(longRun).toMatchObject({ repMin: 3600, repMax: 5400 });
    const saved = saveRoutine(db, routineToDraft(db, copy)!, NOW + 1);
    const savedDays = db.select({ id: routineDays.id }).from(routineDays).where(eq(routineDays.routineId, saved)).all();
    const savedRun = savedDays
      .flatMap((d) => db.select().from(routineExercises).where(eq(routineExercises.routineDayId, d.id)).all())
      .find((r) => r.exerciseId === 'long-run')!;
    expect(savedRun).toMatchObject({ repMin: 3600, repMax: 5400 });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(shareRoutine(db, saved)).resolves.toBe('too_long');
    warn.mockRestore();
  });

  it('says why it cannot be shared, and opens no share sheet', async () => {
    const db = seededDb();
    const copy = duplicateRoutine(db, 'program-hybrid-athlete', NOW);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(shareRoutine(db, copy)).resolves.toBe('too_long');
    expect(mockShare).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a copy within the limits shares as before', async () => {
    const db = seededDb();
    const copy = duplicateRoutine(db, 'program-barbell-foundations', NOW);
    await expect(shareRoutine(db, copy)).resolves.toBe('shared');
    expect(mockShare).toHaveBeenCalled();
  });
});
