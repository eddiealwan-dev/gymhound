import { router } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { listLifts } from '../../src/db/repositories/liftsRepo';
import { toLocalDate } from '../../src/domain/dates';
import { deviceLocale } from '../../src/platform/locale';
import { useFocusedDbQuery } from '../../src/state/dataVersion';
import { BackLink } from '../../src/ui/BackLink';
import { Screen } from '../../src/ui/Screen';
import { LiftRow, liftNameMatches } from '../../src/ui/stats/LiftsSection';
import { Body, Display } from '../../src/ui/Text';
import { fonts } from '../../src/ui/theme';
import { useTheme } from '../../src/ui/ThemeProvider';

/** Back where it was opened from; a link opened with no history goes to /stats. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.navigate('/stats');
}

/**
 * Every lift with history (R172), a hidden tab route under Stats: a search by the start of a word in the name, then a
 * row per lift, most recently trained first, each opening its chart and records. No footer (§18.4).
 */
export default function Lifts() {
  const { colors } = useTheme();
  const lifts = useFocusedDbQuery(listLifts);
  const [query, setQuery] = useState('');
  const today = toLocalDate(Date.now());
  const locale = deviceLocale();
  const shown = lifts.filter((lift) => liftNameMatches(lift.name, query));

  return (
    <Screen>
      <BackLink label="Stats" onPress={leave} />
      <Display>Lifts</Display>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search your lifts"
        placeholderTextColor={colors.textMuted}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        clearButtonMode="while-editing"
        accessibilityLabel="Search your lifts"
        style={{
          marginTop: 24,
          minHeight: 48,
          paddingHorizontal: 12,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          color: colors.text,
          fontFamily: fonts.body400,
          fontSize: 16,
        }}
      />
      <View style={{ marginTop: 16 }}>
        {lifts.length === 0 ? (
          <Body muted>Finish a workout and your lifts show here.</Body>
        ) : shown.length === 0 ? (
          <Body muted>{`No lift called ${query.trim()}.`}</Body>
        ) : (
          shown.map((lift) => <LiftRow key={lift.exerciseId} lift={lift} today={today} locale={locale} />)
        )}
      </View>
    </Screen>
  );
}
