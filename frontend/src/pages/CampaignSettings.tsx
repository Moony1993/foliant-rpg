import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCreateInvite, useCurrentCampaign, useDeleteCampaign, useInvites, useLeaveCampaign, useRemoveMember,
  useRevokeInvite, useRuleSystems, useTransferGm, useUpdateCampaign,
} from '../lib/queries';
import type { CampaignDetail, CampaignInvite } from '../lib/types';
import { useCampaignStore } from '../store/campaign';
import { api } from '../lib/api';
import { useToasts } from '../store/toast';
import { Button, Card, Field, Input, Select } from '../components/ui';
import { locale, t } from '../lib/i18n';

const inviteUrl = (code: string) => `${window.location.origin}/join/${code}`;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' });

function GeneralCard({ c }: { c: CampaignDetail }) {
  const systems = useRuleSystems();
  const update = useUpdateCampaign();
  const toast = useToasts((s) => s.push);
  const [form, setForm] = useState({ name: c.name, description: c.description, ruleSystemId: c.ruleSystemId });
  useEffect(() => setForm({ name: c.name, description: c.description, ruleSystemId: c.ruleSystemId }), [c]);
  const dirty = form.name !== c.name || form.description !== c.description || form.ruleSystemId !== c.ruleSystemId;

  return (
    <Card className="space-y-3">
      <h2 className="rubric">{t('Allgemein')}</h2>
      <Field label={t('Name')}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label={t('Beschreibung')}><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      <Field label={t('Regelsystem')}>
        <Select value={form.ruleSystemId} disabled={c.hasCharacters} onChange={(e) => setForm({ ...form, ruleSystemId: e.target.value })}>
          {systems.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </Field>
      {c.hasCharacters && <p className="text-xs text-zinc-500">{t('Fest, weil es schon Charaktere gibt.')}</p>}
      <Button disabled={!dirty || !form.name.trim() || update.isPending}
        onClick={() => update.mutate({ id: c.id, ...form, imageUrl: c.imageUrl }, { onSuccess: () => toast({ title: t('Gespeichert'), message: form.name }) })}>
        {t('Speichern')}
      </Button>
    </Card>
  );
}

function MembersCard({ c }: { c: CampaignDetail }) {
  const remove = useRemoveMember();
  const transfer = useTransferGm();
  const isGm = c.myRole === 'GM';
  return (
    <Card>
      <h2 className="rubric mb-2">{t('Mitglieder ({length})', { length: c.members.length })}</h2>
      <ul className="space-y-1.5">
        {c.members.map((m) => (
          <li key={m.userId} className="flex flex-wrap items-center gap-2 text-sm">
            <span className={`w-2 h-2 rounded-full ${m.online ? 'bg-emerald-500' : 'bg-zinc-400'}`} title={m.online ? 'online' : 'offline'} />
            <span className="font-medium">{m.displayName}</span>
            <span className="text-xs text-zinc-500">@{m.userName} · {m.characterCount} {m.characterCount === 1 ? t('Charakter') : t('Charaktere')}</span>
            {m.role === 'GM' && <span className="text-xs px-1.5 rounded bg-gold/20 text-gold font-semibold">{t('GM')}</span>}
            {isGm && m.role !== 'GM' && (
              <span className="ml-auto flex gap-1">
                <Button variant="ghost" className="text-xs px-2 py-0.5" disabled={transfer.isPending}
                  onClick={() => { if (window.confirm(t('{displayName} wird neuer GM. Du wirst Spieler. Fortfahren?', { displayName: m.displayName }))) transfer.mutate({ id: c.id, userId: m.userId }); }}>
                  {t('GM übergeben')}
                </Button>
                <Button variant="ghost" className="text-xs px-2 py-0.5" disabled={remove.isPending}
                  onClick={() => { if (window.confirm(t('{displayName} aus der Kampagne entfernen? Die Charaktere bleiben erhalten.', { displayName: m.displayName }))) remove.mutate({ id: c.id, userId: m.userId }); }}>
                  {t('Entfernen')}
                </Button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function InviteRow({ campaignId, i }: { campaignId: number; i: CampaignInvite }) {
  const revoke = useRevokeInvite();
  const toast = useToasts((s) => s.push);
  const url = inviteUrl(i.code);
  return (
    <li className={`rounded border px-2 py-1.5 ${i.valid ? 'border-zinc-300 dark:border-zinc-700' : 'border-zinc-300/50 opacity-60'}`}>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 truncate text-xs">{url}</code>
        <Button variant="ghost" className="text-xs px-2 py-0.5" disabled={!i.valid}
          onClick={() => navigator.clipboard.writeText(url).then(() => toast({ title: t('Link kopiert'), message: t('Schick ihn deinen Spielern.') }))}>
          {t('Kopieren')}
        </Button>
        <button type="button" title={t('Link ungültig machen')} className="text-xs text-zinc-500 hover:text-red-400"
          onClick={() => revoke.mutate({ id: campaignId, inviteId: i.id })}>{t('Widerrufen')}</button>
      </div>
      <div className="text-[11px] text-zinc-500 mt-0.5">
        {i.valid ? t('gültig') : t('abgelaufen/aufgebraucht')} · {i.expiresAt ? t('bis {v}', { v: fmtDate(i.expiresAt) }) : t('ohne Ablauf')} ·
        {' '}{i.maxUses ? t('{uses}/{maxUses} genutzt', { uses: i.uses, maxUses: i.maxUses }) : t('{uses}× genutzt', { uses: i.uses })}
      </div>
    </li>
  );
}

function InvitesCard({ c }: { c: CampaignDetail }) {
  const invites = useInvites(c.id);
  const create = useCreateInvite();
  const toast = useToasts((s) => s.push);
  const [days, setDays] = useState('7');
  const [uses, setUses] = useState('');
  return (
    <Card className="space-y-3">
      <h2 className="rubric">{t('Einladungen')}</h2>
      <p className="text-sm text-zinc-500">{t('Wer den Link öffnet, kann der Kampagne beitreten oder sich damit ein Konto anlegen.')}</p>
      <div className="flex flex-wrap items-end gap-2">
        <Field label={t('Gültig')}>
          <Select value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="1">{t('1 Tag')}</option><option value="7">{t('7 Tage')}</option><option value="30">{t('30 Tage')}</option><option value="">{t('unbegrenzt')}</option>
          </Select>
        </Field>
        <Field label={t('Nutzungen')}>
          <Select value={uses} onChange={(e) => setUses(e.target.value)}>
            <option value="1">{t('1 Person')}</option><option value="5">{t('bis 5')}</option><option value="">{t('unbegrenzt')}</option>
          </Select>
        </Field>
        <Button disabled={create.isPending} onClick={() => create.mutate(
          { id: c.id, expiresInDays: days ? +days : null, maxUses: uses ? +uses : null },
          { onSuccess: (i) => navigator.clipboard?.writeText(inviteUrl(i.code)).then(() => toast({ title: t('Link erstellt und kopiert'), message: t('Schick ihn deinen Spielern.') }), () => {}) },
        )}>{t('+ Link erstellen')}</Button>
      </div>
      {(invites.data?.length ?? 0) > 0 && (
        <ul className="space-y-1.5">{invites.data!.map((i) => <InviteRow key={i.id} campaignId={c.id} i={i} />)}</ul>
      )}
    </Card>
  );
}

/** Download the campaign as .foliant file (axios, so the login token goes along). */
function ExportCard({ c }: { c: CampaignDetail }) {
  const [busy, setBusy] = useState<'template' | 'backup' | null>(null);
  const [error, setError] = useState('');
  async function download(withCharacters: boolean) {
    setBusy(withCharacters ? 'backup' : 'template'); setError('');
    try {
      const r = await api.get<Blob>(`/campaigns/${c.id}/export`, { params: { withCharacters }, responseType: 'blob' });
      const name = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(r.headers['content-disposition'] ?? '')?.[1];
      const a = document.createElement('a');
      a.href = URL.createObjectURL(r.data);
      a.download = name ? decodeURIComponent(name) : 'kampagne.foliant';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      setError(t('Export fehlgeschlagen.'));
    } finally { setBusy(null); }
  }
  return (
    <Card className="space-y-2">
      <h2 className="rubric">{t('Exportieren')}</h2>
      <p className="text-sm text-zinc-500">
        {t('Als')} <b>{t('Vorlage')}</b>{t(': Items, Monster, Karten, Homebrew-Talente und -Zauber und deine Notizen — zum Weitergeben an andere GMs. Als')} <b>{t('Backup')}</b>{t(': zusätzlich alle Charaktere. Chat, Nachrichten, Termine und Mitglieder werden nie exportiert.')}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy != null} onClick={() => download(false)}>{busy === 'template' ? t('Exportiert…') : t('Als Vorlage')}</Button>
        <Button variant="ghost" disabled={busy != null} onClick={() => download(true)}>{busy === 'backup' ? t('Exportiert…') : t('Als Backup (mit Charakteren)')}</Button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </Card>
  );
}

function DangerCard({ c }: { c: CampaignDetail }) {
  const del = useDeleteCampaign();
  const leave = useLeaveCampaign();
  const setCampaignId = useCampaignStore((s) => s.setCampaignId);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState('');
  const gone = () => { setCampaignId(null); qc.resetQueries(); navigate('/campaigns'); };

  if (c.myRole !== 'GM') {
    return (
      <Card className="space-y-2">
        <h2 className="rubric">{t('Kampagne verlassen')}</h2>
        <p className="text-sm text-zinc-500">{t('Deine Charaktere bleiben bei der Kampagne; der GM kann sie weiter sehen.')}</p>
        <Button variant="danger" disabled={leave.isPending}
          onClick={() => { if (window.confirm(t('„{name}“ wirklich verlassen?', { name: c.name }))) leave.mutate(c.id, { onSuccess: gone }); }}>{t('Verlassen')}</Button>
      </Card>
    );
  }
  return (
    <Card className="space-y-2">
      <h2 className="rubric">{t('Kampagne löschen')}</h2>
      <p className="text-sm text-zinc-500">
        {t('Löscht alles dieser Kampagne endgültig: Charaktere, Karten, Monster, Items, Chat, Termine, Notizen. Zum Bestätigen den Namen eintippen.')}
      </p>
      <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={c.name} />
      <Button variant="danger" disabled={confirm !== c.name || del.isPending} onClick={() => del.mutate(c.id, { onSuccess: gone })}>
        {t('Endgültig löschen')}
      </Button>
    </Card>
  );
}

/** Settings of the campaign on screen: GM edits everything, players see members and can leave. */
export function CampaignSettingsPage() {
  const current = useCurrentCampaign();
  const c = current.data;
  if (current.isLoading) return <p className="p-4 text-sm text-zinc-500">{t('Lädt…')}</p>;
  if (!c) return <p className="p-4 text-sm text-zinc-500">{t('Keine Kampagne ausgewählt.')}</p>;
  const isGm = c.myRole === 'GM';
  return (
    <div className="p-4 space-y-4 max-w-3xl">
      <h1 className="text-xl font-bold text-gold">{c.name}</h1>
      <p className="text-sm text-zinc-500 -mt-2">{c.ruleSystemName}</p>
      {isGm && <GeneralCard c={c} />}
      {isGm && <InvitesCard c={c} />}
      <MembersCard c={c} />
      {isGm && <ExportCard c={c} />}
      <DangerCard c={c} />
    </div>
  );
}
