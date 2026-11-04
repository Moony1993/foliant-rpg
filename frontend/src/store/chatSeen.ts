import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Highest chat message id this device has seen — drives the unread badge. */
export const useChatSeen = create<{ seen: number; markSeen: (id: number) => void }>()(
  persist((set, get) => ({ seen: 0, markSeen: (id) => { if (id > get().seen) set({ seen: id }); } }), { name: 'chat-seen' }),
);
