import { Link } from 'react-router-dom';
import { useSpellbook } from '../lib/queries';
import { Card, SectionTitle } from './ui';
import { SpellBookTabs } from './SpellBookTabs';
import type { Spellbook, SpellGrade } from '../lib/types';
import { t } from '../lib/i18n';

/** Slots of a grade that can still be cast (prepared: filled + unused; spontaneous: not spent). */
function remaining(book: Spellbook, g: SpellGrade) {
  return book.type === 'prepared'
    ? (book.state.prepared[g.grade] ?? []).filter((s) => s.spellId != null && !s.used).length
    : g.total - (book.state.used[g.grade] ?? 0);
}

/** Compact "slots left" line for the dashboard. */
export function SpellSummary({ charId }: { charId: number }) {
  const book = useSpellbook(charId).data;
  const grades = book?.grades.filter((g) => g.grade > 0) ?? [];
  if (!book?.type || grades.length === 0) return null;
  return (
    <Card>
      <SectionTitle action={<Link to="/spells" className="text-xs text-gold hover:underline">{t('Zauber ›')}</Link>}>{t('Zauberplätze')}</SectionTitle>
      <div className="mb-2"><SpellBookTabs charId={charId} book={book} /></div>
      <div className="flex flex-wrap gap-2">
        {grades.map((g) => {
          const left = remaining(book, g);
          return (
            <span key={g.grade} className={`px-2.5 py-1 rounded-lg text-xs tabular ring-1 ring-inset ${left === 0
              ? 'text-red-500 ring-red-500/30' : 'text-zinc-600 dark:text-zinc-300 ring-zinc-200 dark:ring-white/10'}`}>
              {t('Grad')}{' '} {g.grade}: <b>{left}</b>/{g.total}
            </span>
          );
        })}
      </div>
    </Card>
  );
}
