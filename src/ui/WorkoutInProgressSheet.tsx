import { router } from 'expo-router';
import { afterSheetCloses, ConfirmSheet } from './Sheet';

/**
 * Changing routines waits for the workout in progress (R80): Train's Change routine on the Resume card, and Set active
 * on Routines while a workout runs, open this instead. **Resume** is the filled answer and opens the session once the
 * sheet has gone; **Not now** closes it.
 */
export function WorkoutInProgressSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <ConfirmSheet
      visible={visible}
      title="Workout in progress"
      body="Finish or discard the workout in progress before changing routines."
      confirmLabel="Resume"
      cancelLabel="Not now"
      onConfirm={() => {
        onClose();
        afterSheetCloses(() => router.push('/session'));
      }}
      onCancel={onClose}
    />
  );
}
