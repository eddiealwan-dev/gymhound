import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import type { PrHighlight } from '../../domain/prs';
import type { PbCardModel } from '../../domain/shareCards';
import { sharePbImage } from '../../platform/sharePb';
import { PbCard } from './PbCard';

/** How long to wait for the card's hound mark to report it has loaded before capturing anyway. */
export const PB_READY_TIMEOUT_MS = 1500;

/** Draws a highlight's card, captures and shares it, then removes it. Resolves as `sharePbImage` does; rejects on failure. */
export type SharePb = (highlight: PrHighlight) => Promise<'shared' | 'unavailable'>;

const SharePbContext = createContext<SharePb | null>(null);

/** The finish screen's share function, or null outside a `PbCardHost` (no Share pill then). */
export function useSharePb(): SharePb | null {
  return useContext(SharePbContext);
}

type Job = { id: number; highlight: PrHighlight; resolve: (r: 'shared' | 'unavailable') => void; reject: (e: unknown) => void };

/**
 * Holds the personal best card while it is captured (R106). Rendered as the first child of the finish screen's root
 * View, ahead of its ScrollView, which has the screen's background and so paints over the card: the card is laid out
 * on screen at the top left, so the native view exists and is drawn (an off-screen view can be culled), and nothing
 * fades it, so the capture isn't faded either. It is untouchable and hidden from VoiceOver.
 *
 * A share draws the card, waits for its hound mark to load (or fail, or `PB_READY_TIMEOUT_MS`), then one frame,
 * then captures and shares it, and removes it.
 */
export function PbCardHost({
  locale,
  modelFor,
  children,
}: {
  locale: string;
  /** The card's fuller words for a highlight (§18.17); without it, or when it throws, the card shows the best alone. */
  modelFor?: (highlight: PrHighlight) => PbCardModel | null;
  children: ReactNode;
}): ReactElement {
  const [job, setJob] = useState<Job | null>(null);
  const card = useRef<View>(null);
  const nextId = useRef(0);
  /** The current job's mark has loaded (or failed). */
  const ready = useRef(false);
  /** Starts the current job's capture; null when there is no job waiting. */
  const go = useRef<(() => void) | null>(null);

  const share = useCallback<SharePb>(
    (highlight) =>
      new Promise((resolve, reject) => {
        ready.current = false;
        nextId.current += 1;
        setJob({ id: nextId.current, highlight, resolve, reject });
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
    const timer = setTimeout(start, PB_READY_TIMEOUT_MS);
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

  const modelOf = (highlight: PrHighlight): PbCardModel | null => {
    if (modelFor === undefined) return null;
    try {
      return modelFor(highlight);
    } catch (error) {
      // The card still shares with the personal best alone.
      console.warn('GymHound could not read the personal record card details.', error);
      return null;
    }
  };

  const onReady = useCallback(() => {
    ready.current = true;
    go.current?.();
  }, []);

  return (
    <SharePbContext.Provider value={share}>
      {job !== null && (
        <View
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          <PbCard key={job.id} ref={card} highlight={job.highlight} locale={locale} model={modelOf(job.highlight)} onReady={onReady} />
        </View>
      )}
      {children}
    </SharePbContext.Provider>
  );
}
