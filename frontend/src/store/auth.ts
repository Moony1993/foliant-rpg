import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  userId: string | null;
  displayName: string | null;
  roles: string[];
  mustChangePassword: boolean;
  /** Role in the current campaign ("GM" | "Player"); GM rights come from here, not from global roles. */
  campaignRole: string | null;
  isGm: () => boolean;
  /** Global GM/Admin role: may open new campaigns. */
  canCreateCampaign: () => boolean;
  setCampaignRole: (role: string | null) => void;
  setSession: (s: Omit<AuthState, 'setSession' | 'logout' | 'isGm' | 'clearMustChange' | 'campaignRole' | 'canCreateCampaign' | 'setCampaignRole'>) => void;
  clearMustChange: () => void;
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      userId: null,
      displayName: null,
      roles: [],
      mustChangePassword: false,
      campaignRole: null,
      isGm: () => get().campaignRole === 'GM',
      canCreateCampaign: () => get().roles.some((r) => r === 'GM' || r === 'Admin'),
      setCampaignRole: (campaignRole) => set({ campaignRole }),
      setSession: (s) => set(s),
      clearMustChange: () => set({ mustChangePassword: false }),
      logout: () => {
        // Drop the persisted React Query cache so the next user starts clean.
        window.localStorage.removeItem('pf-query-cache');
        set({ token: null, userId: null, displayName: null, roles: [], mustChangePassword: false, campaignRole: null });
      },
    }),
    { name: 'pf-auth' },
  ),
);
