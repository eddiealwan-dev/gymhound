import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { Keyboard, Pressable, View } from 'react-native';
import { listLifts } from '../../db/repositories/liftsRepo';
import type { LiftSummary } from '../../db/repositories/liftsRepo';
import { dayTitle } from '../../domain/dates';
import { words } from '../../domain/search';
import { useFocusedDbQuery } from '../../state/dataVersion';
import { flushAll } from '../../state/draftFlush';
import { deviceLocale } from '../body/BodyLog';
import { Button } from '../Button';
import { Body, Label } from '../Text';
import { useTheme } from '../ThemeProvider';

/** How many lifts Stats shows before **All lifts ›** (R172). */
const SECTION_LIMIT = 5;

/** "1 session", "12 sessions". */
export function sessionCount(n: number): string {
  return `${n} ${n === 1 ? 'session' : 'sessions'}`;
}

const unit = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** "1 minute 30 seconds", "25 minutes", "1 hour 5 minutes": a time in words. */
function spokenTime(hours: number, minutes: number, seconds: number): string {
  const parts: string[] = [];
  if (hours > 0) parts.push(unit(hours, 'hour'));
  if (minutes > 0) parts.push(unit(minutes, 'minute'));
  if (seconds > 0 || parts.length === 0) parts.push(unit(seconds, 'second'));
  return parts.join(' ');
}

/**
 * A set or record as VoiceOver should say it: "185 lb by 5", "minus 20 lb by 8", "bodyweight by 12", "45 seconds",
 * "1 minute 30 seconds", "5 km, 25 minutes".
 */
export function spokenLift(text: string): string {
  return text
    .replace(/ × /g, ' by ')
    .replace(/−/g, 'minus ')
    .replace(/ · /g, ', ')
    .replace(/\bBW\b/g, 'bodyweight')
    .replace(/\b(\d+):(\d{2})(?::(\d{2}))?\b/g, (_m, a: string, b: string, c: string | undefined) =>
      c === undefined ? spokenTime(0, Number(a), Number(b)) : spokenTime(Number(a), Number(b), Number(c)),
    )
    .replace(/\b(\d+)s\b/g, (_m, n: string) => unit(Number(n), 'second'));
}

/** Every word of `query` starts some word of `name` ("sq" finds "Back squat"); an empty query matches every name. */
export function liftNameMatches(name: string, query: string): boolean {
  const nameWords = words(name);
  return words(query).every((q) => nameWords.some((w) => w.startsWith(q)));
}

/** Opens a lift's trend, records and sessions. */
export function openLift(exerciseId: string) {
  flushAll();
  Keyboard.dismiss();
  router.push(`/lift/${exerciseId}`);
}

/**
 * A lift on Stats and on Lifts: its name (Body 600) over muted "{day} · {n} sessions", a chevron, at least 44pt tall;
 * the line wraps at a large text size. Opens the lift.
 */
export function LiftRow({ lift, today, locale }: { lift: LiftSummary; today: string; locale: string }) {
  const { colors } = useTheme();
  const day = dayTitle(lift.lastDate, today, locale);
  const count = sessionCount(lift.sessionCount);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${lift.name}, ${day}, ${count}`}
      onPress={() => openLift(lift.exerciseId)}
      style={({ pressed }) => ({
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Body weight={600}>{lift.name}</Body>
        <Body muted>{`${day} · ${count}`}</Body>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function openAll() {
  flushAll();
  router.push('/lifts');
}

/**
 * Stats → Lifts (R172): the five lifts trained most recently, each opening its chart and records, and a quiet
 * **All lifts ›** when there are more. With none, a muted line says how they appear. It reads only while Stats is in
 * sight (R185).
 */
export function LiftsSection({ today }: { today: string }): ReactElement | null {
  const lifts = useFocusedDbQuery(listLifts);
  const locale = deviceLocale();
  return (
    <View>
      <Label style={{ marginBottom: 8 }}>Lifts</Label>
      {lifts.length === 0 ? (
        <Body muted>Finish a workout and your lifts show here.</Body>
      ) : (
        <View>
          {lifts.slice(0, SECTION_LIMIT).map((lift) => (
            <LiftRow key={lift.exerciseId} lift={lift} today={today} locale={locale} />
          ))}
        </View>
      )}
      {lifts.length > SECTION_LIMIT ? (
        // A quiet button steps back by its padding, so its label lines up with the rows' edge.
        <View style={{ alignSelf: 'flex-start', marginLeft: -20, marginTop: 4 }}>
          <Button label="All lifts ›" variant="quiet" accessibilityLabel="All lifts" onPress={openAll} />
        </View>
      ) : null}
    </View>
  );
}
