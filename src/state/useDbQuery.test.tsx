import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { Db } from '../db/types';
import { bumpData, useDbQuery } from './dataVersion';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('expo-router', () => ({ useFocusEffect: () => {} }));
const mockDb = {} as Db;
jest.mock('../db/DbProvider', () => ({ useDb: () => mockDb }));

type Row = { id: string; name: string };
let rows: Row[];
/** A fresh copy on every read, as SQLite gives. */
const read = jest.fn((_db: Db) => rows.map((r) => ({ ...r })));

let seen: Row[][];
function Probe({ share }: { share: boolean }) {
  seen.push(useDbQuery(read, { share }));
  return null;
}

let tree: ReactTestRenderer;
beforeEach(() => {
  rows = [
    { id: 'a', name: 'Bench press' },
    { id: 'b', name: 'Squat' },
  ];
  seen = [];
  read.mockClear();
});
afterEach(() => act(() => tree.unmount()));

describe('useDbQuery with share (R400)', () => {
  it('hands back the same result when a read again finds nothing changed', () => {
    act(() => void (tree = create(<Probe share />)));
    act(() => bumpData());
    expect(read).toHaveBeenCalledTimes(2);
    expect(seen.at(-1)).toBe(seen[0]);
  });

  it('keeps the rows that did not change, and gives the changed one anew', () => {
    act(() => void (tree = create(<Probe share />)));
    rows = [rows[0], { id: 'b', name: 'Back squat' }];
    act(() => bumpData());
    const [first, last] = [seen[0], seen.at(-1)!];
    expect(last).not.toBe(first);
    expect(last[0]).toBe(first[0]);
    expect(last[1]).toEqual({ id: 'b', name: 'Back squat' });
  });

  it('without share, every read is new, as before', () => {
    act(() => void (tree = create(<Probe share={false} />)));
    act(() => bumpData());
    expect(seen.at(-1)).not.toBe(seen[0]);
    expect(seen.at(-1)).toEqual(seen[0]);
  });
});
