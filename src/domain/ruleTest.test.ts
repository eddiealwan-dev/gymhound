import { readRuleTestEntries, ruleTestScreens, ruleTestText, RULE_TEST_QUESTIONS } from './ruleTest';

describe('the rule test screens (R581)', () => {
  const [rule, hold, miss] = ruleTestScreens();

  it('every set hit on a normal day: the rule, the read, and next time up', () => {
    expect(rule.markLabel).toBe('Something off');
    expect(rule.ruleLine).toBe(
      'Hit 8 on every working set on a normal day and next time goes up 5 lb. A marked day holds the weight. Hit 8s on a normal day and next time is 140 lb.',
    );
    expect(rule.finish).toBe('Bench press — next time 140 lb ↑');
  });

  it('Rough sleep and lighter: it holds at the planned weight, not what was lifted', () => {
    expect(hold.markLabel).toBe('Rough sleep');
    expect(hold.ruleLine).toContain('Rough sleep today, so 135 lb holds.');
    expect(hold.sets.map((s) => s.weight)).toEqual([125, 125, 125]);
    expect(hold.finish).toBe('Bench press — holds at 135 lb · Rough sleep');
  });

  it('one rep short on a normal day: it holds too, with no reason', () => {
    expect(miss.markLabel).toBe('Something off');
    expect(miss.sets.map((s) => s.reps)).toEqual([8, 8, 7]);
    expect(miss.finish).toBe('Bench press — holds at 135 lb');
  });
});

describe('the rule test answers (R584)', () => {
  it('drops anything stored that is not an entry', () => {
    const good = { who: 'Sam', at: 0, answers: ['a'] };
    expect(readRuleTestEntries([good, { who: 1 }, null, 'x'])).toEqual([good]);
    expect(readRuleTestEntries(null)).toEqual([]);
  });

  it('shares every question with its answer, and says when one was left blank', () => {
    const text = ruleTestText([{ who: 'Sam', at: Date.UTC(2026, 9, 14, 12), answers: ['It goes up', ' '] }], 'en-US');
    expect(text).toContain('GymHound rule test');
    expect(text).toContain('Sam · Oct 14, 2026');
    expect(text).toContain(`${RULE_TEST_QUESTIONS[0]}\nIt goes up`);
    expect(text).toContain(`${RULE_TEST_QUESTIONS[1]}\n(no answer)`);
    expect(text).toContain(`${RULE_TEST_QUESTIONS[4]}\n(no answer)`);
  });
});
