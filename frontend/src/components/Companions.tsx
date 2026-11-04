import { useState } from 'react';
import { useAddCompanion, useCompanionKinds, useCompanions, useDeleteCompanion } from '../lib/queries';
import { useToasts } from '../store/toast';
import { Button, Card, Field, Input, Select, UnitInput } from './ui';
import type { CompanionInput } from '../lib/types';
import { meters, ftToM, mToFt } from '../lib/units';
import { t } from '../lib/i18n';

const TYPES = ['Tier', 'Reittier', 'Begleiter'];
const EMPTY: CompanionInput = { name: '', type: 'Begleiter', description: '', hp: 0, ac: 10, speed: 30 };

const ICON: Record<string, string> = { Tier: '🐾', Reittier: '🐎', Begleiter: '🧑‍🤝‍🧑', Tiergefährte: '🐺', Vertrauter: '🦉', 'Reittier (Göttlicher Bund)': '🦄' };

export function Companions({ charId }: { charId: number }) {
  const companions = useCompanions(charId);
  const add = useAddCompanion(charId);
  const del = useDeleteCompanion(charId);
  const [form, setForm] = useState<CompanionInput>(EMPTY);
  const [show, setShow] = useState(false);
  // Class companions (animal companion, familiar, bonded mount) only with the matching class feature choice.
  const kinds = useCompanionKinds(charId).data ?? [];
  const toast = useToasts((s) => s.push);

  async function submit() {
    try { await add.mutateAsync(form); }
    catch (e) {
      toast({ title: t('Nicht möglich'), message: (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? t('Fehler') });
      return;
    }
    setForm(EMPTY);
    setShow(false);
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <h2 className="rubric">{t('Tiere, Reittiere & Begleiter')}</h2>
        <Button variant="ghost" className="text-xs py-1" onClick={() => setShow((v) => !v)}>{show ? t('Abbrechen') : t('+ Neu')}</Button>
      </div>

      {show && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <Field label={t('Name')}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label={t('Typ')}>
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {[...kinds, ...TYPES].map((k) => <option key={k} value={k}>{t(k)}</option>)}
            </Select>
          </Field>
          <Field label={t('TP')}><Input type="number" value={form.hp} onChange={(e) => setForm({ ...form, hp: +e.target.value })} /></Field>
          <Field label={t('RK')}><Input type="number" value={form.ac} onChange={(e) => setForm({ ...form, ac: +e.target.value })} /></Field>
          <Field label={t('Tempo (m)')}><UnitInput value={form.speed} toDisplay={ftToM} fromDisplay={mToFt} onChange={(v) => setForm({ ...form, speed: v })} /></Field>
          <div className="col-span-2"><Field label={t('Beschreibung')}><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field></div>
          <div className="col-span-2"><Button onClick={submit} disabled={!form.name}>{t('Hinzufügen')}</Button></div>
        </div>
      )}

      {(companions.data?.length ?? 0) === 0 ? (
        <p className="text-zinc-500 text-sm">{t('Keine Begleiter.')}</p>
      ) : (
        <div className="space-y-2">
          {companions.data!.map((c) => (
            <div key={c.id} className="flex items-start justify-between rounded-lg bg-zinc-200/40 dark:bg-zinc-800/40 p-2">
              <div>
                <div className="font-medium">{ICON[c.type] ?? '🐾'} {c.name} <span className="text-xs text-zinc-500">· {t(c.type)}</span></div>
                <div className="text-xs text-zinc-500">{t('TP {v} · RK {ac} · Tempo {v2}', { v: c.bond?.hp ?? c.hp, ac: c.ac, v2: meters(c.speed) })}</div>
                {c.bond && (
                  <div className="text-xs text-zinc-500 mt-0.5">
                    <span className="text-gold">{t('Bund auf Stufe {effectiveLevel}:', { effectiveLevel: c.bond.effectiveLevel })}</span>
                    {c.bond.lines.map((l) => <div key={l}>{l}</div>)}
                  </div>
                )}
                {c.bondLost && <div className="text-xs text-red-500 mt-0.5">{t('Das Klassenmerkmal gewährt diesen Begleiter nicht mehr (Dashboard prüfen).')}</div>}
                {c.description && <p className="text-sm text-zinc-400 mt-0.5">{c.description}</p>}
              </div>
              <Button variant="danger" className="text-xs py-1" onClick={() => del.mutate(c.id)}>✕</Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
