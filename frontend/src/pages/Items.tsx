import { useState } from 'react';
import { useRuleLayout, useCreateItem, useUpdateItem, useWeapons, useRuleSkills, useGrantItem, useItemTemplates, usePlayers, useUploadImage, useGmCharacters, useDeleteItemTemplate } from '../lib/queries';
import { useToasts } from '../store/toast';
import { Button, Card, Field, Input, InfoTooltip, Select, UnitInput } from '../components/ui';
import { RarityText, RARITY_LABEL, CATEGORY_LABEL, SLOT_LABEL } from '../components/ui';
import { ItemIcon } from '../components/item';
import type { ArmorType, ItemCategory, ItemTemplate, Rarity } from '../lib/types';
import { kgToLb, lbToKg } from '../lib/units';
import { t as tr } from '../lib/i18n'; // "t" is a common local name here (template, token, tile)

const RARITIES: Rarity[] = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
const CATEGORIES: ItemCategory[] = ['Weapon', 'Armor', 'Consumable', 'Magic', 'Quest', 'Material'];
const SLOTS = ['', 'Head', 'Neck', 'Shoulders', 'Chest', 'Hands', 'Belt', 'Legs', 'Feet', 'Ring', 'Earring', 'Cloak', 'MainHand', 'OffHand'];
const ICONS = ['sword', 'helm', 'potion', 'ring', 'cloak', 'shield', 'bow', 'staff', 'book', 'gold', 'default'];

// Bonus keys the rule system reads while equipped (see the rule package's stats).
const EQUIP_EFFECT_KEYS = [
  { key: 'Str', desc: tr('Bonus auf Stärke') },
  { key: 'Dex', desc: tr('Bonus auf Geschicklichkeit') },
  { key: 'Con', desc: tr('Bonus auf Konstitution') },
  { key: 'Int', desc: tr('Bonus auf Intelligenz') },
  { key: 'Wis', desc: tr('Bonus auf Weisheit') },
  { key: 'Cha', desc: tr('Bonus auf Charisma') },
  { key: 'MaxHp', desc: tr('Bonus auf maximale Lebenspunkte') },
  { key: 'Fort', desc: tr('Bonus auf Zähigkeitsrettungswurf') },
  { key: 'Ref', desc: tr('Bonus auf Reflexrettungswurf') },
  { key: 'Will', desc: tr('Bonus auf Willensrettungswurf') },
  { key: 'Resistance', desc: tr('Widerstandsbonus auf alle Rettungswürfe') },
  { key: 'ArmorBonus', desc: tr('Rüstungsbonus auf die Rüstungsklasse') },
  { key: 'ShieldBonus', desc: tr('Schildbonus auf die Rüstungsklasse') },
  { key: 'NaturalArmor', desc: tr('Natürlicher Rüstungsbonus auf die Rüstungsklasse') },
  { key: 'Deflection', desc: tr('Abwehrbonus auf die Rüstungsklasse') },
  { key: 'Dodge', desc: tr('Ausweichbonus auf die Rüstungsklasse') },
  { key: 'ArmorCheckPenalty', desc: tr('Rüstungs-Fertigkeitsmalus (negativ angeben)') },
  { key: 'MaxDex', desc: tr('Deckelt den max. Dex-Bonus durch Rüstung') },
  { key: 'BAB', desc: tr('Bonus auf Grundangriffsbonus') },
  { key: 'Initiative', desc: tr('Bonus auf Initiative') },
  { key: 'PassivePerception', desc: tr('Bonus auf passive Wahrnehmung') },
  { key: 'Skill:<Fertigkeit>', desc: tr('Bonus auf eine Fertigkeit, z.B. Skill:stealth (Feld „Fertigkeitsboni“)') },
];
// Structured armor stat fields — composed into EffectsJson (same keys the rules engine reads).
const ARMOR_FIELDS = [
  { key: 'ArmorBonus', label: tr('Rüstungsbonus (AC)') },
  { key: 'ShieldBonus', label: tr('Schildbonus (AC)') },
  { key: 'MaxDex', label: tr('Max. GES-Bonus (Rüstung)') },
  { key: 'ArmorCheckPenalty', label: tr('Rüstungsmalus (negativ)') },
  { key: 'NaturalArmor', label: tr('Natürl. Rüstung') },
  { key: 'Deflection', label: tr('Abwehrbonus') },
  { key: 'Dodge', label: tr('Ausweichbonus') },
  { key: 'Resistance', label: tr('Rettungswürfe (alle)') },
  { key: 'Str', label: tr('Stärke') },
  { key: 'Dex', label: tr('Geschicklichkeit') },
  { key: 'Con', label: tr('Konstitution') },
  { key: 'Int', label: tr('Intelligenz') },
  { key: 'Wis', label: tr('Weisheit') },
  { key: 'Cha', label: tr('Charisma') },
  { key: 'MaxHp', label: tr('Max. Lebenspunkte') },
];

type ItemForm = {
  name: string; description: string; iconKey: string; weight: number; value: number;
  rarity: Rarity; category: ItemCategory; slot: string; effectsJson: string;
  damageDice: string; damageBonus: number; critRange: number; critMultiplier: number; bonusDamage: string;
  weaponKey: string; attackBonus: number; armorType: ArmorType; spellFailure: number; requiresAttunement: boolean;
  isUsable: boolean; useEffectsJson: string; useStatusEffectName: string;
  useStatusEffectDescription: string; useStatusEffectIcon: string;
  useStatusEffectKind: 'buff' | 'debuff'; useStatusEffectDurationMinutes: number | '';
};
const EMPTY: ItemForm = {
  name: '', description: '', iconKey: 'sword', weight: 0, value: 0, rarity: 'Common',
  category: 'Weapon', slot: '', effectsJson: '{}', damageDice: '', damageBonus: 0, critRange: 20, critMultiplier: 2, bonusDamage: '',
  weaponKey: '', attackBonus: 0, armorType: 'None', spellFailure: 0, requiresAttunement: false,
  isUsable: false, useEffectsJson: '{}', useStatusEffectName: '', useStatusEffectDescription: '',
  useStatusEffectIcon: '✨', useStatusEffectKind: 'buff', useStatusEffectDurationMinutes: '',
};

export function ItemsPage() {
  const items = useItemTemplates();
  const players = usePlayers();
  const createItem = useCreateItem();
  const weapons = useWeapons();
  const attunement = useRuleLayout().data?.capabilities.includes('attunement') ?? false;
  const ruleSkills = useRuleSkills().data ?? [];
  const updateItem = useUpdateItem();
  const grant = useGrantItem();
  const deleteItem = useDeleteItemTemplate();
  const gmChars = useGmCharacters();
  const upload = useUploadImage();
  const toast = useToasts((s) => s.push);

  const [form, setForm] = useState<ItemForm>(EMPTY);
  const [editId, setEditId] = useState<number | null>(null);
  // Distribute panel: which item's panel is open + the current selection.
  const [distId, setDistId] = useState<number | null>(null);
  const [dist, setDist] = useState({ quantity: 1, characterIds: [] as number[], toAll: false, unidentified: false });

  // Who currently holds each template: templateId -> [{ character, owner, quantity, unidentified }].
  const holders = new Map<number, { name: string; owner: string; qty: number; unidentified: boolean }[]>();
  for (const r of gmChars.data ?? [])
    for (const i of r.character.items) {
      const list = holders.get(i.itemTemplateId) ?? [];
      list.push({ name: r.character.name, owner: r.ownerName, qty: i.quantity, unidentified: !i.isIdentified });
      holders.set(i.itemTemplateId, list);
    }

  function reset() { setForm(EMPTY); setEditId(null); }

  function edit(t: ItemTemplate) {
    setEditId(t.id);
    setForm({
      name: t.name, description: t.description, iconKey: t.iconKey, weight: t.weight, value: t.value,
      rarity: t.rarity, category: t.category, slot: t.slot ?? '', effectsJson: t.effectsJson,
      damageDice: t.damageDice, damageBonus: t.damageBonus, critRange: t.critRange, critMultiplier: t.critMultiplier, bonusDamage: t.bonusDamage,
      weaponKey: t.weaponKey ?? '', attackBonus: t.attackBonus ?? 0, armorType: t.armorType ?? 'None', spellFailure: t.spellFailure ?? 0, requiresAttunement: t.requiresAttunement ?? false,
      isUsable: t.isUsable, useEffectsJson: t.useEffectsJson, useStatusEffectName: t.useStatusEffectName ?? '',
      useStatusEffectDescription: t.useStatusEffectDescription, useStatusEffectIcon: t.useStatusEffectIcon,
      useStatusEffectKind: t.useStatusEffectKind, useStatusEffectDurationMinutes: t.useStatusEffectDurationMinutes ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function duplicate(t: ItemTemplate) {
    const { id, ...rest } = t;
    await createItem.mutateAsync({ ...rest, name: tr('{name} (Kopie)', { name: t.name }) });
    toast({ title: tr('Item dupliziert'), message: tr('{name} (Kopie)', { name: t.name }) });
  }

  async function submit() {
    const isConsumable = form.category === 'Consumable';
    const body = {
      ...form,
      slot: (form.slot || null) as any,
      weaponKey: form.category === 'Weapon' ? form.weaponKey || null : null,
      armorType: form.category === 'Armor' ? form.armorType : 'None',
      // Status effect only fires when a name is given; empty name = no status effect.
      useStatusEffectName: isConsumable && form.useStatusEffectName ? form.useStatusEffectName : null,
      useStatusEffectDurationMinutes: form.useStatusEffectDurationMinutes === '' ? null : form.useStatusEffectDurationMinutes,
    };
    if (editId == null) {
      await createItem.mutateAsync(body);
      toast({ title: tr('Item erstellt'), message: form.name });
    } else {
      await updateItem.mutateAsync({ id: editId, body });
      toast({ title: tr('Item gespeichert'), message: form.name });
    }
    reset();
  }

  function openDistribute(id: number) {
    setDistId((cur) => (cur === id ? null : id));
    setDist({ quantity: 1, characterIds: [], toAll: false, unidentified: false });
  }
  function toggleCharacter(id: number) {
    setDist((d) => ({
      ...d,
      characterIds: d.characterIds.includes(id) ? d.characterIds.filter((r) => r !== id) : [...d.characterIds, id],
    }));
  }
  async function submitGrant(t: ItemTemplate) {
    const res = await grant.mutateAsync({
      itemTemplateId: t.id,
      quantity: dist.quantity,
      characterIds: dist.characterIds,
      toAll: dist.toAll,
      unidentified: dist.unidentified,
    });
    toast({ title: tr('Item verteilt'), message: `${t.name} an ${res.recipients} Charaktere gesendet.` });
    setDistId(null);
  }

  async function remove(t: ItemTemplate) {
    const held = holders.get(t.id)?.length ?? 0;
    if (!confirm(tr('„{name}" endgültig löschen?{v}', { name: t.name, v: held ? tr(' Es wird auch aus {held} Inventar(en) entfernt.', { held }) : '' }))) return;
    await deleteItem.mutateAsync(t.id);
    if (editId === t.id) reset();
    toast({ title: tr('Item gelöscht'), message: t.name });
  }

  // Parsed equip effects (for the structured armor editor); both it and the raw JSON
  // field write back to form.effectsJson, so they stay in sync.
  const effects: Record<string, number> = (() => {
    try { return JSON.parse(form.effectsJson || '{}'); } catch { return {}; }
  })();
  function setEffect(key: string, val: number) {
    const next: Record<string, number> = {};
    for (const [k, v] of Object.entries(effects)) if (typeof v === 'number') next[k] = v;
    if (val) next[key] = val; else delete next[key];
    setForm({ ...form, effectsJson: JSON.stringify(next) });
  }
  // Same idea for the "on use" effect (heal / mana) — structured, so no JSON typos.
  const useEff: Record<string, number> = (() => {
    try { return JSON.parse(form.useEffectsJson || '{}'); } catch { return {}; }
  })();
  function setUseEffect(key: string, val: number) {
    const next: Record<string, number> = {};
    for (const [k, v] of Object.entries(useEff)) if (typeof v === 'number') next[k] = v;
    if (val) next[key] = val; else delete next[key];
    setForm({ ...form, useEffectsJson: JSON.stringify(next) });
  }

  const iconValue = form.iconKey.startsWith('http') || form.iconKey.startsWith('/') ? '' : form.iconKey;

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-gold">{tr('Items')}</h1>

      {/* Create / edit item */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="rubric">{editId == null ? tr('Item erstellen') : tr('Item bearbeiten')}</h2>
          {editId != null && (
            <button onClick={reset} className="text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-600 rounded px-2 py-0.5">
              {tr('Abbrechen')}
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={tr('Name')}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label={tr('Icon')}>
            <div className="flex flex-col gap-2">
              <Select value={iconValue} onChange={(e) => setForm({ ...form, iconKey: e.target.value })} >
                <option value="">{tr('(hochgeladen)')}</option>
                {ICONS.map((k) => <option key={k}>{k}</option>)}
              </Select>
              <input type="file" accept="image/*" title={tr('Icon hochladen')}
                onChange={async (e) => { const f = e.target.files?.[0]; if (f) setForm({ ...form, iconKey: await upload.mutateAsync(f) }); }}
                className="text-xs w-full min-w-0" />
            </div>
          </Field>
          <Field label={tr('Seltenheit')}><Select value={form.rarity} onChange={(e) => setForm({ ...form, rarity: e.target.value as Rarity })}>{RARITIES.map((r) => <option key={r} value={r}>{RARITY_LABEL[r]}</option>)}</Select></Field>
          <Field label={tr('Kategorie')}><Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ItemCategory })}>{CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</Select></Field>
          <Field label={tr('Slot')}><Select value={form.slot} onChange={(e) => setForm({ ...form, slot: e.target.value })}>{SLOTS.map((s) => <option key={s} value={s}>{s ? (SLOT_LABEL[s] ?? s) : '—'}</option>)}</Select></Field>
          <Field label={tr('Wert (Gold)')}><Input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: +e.target.value })} /></Field>
          <Field label={tr('Gewicht (kg)')}><UnitInput value={form.weight} toDisplay={lbToKg} fromDisplay={kgToLb} onChange={(v) => setForm({ ...form, weight: v })} /></Field>
          {form.category !== 'Armor' && form.category !== 'Consumable' && (
            <Field label={<>{tr('Effekte (JSON z.B.')}{' '} {'{"Str":2}'})<InfoTooltip title={tr('Mögliche Effekt-Schlüssel')} entries={EQUIP_EFFECT_KEYS} /></>}>
              <Input value={form.effectsJson} onChange={(e) => setForm({ ...form, effectsJson: e.target.value })} />
            </Field>
          )}
          {form.category === 'Weapon' && (<>
            {/* Base weapon: proficiency, Weapon Focus & co., finesse and damage come from the PF1e weapon table. */}
            <Field label={tr('Grundwaffe (Regeln)')}>
              <Select value={form.weaponKey} onChange={(e) => {
                const w = weapons.data?.find((x) => x.key === e.target.value);
                setForm({ ...form, weaponKey: e.target.value, ...(w && !form.damageDice ? { critRange: w.critRange, critMultiplier: w.critMultiplier } : {}) });
              }}>
                <option value="">{tr('— keine —')}</option>
                {(['Simple', 'Martial', 'Exotic'] as const).map((p) => (
                  <optgroup key={p} label={p === 'Simple' ? tr('Einfache Waffen') : p === 'Martial' ? tr('Kriegswaffen') : tr('Exotische Waffen')}>
                    {weapons.data?.filter((w) => w.proficiency === p).map((w) => <option key={w.key} value={w.key}>{w.name} ({w.damage})</option>)}
                  </optgroup>
                ))}
              </Select>
            </Field>
            <Field label={tr('Angriffsbonus (Meisterarbeit / Verzauberung)')}><Input type="number" value={form.attackBonus} onChange={(e) => setForm({ ...form, attackBonus: +e.target.value })} /></Field>
            <Field label={tr('Schaden (leer = Grundwaffe)')}><Input value={form.damageDice} onChange={(e) => setForm({ ...form, damageDice: e.target.value })} placeholder="1d8" /></Field>
            <Field label={tr('Schadensbonus')}><Input type="number" value={form.damageBonus} onChange={(e) => setForm({ ...form, damageBonus: +e.target.value })} /></Field>
            <Field label={tr('Krit ab (nat. X)')}><Input type="number" min={15} max={20} value={form.critRange} onChange={(e) => setForm({ ...form, critRange: +e.target.value })} /></Field>
            <Field label={tr('Krit-Multiplikator')}><Input type="number" min={2} max={4} value={form.critMultiplier} onChange={(e) => setForm({ ...form, critMultiplier: +e.target.value })} /></Field>
            <div className="col-span-2">
              <Field label={tr('Zusätzl. Schaden & Effekte (z.B. 1d6 Feuer; bei Treffer vergiftet)')}>
                <Input value={form.bonusDamage} onChange={(e) => setForm({ ...form, bonusDamage: e.target.value })} placeholder={tr('1d6 Feuer; bei Treffer vergiftet (DC 15)')} />
              </Field>
            </div>
          </>)}
          <div className="col-span-2"><Field label={tr('Beschreibung')}><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field></div>
        </div>

        {/* Armor: structured stat bonuses (like weapons get damage fields) → composed into EffectsJson. */}
        {form.category === 'Armor' && (
          <div className="border-t border-zinc-700 pt-3 space-y-2">
            <div className="text-xs uppercase tracking-wide text-zinc-500">{tr('Rüstungswerte (Boni laut Regeln)')}</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-zinc-500">{tr('Rüstungsart')}
                <Select value={form.armorType} onChange={(e) => setForm({ ...form, armorType: e.target.value as ArmorType })} className="mt-0.5">
                  <option value="None">{tr('— keine (Kleidung, Schmuck) —')}</option>
                  <option value="Light">{tr('Leichte Rüstung')}</option>
                  <option value="Medium">{tr('Mittelschwere Rüstung')}</option>
                  <option value="Heavy">{tr('Schwere Rüstung')}</option>
                  <option value="Shield">{tr('Schild')}</option>
                  <option value="TowerShield">{tr('Turmschild')}</option>
                </Select>
              </label>
              <label className="text-xs text-zinc-500">{tr('Arkane Zauberpatzer (%)')}
                <Input type="number" min={0} max={100} value={form.spellFailure} onChange={(e) => setForm({ ...form, spellFailure: +e.target.value })} className="mt-0.5" />
              </label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ARMOR_FIELDS.map((f) => (
                <label key={f.key} className="text-xs text-zinc-500">
                  {f.label}
                  <Input type="number" value={effects[f.key] ?? 0} onChange={(e) => setEffect(f.key, +e.target.value)} className="mt-0.5" />
                </label>
              ))}
            </div>
            <p className="text-[11px] text-zinc-500">{tr('Werte ≠ 0 werden beim Anlegen der Rüstung automatisch auf die Rüstungsklasse bzw. den jeweiligen Wert addiert.')}</p>
          </div>
        )}

        {/* Skill bonuses ("Skill:<key>" in EffectsJson) — any wearable item, e.g. Elven Boots +5 Stealth. */}
        {form.category !== 'Consumable' && (
          <div className="border-t border-zinc-700 pt-3 space-y-2">
            <div className="text-xs uppercase tracking-wide text-zinc-500">{tr('Fertigkeitsboni')}</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ruleSkills.filter((sk) => effects[`Skill:${sk.key}`]).map((sk) => (
                <label key={sk.key} className="text-xs text-zinc-500">
                  {sk.name}
                  <Input type="number" value={effects[`Skill:${sk.key}`]} onChange={(e) => setEffect(`Skill:${sk.key}`, +e.target.value)} className="mt-0.5" />
                </label>
              ))}
              <label className="text-xs text-zinc-500">
                {tr('Fertigkeit hinzufügen')}
                <Select value="" onChange={(e) => e.target.value && setEffect(`Skill:${e.target.value}`, 1)} className="mt-0.5">
                  <option value="">—</option>
                  {ruleSkills.filter((sk) => !effects[`Skill:${sk.key}`]).map((sk) => <option key={sk.key} value={sk.key}>{sk.name}</option>)}
                </Select>
              </label>
            </div>
            <p className="text-[11px] text-zinc-500">{tr('Gilt, solange der Gegenstand angelegt ist. Wert 0 entfernt den Bonus.')}</p>
          </div>
        )}

        {/* Consumable = benutzbar: effect on use + optional status effect. */}
        {form.category === 'Consumable' && (
          <div className="grid grid-cols-2 gap-3 border-t border-zinc-700 pt-3">
            <Field label={tr('Heilung beim Benutzen (HP, negativ = Schaden)')}>
              <Input type="number" value={useEff['CurrentHp'] ?? 0} onChange={(e) => setUseEffect('CurrentHp', +e.target.value)} placeholder="z.B. 20" />
            </Field>
            <Field label={tr('Mana beim Benutzen (negativ = verbrauchen)')}>
              <Input type="number" value={useEff['CurrentMana'] ?? 0} onChange={(e) => setUseEffect('CurrentMana', +e.target.value)} />
            </Field>
            <Field label={tr('Statuseffekt-Name (optional)')}><Input value={form.useStatusEffectName} onChange={(e) => setForm({ ...form, useStatusEffectName: e.target.value })} placeholder={tr('z.B. Vergiftet')} /></Field>
            <Field label={tr('Statuseffekt-Icon')}><Input value={form.useStatusEffectIcon} onChange={(e) => setForm({ ...form, useStatusEffectIcon: e.target.value })} /></Field>
            <Field label={tr('Statuseffekt-Art')}>
              <Select value={form.useStatusEffectKind} onChange={(e) => setForm({ ...form, useStatusEffectKind: e.target.value as 'buff' | 'debuff' })}>
                <option value="buff">{tr('Buff')}</option>
                <option value="debuff">{tr('Debuff')}</option>
              </Select>
            </Field>
            <Field label={tr('Dauer in Minuten (leer = dauerhaft)')}>
              <Input type="number" min={1} value={form.useStatusEffectDurationMinutes}
                onChange={(e) => setForm({ ...form, useStatusEffectDurationMinutes: e.target.value === '' ? '' : +e.target.value })} />
            </Field>
            <div className="col-span-2">
              <Field label={tr('Statuseffekt-Beschreibung')}><Input value={form.useStatusEffectDescription} onChange={(e) => setForm({ ...form, useStatusEffectDescription: e.target.value })} /></Field>
            </div>
          </div>
        )}
        {attunement && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.requiresAttunement} onChange={(e) => setForm({ ...form, requiresAttunement: e.target.checked })} />
            {tr('Einstimmung nötig')} <span className="text-xs text-zinc-500">{tr('(Effekte wirken nur eingestimmt)')}</span>
          </label>
        )}
        <Button onClick={submit} disabled={!form.name || createItem.isPending || updateItem.isPending}>
          {editId == null ? tr('Item anlegen') : tr('Änderungen speichern')}
        </Button>
      </Card>

      {/* Overview */}
      <Card>
        <h2 className="rubric mb-2">{tr('Erstellte Items ({v})', { v: items.data?.length ?? 0 })}</h2>
        {(items.data?.length ?? 0) === 0 ? (
          <p className="text-zinc-500 text-sm">{tr('Noch keine Items erstellt.')}</p>
        ) : (
          <ul className="space-y-1">
            {items.data?.map((t) => (
              <li key={t.id} className={`rounded-lg px-2 py-1.5 ${editId === t.id ? 'bg-gold/10' : distId === t.id ? 'bg-zinc-200/40 dark:bg-zinc-800/40' : 'hover:bg-zinc-200/40 dark:hover:bg-zinc-800/40'}`}>
                {/* Mobile: info on top, actions in their own row below; sm+: one row. */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                 <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="w-8 h-8 grid place-items-center text-xl flex-shrink-0"><ItemIcon iconKey={t.iconKey} /></span>
                  <div className="min-w-0 flex-1">
                    <RarityText rarity={t.rarity}><span className="font-medium">{t.name}</span></RarityText>
                    <div className="text-xs text-zinc-500 truncate">
                      {CATEGORY_LABEL[t.category]}{t.slot ? ` · ${SLOT_LABEL[t.slot] ?? t.slot}` : ''} · {t.value} 🪙
                    </div>
                    {holders.has(t.id) && (
                      <div className="text-xs text-zinc-400 truncate" title={tr('Aktuelle Besitzer')}>
                        👤 {holders.get(t.id)!.map((h) => `${h.name}${h.qty > 1 ? ` ×${h.qty}` : ''}${h.unidentified ? ' (?)' : ''}`).join(', ')}
                      </div>
                    )}
                  </div>
                 </div>
                 <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-shrink-0 [&>button]:min-w-0 [&>button]:truncate [&>button]:py-1">
                  <button onClick={() => openDistribute(t.id)} className={`text-xs border rounded px-2 py-0.5 flex-shrink-0 ${distId === t.id ? 'bg-gold text-zinc-900 border-gold' : 'text-emerald-400 hover:brightness-110 border-emerald-500/40'}`}>
                    {tr('Verteilen')}
                  </button>
                  <button onClick={() => duplicate(t)} disabled={createItem.isPending} className="text-xs text-zinc-300 hover:brightness-110 border border-zinc-600 rounded px-2 py-0.5 flex-shrink-0 disabled:opacity-50">
                    <span className="sm:hidden">{tr('Kopie')}</span><span className="hidden sm:inline">{tr('Duplizieren')}</span>
                  </button>
                  <button onClick={() => edit(t)} className="text-xs text-gold hover:brightness-110 border border-gold/40 rounded px-2 py-0.5 flex-shrink-0">
                    <span className="sm:hidden">{tr('Ändern')}</span><span className="hidden sm:inline">{tr('Bearbeiten')}</span>
                  </button>
                  <button onClick={() => remove(t)} disabled={deleteItem.isPending} title={tr('Item aus dem System löschen')} className="text-xs text-red-400 hover:brightness-110 border border-red-500/40 rounded px-2 py-0.5 flex-shrink-0 disabled:opacity-50">
                    {tr('Löschen')}
                  </button>
                 </div>
                </div>
                {distId === t.id && (
                  <div className="mt-2 border-t border-zinc-300 dark:border-zinc-700 pt-2 space-y-2">
                    <div className="flex items-center gap-4">
                      <label className="text-xs text-zinc-500 flex items-center gap-2">
                        {tr('Anzahl')}
                        <Input type="number" min={1} value={dist.quantity} onChange={(e) => setDist({ ...dist, quantity: +e.target.value })} className="w-16" />
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={dist.toAll} onChange={(e) => setDist({ ...dist, toAll: e.target.checked })} />
                        {tr('An alle Charaktere')}
                      </label>
                      <label className="flex items-center gap-2 text-sm" title={tr('Spieler sieht nur „Unidentifiziert“, bis du es im GM-Dashboard identifizierst.')}>
                        <input type="checkbox" checked={dist.unidentified} onChange={(e) => setDist({ ...dist, unidentified: e.target.checked })} />
                        {tr('Unidentifiziert')}
                      </label>
                    </div>
                    {!dist.toAll && (
                      <div className="space-y-2">
                        <div className="text-xs text-zinc-500">{tr('Empfänger-Charaktere — einen oder mehrere anklicken:')}</div>
                        {players.data?.filter((p) => p.roles.includes('Player') || p.characterCount > 0).map((p) => (
                          <div key={p.userId}>
                            <div className="text-xs text-zinc-500 mb-1">{p.displayName}</div>
                            <div className="flex flex-wrap gap-2">
                              {p.characters.map((ch) => (
                                <button
                                  key={ch.id}
                                  onClick={() => toggleCharacter(ch.id)}
                                  className={`px-2 py-1 rounded text-sm border ${dist.characterIds.includes(ch.id) ? 'bg-gold text-zinc-900 border-gold' : 'border-zinc-600'}`}
                                >
                                  {ch.name} <span className="opacity-60">{tr('(Stufe {level})', { level: ch.level })}</span>
                                </button>
                              ))}
                              {p.characters.length === 0 && <span className="text-xs text-zinc-600">{tr('— keine Charaktere')}</span>}
                            </div>
                          </div>
                        ))}
                        {players.data?.filter((p) => p.roles.includes('Player') || p.characterCount > 0).every((p) => p.characters.length === 0) && (
                          <span className="text-xs text-amber-500">{tr('Keine Charaktere vorhanden.')}</span>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Button onClick={() => submitGrant(t)} disabled={grant.isPending || (!dist.toAll && dist.characterIds.length === 0)}>
                        {tr('Senden')}
                      </Button>
                      <button onClick={() => setDistId(null)} className="text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-600 rounded px-2 py-1">
                        {tr('Abbrechen')}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
