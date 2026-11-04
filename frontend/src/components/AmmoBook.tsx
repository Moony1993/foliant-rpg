import { useState } from 'react';
import { useAmmo, useRuleLayout, useSaveAmmo } from '../lib/queries';
import { metric } from '../lib/units';
import { Flourish } from '../pages/Spells';
import type { Ammo, AmmoPreset } from '../lib/types';
import '../pages/spellbook.css';
import { t } from '../lib/i18n';

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now() + Math.random()));
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const statLine = (a: Ammo) => [
  a.attackBonus ? `Angriff ${signed(a.attackBonus)}` : '',
  a.damageBonus ? `Schaden ${signed(a.damageBonus)}` : '',
  a.extraDamage,
].filter(Boolean).join(' · ');

const EMPTY: Ammo = { id: '', name: '', count: 20, attackBonus: 0, damageBonus: 0, extraDamage: '', notes: '' };

/** The character's quiver in the spellbook look: count shots, add from the armory of the rule package. */
export function AmmoBook({ charId }: { charId: number }) {
  const ammo = useAmmo(charId).data ?? [];
  const layout = useRuleLayout().data?.layout;
  const armory = layout?.ammunition ?? [];
  const materials = layout?.ammoMaterials ?? [];
  const save = useSaveAmmo(charId);
  const [sheet, setSheet] = useState<'armory' | 'edit' | null>(null);
  const [form, setForm] = useState<Ammo>(EMPTY);
  const [armedDelete, setArmedDelete] = useState(false);
  const [search, setSearch] = useState('');
  const [material, setMaterial] = useState('');
  const [inked, setInked] = useState<string | null>(null);
  // Same default and per-device memory as the spell library's "Nur Grundregelwerk".
  const [coreOnly, setCoreOnly] = useState(() => {
    try { return localStorage.getItem('pf-ammo-core-only') !== '0'; } catch { return true; }
  });
  const toggleCore = (v: boolean) => {
    setCoreOnly(v);
    try { localStorage.setItem('pf-ammo-core-only', v ? '1' : '0'); } catch { /* private mode */ }
  };

  const store = (next: Ammo[]) => save.mutate(next);
  const shift = (id: string, delta: number) =>
    store(ammo.map((a) => (a.id === id ? { ...a, count: Math.max(0, a.count + delta) } : a)));
  const total = ammo.reduce((n, a) => n + a.count, 0);

  function take(p: AmmoPreset) {
    const mat = materials.find((m) => m.name === material);
    const entry: Ammo = {
      id: newId(), name: mat ? `${p.name} (${mat.name})` : p.name, count: p.pack,
      attackBonus: p.attackBonus, damageBonus: p.damageBonus + (mat?.damageBonus ?? 0), extraDamage: p.extraDamage,
      notes: [p.notes, mat?.note].filter(Boolean).join(' '),
    };
    store([...ammo, entry]);
    setSheet(null);
    setInked(entry.id); setTimeout(() => setInked(null), 1300);
  }
  function edit(a: Ammo) { setForm(a); setArmedDelete(false); setSheet('edit'); }
  function submit() {
    const entry = { ...form, id: form.id || newId(), name: form.name.trim() || t('Munition') };
    store(form.id ? ammo.map((a) => (a.id === form.id ? entry : a)) : [...ammo, entry]);
    setSheet(null);
  }

  // "Core rulebook only" only when the package marks some ammunition as core.
  const hasCore = armory.some((p) => p.core);
  const presets = armory.filter((p) => (!coreOnly || !hasCore || p.core)
    && (!search || `${p.name} ${p.original} ${p.weapon}`.toLowerCase().includes(search.toLowerCase())));

  return (
    <div className="sb">
      <div className="sb-book">
        <div className="sb-page" style={{ height: 'auto', minHeight: 300 }}>
          <div className="sb-kapitel">{t('Köcher')}</div>
          <div className="sb-title">{t('Munition')}</div>
          <Flourish />
          <p className="sb-intro">
            {ammo.length === 0
              ? armory.length > 0 ? t('Noch ist dein Köcher leer. Hole dir Pfeile, Bolzen oder Kugeln aus der Waffenkammer.') : t('Noch ist dein Köcher leer.')
              : t('Du führst {total} Schuss in {length} {v} mit dir.', { total, length: ammo.length, v: ammo.length === 1 ? t('Sorte') : t('Sorten') })}
          </p>
          {ammo.map((a) => (
            <div key={a.id} className={inked === a.id ? 'sb-ink-in' : ''}
              style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, padding: '9px 0', borderBottom: '1px solid rgba(110,70,30,.22)', ...(a.count === 0 ? { opacity: 0.45, filter: 'grayscale(1)' } : {}) }}>
              {/* Name and count take the whole first line, the controls sit beside the stat line below. */}
              <button className="sb-entry" style={{ flexBasis: '100%', padding: 0, borderBottom: 0 }} onClick={() => edit(a)}>
                <span className="sb-seal">{a.name[0]}</span>
                <span className="sb-name" style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{a.name}</span>
                <span className="sb-times" style={{ fontSize: 17 }}>×{a.count}</span>
              </button>
              <span className="sb-meta" style={{ flex: 1, minWidth: 0, whiteSpace: 'normal', padding: '4px 0 0 44px', cursor: 'pointer' }}
                onClick={() => edit(a)}>{statLine(a) || metric(a.notes) || t('Standardmunition')}</span>
              <button className="sb-btn sb-btn--gold" style={{ padding: '6px 10px' }} disabled={a.count === 0}
                aria-label={t('{name}: ein Schuss', { name: a.name })} onClick={() => shift(a.id, -1)}>−1</button>
              <button className="sb-btn sb-btn--line" style={{ padding: '6px 9px' }}
                aria-label={t('{name}: einen zurück', { name: a.name })} onClick={() => shift(a.id, 1)}>+</button>
            </div>
          ))}
          <div className="sb-foot">
            <button className="sb-btn sb-btn--ink" onClick={() => { setForm(EMPTY); setArmedDelete(false); setSheet('edit'); }}>{t('+ Eigene')}</button>
            {armory.length > 0 && <button className="sb-btn sb-btn--gold" onClick={() => setSheet('armory')}>{t('Waffenkammer')}</button>}
          </div>
        </div>
      </div>

      {sheet && (
        <div className="sb-sheet-bg" onClick={() => setSheet(null)}>
          <div role="dialog" onClick={(e) => e.stopPropagation()} className={`sb-sheet ${sheet === 'armory' ? 'sb-library' : 'sb-page'}`}>
            {sheet === 'armory' && (
              <>
                <h2>{t('Waffenkammer')}</h2>
                <div style={{ fontStyle: 'italic', opacity: .8 }}>{t('Munition des Regelsystems. Antippen, um eine Packung in den Köcher zu legen.')}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <input className="sb-input" placeholder={t('Suchen…')} value={search} onChange={(e) => setSearch(e.target.value)} />
                  {materials.length > 0 && (
                    <select className="sb-input" style={{ width: 170 }} value={material} onChange={(e) => setMaterial(e.target.value)} aria-label={t('Material')}>
                      <option value="">{t('Normales Material')}</option>
                      {materials.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
                    </select>
                  )}
                </div>
                {hasCore && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 15, cursor: 'pointer' }}>
                    <input type="checkbox" checked={coreOnly} onChange={(e) => toggleCore(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#b8892b' }} />
                    {t('Nur Grundregelwerk')}
                  </label>
                )}
                {presets.map((p) => (
                  <div key={p.original} className="sb-card">
                    <div style={{ minWidth: 0 }}>
                      <div className="sb-name">{p.name}</div>
                      <div className="sb-meta">{p.weapon} · {p.pack} {' '}{t('Stück')}{p.attackBonus || p.extraDamage ? ` · ${[p.attackBonus ? `Angriff ${signed(p.attackBonus)}` : '', p.extraDamage].filter(Boolean).join(' · ')}` : ''}</div>
                      <div className="sb-meta" style={{ whiteSpace: 'normal' }}>{p.notes}</div>
                    </div>
                    <button className="sb-btn sb-btn--line" onClick={() => take(p)}>{t('Aufnehmen')}</button>
                  </div>
                ))}
                {presets.length === 0 && <p className="sb-hint" style={{ color: '#f3e3c2' }}>{t('Nichts gefunden.')}</p>}
              </>
            )}

            {sheet === 'edit' && (
              <>
                <div className="sb-kapitel">{form.id ? t('Munition bearbeiten') : t('Eigene Munition')}</div>
                <div className="sb-title">{form.name || t('Unbenannt')}</div>
                <Flourish />
                <label className="sb-label">{t('Name')}<input className="sb-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
                  <label className="sb-label">{t('Anzahl')}<input className="sb-input" type="number" min={0} value={form.count} onChange={(e) => setForm({ ...form, count: Math.max(0, +e.target.value) })} /></label>
                  <label className="sb-label">{t('Angriff')}<input className="sb-input" type="number" min={-10} max={10} value={form.attackBonus} onChange={(e) => setForm({ ...form, attackBonus: +e.target.value })} /></label>
                  <label className="sb-label">{t('Schaden')}<input className="sb-input" type="number" min={-10} max={10} value={form.damageBonus} onChange={(e) => setForm({ ...form, damageBonus: +e.target.value })} /></label>
                </div>
                <label className="sb-label">{t('Zusatzschaden')}<input className="sb-input" placeholder={t('z. B. +1W6 Feuer')} value={form.extraDamage} onChange={(e) => setForm({ ...form, extraDamage: e.target.value })} /></label>
                <label className="sb-label">{t('Notiz')}<textarea className="sb-input" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                  <button className="sb-btn sb-btn--gold" onClick={submit}>{form.id ? t('Speichern') : t('✒ In den Köcher')}</button>
                  <button className="sb-btn sb-btn--line" onClick={() => setSheet(null)}>{t('Abbrechen')}</button>
                  {form.id && (
                    <button className="sb-btn sb-btn--line" style={armedDelete ? { background: 'var(--rubric)', color: '#fbeccc' } : undefined}
                      onBlur={() => setArmedDelete(false)}
                      onClick={() => { if (!armedDelete) { setArmedDelete(true); return; } store(ammo.filter((a) => a.id !== form.id)); setSheet(null); }}>
                      {armedDelete ? t('Wirklich entfernen?') : t('Entfernen')}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
