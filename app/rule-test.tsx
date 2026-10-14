import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Share, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDb } from '../src/db/DbProvider';
import { getSettings, setSetting } from '../src/db/repositories/settingsRepo';
import { readRuleTestEntries, ruleTestScreens, ruleTestText, RULE_TEST_QUESTIONS, RULE_TEST_SECONDS } from '../src/domain/ruleTest';
import { deviceLocale } from '../src/platform/locale';
import { bumpData, useDbQuery } from '../src/state/dataVersion';
import { Button } from '../src/ui/Button';
import { ModalHeader } from '../src/ui/ModalHeader';
import { RuleTestCard } from '../src/ui/RuleTestCard';
import { Screen } from '../src/ui/Screen';
import { Body, Label } from '../src/ui/Text';
import { useTheme } from '../src/ui/ThemeProvider';
import { fonts } from '../src/ui/theme';

type Step = { kind: 'start' } | { kind: 'screen'; index: number } | { kind: 'questions' } | { kind: 'saved' };

const leave = () => (router.canGoBack() ? router.back() : router.replace('/settings'));

function Field({ value, onChangeText, label, placeholder }: { value: string; onChangeText: (t: string) => void; label: string; placeholder?: string }) {
  const { colors } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      accessibilityLabel={label}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
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
  );
}

/**
 * The rule test (§18.28, R581–R584), from Settings → Developer: Start, then the three still screens for five seconds
 * each, then the five questions to read out and type the answers to. Save keeps them on the phone, one entry per
 * person; Share answers sends every entry as text. Lifters never see it: Developer shows only where the debug unlock is
 * allowed.
 */
export default function RuleTest() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const db = useDb();
  const screens = useMemo(() => ruleTestScreens(), []);
  const entries = readRuleTestEntries(useDbQuery(getSettings).ruleTestAnswers);
  const [step, setStep] = useState<Step>({ kind: 'start' });
  const [who, setWho] = useState('');
  const [answers, setAnswers] = useState<string[]>(() => RULE_TEST_QUESTIONS.map(() => ''));

  // Each screen moves on by itself after five seconds; the last goes to the questions.
  useEffect(() => {
    if (step.kind !== 'screen') return;
    const timer = setTimeout(() => {
      setStep(step.index + 1 < screens.length ? { kind: 'screen', index: step.index + 1 } : { kind: 'questions' });
    }, RULE_TEST_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [step, screens.length]);

  const start = () => {
    setAnswers(RULE_TEST_QUESTIONS.map(() => ''));
    setStep({ kind: 'screen', index: 0 });
  };

  const save = () => {
    const name = who.trim() || `Tester ${entries.length + 1}`;
    setSetting(db, 'ruleTestAnswers', [...entries, { who: name, at: Date.now(), answers }]);
    bumpData();
    setWho('');
    setStep({ kind: 'saved' });
  };

  const share = () => {
    Share.share({ message: ruleTestText(entries, deviceLocale()) }).catch((error: unknown) => console.warn('GymHound could not share the rule test.', error));
  };

  if (step.kind === 'screen') {
    const screen = screens[step.index];
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 32, paddingBottom: insets.bottom, paddingHorizontal: 16 }}>
        <View style={{ width: '100%', maxWidth: 512, alignSelf: 'center', gap: 24 }}>
          <Label>{`${step.index + 1} of ${screens.length}`}</Label>
          <RuleTestCard screen={screen} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <Screen>
        <ModalHeader title="Rule test" onClose={leave} />
        {step.kind === 'start' ? (
          <View style={{ gap: 16 }}>
            <Body>
              {`Hand the phone over. They see ${screens.length} screens for ${RULE_TEST_SECONDS} seconds each, then you ask ${RULE_TEST_QUESTIONS.length} questions and type what they say.`}
            </Body>
            <Field value={who} onChangeText={setWho} label="Who is taking it" placeholder={`Name, or leave it as Tester ${entries.length + 1}`} />
            <Button label="Start" onPress={start} />
            {entries.length > 0 ? (
              <>
                <Body muted>{`${entries.length} ${entries.length === 1 ? 'person has' : 'people have'} taken it.`}</Body>
                <Button label="Share answers" variant="secondary" onPress={share} />
              </>
            ) : null}
          </View>
        ) : step.kind === 'questions' ? (
          <View style={{ gap: 16 }}>
            <Body muted>Ask each one out loud. Type what they say, in their words.</Body>
            {RULE_TEST_QUESTIONS.map((q, i) => (
              <View key={q} style={{ gap: 8 }}>
                <Body weight={600}>{`${i + 1}. ${q}`}</Body>
                <Field value={answers[i]} onChangeText={(t) => setAnswers((a) => a.map((x, j) => (j === i ? t : x)))} label={q} />
              </View>
            ))}
            <Button label="Save answers" onPress={save} />
            <Button label="Show the screens again" variant="secondary" onPress={() => setStep({ kind: 'screen', index: 0 })} />
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            <Body>{`Saved. ${entries.length} ${entries.length === 1 ? 'person has' : 'people have'} taken it.`}</Body>
            <Button label="Next person" onPress={() => setStep({ kind: 'start' })} />
            <Button label="Share answers" variant="secondary" onPress={share} />
          </View>
        )}
      </Screen>
    </View>
  );
}
