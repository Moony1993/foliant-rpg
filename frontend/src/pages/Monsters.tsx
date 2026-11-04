import { useState } from 'react';
import { useCreateMonster, useUpdateMonster, useDeleteMonster, useMonsters, useItemTemplates, useAdjustMonsterHp } from '../lib/queries';
import { useToasts } from '../store/toast';
import { Button, Card, Field, Input, Select, UnitInput } from '../components/ui';
import { ABILITIES, SIZES } from '../lib/types';
import type { Ability, ItemTemplate, Monster, MonsterAttack, MonsterInput, MonsterSkill } from '../lib/types';
import { ftToM, meters, mToFt } from '../lib/units';
import { t as tr } from '../lib/i18n'; // "t" is a common local name here (template, token, tile)

const SIZE_LABEL: Record<string, string> = {
  Fine: 'Winzig+', Diminutive: tr('Sehr klein'), Tiny: 'Klein-', Small: 'Klein', Medium: 'Mittel',
  Large: tr('Groß'), Huge: 'Riesig', Gargantuan: 'Gigantisch', Colossal: 'Kolossal',
};
const ABILITY_LABEL: Record<Ability, string> = {
  Str: tr('STÄ'), Dex: 'GES', Con: 'KON', Int: 'INT', Wis: 'WEI', Cha: 'CHA',
};

// Selected items as removable chips + a "+ Item" button that opens a searchable list.
function ItemPicker({ items, selected, onToggle, disabled }: {
  items: ItemTemplate[]; selected: number[]; onToggle: (id: number) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  if (items.length === 0)
    return <span className="text-xs text-amber-500">{tr('Noch keine Items — zuerst auf der Items-Seite anlegen.')}</span>;
  const chosen = items.filter((t) => selected.includes(t.id));
  const available = items.filter((t) => !selected.includes(t.id) && t.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 items-center">
        {chosen.map((t) => (
          <button key={t.id} type="button" onClick={() => onToggle(t.id)} disabled={disabled} title={tr('Ablegen')}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border bg-gold text-zinc-900 border-gold disabled:opacity-50">
            {t.name} <span aria-hidden>×</span>
          </button>
        ))}
        <button type="button" onClick={() => setOpen(!open)} disabled={disabled}
          className="text-xs px-2 py-0.5 rounded border border-dashed border-zinc-500 hover:border-zinc-300 disabled:opacity-50">
          {open ? tr('Fertig') : tr('+ Item')}
        </button>
      </div>
      {open && (
        <div className="rounded border border-zinc-700 p-2 space-y-2">
          <Input autoFocus placeholder={tr('Item suchen…')} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="max-h-48 overflow-y-auto flex flex-col">
            {available.map((t) => (
              <button key={t.id} type="button" onClick={() => onToggle(t.id)} disabled={disabled}
                className="text-left text-sm px-2 py-1 rounded hover:bg-zinc-800 disabled:opacity-50">
                {t.name}
              </button>
            ))}
            {available.length === 0 && <span className="text-xs text-zinc-500 px-2">{tr('Keine weiteren Items.')}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

const EMPTY: MonsterInput = {
  name: '', size: 'Medium', type: '', description: '',
  maxHp: 10, currentHp: 10, ac: 10, speed: 30,
  str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
  fort: 0, ref: 0, will: 0,
  skills: [], attacks: [], itemTemplateIds: [],
};

// Sum equipped item EffectsJson — mirrors backend MonsterMapper (client-side live preview).
function sumEffects(templates: ItemTemplate[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const t of templates) {
    let eff: Record<string, number> | null = null;
    try { eff = JSON.parse(t.effectsJson || '{}'); } catch { eff = null; }
    if (!eff) continue;
    for (const [k, v] of Object.entries(eff)) if (typeof v === 'number') totals[k] = (totals[k] ?? 0) + v;
  }
  return totals;
}
const AC_KEYS = ['NaturalArmor', 'Deflection', 'Dodge', 'Armor', 'Shield'];
const sumAc = (b: Record<string, number>) => AC_KEYS.reduce((s, k) => s + (b[k] ?? 0), 0);

export function MonstersPage() {
  const monsters = useMonsters();
  const items = useItemTemplates();
  const createMonster = useCreateMonster();
  const updateMonster = useUpdateMonster();
  const deleteMonster = useDeleteMonster();
  const toast = useToasts((s) => s.push);

  const [form, setForm] = useState<MonsterInput>(EMPTY);
  const [editId, setEditId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const set = (patch: Partial<MonsterInput>) => setForm((f) => ({ ...f, ...patch }));

  function reset() { setForm(EMPTY); setEditId(null); }

  function edit(m: Monster) {
    setEditId(m.id);
    setForm({
      name: m.name, size: m.size, type: m.type, description: m.description,
      maxHp: m.maxHp, currentHp: m.currentHp, ac: m.ac, speed: m.speed,
      str: m.str, dex: m.dex, con: m.con, int: m.int, wis: m.wis, cha: m.cha,
      fort: m.fort, ref: m.ref, will: m.will,
      skills: m.skills, attacks: m.attacks, itemTemplateIds: m.itemTemplateIds,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit() {
    if (editId == null) {
      await createMonster.mutateAsync(form);
      toast({ title: tr('Monster erstellt'), message: form.name });
    } else {
      await updateMonster.mutateAsync({ id: editId, body: form });
      toast({ title: tr('Monster gespeichert'), message: form.name });
    }
    reset();
  }

  async function duplicate(m: Monster) {
    await createMonster.mutateAsync({
      name: tr('{name} (Kopie)', { name: m.name }), size: m.size, type: m.type, description: m.description,
      maxHp: m.maxHp, currentHp: m.currentHp, ac: m.ac, speed: m.speed,
      str: m.str, dex: m.dex, con: m.con, int: m.int, wis: m.wis, cha: m.cha,
      fort: m.fort, ref: m.ref, will: m.will,
      skills: m.skills, attacks: m.attacks, itemTemplateIds: m.itemTemplateIds,
    });
    toast({ title: tr('Monster dupliziert'), message: tr('{name} (Kopie)', { name: m.name }) });
  }

  function toggleItem(id: number) {
    set({ itemTemplateIds: form.itemTemplateIds.includes(id)
      ? form.itemTemplateIds.filter((i) => i !== id) : [...form.itemTemplateIds, id] });
  }

  // --- dynamic skill/attack list helpers ---
  const addSkill = () => set({ skills: [...form.skills, { name: '', bonus: 0 }] });
  const setSkill = (i: number, patch: Partial<MonsterSkill>) =>
    set({ skills: form.skills.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const delSkill = (i: number) => set({ skills: form.skills.filter((_, j) => j !== i) });

  const addAttack = () => set({ attacks: [...form.attacks, { name: '', damageDice: '', bonus: 0, critRange: 20, critMultiplier: 2 }] });
  const setAttack = (i: number, patch: Partial<MonsterAttack>) =>
    set({ attacks: form.attacks.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  const delAttack = (i: number) => set({ attacks: form.attacks.filter((_, j) => j !== i) });

  // --- live effective preview from selected items ---
  const equipped = (items.data ?? []).filter((t) => form.itemTemplateIds.includes(t.id));
  const bonus = sumEffects(equipped);
  const eff = {
    maxHp: form.maxHp + (bonus.MaxHp ?? 0),
    ac: form.ac + sumAc(bonus),
    str: form.str + (bonus.Str ?? 0), dex: form.dex + (bonus.Dex ?? 0), con: form.con + (bonus.Con ?? 0),
    int: form.int + (bonus.Int ?? 0), wis: form.wis + (bonus.Wis ?? 0), cha: form.cha + (bonus.Cha ?? 0),
    fort: form.fort + (bonus.Fort ?? 0), ref: form.ref + (bonus.Ref ?? 0), will: form.will + (bonus.Will ?? 0),
  };
  const weaponAttacks = equipped.filter((t) => t.damageDice)
    .map((t) => ({ name: t.name, damageDice: t.damageDice, bonus: t.damageBonus, critRange: t.critRange, critMultiplier: t.critMultiplier }));

  const diff = (base: number, e: number) => e !== base ? <span className="text-emerald-400"> → {e}</span> : null;

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-gold">{tr('Monster')}</h1>

      {/* Create / edit */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="rubric">{editId == null ? tr('Monster erstellen') : tr('Monster bearbeiten')}</h2>
          {editId != null && (
            <button onClick={reset} className="text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-600 rounded px-2 py-0.5">{tr('Abbrechen')}</button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={tr('Name')}><Input value={form.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label={tr('Typ (z.B. Goblinoid)')}><Input value={form.type} onChange={(e) => set({ type: e.target.value })} /></Field>
          <Field label={tr('Größe')}>
            <Select value={form.size} onChange={(e) => set({ size: e.target.value })}>
              {SIZES.map((s) => <option key={s} value={s}>{SIZE_LABEL[s] ?? s}</option>)}
            </Select>
          </Field>
          <Field label={tr('Rüstungsklasse (AC)')}><Input type="number" value={form.ac} onChange={(e) => set({ ac: +e.target.value })} /></Field>
          <Field label={tr('Max. Leben')}><Input type="number" value={form.maxHp} onChange={(e) => set({ maxHp: +e.target.value })} /></Field>
          <Field label={tr('Aktuelles Leben')}><Input type="number" value={form.currentHp} onChange={(e) => set({ currentHp: +e.target.value })} /></Field>
          <Field label={tr('Geschwindigkeit (m)')}><UnitInput value={form.speed} toDisplay={ftToM} fromDisplay={mToFt} onChange={(v) => set({ speed: v })} /></Field>
        </div>

        {/* Ability scores */}
        <div>
          <div className="text-xs text-zinc-500 mb-1">{tr('Attribute')}</div>
          <div className="grid grid-cols-6 gap-2">
            {ABILITIES.map((a) => {
              const key = a.toLowerCase() as 'str';
              return (
                <label key={a} className="text-center">
                  <div className="text-[10px] text-zinc-500">{ABILITY_LABEL[a]}</div>
                  <Input type="number" value={form[key]} onChange={(e) => set({ [key]: +e.target.value } as Partial<MonsterInput>)} className="text-center px-1" />
                </label>
              );
            })}
          </div>
        </div>

        {/* Saving throws */}
        <div>
          <div className="text-xs text-zinc-500 mb-1">{tr('Rettungswürfe')}</div>
          <div className="grid grid-cols-3 gap-2">
            <Field label={tr('Zähigkeit (Fort)')}><Input type="number" value={form.fort} onChange={(e) => set({ fort: +e.target.value })} /></Field>
            <Field label={tr('Reflex (Ref)')}><Input type="number" value={form.ref} onChange={(e) => set({ ref: +e.target.value })} /></Field>
            <Field label={tr('Willen (Will)')}><Input type="number" value={form.will} onChange={(e) => set({ will: +e.target.value })} /></Field>
          </div>
        </div>

        {/* Skills */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-zinc-500">{tr('Fertigkeiten')}</div>
            <button onClick={addSkill} className="text-xs text-gold border border-gold/40 rounded px-2 py-0.5">{tr('+ Fertigkeit')}</button>
          </div>
          {form.skills.length > 0 && (
            <>
              <p className="text-[11px] text-zinc-500">
                <b>{tr('Name')}</b> {tr('der Fertigkeit (z.B. Heimlichkeit) und der')} <b>{tr('Bonus')}</b> {tr('= Gesamt-Modifikator auf den Wurf (z.B. +6).')}
              </p>
              <div className="grid grid-cols-[1fr_5rem_1.5rem] gap-2 text-[10px] uppercase tracking-wide text-zinc-500">
                <span>{tr('Fertigkeit')}</span><span className="text-center">{tr('Bonus')}</span><span />
              </div>
            </>
          )}
          {form.skills.map((s, i) => (
            <div key={i} className="grid grid-cols-[1fr_5rem_1.5rem] gap-2 items-center">
              <Input placeholder={tr('z.B. Heimlichkeit, Wahrnehmung')} value={s.name} onChange={(e) => setSkill(i, { name: e.target.value })} />
              <Input type="number" placeholder="+0" value={s.bonus} onChange={(e) => setSkill(i, { bonus: +e.target.value })} className="text-center px-1" />
              <button onClick={() => delSkill(i)} className="text-red-400 text-xs px-1">✕</button>
            </div>
          ))}
        </div>

        {/* Attacks */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-zinc-500">{tr('Angriffe')}</div>
            <button onClick={addAttack} className="text-xs text-gold border border-gold/40 rounded px-2 py-0.5">{tr('+ Angriff')}</button>
          </div>
          {form.attacks.length > 0 && (
            <>
              <p className="text-[11px] text-zinc-500">
                <b>{tr('Schaden')}</b> {tr('= Würfel (z.B. 1d8) ·')} <b>{tr('Angriffsbonus')}</b> {tr('= Bonus auf den Trefferwurf ·')} <b>{tr('Krit ab')}</b> {tr('= kritischer Treffer ab dieser Zahl (nat. 20 = nur bei einer 20).')}
              </p>
              <div className="grid grid-cols-[1fr_4rem_4rem_4rem_1.5rem] gap-2 text-[10px] uppercase tracking-wide text-zinc-500">
                <span>{tr('Angriff')}</span><span className="text-center">{tr('Schaden')}</span><span className="text-center">{tr('Angr.-Bonus')}</span><span className="text-center">{tr('Krit ab')}</span><span />
              </div>
            </>
          )}
          {form.attacks.map((a, i) => (
            <div key={i} className="grid grid-cols-[1fr_4rem_4rem_4rem_1.5rem] gap-2 items-center">
              <Input placeholder={tr('z.B. Klauenangriff')} value={a.name} onChange={(e) => setAttack(i, { name: e.target.value })} />
              <Input placeholder="1d6" value={a.damageDice} onChange={(e) => setAttack(i, { damageDice: e.target.value })} className="text-center px-1" title={tr('Schaden')} />
              <Input type="number" placeholder="+0" value={a.bonus} onChange={(e) => setAttack(i, { bonus: +e.target.value })} className="text-center px-1" title={tr('Angriffsbonus')} />
              <Input type="number" min={15} max={20} value={a.critRange} onChange={(e) => setAttack(i, { critRange: +e.target.value })} className="text-center px-1" title={tr('Krit ab')} />
              <button onClick={() => delAttack(i)} className="text-red-400 text-xs px-1">✕</button>
            </div>
          ))}
          {weaponAttacks.length > 0 && (
            <div className="text-xs text-zinc-500"> {tr('Aus Ausrüstung: {v}', { v: weaponAttacks.map((w) => `${w.name} (${w.damageDice}${w.bonus ? `+${w.bonus}` : ''})`).join(', ') })} </div>
          )}
        </div>

        {/* Equip items */}
        <div className="space-y-2">
          <div className="text-xs text-zinc-500">{tr('Items ausrüsten (beeinflussen die Werte direkt)')}</div>
          <ItemPicker items={items.data ?? []} selected={form.itemTemplateIds} onToggle={toggleItem} />
        </div>

        {/* Effective preview */}
        {form.itemTemplateIds.length > 0 && (
          <div className="text-sm bg-zinc-200/40 dark:bg-zinc-800/40 rounded-lg p-3 space-y-1">
            <div className="text-xs uppercase tracking-wide text-zinc-500">{tr('Effektive Werte (mit Ausrüstung)')}</div>
            <div>{tr('Leben')} {form.maxHp}{diff(form.maxHp, eff.maxHp)} · {tr('RK')} {form.ac}{diff(form.ac, eff.ac)}</div>
            <div>
              {ABILITIES.map((a) => {
                const key = a.toLowerCase() as 'str';
                return <span key={a} className="mr-3">{ABILITY_LABEL[a]} {form[key]}{diff(form[key], eff[key])}</span>;
              })}
            </div>
            <div>Fort {form.fort}{diff(form.fort, eff.fort)} · Ref {form.ref}{diff(form.ref, eff.ref)} · Will {form.will}{diff(form.will, eff.will)}</div>
          </div>
        )}

        <Field label={tr('Beschreibung')}><Input value={form.description} onChange={(e) => set({ description: e.target.value })} /></Field>

        <Button onClick={submit} disabled={!form.name || createMonster.isPending || updateMonster.isPending}>
          {editId == null ? tr('Monster anlegen') : tr('Änderungen speichern')}
        </Button>
      </Card>

      {/* Overview */}
      <Card>
        <h2 className="rubric mb-2">{tr('Bestiarium ({v})', { v: monsters.data?.length ?? 0 })}</h2>
        {(monsters.data?.length ?? 0) === 0 ? (
          <p className="text-zinc-500 text-sm">{tr('Noch keine Monster erstellt.')}</p>
        ) : (
          <ul className="space-y-1">
            {monsters.data?.map((m) => (
              <li key={m.id} className={`rounded-lg px-2 py-1.5 ${editId === m.id ? 'bg-gold/10' : expandedId === m.id ? 'bg-zinc-200/40 dark:bg-zinc-800/40' : 'hover:bg-zinc-200/40 dark:hover:bg-zinc-800/40'}`}>
                <div className="flex items-center gap-3">
                  <button onClick={() => setExpandedId(expandedId === m.id ? null : m.id)} className="min-w-0 flex-1 text-left">
                    <span className="text-zinc-500 mr-1">{expandedId === m.id ? '▲' : '▼'}</span>
                    <span className="font-medium">{m.name}</span>
                    <span className="text-xs text-zinc-500 ml-2">{SIZE_LABEL[m.size] ?? m.size}{m.type ? ` · ${m.type}` : ''}</span>
                    <div className="text-xs text-zinc-500">
                      ❤️ {m.currentHp}/{m.effMaxHp} · 🛡️ {m.effAc} {' '}{tr('· Fort')}{' '} {m.effFort} {' '}{tr('/ Ref')}{' '} {m.effRef} {' '}{tr('/ Will')}{' '} {m.effWill}
                      {m.effAttacks.length > 0 && <> · ⚔️ {m.effAttacks.map((a) => `${a.name} ${a.damageDice}${a.bonus ? `+${a.bonus}` : ''}`).join(', ')}</>}
                    </div>
                  </button>
                  <button onClick={() => duplicate(m)} disabled={createMonster.isPending} className="text-xs text-zinc-300 hover:brightness-110 border border-zinc-600 rounded px-2 py-0.5 disabled:opacity-50">{tr('Duplizieren')}</button>
                  <button onClick={() => edit(m)} className="text-xs text-gold hover:brightness-110 border border-gold/40 rounded px-2 py-0.5">{tr('Bearbeiten')}</button>
                  <button onClick={() => { if (confirm(tr('Monster "{name}" löschen?', { name: m.name }))) deleteMonster.mutate(m.id); }} disabled={deleteMonster.isPending} className="text-xs text-red-400 hover:text-red-300 border border-red-500/40 rounded px-2 py-0.5 disabled:opacity-50">{tr('Löschen')}</button>
                </div>
                {expandedId === m.id && <MonsterDetail m={m} />}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// Expanded bestiary row: full effective stats + live HP damage/heal (like the character HP card).
// Rebuild the editable input (base values) from a monster DTO — lets the detail panel
// reuse the normal update mutation for quick edits like equipping/unequipping items.
function toInput(m: Monster): MonsterInput {
  return {
    name: m.name, size: m.size, type: m.type, description: m.description,
    maxHp: m.maxHp, currentHp: m.currentHp, ac: m.ac, speed: m.speed,
    str: m.str, dex: m.dex, con: m.con, int: m.int, wis: m.wis, cha: m.cha,
    fort: m.fort, ref: m.ref, will: m.will,
    skills: m.skills, attacks: m.attacks, itemTemplateIds: m.itemTemplateIds,
  };
}
const sign = (n: number) => `${n >= 0 ? '+' : ''}${n}`;

function MonsterDetail({ m }: { m: Monster }) {
  const adjustHp = useAdjustMonsterHp();
  const items = useItemTemplates();
  const updateMonster = useUpdateMonster();
  const pct = m.effMaxHp > 0 ? Math.min(100, (m.currentHp / m.effMaxHp) * 100) : 0;
  const color = pct > 50 ? 'bg-red-500' : pct > 25 ? 'bg-amber-500' : 'bg-red-700 animate-pulse';
  const adjust = (delta: number) => { if (!adjustHp.isPending) adjustHp.mutate({ id: m.id, delta }); };

  function toggleItem(templateId: number) {
    if (updateMonster.isPending) return;
    const itemTemplateIds = m.itemTemplateIds.includes(templateId)
      ? m.itemTemplateIds.filter((id) => id !== templateId)
      : [...m.itemTemplateIds, templateId];
    updateMonster.mutate({ id: m.id, body: { ...toInput(m), itemTemplateIds } });
  }

  const abilities: [Ability, number][] = [
    ['Str', m.effStr], ['Dex', m.effDex], ['Con', m.effCon], ['Int', m.effInt], ['Wis', m.effWis], ['Cha', m.effCha],
  ];

  return (
    <div className="mt-2 border-t border-zinc-300 dark:border-zinc-700 pt-3 space-y-3">
      {/* HP damage/heal */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs uppercase tracking-wide text-zinc-500">{tr('Lebenspunkte')}</span>
          <span className="font-bold text-sm">{m.currentHp} <span className="text-zinc-500">/ {m.effMaxHp}</span></span>
        </div>
        <div className="h-3 rounded-full bg-zinc-300 dark:bg-zinc-800 overflow-hidden mb-2">
          <div className={`h-full rounded-full transition-all duration-300 ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center gap-1.5">
          {([-10, -5, -1] as const).map((d) => (
            <button key={d} onClick={() => adjust(d)} disabled={adjustHp.isPending}
              className="flex-1 rounded-lg py-1.5 text-sm font-bold bg-red-900/60 hover:bg-red-800 active:scale-95 transition border border-red-800 text-red-300 disabled:opacity-50">{d}</button>
          ))}
          <span className="w-px h-6 bg-zinc-700 mx-0.5" />
          {([1, 5, 10] as const).map((d) => (
            <button key={d} onClick={() => adjust(d)} disabled={adjustHp.isPending}
              className="flex-1 rounded-lg py-1.5 text-sm font-bold bg-emerald-900/60 hover:bg-emerald-800 active:scale-95 transition border border-emerald-800 text-emerald-300 disabled:opacity-50">+{d}</button>
          ))}
        </div>
      </div>

      {/* Ability scores (effective) */}
      <div className="grid grid-cols-6 gap-1 text-center text-sm">
        {abilities.map(([a, v]) => (
          <div key={a} className="rounded bg-zinc-200/50 dark:bg-zinc-800/50 py-1">
            <div className="text-[10px] text-zinc-500">{ABILITY_LABEL[a]}</div>
            <div className="font-bold">{v}</div>
          </div>
        ))}
      </div>
      <div className="text-sm text-zinc-600 dark:text-zinc-300 space-y-1">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span>{tr('🛡️ Rüstungsklasse {effAc}', { effAc: m.effAc })}</span>
          <span>{tr('🏃 Geschwindigkeit {v}', { v: meters(m.speed) })}</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="text-xs uppercase tracking-wide text-zinc-500">{tr('Rettungswürfe:')}</span>
          <span>{tr('Zähigkeit (Fort) {v}', { v: sign(m.effFort) })}</span>
          <span>{tr('Reflex (Ref) {v}', { v: sign(m.effRef) })}</span>
          <span>{tr('Willen (Will) {v}', { v: sign(m.effWill) })}</span>
        </div>
      </div>

      {m.skills.length > 0 && (
        <div className="text-sm">
          <div className="text-xs uppercase tracking-wide text-zinc-500 mb-0.5">{tr('Fertigkeiten')}</div>
          <div className="flex flex-wrap gap-x-3">
            {m.skills.map((s, i) => <span key={i}>{s.name} {s.bonus >= 0 ? '+' : ''}{s.bonus}</span>)}
          </div>
        </div>
      )}

      {m.effAttacks.length > 0 && (
        <div className="text-sm">
          <div className="text-xs uppercase tracking-wide text-zinc-500 mb-0.5">{tr('Angriffe')}</div>
          <ul className="space-y-0.5">
            {m.effAttacks.map((a, i) => (
              <li key={i}>⚔️ {a.name}: {a.damageDice}{a.bonus ? ` +${a.bonus}` : ''}{a.critRange < 20 ? ` (Krit ${a.critRange}-20)` : ''}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Equip / unequip items on the fly — click to toggle. */}
      <div className="text-sm">
        <div className="text-xs uppercase tracking-wide text-zinc-500 mb-0.5">
          {tr('Ausrüstung')}{' '} {updateMonster.isPending && <span className="text-zinc-400 normal-case">{tr('— speichert…')}</span>}
        </div>
        <ItemPicker items={items.data ?? []} selected={m.itemTemplateIds} onToggle={toggleItem} disabled={updateMonster.isPending} />
      </div>

      {m.description && <p className="text-sm text-zinc-500 italic">{m.description}</p>}
    </div>
  );
}
