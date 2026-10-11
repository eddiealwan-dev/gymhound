import { useState } from 'react';
import type { ReactElement } from 'react';
import { Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { formatChartDate, plotSeries } from '../../domain/chart';
import type { SeriesPoint } from '../../domain/chart';
import { fonts } from '../theme';
import { useTheme } from '../ThemeProvider';

/** Dots are 4px across. Exported so phase 6's marked points can match. */
export const DOT_RADIUS = 2;
/** Room inside the plot: the dots stay whole at the sides, and the top and bottom y labels stay whole above and below. */
const INSET = { left: DOT_RADIUS + 1, right: DOT_RADIUS + 1, top: 8, bottom: 8 } as const;
const LABEL_GAP = 8;

export type LineChartProps = {
  /** The series, any order; drawn oldest to newest. Filter it to a range with `pointsInRange` first. */
  points: readonly SeriesPoint[];
  /** A y label or value as shown, unit included: (182) => "182 lb". */
  formatValue: (v: number) => string;
  /** For the dates under the axis ("3 Aug", or "Aug 3" in en-US). */
  locale: string;
  /** The plot's height in points; 180 by default. */
  height?: number;
  /** What VoiceOver reads for the whole chart; `chartSummary` gives the series in words. */
  accessibilityLabel: string;
};

/**
 * A hand-drawn line chart (R116): a 2px line in the text colour with a dot at each point, a hairline grid at the y
 * ticks with their labels on the left, and the first and last dates under the axis. One point is a dot only; no points
 * draws nothing, so the screen shows its own empty text. The whole chart is one accessible element. Never red.
 */
export function LineChart({ points, formatValue, locale, height = 180, accessibilityLabel }: LineChartProps): ReactElement | null {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  if (points.length === 0) return null;

  const plotted = plotSeries(points, { width: Math.max(width, 1), height, ...INSET });
  const days = points.map((pt) => pt.localDate).sort();
  const dates = days[0] === days[days.length - 1] ? [days[0]] : [days[0], days[days.length - 1]];
  const smallText = { fontFamily: fonts.body400, fontSize: 12, color: colors.textMuted, fontVariant: ['tabular-nums' as const] };
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.floor(e.nativeEvent.layout.width));

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      <View
        style={{ height, paddingTop: INSET.top, paddingBottom: INSET.bottom, marginRight: LABEL_GAP, justifyContent: 'space-between', alignItems: 'flex-end' }}
      >
        {[...plotted.yTicks].reverse().map((tick) => (
          <View key={tick.value} style={{ height: 0, justifyContent: 'center' }}>
            <Text style={smallText}>{formatValue(tick.value)}</Text>
          </View>
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
              {plotted.dots.map((dot, i) => (
                <Circle key={i} cx={dot.x} cy={dot.y} r={DOT_RADIUS} fill={colors.text} />
              ))}
            </Svg>
          )}
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
