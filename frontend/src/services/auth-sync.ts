/**
 * Cross-tab authentication synchronization using BroadcastChannel and storage events.
 * Guarantees that:
 * 1. When a user logs in in one tab, other open tabs immediately recognize the authenticated
 *    session and transition without requiring a manual page refresh.
 * 2. When a user logs out in one tab, all other tabs immediately terminate their session,
 *    clear cached state, and redirect to the landing page.
 */
const CHANNEL_NAME = 'pj_auth_sync';
const LOGOUT_STORAGE_KEY = 'pj_logout_timestamp';
const LOGIN_STORAGE_KEY = 'pj_login_timestamp';

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

export function broadcastLogin(): void {
  if (channel) {
    try {
      channel.postMessage({ type: 'LOGIN', timestamp: Date.now() });
    } catch {
      // ignore
    }
  }
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LOGIN_STORAGE_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  }
}

export interface AuthEventHandlers {
  onLogout: () => void;
  onLogin?: () => void;
}

export function subscribeToAuthEvents(
  handler: (() => void) | AuthEventHandlers
): () => void {
  if (typeof window === 'undefined') return () => {};

  const onLogout = typeof handler === 'function' ? handler : handler.onLogout;
  const onLogin = typeof handler === 'object' ? handler.onLogin : undefined;

  const handleMessage = (event: MessageEvent) => {
    if (event.data?.type === 'LOGOUT') {
      onLogout();
    } else if (event.data?.type === 'LOGIN' && onLogin) {
      onLogin();
    }
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === LOGOUT_STORAGE_KEY && event.newValue) {
      onLogout();
    } else if (event.key === LOGIN_STORAGE_KEY && event.newValue && onLogin) {
      onLogin();
    }
  };

  channel?.addEventListener('message', handleMessage);
  window.addEventListener('storage', handleStorage);

  return () => {
    channel?.removeEventListener('message', handleMessage);
    window.removeEventListener('storage', handleStorage);
  };
}
