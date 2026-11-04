import { Link } from 'react-router-dom';
import { SectionTitle } from './ui';
import { SpellBookTabs, inBook } from './SpellBookTabs';
import { useRaces, useRest, useRuleLayout, useSetResource, useSkillSheet, useSpellbook, useSpells, useWeapons } from '../lib/queries';
import { SCHOOLS, featConfig, featKey, schoolKey } from '../lib/featTree';
import type { Character } from '../lib/types';
import { t } from '../lib/i18n';

const row = 'flex items-center justify-between gap-3 py-2 border-b border-zinc-200/70 dark:border-white/[0.05] text-sm';
const signed = (v: number) => `${v >= 0 ? '+' : ''}${v}`;

/** Tick boxes for small pools, a −/+ counter for big ones (rage rounds, ki). Click a box = spend up to it. */
function Pool({ max, used, busy, onSet }: { max: number; used: number; busy: boolean; onSet: (used: number) => void }) {
  if (max <= 12) return (
    <span className="flex flex-wrap justify-end gap-1">
      {Array.from({ length: max }, (_, i) => (
        <button key={i} disabled={busy} aria-label={`${i < used ? t('Zurücknehmen') : t('Verbrauchen')} ${i + 1}`}
          onClick={() => onSet(i < used ? i : i + 1)}
          className={`w-4 h-4 rounded-[3px] border-[1.5px] border-gold ${i < used ? 'bg-gold' : ''}`} />
      ))}
    </span>
  );
  return (
    <span className="flex items-center gap-2 flex-shrink-0">
      <button disabled={busy || used <= 0} onClick={() => onSet(used - 1)} className="w-7 h-7 rounded-md ring-1 ring-inset ring-gold/40 text-gold">−</button>
      <span className="tabular font-semibold text-sm w-14 text-center">{max - used}/{max}</span>
      <button disabled={busy || used >= max} onClick={() => onSet(used + 1)} className="w-7 h-7 rounded-md ring-1 ring-inset ring-gold/40 text-gold">+</button>
    </span>
  );
}

/** Daily resources (left today) and scaling class values; rest resets everything incl. spell slots. */
export function ResourcesSection({ c }: { c: Character }) {
  const setRes = useSetResource(c.id);
  const rest = useRest(c.id);
  const resources = c.derived.resources ?? [];
  const values = c.derived.classValues ?? [];
  return (
    <div>
      <SectionTitle action={
        // Systems that tell short from long rests (rule packages) get both buttons.
        resources.some((r) => r.reset) ? (
          <span className="flex gap-3">
            <button disabled={rest.isPending} onClick={() => rest.mutate('short')} className="text-xs text-gold hover:underline" title={t('Füllt nur, was nach einer kurzen Rast zurückkommt')}>{t('Kurze Rast')}</button>
            <button disabled={rest.isPending} onClick={() => rest.mutate('long')} className="text-xs text-gold hover:underline">{t('Lange Rast')}</button>
          </span>
        ) : <button disabled={rest.isPending} onClick={() => rest.mutate(undefined)} className="text-xs text-gold hover:underline">{t('Rasten (8 h)')}</button>
      }>{t('Ressourcen heute')}</SectionTitle>
      {resources.length === 0 && <p className="text-sm text-zinc-500">{t('Keine täglichen Ressourcen.')}</p>}
      {resources.map((r) => (
        <div key={r.key} className={row}>
          <span className="min-w-0">{r.label}<span className="block text-xs text-zinc-500">{t('{detail} · noch {v} von {max}', { detail: r.detail || (r.reset === 'short' ? t('Kurze Rast') : r.reset === 'long' ? t('Lange Rast') : t('Rast')), v: r.max - r.used, max: r.max })}</span></span>
          <Pool max={r.max} used={r.used} busy={setRes.isPending} onSet={(used) => setRes.mutate({ key: r.key, used })} />
        </div>
      ))}
      {values.length > 0 && (
        <div className="mt-3">
          {values.map((v) => (
            <div key={v.label} className={row}><span className="text-zinc-600 dark:text-zinc-400">{v.label}</span><span className="font-semibold tabular text-right">{v.value}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Race traits (senses, resistances) — the conditional ones are also listed under Kampf → Situativ. */
export function RaceSection({ c }: { c: Character }) {
  const race = useRaces().data?.find((r) => r.key === c.raceKey);
  return (
    <div>
      <SectionTitle>{t('Volk: {v}', { v: race?.name ?? c.race })}</SectionTitle>
      {race ? (
        <ul className="text-sm space-y-1">{race.traits.map((t) => <li key={t}>{t}</li>)}</ul>
      ) : <p className="text-sm text-zinc-500">{t('Eigenes Volk — keine hinterlegten Merkmale.')}</p>}
    </div>
  );
}

/** Feats as chips with their choice; class feats marked; Combat Reflexes shows the number of attacks of opportunity. */
export function TalentsSection({ c }: { c: Character }) {
  const weapons = useWeapons().data ?? [];
  const skills = useSkillSheet(c.id).data?.skills ?? [];
  const cfg = featConfig(useRuleLayout().data?.layout);
  const label = (name: string, choice?: string | null) => {
    if (!choice) return name;
    const kind = cfg.choices[featKey(name)];
    const what = kind === 'weapon' ? weapons.find((w) => w.key === choice)?.name
      : kind === 'school' ? SCHOOLS.find((s) => s.key === choice)?.label : skills.find((s) => s.key === choice)?.name;
    return `${name} (${what ?? choice})`;
  };
  const extra = (name: string) => featKey(name) === featKey('Combat Reflexes')
    ? ` · ${t('{n} Gelegenheitsangriffe', { n: 1 + Math.max(0, c.derived.modifiers.Dex ?? 0) })}` : '';
  const chips = [
    ...(c.grantedFeats ?? []).map((n) => ({ text: t('{n} · Klasse', { n }), cls: 'text-zinc-500' })),
    ...(c.feats ?? []).map((f) => ({ text: label(f.name, f.choice) + extra(f.name), cls: '' })),
  ];
  return (
    <div>
      <SectionTitle action={<Link to="/feats" className="text-xs text-gold hover:underline">{t('Talente ›')}</Link>}>{t('Talente')}</SectionTitle>
      {chips.length === 0 ? <p className="text-sm text-zinc-500">{t('Noch keine Talente.')}</p> : (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((x, i) => <span key={i} className={`text-xs px-2 py-1 rounded-full border border-zinc-300 dark:border-white/10 ${x.cls}`}>{x.text}</span>)}
        </div>
      )}
    </div>
  );
}

/**
 * Today's spells: caster level, concentration, DC per grade (+ Spell Focus), then per grade the prepared spells
 * with their cast copies (prepared casters) or the slots left and spells known (spontaneous casters).
 */
export function SpellOverview({ c }: { c: Character }) {
  const book = useSpellbook(c.id).data;
  const spells = (useSpells(c.id).data ?? []).filter((s) => inBook(book, s));
  if (!book?.type) return null;
  const mod = book.castingMod ?? 0;
  const focus = (school: string) => (c.feats ?? []).filter((f) => f.choice === school
    && [featKey('Spell Focus'), featKey('Greater Spell Focus')].includes(featKey(f.name))).length;
  const focusSchools = SCHOOLS.filter((s) => focus(s.key) > 0);
  const grades = book.grades.filter((g) => g.grade > 0);
  const byId = new Map(spells.map((s) => [s.id, s]));
  return (
    <div>
      <SectionTitle action={<Link to="/spells" className="text-xs text-gold hover:underline">{t('Zauberbuch ›')}</Link>}>{t('Zauber')}</SectionTitle>
      <div className="mb-2"><SpellBookTabs charId={c.id} book={book} /></div>
      <div className={row}><span className="text-zinc-600 dark:text-zinc-400">{t('Zauberstufe · Konzentration')}</span><span className="font-semibold tabular">{book.casterLevel} · {signed((book.casterLevel ?? 0) + mod)}</span></div>
      {/* No grade above 0 (e.g. casting attribute too low): no DC row to show. */}
      {grades.length > 0 && <div className={row}>
        <span className="text-zinc-600 dark:text-zinc-400">{t('SG pro Grad')}</span>
        <span className="font-semibold tabular text-right">{grades.map((g) => 10 + g.grade + mod).join(' / ')}
          {focusSchools.length > 0 && <span className="block text-xs font-normal text-zinc-500">{focusSchools.map((s) => `${s.label} +${focus(s.key)}`).join(', ')}</span>}
        </span>
      </div>}
      {grades.map((g) => {
        if (book.type === 'prepared') {
          const slots = book.state.prepared[g.grade] ?? [];
          const left = slots.filter((s) => s.spellId != null && !s.used).length;
          const ids = [...new Set(slots.filter((s) => s.spellId != null).map((s) => s.spellId!))];
          return (
            <div key={g.grade} className="mt-3">
              <div className="text-xs font-semibold text-zinc-500 mb-1">{t('Grad {grade} — {left} von {total} übrig', { grade: g.grade, left, total: g.total })}</div>
              {ids.length === 0 && <p className="text-xs text-zinc-500">{t('Nichts vorbereitet.')}</p>}
              {ids.map((id) => {
                const copies = slots.filter((s) => s.spellId === id);
                const s = byId.get(id);
                return (
                  <div key={id} className={row}>
                    <span className="min-w-0">{s?.name ?? '?'}<span className="block text-xs text-zinc-500">{s?.school ? SCHOOLS.find((x) => x.key === schoolKey(s.school))?.label ?? s.school : ''}</span></span>
                    <span className="flex gap-1">{copies.map((x, i) => <span key={i} className={`w-3.5 h-3.5 rounded-[3px] border-[1.5px] border-gold ${x.used ? 'bg-gold' : ''}`} />)}</span>
                  </div>
                );
              })}
            </div>
          );
        }
        const left = g.total - (book.state.used[g.grade] ?? 0);
        const known = spells.filter((s) => s.grade === g.grade);
        return (
          <div key={g.grade} className="mt-3">
            <div className="text-xs font-semibold text-zinc-500 mb-1">{t('Grad {grade} — {left} von {total} Plätzen übrig', { grade: g.grade, left, total: g.total })}</div>
            <p className="text-sm">{known.map((s) => s.name).join(', ') || <span className="text-zinc-500">{t('Keine Zauber bekannt.')}</span>}</p>
          </div>
        );
      })}
    </div>
  );
}

/** Ammunition in the quiver that fits a weapon (arrows for bows, bolts for crossbows, bullets for slings). */
export function ammoFor(weaponKey: string | null | undefined, ammo: { name: string; count: number }[]) {
  if (!weaponKey) return [];
  const re = weaponKey.includes('crossbow') ? /bolzen|bolt/i : weaponKey.includes('bow') ? /pfeil|arrow/i
    : weaponKey === 'sling' ? /kugel|bullet|stein/i : null;
  return re ? ammo.filter((a) => re.test(a.name)) : [];
}
