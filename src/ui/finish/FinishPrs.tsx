import { getLocales } from 'expo-localization';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { View } from 'react-native';
import type { FinishSummary } from '../../db/repositories/workoutViewsRepo';
import { prLine } from '../../domain/prs';
import type { PrHighlight } from '../../domain/prs';
import { announce } from '../../platform/announce';
import { canSharePb, sharePbImage } from '../../platform/sharePb';
import { Button } from '../Button';
import { Body, Display, Label } from '../Text';
import { useTheme } from '../ThemeProvider';
import { PbCard } from './PbCard';

const SHARE_FAILED = "Couldn't make the image. Try again.";

const deviceLocale = () => getLocales()[0]?.languageTag ?? 'en-US';

/**
 * The finish summary's personal bests (R105), after the next-time lines: the heading "Personal bests", then one row
 * per highlight, a red "PR" mark (a PR mark may be red) and the line, which wraps with the phone's text size. The mark
 * and line read to VoiceOver as "Personal best. {line}". Hidden when there are none, as on a first workout (R103). PRs
 * are computed at finish only (R104).
 *
 * On a phone that can share, each row ends with a Share pill (R106) that wraps under the line at large text sizes.
 * Share draws that highlight's `PbCard` off-screen, waits a frame for it to be laid out, captures it and opens the
 * share sheet, then removes it. A failure shows a muted line under the row.
 */
export function FinishPrs({ summary }: { workoutId: string; summary: FinishSummary }): ReactElement | null {
  if (summary.prs.length === 0) return null;
  return <PrList prs={summary.prs} afterNext={summary.next.length > 0} />;
}

function PrList({ prs, afterNext }: { prs: readonly PrHighlight[]; afterNext: boolean }): ReactElement {
  const { colors } = useTheme();
  const [canShare, setCanShare] = useState(false);
  /** The highlight whose card is drawn for capture, or null. */
  const [drawing, setDrawing] = useState<number | null>(null);
  /** The row whose image couldn't be made, or null. */
  const [failed, setFailed] = useState<number | null>(null);
  const card = useRef<View>(null);
  const busy = useRef(false);

  useEffect(() => {
    let live = true;
    void canSharePb().then((ok) => {
      if (live) setCanShare(ok);
    });
    return () => {
      live = false;
    };
  }, []);

  // Once the card is committed, give it one frame to be laid out natively, then capture and share it.
  useEffect(() => {
    if (drawing === null) return;
    let live = true;
    const frame = requestAnimationFrame(() => {
      sharePbImage(card)
        .catch(() => {
          if (!live) return;
          setFailed(drawing);
          announce(SHARE_FAILED);
        })
        .finally(() => {
          busy.current = false;
          if (live) setDrawing(null);
        });
    });
    return () => {
      live = false;
      cancelAnimationFrame(frame);
    };
  }, [drawing]);

  const share = (i: number) => {
    if (busy.current) return;
    busy.current = true;
    setFailed(null);
    setDrawing(i);
  };

  return (
    <View style={{ gap: 8, paddingTop: 16, marginTop: afterNext ? 16 : 0, borderTopWidth: 1, borderTopColor: colors.border }}>
      <Label>Personal bests</Label>
      {prs.map((h, i) => {
        const line = prLine(h);
        return (
          <View key={i}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 8 }}>
              <View
                accessible
                accessibilityLabel={`Personal best. ${line}`}
                style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexGrow: 1, flexShrink: 1, flexBasis: 200 }}
              >
                <Display weight={800} style={{ fontSize: 14, color: colors.red }}>
                  PR
                </Display>
                <Body style={{ flex: 1 }}>{line}</Body>
              </View>
              {canShare && (
                <Button label="Share" variant="secondary" size="compact" accessibilityLabel={`Share ${line}`} onPress={() => share(i)} />
              )}
            </View>
            {failed === i && (
              <Body muted style={{ marginTop: 4 }}>
                {SHARE_FAILED}
              </Body>
            )}
          </View>
        );
      })}
      {drawing !== null && (
        <View
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={{ position: 'absolute', left: -10000, top: 0 }}
        >
          <PbCard ref={card} highlight={prs[drawing]} locale={deviceLocale()} />
        </View>
      )}
    </View>
  );
}
