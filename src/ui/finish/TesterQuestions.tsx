import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import { finishedWorkoutCount } from '../../db/repositories/onboardingRepo';
import { getSettings, setSetting } from '../../db/repositories/settingsRepo';
import type { Db } from '../../db/types';
import { readTesterEntries, testerQuestionsDue, testerQuestionsFor } from '../../domain/testerQuestions';
import { isTesterBuild } from '../../platform/runtime';
import { bumpData } from '../../state/dataVersion';
import { Button } from '../Button';
import { Body, Label } from '../Text';
import { useTheme } from '../ThemeProvider';
import { fonts } from '../theme';

/** The questions due after this finish, or null: read once, when the summary opens. */
function dueQuestions(db: Db): { workout: number; questions: readonly string[] } | null {
  const workout = finishedWorkoutCount(db);
  const questions = testerQuestionsFor(workout);
  if (questions === null || !testerQuestionsDue(workout, readTesterEntries(getSettings(db).testerAnswers))) return null;
  return { workout, questions };
}

/**
 * The tester questions on the finish summary (§18.28, R593): only in a tester build, after the 2nd and 3rd finished
 * workouts, each set once. Save keeps the answers on the phone; Settings → Test answers shares them.
 */
export function TesterQuestions() {
  if (!isTesterBuild()) return null;
  return <TesterQuestionsCard />;
}

function TesterQuestionsCard() {
  const db = useDb();
  const { colors } = useTheme();
  const [due] = useState(() => {
    try {
      return dueQuestions(db);
    } catch (error) {
      console.warn('GymHound could not read the tester questions.', error);
      return null;
    }
  });
  const [answers, setAnswers] = useState<string[]>(() => due?.questions.map(() => '') ?? []);
  const [saved, setSaved] = useState(false);
  if (due === null) return null;

  const save = () => {
    const entries = readTesterEntries(getSettings(db).testerAnswers);
    const entry = { workout: due.workout, at: Date.now(), answers: due.questions.map((question, i) => ({ question, answer: answers[i] ?? '' })) };
    setSetting(db, 'testerAnswers', [...entries, entry]);
    bumpData();
    setSaved(true);
  };

  return (
    <View style={{ gap: 12, paddingTop: 16, marginTop: 16, borderTopWidth: 1, borderTopColor: colors.border }}>
      <Label>A few questions for the test</Label>
      {saved ? (
        <Body>Thanks. Your answers are saved. Send them from Settings, under Test answers.</Body>
      ) : (
        <>
          {due.questions.map((question, i) => (
            <View key={question} style={{ gap: 8 }}>
              <Body weight={600}>{question}</Body>
              <TextInput
                value={answers[i]}
                onChangeText={(text) => setAnswers((all) => all.map((a, j) => (j === i ? text : a)))}
                accessibilityLabel={question}
                multiline
                style={{
                  minHeight: 44,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.borderStrong,
                  backgroundColor: colors.surface,
                  color: colors.text,
                  fontFamily: fonts.body400,
                  fontSize: 16,
                }}
              />
            </View>
          ))}
          <Button label="Save answers" variant="secondary" onPress={save} />
        </>
      )}
    </View>
  );
}
