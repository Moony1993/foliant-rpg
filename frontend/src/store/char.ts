import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Which character is currently active (a user can own several).
interface CharState {
  activeId: number | null;
  setActive: (id: number | null) => void;
}

export const useActiveChar = create<CharState>()(
  persist((set) => ({ activeId: null, setActive: (id) => set({ activeId: id }) }), { name: 'pf-active-char' }),
);

// Which spellbook is open per character (characters with several casting classes have one per class).
interface SpellClassState {
  byChar: Record<number, string>;
  set: (charId: number, classId: string) => void;
}

export const useSpellClass = create<SpellClassState>()(
  persist((set) => ({ byChar: {}, set: (charId, classId) => set((s) => ({ byChar: { ...s.byChar, [charId]: classId } })) }), { name: 'pf-spell-class' }),
);
