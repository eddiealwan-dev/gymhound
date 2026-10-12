/** @jest-environment node */
import { getSettings } from '../db/repositories/settingsRepo';
import { seededDb } from '../db/testing/fixtures';
import { trialStatus } from '../domain/trial';
import { setTrialPreset, startTrialIfDue } from './trial';

jest.mock('../platform/entitlements', () => ({ entitlementsFor: () => ({ refreshTrial: jest.fn() }) }));

const NOW = Date.UTC(2026, 9, 12, 15);

describe('the Developer trial control (R492, R551)', () => {
  it('Free acts as a phone whose trial is long over: a finished workout never starts one, and no ended notice', () => {
    const db = seededDb();
    setTrialPreset(db, 'free', NOW);
    expect(trialStatus(getSettings(db).trialStartedAt, NOW).phase).toBe('ended');
    expect(getSettings(db).trialEndedSeen).toBe(true);
    expect(startTrialIfDue(db, 'w1', NOW + 60_000)).toBe(false);
    expect(trialStatus(getSettings(db).trialStartedAt, NOW + 60_000).phase).toBe('ended');
  });

  it('Not started starts at the next finished workout, as a new install does', () => {
    const db = seededDb();
    setTrialPreset(db, 'not_started', NOW);
    expect(startTrialIfDue(db, 'w1', NOW)).toBe(true);
    expect(trialStatus(getSettings(db).trialStartedAt, NOW).phase).toBe('active');
  });
});
