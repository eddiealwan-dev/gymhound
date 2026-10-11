import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';
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
  { value: '1M', label: '1M', spoken: '1M, last month' },
  { value: '3M', label: '3M', spoken: '3M, last 3 months' },
  { value: '1Y', label: '1Y', spoken: '1Y, last year' },
];

/** The well's padding, the gap between segments and each segment's padding beside its words (DESIGN.md). */
const WELL_PADDING = 4;
const SEGMENT_GAP = 4;
const SEGMENT_PADDING = 4;

/**
 * How many segments go in a row: four (all of them) when each, sharing the well's inner width, still fits the longest
 * label; else two; else one. Returns each segment's width too, whole points so a row never wraps on a rounding error.
 */
export function segmentLayout(wellWidth: number, longestLabel: number, count: number): { perRow: number; width: number } {
  const inner = wellWidth - 2 * WELL_PADDING;
  const candidates = [...new Set([count, 2, 1])].filter((n) => n >= 1 && n <= count);
  for (const perRow of candidates) {
    const width = Math.floor((inner - SEGMENT_GAP * (perRow - 1)) / perRow);
    if (width - 2 * SEGMENT_PADDING >= longestLabel || perRow === 1) return { perRow, width };
  }
  return { perRow: 1, width: Math.floor(inner) };
}

/**
 * Choices in one well (DESIGN.md segmented control): 44pt segments, the chosen one filled with the text colour, read
 * out by `spoken` when given. With `fit`, the segments are laid out from the measured width of the well and of each
 * label (hidden copies at the same size, each as wide as its words up to the well's width), so a word never breaks: all in a row, else two, else one.
 */
function Segments<T extends string>({
  label,
  options,
  value,
  onChange,
  fit,
}: {
  label: string;
  options: { value: T; label: string; spoken?: string }[];
  value: T;
  onChange: (value: T) => void;
  /** A testID prefix; set it to lay the segments out by measured width. */
  fit?: string;
}) {
  const { colors } = useTheme();
  const [wellWidth, setWellWidth] = useState(0);
  const [labelWidths, setLabelWidths] = useState<Record<string, number>>({});
  const measured = fit !== undefined && wellWidth > 0 && options.every((o) => labelWidths[o.label] !== undefined);
  const layout = measured ? segmentLayout(wellWidth, Math.max(...options.map((o) => labelWidths[o.label])), options.length) : null;
  const labelStyle = { textAlign: 'center' as const };

  return (
    <View>
      {fit !== undefined && (
        <View
          testID={`${fit}-probes`}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, opacity: 0 }}
        >
          {options.map((option) => (
            <Body
              key={option.value}
              testID={`${fit}-probe-${option.label}`}
              weight={600}
              style={{ alignSelf: 'flex-start' }}
              onLayout={(e) => {
                const width = Math.ceil(e.nativeEvent.layout.width);
                setLabelWidths((widths) => (widths[option.label] === width ? widths : { ...widths, [option.label]: width }));
              }}
            >
              {option.label}
            </Body>
          ))}
        </View>
      )}
      <View
        testID={fit !== undefined ? `${fit}-well` : undefined}
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        onLayout={fit !== undefined ? (e) => setWellWidth(Math.floor(e.nativeEvent.layout.width)) : undefined}
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          backgroundColor: colors.surfaceRaised,
          borderRadius: 12,
          padding: WELL_PADDING,
          gap: SEGMENT_GAP,
        }}
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
              style={[
                {
                  minHeight: 44,
                  paddingHorizontal: SEGMENT_PADDING,
                  borderRadius: 9,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected ? colors.text : 'transparent',
                },
                layout !== null ? { width: layout.width } : { flexGrow: 1, flexBasis: 0 },
              ]}
            >
              <Body weight={600} style={[labelStyle, { color: selected ? colors.bg : colors.text }]}>
                {option.label}
              </Body>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

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
      <Segments label="Chart measure" options={METRICS} value={metric} onChange={setMetric} fit="chart-measure" />
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
