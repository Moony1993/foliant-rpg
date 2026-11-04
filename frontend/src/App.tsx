import { useEffect, lazy, Suspense } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './store/auth';
import { useToasts } from './store/toast';
import { connectNotifications, disconnectNotifications } from './lib/signalr';
import { AppNav } from './components/AppNav';
import { Toaster } from './components/Toaster';
import { useDbWaking } from './lib/api';
import type { ChatMessage } from './lib/types';
import { useCurrentCampaign } from './lib/queries';
import { useCampaignStore } from './store/campaign';
// App shell stays eager (pre-auth / always visible).
import { Login } from './pages/Login';
import { ChangePassword } from './pages/ChangePassword';
import { t } from './lib/i18n';

// Routed pages are code-split: each becomes its own chunk, loaded on first visit.
// Pages are named exports, so re-map to a default for React.lazy.
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const CharacterPage = lazy(() => import('./pages/Character').then((m) => ({ default: m.CharacterPage })));
const EquipmentPage = lazy(() => import('./pages/Equipment').then((m) => ({ default: m.EquipmentPage })));
const InventoryPage = lazy(() => import('./pages/Inventory').then((m) => ({ default: m.InventoryPage })));
const GmPage = lazy(() => import('./pages/Gm').then((m) => ({ default: m.GmPage })));
const ItemsPage = lazy(() => import('./pages/Items').then((m) => ({ default: m.ItemsPage })));
const MonstersPage = lazy(() => import('./pages/Monsters').then((m) => ({ default: m.MonstersPage })));
const AdminPage = lazy(() => import('./pages/Admin').then((m) => ({ default: m.AdminPage })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const FeatsPage = lazy(() => import('./pages/Feats').then((m) => ({ default: m.FeatsPage })));
const QuiverPage = lazy(() => import('./pages/Quiver').then((m) => ({ default: m.QuiverPage })));
const SpellsPage = lazy(() => import('./pages/Spells').then((m) => ({ default: m.SpellsPage })));
const MessagesPage = lazy(() => import('./pages/Messages').then((m) => ({ default: m.MessagesPage })));
const ChatPage = lazy(() => import('./pages/Chat').then((m) => ({ default: m.ChatPage })));
const PollsPage = lazy(() => import('./pages/Polls').then((m) => ({ default: m.PollsPage })));
const CampaignsPage = lazy(() => import('./pages/Campaigns').then((m) => ({ default: m.CampaignsPage })));
const CampaignSettingsPage = lazy(() => import('./pages/CampaignSettings').then((m) => ({ default: m.CampaignSettingsPage })));
const JoinPage = lazy(() => import('./pages/Join').then((m) => ({ default: m.JoinPage })));
const MapPage = lazy(() => import('./pages/Map').then((m) => ({ default: m.MapPage })));

export default function App() {
  const { token, mustChangePassword } = useAuth();
  const pushToast = useToasts((s) => s.push);
  const qc = useQueryClient();
  const location = useLocation();
  const campaignId = useCampaignStore((s) => s.campaignId);
  const setCampaignRole = useAuth((s) => s.setCampaignRole);
  // GM rights depend on the role in the campaign on screen.
  const current = useCurrentCampaign(!!token && !mustChangePassword);
  useEffect(() => { setCampaignRole(current.data?.myRole ?? null); }, [current.data, setCampaignRole]);

  // Connect SignalR while logged in; route notifications to toasts.
  useEffect(() => {
    if (!token) return;
    connectNotifications((n) => {
      // Battle map changes are silent: just refresh the map (moves, GM edits) for everyone.
      if (n.type === 'map') { qc.invalidateQueries({ queryKey: ['maps'] }); return; }
      // Group chat: append live (deduped against my own optimistic insert).
      if (n.type === 'chat' && n.chat) {
        const m = n.chat;
        qc.setQueryData<ChatMessage[]>(['chat'], (old) => (old && !old.some((x) => x.id === m.id) ? [...old, m] : old));
        return;
      }
      if (n.type === 'poll-update') { qc.invalidateQueries({ queryKey: ['polls'] }); return; }
      if (n.type === 'poll') qc.invalidateQueries({ queryKey: ['polls'] });
      // GM changed HP/rest/status of one of my characters: refresh silently.
      if (n.type === 'character') {
        ['character', 'characters', 'status', 'spellbook'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
        return;
      }
      pushToast({ title: n.title, message: n.message, rarity: n.rarity });
    });
    return () => { disconnectNotifications(); };
    // Reconnect on campaign switch: the hub only sends events of the campaign on screen.
  }, [token, campaignId, pushToast, qc]);

  const dbWaking = useDbWaking((s) => s.waking);

  // Invite links work logged out too (register or log in right there).
  if (location.pathname.startsWith('/join/')) {
    return (
      <Suspense fallback={null}>
        <Routes><Route path="/join/:code" element={<JoinPage />} /></Routes>
      </Suspense>
    );
  }
  if (!token) return <Login />;
  if (mustChangePassword) return <ChangePassword />;
  // Not in any campaign yet: the campaign page is the only useful screen (create one or use an invite).
  const noCampaign = current.isSuccess && current.data === null;

  return (
    <div className="min-h-full lg:pl-60">
      <AppNav />
      <Toaster />
      {dbWaking && (
        <div role="status" className="sticky top-0 z-40 bg-amber-500/90 text-zinc-900 text-sm text-center px-4 py-2">
          {t('⏳ Die Datenbank startet nach längerer Pause — das dauert etwa eine Minute. Die Seite lädt automatisch weiter.')}
        </div>
      )}
      <main className="max-w-6xl mx-auto pb-20 lg:pb-6 lg:px-4 lg:pt-4">
      <Suspense fallback={<div className="p-6 text-center text-sm opacity-60">{t('Lädt…')}</div>}>
        {noCampaign ? <CampaignsPage /> : (
        <Routes>
          <Route path="/campaigns" element={<CampaignsPage />} />
          <Route path="/campaign" element={<CampaignSettingsPage />} />
          <Route path="/" element={<Dashboard />} />
          <Route path="/character" element={<CharacterPage />} />
          <Route path="/equipment" element={<EquipmentPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/feats" element={<FeatsPage />} />
          <Route path="/spells" element={<SpellsPage />} />
          <Route path="/quiver" element={<QuiverPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/polls" element={<PollsPage />} />
          <Route path="/gm" element={<GmPage />} />
          <Route path="/gm/items" element={<ItemsPage />} />
          <Route path="/gm/monsters" element={<MonstersPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
        )}
      </Suspense>
      </main>
    </div>
  );
}
