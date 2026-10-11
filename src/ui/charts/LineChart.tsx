import { useState } from 'react';
import type { ReactElement } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { formatChartDate, placeLabels, plotSeries } from '../../domain/chart';
import type { ChartPoint } from '../../domain/chart';
import { fonts } from '../theme';
import { useTheme } from '../ThemeProvider';

/** Dots are 4px across. Exported so phase 6's marked points can match. */
export const DOT_RADIUS = 2;
/** A hollow (marked) point's ring: a little larger than a dot, so it reads as a ring (R173). */
const RING_RADIUS = DOT_RADIUS + 1.5;
const RING_STROKE = 1.5;
/** A placed mark label's bottom sits this far above its dot (R173). */
const LABEL_RISE = 6;
/** The axis labels' line height at the default text size; it grows with the phone's text size. */
const LABEL_LINE_HEIGHT = 16;
const LABEL_GAP = 8;
/** The y labels take at most this share of the width; a longer label shrinks to fit on its line. */
const LABEL_COLUMN_MAX = '30%';

export type LineChartProps = {
  /**
   * The series, any order; drawn oldest to newest. Filter it to a range with `pointsInRange` first. A point with
   * `hollow` is drawn as a ring, and one with a `label` may carry that word over it (R173); body charts pass neither.
   */
  points: readonly ChartPoint[];
  /** A y label or value as shown, unit included: (182) => "182 lb". */
  formatValue: (v: number) => string;
  /** For the dates under the axis ("3 Aug", or "Aug 3" in en-US). */
  locale: string;
  /** The plot's height in points; 180 by default. */
  height?: number;
  /** What VoiceOver reads for the whole chart: `chartSummary` gives the series in words, `markedSummary` the marks. */
  accessibilityLabel: string;
  /** What fills a hollow point's ring: the colour behind the chart. The card colour (`surface`) by default. */
  dotFill?: string;
};

function byDate(a: ChartPoint, b: ChartPoint): number {
  return a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : 0;
}

/**
 * A hand-drawn line chart (R116): a 2px line in the text colour with a dot at each point, a hairline grid at the y
 * ticks with their labels on the left, and the first and last dates under the axis. One point is a dot only; no points
 * draws nothing, so the screen shows its own empty text. The whole chart is one accessible element. Never red.
 * Marked points (R173): a hollow point is a ring; labels are placed newest first, 56pt apart, centred over their dots,
 * and the plot keeps a label line clear above the top tick when any is placed.
 */
export function LineChart({ points, formatValue, locale, height = 180, accessibilityLabel, dotFill }: LineChartProps): ReactElement | null {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  // Each mark label's measured width, keyed by its point and word, so it can be centred over its dot.
  const [labelWidths, setLabelWidths] = useState<Record<string, number>>({});
  // Oldest first, as plotSeries lays the dots out (both sorts are stable), so a dot's index is its point's.
  const drawable = points.filter((pt) => Number.isFinite(pt.value)).sort(byDate);
  if (drawable.length === 0) return null;

  const anyHollow = drawable.some((pt) => pt.hollow === true);
  const anyLabel = drawable.some((pt) => pt.label != null && pt.label !== '');
  // Room inside the plot: the dots stay whole at the sides, and half a (scaled) label line above the top tick and below
  // the bottom one, so the y labels centred on those ticks stay inside the chart at any text size. With a mark label,
  // one more label line and its rise over a ring sit above the top tick.
  const lineHeight = LABEL_LINE_HEIGHT * fontScale;
  const halfLine = Math.ceil(lineHeight / 2);
  const side = (anyHollow ? Math.ceil(RING_RADIUS + RING_STROKE / 2) : DOT_RADIUS) + 1;
  const labelRoom = anyLabel ? lineHeight + LABEL_RISE + Math.ceil(RING_RADIUS) : 0;
  const inset = { left: side, right: side, top: halfLine + labelRoom, bottom: halfLine };
  const plotted = plotSeries(drawable, { width: Math.max(width, 1), height, ...inset });
  // Top to bottom, each label's gap after the one above, so its middle lands on its tick.
  let above = 0;
  const yLabels = [...plotted.yTicks]
    .sort((a, b) => a.y - b.y)
    .map((tick) => {
      const top = tick.y - lineHeight / 2;
      const marginTop = top - above;
      above = top + lineHeight;
      return { value: tick.value, marginTop };
    });
  const days = drawable.map((pt) => pt.localDate);
  const dates = days[0] === days[days.length - 1] ? [days[0]] : [days[0], days[days.length - 1]];
  const smallText = { fontFamily: fonts.body400, fontSize: 12, lineHeight: LABEL_LINE_HEIGHT, color: colors.textMuted, fontVariant: ['tabular-nums' as const] };
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.floor(e.nativeEvent.layout.width));

  const placed = anyLabel ? placeLabels(plotted.dots.map((dot, i) => ({ x: dot.x, y: dot.y, label: drawable[i].label ?? null }))) : [];
  const marks = placed.map(({ index, label }) => {
    const dot = plotted.dots[index];
    const key = `${index}:${label}`;
    const measured = labelWidths[key];
    const radius = drawable[index].hollow ? RING_RADIUS : DOT_RADIUS;
    // Its bottom LABEL_RISE over the dot, kept inside the plot; centred across once its width is known.
    const top = Math.min(Math.max(dot.y - radius - LABEL_RISE - lineHeight, 0), height - lineHeight);
    const left = measured === undefined ? 0 : Math.min(Math.max(dot.x - measured / 2, 0), Math.max(width - measured, 0));
    return { key, label, top, left, shown: measured !== undefined };
  });
  const measureLabel = (key: string) => (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setLabelWidths((prev) => (prev[key] === w ? prev : { ...prev, [key]: w }));
  };

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      {/* The y labels, top to bottom. Each is a line tall and sits in the flow of the column, its top margin putting its
          middle on its tick: a label in a zero-height box vanished on the web, and in-flow labels give the column its
          width. */}
      <View style={{ height, maxWidth: LABEL_COLUMN_MAX, marginRight: LABEL_GAP, alignItems: 'flex-end' }}>
        {yLabels.map(({ value, marginTop }) => (
          <Text key={value} style={[smallText, { height: lineHeight, marginTop, flexShrink: 0, textAlign: 'right' }]} numberOfLines={1} adjustsFontSizeToFit>
            {formatValue(value)}
          </Text>
        ))}
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ height }} onLayout={onLayout}>
          {width > 0 && (
            <Svg width={width} height={height}>
              {plotted.yTicks.map((tick) => (
                <Line key={tick.value} x1={0} x2={width} y1={tick.y} y2={tick.y} stroke={colors.border} strokeWidth={1} />
              ))}
              {plotted.path !== '' && (
                <Path d={plotted.path} stroke={colors.text} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              )}
              {plotted.dots.map((dot, i) =>
                drawable[i].hollow ? (
                  <Circle key={i} cx={dot.x} cy={dot.y} r={RING_RADIUS} stroke={colors.text} strokeWidth={RING_STROKE} fill={dotFill ?? colors.surface} />
                ) : (
                  <Circle key={i} cx={dot.x} cy={dot.y} r={DOT_RADIUS} fill={colors.text} />
                ),
              )}
            </Svg>
          )}
          {/* Mark labels over their dots. Each is first laid out unseen at the left edge, where it has the whole width
              for its one line, then centred over its dot and kept inside the plot. */}
          {width > 0 &&
            marks.map(({ key, label, top, left, shown }) => (
              <Text
                key={key}
                onLayout={measureLabel(key)}
                numberOfLines={1}
                style={[smallText, { position: 'absolute', top, left, height: lineHeight, opacity: shown ? 1 : 0 }]}
              >
                {label}
              </Text>
            ))}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: dates.length === 1 ? 'center' : 'space-between', marginTop: 4 }}>
          {dates.map((d) => (
            <Text key={d} style={smallText}>
              {formatChartDate(d, locale)}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}
