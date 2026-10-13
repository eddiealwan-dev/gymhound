/** @jest-environment node */
import Database from 'better-sqlite3';
it('loads better-sqlite3 through the junction', () => {
  const db = new Database(':memory:');
  expect(db.prepare('select 1 as one').get()).toEqual({ one: 1 });
});
