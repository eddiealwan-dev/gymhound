import { create } from 'zustand';
type CreatedExercise = { id: string | null; set: (id: string) => void; take: () => string | null };
/**
 * The exercise the editor just made from the picker's **New exercise** (R110), handed to the picker once: back in focus,
 * it chooses it as if its row was tapped. Like `usePendingPick`.
 */
export const useCreatedExercise = create<CreatedExercise>((set, get) => ({
  id: null,
  set: (id) => set({ id }),
  take: () => { const id = get().id; set({ id: null }); return id; },
}));
