import { useEffect, useState } from 'react';
import { useAuth } from '../store/auth';
import { Button, Card, Select } from '../components/ui';
import { api } from '../lib/api';
import { currentSubscription, disablePush, enablePush, pushSupported } from '../lib/push';
import { LANGS, t, useLang, type Lang } from '../lib/i18n';

function PushSettings() {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { currentSubscription().then((s) => setOn(!!s)).catch(() => setOn(false)); }, []);

  if (!pushSupported()) {
    return <p className="text-sm text-zinc-500">{t('Dieser Browser unterstützt keine Benachrichtigungen. Auf dem iPhone: Seite über „Teilen → Zum Home-Bildschirm“ installieren und von dort öffnen.')}</p>;
  }

  async function toggle() {
    setBusy(true); setError('');
    try {
      if (on) { await disablePush(); setOn(false); } else { await enablePush(); setOn(true); }
    } catch (e) { setError(e instanceof Error ? e.message : t('Fehlgeschlagen.')); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center gap-3">
        <div>
          <div>{t('Push-Benachrichtigungen')}</div>
          <div className="text-xs text-zinc-500">{t('Chat, Nachrichten und Termine — auch wenn die App geschlossen ist.')}</div>
        </div>
        <Button variant={on ? 'ghost' : 'primary'} disabled={busy || on === null} onClick={toggle}>{on ? t('Ausschalten') : t('Einschalten')}</Button>
      </div>
      {on && <button type="button" className="text-xs text-gold" onClick={() => api.post('/push/test')}>{t('Test-Benachrichtigung senden')}</button>}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

export function Settings() {
  const { displayName, roles, logout } = useAuth();
  const { lang, setLang } = useLang();
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-gold">{t('Einstellungen')}</h1>
      <Card className="space-y-3">
        <div className="flex justify-between items-center">
          <span>{t('Angemeldet als')}</span>
          <span className="font-medium">{displayName} <span className="text-xs text-zinc-500">({roles.join(', ')})</span></span>
        </div>
        <div className="flex justify-between items-center">
          <span>{t('Abmelden')}</span>
          {/* Drop this device's push subscription first, so a logged-out phone stops getting notifications. */}
          <Button variant="danger" onClick={async () => { await disablePush().catch(() => {}); logout(); }}>{t('Abmelden')}</Button>
        </div>
      </Card>
      <Card>
        <div className="flex justify-between items-center gap-3">
          <span>{t('Sprache')}</span>
          <Select value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t('Sprache')} className="!w-auto">
            {LANGS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
          </Select>
        </div>
      </Card>
      <Card><PushSettings /></Card>
    </div>
  );
}
