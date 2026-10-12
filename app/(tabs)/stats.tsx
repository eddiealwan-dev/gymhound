import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { toLocalDate } from '../../src/domain/dates';
import { Screen } from '../../src/ui/Screen';
import { BodySection } from '../../src/ui/stats/BodySection';
import { CheckInCard } from '../../src/ui/stats/CheckInCard';
import { LiftsSection } from '../../src/ui/stats/LiftsSection';
import { PhotosRow } from '../../src/ui/stats/PhotosRow';
import { StepsCard } from '../../src/ui/stats/StepsCard';
import { WeekCard } from '../../src/ui/stats/WeekCard';
import { Label, ScreenTitle } from '../../src/ui/Text';

/**
 * Stats (§8.9, R172), top to bottom: the weekly check-in, This week, Lifts, Steps (iPhone), Body and Progress photos,
 * then the footer. Sections are 32pt apart, as Settings groups; a section with nothing to show draws nothing and leaves
 * no gap. `today` is read again each time Stats comes into sight, so a screen left open past midnight moves on a day.
 */
export default function Stats() {
  const [today, setToday] = useState(() => toLocalDate(Date.now()));
  useFocusEffect(
    useCallback(() => {
      setToday(toLocalDate(Date.now()));
    }, []),
  );

  return (
    <Screen footer>
      <ScreenTitle>Stats</ScreenTitle>
      <View style={{ gap: 32, marginTop: 24 }}>
        <CheckInCard today={today} />
        <WeekCard today={today} />
        <LiftsSection today={today} />
        <StepsCard />
        <View>
          <Label style={{ marginBottom: 8 }}>Body</Label>
          <BodySection />
        </View>
        <PhotosRow today={today} />
      </View>
    </Screen>
  );
}
