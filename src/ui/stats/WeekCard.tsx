import { type ReactElement, type ReactNode, useCallback } from 'react';
import { View } from 'react-native';
import { weekReport } from '../../db/repositories/analyticsRepo';
import { getSettings } from '../../db/repositories/settingsRepo';
import type { Db } from '../../db/types';
import { groupWeekText, sessionsText, trendText } from '../../domain/weeklyAnalytics';
import { useFocusedDbQuery } from '../../state/dataVersion';
import { Body, Label } from '../Text';
import { useTheme } from '../ThemeProvider';

const BAND_NOTE = 'Hard sets so far this week. About 10 to 20 a week is the usual aim; GymHound counts 8 to 24 as in range.';

/** A part of the card: its name in body strong (a VoiceOver heading), then its lines 4pt apart. */
function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 4 }}>
      <Body weight={600} accessibilityRole="header">
        {title}
      </Body>
      {children}
    </View>
  );
}

/**
 * Stats → This week (R176–R179): sets per muscle from Monday to today against the 8–24 band, sessions (with the
 * average over the weeks before), personal bests this week and in the last 4 weeks, and the bodyweight trend. Under and
 * over are said in words, never in colour. It reads only while Stats is in sight (R185).
 */
export function WeekCard({ today }: { today: string }): ReactElement | null {
  const { colors } = useTheme();
  const read = useCallback((db: Db) => {
    const unit = getSettings(db).unit;
    return { unit, report: weekReport(db, today, unit) };
  }, [today]);
  const { unit, report } = useFocusedDbQuery(read);

  return (
    <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 16 }}>
      <Label>This week</Label>
      <Part title="Sets per muscle">
        <Body muted>{BAND_NOTE}</Body>
        <View style={{ gap: 4, marginTop: 4 }}>
          {report.muscles.map((g) => (
            <Body key={g.group}>{groupWeekText(g)}</Body>
          ))}
        </View>
      </Part>
      <Part title="Sessions">
        <Body>{sessionsText(report.sessions)}</Body>
      </Part>
      <Part title="Personal bests">
        <Body>{`${report.prsThisWeek} this week · ${report.prsLast4Weeks} in the last 4 weeks`}</Body>
      </Part>
      <Part title="Bodyweight">
        <Body>{trendText(report.bodyweight, unit)}</Body>
      </Part>
    </View>
  );
}
