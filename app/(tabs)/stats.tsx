import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { mondayOf, toLocalDate } from '../../src/domain/dates';
import { Screen } from '../../src/ui/Screen';
import { BodySection } from '../../src/ui/stats/BodySection';
import { CheckInCard } from '../../src/ui/stats/CheckInCard';
import { LiftsSection } from '../../src/ui/stats/LiftsSection';
import { PhotosRow } from '../../src/ui/stats/PhotosRow';
import { StepsCard } from '../../src/ui/stats/StepsCard';
import { WeekCard } from '../../src/ui/stats/WeekCard';
import { Body, Label, ScreenTitle } from '../../src/ui/Text';
import { useDb } from '../../src/db/DbProvider';
import { getSettings } from '../../src/db/repositories/settingsRepo';
import { weekCardFor } from '../../src/db/repositories/shareCardsRepo';
import type { WeekCardModel } from '../../src/domain/shareCards';
import { announce } from '../../src/platform/announce';
import { deviceLocale } from '../../src/platform/locale';
import { useShareCard } from '../../src/ui/share/useShareCard';
import { WeekShareCard } from '../../src/ui/share/WeekShareCard';

const SHARE_FAILED = "Couldn't make the image. Try again.";

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

  const db = useDb();
  const card = useShareCard();
  const [shareFailed, setShareFailed] = useState(false);
  /** This week as an image (§18.17, R449): drawn under the page, captured and handed to the share sheet. */
  const shareWeek = () => {
    setShareFailed(false);
    let model: WeekCardModel;
    try {
      model = weekCardFor(db, mondayOf(today), today, getSettings(db).unit, deviceLocale());
    } catch (error) {
      console.warn('GymHound could not read the week for its card.', error);
      setShareFailed(true);
      announce(SHARE_FAILED);
      return;
    }
    card
      .share((ref, onReady) => <WeekShareCard ref={ref} model={model} onReady={onReady} />)
      .then((result) => {
        if (result !== 'shared') throw new Error(`Sharing is ${result}.`);
      })
      .catch((error: unknown) => {
        console.warn('GymHound could not share the week.', error);
        setShareFailed(true);
        announce(SHARE_FAILED);
      });
  };

  return (
    <Screen footer under={card.holder}>
      <ScreenTitle>Stats</ScreenTitle>
      <View style={{ gap: 32, marginTop: 24 }}>
        <CheckInCard today={today} />
        <View style={{ gap: 8 }}>
          <WeekCard today={today} onShare={shareWeek} />
          {shareFailed ? <Body muted>{SHARE_FAILED}</Body> : null}
        </View>
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
