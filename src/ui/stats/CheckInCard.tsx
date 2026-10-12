import { Ionicons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import { type ReactElement, useCallback } from 'react';
import { Keyboard, Platform, Pressable, View } from 'react-native';
import { checkInReport, type CheckInReport } from '../../db/repositories/analyticsRepo';
import { isPhotoFileName } from '../../db/repositories/exercisePhotosRepo';
import { progressPhotosSince } from '../../db/repositories/progressPhotosRepo';
import { getSettings } from '../../db/repositories/settingsRepo';
import type { Db } from '../../db/types';
import { bodyUnit, formatBodyValue } from '../../domain/body';
import { mondayOf } from '../../domain/dates';
import type { WeightUnit } from '../../domain/types';
import { formatVolume } from '../../domain/volume';
import { type CheckIn, GROUP_LABELS } from '../../domain/weeklyAnalytics';
import { fileUri, pathFromUri } from '../../platform/snapshots/fileUri';
import { useFocusedDbQuery } from '../../state/dataVersion';
import { flushAll } from '../../state/draftFlush';
import { BodyQuickEntry, deviceLocale, formatEntryDate } from '../body/BodyLog';
import { Body, Label } from '../Text';
import { useTheme } from '../ThemeProvider';

/** The documents folder's progress photo folder (R181). */
const PROGRESS_FOLDER = 'progress-photos';

/**
 * True when the named progress photo is in `progress-photos/` in the documents folder. A restored snapshot can name a
 * file that isn't on this phone, and such a photo is not counted (R181). Never true in the browser; never throws.
 * Task 12's `progressPhotoExists` (src/platform/progressPhotoFiles.ts) does the same and can replace this at merge.
 */
export function progressPhotoFileExists(fileName: string): boolean {
  if (Platform.OS === 'web' || !isPhotoFileName(fileName)) return false;
  try {
    return new File(fileUri(`${pathFromUri(Paths.document.uri)}/${PROGRESS_FOLDER}/${fileName}`)).exists;
  } catch {
    return false;
  }
}

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

/** Last week's lines (R180), each muted; empty parts are left out. */
function reviewLines(checkIn: CheckIn, unit: WeightUnit, locale: string): string[] {
  const out: string[] = [];
  out.push(
    checkIn.sessions === 0
      ? 'No workouts.'
      : `${count(checkIn.sessions, 'session', 'sessions')} · ${count(checkIn.hardSets, 'hard set', 'hard sets')} · ${formatVolume(checkIn.volume, unit, locale)}`,
  );
  if (checkIn.prs > 0) out.push(count(checkIn.prs, 'personal best', 'personal bests'));
  out.push(bodyweightLine(checkIn, unit));
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
        progressPhotosSince(db, mondayOf(today)).some((p) => p.localDate <= today && progressPhotoFileExists(p.fileName));
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
        <Body weight={600} accessibilityRole="header" style={{ marginBottom: 4 }}>
          This week
        </Body>
        {todo.bodyweight ? (
          <StaticRow done text="Bodyweight logged" />
        ) : (
          <View style={{ paddingBottom: 8 }}>
            <StaticRow done={false} text="Log your bodyweight" />
            {/* Lined up with the row's words, past the mark. It announces "Logged …" itself, so the row needs no live region. */}
            <View style={{ marginLeft: 34 }}>
              <BodyQuickEntry kind="bodyweight" unit={bodyUnit('bodyweight', unit)} />
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
