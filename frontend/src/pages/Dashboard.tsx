import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useActive } from '../lib/useActive';
import { useActiveChar } from '../store/char';
import { TempHpInput } from '../components/GmTools';
import { useAddStatus, useAmmo, useDeleteStatus, useRuleLayout, useSetToggle, useSkillSheet, useSpellbook, useSpendGold, useStatus, useUpdateHp } from '../lib/queries';
import { className, classLevels, classLine, fillTemplate, formatStat } from '../lib/stats';
import { Brain, ChevronDown, Coins, Eye, Footprints, Heart, Shield, Sparkles, Star, Swords, Target, Zap, Plus, X, type LucideIcon } from 'lucide-react';
import { Card, Button, Select, Input, SectionTitle, RARITY_RING, RARITY_TEXT } from '../components/ui';
import { ItemIcon } from '../components/item';
import { NoteCards } from '../components/NoteCards';
import { DiceRoller } from '../components/DiceRoller';
import { ClassFeatures } from '../components/ClassFeatures';
import { SpellSummary } from '../components/SpellTracker';
import { RaceSection, ResourcesSection, SpellOverview, TalentsSection, ammoFor } from '../components/DashboardSections';
import type { Character } from '../lib/types';
import { kilos } from '../lib/units';
import { t } from '../lib/i18n';

function StatusEffects({ charId }: { charId: number }) {
  const status = useStatus(charId);
  const add = useAddStatus(charId);
  const del = useDeleteStatus(charId);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'buff' | 'debuff'>('buff');
  const [adding, setAdding] = useState(false);
  // First tap arms a chip, second tap removes it — a single stray tap on mobile shouldn't delete.
  const [armed, setArmed] = useState<number | null>(null);

  return (
    <Card>
      <SectionTitle action={!adding && (
        <button onClick={() => setAdding(true)} className="text-xs text-gold hover:underline">{t('+ Effekt')}</button>
      )}>{t('Status-Effekte')}</SectionTitle>
      <div className="flex flex-wrap gap-2">
        {(status.data?.length ?? 0) === 0 && <span className="text-zinc-500 text-sm">{t('Keine aktiven Effekte.')}</span>}
        {status.data?.map((s) => (
          <button
            key={s.id}
            onClick={() => (armed === s.id ? (del.mutate(s.id), setArmed(null)) : setArmed(s.id))}
            onBlur={() => setArmed((a) => (a === s.id ? null : a))}
            title={s.description || s.name}
            className={`group inline-flex items-center gap-1.5 h-8 max-w-full pl-2.5 pr-2 rounded-full text-xs font-medium ring-1 ring-inset transition ${armed === s.id
              ? 'bg-red-600 text-white ring-red-600'
              : s.kind === 'buff'
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/30'
              : 'bg-red-500/10 text-red-600 dark:text-red-400 ring-red-500/30'}`}
          >
            {armed === s.id
              ? <><X className="w-3 h-3 flex-shrink-0" aria-hidden /><span className="truncate">{t('{name} entfernen?', { name: s.name })}</span></>
              : <><span>{s.icon}</span><span className="truncate">{s.name}</span></>}
          </button>
        ))}
      </div>
      {(status.data?.length ?? 0) > 0 && <p className="mt-2 text-[11px] text-zinc-500">{t('Zum Entfernen zweimal antippen.')}</p>}
      {adding && (<>
      <Input autoFocus placeholder={t('Effekt hinzufügen…')} value={name} onChange={(e) => setName(e.target.value)} className="mt-3" />
      <div className="flex gap-2 mt-2">
        <Select value={kind} onChange={(e) => setKind(e.target.value as 'buff' | 'debuff')} className="flex-1">
          <option value="buff">{t('Verstärkung')}</option>
          <option value="debuff">{t('Schwächung')}</option>
        </Select>
        <Button
          disabled={!name}
          aria-label={t('Effekt hinzufügen')}
          className="!px-3 flex-shrink-0"
          onClick={() => { add.mutate({ name, description: '', icon: kind === 'buff' ? '⬆️' : '⬇️', kind, expiresAt: null }); setName(''); setAdding(false); }}
        ><Plus className="w-4 h-4" /></Button>
        <Button variant="ghost" aria-label={t('Abbrechen')} className="!px-3 flex-shrink-0" onClick={() => { setName(''); setAdding(false); }}><X className="w-4 h-4" /></Button>
      </div>
      </>)}
    </Card>
  );
}

function HpCard({ charId, current, max, temp }: { charId: number; current: number; max: number; temp: number }) {
  const update = useUpdateHp(charId);
  const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
  const color = pct > 50 ? 'bg-emerald-500' : pct > 25 ? 'bg-amber-500' : 'bg-red-600 animate-pulse';

  function adjust(delta: number) {
    if (update.isPending) return;
    update.mutate(delta);
  }

  return (
    <Card className="col-span-full lg:col-span-2">
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-zinc-500 dark:text-zinc-400"><Heart className="w-4 h-4 text-red-500" aria-hidden />{t('Lebenspunkte')}</span>
        <span className="text-xl font-semibold tabular">
          {current}<span className="text-sm text-zinc-500 font-normal"> / {max}</span>
          {temp > 0 && <span className="text-sm text-sky-500 font-semibold" title={t('Temporäre TP')}> +{temp}</span>}
        </span>
      </div>
      <div className="h-2 rounded-full bg-zinc-200 dark:bg-white/[0.06] overflow-hidden mb-3">
        <div className={`h-full rounded-full transition-all duration-300 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {([-10, -5, -1, 1, 5, 10] as const).map((d) => (
          <button key={d} onClick={() => adjust(d)}
            className={`h-8 rounded-md text-xs font-semibold tabular transition active:scale-95 ring-1 ring-inset ${d < 0
              ? 'text-red-600 dark:text-red-400 ring-red-500/25 hover:bg-red-500/10'
              : 'text-emerald-600 dark:text-emerald-400 ring-emerald-500/25 hover:bg-emerald-500/10'}`}>
            {d > 0 ? `+${d}` : d}
          </button>
        ))}
      </div>
      <TempHpInput charId={charId} value={temp} className="mt-2" />
    </Card>
  );
}

const LOAD_LABEL: Record<string, string> = {
  light: t('leicht'), medium: t('mittel'), heavy: t('schwer'), overloaded: t('überladen'),
};

/** Click to spend gold — players can only reduce it; granting more is GM-only (see Gm.tsx). */
function GoldCard({ charId, gold }: { charId: number; gold: number }) {
  const spend = useSpendGold(charId);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');

  function submit() {
    const n = Math.trunc(Math.abs(Number(amount)));
    if (!n || spend.isPending) return;
    spend.mutate(n, { onSuccess: () => { setAmount(''); setOpen(false); } });
  }

  return (
    <Card className="flex flex-col justify-center">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-left" title={t('Gold ausgeben')}>
        <StatLabel icon={Coins}>{t('Gold')}</StatLabel>
        <span className="mt-1 block text-2xl font-semibold tabular text-gold">{gold}</span>
        {!open && <span className="block text-[11px] text-zinc-500">{t('Ausgeben ›')}</span>}
      </button>
      {open && (
        <div className="flex flex-col gap-1.5 mt-2">
          <Input
            type="number" min={1} placeholder={t('Betrag')} value={amount} autoFocus
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            className="!h-9 w-full min-w-0 text-base px-2"
          />
          <Button variant="ghost" className="!h-8 !px-2 text-xs w-full" disabled={spend.isPending || !amount} onClick={submit}>{t('Ausgeben')}</Button>
        </div>
      )}
    </Card>
  );
}

function StatLabel({ icon: Icon, children }: { icon: LucideIcon; children: string }) {
  return (
    <span className="flex items-center gap-2 text-[13px] font-semibold text-zinc-500 dark:text-zinc-400 min-w-0" title={children}>
      <Icon className="hidden sm:block w-4 h-4 flex-shrink-0" strokeWidth={1.75} aria-hidden /><span className="truncate">{children}</span>
    </span>
  );
}

function StatCard({ icon: Icon, label, short, value, sub }: { icon: LucideIcon; label: string; short?: string | null; value: number | string; sub?: string }) {
  return (
    <Card className="flex flex-col justify-center">
      {/* Phones: the short label (tiles are narrow); wider: the full label, up to two lines. */}
      <span className="flex items-start gap-2 text-[13px] font-semibold leading-snug text-zinc-500 dark:text-zinc-400 min-w-0" title={label}>
        <Icon className="hidden sm:block w-4 h-4 mt-px flex-shrink-0" strokeWidth={1.75} aria-hidden />
        <span className="sm:hidden truncate">{short || label}</span>
        <span className="hidden sm:block line-clamp-2">{label}</span>
      </span>
      <span className="mt-1 text-2xl font-semibold tabular">{value}</span>
      {sub && <span className="hidden sm:block text-xs leading-snug text-zinc-500 line-clamp-2">{sub}</span>}
    </Card>
  );
}

/** Icons a rule package can pick for its quick stats (layout.json → quickStats[].icon). */
const QUICK_ICONS: Record<string, LucideIcon> = {
  shield: Shield, zap: Zap, star: Star, sparkles: Sparkles, target: Target, swords: Swords, footprints: Footprints, eye: Eye, heart: Heart, brain: Brain,
};

const signed = (v: number) => `${v >= 0 ? '+' : ''}${v}`;

/** Label/value row for the combat sheet. */
function Row({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-zinc-200/70 dark:border-white/[0.05] text-sm">
      <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
      <span className="font-semibold tabular">{value}</span>
    </div>
  );
}

/** Full-screen death overlay with CSS blood splatters, shown at 0 HP.
 *  pointer-events-none so the HP heal buttons underneath stay usable (revive). */
function DeadOverlay() {
  return (
    <div className="fixed inset-0 z-40 pointer-events-none flex items-center justify-center">
      <div className="absolute inset-0 bg-black/55" />
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at center, transparent 35%, rgba(90,0,0,0.7) 100%)' }}
      />
      {/* irregular blood splatters */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(circle at 12% 18%, rgba(130,0,0,0.9) 0 2.4vw, transparent 2.8vw),
            radial-gradient(circle at 85% 12%, rgba(110,0,0,0.85) 0 1.6vw, transparent 2vw),
            radial-gradient(circle at 78% 82%, rgba(140,0,0,0.9) 0 2.9vw, transparent 3.3vw),
            radial-gradient(circle at 20% 84%, rgba(120,0,0,0.85) 0 2vw, transparent 2.4vw),
            radial-gradient(circle at 50% 28%, rgba(100,0,0,0.6) 0 1vw, transparent 1.3vw),
            radial-gradient(circle at 63% 55%, rgba(120,0,0,0.5) 0 0.7vw, transparent 1vw),
            radial-gradient(circle at 33% 52%, rgba(110,0,0,0.55) 0 0.6vw, transparent 0.9vw)
          `,
        }}
      />
      <div className="relative text-center select-none">
        <div className="text-7xl mb-2 drop-shadow-[0_3px_10px_rgba(0,0,0,0.9)]">💀</div>
        <div className="text-6xl sm:text-7xl font-black tracking-[0.3em] text-red-700 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
          {t('DEAD')}
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { list, character } = useActive();
  const setActive = useActiveChar((s) => s.setActive);
  const skillSheet = useSkillSheet(character.data?.id ?? null);
  const setToggle = useSetToggle(character.data?.id ?? 0);
  const [allSkills, setAllSkills] = useState(false);
  const spellbook = useSpellbook(character.data?.id ?? null);
  const ammo = useAmmo(character.data?.id ?? null).data ?? [];
  const layout = useRuleLayout().data?.layout;
  // Dashboard tab; remembered per device.
  const [tab, setTab] = useState<string>(() => { try { return localStorage.getItem('pf-dash-tab') ?? 'combat'; } catch { return 'combat'; } });
  const chooseTab = (t: string) => { setTab(t); try { localStorage.setItem('pf-dash-tab', t); } catch { /* private mode */ } };

  if (list.isLoading) return <div className="p-4 text-zinc-500">{t('Lädt…')}</div>;
  if ((list.data?.length ?? 0) === 0)
    return (
      <div className="p-4">
        <Card className="text-center space-y-3">
          <p className="text-zinc-400">{t('Noch kein Charakter vorhanden.')}</p>
          <Link to="/character"><Button>{t('Charakter erstellen')}</Button></Link>
        </Card>
      </div>
    );

  const c: Character | undefined = character.data;
  if (!c) return <div className="p-4 text-zinc-500">{t('Lädt…')}</div>;

  const recent = [...c.items].slice(-4).reverse();
  const multi = (list.data?.length ?? 0) > 1;

  const d = c.derived;
  // Packages without quickStats: armor class and initiative, as before.
  const quick = layout?.quickStats ?? [
    { key: 'ac', label: t('Rüstungsklasse'), short: t('RK'), format: 'number' as const, detail: layout?.armorDetail, icon: 'shield' },
    { key: 'initiative', label: t('Initiative'), short: t('Init'), format: 'signed' as const, icon: 'zap' },
  ];
  const attributesSection = (
<div>
            <SectionTitle>{t('Attribute')}</SectionTitle>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {layout?.abilities.map(({ key: a, label }) => {
                const mod = d.modifiers[a] ?? 0;
                return (
                  <div key={a} className="rounded-xl bg-zinc-100 dark:bg-white/[0.03] ring-1 ring-inset ring-zinc-200 dark:ring-white/[0.06] py-3 text-center">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</div>
                    <div className="mt-1 text-2xl font-semibold tabular">{signed(mod)}</div>
                    <div className="text-xs text-zinc-500 tabular">{d.scores[a] ?? '—'}</div>
                  </div>
                );
              })}
            </div>
          </div>
  );
  const combatSection = (
<div>
            <SectionTitle
              action={
                <span className="text-xs text-zinc-500">
                  {t('Belastung')}{' '} <span className={d.load === 'light' ? 'text-emerald-500' : d.load === 'overloaded' ? 'text-red-500' : 'text-amber-500'}>{LOAD_LABEL[d.load] ?? d.load}</span>
                  {' '}· {kilos(Math.round(d.carriedWeight))}/{kilos(d.carryCapacity)}{d.armorCheckPenalty ? t(' · Rüstungsmalus {armorCheckPenalty}', { armorCheckPenalty: d.armorCheckPenalty }) : ''}
                </span>
              }
            >{t('Kampf')}</SectionTitle>
            <div className="grid sm:grid-cols-2 gap-x-8">
              {layout?.combatStats.map((st) => <Row key={st.key} label={st.label} value={formatStat(st, d)} />)}
              {(d.spellFailure ?? 0) > 0 && <Row label={t('Arkane Zauberpatzer')} value={`${d.spellFailure} %`} />}
            </div>
            {/* Switch combat options on/off; the values above and the attack lines update. */}
            {(d.toggles?.length ?? 0) > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {d.toggles!.map((t) => (
                  <button key={t.key} title={t.effect} disabled={setToggle.isPending}
                    onClick={() => setToggle.mutate({ key: t.key, active: !t.active })}
                    className={`text-xs px-2 py-1 rounded-full border ${t.active ? 'bg-gold/20 border-gold text-gold font-semibold' : 'border-zinc-300 dark:border-white/10 text-zinc-500'}`}>
                    {t.active ? '● ' : '○ '}{t.label}
                  </button>
                ))}
              </div>
            )}
            {d.toggles?.filter((t) => t.active).map((t) => <div key={t.key} className="text-xs text-gold mt-1">{t.label}: {t.effect}</div>)}
            {(d.situational?.length ?? 0) > 0 && (
              <div className="mt-2 space-y-0.5">
                {d.situational!.map((l) => <div key={l} className="text-xs text-zinc-500">{l}</div>)}
              </div>
            )}
            {/* One line per equipped weapon: iterative attacks, damage and critical incl. feats and proficiency. */}
            {(d.attacks?.length ?? 0) > 0 && (
              <div className="mt-3 space-y-2">
                {d.attacks!.map((a, i) => (
                  <div key={i} className="text-sm border-b border-zinc-200/70 dark:border-white/[0.05] pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{a.name}{a.hand ? <span className="text-xs text-zinc-500"> · {a.hand}</span> : null}</span>
                      <span className="font-semibold tabular">{a.bonuses.map(signed).join('/')}</span>
                    </div>
                    <div className="text-xs text-zinc-500">{t('Schaden {damage} · Krit {crit}', { damage: a.damage, crit: a.crit })}</div>
                    {ammoFor(a.weaponKey, ammo).map((m) => <div key={m.name} className="text-xs text-zinc-500">{t('Munition: {name} ×{count}', { name: m.name, count: m.count })}</div>)}
                    {a.notes.map((n) => <div key={n} className={`text-xs ${a.proficient ? 'text-zinc-500' : 'text-red-500'}`}>{n}</div>)}
                  </div>
                ))}
              </div>
            )}
          </div>
  );
  const skillsSection = (skillSheet.data?.skills.length ?? 0) > 0 && (
            <div>
              <SectionTitle action={<span className="text-xs text-zinc-500"><span className="inline-block w-1.5 h-1.5 rounded-full bg-gold align-middle mr-1" />{t('Klassenfertigkeit')}</span>}>{t('Fertigkeiten')}</SectionTitle>
              <div className="grid sm:grid-cols-2 gap-x-8">
                {skillSheet.data!.skills.map((s) => (
                  <div key={s.key} className={`${s.isClassSkill || allSkills ? 'flex' : 'hidden sm:flex'} items-center justify-between py-1.5 border-b border-zinc-200/70 dark:border-white/[0.05] text-sm`}>
                    <span className={`flex items-center gap-2 ${s.isClassSkill ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${s.isClassSkill ? 'bg-gold' : 'bg-transparent'}`} />
                      {s.name}
                    </span>
                    <span className="font-medium tabular">{signed(s.total)}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setAllSkills((v) => !v)} className="sm:hidden mt-3 w-full h-9 rounded-lg text-sm text-gold ring-1 ring-inset ring-gold/30">
                {allSkills ? t('Nur Klassenfertigkeiten') : t('Alle {length} Fertigkeiten anzeigen', { length: skillSheet.data!.skills.length })}
              </button>
            </div>
          );
  const recentSection = (
<div>
            <SectionTitle action={<Link to="/inventory" className="text-xs text-gold hover:underline">{t('Inventar')}</Link>}>{t('Zuletzt erhalten')}</SectionTitle>
            {recent.length === 0 ? (
              <p className="text-zinc-500 text-sm">{t('Noch keine Gegenstände.')}</p>
            ) : (
              <ul className="-my-1">
                {recent.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 py-1.5 text-sm">
                    <span className={`w-8 h-8 rounded-lg grid place-items-center bg-zinc-100 dark:bg-white/[0.04] ring-1 ring-inset ${RARITY_RING[i.template.rarity]} ${RARITY_TEXT[i.template.rarity]}`}>
                      <ItemIcon iconKey={i.template.iconKey} />
                    </span>
                    <span className="truncate">{i.template.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
  );
  const caster = !!spellbook.data?.type;
  const tabs = [
    { id: 'combat', label: t('Kampf') }, { id: 'abilities', label: t('Fähigkeiten') },
    ...(caster ? [{ id: 'spells', label: t('Zauber') }] : []),
    { id: 'skills', label: t('Fertigkeiten') }, { id: 'notes', label: t('Notizen') },
  ] as const;
  const panes: Record<string, ReactNode[]> = {
    combat: [attributesSection, combatSection, <TalentsSection c={c} />],
    abilities: [<ResourcesSection c={c} />, <RaceSection c={c} />, <>{classLevels(c).map((x, _i, all) => <ClassFeatures key={x.classId} bare compact charId={c.id} className={x.classId} level={x.level} choices={c.featureChoices}
      heading={all.length > 1 ? className(layout, x.classId) : undefined} />)}</>],
    spells: [<SpellOverview c={c} />],
    skills: [skillsSection],
    notes: [recentSection],
  };
  // A remembered tab that doesn't apply (no spells, "Notizen" on desktop) falls back to Kampf.
  const desktop = typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1024px)').matches;
  const shown = tabs.some((t) => t.id === tab) && !(tab === 'notes' && desktop) ? tab : 'combat';

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {c.currentHp <= 0 && <DeadOverlay />}

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[radial-gradient(circle_at_35%_30%,#f6e7c4,#d8c08e)] grid place-items-center text-3xl overflow-hidden border-[3px] border-[#a87a1f] shadow-[0_0_0_3px_#3b2416,0_6px_14px_rgba(0,0,0,.5)] flex-shrink-0">
          {c.portraitUrl ? <img src={c.portraitUrl} alt={c.name} className="w-full h-full object-cover" /> : '🧙'}
        </div>
        <div className="relative flex-1 min-w-0">
          <h1 className="flex items-center gap-1 text-xl sm:text-3xl font-semibold tracking-tight">
            <span className="truncate">{c.name || t('Unbenannt')}</span>
            {multi && <ChevronDown className="w-5 h-5 flex-shrink-0 text-zinc-500" aria-hidden />}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <span>{c.race} · {classLine(layout, c)}</span>
            <span className="px-2 py-0.5 rounded-md bg-black/35 text-[#e8c873] text-xs font-semibold">{t('Stufe {level}', { level: c.level })}</span>
          </div>
          {/* Invisible native select over the name: tapping the name opens the OS character picker. */}
          {multi && (
            <select value={c.id} onChange={(e) => setActive(Number(e.target.value))} aria-label={t('Charakter wechseln')}
              className="absolute inset-0 w-full opacity-0 cursor-pointer">
              {list.data!.map((ch) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
            </select>
          )}
        </div>
        <DiceRoller character={c} />
      </div>

      {/* Vitals: hit points, the rule package's quick stats, gold. Phones: hit points on their own row. */}
      <div className="grid gap-3 sm:gap-4 [grid-template-columns:repeat(var(--cols),minmax(0,1fr))] lg:[grid-template-columns:repeat(var(--cols-lg),minmax(0,1fr))]"
        style={{ '--cols': quick.length + 1, '--cols-lg': quick.length + 3 } as React.CSSProperties}>
        <HpCard charId={c.id} current={c.currentHp} max={d.maxHp} temp={c.tempHp ?? 0} />
        {quick.map((q) => (
          <StatCard key={q.key} icon={QUICK_ICONS[q.icon ?? ''] ?? Star} label={q.label} short={q.short} value={formatStat(q, d)}
            sub={q.detail ? fillTemplate(q.detail, d) : undefined} />
        ))}
        <GoldCard charId={c.id} gold={c.gold} />
      </div>

      {/* Mobile: status effects right under the vitals — they change every round. Desktop: right column. */}
      <div className="lg:hidden"><StatusEffects charId={c.id} /></div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 items-start">
        <div className="lg:col-span-2">
          {/* Index tabs (Karteireiter) on one panel; "Notizen" only on phones — desktop keeps the right column. */}
          <div className="flex gap-[3px] px-2.5 -mb-px relative z-[2]" role="tablist">
            {tabs.map((t) => (
              <button key={t.id} role="tab" aria-selected={shown === t.id} onClick={() => chooseTab(t.id)}
                className={`dash-tab ${t.id === 'notes' ? 'lg:hidden' : ''}`}>{t.label}</button>
            ))}
          </div>
          <Card>
            {panes[shown].map((section, i) => (
              <div key={i} className={i ? 'mt-6 pt-5 border-t border-zinc-200/70 dark:border-white/[0.08]' : ''}>{section}</div>
            ))}
          </Card>
          {shown === 'notes' && <div className="mt-4"><NoteCards /></div>}
        </div>

        <div className="hidden lg:block space-y-4 sm:space-y-6">
          <StatusEffects charId={c.id} />
          <SpellSummary charId={c.id} />
          <Card>{recentSection}</Card>
          <NoteCards />
        </div>
      </div>
    </div>
  );
}
