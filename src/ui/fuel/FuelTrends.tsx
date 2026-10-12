import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';
import { View } from 'react-native';
import { dailySeries } from '../../db/repositories/foodLogRepo';
import type { FuelMetric } from '../../db/repositories/foodLogRepo';
import type { Db } from '../../db/types';
import { chartSummary } from '../../domain/chart';
import { formatTrendValue, trendPoints, trendSummary } from '../../domain/fuelTrends';
import type { FuelRange } from '../../domain/fuelTrends';
import { useDbQuery } from '../../state/dataVersion';
import { deviceLocale } from '../../platform/locale';
import { LineChart } from '../charts/LineChart';
import { Segmented } from '../Segmented';
import { Body, Label } from '../Text';
import { useTheme } from '../ThemeProvider';

const METRICS: { value: FuelMetric; label: string; unit: 'kcal' | 'g' }[] = [
  { value: 'kcal', label: 'Calories', unit: 'kcal' },
  { value: 'protein', label: 'Protein', unit: 'g' },
  { value: 'carbs', label: 'Carbs', unit: 'g' },
  { value: 'fat', label: 'Fat', unit: 'g' },
];

const RANGES: { value: FuelRange; label: string; spoken: string }[] = [
  { value: '1M', label: '1M', spoken: '1M, last month' },
  { value: '3M', label: '3M', spoken: '3M, last 3 months' },
  { value: '1Y', label: '1Y', spoken: '1Y, last year' },
];

/**
 * Calories, protein, carbs and fat over 1M, 3M or 1Y (R149): one point per logged day up to yesterday (today's day is
 * not over, so it is left out), the average as a line of text under the chart (R160), no target line. Draws nothing
 * until a finished day has food logged; with none in the range it says so and keeps the controls.
 */
export function FuelTrends({ today }: { today: string }): ReactElement | null {
  const { colors } = useTheme();
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
      <Segmented label="Chart measure" options={METRICS} value={metric} onChange={setMetric} fit="chart-measure" />
      {points.length === 0 ? (
        <Body muted>Nothing logged in this range.</Body>
      ) : (
        <>
          <LineChart points={points} formatValue={format} locale={locale} accessibilityLabel={`${label}. ${chartSummary(points, format, locale)}`} />
          {summary !== null && <Body muted>{summary}</Body>}
        </>
      )}
      <Segmented label="Chart range" options={RANGES} value={range} onChange={setRange} />
    </View>
  );
}
