import { useMemo, useState } from 'react';
import { useActive } from '../lib/useActive';
import { useDeleteSkill, useSaveSkill, useSkills, useUnlockSkill } from '../lib/queries';
import { useToasts } from '../store/toast';
import { Button, Card, Field, Input, Select } from '../components/ui';
import type { Skill, SkillInput } from '../lib/types';
import { t } from '../lib/i18n';

const EMPTY: SkillInput = {
  name: '', description: '', type: 'Combat', rank: 1, maxRank: 3, cooldown: 0,
  isPassive: false, unlocked: false, requiresSkillId: null, tier: 0,
};

export function SkillsPage() {
  const { activeId } = useActive();
  const charId = activeId ?? 0;
  const skills = useSkills(activeId);
  const save = useSaveSkill(charId);
  const del = useDeleteSkill(charId);
  const unlock = useUnlockSkill(charId);
  const toast = useToasts((s) => s.push);

  const [search, setSearch] = useState('');
  const [type, setType] = useState('All');
  const [form, setForm] = useState<SkillInput>(EMPTY);
  const [editId, setEditId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  const types = useMemo(
    () => ['All', ...new Set((skills.data ?? []).map((s) => s.type).filter(Boolean))],
    [skills.data],
  );

  const filtered = (skills.data ?? []).filter(
    (s) =>
      (type === 'All' || s.type === type) &&
      (!search || s.name.toLowerCase().includes(search.toLowerCase())),
  );

  // Group by tier for the tree view.
  const tiers = useMemo(() => {
    const map = new Map<number, Skill[]>();
    for (const s of filtered) map.set(s.tier, [...(map.get(s.tier) ?? []), s]);
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [filtered]);

  const nameById = (id: number | null) => skills.data?.find((s) => s.id === id)?.name;

  async function submit() {
    await save.mutateAsync({ id: editId ?? undefined, input: form });
    setForm(EMPTY); setEditId(null); setShowForm(false);
  }
  function edit(s: Skill) {
    const { id, ...rest } = s;
    setForm(rest); setEditId(id); setShowForm(true);
  }
  async function doUnlock(id: number) {
    try { await unlock.mutateAsync(id); }
    catch (e: any) { toast({ title: t('Nicht möglich'), message: e.response?.data?.message ?? t('Freischalten fehlgeschlagen.') }); }
  }

  if (!activeId) return <div className="p-4 text-zinc-500">{t('Kein Charakter ausgewählt.')}</div>;

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gold">{t('Fähigkeiten')}</h1>
        <Button variant="ghost" onClick={() => { setForm(EMPTY); setEditId(null); setShowForm((v) => !v); }}>
          {showForm ? t('Abbrechen') : t('+ Neu')}
        </Button>
      </div>

      <div className="flex gap-2">
        <Input placeholder={t('Suche…')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={type} onChange={(e) => setType(e.target.value)} className="w-40">
          {types.map((t) => <option key={t}>{t}</option>)}
        </Select>
      </div>

      {showForm && (
        <Card className="grid grid-cols-2 gap-3">
          <Field label={t('Name')}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label={t('Typ')}><Input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} /></Field>
          <Field label={t('Rang')}><Input type="number" value={form.rank} onChange={(e) => setForm({ ...form, rank: +e.target.value })} /></Field>
          <Field label={t('Max. Rang')}><Input type="number" value={form.maxRank} onChange={(e) => setForm({ ...form, maxRank: +e.target.value })} /></Field>
          <Field label={t('Cooldown')}><Input type="number" value={form.cooldown} onChange={(e) => setForm({ ...form, cooldown: +e.target.value })} /></Field>
          <Field label={t('Tier (Baumtiefe)')}><Input type="number" value={form.tier} onChange={(e) => setForm({ ...form, tier: +e.target.value })} /></Field>
          <Field label={t('Voraussetzung')}>
            <Select value={form.requiresSkillId ?? ''} onChange={(e) => setForm({ ...form, requiresSkillId: e.target.value ? +e.target.value : null })}>
              <option value="">{t('— keine —')}</option>
              {(skills.data ?? []).filter((s) => s.id !== editId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm mt-6">
            <input type="checkbox" checked={form.isPassive} onChange={(e) => setForm({ ...form, isPassive: e.target.checked })} />
            {t('Passive Fähigkeit')}
          </label>
          <div className="col-span-2"><Field label={t('Beschreibung')}><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field></div>
          <div className="col-span-2"><Button onClick={submit} disabled={!form.name}>{editId ? t('Speichern') : t('Erstellen')}</Button></div>
        </Card>
      )}

      {tiers.length === 0 ? (
        <Card className="text-zinc-500 text-sm">{t('Noch keine Fähigkeiten.')}</Card>
      ) : (
        tiers.map(([tier, list]) => (
          <div key={tier}>
            <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">{t('Tier {tier}', { tier })}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {list.map((s) => (
                <Card key={s.id} className={`border-l-4 ${s.unlocked ? 'border-gold' : 'border-zinc-600'}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold">{s.name} <span className="text-xs text-zinc-500">{s.type}</span></div>
                      <div className="text-xs text-zinc-500">
                        {t('Rang')}{' '} {s.rank}/{s.maxRank} · {s.isPassive ? t('Passiv') : t('Aktiv')}{s.cooldown ? ` · CD ${s.cooldown}` : ''}
                      </div>
                      {s.requiresSkillId && <div className="text-xs text-amber-500">{t('benötigt: {v}', { v: nameById(s.requiresSkillId) ?? '?' })}</div>}
                      {s.description && <p className="text-sm text-zinc-400 mt-1">{s.description}</p>}
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      {!s.unlocked && <Button className="text-xs py-1" onClick={() => doUnlock(s.id)}>{t('Freischalten')}</Button>}
                      <Button variant="ghost" className="text-xs py-1" onClick={() => edit(s)}>✎</Button>
                      <Button variant="danger" className="text-xs py-1" onClick={() => del.mutate(s.id)}>✕</Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
