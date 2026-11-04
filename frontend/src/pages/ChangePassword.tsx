import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { Button, Card, Field, Input } from '../components/ui';
import { t } from '../lib/i18n';

/** Forced on first login (MustChangePassword). Blocks the app until done. */
export function ChangePassword() {
  const clearMustChange = useAuth((s) => s.clearMustChange);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword: current, newPassword: next });
      clearMustChange();
    } catch (err: any) {
      setError(err.response?.data?.errors?.[0] ?? t('Passwort konnte nicht geändert werden.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full grid place-items-center p-4">
      <Card className="w-full max-w-sm">
        <h1 className="text-xl font-bold text-gold mb-1">{t('Passwort ändern')}</h1>
        <p className="text-sm text-zinc-500 mb-4">{t('Bitte lege beim ersten Login ein eigenes Passwort fest.')}</p>
        <form onSubmit={submit} className="space-y-3">
          <Field label={t('Aktuelles Passwort')}>
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
          </Field>
          <Field label={t('Neues Passwort')}>
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? '…' : t('Speichern')}
          </Button>
        </form>
      </Card>
    </div>
  );
}
