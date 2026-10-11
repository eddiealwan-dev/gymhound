import { create } from 'zustand';
type PendingPick = { exerciseId: string | null; set: (id: string) => void; take: () => string | null };
/** The exercise the picker chose in routine mode, handed to the routine editor once (spec 18.8). */
export const usePendingPick = create<PendingPick>((set, get) => ({
  exerciseId: null,
  set: (id) => set({ exerciseId: id }),
  take: () => { const id = get().exerciseId; set({ exerciseId: null }); return id; },
}));
