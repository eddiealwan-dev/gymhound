import { router } from 'expo-router';
import { afterSheetCloses, ConfirmSheet } from './Sheet';

/**
 * Changing routines waits for the workout in progress (R80): Train's Change routine on the Resume card, and Set active
 * on Routines while a workout runs, open this instead. **Resume** is the filled answer and opens the session once the
 * sheet has gone; **Not now** closes it. Starting a saved workout on Routines opens it too, with `body` saying so.
 */
export function WorkoutInProgressSheet({
  visible,
  onClose,
  body = 'Finish or discard the workout in progress before changing routines.',
}: {
  visible: boolean;
  onClose: () => void;
  body?: string;
}) {
  return (
    <ConfirmSheet
      visible={visible}
      title="Workout in progress"
      body={body}
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
