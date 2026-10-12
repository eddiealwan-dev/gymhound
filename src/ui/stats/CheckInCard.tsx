import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { type ReactElement, useCallback } from 'react';
import { Keyboard, Platform, Pressable, View } from 'react-native';
import { checkInReport, type CheckInReport } from '../../db/repositories/analyticsRepo';
import { progressPhotosSince } from '../../db/repositories/progressPhotosRepo';
import { getSettings } from '../../db/repositories/settingsRepo';
import type { Db } from '../../db/types';
import { bodyUnit, formatBodyValue } from '../../domain/body';
import { formatEntryDate, mondayOf } from '../../domain/dates';
import type { WeightUnit } from '../../domain/types';
import { formatVolume } from '../../domain/volume';
import { type CheckIn, GROUP_LABELS } from '../../domain/weeklyAnalytics';
import { deviceLocale } from '../../platform/locale';
import { progressPhotoExists } from '../../platform/progressPhotoFiles';
import { useFocusedDbQuery } from '../../state/dataVersion';
import { flushAll } from '../../state/draftFlush';
import { BodyQuickEntry } from '../body/BodyLog';
import { Body, Label } from '../Text';
import { useTheme } from '../ThemeProvider';

/**
 * True when the named progress photo is on this phone (R181): a restored snapshot can name a file that isn't. Never true
 * in the browser, which keeps no progress photos.
 */
const progressPhotoOnPhone = (fileName: string) => Platform.OS !== 'web' && progressPhotoExists(fileName);

/** "1 session", "2 hard sets": a count and its noun, singular for one. */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "Bodyweight 180.8 lb average, −1.2 lb on the week before", or the average alone with nothing the week before. */
function bodyweightLine(checkIn: CheckIn, unit: WeightUnit): string {
  if (checkIn.bodyweightAverage === null) return 'No bodyweight logged.';
  const average = `Bodyweight ${formatBodyValue(checkIn.bodyweightAverage, unit)} average`;
  const change = checkIn.bodyweightChange;
  if (change === null) return average;
  const shown = Number(Math.abs(change).toFixed(1));
  if (shown === 0) return `${average}, the same as the week before`;
  return `${average}, ${change < 0 ? '−' : '+'}${formatBodyValue(shown, unit)} on the week before`;
}

/** "2 sessions · 5 hard sets · 2,600 lb", leaving out a zero part: a cardio-only week reads "1 session". */
function sessionsLine(checkIn: CheckIn, unit: WeightUnit, locale: string): string {
  if (checkIn.sessions === 0) return 'No workouts.';
  const parts = [count(checkIn.sessions, 'session', 'sessions')];
  if (checkIn.hardSets > 0) parts.push(count(checkIn.hardSets, 'hard set', 'hard sets'));
  if (checkIn.volume > 0) parts.push(formatVolume(checkIn.volume, unit, locale));
  return parts.join(' · ');
}

/**
 * Last week's lines (R180), each muted; empty parts are left out. With no workout the groups are left out too: every
 * one would read under.
 */
function reviewLines(checkIn: CheckIn, unit: WeightUnit, locale: string): string[] {
  const out: string[] = [sessionsLine(checkIn, unit, locale)];
  if (checkIn.prs > 0) out.push(count(checkIn.prs, 'personal best', 'personal bests'));
  out.push(bodyweightLine(checkIn, unit));
  if (checkIn.sessions === 0) return out;
  if (checkIn.under.length > 0) out.push(`Under 8 sets: ${checkIn.under.map((g) => GROUP_LABELS[g]).join(', ')}`);
  if (checkIn.over.length > 0) out.push(`Over 24 sets: ${checkIn.over.map((g) => GROUP_LABELS[g]).join(', ')}`);
  return out;
}

/** A 22px mark: a check in the text colour when done, an open muted ring when not. Decorative: the words say which. */
function Mark({ done }: { done: boolean }) {
  const { colors } = useTheme();
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
      {done ? (
        <Ionicons name="checkmark-circle" size={22} color={colors.text} />
      ) : (
        <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.textMuted }} />
      )}
    </View>
  );
}

/** A row of this week's list that is done, or not done and has nothing to open: the mark 12pt before the words. */
function StaticRow({ done, text }: { done: boolean; text: string }) {
  return (
    <View accessible style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Mark done={done} />
      <Body style={{ flex: 1, minWidth: 0 }}>{text}</Body>
    </View>
  );
}

/** A row of this week's list that is not done and opens the screen where it is done. */
function OpenRow({ text, onPress }: { text: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.8 : 1 })}
    >
      <Mark done={false} />
      <Body style={{ flex: 1, minWidth: 0 }}>{text}</Body>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function open(path: '/body/waist' | '/photos') {
  flushAll();
  Keyboard.dismiss();
  router.push(path);
}

type Read = CheckInReport & { unit: WeightUnit };

/**
 * Stats → the weekly check-in (R180), derived and stored nowhere. Last week's review (Monday–Sunday): sessions, hard
 * sets, volume, personal bests, the bodyweight average and its change, and the groups under or over the band. Then
 * this week's three things, which tick themselves when an entry dated this week exists: bodyweight (logged right here),
 * the waist (opens its detail) and a progress photo (opens Progress photos; phone builds only). No reminder, no colour.
 * It reads only while Stats is in sight (R185).
 */
export function CheckInCard({ today }: { today: string }): ReactElement | null {
  const { colors } = useTheme();
  const read = useCallback(
    (db: Db): Read => {
      const unit = getSettings(db).unit;
      const photo =
        Platform.OS !== 'web' &&
        progressPhotosSince(db, mondayOf(today)).some((p) => p.localDate <= today && progressPhotoOnPhone(p.fileName));
      return { unit, ...checkInReport(db, today, unit, photo) };
    },
    [today],
  );
  const { unit, checkIn, todo, hasHistory } = useFocusedDbQuery(read);
  const locale = deviceLocale();
  const onPhone = Platform.OS !== 'web';

  return (
    <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 16 }}>
      <Label>Weekly check-in</Label>
      {checkIn ? (
        <View style={{ gap: 4 }}>
          <Body weight={600} accessibilityRole="header">
            {`Week of ${formatEntryDate(checkIn.weekStart, today, locale)}`}
          </Body>
          {reviewLines(checkIn, unit, locale).map((line) => (
            <Body key={line} muted>
              {line}
            </Body>
          ))}
        </View>
      ) : (
        <Body muted>{hasHistory ? 'No workouts or bodyweight logged last week.' : 'Your first check-in comes after a full week of training.'}</Body>
      )}
      <View>
        {/* Not "This week": the This week card follows this one. */}
        <Body weight={600} accessibilityRole="header" style={{ marginBottom: 4 }}>
          This week's check-in
        </Body>
        {todo.bodyweight ? (
          <StaticRow done text="Bodyweight logged" />
        ) : (
          <View style={{ paddingBottom: 8 }}>
            <StaticRow done={false} text="Log your bodyweight" />
            {/* Lined up with the row's words, past the mark. It announces "Logged …" itself, so the row needs no live region. */}
            <View style={{ marginLeft: 34 }}>
              <BodyQuickEntry
                kind="bodyweight"
                unit={bodyUnit('bodyweight', unit)}
                fieldLabel={`Bodyweight for this week's check-in, ${bodyUnit('bodyweight', unit)}`}
                buttonLabel="Log bodyweight for the check-in"
              />
            </View>
          </View>
        )}
        {todo.waist ? <StaticRow done text="Waist measured" /> : <OpenRow text="Measure your waist" onPress={() => open('/body/waist')} />}
        {onPhone ? (
          todo.photo ? (
            <StaticRow done text="Progress photo taken" />
          ) : (
            <OpenRow text="Take a progress photo" onPress={() => open('/photos')} />
          )
        ) : null}
      </View>
    </View>
  );
}
