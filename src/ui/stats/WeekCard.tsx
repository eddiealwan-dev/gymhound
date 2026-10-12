import { type ReactElement, type ReactNode, useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { weekReport } from '../../db/repositories/analyticsRepo';
import { getSettings } from '../../db/repositories/settingsRepo';
import type { Db } from '../../db/types';
import { weekShareLabel } from '../../domain/shareCards';
import { groupWeekText, sessionsText, trendText } from '../../domain/weeklyAnalytics';
import { canSharePb } from '../../platform/sharePb';
import { useFocusedDbQuery } from '../../state/dataVersion';
import { Button } from '../Button';
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
 * over are said in words, never in colour. With no workout this week one line stands in for the sets; before the first
 * workout ever, the card is one line. It reads only while Stats is in sight (R185).
 */
export function WeekCard({ today, onShare }: { today: string; onShare?: () => void }): ReactElement | null {
  const { colors } = useTheme();
  const read = useCallback((db: Db) => {
    const unit = getSettings(db).unit;
    return { unit, report: weekReport(db, today, unit) };
  }, [today]);
  const { unit, report } = useFocusedDbQuery(read);
  const { sessions } = report;
  const cardStyle = { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 16 };

  // No average weeks and nothing this week means no finished workout at all: the first workout's week starts the count.
  if (sessions.thisWeek === 0 && sessions.averageWeeks === 0) {
    return (
      <View style={cardStyle}>
        <Label>This week</Label>
        <Body muted>Your week shows here after your first workout.</Body>
      </View>
    );
  }

  return (
    <View style={cardStyle}>
      <Label>This week</Label>
      <Part title="Sets per muscle">
        {sessions.thisWeek === 0 ? (
          <Body muted>No workouts yet this week.</Body>
        ) : (
          <>
            <Body muted>{BAND_NOTE}</Body>
            <View style={{ gap: 4, marginTop: 4 }}>
              {report.muscles.map((g) => (
                <Body key={g.group}>{groupWeekText(g)}</Body>
              ))}
            </View>
          </>
        )}
      </Part>
      <Part title="Sessions">
        <Body>{sessionsText(sessions)}</Body>
      </Part>
      <Part title="Personal bests">
        <Body>{`${report.prsThisWeek} this week · ${report.prsLast4Weeks} in the last 4 weeks`}</Body>
      </Part>
      <Part title="Bodyweight">
        <Body>{trendText(report.bodyweight, unit)}</Body>
      </Part>
      {/* §18.17 (R449): the week as an image, once it has a workout, on a phone that can share. */}
      {onShare !== undefined && sessions.thisWeek > 0 ? <ShareWeek onShare={onShare} /> : null}
    </View>
  );
}

/** Share this week: a quiet compact pill; it shows only where the phone can share. */
function ShareWeek({ onShare }: { onShare: () => void }): ReactElement | null {
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    let live = true;
    void canSharePb().then((ok) => {
      if (live) setCanShare(ok);
    });
    return () => {
      live = false;
    };
  }, []);
  if (!canShare) return null;
  return (
    <View style={{ alignItems: 'flex-start', padding: 4, margin: -4 }}>
      <Button label="Share this week" variant="secondary" size="compact" accessibilityLabel={weekShareLabel('THIS WEEK')} onPress={onShare} />
    </View>
  );
}
