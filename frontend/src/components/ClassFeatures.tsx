import type { ReactNode } from 'react';
import { useClassFeatures, useSetFeatureChoice } from '../lib/queries';
import { Card, SectionTitle } from './ui';
import type { ClassFeature } from '../lib/types';
import { t } from '../lib/i18n';

// Class features gained by this character's class up to its level (later ones shown dimmed).
// Features that require a choice (options) show one dropdown per pick on the right,
// persisted per character (multiple picks stored comma-separated).
// `compact` (dashboard): only gained features plus the next upcoming one.
export function ClassFeatures({
  charId, className, level, choices, compact = false, bare = false, heading,
}: {
  charId: number;
  className: string;
  level: number;
  choices?: Record<string, string> | null;
  compact?: boolean;
  /** Render without its own card (inside the dashboard's tab panel). */
  bare?: boolean;
  /** Class name in the title (characters with several classes). */
  heading?: string;
}) {
  const features = useClassFeatures(className);
  const setChoice = useSetFeatureChoice(charId);
  if (!features.data || features.data.length === 0) return null;
  const nextLevel = features.data.find((f) => f.level > level)?.level;
  const shown = compact ? features.data.filter((f) => f.level <= level || f.level === nextLevel) : features.data;

  const split = (v?: string | null) => (v ?? '').split(',').map((x) => x.trim()).filter(Boolean);

  function pick(f: ClassFeature, selected: string[], slot: number, value: string) {
    const next = [...selected];
    const clean = value.replace(/,/g, ' ').trim();   // picks are stored comma-separated
    if (clean) next[slot] = clean; else next.splice(slot, 1);
    // Drop empties; dedupe unless the same option may be picked again (raising a favored enemy).
    const kept = next.filter((v, i) => v && (f.repeat || next.indexOf(v) === i));
    setChoice.mutate({ feature: f.name, option: kept.join(',') || null });
  }

  return (
    <Wrap bare={bare}>
      <SectionTitle action={compact && nextLevel ? <span className="text-xs text-zinc-500">{t('Nächste ab Stufe {nextLevel}', { nextLevel })}</span> : undefined}>
        {heading ? t('Klassenfähigkeiten: {c}', { c: heading }) : t('Klassenfähigkeiten')}
      </SectionTitle>
      <ul className="space-y-2">
        {shown.map((f, i) => {
          const gained = f.level <= level;
          // One pick per reached pick level (favored enemy 1/5/10/…), otherwise a fixed number of picks.
          const slotLevels = f.pickLevels ? f.pickLevels.filter((l) => l <= level) : Array.from({ length: f.picks ?? 1 }, () => f.level);
          const picks = gained ? slotLevels.length : (f.pickLevels ? 0 : slotLevels.length);
          const hasChoice = (f.options?.length ?? 0) > 0 || !!f.optionsFrom || !!f.freeText;
          const selected = split(choices?.[f.name]);
          const optionsFor = (slotLevel: number) => (f.optionsFrom
            ? split(choices?.[f.optionsFrom]).map((name) => ({ name, description: '', minLevel: 0 }))
            : (f.options ?? [])).filter((o) => (o.minLevel ?? 0) <= slotLevel);
          return (
            <li key={`${f.name}-${i}`} className={`flex flex-wrap sm:flex-nowrap items-start justify-between gap-3 text-sm ${gained ? '' : 'opacity-40'}`}>
              <span className="flex gap-3 min-w-0">
                <span className={`flex-shrink-0 w-11 h-5 rounded-md grid place-items-center text-[11px] font-semibold tabular ${gained ? 'bg-gold/10 text-gold' : 'bg-zinc-500/10 text-zinc-500'}`}>{t('St. {level}', { level: f.level })}</span>
                <span className="min-w-0">
                <span className="font-medium">{f.name}</span>
                <span className="text-zinc-500 dark:text-zinc-400"> — {f.description}</span>
                {hasChoice && selected.slice(0, picks).map((s, i) => {
                  const d = f.options?.find((o) => o.name === s)?.description;
                  return (
                    <span key={`${s}-${i}`} className="block text-xs text-emerald-600 dark:text-emerald-400">
                      {f.pickLevels ? `St. ${slotLevels[i]}: ` : ''}{s}{d ? ` — ${d}` : ''}
                    </span>
                  );
                })}
                </span>
              </span>
              {hasChoice && (
                // Phones: the pickers wrap below the text, aligned with it (past the level badge).
                <span className="flex flex-shrink-0 flex-col gap-1 ml-14 sm:ml-0">
                  {Array.from({ length: picks }).map((_, slot) => {
                    const current = selected[slot] ?? '';
                    // A later pick only after the earlier ones (picks are stored in level order).
                    const locked = slot > selected.length;
                    const cls = 'text-xs h-8 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-white/10 px-2 focus:outline-none focus:border-gold disabled:opacity-50 max-w-44';
                    const title = f.pickLevels ? t('Stufe {level}', { level: slotLevels[slot] }) : undefined;
                    if (f.freeText) return (
                      <input key={`${slot}-${current}`} defaultValue={current} placeholder={title ? `${title}: eintragen` : 'eintragen'}
                        title={title} disabled={setChoice.isPending || locked} className={cls}
                        onBlur={(e) => { if (e.target.value.trim() !== current) pick(f, selected, slot, e.target.value); }} />
                    );
                    return (
                      <select
                        key={slot}
                        value={current}
                        title={title}
                        disabled={setChoice.isPending || locked}
                        onChange={(e) => pick(f, selected, slot, e.target.value)}
                        className={cls}
                      >
                        <option value="">{title ? t('{title}: wählen', { title }) : t('— wählen —')}</option>
                        {optionsFor(slotLevels[slot] ?? f.level)
                          .filter((o) => f.repeat || o.name === current || !selected.includes(o.name))
                          .map((o) => <option key={o.name} value={o.name}>{o.name}</option>)}
                      </select>
                    );
                  })}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Wrap>
  );
}

const Wrap = ({ bare, children }: { bare: boolean; children: ReactNode }) => (bare ? <div>{children}</div> : <Card>{children}</Card>);
