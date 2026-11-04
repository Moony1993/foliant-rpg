import axios from 'axios';
import { create } from 'zustand';
import { useAuth } from '../store/auth';
import { useCampaignStore } from '../store/campaign';

// In production the SPA is served from the same App Service as the API,
// so window.location.origin is the correct base. Locally, fall back to the
// dev server port so the separate dotnet run process is used.
// Dev server: separate backend. A build is served by the backend itself (also on localhost, e.g. Docker).
export const API_BASE = import.meta.env.VITE_API_BASE || (import.meta.env.DEV ? 'http://localhost:5099' : window.location.origin);

export const api = axios.create({ baseURL: API_BASE });

// Attach JWT on every request.
api.interceptors.request.use((config) => {
  const token = useAuth.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const campaignId = useCampaignStore.getState().campaignId;
  if (campaignId != null) config.headers['X-Campaign-Id'] = String(campaignId);
  return config;
});

/** true while the API answers 503 (DB resuming from auto-pause) — drives the banner in App. */
export const useDbWaking = create<{ waking: boolean }>(() => ({ waking: false }));
export const isDbWaking = (error: unknown) => (error as { response?: { status?: number } })?.response?.status === 503;

// On 401, drop the session so the app falls back to the login screen.
api.interceptors.response.use(
  (r) => {
    if (useDbWaking.getState().waking) useDbWaking.setState({ waking: false });
    return r;
  },
  (error) => {
    if (error.response?.status === 401) useAuth.getState().logout();
    // Stored campaign no longer reachable (left/removed/deleted): fall back to the server's default.
    if (error.response?.status === 404 && error.response.data?.message === 'Campaign not found.'
        && useCampaignStore.getState().campaignId != null) useCampaignStore.getState().setCampaignId(null);
    if (isDbWaking(error)) useDbWaking.setState({ waking: true });
    return Promise.reject(error);
  },
);
