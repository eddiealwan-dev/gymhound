import { create } from 'zustand';
type CreatedFood = { id: string | null; set: (id: string) => void; take: () => string | null };
/**
 * The food the editor just made from the add screen's **New food** (R144), handed to the add screen once: back in
 * focus, it opens that food's servings as if its row was tapped. Like `useCreatedExercise`.
 */
export const useCreatedFood = create<CreatedFood>((set, get) => ({
  id: null,
  set: (id) => set({ id }),
  take: () => { const id = get().id; set({ id: null }); return id; },
}));
