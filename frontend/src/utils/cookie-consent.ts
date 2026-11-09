export interface CookiePreferences {
  essential: true;
  preferences: boolean;
  analytics: boolean;
  timestamp: string;
  version: number;
}

const COOKIE_CONSENT_KEY = 'people_journey_cookie_consent';
const CONSENT_VERSION = 1;

export function getCookieConsent(): CookiePreferences | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CookiePreferences;
    if (parsed && parsed.version === CONSENT_VERSION) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function setCookieConsent(preferences: { preferences: boolean; analytics: boolean }): CookiePreferences {
  const payload: CookiePreferences = {
    essential: true,
    preferences: Boolean(preferences.preferences),
    analytics: Boolean(preferences.analytics),
    timestamp: new Date().toISOString(),
    version: CONSENT_VERSION,
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(payload));
      window.dispatchEvent(new CustomEvent('cookie_consent_updated', { detail: payload }));
    } catch (e) {
      console.warn('Failed to persist cookie consent to localStorage', e);
    }
  }

  return payload;
}

export function hasUserConsented(): boolean {
  return getCookieConsent() !== null;
}

