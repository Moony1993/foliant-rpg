import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import {
  Backpack, BookOpen, Bug, CalendarDays, ChevronsUpDown, Crown, MessageCircle, LayoutDashboard, Mail, Menu, ScrollText, Settings, Shield, Skull, Sparkles, Swords, Target, User, Wrench, X,
  type LucideIcon, Map as MapIcon } from 'lucide-react';
import { useAuth } from '../store/auth';
import { useCampaigns, useChat, useCurrentCampaign, usePolls, useRuleLayout, useUnreadCount, useSkillSheet } from '../lib/queries';
import { useChatSeen } from '../store/chatSeen';
import { useActive } from '../lib/useActive';
import { BugReportDialog } from './BugReport';
import { t } from '../lib/i18n';

/** capability: shown only when the campaign's rule system has it (see GET /rules/layout). */
type Tab = { to: string; label: string; icon: LucideIcon; group: 'play' | 'gm' | 'system'; gmOnly?: boolean; adminOnly?: boolean; primary?: boolean; capability?: string; campaignUi?: boolean };

const TABS: Tab[] = [
  { to: '/', label: t('Dashboard'), icon: LayoutDashboard, group: 'play', primary: true },
  { to: '/character', label: t('Charakter'), icon: User, group: 'play', primary: true },
  { to: '/equipment', label: t('Ausrüstung'), icon: Shield, group: 'play' },
  { to: '/inventory', label: t('Inventar'), icon: Backpack, group: 'play', primary: true },
  { to: '/feats', label: t('Talente'), icon: ScrollText, group: 'play', capability: 'feats' },
  { to: '/spells', label: t('Zauber'), icon: Sparkles, group: 'play' },
  { to: '/quiver', label: t('Köcher'), icon: Target, group: 'play' },
  { to: '/map', label: t('Karte'), icon: MapIcon, group: 'play' },
  { to: '/messages', label: t('Nachrichten'), icon: Mail, group: 'play', primary: true },
  { to: '/chat', label: t('Chat'), icon: MessageCircle, group: 'play' },
  { to: '/polls', label: t('Termine'), icon: CalendarDays, group: 'play' },
  { to: '/gm', label: t('Übersicht'), icon: Crown, group: 'gm', gmOnly: true },
  { to: '/gm/items', label: t('Items'), icon: Swords, group: 'gm', gmOnly: true },
  { to: '/gm/monsters', label: t('Monster'), icon: Skull, group: 'gm', gmOnly: true },
  { to: '/campaign', label: t('Kampagne'), icon: BookOpen, group: 'system', campaignUi: true },
  { to: '/admin', label: t('Admin'), icon: Wrench, group: 'system', adminOnly: true },
  { to: '/settings', label: t('Einstellungen'), icon: Settings, group: 'system' },
];
const GROUP_LABEL = { play: t('Spiel'), gm: t('Spielleitung'), system: t('System') } as const;

/** Badge counts per route (unread mail, pending level-up / skill points). */
function useBadges() {
  const unread = useUnreadCount().data ?? 0;
  const { character, activeId } = useActive();
  const skillSheet = useSkillSheet(activeId ?? null);
  const levelUp = character.data?.pendingLevelUp ?? false;
  // pointsAvailable is the total budget, not what's left — badge only while points remain unspent.
  const skillPoints = (skillSheet.data?.pointsAvailable ?? 0) - (skillSheet.data?.pointsSpent ?? 0) > 0;
  // Ability score increases (4th, 8th, …) not yet assigned.
  const c = character.data;
  const increasesOpen = !!c && (c.abilityIncreases?.length ?? 0) < Math.floor(c.level / 4);
  const me = useAuth((s) => s.userId);
  const seen = useChatSeen((s) => s.seen);
  const chatUnread = (useChat().data ?? []).filter((m) => m.id > seen && m.userId !== me).length;
  // Open polls where I haven't answered every date yet.
  const pollsOpen = (usePolls().data ?? []).some((p) => p.chosenOptionId == null && p.options.some((o) => !o.votes.some((v) => v.userId === me)));
  return (to: string) =>
    to === '/chat' && chatUnread > 0 ? { text: String(chatUnread), cls: 'bg-red-600' }
    : to === '/messages' && unread > 0 ? { text: String(unread), cls: 'bg-red-600' }
    : to === '/character' && levelUp ? { text: '▲', cls: 'bg-emerald-500' }
    : to === '/character' && (skillPoints || increasesOpen) ? {
      text: '!', cls: 'bg-amber-500',
      title: [skillPoints && t('Fertigkeitspunkte offen'), increasesOpen && t('Attributserhöhung offen')].filter(Boolean).join(' · '),
    }
    : to === '/polls' && pollsOpen ? { text: '!', cls: 'bg-amber-500', title: t('Terminumfrage wartet auf deine Antwort') }
    : null;
}

function Badge({ b, className = '' }: { b: { text: string; cls: string; title?: string } | null; className?: string }) {
  if (!b) return null;
  return <span title={b.title} aria-label={b.title} className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold text-white grid place-items-center ${b.cls} ${className}`}>{b.text}</span>;
}

const navLinkCls = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 h-9 pl-5 pr-3 rounded-[3px] text-[15px] font-semibold transition [text-shadow:0_1px_0_rgba(0,0,0,.6)] ${isActive
    ? 'spine-label text-[var(--gold-hi)]'
    : 'text-[#f3e1bb] hover:bg-black/15'}`;

/** Grouped link list — shared by the desktop sidebar and the mobile "Mehr" sheet. */
function NavList({ tabs, badge, onNavigate, onBug }: { tabs: Tab[]; badge: ReturnType<typeof useBadges>; onNavigate?: () => void; onBug: () => void }) {
  return (
    <nav>
      {(['play', 'gm', 'system'] as const).map((g, i) => {
        const items = tabs.filter((t) => t.group === g);
        if (items.length === 0) return null;
        return (
          <div key={g}>
            {i > 0 && <div className="spine-band spine-band--full my-4" aria-hidden />}
            <div className="mb-1.5 text-center text-[12px] font-bold uppercase tracking-[.18em] text-[var(--gold-hi)]">{GROUP_LABEL[g]}</div>
            <div className="space-y-0.5">
              {items.map((t) => (
                <NavLink key={t.to} to={t.to} end={t.to === '/' || t.to === '/gm'} onClick={onNavigate} className={navLinkCls}>
                  <t.icon className="w-4 h-4 flex-shrink-0 text-[#d9b26a]" strokeWidth={1.75} aria-hidden />
                  <span className="flex-1">{t.label}</span>
                  <Badge b={badge(t.to)} />
                </NavLink>
              ))}
              {g === 'system' && (
                <button onClick={onBug} className={navLinkCls({ isActive: false }) + ' w-full'}>
                  <Bug className="w-4 h-4 flex-shrink-0 text-[#d9b26a]" strokeWidth={1.75} aria-hidden />
                  <span className="flex-1 text-left">{t('Bug melden')}</span>
                </button>
              )}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

/** Campaign UI only for GMs and players in several campaigns: a player with one campaign sees the app as before. */
function useShowCampaignUi() {
  const isGm = useAuth((s) => s.isGm());
  const isAdmin = useAuth((s) => s.roles.includes('Admin'));
  const campaigns = useCampaigns();
  return isGm || isAdmin || (campaigns.data?.length ?? 0) > 1;
}

/** Current campaign; click to pick another one. */
function CampaignSwitch({ onNavigate, className = '' }: { onNavigate?: () => void; className?: string }) {
  const current = useCurrentCampaign();
  if (!useShowCampaignUi() || !current.data) return null;
  return (
    <Link to="/campaigns" onClick={onNavigate} title={t('Kampagne wechseln')}
      // Centred like the title label and the group headings above and below it.
      className={`block rounded-[3px] px-3 py-2 text-center text-[#f3e1bb] hover:bg-black/20 ${className}`}>
      <span className="block text-[10.5px] uppercase tracking-wide text-[#d9b26a]">{t('Kampagne')}</span>
      <span className="flex items-center justify-center gap-1 min-w-0">
        <span className="line-clamp-2 font-semibold leading-snug">{current.data.name}</span>
        <ChevronsUpDown className="w-4 h-4 flex-shrink-0 text-[#d9b26a]" aria-hidden />
      </span>
    </Link>
  );
}

/** Desktop: fixed left sidebar (lg+). Mobile: 4 primary tabs + "Mehr" sheet with everything else. */
export function AppNav() {
  const isGm = useAuth((s) => s.isGm());
  const isAdmin = useAuth((s) => s.roles.includes('Admin'));
  const name = useAuth((s) => s.displayName);
  const badge = useBadges();
  const [more, setMore] = useState(false);
  const [bug, setBug] = useState(false);
  const capabilities = useRuleLayout().data?.capabilities;
  const campaignUi = useShowCampaignUi();
  const tabs = TABS.filter((t) => (!t.gmOnly || isGm) && (!t.adminOnly || isAdmin) && (!t.campaignUi || campaignUi)
    && (!t.capability || !capabilities || capabilities.includes(t.capability)));
  const moreHasBadge = tabs.some((t) => !t.primary && badge(t.to));

  return (
    <>
      {/* Desktop sidebar */}
      {/* Desktop sidebar: a leather book spine with a red title label and raised bands. */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-60 flex-col spine-leather">
        <div className="spine-label mx-6 mt-6 px-3 py-4 text-center">
          <div className="font-['Cinzel'] text-[21px] font-bold tracking-[.06em] text-[var(--gold-hi)] [text-shadow:0_1px_0_#000]">{t('Foliant')}</div>
          <div className="text-[12.5px] italic text-[#f0d9a8]">{t('Chronik der Abenteurer')}</div>
        </div>
        <CampaignSwitch className="mx-6 mt-3" />
        <div className="spine-band mt-3" aria-hidden />
        {/* No visible scrollbar: it would push the links off-centre and keep the bands off the edges. */}
        <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-7 py-4 [--spine-pad:28px]">
          <NavList tabs={tabs} badge={badge} onBug={() => setBug(true)} />
        </div>
        <div className="spine-band" aria-hidden />
        {name && (
          <div className="px-5 py-3 text-center text-sm text-[#f3e1bb]">
            <div className="font-semibold truncate">{name}</div>
            <div className="text-xs text-[#d9b26a]">{[isAdmin && 'Admin', isGm ? t('Spielleiter') : t('Spieler')].filter(Boolean).join(' · ')}</div>
          </div>
        )}
      </aside>

      {/* Mobile bottom bar */}
      {/* Mobile: the spine lies horizontally; raised bands separate the tabs. */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 spine-leather--h border-t border-[rgba(226,194,106,.55)] pb-[env(safe-area-inset-bottom)]">
        <div className="flex px-1 py-1.5">
          {tabs.filter((t) => t.primary).map((t, i) => (
            <NavLink key={t.to} to={t.to} end={t.to === '/'}
              className={({ isActive }) => `relative flex-1 h-14 mx-[3px] rounded-[3px] flex flex-col items-center justify-center gap-1 text-[11.5px] font-semibold transition [text-shadow:0_1px_0_rgba(0,0,0,.6)] ${isActive ? 'spine-label text-[var(--gold-hi)]' : 'text-[#f3e1bb]'}`}>
              {i > 0 && <span className="spine-band--v" aria-hidden />}
              <span className="relative">
                <t.icon className="w-5 h-5 text-[#d9b26a]" strokeWidth={1.75} aria-hidden />
                <Badge b={badge(t.to)} className="absolute -top-1.5 -right-2.5" />
              </span>
              {t.label}
            </NavLink>
          ))}
          <button onClick={() => setMore(true)} className="relative flex-1 h-14 mx-[3px] flex flex-col items-center justify-center gap-1 text-[11.5px] font-semibold text-[#f3e1bb] [text-shadow:0_1px_0_rgba(0,0,0,.6)]">
            <span className="spine-band--v" aria-hidden />
            <span className="relative">
              <Menu className="w-5 h-5 text-[#d9b26a]" strokeWidth={1.75} aria-hidden />
              {moreHasBadge && <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-red-600" />}
            </span>
            {t('Mehr')}
          </button>
        </div>
      </nav>

      {/* Mobile "Mehr" sheet */}
      {more && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/50" onClick={() => setMore(false)}>
          <div role="dialog" aria-label={t('Navigation')} onClick={(e) => e.stopPropagation()}
            // Side padding (16vw, the sheet is full width) keeps the text inside the gold borders of the tile.
            className="absolute bottom-0 inset-x-0 max-h-[85dvh] overflow-y-auto [scrollbar-width:none] rounded-t-xl spine-leather border-t-2 border-[#8a6418] px-[16vw] [--spine-pad:16vw] pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="font-['Cinzel'] font-bold text-[var(--gold-hi)]">{t('Menü')}</span>
              <button onClick={() => setMore(false)} aria-label={t('Schließen')} className="w-8 h-8 grid place-items-center rounded-lg text-[#f3e1bb] hover:bg-black/20"><X className="w-4 h-4" /></button>
            </div>
            <CampaignSwitch className="mb-3" onNavigate={() => setMore(false)} />
            <NavList tabs={tabs} badge={badge} onNavigate={() => setMore(false)} onBug={() => { setMore(false); setBug(true); }} />
          </div>
        </div>
      )}

      <BugReportDialog open={bug} onClose={() => setBug(false)} />
    </>
  );
}
