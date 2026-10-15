import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import { formatRest } from '../../domain/dates';
import { clockAt, clockVoiceLabel, idleClock, startVoiceLabel, type WorkPlan, type WorkTimer } from '../../domain/workClock';
import { doneWorkClock, pauseWorkClock, releaseWorkHold, resetWorkClock, resumeWorkClock, startWorkClock } from '../../state/workClockActions';
import { Button } from '../Button';
import { Body, Num } from '../Text';
import { useTheme } from '../ThemeProvider';
import { ClockPanel, ClockPills, ClockTrack } from './ClockPanel';
import { useWorkNow } from './useWorkNow';

type Props = {
  workoutId: string;
  workoutExerciseId: string;
  /** What the clock runs (`workPlanFor`): its kind, its word and its steps. */
  plan: WorkPlan;
  /** This block's stored clock (settings `work_timer`), or null before Start. */
  timer: WorkTimer | null;
  /** Another block's clock is going: one clock at a time, so Start is dimmed. */
  busy: boolean;
};

type Pill = { label: string; readAs: string; primary?: boolean; disabled?: boolean; onPress: () => void };

/**
 * The work clock of a metcon, a run, intervals or an EMOM (Task 7b, t7-design.md): the rest row's twin. A surface panel
 * with a Strong Seam edge, the clock's name in the REST label's role over a Barlow 800 time, compact pills at the right,
 * and a 3pt track that drains as a countdown runs (or fills toward For Time's cap). Everything shown is worked out from
 * the stored start and pauses, never counted, so it survives the phone locking. The time is not pressable, and the clock
 * never ticks a set. Ended, it holds a check and its line at the height it had. At large text the pills drop under the
 * time as one group, as the rest row's do.
 */
export function WorkClock({ workoutId, workoutExerciseId, plan, timer, busy }: Props) {
  const db = useDb();
  const { colors } = useTheme();
  const now = useWorkNow(timer);
  const state = timer === null ? idleClock(plan) : clockAt(timer, now);
  /** The height while it runs, which the ended line keeps so the rows below don't jump. */
  const [runningHeight, setRunningHeight] = useState<number | undefined>(undefined);
  const ended = state.phase === 'ended';

  const pause: Pill = { label: 'Pause', readAs: 'Pause the timer', onPress: () => pauseWorkClock(db) };
  const done: Pill = { label: 'Done', readAs: 'Stop the clock', onPress: () => doneWorkClock(db) };
  const reset: Pill = { label: 'Reset', readAs: 'Reset the timer', onPress: () => resetWorkClock(db) };
  const leadIn = state.label === 'GET READY';
  const pills: Pill[] = (() => {
    switch (state.phase) {
      case 'idle':
        return [{ label: 'Start', readAs: startVoiceLabel(plan), primary: true, disabled: busy, onPress: () => startWorkClock(db, workoutId, workoutExerciseId, plan) }];
      case 'ready':
        return [pause, reset];
      case 'running':
        return [pause, done];
      case 'paused': {
        const resume: Pill = { label: 'Resume', readAs: 'Resume the timer', primary: true, onPress: () => resumeWorkClock(db) };
        return leadIn ? [resume, reset] : [resume, done, reset];
      }
      case 'waiting':
        return [{ label: 'Start', readAs: `Start set ${state.set}`, primary: true, onPress: () => releaseWorkHold(db) }, done];
      case 'ended':
        return [];
    }
  })();

  return (
    <ClockPanel
      onLayout={ended ? undefined : (e) => setRunningHeight(e.nativeEvent.layout.height)}
      minHeight={ended ? runningHeight : undefined}
      margins={{ marginTop: 12, marginBottom: 4 }}
    >
      {ended ? (
        <View
          accessible
          accessibilityLabel={state.endLine ?? ''}
          style={{ flexGrow: 1, flexBasis: 'auto', minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <Ionicons name="checkmark-circle" size={20} color={colors.text} />
          <Body weight={600} style={{ flexShrink: 1 }}>
            {state.endLine}
          </Body>
        </View>
      ) : (
        <>
          <View
            accessible
            accessibilityRole="timer"
            accessibilityLabel={clockVoiceLabel(state, plan)}
            // It takes the width of its text, then grows into what is left, as the rest row's time does.
            style={{ flexGrow: 1, flexBasis: 'auto', minWidth: 0, minHeight: 44, justifyContent: 'center' }}
          >
            <Body weight={600} muted style={{ fontSize: 11, letterSpacing: 0.5 }}>
              {state.label}
            </Body>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 6 }}>
              <Num weight={800} style={{ fontSize: 32 }}>
                {formatRest(state.shown)}
              </Num>
              {state.capS !== null && !leadIn ? (
                <Num weight={600} style={{ fontSize: 17, color: colors.textMuted }}>
                  {`/ ${formatRest(state.capS)}`}
                </Num>
              ) : null}
            </View>
          </View>
          {/* The pills wrap as one group, at the end, and among themselves when even a line of their own is too narrow. */}
          <ClockPills>
            {pills.map((p) => (
              <Button
                key={p.readAs}
                label={p.label}
                variant={p.primary ? 'primary' : 'secondary'}
                size="compact"
                disabled={p.disabled}
                accessibilityLabel={p.readAs}
                onPress={p.onPress}
              />
            ))}
          </ClockPills>
          <ClockTrack fraction={state.fraction} />
        </>
      )}
    </ClockPanel>
  );
}
