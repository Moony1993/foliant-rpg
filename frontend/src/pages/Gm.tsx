import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAddStatus, useComposeMessage, useDeleteStatus, useGmCharacters, useGrantGold, useGrantItem, useGrantLevelUp,
  useIdentifyItem, useItemTemplates, useLevelDown, usePlayers, useRuleLayout,
} from '../lib/queries';
import { classLine, fillTemplate, formatStat } from '../lib/stats';
import type { GmCharacter } from '../lib/types';
import { useAuth } from '../store/auth';
import { useToasts } from '../store/toast';
import { Button, Card, Input, RarityText, Select, SLOT_LABEL } from '../components/ui';
import { ItemIcon } from '../components/item';
import { NoteCards } from '../components/NoteCards';
import { TempHpInput, CONDITIONS, ActiveMapCard, ConditionReference, OpenItemsCard, PartyTable, RestAllCard, PcHpControl } from '../components/GmTools';
import { t } from '../lib/i18n';

// Players + GMs who own characters — GM characters are full characters (level up, items, gold).
const hasChars = (p: { roles: string[]; characterCount: number }) => p.roles.includes('Player') || p.characterCount > 0;

const refreshGm = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: ['gm-characters'] });

/** Add a condition (pick from the list or type your own). */
function StatusTool({ charId, onDone }: { charId: number; onDone: () => void }) {
  const qc = useQueryClient();
  const add = useAddStatus(charId);
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState(0);
  const preset = CONDITIONS.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
  function submit(n = name) {
    const p = CONDITIONS.find((c) => c.name === n) ?? preset;
    if (!n.trim()) return;
    add.mutate({
      name: p?.name ?? n.trim(), description: p?.desc ?? '', icon: p?.icon ?? '⬇️', kind: p?.kind ?? 'debuff',
      expiresAt: minutes > 0 ? new Date(Date.now() + minutes * 60_000).toISOString() : null,
    }, { onSuccess: () => { refreshGm(qc); setName(''); onDone(); } });
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {CONDITIONS.map((c) => (
          <button key={c.name} type="button" title={c.desc} disabled={add.isPending} onClick={() => submit(c.name)}
            className={`text-xs px-2 py-0.5 rounded border disabled:opacity-50 ${c.kind === 'debuff' ? 'border-red-500/40 hover:bg-red-500/10' : 'border-emerald-500/40 hover:bg-emerald-500/10'}`}>
            {c.icon} {c.name}
          </button>
        ))}
      </div>
      <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Input placeholder={t('Eigener Effekt, z. B. Segen')} value={name} onChange={(e) => setName(e.target.value)} className="flex-1 min-w-[10rem]" />
        <label className="text-xs text-zinc-500 flex items-center gap-1">
          {t('Dauer')} <Input type="number" min={0} value={minutes} onChange={(e) => setMinutes(+e.target.value)} className="w-16" /> {t('Min (0 = bis entfernt)')}
        </label>
        <Button type="submit" disabled={!name.trim() || add.isPending}>{t('Hinzufügen')}</Button>
      </form>
    </div>
  );
}

/** Give an item to this character. */
function ItemTool({ charId, onDone }: { charId: number; onDone: () => void }) {
  const items = useItemTemplates();
  const grant = useGrantItem();
  const toast = useToasts((s) => s.push);
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState(1);
  const [unidentified, setUnidentified] = useState(false);
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={async (e) => {
      e.preventDefault();
      await grant.mutateAsync({ itemTemplateId: +itemId, quantity: qty, characterIds: [charId], toAll: false, unidentified });
      toast({ title: t('Item vergeben'), message: items.data?.find((t) => t.id === +itemId)?.name ?? '' });
      setItemId(''); setQty(1); onDone();
    }}>
      <Select value={itemId} onChange={(e) => setItemId(e.target.value)} className="flex-1 min-w-[10rem]">
        <option value="">{t('Item wählen…')}</option>
        {items.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </Select>
      <Input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, +e.target.value))} className="w-16" aria-label={t('Anzahl')} />
      <label className="text-xs flex items-center gap-1">
        <input type="checkbox" checked={unidentified} onChange={(e) => setUnidentified(e.target.checked)} /> {t('unidentifiziert')}
      </label>
      <Button type="submit" disabled={!itemId || grant.isPending}>{t('Geben')}</Button>
    </form>
  );
}

/** Private message to the character's player. */
function MessageTool({ ownerId, onDone }: { ownerId: string; onDone: () => void }) {
  const compose = useComposeMessage();
  const toast = useToasts((s) => s.push);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  return (
    <form className="space-y-2" onSubmit={async (e) => {
      e.preventDefault();
      await compose.mutateAsync({ subject: subject || t('Vom GM'), body, recipientUserIds: [ownerId], toAll: false, isImportant: false, scheduledFor: null });
      toast({ title: t('Nachricht gesendet'), message: subject || t('Vom GM') });
      setSubject(''); setBody(''); onDone();
    }}>
      <Input placeholder={t('Betreff (optional)')} value={subject} onChange={(e) => setSubject(e.target.value)} />
      <textarea placeholder={t('Nur dieser Spieler sieht die Nachricht…')} value={body} onChange={(e) => setBody(e.target.value)} rows={3}
        className="w-full rounded border border-zinc-600 bg-transparent px-2 py-1 text-sm" />
      <Button type="submit" disabled={!body.trim() || compose.isPending}>{t('Senden')}</Button>
    </form>
  );
}

type Tool = 'status' | 'item' | 'message' | null;

/** One character in the GM overview: values, status effects and inventory (with identify toggle). */
function GmCharacterRow({ row }: { row: GmCharacter }) {
  const layout = useRuleLayout().data?.layout;
  const [open, setOpen] = useState(false);
  const grantLevelUp = useGrantLevelUp();
  const levelDown = useLevelDown();
  const identify = useIdentifyItem();
  const toast = useToasts((s) => s.push);
  const qc = useQueryClient();
  const c = row.character;
  const delStatus = useDeleteStatus(c.id);
  const [tool, setTool] = useState<Tool>(null);
  const toolBtn = (t: Exclude<Tool, null>, label: string) => (
    <button type="button" onClick={() => setTool(tool === t ? null : t)}
      className={`text-xs px-2 py-1 rounded border ${tool === t ? 'border-gold text-gold' : 'border-zinc-600 hover:border-zinc-400'}`}>{label}</button>
  );
  const d = c.derived;
  const hpPct = d.maxHp > 0 ? Math.round((c.currentHp / d.maxHp) * 100) : 0;
  const unidentified = c.items.filter((i) => !i.isIdentified).length;

  return (
    <li className="rounded-lg bg-zinc-200/40 dark:bg-zinc-800/40">
      {/* Phones: name and values take the full row, the level buttons wrap below on the right. */}
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2 px-3 py-2">
        <button onClick={() => setOpen(!open)} className="basis-full sm:basis-0 flex-1 min-w-0 text-left">
          <div className="flex flex-wrap sm:flex-nowrap items-baseline gap-x-2">
            <span className="font-medium truncate">{c.name}</span>
            <span className="text-xs text-zinc-500 truncate">
              {c.race} · {classLine(layout, c)} {' '}{t('· Stufe')}{' '} {c.level} · {row.ownerName}{row.ownerRoles.includes('Player') ? '' : ' (GM)'}
            </span>
            {c.pendingLevelUp && <span className="text-xs text-gold">⬆</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
            <span className="flex items-center gap-1 w-32">
              ❤ <span className="flex-1 h-1.5 rounded bg-zinc-700 overflow-hidden">
                <span className={`block h-full ${hpPct > 50 ? 'bg-emerald-500' : hpPct > 20 ? 'bg-amber-500' : 'bg-red-600'}`} style={{ width: `${hpPct}%` }} />
              </span>
              {c.currentHp}/{d.maxHp}{(c.tempHp ?? 0) > 0 && <span className="text-sky-500">+{c.tempHp}</span>}
            </span>
            <span>🔷 {c.currentMana}</span>
            <span>{t('🛡 RK {ac}', { ac: d.ac })}</span>
            <span>🪙 {c.gold}</span>
            <span>🎒 {c.items.length}{unidentified > 0 && <span className="text-amber-400"> ({unidentified} ?)</span>}</span>
            {row.statusEffects.map((s) => (
              <span key={s.id} title={`${s.name}${s.description ? ` — ${s.description}` : ''}`} className={s.kind === 'debuff' ? 'text-red-400' : 'text-emerald-400'}>{s.icon}</span>
            ))}
          </div>
        </button>
        <Button
          variant="ghost"
          className="text-xs px-2 py-1 flex-shrink-0 ml-auto"
          disabled={grantLevelUp.isPending}
          onClick={async () => {
            await grantLevelUp.mutateAsync(c.id);
            toast({ title: t('Stufenaufstieg vergeben!'), message: t('{name} ist jetzt Stufe {v}.', { name: c.name, v: c.level + 1 }) });
          }}
        >{t('⬆ Stufe')}</Button>
        <Button
          variant="ghost"
          className="text-xs px-2 py-1 flex-shrink-0"
          disabled={levelDown.isPending || c.level <= 1}
          title={t('Stufe zurücknehmen (z. B. falscher Charakter)')}
          onClick={async () => {
            if (!window.confirm(t('{name} von Stufe {level} auf {v} zurücksetzen?', { name: c.name, level: c.level, v: c.level - 1 }))) return;
            await levelDown.mutateAsync(c.id);
            toast({ title: t('Stufe zurückgesetzt'), message: t('{name} ist jetzt Stufe {v}.', { name: c.name, v: c.level - 1 }) });
          }}
        >⬇</Button>
      </div>

      {open && (
        <div className="border-t border-zinc-300 dark:border-zinc-700 px-3 py-2 space-y-3 text-sm">
          {/* GM actions */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-500">{t('❤ HP')}</span>
            <PcHpControl charId={c.id} />
            <TempHpInput charId={c.id} value={c.tempHp ?? 0} />
            <span className="mx-1 h-5 border-l border-zinc-600" />
            {toolBtn('status', t('✨ Zustand'))}
            {toolBtn('item', t('🎁 Item geben'))}
            {toolBtn('message', t('✉ Nachricht'))}
          </div>
          {tool && (
            <div className="rounded border border-zinc-300 dark:border-zinc-700 p-2">
              {tool === 'status' && <StatusTool charId={c.id} onDone={() => setTool(null)} />}
              {tool === 'item' && <ItemTool charId={c.id} onDone={() => setTool(null)} />}
              {tool === 'message' && <MessageTool ownerId={row.ownerId} onDone={() => setTool(null)} />}
            </div>
          )}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
            {(['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'] as const).map((k) => (
              <div key={k} className="rounded bg-zinc-100 dark:bg-zinc-900/60 py-1">
                <div className="text-[10px] uppercase text-zinc-500">{k}</div>
                <div className="font-bold">{d.scores[k]}</div>
                <div className="text-xs text-zinc-400">{(d.modifiers[k] ?? 0) >= 0 ? '+' : ''}{d.modifiers[k] ?? 0}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
            {layout && <span>{fillTemplate(layout.armorDetail, d)}</span>}
            {layout?.combatStats.map((st) => <span key={st.key}>{st.label} {formatStat(st, d)}</span>)}
            <span>{t('Last {carriedWeight}/{carryCapacity} ({load})', { carriedWeight: d.carriedWeight, carryCapacity: d.carryCapacity, load: d.load })}</span>
          </div>
          {row.statusEffects.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs">
              {row.statusEffects.map((s) => (
                <span key={s.id} title={s.description} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border ${s.kind === 'debuff' ? 'border-red-500/50 text-red-400' : 'border-emerald-500/50 text-emerald-400'}`}>
                  {s.icon} {s.name}{s.expiresAt ? t(' · bis {v}', { v: new Date(s.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }) : ''}
                  <button type="button" title={t('Entfernen')} disabled={delStatus.isPending}
                    onClick={() => delStatus.mutate(s.id, { onSuccess: () => refreshGm(qc) })} className="hover:text-white">×</button>
                </span>
              ))}
            </div>
          )}
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">{t('Inventar')}</div>
            {c.items.length === 0 ? <p className="text-xs text-zinc-500">{t('Leer.')}</p> : (
              <ul className="space-y-1">
                {c.items.map((i) => (
                  <li key={i.id} className="flex items-center gap-2">
                    <span className="w-6 h-6 grid place-items-center flex-shrink-0"><ItemIcon iconKey={i.template.iconKey} /></span>
                    <span className="flex-1 min-w-0 truncate">
                      <RarityText rarity={i.template.rarity}>{i.template.name}</RarityText>
                      {i.quantity > 1 && <span className="text-zinc-500"> ×{i.quantity}</span>}
                      {i.equippedSlot && <span className="text-xs text-gold"> {t('· angelegt ({v})', { v: SLOT_LABEL[i.equippedSlot] ?? i.equippedSlot })}</span>}
                    </span>
                    <button
                      onClick={() => identify.mutate({ inventoryItemId: i.id, identified: !i.isIdentified })}
                      disabled={identify.isPending}
                      title={i.isIdentified ? t('Als unidentifiziert markieren') : t('Für den Spieler identifizieren')}
                      className={`text-xs border rounded px-2 py-0.5 flex-shrink-0 disabled:opacity-50 ${i.isIdentified ? 'border-zinc-600 text-zinc-400' : 'border-amber-500/60 text-amber-400'}`}
                    >
                      {i.isIdentified ? t('✓ identifiziert') : t('? identifizieren')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

export function GmPage() {
  const players = usePlayers();
  const characters = useGmCharacters();
  const myId = useAuth((s) => s.userId);
  const grantGold = useGrantGold();
  const toast = useToasts((s) => s.push);

  // Gold form
  const [gold, setGold] = useState({ amount: 100, recipients: [] as string[], toAll: false });

  function toggleGoldRecipient(id: string) {
    setGold((g) => ({ ...g, recipients: g.recipients.includes(id) ? g.recipients.filter((r) => r !== id) : [...g.recipients, id] }));
  }
  async function submitGold() {
    const res = await grantGold.mutateAsync({ amount: gold.amount, recipientUserIds: gold.recipients, toAll: gold.toAll });
    toast({ title: t('Gold verteilt'), message: `${gold.amount} 🪙 an ${res.recipients} Spieler (${res.credited} gutgeschrieben).` });
  }

  const recipients = players.data?.filter(hasChars) ?? [];
  const canSend = gold.amount !== 0 && (gold.toAll || gold.recipients.length > 0);

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-gold">{t('GM-Bereich')}</h1>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem] items-start">
        <div className="space-y-4 min-w-0">
          <div className="grid gap-4 sm:grid-cols-2">
            <ActiveMapCard />
            <RestAllCard characters={characters.data ?? []} />
          </div>
          <OpenItemsCard characters={characters.data ?? []} />
          <PartyTable characters={characters.data ?? []} />

          {/* Grant gold — one compact row: amount, recipients, send */}
          <Card className="space-y-2">
            <h2 className="rubric">{t('Gold verteilen')}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <Input type="number" className="w-32" title={t('Betrag (negativ = abziehen)')} value={gold.amount}
                onChange={(e) => setGold({ ...gold, amount: +e.target.value })} />
              {[10, 50, 100, 500].map((n) => (
                <button key={n} type="button" onClick={() => setGold({ ...gold, amount: n })}
                  className={`text-xs px-2 py-1 rounded border ${gold.amount === n ? 'border-gold text-gold' : 'border-zinc-600 hover:border-zinc-400'}`}>{n}</button>
              ))}
              <span className="text-zinc-500">→</span>
              <button type="button" onClick={() => setGold({ ...gold, toAll: !gold.toAll })}
                className={`text-xs px-2 py-1 rounded border ${gold.toAll ? 'bg-gold text-zinc-900 border-gold' : 'border-zinc-600'}`}>{t('Alle')}</button>
              {recipients.map((p) => (
                <button key={p.userId} type="button" disabled={gold.toAll} onClick={() => toggleGoldRecipient(p.userId)}
                  className={`text-xs px-2 py-1 rounded border disabled:opacity-40 ${!gold.toAll && gold.recipients.includes(p.userId) ? 'bg-gold text-zinc-900 border-gold' : 'border-zinc-600'}`}>
                  {p.displayName}
                </button>
              ))}
              <Button className="ml-auto" onClick={submitGold} disabled={!canSend || grantGold.isPending}>
                {gold.amount >= 0 ? `+${gold.amount} 🪙` : `${gold.amount} 🪙`}
              </Button>
            </div>
            {recipients.length === 0 && (
              <p className="text-xs text-amber-500">{t('Noch keine Spieler — zuerst im Admin-Bereich einen Account anlegen.')}</p>
            )}
          </Card>

          {/* Character overview — every character incl. the GM's own */}
          <Card>
            <div className="flex items-center justify-between mb-2">
              <h2 className="rubric">{t('Charaktere ({v})', { v: characters.data?.length ?? 0 })}</h2>
              <Link to="/character" className="text-xs text-gold border border-gold/40 rounded px-2 py-0.5 hover:brightness-110">
                {characters.data?.some((r) => r.ownerId === myId) ? t('Mein Charakter') : t('+ Eigenen Charakter erstellen')}
              </Link>
            </div>
            <p className="text-xs text-zinc-500 mb-2">{t('Zeile anklicken für HP, Zustände, Items, Nachricht, Werte und Inventar.')}</p>
            {characters.isLoading ? <p className="text-sm text-zinc-500">{t('Lädt…')}</p> : (characters.data?.length ?? 0) === 0 ? (
              <p className="text-xs text-amber-500">{t('Noch keine Charaktere vorhanden.')}</p>
            ) : (
              <ul className="space-y-2">{characters.data!.map((r) => <GmCharacterRow key={r.character.id} row={r} />)}</ul>
            )}
          </Card>
        </div>

        {/* Notes as right sidebar on desktop, below on mobile */}
        <aside className="lg:sticky lg:top-4 space-y-4">
          <NoteCards />
          <ConditionReference />
        </aside>
      </div>
    </div>
  );
}
