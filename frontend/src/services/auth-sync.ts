/**
 * Cross-tab authentication synchronization using BroadcastChannel and storage events.
 * Guarantees that when a user logs out in one browser tab, all other tabs immediately terminate
 * their session and redirect to the login screen.
 */
const CHANNEL_NAME = 'pj_auth_sync';
const LOGOUT_STORAGE_KEY = 'pj_logout_timestamp';

let channel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
  } catch {
    channel = null;
  }
}

export function broadcastLogout(): void {
  if (channel) {
    try {
      channel.postMessage({ type: 'LOGOUT', timestamp: Date.now() });
    } catch {
      // ignore
    }
  }
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LOGOUT_STORAGE_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  }
}

export function subscribeToAuthEvents(onLogout: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleMessage = (event: MessageEvent) => {
    if (event.data?.type === 'LOGOUT') {
      onLogout();
    }
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === LOGOUT_STORAGE_KEY && event.newValue) {
      onLogout();
    }
  };

  channel?.addEventListener('message', handleMessage);
  window.addEventListener('storage', handleStorage);

  return () => {
    channel?.removeEventListener('message', handleMessage);
    window.removeEventListener('storage', handleStorage);
  };
}
