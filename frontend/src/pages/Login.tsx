import { useState } from 'react';
import { api, API_BASE } from '../lib/api';
import { useAuth } from '../store/auth';
import { Button, Card, Field, Input } from '../components/ui';
import { t } from '../lib/i18n';

/** Username/password form; also embedded on the invite page for existing accounts. */
export function LoginForm({ submitLabel = t('Anmelden') }: { submitLabel?: string }) {
  const setSession = useAuth((s) => s.setSession);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { data } = await api.post('/auth/login', { username, password });
      setSession({
        token: data.token,
        userId: data.userId,
        displayName: data.displayName,
        roles: data.roles,
        mustChangePassword: data.mustChangePassword,
      });
    } catch (err: any) {
      if (err.response?.status === 401) setError(t('Falscher Benutzername oder Passwort.'));
      else if (err.response?.status === 503) setError(t('Die Datenbank startet nach längerer Pause — bitte in ca. einer Minute erneut anmelden.'));
      else if (err.response) setError(`Serverfehler (${err.response.status}).`);
      else setError(t('Backend nicht erreichbar unter {API_BASE} — läuft das Backend?', { API_BASE }));
    } finally {
      setBusy(false);
    }
  }

  return (
        <form onSubmit={submit} className="space-y-3">
          <Field label={t('Benutzername')}>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          </Field>
          <Field label={t('Passwort')}>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? '…' : submitLabel}
          </Button>
        </form>
  );
}

export function Login() {
  return (
    <div className="min-h-full grid place-items-center p-4">
      <Card className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gold text-center mb-1">{t('Foliant')}</h1>
        <p className="text-center text-sm text-zinc-500 mb-4">{t('Charakterverwaltung')}</p>
        <LoginForm />
        <p className="mt-4 text-center text-xs text-zinc-500">{t('Noch kein Konto? Lass dir vom Spielleiter einen Einladungslink geben.')}</p>
      </Card>
    </div>
  );
}
