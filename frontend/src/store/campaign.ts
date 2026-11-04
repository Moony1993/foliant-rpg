import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Campaign the app shows; sent as X-Campaign-Id. null = let the server pick the oldest membership. */
export const useCampaignStore = create<{ campaignId: number | null; setCampaignId: (id: number | null) => void }>()(
  persist((set) => ({ campaignId: null, setCampaignId: (campaignId) => set({ campaignId }) }), { name: 'pf-campaign' }),
);
