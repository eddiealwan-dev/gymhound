import { readTesterEntries, testerQuestionsDue, testerQuestionsFor, testerText } from './testerQuestions';

describe('the tester questions (R593, R594)', () => {
  it('asks the loop questions after the 2nd workout and the trust questions after the 3rd, and nothing else', () => {
    expect(testerQuestionsFor(1)).toBeNull();
    expect(testerQuestionsFor(2)).toEqual(['Did you lift the weight it showed today?', 'If not, why not?', 'Did anything about the rule confuse you?']);
    expect(testerQuestionsFor(3)?.[2]).toBe('Would you pay to set your own rule on your own routines?');
    expect(testerQuestionsFor(4)).toBeNull();
  });

  it('asks each set once', () => {
    const answered = [{ workout: 2, at: 0, answers: [] }];
    expect(testerQuestionsDue(2, [])).toBe(true);
    expect(testerQuestionsDue(2, answered)).toBe(false);
    expect(testerQuestionsDue(3, answered)).toBe(true);
    expect(testerQuestionsDue(5, [])).toBe(false);
  });

  it('reads the stored list loosely and shares it as text', () => {
    const entry = { workout: 3, at: Date.UTC(2026, 9, 20, 12), answers: [{ question: 'Did the rule help you? How?', answer: 'Yes, no guessing' }, { question: 'Q', answer: '' }] };
    expect(readTesterEntries([entry, { workout: 'x' }, null])).toEqual([entry]);
    const text = testerText([entry], 'en-US');
    expect(text).toContain('After the 3rd workout · Oct 20, 2026');
    expect(text).toContain('Did the rule help you? How?\nYes, no guessing');
    expect(text).toContain('Q\n(no answer)');
    expect(testerText([])).toContain('No answers yet.');
  });
});
