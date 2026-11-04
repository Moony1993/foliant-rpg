import { api } from './api';
import { t } from './i18n';

/** Web Push needs a service worker + PushManager (iOS: only when installed to the home screen). */
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function registration() {
  // ponytail: no SW in `vite dev` (PWA plugin only builds it) — test push with `npm run build && npm run preview`.
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => setTimeout(() => r(null), 4000)),
  ]);
  if (!reg) throw new Error(t('Kein Service Worker aktiv (im Dev-Server nicht verfügbar).'));
  return reg;
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function enablePush() {
  if (await Notification.requestPermission() !== 'granted') throw new Error(t('Benachrichtigungen wurden im Browser abgelehnt.'));
  const reg = await registration();
  const key = (await api.get<string>('/push/key')).data;
  const sub = (await reg.pushManager.getSubscription())
    ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
  const json = sub.toJSON();
  await api.post('/push/subscribe', { endpoint: sub.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth });
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}
