import { useState } from 'react';
import { useActive } from '../lib/useActive';
import { useAllClassFeatures, useCreateFeat, useWeapons, useDeleteFeat, useFeats, useRuleLayout, useSetFeat, useSkillSheet, useSpellbook, useSpellSlots } from '../lib/queries';
import { useAuth } from '../store/auth';
import { useToasts } from '../store/toast';
import { Button, Card, Field, Input, Select } from '../components/ui';
import type { Feat, FeatSlot } from '../lib/types';
import { SCHOOLS, featConfig, assignSlots, choiceOptions, featKey, featureReqs, isCore, prereqKeys, slotAccepts } from '../lib/featTree';
import { FeatTree, type FeatGate } from '../components/FeatTree';
import { t } from '../lib/i18n';
import { classLevels } from '../lib/stats';

const norm2 = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');



export function FeatsPage() {
  const { character } = useActive();
  const c = character.data;
  const feats = useFeats('', ''); // load all once, filter client-side
  const skillsheet = useSkillSheet(c?.id ?? null);
  const slots = useSpellSlots(c?.id ?? null);
  const casterLevel = useSpellbook(c?.id ?? null).data?.casterLevel ?? 0;
  // Casting classes and their kind of magic come from the rule package (prerequisites like "arcane spellcaster").
  const layout = useRuleLayout().data?.layout;
  const cfg = featConfig(layout);
  const classes = layout?.classes ?? [];
  const CASTER_CLASSES = new Set(classes.filter((k) => k.caster).map((k) => k.key));
  const ARCANE = new Set(classes.filter((k) => k.tradition === 'arcane').map((k) => k.key));
  const DIVINE = new Set(classes.filter((k) => k.tradition === 'divine').map((k) => k.key));
  const myClasses = c ? classLevels(c) : [];
  const classFeatures = useAllClassFeatures(myClasses, c?.level ?? 1);
  const hasClass = (set: Set<string>) => myClasses.some((x) => set.has(x.classId));
  const setFeat = useSetFeat(c?.id ?? 0);
  const toast = useToasts((s) => s.push);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [onlyEligible, setOnlyEligible] = useState(true);
  const [onlyCustom, setOnlyCustom] = useState(false);
  // "Nur Grundregelwerk": on by default; the choice is remembered per device (like the spell library).
  const [coreOnly, setCoreOnly] = useState(() => {
    try { return localStorage.getItem('pf-feats-core-only') !== '0'; } catch { return true; }
  });
  // Tree or list view; remembered per device.
  const [view, setView] = useState<'tree' | 'list'>(() => {
    try { return localStorage.getItem('pf-feats-view') === 'list' ? 'list' : 'tree'; } catch { return 'tree'; }
  });
  const switchView = (v: 'tree' | 'list') => {
    setView(v);
    try { localStorage.setItem('pf-feats-view', v); } catch { /* private mode */ }
  };
  const toggleCoreOnly = (v: boolean) => {
    setCoreOnly(v);
    try { localStorage.setItem('pf-feats-core-only', v ? '1' : '0'); } catch { /* private mode */ }
  };
  const createFeat = useCreateFeat();
  const deleteFeat = useDeleteFeat();
  const myId = useAuth((s) => s.userId);
  const isGm = useAuth((s) => s.isGm());
  const [creating, setCreating] = useState(false);
  const weapons = useWeapons();
  // Feat waiting for its choice (weapon / skill / school) before it is learned.
  const [choosing, setChoosing] = useState<Feat | null>(null);
  const [draft, setDraft] = useState({ name: '', type: '', prerequisites: '', benefit: '' });

  if (!c) return <div className="p-4 text-zinc-500">{t('Kein Charakter ausgewählt.')}</div>;

  const all = feats.data ?? [];
  const byId = new Map(all.map((f) => [f.id, f]));
  // Feat instances (a feat taken for several weapons appears once per choice).
  const instances = (c.feats ?? (c.featIds ?? []).map((id) => ({ id, name: byId.get(id)?.name ?? '', choice: null })))
    .filter((i) => byId.has(i.id));
  const selectedIds = instances.map((i) => i.id);
  const selected = instances.map((i) => byId.get(i.id)!);
  const takenChoices = (name: string) =>
    instances.filter((i) => featKey(i.name) === featKey(name) && i.choice).map((i) => i.choice!);
  const skillRows = (skillsheet.data?.skills ?? []).map((s) => ({ key: s.key, name: s.name }));
  const optionsFor = (f: Feat) => choiceOptions(f, takenChoices, weapons.data ?? [], c.proficientWeapons ?? [], skillRows, cfg);
  const choiceLabel = (f: Feat, choice?: string | null) => {
    if (!choice) return '';
    const kind = cfg.choices[featKey(f.name)];
    return kind === 'weapon' ? weapons.data?.find((w) => w.key === choice)?.name ?? choice
      : kind === 'school' ? SCHOOLS.find((x) => x.key === choice)?.label ?? choice
        : skillRows.find((x) => x.key === choice)?.name ?? choice;
  };
  const budget = c.derived.featBudget;
  const featSlots: FeatSlot[] = c.featSlots
    ?? [{ id: 'general', label: t('Allgemein'), count: budget, ignorePrereqs: false, types: [], names: [], any: true }];
  const byKey = new Map(all.map((f) => [featKey(f.name), f]));
  // Feats the class grants (proficiencies, Endurance, …): known for prerequisites, cost no slot.
  const granted = (c.grantedFeats ?? []).map((n) => byKey.get(featKey(n))).filter(Boolean) as Feat[];
  // Which slot each chosen feat fills; null = they no longer fit (e.g. after a class or level change).
  const slotOf = assignSlots(selected, featSlots, (f, s) => slotAccepts(s, f));
  const used = (id: string) => slotOf?.filter((s) => s === id).length ?? 0;
  // Ranger/monk get one slot per bonus-feat level (same id); show them as one line.
  const slotSummary = [...new Set(featSlots.map((s) => s.id))].map((id) => {
    const group = featSlots.filter((s) => s.id === id);
    return `${group[0].label} ${used(id)}/${group.reduce((n, s) => n + s.count, 0)}`;
  }).join(' · ');

  const featKeys = new Set(all.map((f) => featKey(f.name)));
  const selectedKeys = new Set([...selected, ...granted].map((f) => featKey(f.name)));
  const isCaster = (slots.data?.length ?? 0) > 0;
  const charRace = norm2(c.raceKey ?? '');
  // Skill ranks by normalized key/name (feat prereqs use English skill names = our keys).
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  const ranksBy = new Map<string, number>();
  for (const s of skillsheet.data?.skills ?? []) {
    ranksBy.set(norm(s.key), s.ranks);
    ranksBy.set(norm(s.name), s.ranks);
  }

  /**
   * Best-effort prerequisite check. 'never' = this class/race can't ever take it (other class's
   * feature or levels, other race, wrong kind of caster); 'locked' = not yet (scores, BAB, level,
   * ranks, missing feats). Class-feature prereqs (free text) can't all be verified → lenient.
   */
  function gate(f: Feat, why: string[] = []): FeatGate {
    // Metamagic and item-creation feats need the ability to cast spells.
    if (/metamagic|item creation/i.test(f.type)) {
      if (!hasClass(CASTER_CLASSES)) return 'never';
      if (!isCaster) return 'locked';
    }

    const p = (f.prerequisites || '').trim();
    if (!p || p === '—') return 'ok';
    // Typographic apostrophes ("hunter’s bond") must match the keys below.
    const pl = p.toLowerCase().replace(/’/g, "'");
    // Class-feature prerequisites, checked against the dashboard: feature gained at this level, right option chosen.
    const byFeature = featureReqs(pl, classFeatures, c!.level, c!.featureChoices ?? {}, cfg);
    if (byFeature.state === 'never') return 'never';
    let later = byFeature.state === 'locked';
    why.push(...byFeature.why);
    // Class-level requirements like "fighter 3" (the package's class ids and names) — needs that many levels in that class
    // (a class the character doesn't have counts as never; taking it later changes that).
    for (const k of classes) {
      const names = [k.key, k.name].map((x) => x.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      for (const m of pl.matchAll(new RegExp(`(?:^|[\\s,;(])(?:${names})\\s+(?:level\\s+|stufe\\s+)?(\\d+)`, 'gu'))) {
        const own = myClasses.find((x) => x.classId === k.key);
        if (!own) return 'never';
        if (own.level < Number(m[1])) later = true;
      }
    }
    if (/arcane spellcaster|cast arcane spells|arcane caster/i.test(pl) && !hasClass(ARCANE)) return 'never';
    // "ability to cast ranger spells" / "druid or ranger spells" — unless another way is offered ("Nature Magic or …").
    const castBy = pl.match(/cast ((?:[a-z]+ or )*[a-z]+) spells/);
    if (castBy && !/ or the ability to cast/.test(pl)) {
      const by = castBy[1].split(' or ');
      if (by.every((x) => CASTER_CLASSES.has(x)) && !myClasses.some((x) => by.includes(x.classId))) return 'never';
    }
    if (/divine spellcaster|cast divine spells|divine caster/i.test(pl) && !hasClass(DIVINE)) return 'never';
    // Racial feats: a race named as a prerequisite must be the character's race.
    for (const part of p.split(/[,;]/)) {
      const t = norm2(part.replace(/\([^)]*\)/g, ''));
      if (cfg.ancestries.has(t) && t !== charRace) return 'never';
    }
    if (later) return 'locked';
    // "Str 13", "STR 13", "STÄ 13", "Strength 13": the package's ability keys, labels and names.
    for (const a of layout?.abilities ?? []) {
      const names = [a.key, a.label, a.name].filter(Boolean).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      for (const m of p.matchAll(new RegExp(`(?:^|[\\s,;(])(?:${names})\\s+(\\d+)`, 'giu')))
        if ((c!.derived.scores[a.key] ?? 10) < Number(m[1])) return 'locked';
    }
    const bab = p.match(/(?:base attack bonus|BAB)\s*\+?\s*(\d+)/i);
    if (bab && c!.derived.bab < Number(bab[1])) return 'locked';
    const clvl = p.match(/(?:character level|charakterstufe)\s+(\d+)/i);
    if (clvl && c!.level < Number(clvl[1])) return 'locked';
    const cl = p.match(/(?:\bCL\b|caster level)\s+(\d+)/i);
    if (cl && casterLevel < Number(cl[1])) return 'locked';
    for (const m of p.matchAll(/([A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+)*)\s+(\d+)\s+ranks?/g)) {
      const have = ranksBy.get(norm(m[1]));
      if (have !== undefined && have < Number(m[2])) return 'locked';
    }
    // Feat prerequisites, matched by featKey ("Great Cleave" in the text = "Cleave, Great" in the compendium).
    if (prereqKeys(p, featKeys).some((k) => !selectedKeys.has(k))) return 'locked';
    return 'ok';
  }
  /** Can the feat be learned now: prerequisites met (or a monk/ranger slot that ignores them) and a fitting slot free. */
  function learnable(f: Feat): FeatGate {
    // Taken already: only feats with a choice (another weapon/skill/school) or "Extra …" feats again.
    const kind = cfg.choices[featKey(f.name)];
    if (selectedKeys.has(featKey(f.name)) && !kind && !cfg.repeatable.has(featKey(f.name))) return 'locked';
    if (kind && optionsFor(f).length === 0) return 'locked';
    const g = gate(f);
    const fits = (slot: (s: FeatSlot) => boolean) => assignSlots(
      [...selected.map((x) => ({ f: x, cand: false })), { f, cand: true }], featSlots,
      (it, s) => slotAccepts(s, it.f) && (!it.cand || slot(s))) !== null;
    if (g === 'ok' && fits(() => true)) return 'ok';
    if (fits((s) => s.ignorePrereqs)) return 'ok';
    if (g === 'never' && !featSlots.some((s) => s.ignorePrereqs && slotAccepts(s, f))) return 'never';
    return 'locked';
  }
  const whyNot = (f: Feat) => {
    const why: string[] = [];
    return gate(f, why) !== 'ok' ? why[0] ?? t('Voraussetzungen noch nicht erfüllt.') : t('Kein passender Talentplatz frei.');
  };

  const types = [...new Set(all.map((f) => f.type.split(',')[0].trim()).filter(Boolean))].sort();
  const q = search.trim().toLowerCase();
  const browse = all
    .filter((f) => !selectedIds.includes(f.id)
      && (!q || f.name.toLowerCase().includes(q))
      && (!type || f.type.includes(type))
      && (!onlyCustom || !!f.createdByUserId)
      // Core sources come from the rule package; "Nur eigene" wins so the two boxes don't cancel out.
      && (!coreOnly || onlyCustom || isCore(f, cfg))
      && !selectedKeys.has(featKey(f.name))
      && (!onlyEligible || learnable(f) === 'ok'))
    .slice(0, 150);

  async function add(f: Feat, choice?: string) {
    if (cfg.choices[featKey(f.name)] && !choice) { setChoosing(f); return; }
    try { await setFeat.mutateAsync({ featId: f.id, add: true, choice }); }
    catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Fehler';
      toast({ title: t('Nicht möglich'), message: msg });
    }
  }

  const errMsg = (e: unknown, fallback: string) =>
    (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

  async function createCustom() {
    try {
      const f = await createFeat.mutateAsync(draft);
      toast({ title: t('Talent erstellt'), message: t('{name} ist jetzt für alle sichtbar.', { name: f.name }) });
      setDraft({ name: '', type: '', prerequisites: '', benefit: '' });
      setCreating(false);
    } catch (e) { toast({ title: t('Nicht möglich'), message: errMsg(e, t('Talent konnte nicht erstellt werden.')) }); }
  }

  async function removeCustom(f: Feat) {
    if (!confirm(t('Talent „{name}" für alle löschen? Charaktere, die es gewählt haben, verlieren es.', { name: f.name }))) return;
    await deleteFeat.mutateAsync(f.id);
    toast({ title: t('Talent gelöscht'), message: f.name });
  }

  const canDelete = (f: Feat) => !!f.createdByUserId && (f.createdByUserId === myId || isGm);
  const customBadge = (f: Feat) => f.createdByUserId && (
    <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-500/10 text-sky-500 align-middle" title={t('Eigenes Talent von {v}', { v: f.createdByName || 'unbekannt' })}>
      {t('Eigenes')}{f.createdByName ? ` · ${f.createdByName}` : ''}
    </span>
  );

  return (
    <div className="p-4 space-y-4">
      {view === 'list' && <Card>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gold">{t('Talente')}</h1>
          <span className={`text-sm font-medium ${slotOf ? 'text-zinc-400' : 'text-red-400'}`}> {t('{length}/{budget} gewählt', { length: selected.length, budget })} </span>
        </div>
        <p className="text-xs text-zinc-500 mt-1">{slotSummary}</p>
        {!slotOf && <p className="text-xs text-red-400 mt-1">{t('Die gewählten Talente passen nicht mehr in die Talentplätze — entferne eines.')}</p>}
        {selected.length === 0 && <p className="text-sm text-zinc-500 mt-2">{t('Noch keine Talente gewählt.')}</p>}
        <ul className="mt-2 space-y-1">
          {granted.length > 0 && (
            <li className="border-t border-zinc-200/40 dark:border-zinc-800 pt-1 text-xs text-zinc-500">
              <span className="mr-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-600 align-middle">{t('Klasse')}</span>
              {granted.map((f) => f.name).join(', ')}
            </li>
          )}
          {selected.map((f, i) => (
            <li key={`${f.id}-${instances[i].choice ?? i}`} className="flex items-start justify-between gap-2 border-t border-zinc-200/40 dark:border-zinc-800 pt-1">
              <span>
                <span className="font-medium">{f.name}</span>
                {instances[i].choice && <span className="font-medium"> ({choiceLabel(f, instances[i].choice)})</span>}
                {customBadge(f)}
                {slotOf && new Set(featSlots.map((s) => s.id)).size > 1 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-500/10 text-zinc-500 align-middle">
                    {featSlots.find((s) => s.id === slotOf[i])?.label}
                  </span>
                )}
                <span className="text-xs text-zinc-500"> · {f.type}</span>
                <p className="text-xs text-zinc-500">{f.benefit}</p>
              </span>
              <Button className="text-xs py-1 shrink-0" onClick={() => setFeat.mutate({ featId: f.id, add: false, choice: instances[i].choice })}>{t('Entfernen')}</Button>
            </li>
          ))}
        </ul>
      </Card>}

      <div className="flex gap-2" role="tablist">
        <Button variant={view === 'tree' ? undefined : 'ghost'} className="flex-1" onClick={() => switchView('tree')}>{t('Talentbaum')}</Button>
        <Button variant={view === 'list' ? undefined : 'ghost'} className="flex-1" onClick={() => switchView('list')}>{t('Liste & Suche')}</Button>
      </div>

      {view === 'tree' && (
        <FeatTree feats={all} selectedIds={selectedIds} grantedIds={granted.map((f) => f.id)} status={learnable} whyNot={whyNot}
          warning={slotOf ? undefined : t('Die gewählten Talente passen nicht mehr in die Talentplätze — entferne eines.')}
          summary={slotSummary} busy={setFeat.isPending}
          onLearn={add} onForget={(f) => setFeat.mutate({ featId: f.id, add: false })} />
      )}

      {view === 'list' && <Card className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="rubric">{t('Talent lernen')}</h2>
          <Button variant="ghost" className="!h-8 !px-3 text-xs" onClick={() => setCreating((v) => !v)}>
            {creating ? t('Abbrechen') : t('+ Eigenes Talent')}
          </Button>
        </div>
        {creating && (
          <div className="rounded-xl ring-1 ring-inset ring-zinc-200 dark:ring-white/10 p-3 space-y-3">
            <p className="text-xs text-zinc-500">{t('Eigene Talente landen im gemeinsamen Kompendium — alle Spieler können sie sehen und wählen.')}</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label={t('Name *')}><Input value={draft.name} maxLength={100} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
              <Field label={t('Typ')}><Input value={draft.type} maxLength={60} placeholder={t('z.B. Combat, General')} onChange={(e) => setDraft({ ...draft, type: e.target.value })} /></Field>
            </div>
            <Field label={t('Voraussetzungen')}><Input value={draft.prerequisites} maxLength={1000} placeholder={t('z.B. Str 13, BAB +1')} onChange={(e) => setDraft({ ...draft, prerequisites: e.target.value })} /></Field>
            <Field label={t('Vorteil *')}>
              <textarea rows={3} maxLength={4000} value={draft.benefit} onChange={(e) => setDraft({ ...draft, benefit: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-white/10 outline-none focus:border-gold focus:ring-2 focus:ring-gold/20" />
            </Field>
            <Button onClick={createCustom} disabled={!draft.name.trim() || !draft.benefit.trim() || createFeat.isPending}>{t('Talent erstellen')}</Button>
          </div>
        )}
        <div className="flex gap-2">
          <Input placeholder={t('Suche…')} value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={type} onChange={(e) => setType(e.target.value)} className="w-40">
            <option value="">{t('Alle Typen')}</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input type="checkbox" checked={onlyEligible} onChange={(e) => setOnlyEligible(e.target.checked)} />
          {t('Nur Talente mit erfüllten Voraussetzungen')}
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input type="checkbox" checked={onlyCustom} onChange={(e) => setOnlyCustom(e.target.checked)} />
          {t('Nur eigene Talente (von Spielern erstellt)')}
        </label>
        {cfg.core.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <input type="checkbox" checked={coreOnly} onChange={(e) => toggleCoreOnly(e.target.checked)} />
            {t('Nur Grundregelwerk')}
          </label>
        )}
        {feats.isLoading && <p className="text-sm text-zinc-500">{t('Lädt…')}</p>}
        {!feats.isLoading && all.length === 0 && <p className="text-sm text-zinc-500">{t('Kompendium leer — noch keine Talente importiert.')}</p>}
        <div className="max-h-96 overflow-auto space-y-1">
          {browse.map((f) => (
            <div key={f.id} className="flex items-start justify-between gap-2 border-t border-zinc-200/40 dark:border-zinc-800 pt-1">
              <div>
                <span className="font-medium">{f.name}</span>{customBadge(f)}
                <span className="text-xs text-zinc-500"> · {f.type}</span>
                {f.prerequisites && f.prerequisites !== '—' && (
                  <p className="text-xs text-amber-400">{t('Voraussetzung: {prerequisites}', { prerequisites: f.prerequisites })}</p>
                )}
                <p className="text-xs text-zinc-500">{f.benefit}</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                {canDelete(f) && (
                  <Button variant="ghost" className="!h-8 !px-2 text-xs text-red-500" disabled={deleteFeat.isPending} onClick={() => removeCustom(f)}>{t('Löschen')}</Button>
                )}
                <Button
                  className="!h-8 text-xs"
                  disabled={learnable(f) !== 'ok' || setFeat.isPending}
                  title={learnable(f) !== 'ok' ? whyNot(f) : undefined}
                  onClick={() => add(f)}
                >{t('+ Wählen')}</Button>
              </div>
            </div>
          ))}
          {!feats.isLoading && browse.length === 0 && all.length > 0 && (
            <p className="text-sm text-zinc-500">{t('Keine Treffer.')}</p>
          )}
        </div>
      </Card>}
      {choosing && (
        <ChoiceDialog feat={choosing} options={optionsFor(choosing)} busy={setFeat.isPending}
          onPick={(choice) => { const f = choosing; setChoosing(null); add(f, choice); }} onClose={() => setChoosing(null)} />
      )}
    </div>
  );
}

/** Pick the weapon / skill / school for a feat like Weapon Focus before learning it. */
function ChoiceDialog({ feat, options, busy, onPick, onClose }: {
  feat: Feat; options: { value: string; label: string }[]; busy: boolean; onPick: (choice: string) => void; onClose: () => void;
}) {
  const [value, setValue] = useState(options[0]?.value ?? '');
  const kind = featConfig(useRuleLayout().data?.layout).choices[featKey(feat.name)];
  return (
    <div className="sb">
      <div className="sb-sheet-bg" onClick={onClose}>
        <div role="dialog" className="sb-sheet sb-page" onClick={(e) => e.stopPropagation()}>
          <div className="sb-kapitel">{kind === 'weapon' ? t('Waffe wählen') : kind === 'skill' ? t('Fertigkeit wählen') : t('Schule wählen')}</div>
          <div className="sb-title">{feat.name}</div>
          {options.length === 0 ? <p className="sb-hint">{t('Keine passende Auswahl mehr frei.')}</p> : (
            <select className="sb-input" value={value} onChange={(e) => setValue(e.target.value)} aria-label={t('Auswahl')}>
              {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="sb-btn sb-btn--gold" disabled={busy || !value} onClick={() => onPick(value)}>{t('✒ Lernen')}</button>
            <button className="sb-btn sb-btn--line" onClick={onClose}>{t('Abbrechen')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
