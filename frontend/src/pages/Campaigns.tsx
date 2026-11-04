import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useCampaigns, useCreateCampaign, useRuleSystems } from '../lib/queries';
import { useSwitchCampaign } from '../lib/useSwitchCampaign';
import { useAuth } from '../store/auth';
import { useCampaignStore } from '../store/campaign';
import { Button, Card, Field, Input, Select } from '../components/ui';
import { t } from '../lib/i18n';

function NewCampaign({ onCancel }: { onCancel?: () => void }) {
  const systems = useRuleSystems();
  const create = useCreateCampaign();
  const switchTo = useSwitchCampaign();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [picked, setPicked] = useState<string>();
  const ruleSystemId = picked ?? systems.data?.[0]?.id ?? '';
  const none = systems.isSuccess && systems.data.length === 0;

  return (
    <Card className="space-y-3">
      <h2 className="rubric">{t('Neue Kampagne')}</h2>
      <Field label={t('Name')}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('z. B. Die Schatten des alten Reichs')} autoFocus /></Field>
      <Field label={t('Beschreibung (optional)')}><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <Field label={t('Regelsystem')}>
        {none ? (
          <p className="text-sm text-amber-700">
            {t('Es ist noch kein Regelsystem installiert. Ein Admin kann im Admin-Bereich unter „Regelsysteme“ eins installieren.')}
          </p>
        ) : (
          <Select value={ruleSystemId} onChange={(e) => setPicked(e.target.value)}>
            {systems.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        )}
      </Field>
      <p className="text-xs text-zinc-500">{t('Das Regelsystem lässt sich nur ändern, solange es noch keine Charaktere gibt.')}</p>
      <div className="flex gap-2">
        <Button disabled={!name.trim() || !ruleSystemId || create.isPending}
          onClick={() => create.mutate({ name, description, ruleSystemId }, { onSuccess: (c) => switchTo(c.id) })}>
          {t('Kampagne anlegen')}
        </Button>
        {onCancel && <Button variant="ghost" onClick={onCancel}>{t('Abbrechen')}</Button>}
      </div>
    </Card>
  );
}

interface ImportResult { campaignId: number; name: string; counts: Record<string, number>; warnings: string[] }
const COUNT_LABEL: Record<string, string> = {
  items: t('Items'), feats: t('Talente'), spells: t('Zauber'), monsters: t('Monster'), maps: t('Karten'),
  mapAssets: t('Kartenobjekte'), notes: t('Notizen'), characters: t('Charaktere'), media: t('Bilder'),
};

/** Upload a .foliant file; creates a new campaign with me as GM. */
function ImportCampaign() {
  const qc = useQueryClient();
  const switchTo = useSwitchCampaign();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);

  async function upload(file: File) {
    setBusy(true); setError(''); setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post<ImportResult>('/campaigns/import', form);
      setResult(data);
      qc.invalidateQueries({ queryKey: ['campaigns'] });
    } catch (e: any) {
      setError(e?.response?.data?.message ?? t('Import fehlgeschlagen.'));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <Card className="space-y-2">
      <h2 className="rubric">{t('Kampagne importieren')}</h2>
      <p className="text-sm text-zinc-500">{t('Eine')} <code>{t('.foliant')}</code>{t('-Datei von einem anderen GM wird zu einer neuen Kampagne, die du leitest.')}</p>
      <input ref={input} type="file" accept=".foliant,application/zip" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      <Button variant="ghost" disabled={busy} onClick={() => input.current?.click()}>{busy ? t('Importiert…') : t('Datei auswählen…')}</Button>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {result && (
        <div className="rounded border border-emerald-500/50 bg-emerald-500/10 p-2 text-sm space-y-1">
          <p><b>„{result.name}“</b> {' '}{t('wurde angelegt:')}{' '}
            {Object.entries(result.counts).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${COUNT_LABEL[k] ?? k}`).join(', ') || 'leer'}.</p>
          {result.warnings.length > 0 && (
            <details className="text-xs text-amber-600">
              <summary>{result.warnings.length} {' '}{t('Hinweis')}{result.warnings.length > 1 ? 'e' : ''}</summary>
              <ul className="list-disc pl-4">{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </details>
          )}
          <Button onClick={() => switchTo(result.campaignId)}>{t('Zur Kampagne wechseln')}</Button>
        </div>
      )}
    </Card>
  );
}

/** All my campaigns; also the start page for accounts that aren't in any campaign yet. */
export function CampaignsPage() {
  const campaigns = useCampaigns();
  const canCreate = useAuth((s) => s.canCreateCampaign());
  const activeId = useCampaignStore((s) => s.campaignId);
  const switchTo = useSwitchCampaign();
  const [creating, setCreating] = useState(false);
  const list = campaigns.data ?? [];
  // Without a stored choice the API uses the oldest membership — the first in this list.
  const currentId = activeId ?? list[0]?.id;

  return (
    <div className="p-4 space-y-4 max-w-3xl">
      <h1 className="text-xl font-bold text-gold">{t('Kampagnen')}</h1>

      {campaigns.isLoading && <p className="text-sm text-zinc-500">{t('Lädt…')}</p>}

      {!campaigns.isLoading && list.length === 0 && (
        <Card className="space-y-2">
          <h2 className="rubric">{t('Noch keine Kampagne')}</h2>
          <p className="text-sm">
            {canCreate
              ? t('Leg deine erste Kampagne an und lade deine Spieler per Link ein.')
              : t('Du bist noch in keiner Kampagne. Bitte deinen Spielleiter um einen Einladungslink und öffne ihn.')}
          </p>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {list.map((c) => (
          <button key={c.id} type="button" onClick={() => switchTo(c.id)} className="text-left">
            <Card className={`h-full transition-colors ${c.id === currentId ? 'ring-2 ring-gold' : 'hover:ring-1 hover:ring-gold/50'}`}>
              <div className="flex items-start justify-between gap-2">
                <h2 className="rubric">{c.name}</h2>
                {c.id === currentId && <span className="text-xs text-gold font-semibold">{t('aktiv')}</span>}
              </div>
              {c.description && <p className="text-sm text-zinc-500 line-clamp-2">{c.description}</p>}
              <p className="mt-1 text-xs text-zinc-500">
                {c.ruleSystemName} · {c.role === 'GM' ? t('Du leitest') : `GM: ${c.gmName}`} · {c.memberCount} {c.memberCount === 1 ? t('Mitglied') : t('Mitglieder')}
              </p>
            </Card>
          </button>
        ))}
      </div>

      {canCreate && (creating || list.length === 0
        ? <NewCampaign onCancel={list.length ? () => setCreating(false) : undefined} />
        : <Button onClick={() => setCreating(true)}>{t('+ Neue Kampagne')}</Button>)}
      {canCreate && <ImportCampaign />}
    </div>
  );
}
