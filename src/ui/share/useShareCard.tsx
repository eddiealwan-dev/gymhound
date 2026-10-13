import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement, RefObject } from 'react';
import { View } from 'react-native';
import { sharePbImage } from '../../platform/sharePb';

/** How long to wait for a card's hound mark to report it has loaded before capturing anyway. */
export const CARD_READY_TIMEOUT_MS = 1500;

/** Draws a card given where to attach its view and what to call when its images have loaded. */
export type CardMaker = (ref: RefObject<View | null>, onReady: () => void) => ReactElement;

type Job = { id: number; make: CardMaker; resolve: (r: 'shared' | 'unavailable') => void; reject: (e: unknown) => void };

/**
 * Shares a card drawn on demand (§18.17), the way `PbCardHost` shares a personal best (R106): `share(make)` draws the
 * card into `holder`, waits for its hound mark (or `CARD_READY_TIMEOUT_MS`), then one frame, captures it at 1080 ×
 * 1350, opens the share sheet, and removes it. Render `holder` as the first child of the screen's root View, under the
 * scroll view that paints over it; it is untouchable and hidden from VoiceOver. Resolves as `sharePbImage`; rejects
 * when the capture or the share fails.
 */
export function useShareCard(): { share: (make: CardMaker) => Promise<'shared' | 'unavailable'>; holder: ReactElement | null } {
  const [job, setJob] = useState<Job | null>(null);
  const card = useRef<View>(null);
  const nextId = useRef(0);
  const ready = useRef(false);
  const go = useRef<(() => void) | null>(null);

  const share = useCallback(
    (make: CardMaker) =>
      new Promise<'shared' | 'unavailable'>((resolve, reject) => {
        ready.current = false;
        nextId.current += 1;
        setJob({ id: nextId.current, make, resolve, reject });
      }),
    [],
  );

  useEffect(() => {
    if (job === null) return;
    let started = false;
    let captured = false;
    let live = true;
    let frame = 0;
    const start = () => {
      if (started) return;
      started = true;
      clearTimeout(timer);
      frame = requestAnimationFrame(() => {
        captured = true;
        sharePbImage(card)
          .then(job.resolve, job.reject)
          .finally(() => {
            if (live) setJob(null);
          });
      });
    };
    const timer = setTimeout(start, CARD_READY_TIMEOUT_MS);
    go.current = start;
    if (ready.current) start();
    return () => {
      live = false;
      go.current = null;
      clearTimeout(timer);
      if (!captured) {
        cancelAnimationFrame(frame);
        job.reject(new Error('The card was removed before it was captured.'));
      }
    };
  }, [job]);

  const onReady = useCallback(() => {
    ready.current = true;
    go.current?.();
  }, []);

  const holder =
    job === null ? null : (
      <View
        key={job.id}
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        {job.make(card, onReady)}
      </View>
    );

  return { share, holder };
}
