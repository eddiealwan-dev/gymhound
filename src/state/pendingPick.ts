import { create } from 'zustand';

type PendingPick = {
  /** The exercise chosen and not yet taken, or null. */
  exerciseId: string | null;
  /** The picker hands over its choice. */
  set(id: string): void;
  /** The editor takes the choice once: it returns it and clears it. */
  take(): string | null;
};

/** The exercise the picker chose in routine mode, handed to the routine editor once (spec 18.8). */
export const usePendingPick = create<PendingPick>((set, get) => ({
  exerciseId: null,
  set: (id) => set({ exerciseId: id }),
  take: () => {
    const id = get().exerciseId;
    set({ exerciseId: null });
    return id;
  },
}));
