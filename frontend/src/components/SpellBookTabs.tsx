import type { Spell, Spellbook } from '../lib/types';
import { useRuleLayout } from '../lib/queries';
import { className } from '../lib/stats';
import { useSpellClass } from '../store/char';

/** Characters with several casting classes have one spellbook each: switches the open one (remembered per character). */
export function SpellBookTabs({ charId, book, onSwitch }: { charId: number; book: Spellbook | undefined; onSwitch?: () => void }) {
  const layout = useRuleLayout().data?.layout;
  const set = useSpellClass((s) => s.set);
  if (!book?.classes || book.classes.length < 2) return null;
  return (
    <div role="tablist" className="flex flex-wrap gap-2">
      {book.classes.map((k) => (
        <button key={k} role="tab" aria-selected={k === book.classId}
          onClick={() => { set(charId, k); onSwitch?.(); }}
          className={`px-3 py-1 rounded-full text-sm border transition ${k === book.classId
            ? 'bg-[#8b1a1a] border-[#e8c873] text-[#f6ead0] font-semibold'
            : 'bg-[#f6ead0]/90 border-[#c9b08a] text-[#5a3a1a] hover:border-[#8b1a1a]'}`}>
          {className(layout, k)}
        </button>
      ))}
    </div>
  );
}

/** The book's spells; the first book also holds spells without a (known) class. */
export const inBook = (book: Spellbook | undefined, s: Spell) => !book?.classes
  || (s.classId ?? '') === book.classId
  || (book.classId === book.classes[0] && !book.classes.includes(s.classId ?? ''));
