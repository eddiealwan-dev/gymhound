import { useState } from 'react';
import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';
import { Body } from './Text';
import { useTheme } from './ThemeProvider';

/** The well's padding, the gap between segments and each segment's padding beside its words (DESIGN.md). */
const WELL_PADDING = 4;
const SEGMENT_GAP = 4;
const SEGMENT_PADDING = 4;

/**
 * How many segments go in a row: all of them when each, sharing the well's inner width, still fits the longest label;
 * else two; else one. Returns each segment's width too, whole points so a row never wraps on a rounding error.
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

export type SegmentOption<T extends string> = { value: T; label: string; spoken?: string };

/**
 * The one segmented control (DESIGN.md, R353): a surfaceRaised well (12pt corners, 4pt padding and gaps) of 44pt
 * segments, the chosen one filled with the text colour and labelled in the background colour. VoiceOver hears a radio
 * group named `label`, each choice by `spoken` when given. Labels wrap and stay centred rather than clip at a large
 * text size.
 *
 * The segments are laid out from the measured width of the well and of each label (hidden copies at the same size,
 * each as wide as its words up to the well's width), so a word never breaks and no label runs into the next: all in a
 * row, else two, else one (Round 11: Light, Dark and System overlapped at the largest text size until every control
 * measured). Until measured they share one row. `fit` is a testID prefix for the well and the hidden copies.
 *
 * Settings (Appearance, units, bell sound), Add food (Search / Quick add), the body and lift charts' ranges and Fuel's
 * trends all use it; until the final design pass each kept its own copy (spec §18.10's open minor).
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  fit,
}: {
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  fit?: string;
}): ReactElement {
  const { colors } = useTheme();
  const [wellWidth, setWellWidth] = useState(0);
  const [labelWidths, setLabelWidths] = useState<Record<string, number>>({});
  const measured = wellWidth > 0 && options.every((o) => labelWidths[o.label] !== undefined);
  const layout = measured ? segmentLayout(wellWidth, Math.max(...options.map((o) => labelWidths[o.label])), options.length) : null;

  return (
    <View>
      {
        <View
          testID={fit !== undefined ? `${fit}-probes` : undefined}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, opacity: 0 }}
        >
          {options.map((option) => (
            <Body
              key={option.value}
              testID={fit !== undefined ? `${fit}-probe-${option.label}` : undefined}
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
      }
      <View
        testID={fit !== undefined ? `${fit}-well` : undefined}
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        onLayout={(e) => setWellWidth(Math.floor(e.nativeEvent.layout.width))}
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
              <Body weight={600} style={{ textAlign: 'center', color: selected ? colors.bg : colors.text }}>
                {option.label}
              </Body>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
