import { reviewDecision, type ReviewInput } from './reviewPrompt';

const NOW = Date.UTC(2026, 9, 14, 18);
const DAY = 24 * 60 * 60 * 1000;
const good: ReviewInput = { finishedWorkouts: 3, hadRecord: true, anyRaised: false, anyMarked: false, lastAskedAt: null, now: NOW, tester: false };

describe('when to ask for a rating (R585–R588)', () => {
  it('asks on the third finished workout with a record, or with a weight that went up', () => {
    expect(reviewDecision(good)).toEqual({ ask: true, reason: 'It asked for a rating.' });
    expect(reviewDecision({ ...good, hadRecord: false, anyRaised: true }).ask).toBe(true);
  });

  it('waits for three finished workouts', () => {
    expect(reviewDecision({ ...good, finishedWorkouts: 1 })).toEqual({ ask: false, reason: '1 finished workout. It asks from 3.' });
    expect(reviewDecision({ ...good, finishedWorkouts: 2 }).reason).toBe('2 finished workouts. It asks from 3.');
  });

  it('never asks on a day marked Something off, even with a record', () => {
    expect(reviewDecision({ ...good, anyMarked: true })).toEqual({ ask: false, reason: 'Something off was marked, so not today.' });
  });

  it('needs a record or a weight that went up', () => {
    expect(reviewDecision({ ...good, hadRecord: false })).toEqual({ ask: false, reason: 'No record, and no weight went up.' });
  });

  it('asks again only after 60 days', () => {
    expect(reviewDecision({ ...good, lastAskedAt: NOW - 59 * DAY }).reason).toBe('Asked 59 days ago. It asks again after 60.');
    expect(reviewDecision({ ...good, lastAskedAt: NOW - DAY }).reason).toBe('Asked 1 day ago. It asks again after 60.');
    expect(reviewDecision({ ...good, lastAskedAt: NOW - 60 * DAY }).ask).toBe(true);
  });

  it('never asks in a tester build', () => {
    expect(reviewDecision({ ...good, tester: true })).toEqual({ ask: false, reason: 'A tester build never asks.' });
  });
});
