import { router } from 'expo-router';
import { type ReactElement, type ReactNode, useCallback } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { workoutDatesSince } from '../../db/repositories/analyticsRepo';
import { listBodyEntries } from '../../db/repositories/bodyRepo';
import { getFuelTargets, isTrainingDay, listEntries } from '../../db/repositories/foodLogRepo';
import { getSettings } from '../../db/repositories/settingsRepo';
import type { Db } from '../../db/types';
import { dailySeries, formatBodyValue, type BodyUnit } from '../../domain/body';
import { chartSummary, pointsInRange, rangeChange } from '../../domain/chart';
import { mondayOf, shiftDay } from '../../domain/dates';
import { caloriesSpoken, dayTotals, fuelNumber, gramsSpoken, targetsFor } from '../../domain/fuel';
import { widgetInfo, type WidgetId, weekLabel, weekSpoken, workoutsPerWeek } from '../../domain/profile';
import { useIsPro } from '../../platform/entitlements';
import { useFocusedDbQuery } from '../../state/dataVersion';
import { Button } from '../Button';
import { LineChart } from '../charts/LineChart';
import { useLargeText } from '../largeText';
import { useOpenPaywall } from '../pro/openPaywall';
import { Body, Display, Label, Num } from '../Text';
import { useTheme } from '../ThemeProvider';

/** How many weeks Workouts per week shows, as Strong's does. */
const WEEKS = 8;
/** The bars' tallest height. */
const BAR_AREA = 96;

/**
 * A widget's card (R567): the muted group word ("Activity") over its title, ⋯ on the right for its options, then what
 * it shows. The card is the Stats cards' surface.
 */
function WidgetCard({ id, onOptions, children }: { id: WidgetId; onOptions: () => void; children: ReactNode }): ReactElement {
  const { colors } = useTheme();
  const info = widgetInfo(id);
  return (
    <View testID={`widget-${id}`} style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          {/* The group word is not a heading of its own: the title is. */}
          <Label accessibilityRole="text">{info.group}</Label>
          <Display weight={700} accessibilityRole="header" style={{ fontSize: 22 }}>
            {info.title}
          </Display>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Options for ${info.title}`}
          onPress={onOptions}
          hitSlop={4}
          style={({ pressed }) => ({ width: 44, height: 44, margin: -10, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.textMuted} />
        </Pressable>
      </View>
      {children}
    </View>
  );
}

/** A quiet link at a widget's foot to the screen it summarises ("Stats ›"). */
function OpenLink({ label, readAs, onPress }: { label: string; readAs: string; onPress: () => void }) {
  return (
    // 4pt inset keeps the button's hit slop inside the card.
    <View style={{ flexDirection: 'row', padding: 4, margin: -4, marginLeft: -12 }}>
      <Button label={`${label} ›`} accessibilityLabel={readAs} variant="quiet" size="compact" onPress={onPress} />
    </View>
  );
}

// ---------------------------------------------------------------- Workouts per week

/**
 * Workouts per week (R567, free): a bar for each of the last 8 weeks, Monday to Sunday, this week's in the text colour
 * and the rest muted, its count over each bar and the week's Monday under it. A weekly goal draws a dashed line across
 * and the line over the chart says how this week stands against it.
 */
export function WorkoutsPerWeekWidget({ today, goal, locale, onOptions }: { today: string; goal: number | null; locale: string; onOptions: () => void }) {
  const { colors } = useTheme();
  const read = useCallback((db: Db) => workoutsPerWeek(workoutDatesSince(db, shiftDay(mondayOf(today), -7 * (WEEKS - 1))), today, WEEKS), [today]);
  const weeks = useFocusedDbQuery(read);
  const top = Math.max(1, goal ?? 0, ...weeks.map((w) => w.count));
  const thisWeek = weeks[weeks.length - 1].count;
  const times = (n: number) => `${n} ${n === 1 ? 'workout' : 'workouts'}`;
  const standing = goal === null ? `${times(thisWeek)} this week` : `${thisWeek} of ${goal} this week${thisWeek >= goal ? ', goal met' : ''}`;
  const spoken = `Last ${WEEKS} weeks: ${weeks.map((w) => `${weekSpoken(w.weekStart, locale)}, ${w.count}`).join('; ')}.${goal === null ? '' : ` Goal ${goal} a week.`}`;
  return (
    <WidgetCard id="workouts_per_week" onOptions={onOptions}>
      <Body>{standing}</Body>
      <View accessible accessibilityRole="image" accessibilityLabel={spoken} style={{ gap: 6 }}>
        <View style={{ height: BAR_AREA + 20, flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
          {weeks.map((w, i) => {
            const now = i === weeks.length - 1;
            return (
              <View key={w.weekStart} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                <Num weight={600} maxFontSizeMultiplier={1.3} numberOfLines={1} style={{ fontSize: 14, color: now ? colors.text : colors.textMuted }}>
                  {w.count > 0 ? String(w.count) : ''}
                </Num>
                <View
                  testID={`week-bar-${w.weekStart}`}
                  style={{
                    width: '70%',
                    maxWidth: 28,
                    // An empty week keeps a hairline, so the row reads as weeks.
                    height: w.count === 0 ? 2 : Math.max(4, Math.round((w.count / top) * BAR_AREA)),
                    borderRadius: 4,
                    backgroundColor: now ? colors.text : colors.textMuted,
                    opacity: now ? 1 : 0.6,
                  }}
                />
              </View>
            );
          })}
          {goal !== null ? (
            // Drawn, not a dashed border: iOS draws a dashed border only on all four sides.
            <Svg testID="weekly-goal-line" pointerEvents="none" width="100%" height={2} style={{ position: 'absolute', left: 0, right: 0, bottom: Math.round((goal / top) * BAR_AREA) }}>
              <Line x1="0" y1="1" x2="100%" y2="1" stroke={colors.red} strokeWidth={1.5} strokeDasharray="4 4" />
            </Svg>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {weeks.map((w) => (
            <Body key={w.weekStart} muted numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.3} style={{ flex: 1, textAlign: 'center', fontSize: 11 }}>
              {weekLabel(w.weekStart, locale)}
            </Body>
          ))}
        </View>
      </View>
      <OpenLink label="History" readAs="Open History" onPress={() => router.navigate('/history')} />
    </WidgetCard>
  );
}

// ---------------------------------------------------------------- Daily macros

type Today = { totals: ReturnType<typeof dayTotals>; target: ReturnType<typeof targetsFor> | null };

/** The share of a target eaten, 0 to 1, capped full; a 0 target is full once anything is eaten (R147). */
const shareOf = (eaten: number, target: number) => (target > 0 ? Math.min(1, Math.max(0, eaten / target)) : eaten > 0 ? 1 : 0);

/** The ring's size, and how far its words grow: they sit inside it. */
const RING = 76;
const RING_STROKE = 7;
const RING_TEXT_MAX_SCALE = 1.2;
/** The small amounts under the bars grow some, not as far as body text: they share a row (Round 13 note). */
const AMOUNT_MAX_SCALE = 1.6;

/** Calories: eaten in a ring against the target, capped full, and "of 2,600" under it. */
function KcalRing({ eaten, target, locale }: { eaten: number; target: number; locale: string }) {
  const { colors } = useTheme();
  const r = (RING - RING_STROKE) / 2;
  const length = 2 * Math.PI * r;
  return (
    <View accessible accessibilityLabel={`Calories, ${caloriesSpoken(eaten, locale)} of ${caloriesSpoken(target, locale)}`} style={{ alignItems: 'center', gap: 4 }}>
      <View style={{ width: RING, height: RING, alignItems: 'center', justifyContent: 'center' }}>
        {/* The track is drawn in the strong border colour: in the raised surface's it all but vanished on the card, so
            with nothing logged yet there seemed to be no ring (Round 14). */}
        <Svg width={RING} height={RING} style={{ position: 'absolute', top: 0, left: 0 }}>
          <Circle testID="kcal-ring-track" cx={RING / 2} cy={RING / 2} r={r} stroke={colors.borderStrong} strokeOpacity={0.6} strokeWidth={RING_STROKE} fill="none" />
          <Circle
            testID="kcal-ring"
            cx={RING / 2}
            cy={RING / 2}
            r={r}
            stroke={colors.text}
            strokeWidth={RING_STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${length} ${length}`}
            strokeDashoffset={length * (1 - shareOf(eaten, target))}
            transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
          />
        </Svg>
        <Num weight={700} maxFontSizeMultiplier={RING_TEXT_MAX_SCALE} numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 17, maxWidth: RING - 2 * RING_STROKE - 6 }}>
          {fuelNumber(eaten, locale)}
        </Num>
        <Body muted maxFontSizeMultiplier={RING_TEXT_MAX_SCALE} style={{ fontSize: 11 }}>
          kcal
        </Body>
      </View>
      <Body muted maxFontSizeMultiplier={AMOUNT_MAX_SCALE} style={{ fontSize: 12, fontVariant: ['tabular-nums'] }}>
        {`of ${fuelNumber(target, locale)}`}
      </Body>
    </View>
  );
}

/**
 * One macro beside the ring: its name, a 4pt bar of eaten against the target (none without a target), and "94 / 180 g"
 * in small type under it. At large text it takes the card's whole width, name and amount on a line over the bar.
 */
function MacroColumn({ name, eaten, target, locale, wide }: { name: string; eaten: number; target: number | null; locale: string; wide: boolean }) {
  const { colors } = useTheme();
  const amount = target === null ? `${fuelNumber(eaten, locale)} g` : `${fuelNumber(eaten, locale)} / ${fuelNumber(target, locale)} g`;
  const spoken = target === null ? `${name}, ${gramsSpoken(eaten, locale)}` : `${name}, ${fuelNumber(eaten, locale)} of ${gramsSpoken(target, locale)}`;
  const bar = (
    <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.surfaceRaised, overflow: 'hidden' }}>
      {target !== null ? <View testID={`widget-macro-${name.toLowerCase()}`} style={{ height: 4, backgroundColor: colors.text, width: `${shareOf(eaten, target) * 100}%` }} /> : null}
    </View>
  );
  if (wide) {
    return (
      <View accessible accessibilityLabel={spoken} style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: 12 }}>
          <Body weight={600}>{name}</Body>
          <Body muted style={{ fontVariant: ['tabular-nums'] }}>
            {amount}
          </Body>
        </View>
        {bar}
      </View>
    );
  }
  return (
    <View accessible accessibilityLabel={spoken} style={{ flex: 1, minWidth: 0, gap: 6 }}>
      <Body weight={600} maxFontSizeMultiplier={AMOUNT_MAX_SCALE} numberOfLines={1} style={{ fontSize: 13 }}>
        {name}
      </Body>
      {bar}
      <Body muted maxFontSizeMultiplier={AMOUNT_MAX_SCALE} numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 12, fontVariant: ['tabular-nums'] }}>
        {amount}
      </Body>
    </View>
  );
}

/**
 * Daily macros (R567, Pro): one line, as the owner asked (Round 13): today's calories in a ring against today's target
 * (training or rest day, §7.11), then Protein, Carbs and Fat beside it, each a thin bar with its amount in small type.
 * At large text the ring has its own line and each macro the card's whole width. With no targets, today's totals and
 * **Set targets**. Free or lapsed, what it would show and **See Pro**: food logging is Pro (§9).
 */
export function DailyMacrosWidget({ today, locale, onOptions }: { today: string; locale: string; onOptions: () => void }) {
  const pro = useIsPro();
  // Past 1.3× text the macros go under the ring, each at the card's full width.
  const stacked = useLargeText();
  const openPaywall = useOpenPaywall();
  const read = useCallback(
    (db: Db): Today => {
      const totals = dayTotals(listEntries(db, today));
      const targets = getFuelTargets(db);
      return { totals, target: targets === null ? null : targetsFor(targets, isTrainingDay(db, today)) };
    },
    [today],
  );
  const day = useFocusedDbQuery(read);
  if (!pro) {
    return (
      <WidgetCard id="daily_macros" onOptions={onOptions}>
        <Body muted>{"Today's calories, protein, carbs and fat against your targets, from what you log in Fuel. Part of GymHound Pro."}</Body>
        <View style={{ flexDirection: 'row', padding: 4, margin: -4 }}>
          <Button label="See Pro" variant="secondary" size="compact" onPress={openPaywall} />
        </View>
      </WidgetCard>
    );
  }
  const { totals, target } = day;
  return (
    <WidgetCard id="daily_macros" onOptions={onOptions}>
      {target === null ? (
        <>
          <Body>{`Today: ${fuelNumber(totals.kcal, locale)} kcal · ${fuelNumber(totals.proteinG, locale)} g protein`}</Body>
          <Body muted>No targets yet.</Body>
          <View style={{ flexDirection: 'row', padding: 4, margin: -4 }}>
            <Button label="Set targets" variant="secondary" size="compact" onPress={() => router.push('/fuel-targets')} />
          </View>
        </>
      ) : (
        <View style={{ flexDirection: stacked ? 'column' : 'row', alignItems: stacked ? 'stretch' : 'center', gap: stacked ? 12 : 14 }}>
          <View style={{ alignItems: stacked ? 'flex-start' : 'center' }}>
            <KcalRing eaten={totals.kcal} target={target.kcal} locale={locale} />
          </View>
          <MacroColumn name="Protein" eaten={totals.proteinG} target={target.protein} locale={locale} wide={stacked} />
          <MacroColumn name="Carbs" eaten={totals.carbsG} target={target.carbs} locale={locale} wide={stacked} />
          <MacroColumn name="Fat" eaten={totals.fatG} target={target.fat} locale={locale} wide={stacked} />
        </View>
      )}
      <OpenLink label="Fuel" readAs="Open Fuel" onPress={() => router.navigate('/fuel')} />
    </WidgetCard>
  );
}

// ---------------------------------------------------------------- Body weight

type Weight = { latest: { value: string; date: string } | null; points: { localDate: string; value: number }[]; unit: BodyUnit };

/**
 * Body weight (R567, free): the latest weigh-in in the display unit and the last 3 months' line with its change in
 * words, as the body-weight screen has. None yet: **Log weight**.
 */
export function BodyWeightWidget({ today, locale, onOptions }: { today: string; locale: string; onOptions: () => void }) {
  const read = useCallback(
    (db: Db): Weight => {
      const unit = getSettings(db).unit;
      const series = dailySeries(listBodyEntries(db, 'bodyweight'), unit);
      const last = series[series.length - 1];
      return {
        unit,
        latest: last === undefined ? null : { value: formatBodyValue(last.value, unit), date: last.localDate },
        points: pointsInRange(series, '3M', today),
      };
    },
    [today],
  );
  const weight = useFocusedDbQuery(read);
  const format = (v: number) => formatBodyValue(v, weight.unit);
  const change = rangeChange(weight.points, format, locale);
  const toLog = () => router.push('/body/bodyweight');
  return (
    <WidgetCard id="body_weight" onOptions={onOptions}>
      {weight.latest === null ? (
        <>
          <Body muted>No weigh-ins yet.</Body>
          <View style={{ flexDirection: 'row', padding: 4, margin: -4 }}>
            <Button label="Log weight" variant="secondary" size="compact" onPress={toLog} />
          </View>
        </>
      ) : (
        <>
          <Num weight={700} style={{ fontSize: 32 }}>
            {weight.latest.value}
          </Num>
          {weight.points.length > 1 ? (
            <LineChart points={weight.points} formatValue={format} locale={locale} height={120} accessibilityLabel={`Body weight. ${chartSummary(weight.points, format, locale)}`} />
          ) : null}
          {change !== null ? <Body muted>{change}</Body> : null}
          <OpenLink label="Body weight" readAs="Open Body weight" onPress={toLog} />
        </>
      )}
    </WidgetCard>
  );
}
