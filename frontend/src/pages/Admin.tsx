import { useState } from 'react';
import { useCreateAccount, useDeleteAccount, useResetPassword, usePlayers } from '../lib/queries';
import { useToasts } from '../store/toast';
import { useAuth } from '../store/auth';
import { Button, Card, Field, Input, Select } from '../components/ui';
import { RulePackagesAdmin } from '../components/RulePackagesAdmin';
import { t } from '../lib/i18n';

export function AdminPage() {
  const players = usePlayers();
  const createAccount = useCreateAccount();
  const deleteAccount = useDeleteAccount();
  const resetPassword = useResetPassword();
  const currentUserId = useAuth((s) => s.userId);
  const toast = useToasts((s) => s.push);

  const [acc, setAcc] = useState({ username: '', tempPassword: '', displayName: '', role: 'Player' });

  async function submitAccount() {
    try {
      await createAccount.mutateAsync(acc);
      toast({ title: t('Account erstellt'), message: t('{username} kann sich jetzt anmelden.', { username: acc.username }) });
      setAcc({ username: '', tempPassword: '', displayName: '', role: 'Player' });
    } catch (e: any) {
      toast({ title: t('Fehler'), message: e.response?.data?.message ?? t('Account konnte nicht erstellt werden.') });
    }
  }

  async function resetPw(userId: string, name: string) {
    const pw = prompt(t('Neues Startpasswort für "{name}" (min. 6 Zeichen). Der Nutzer muss es beim nächsten Login ändern.', { name }));
    if (pw == null) return;
    if (pw.length < 6) { toast({ title: t('Zu kurz'), message: t('Passwort braucht mindestens 6 Zeichen.') }); return; }
    try {
      await resetPassword.mutateAsync({ id: userId, newPassword: pw });
      toast({ title: t('Passwort zurückgesetzt'), message: t('{name} kann sich mit dem neuen Passwort anmelden.', { name }) });
    } catch (e: any) {
      toast({ title: t('Fehler'), message: e.response?.data?.errors?.[0] ?? t('Passwort konnte nicht zurückgesetzt werden.') });
    }
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-gold">{t('Admin-Bereich')}</h1>

      {/* Create account */}
      <Card className="space-y-3">
        <h2 className="rubric">{t('Account erstellen')}</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('Benutzername')}><Input value={acc.username} onChange={(e) => setAcc({ ...acc, username: e.target.value })} /></Field>
          <Field label={t('Anzeigename')}><Input value={acc.displayName} onChange={(e) => setAcc({ ...acc, displayName: e.target.value })} /></Field>
          <Field label={t('Startpasswort')}><Input value={acc.tempPassword} onChange={(e) => setAcc({ ...acc, tempPassword: e.target.value })} /></Field>
          <Field label={t('Rolle')}>
            <Select value={acc.role} onChange={(e) => setAcc({ ...acc, role: e.target.value })}>
              <option value="Player">{t('Spieler')}</option><option>{t('GM')}</option><option>{t('Admin')}</option>
            </Select>
          </Field>
        </div>
        <Button onClick={submitAccount} disabled={!acc.username || acc.tempPassword.length < 6}>{t('Erstellen')}</Button>
      </Card>

      {/* Manage accounts */}
      <Card>
        <h2 className="rubric mb-2">{t('Accounts verwalten')}</h2>
        <ul className="space-y-1 text-sm">
          {players.data?.map((p) => (
            <li key={p.userId} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <span className={`inline-block w-2 h-2 rounded-full mr-2 ${p.online ? 'bg-emerald-500' : 'bg-zinc-500'}`} />
                {p.displayName} <span className="text-xs text-zinc-500">({p.username}, {p.roles.join('/')})</span>
              </span>
              <span className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-zinc-500">{t('{characterCount} Charaktere', { characterCount: p.characterCount })}</span>
                <button
                  onClick={() => resetPw(p.userId, p.displayName)}
                  disabled={resetPassword.isPending}
                  className="text-xs text-sky-400 hover:text-sky-300 border border-sky-500/40 rounded px-2 py-0.5 disabled:opacity-50"
                  title={t('Passwort zurücksetzen')}
                >
                  {t('Passwort')}
                </button>
                {p.userId !== currentUserId && (
                  <button
                    onClick={() => {
                      if (confirm(t('Account "{displayName}" ({username}) endgültig löschen? Alle Charaktere und Notizen gehen verloren.', { displayName: p.displayName, username: p.username })))
                        deleteAccount.mutate(p.userId);
                    }}
                    disabled={deleteAccount.isPending}
                    className="text-xs text-red-400 hover:text-red-300 border border-red-500/40 rounded px-2 py-0.5 disabled:opacity-50"
                    title={t('Account löschen')}
                  >
                    {t('Löschen')}
                  </button>
                )}
              </span>
            </li>
          ))}
          {(players.data?.length ?? 0) === 0 && <li className="text-xs text-zinc-500">{t('Noch keine Accounts.')}</li>}
        </ul>
      </Card>

      <RulePackagesAdmin />
    </div>
  );
}
