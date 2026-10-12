import type { ReactElement } from 'react';
import { View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import {
  TRIAL_ENDED_LINE,
  TRIAL_STARTED_LINE,
  trialChipSpoken,
  trialChipText,
  trialEndingLine,
  trialPitchLine,
  trialSettingsLine,
} from '../../domain/trial';
import { deviceLocale } from '../../platform/locale';
import { useEntitlementsState, useTrialStatus } from '../../platform/entitlements';
import { dismissTrialEnded } from '../../state/trial';
import { Button } from '../Button';
import { Body } from '../Text';
import { useTheme } from '../ThemeProvider';
import { useOpenPaywall } from './openPaywall';

/**
 * The 7-day full access trial's lines (§18.19), each calm and plain: no red, no countdown pressure, and nothing that
 * says it will charge or renew, because it doesn't (R488). Every one shows only while the trial is what gives Pro: a
 * store purchase or the debug unlock hides them.
 */

/** Settings → GymHound Pro, while the trial runs (R485): "Full access trial · 5 days left" and **See Pro**. */
export function TrialSettingsLine(): ReactElement | null {
  const status = useTrialStatus();
  const { trialOnly } = useEntitlementsState();
  const openPaywall = useOpenPaywall();
  const line = trialSettingsLine(status);
  if (!trialOnly || line === null) return null;
  return (
    <View style={{ gap: 8 }}>
      <Body>{line}</Body>
      <Body muted>Every program, your own routines, saved workouts and Fuel, free until it ends. Nothing is charged.</Body>
      <Button label="See Pro" onPress={openPaywall} />
    </View>
  );
}

/** Fuel's header while the trial runs (R486): a small muted chip, "Trial · 5 days left". */
export function TrialChip(): ReactElement | null {
  const { colors } = useTheme();
  const status = useTrialStatus();
  const { trialOnly } = useEntitlementsState();
  const text = trialChipText(status);
  if (!trialOnly || text === null) return null;
  return (
    <View
      accessible
      accessibilityLabel={trialChipSpoken(status) ?? text}
      style={{ alignSelf: 'flex-start', borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}
    >
      <Body muted style={{ fontSize: 13 }}>
        {text}
      </Body>
    </View>
  );
}

/**
 * Train's trial line (R487, R490): on the trial's last two days, one muted line saying when it ends and what locks; and
 * once after it has ended (with no Pro), a line with **See Pro** and **Not now**, answered for good either way.
 */
export function TrainTrialNotice(): ReactElement | null {
  const db = useDb();
  const status = useTrialStatus();
  const { isPro, trialOnly } = useEntitlementsState();
  const openPaywall = useOpenPaywall();
  if (trialOnly) {
    const ending = trialEndingLine(status, deviceLocale());
    return ending === null ? null : <Body muted>{ending}</Body>;
  }
  if (status.phase !== 'ended' || isPro || status.endedSeen) return null;
  return (
    <View testID="trial-ended" style={{ gap: 12 }}>
      <Body muted>{TRIAL_ENDED_LINE}</Body>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button
          label="See Pro"
          variant="secondary"
          size="compact"
          onPress={() => {
            dismissTrialEnded(db);
            openPaywall();
          }}
        />
        <Button label="Not now" variant="quiet" size="compact" onPress={() => dismissTrialEnded(db)} />
      </View>
    </View>
  );
}

/** The finish summary of the workout that started the trial (R486): one line and **See what's included**. */
export function TrialStartedNotice({ workoutId }: { workoutId: string }): ReactElement | null {
  const { startWorkoutId } = useTrialStatus();
  const { trialOnly } = useEntitlementsState();
  const openPaywall = useOpenPaywall();
  if (!trialOnly || startWorkoutId !== workoutId) return null;
  return (
    <View testID="trial-started" style={{ gap: 12 }}>
      <Body>{TRIAL_STARTED_LINE}</Body>
      <View style={{ alignItems: 'flex-start', padding: 4, margin: -4 }}>
        <Button label="See what's included" variant="secondary" size="compact" onPress={openPaywall} />
      </View>
    </View>
  );
}

/** The top of the Pro pitch (R489): where the trial stands for this person, in one muted line. */
export function TrialPitchLine(): ReactElement | null {
  const status = useTrialStatus();
  return <Body muted>{trialPitchLine(status)}</Body>;
}
