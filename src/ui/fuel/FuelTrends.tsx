import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { dailySeries } from '../../db/repositories/foodLogRepo';
import type { FuelMetric } from '../../db/repositories/foodLogRepo';
import type { Db } from '../../db/types';
import { chartSummary } from '../../domain/chart';
import { formatTrendValue, trendPoints, trendSummary } from '../../domain/fuelTrends';
import type { FuelRange } from '../../domain/fuelTrends';
import { useDbQuery } from '../../state/dataVersion';
import { deviceLocale } from '../body/BodyLog';
import { LineChart } from '../charts/LineChart';
import { Body, Label } from '../Text';
import { useTheme } from '../ThemeProvider';

const METRICS: { value: FuelMetric; label: string; unit: 'kcal' | 'g' }[] = [
  { value: 'kcal', label: 'Calories', unit: 'kcal' },
  { value: 'protein', label: 'Protein', unit: 'g' },
  { value: 'carbs', label: 'Carbs', unit: 'g' },
  { value: 'fat', label: 'Fat', unit: 'g' },
];

const RANGES: { value: FuelRange; label: string; spoken: string }[] = [
  { value: '1M', label: '1M', spoken: 'Last month' },
  { value: '3M', label: '3M', spoken: 'Last 3 months' },
  { value: '1Y', label: '1Y', spoken: 'Last year' },
];

/** Past this text size the four measures wrap two to a row, so "Calories" never squeezes. */
const WRAP_FONT_SCALE = 1.15;

/**
 * Choices in one well (DESIGN.md segmented control): 44pt segments, the chosen one filled with the text colour. With
 * `wrap` (large text) they go two to a row.
 */
function Segments<T extends string>({
  label,
  options,
  value,
  onChange,
  wrap = false,
}: {
  label: string;
  options: { value: T; label: string; spoken?: string }[];
  value: T;
  onChange: (value: T) => void;
  wrap?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.surfaceRaised, borderRadius: 12, padding: 4, gap: 4 }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.spoken ?? option.label}
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(option.value)}
            style={{
              flexGrow: 1,
              flexBasis: wrap ? '45%' : 0,
              minHeight: 44,
              paddingHorizontal: 4,
              borderRadius: 9,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? colors.text : 'transparent',
            }}
          >
            <Body weight={600} style={{ color: selected ? colors.bg : colors.text, textAlign: 'center' }}>
              {option.label}
            </Body>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Calories, protein, carbs and fat over 1M, 3M or 1Y (R149): one point per logged day up to yesterday (today's day is
 * not over, so it is left out), the average under the chart, no target line. Draws nothing until a finished day has
 * food logged; with none in the range it says so and keeps the controls.
 */
export function FuelTrends({ today }: { today: string }): ReactElement | null {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const [metric, setMetric] = useState<FuelMetric>('kcal');
  const [range, setRange] = useState<FuelRange>('1M');
  const read = useCallback((db: Db) => dailySeries(db, metric), [metric]);
  const series = useDbQuery(read);
  const locale = deviceLocale();

  // Every logged day has a point in every measure, so this is the same for all four.
  if (!series.some((pt) => pt.localDate < today)) return null;

  const { label, unit } = METRICS.find((m) => m.value === metric)!;
  const points = trendPoints(series, range, today);
  const format = (v: number) => formatTrendValue(v, unit, locale);
  const summary = trendSummary(points, unit, locale);

  return (
    <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 }}>
      <Label>Trends</Label>
      <Segments label="Chart" options={METRICS} value={metric} onChange={setMetric} wrap={fontScale > WRAP_FONT_SCALE} />
      {points.length === 0 ? (
        <Body muted>Nothing logged in this range.</Body>
      ) : (
        <>
          <LineChart points={points} formatValue={format} locale={locale} accessibilityLabel={`${label}. ${chartSummary(points, format, locale)}`} />
          {summary !== null && <Body muted>{summary}</Body>}
        </>
      )}
      <Segments label="Chart range" options={RANGES} value={range} onChange={setRange} />
    </View>
  );
}
