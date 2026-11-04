import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useIdentifyItem, useMaps, useRuleLayout, useSetTempHp, useUpdateHp } from '../lib/queries';
import { fillTemplate, formatStat } from '../lib/stats';
import type { GmCharacter } from '../lib/types';
import { useToasts } from '../store/toast';
import { Button, Card } from './ui';
import { locale, t } from '../lib/i18n';

// ── Conditions (PF1) — used by the reference list and the status picker ─────
export const CONDITIONS: { name: string; icon: string; kind: 'buff' | 'debuff'; desc: string }[] = [
  { name: t('Auf dem falschen Fuß'), icon: '😳', kind: 'debuff', desc: t('Kein GES-Bonus auf RK, keine Gelegenheitsangriffe.') },
  { name: t('Benommen'), icon: '💫', kind: 'debuff', desc: t('Keine Aktionen, RK normal.') },
  { name: t('Betäubt'), icon: '⚡', kind: 'debuff', desc: t('Keine Aktionen, −2 RK, verliert GES-Bonus, lässt Gehaltenes fallen.') },
  { name: t('Blind'), icon: '🙈', kind: 'debuff', desc: t('−2 RK, kein GES-Bonus, 50 % Fehlschlag, −4 auf STÄ/GES-Fertigkeiten, halbe Bewegung.') },
  { name: t('Bewusstlos'), icon: '😵', kind: 'debuff', desc: t('Hilflos, bekommt nichts mit.') },
  { name: t('Erschöpft'), icon: '🥵', kind: 'debuff', desc: t('Halbe Bewegung, −6 STÄ und GES, kein Rennen/Sturmangriff.') },
  { name: t('Ermüdet'), icon: '😮‍💨', kind: 'debuff', desc: t('−2 STÄ und GES, kein Rennen/Sturmangriff.') },
  { name: t('Erschüttert'), icon: '😟', kind: 'debuff', desc: t('−2 auf Angriffe, Rettungswürfe, Fertigkeiten und Attributswürfe.') },
  { name: t('Festgehalten'), icon: '🤼', kind: 'debuff', desc: t('−4 GES, −2 Angriff/KMB (außer Ringen), keine Bewegung, Zauber nur mit Konzentration.') },
  { name: t('Gelähmt'), icon: '🧊', kind: 'debuff', desc: t('STÄ und GES gelten als 0, hilflos, keine körperlichen Aktionen.') },
  { name: t('Hilflos'), icon: '🪢', kind: 'debuff', desc: t('GES gilt als 0, +4 auf Nahkampf gegen ihn, Todesstoß möglich.') },
  { name: t('Kränkelnd'), icon: '🤢', kind: 'debuff', desc: t('−2 auf Angriff, Schaden, Rettungswürfe, Fertigkeiten und Attributswürfe.') },
  { name: t('Liegend'), icon: '🛌', kind: 'debuff', desc: t('−4 Nahkampfangriff, +4 RK gegen Fernkampf, −4 RK gegen Nahkampf.') },
  { name: t('Taub'), icon: '🙉', kind: 'debuff', desc: t('−4 Initiative, 20 % Fehlschlag bei Zaubern mit Verbalkomponente.') },
  { name: t('Übelkeit'), icon: '🤮', kind: 'debuff', desc: t('Nur eine Bewegungsaktion pro Runde, kein Zaubern/Angreifen.') },
  { name: t('Verängstigt'), icon: '😱', kind: 'debuff', desc: t('Wie erschüttert, flieht zusätzlich von der Quelle.') },
  { name: t('Verstrickt'), icon: '🕸', kind: 'debuff', desc: t('Halbe Bewegung, −2 Angriff, −4 GES.') },
  { name: t('Wankend'), icon: '🥴', kind: 'debuff', desc: t('Nur eine Bewegungs- oder Standard-Aktion pro Runde.') },
  { name: t('Unsichtbar'), icon: '👻', kind: 'buff', desc: t('+2 auf Angriffe, Ziel verliert GES-Bonus auf RK.') },
];


// ── HP: [−] amount [+] — one control for damage and healing ──────────────────
export function HpControl({ onDelta, disabled }: { onDelta: (delta: number) => void; disabled?: boolean }) {
  const [amount, setAmount] = useState(1);
  const btn = 'w-7 h-7 rounded border text-sm font-bold disabled:opacity-40';
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" title={t('Schaden')} disabled={disabled || amount <= 0} onClick={() => onDelta(-amount)}
        className={`${btn} border-red-500/60 text-red-400 hover:bg-red-500/10`}>−</button>
      <input type="number" min={1} value={amount} onChange={(e) => setAmount(Math.max(0, +e.target.value))}
        onKeyDown={(e) => { if (e.key === 'Enter' && amount > 0) onDelta(-amount); }}
        aria-label={t('HP-Betrag')} className="w-12 h-7 rounded border border-zinc-600 bg-transparent text-center text-sm" />
      <button type="button" title={t('Heilen')} disabled={disabled || amount <= 0} onClick={() => onDelta(amount)}
        className={`${btn} border-emerald-500/60 text-emerald-400 hover:bg-emerald-500/10`}>+</button>
    </span>
  );
}

export function HpBar({ cur, max, temp = 0, className = 'w-24' }: { cur: number; max: number; temp?: number; className?: string }) {
  const pct = max > 0 ? Math.round((cur / max) * 100) : 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${className}`}>
      <span className="flex-1 h-1.5 rounded bg-zinc-700 overflow-hidden">
        <span className={`block h-full ${pct > 50 ? 'bg-emerald-500' : pct > 20 ? 'bg-amber-500' : 'bg-red-600'}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular-nums">{cur}/{max}{temp > 0 && <span className="text-sky-500"> +{temp}</span>}</span>
    </span>
  );
}

/** Character HP change from the GM; refreshes the GM overview. */
export function PcHpControl({ charId }: { charId: number }) {
  const qc = useQueryClient();
  const upd = useUpdateHp(charId);
  return <HpControl disabled={upd.isPending}
    onDelta={(d) => upd.mutate(d, { onSuccess: () => qc.invalidateQueries({ queryKey: ['gm-characters'] }) })} />;
}

// ── Small cards: active map, rest for everyone ──────────────────────────────
export function ActiveMapCard() {
  const maps = useMaps();
  const active = maps.data?.find((m) => m.isActive);
  return (
    <Link to="/map" className="block">
      <Card className="h-full hover:border-gold/60 transition-colors">
        <div className="text-xs uppercase tracking-wide text-zinc-500">{t('Aktive Karte')}</div>
        <div className="mt-1 font-medium truncate">🗺 {active ? active.name : t('Keine aktive Karte')}</div>
      </Card>
    </Link>
  );
}

export function RestAllCard({ characters }: { characters: GmCharacter[] }) {
  const qc = useQueryClient();
  const toast = useToasts((s) => s.push);
  const [resting, setResting] = useState(false);

  async function restAll() {
    if (!window.confirm(t('Rast für alle {length} Charaktere? (Zauber und Ressourcen werden zurückgesetzt)', { length: characters.length }))) return;
    setResting(true);
    try {
      await Promise.all(characters.map((r) => api.post(`/characters/${r.character.id}/rest`)));
      qc.invalidateQueries({ queryKey: ['gm-characters'] });
      toast({ title: t('Rast'), message: t('Alle Charaktere haben gerastet.') });
    } finally { setResting(false); }
  }

  return (
    <Card className="h-full flex items-center justify-between gap-2">
      <div>
        <div className="text-xs uppercase tracking-wide text-zinc-500">{t('Rast')}</div>
        <div className="text-xs text-zinc-500">{t('Zauber & Ressourcen aller Charaktere zurücksetzen')}</div>
      </div>
      <Button variant="ghost" className="px-2 py-1 flex-shrink-0" disabled={resting || characters.length === 0} onClick={restAll}>{t('☾ Rast für alle')}</Button>
    </Card>
  );
}

// ── Open items: everything still waiting on the GM or a player ─────────────
const SOON_MS = 30 * 60_000;

export function OpenItemsCard({ characters }: { characters: GmCharacter[] }) {
  const identify = useIdentifyItem();
  const now = Date.now();
  type Entry = { key: string; icon: string; text: string; who: string; tone: string; action?: () => void; actionLabel?: string };
  const entries: Entry[] = [];

  for (const { character: c, statusEffects } of characters) {
    const d = c.derived;
    if (c.currentHp <= 0)
      entries.push({ key: `down-${c.id}`, icon: '💀', text: t('kampfunfähig ({currentHp} HP)', { currentHp: c.currentHp }), who: c.name, tone: 'text-red-400' });
    else if (c.currentHp / d.maxHp <= 0.25)
      entries.push({ key: `low-${c.id}`, icon: '🩸', text: t('kaum noch HP ({currentHp}/{maxHp})', { currentHp: c.currentHp, maxHp: d.maxHp }), who: c.name, tone: 'text-amber-400' });
    for (const i of c.items.filter((i) => !i.isIdentified))
      entries.push({
        key: `id-${i.id}`, icon: '❔', text: t('{name} unidentifiziert', { name: i.template.name }), who: c.name, tone: 'text-amber-400',
        action: () => identify.mutate({ inventoryItemId: i.id, identified: true }), actionLabel: t('identifizieren'),
      });
    if (c.pendingLevelUp)
      entries.push({ key: `lvl-${c.id}`, icon: '⬆', text: t('Stufenaufstieg auf {level} noch nicht bestätigt', { level: c.level }), who: c.name, tone: 'text-gold' });
    const missingFeats = d.featBudget - (c.feats?.length ?? 0);
    if (missingFeats > 0)
      entries.push({ key: `feat-${c.id}`, icon: '📜', text: t('{missingFeats} Talent{v} nicht gewählt', { missingFeats, v: missingFeats > 1 ? 'e' : '' }), who: c.name, tone: 'text-zinc-400' });
    if (d.load === 'heavy' || d.load === 'overloaded')
      entries.push({ key: `load-${c.id}`, icon: '🎒', text: d.load === 'overloaded' ? t('überladen') : 'schwer beladen', who: c.name, tone: 'text-zinc-400' });
    for (const st of statusEffects.filter((x) => x.expiresAt && new Date(x.expiresAt).getTime() - now < SOON_MS))
      entries.push({
        key: `st-${st.id}`, icon: st.icon, tone: 'text-zinc-400', who: c.name,
        text: t('{name} endet um {time}', { name: st.name, time: new Date(st.expiresAt!).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) }),
      });
  }

  return (
    <Card>
      <h2 className="rubric mb-2">{t('Offene Punkte')}{' '} {entries.length > 0 && <span className="text-zinc-500">({entries.length})</span>}</h2>
      {entries.length === 0 ? <p className="text-sm text-emerald-500">{t('✓ Alles erledigt.')}</p> : (
        <ul className="space-y-1 text-sm max-h-72 overflow-y-auto">
          {entries.map((e) => (
            <li key={e.key} className="flex items-center gap-2">
              <span className="w-5 text-center flex-shrink-0">{e.icon}</span>
              <span className="flex-1 min-w-0 truncate"><b className="font-medium">{e.who}</b> <span className={e.tone}>{e.text}</span></span>
              {e.action && (
                <button type="button" onClick={e.action} disabled={identify.isPending}
                  className="text-xs border border-amber-500/60 text-amber-400 rounded px-2 py-0.5 flex-shrink-0 disabled:opacity-50">{e.actionLabel}</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ── Party quick stats ────────────────────────────────────────────────────────
export function PartyTable({ characters }: { characters: GmCharacter[] }) {
  const layout = useRuleLayout().data?.layout;
  if (characters.length === 0 || !layout) return null;
  return (
    <Card>
      <h2 className="rubric mb-2">{t('Gruppe auf einen Blick')}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase text-zinc-500">
            <tr className="text-left">
              <th className="py-1 pr-2 font-normal">{t('Name')}</th>
              <th className="px-2 font-normal">{t('HP')}</th>
              {layout.partyStats.map((st) => (
                <th key={st.key} className="px-2 font-normal text-center" title={st.label}>{st.short ?? st.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {characters.map(({ character: c, statusEffects }) => {
              const d = c.derived;
              return (
                <tr key={c.id} className="border-t border-zinc-300/40 dark:border-zinc-700/60">
                  <td className="py-1 pr-2 whitespace-nowrap">
                    {c.name} {statusEffects.map((s) => <span key={s.id} title={s.name}>{s.icon}</span>)}
                  </td>
                  <td className="px-2"><HpBar cur={c.currentHp} max={d.maxHp} temp={c.tempHp} /></td>
                  {layout.partyStats.map((st) => (
                    <td key={st.key} className="px-2 text-center" title={st.key === 'ac' ? fillTemplate(layout.armorDetail, d) : undefined}>
                      {formatStat(st, d)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Conditions reference ────────────────────────────────────────────────────
export function ConditionReference() {
  return (
    <Card>
      <details>
        <summary className="rubric cursor-pointer select-none">{t('Zustände (Kurzreferenz)')}</summary>
        <ul className="mt-2 space-y-1.5 text-sm">
          {CONDITIONS.map((c) => (
            <li key={c.name}><span className="font-medium">{c.icon} {c.name}</span> <span className="text-zinc-500">— {c.desc}</span></li>
          ))}
        </ul>
      </details>
    </Card>
  );
}

/** Small number field for temporary hit points; saves on Enter or when leaving the field. */
export function TempHpInput({ charId, value, className = '' }: { charId: number; value: number; className?: string }) {
  const set = useSetTempHp(charId);
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Math.max(0, Math.min(999, Math.trunc(Number(draft) || 0)));
    setDraft(null);
    if (n !== value) set.mutate(n);
  };
  return (
    <label className={`inline-flex items-center gap-1 text-xs text-sky-500 ${className}`} title={t('Temporäre TP — Schaden zieht zuerst hiervon ab')}>
      {t('Temp. TP')}
      <input type="number" min={0} value={draft ?? value} disabled={set.isPending}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="w-14 h-7 rounded border border-sky-500/50 bg-transparent text-center text-sm text-current" />
    </label>
  );
}
