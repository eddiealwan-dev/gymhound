import type { ReactElement } from 'react';
import { View } from 'react-native';
import type { FinishSummary } from '../../db/repositories/workoutViewsRepo';
import { prLine } from '../../domain/prs';
import { Body, Display, Label } from '../Text';
import { useTheme } from '../ThemeProvider';

/**
 * The finish summary's personal bests (R105), after the next-time lines: the heading "Personal bests", then one row
 * per highlight, a red "PR" mark (a PR mark may be red) and the line, which wraps with the phone's text size. Each row
 * reads to VoiceOver as "Personal best. {line}". Hidden when there are none, as on a first workout (R103). PRs are
 * computed at finish only (R104). Task 4 adds Share to each row.
 */
export function FinishPrs({ summary }: { workoutId: string; summary: FinishSummary }): ReactElement | null {
  const { colors } = useTheme();
  if (summary.prs.length === 0) return null;

  return (
    <View style={{ gap: 8, paddingTop: 16, marginTop: summary.next.length > 0 ? 16 : 0, borderTopWidth: 1, borderTopColor: colors.border }}>
      <Label>Personal bests</Label>
      {summary.prs.map((h, i) => {
        const line = prLine(h);
        return (
          <View key={i} accessible accessibilityLabel={`Personal best. ${line}`} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <Display weight={800} style={{ fontSize: 14, color: colors.red }}>
              PR
            </Display>
            <Body style={{ flex: 1 }}>{line}</Body>
          </View>
        );
      })}
    </View>
  );
}
