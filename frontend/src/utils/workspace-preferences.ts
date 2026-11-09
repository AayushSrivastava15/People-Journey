export interface WorkspacePreferences {
  defaultView: 'overview' | 'employees' | 'onboarding';
  dateFormat: string;
  emailAlerts: boolean;
  journeyDigests: boolean;
}

export const DEFAULT_PREFERENCES: WorkspacePreferences = {
  defaultView: 'overview',
  dateFormat: 'DD MMM YYYY',
  emailAlerts: true,
  journeyDigests: true,
};

const STORAGE_KEY = 'people_journey_workspace_preferences';

export function getStoredPreferences(): WorkspacePreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw);
    return {
      defaultView: ['overview', 'employees', 'onboarding'].includes(parsed.defaultView)
        ? parsed.defaultView
        : DEFAULT_PREFERENCES.defaultView,
      dateFormat: parsed.dateFormat || DEFAULT_PREFERENCES.dateFormat,
      emailAlerts: typeof parsed.emailAlerts === 'boolean' ? parsed.emailAlerts : DEFAULT_PREFERENCES.emailAlerts,
      journeyDigests: typeof parsed.journeyDigests === 'boolean' ? parsed.journeyDigests : DEFAULT_PREFERENCES.journeyDigests,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function saveStoredPreferences(prefs: Partial<WorkspacePreferences>): WorkspacePreferences {
  const current = getStoredPreferences();
  const updated: WorkspacePreferences = { ...current, ...prefs };
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (err) {
      console.warn('Could not save preferences to localStorage:', err);
    }
  }
  return updated;
}

export function getDefaultLandingPath(defaultView?: string): string {
  switch (defaultView) {
    case 'employees':
      return '/dashboard/employees';
    case 'onboarding':
      return '/dashboard/onboarding';
    case 'overview':
    default:
      return '/dashboard';
  }
}

export function formatDateWithPattern(dateVal: string | Date | null | undefined, pattern = 'DD MMM YYYY'): string {
  if (!dateVal) return '—';
  try {
    const d = typeof dateVal === 'string' ? new Date(dateVal) : dateVal;
    if (isNaN(d.getTime())) return String(dateVal);

    const year = d.getFullYear();
    const monthIndex = d.getMonth();
    const day = String(d.getDate()).padStart(2, '0');
    const monthNumber = String(monthIndex + 1).padStart(2, '0');

    const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthShort = monthsShort[monthIndex];

    switch (pattern) {
      case 'YYYY-MM-DD':
        return `${year}-${monthNumber}-${day}`;
      case 'MM/DD/YYYY':
        return `${monthNumber}/${day}/${year}`;
      case 'DD MMM YYYY':
      default:
        return `${day} ${monthShort} ${year}`;
    }
  } catch {
    return String(dateVal);
  }
}

