import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button, Card } from './ui';
import { t } from '../lib/i18n';

interface RuleSystemAdmin {
  id: string; name: string; version: string | null; license: string | null; attribution: string | null;
  builtIn: boolean; campaignCount: number; installedAt: string | null;
}
interface PackageCheck { ok: boolean; id: string | null; name: string | null; version: string | null; errors: string[]; tests: string[]; replaces: boolean }

const errorOf = (e: any, fallback: string) => e?.response?.data?.message ?? fallback;

/** Admin: installed rule systems; upload checks a package first, then installs it (or shows every error). */
export function RulePackagesAdmin() {
  const qc = useQueryClient();
  const systems = useQuery({ queryKey: ['admin-rule-packages'], queryFn: async () => (await api.get<RuleSystemAdmin[]>('/admin/rule-packages')).data });
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [check, setCheck] = useState<PackageCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = () => ['admin-rule-packages', 'rule-systems'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const form = (f: File) => { const d = new FormData(); d.append('file', f); return d; };

  async function pick(f: File) {
    setFile(f); setCheck(null); setMessage(''); setBusy(true);
    try { setCheck((await api.post<PackageCheck>('/admin/rule-packages/check', form(f))).data); }
    catch (e) { setMessage(errorOf(e, t('Prüfen fehlgeschlagen.'))); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  }

  async function install() {
    if (!file) return;
    setBusy(true); setMessage('');
    try {
      const r = (await api.post<PackageCheck>('/admin/rule-packages', form(file))).data;
      setMessage(t('„{name}“ {version} ist installiert und für neue Kampagnen wählbar.', { name: r.name, version: r.version }));
      setFile(null); setCheck(null); refresh();
    } catch (e: any) {
      if (e?.response?.data?.errors) setCheck(e.response.data); else setMessage(errorOf(e, t('Installieren fehlgeschlagen.')));
    } finally { setBusy(false); }
  }

  async function download(s: RuleSystemAdmin) {
    const r = await api.get<Blob>(`/admin/rule-packages/${s.id}/export`, { responseType: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(r.data);
    a.download = `${s.id}-${s.version}.foliant-rules`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function remove(s: RuleSystemAdmin) {
    if (!window.confirm(t('Regelsystem „{name}“ entfernen?', { name: s.name }))) return;
    try { await api.delete(`/admin/rule-packages/${s.id}`); refresh(); }
    catch (e) { setMessage(errorOf(e, t('Entfernen fehlgeschlagen.'))); }
  }

  return (
    <Card className="space-y-3">
      <h2 className="rubric">{t('Regelsysteme')}</h2>
      <p className="text-sm text-zinc-500">{t('Installierte Systeme können GMs beim Anlegen einer Kampagne wählen. Neue Systeme kommen als')} <code>{t('.foliant-rules')}</code>{t('-Datei.')}</p>
      <ul className="space-y-1.5">
        {systems.data?.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{s.name}</span>
            <span className="text-xs text-zinc-500">
              {s.id}{s.version ? ` · ${s.version}` : ''}{s.license ? ` · ${s.license}` : ''} · {s.builtIn ? t('eingebaut') : t('Paket')} ·
              {' '}{s.campaignCount} {s.campaignCount === 1 ? t('Kampagne') : t('Kampagnen')}
            </span>
            {!s.builtIn && (
              <span className="ml-auto flex gap-1">
                <Button variant="ghost" className="text-xs px-2 py-0.5" onClick={() => download(s)}>{t('Exportieren')}</Button>
                <Button variant="ghost" className="text-xs px-2 py-0.5" disabled={s.campaignCount > 0}
                  title={s.campaignCount > 0 ? t('Wird von Kampagnen genutzt') : undefined} onClick={() => remove(s)}>{t('Entfernen')}</Button>
              </span>
            )}
          </li>
        ))}
      </ul>

      <input ref={input} type="file" accept=".foliant-rules,application/zip" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); }} />
      <Button variant="ghost" disabled={busy} onClick={() => input.current?.click()}>{busy && !check ? t('Prüft…') : t('Paket hochladen…')}</Button>

      {check && (
        <div className={`rounded border p-2 text-sm space-y-1 ${check.ok ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-red-500/50 bg-red-500/10'}`}>
          {check.ok
            ? <p><b>{check.name}</b> {check.version} {' '}{t('ist in Ordnung')}{check.replaces ? t(' und ersetzt die installierte Version') : ''}.</p>
            : <p><b>{t('Das Paket hat {length} Fehler', { length: check.errors.length })}</b> {t('und kann so nicht installiert werden:')}</p>}
          {check.errors.length > 0 && <ul className="list-disc pl-5 text-xs space-y-0.5">{check.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
          {check.tests.length > 0 && (
            <details className="text-xs"><summary>{t('Tests ({length}/{length2} grün)', { length: check.tests.filter((t) => t.startsWith('✓')).length, length2: check.tests.length })}</summary>
              <ul className="pl-2">{check.tests.map((t) => <li key={t}>{t}</li>)}</ul>
            </details>
          )}
          {check.ok && <Button disabled={busy} onClick={install}>{check.replaces ? t('Aktualisieren') : t('Installieren')}</Button>}
        </div>
      )}
      {message && <p className="text-sm">{message}</p>}
    </Card>
  );
}
