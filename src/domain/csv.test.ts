import {
  buildWorkoutCsvRows,
  csvField,
  isoWithOffset,
  neutraliseFormula,
  prKinds,
  toCsv,
  WORKOUT_CSV_COLUMNS,
  type WorkoutCsvSet,
} from './csv';

describe('csvField', () => {
  it('leaves a plain field alone', () => {
    expect(csvField('Bench press')).toBe('Bench press');
  });

  it('quotes a field with a comma', () => {
    expect(csvField('Push, pull')).toBe('"Push, pull"');
  });

  it('quotes a field with a quote and doubles the quote', () => {
    expect(csvField('the "good" bar')).toBe('"the ""good"" bar"');
  });

  it('quotes a field with a line feed or a carriage return', () => {
    expect(csvField('elbows in\nslow down')).toBe('"elbows in\nslow down"');
    expect(csvField('elbows in\r\nslow down')).toBe('"elbows in\r\nslow down"');
    expect(csvField('a\rb')).toBe('"a\rb"');
  });

  it('gives an empty field for null', () => {
    expect(csvField(null)).toBe('');
  });

  it('writes numbers as they are', () => {
    expect(csvField(82.5)).toBe('82.5');
    expect(csvField(0)).toBe('0');
    expect(csvField(-3)).toBe('-3');
  });
});

describe('neutraliseFormula (R47)', () => {
  it('prefixes an apostrophe to text that starts with - + = or @', () => {
    expect(neutraliseFormula('- elbows in')).toBe("'- elbows in");
    expect(neutraliseFormula('+5 lb next time')).toBe("'+5 lb next time");
    expect(neutraliseFormula('=ok')).toBe("'=ok");
    expect(neutraliseFormula('@home')).toBe("'@home");
  });

  it('prefixes text that starts with a tab or a carriage return', () => {
    expect(neutraliseFormula('\tslow down')).toBe("'\tslow down");
    expect(neutraliseFormula('\rslow down')).toBe("'\rslow down");
  });

  it('leaves other text and empty text alone', () => {
    expect(neutraliseFormula('elbows in')).toBe('elbows in');
    expect(neutraliseFormula('elbows in - slow')).toBe('elbows in - slow');
    expect(neutraliseFormula('')).toBe('');
  });

  it('still lets csvField quote a guarded value that holds a comma', () => {
    expect(csvField(neutraliseFormula('- a, b'))).toBe(`"'- a, b"`);
  });
});

describe('toCsv', () => {
  it('starts with a UTF-8 BOM and joins the header and rows with CRLF', () => {
    expect(toCsv(['a', 'b'], [['x', 1], [null, 'y,z']])).toBe('﻿a,b\r\nx,1\r\n,"y,z"');
  });

  it('is only the BOM and the header with no rows', () => {
    expect(toCsv(['a', 'b'], [])).toBe('﻿a,b');
  });
});

describe('WORKOUT_CSV_COLUMNS', () => {
  it('is the 21 spec §11 columns in order', () => {
    expect(WORKOUT_CSV_COLUMNS.join(', ')).toBe(
      'workout_id, date, started_at, finished_at, workout, routine, routine_day, day_mark, exercise, exercise_id, set_number, set_type, weight, weight_unit, reps, rpe, duration_s, distance, distance_unit, pr, exercise_note',
    );
    expect(WORKOUT_CSV_COLUMNS).toHaveLength(21);
  });
});

describe('isoWithOffset', () => {
  const MS = Date.UTC(2026, 9, 10, 22, 57, 59, 401);

  it('writes UTC with +00:00', () => {
    expect(isoWithOffset(MS, 0)).toBe('2026-10-10T22:57:59.401+00:00');
  });

  it('writes the local time behind UTC with a negative offset', () => {
    expect(isoWithOffset(MS, -300)).toBe('2026-10-10T17:57:59.401-05:00');
  });

  it('writes the local time ahead of UTC with a half-hour offset, crossing midnight', () => {
    expect(isoWithOffset(MS, 330)).toBe('2026-10-11T04:27:59.401+05:30');
  });

  it('pads milliseconds and every part', () => {
    expect(isoWithOffset(Date.UTC(2026, 0, 2, 3, 4, 5, 6), 0)).toBe('2026-01-02T03:04:05.006+00:00');
  });
});

describe('prKinds', () => {
  it('is empty for no flags', () => {
    expect(prKinds(0)).toBe('');
  });

  it('names one kind', () => {
    expect(prKinds(1)).toBe('heaviest');
  });

  it('joins several kinds with |', () => {
    expect(prKinds(5)).toBe('heaviest|e1rm');
    expect(prKinds(15)).toBe('heaviest|reps|e1rm|hold');
  });
});

describe('buildWorkoutCsvRows', () => {
  const START = Date.UTC(2026, 9, 10, 14, 0);
  const base: WorkoutCsvSet = {
    workoutId: 'w1',
    localDate: '2026-10-10',
    startedAt: START,
    finishedAt: START + 3_600_000,
    workoutName: 'Push A',
    routineName: 'Push/pull/legs',
    routineDayName: 'Push A',
    dayMark: 'normal',
    workoutExerciseId: 'we1',
    exerciseName: 'Bench press',
    exerciseId: 'barbell-bench-press',
    setType: 'working',
    weight: 135,
    weightUnit: 'lb',
    reps: 5,
    rpe: null,
    durationS: null,
    distance: null,
    distanceUnit: null,
    prFlags: 0,
    exerciseNote: null,
  };

  it('writes every column in order, with times at the offset the device had then', () => {
    const [row] = buildWorkoutCsvRows([{ ...base, prFlags: 1, rpe: 8, exerciseNote: 'pause, then press' }], () => -300);

    expect(row).toEqual([
      'w1',
      '2026-10-10',
      '2026-10-10T09:00:00.000-05:00',
      '2026-10-10T10:00:00.000-05:00',
      'Push A',
      'Push/pull/legs',
      'Push A',
      'normal',
      'Bench press',
      'barbell-bench-press',
      1,
      'working',
      135,
      'lb',
      5,
      8,
      null,
      null,
      null,
      'heaviest',
      'pause, then press',
    ]);
    expect(row).toHaveLength(WORKOUT_CSV_COLUMNS.length);
  });

  it('numbers each set within its own set type in that exercise', () => {
    const rows = buildWorkoutCsvRows(
      [
        { ...base, setType: 'warmup' },
        { ...base, setType: 'warmup' },
        { ...base, setType: 'working' },
        { ...base, setType: 'working' },
        { ...base, setType: 'drop' },
        { ...base, workoutExerciseId: 'we2', setType: 'working' },
      ],
      () => 0,
    );

    expect(rows.map((r) => [r[11], r[10]])).toEqual([
      ['warmup', 1],
      ['warmup', 2],
      ['working', 1],
      ['working', 2],
      ['drop', 1],
      ['working', 1],
    ]);
  });

  it('asks for the offset at each time on its own, so a DST change between start and finish shows', () => {
    const offsets = new Map([
      [base.startedAt, -240],
      [base.finishedAt!, -300],
    ]);
    const [row] = buildWorkoutCsvRows([base], (ms) => offsets.get(ms)!);

    expect(row[2]).toBe('2026-10-10T10:00:00.000-04:00');
    expect(row[3]).toBe('2026-10-10T10:00:00.000-05:00');
  });

  it('guards the free-text columns against formulas, and leaves numbers, ids and codes alone (R47)', () => {
    const [row] = buildWorkoutCsvRows(
      [
        {
          ...base,
          workoutName: '=Push',
          routineName: '+PPL',
          routineDayName: '@gym',
          exerciseName: '-Dips',
          exerciseId: '-dips',
          weight: -20,
          exerciseNote: '- elbows in, slow',
        },
      ],
      () => 0,
    );

    expect(row[4]).toBe("'=Push");
    expect(row[5]).toBe("'+PPL");
    expect(row[6]).toBe("'@gym");
    expect(row[8]).toBe("'-Dips");
    expect(row[9]).toBe('-dips');
    expect(row[12]).toBe(-20);
    expect(row[20]).toBe("'- elbows in, slow");
    expect(toCsv(WORKOUT_CSV_COLUMNS, [row]).split('\r\n')[1].endsWith(`,"'- elbows in, slow"`)).toBe(true);
  });

  it('keeps a null routine, routine day and note empty, and plain text as it is', () => {
    const [row] = buildWorkoutCsvRows([{ ...base, routineName: null, routineDayName: null, exerciseNote: null }], () => 0);
    const [plain] = buildWorkoutCsvRows([{ ...base, exerciseNote: 'elbows in' }], () => 0);

    expect([row[5], row[6], row[20]]).toEqual([null, null, null]);
    expect([plain[4], plain[8], plain[20]]).toEqual(['Push A', 'Bench press', 'elbows in']);
  });
});
