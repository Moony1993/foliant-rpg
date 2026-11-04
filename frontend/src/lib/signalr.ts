import { HubConnectionBuilder, HubConnection } from '@microsoft/signalr';
import { API_BASE } from './api';
import { useAuth } from '../store/auth';
import { useCampaignStore } from '../store/campaign';

export interface Notification {
  type: string;
  title: string;
  message: string;
  itemName?: string;
  rarity?: string;
  chat?: import('./types').ChatMessage;
}

let connection: HubConnection | null = null;

const campaignQuery = () => {
  const id = useCampaignStore.getState().campaignId;
  return id != null ? `?campaignId=${id}` : '';
};

/** Connect to the notification hub and route "notify" events to the callback. */
export async function connectNotifications(onNotify: (n: Notification) => void) {
  if (connection) return connection;
  connection = new HubConnectionBuilder()
    // Campaign-wide events only for the campaign on screen; App reconnects on switch.
    .withUrl(`${API_BASE}/hubs/notifications${campaignQuery()}`, {
      accessTokenFactory: () => useAuth.getState().token ?? '',
    })
    .withAutomaticReconnect()
    .build();

  connection.on('notify', onNotify);
  try {
    await connection.start();
  } catch {
    // hub optional for core flows; ignore connection failure
  }
  return connection;
}

export async function disconnectNotifications() {
  await connection?.stop();
  connection = null;
}
