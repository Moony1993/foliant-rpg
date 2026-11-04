import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { useCampaignStore } from '../store/campaign';
import { Button, Card, Field, Input } from '../components/ui';
import { LoginForm } from './Login';
import { t } from '../lib/i18n';

interface InviteInfo { campaignName: string; ruleSystemName: string; gmName: string; valid: boolean }

const errorText = (e: any, fallback: string) => e?.response?.data?.message ?? fallback;

/** Registration form — the only way to create an account without the admin. */
function RegisterForm({ code, onDone }: { code: string; onDone: () => void }) {
  const setSession = useAuth((s) => s.setSession);
  const [form, setForm] = useState({ displayName: '', username: '', password: '', repeat: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mismatch = form.repeat !== '' && form.password !== form.repeat;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mismatch) return;
    setBusy(true); setError('');
    try {
      const { data } = await api.post(`/invites/${code}/register`,
        { username: form.username.trim(), displayName: form.displayName.trim(), password: form.password });
      // The new account is a member already; finishing the join just switches to the campaign.
      setSession({ token: data.token, userId: data.userId, displayName: data.displayName, roles: data.roles, mustChangePassword: false });
      onDone();
    } catch (err) {
      setError(errorText(err, t('Registrierung fehlgeschlagen.')));
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label={t('Anzeigename (sehen die anderen)')}><Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} autoFocus /></Field>
      <Field label={t('Benutzername (zum Anmelden)')}>
        <Input value={form.username} autoComplete="username" onChange={(e) => setForm({ ...form, username: e.target.value })} />
      </Field>
      <Field label={t('Passwort (mind. 6 Zeichen, Groß- und Kleinbuchstaben, eine Ziffer)')}><Input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
      <Field label={t('Passwort wiederholen')}><Input type="password" autoComplete="new-password" value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value })} /></Field>
      {mismatch && <p className="text-amber-500 text-sm">{t('Die Passwörter stimmen nicht überein.')}</p>}
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <Button type="submit" className="w-full"
        disabled={busy || mismatch || !form.displayName.trim() || form.username.trim().length < 3 || form.password.length < 6}>
        {busy ? '…' : t('Konto anlegen & beitreten')}
      </Button>
    </form>
  );
}

/** /join/:code — works logged out (register or log in) and logged in (one click to join). */
export function JoinPage() {
  const { code = '' } = useParams();
  const token = useAuth((s) => s.token);
  const displayName = useAuth((s) => s.displayName);
  const logout = useAuth((s) => s.logout);
  const setCampaignId = useCampaignStore((s) => s.setCampaignId);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [info, setInfo] = useState<InviteInfo | null | undefined>(undefined);
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<InviteInfo>(`/invites/${code}`).then((r) => setInfo(r.data), () => setInfo(null));
  }, [code]);

  async function join() {
    setBusy(true); setError('');
    try {
      const { data } = await api.post<{ campaignId: number }>(`/invites/${code}/join`);
      setCampaignId(data.campaignId);
      qc.resetQueries();
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorText(err, t('Beitritt fehlgeschlagen.')));
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-full grid place-items-center p-4">
      <Card className="w-full max-w-sm space-y-4">
        {info === undefined && <p className="text-sm text-zinc-500 text-center">{t('Lädt…')}</p>}
        {info === null && <p className="text-sm text-red-400 text-center">{t('Diese Einladung gibt es nicht.')}</p>}
        {info && (
          <>
            <div className="text-center">
              <p className="text-sm text-zinc-500">{t('Einladung zur Kampagne')}</p>
              <h1 className="text-2xl font-bold text-gold">{info.campaignName}</h1>
              <p className="text-xs text-zinc-500">{t('{ruleSystemName} · Spielleitung: {gmName}', { ruleSystemName: info.ruleSystemName, gmName: info.gmName })}</p>
            </div>
            {!info.valid ? (
              <p className="text-sm text-red-400 text-center">{t('Diese Einladung ist abgelaufen oder aufgebraucht. Bitte den GM um einen neuen Link.')}</p>
            ) : token ? (
              <div className="space-y-2">
                <Button className="w-full" disabled={busy} onClick={join}>{t('Als {displayName} beitreten', { displayName })}</Button>
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <button type="button" className="w-full text-xs text-zinc-500 hover:underline" onClick={() => navigate('/')}>{t('Nicht jetzt')}</button>
                {/* Same browser as another account (e.g. the GM testing the link): join with a new account instead. */}
                <button type="button" className="w-full text-xs text-gold hover:underline" onClick={() => { logout(); setMode('register'); }}>
                  {t('Nicht {displayName}? Abmelden und mit einem neuen Konto beitreten', { displayName })}
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-1 text-sm" role="tablist">
                  {(['register', 'login'] as const).map((m) => (
                    <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
                      className={`py-1.5 rounded ${mode === m ? 'bg-gold/20 text-gold font-semibold' : 'text-zinc-500 hover:bg-zinc-200/40'}`}>
                      {m === 'register' ? t('Neues Konto') : t('Ich habe ein Konto')}
                    </button>
                  ))}
                </div>
                {mode === 'register' ? <RegisterForm code={code} onDone={join} /> : <LoginForm />}
              </>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
