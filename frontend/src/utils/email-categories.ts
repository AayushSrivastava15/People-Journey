export type CanonicalTemplateCategory =
  | 'recruitment'
  | 'preboarding'
  | 'onboarding'
  | 'general'
  | 'offboarding'
  | 'exit_interview'
  | 'lifecycle';

export interface EmailCategoryDefinition {
  key: CanonicalTemplateCategory;
  label: string;
  shortLabel: string;
}

export const EMAIL_TEMPLATE_CATEGORIES: EmailCategoryDefinition[] = [
  {
    key: 'recruitment',
    label: 'Recruitment and Candidate Communication',
    shortLabel: 'Recruitment',
  },
  {
    key: 'preboarding',
    label: 'New Joiner and Preboarding',
    shortLabel: 'Preboarding',
  },
  {
    key: 'onboarding',
    label: 'First-Day and Onboarding',
    shortLabel: 'Onboarding',
  },
  {
    key: 'general',
    label: 'General Employee Communication',
    shortLabel: 'General',
  },
  {
    key: 'offboarding',
    label: 'Offboarding and Last Working Day',
    shortLabel: 'Offboarding',
  },
  {
    key: 'exit_interview',
    label: 'Exit Interview',
    shortLabel: 'Exit Interview',
  },
  {
    key: 'lifecycle',
    label: 'Other Lifecycle Templates',
    shortLabel: 'Lifecycle',
  },
];

export function normalizeCategory(cat?: string | null): CanonicalTemplateCategory {
  if (!cat) return 'lifecycle';
  const c = cat.toLowerCase().trim();
  if (c === 'recruitment' || c.includes('recruit') || c.includes('candidate')) return 'recruitment';
  if (c === 'preboarding' || c.includes('preboard') || c.includes('joiner')) return 'preboarding';
  if (c === 'onboarding' || c.includes('onboard') || c.includes('first-day') || c.includes('first_day')) return 'onboarding';
  if (c === 'general' || c.includes('general')) return 'general';
  if (c === 'offboarding' || c.includes('offboard') || c.includes('last working') || c.includes('last_working')) return 'offboarding';
  if (c === 'exit_interview' || c.includes('exit')) return 'exit_interview';
  if (c === 'lifecycle' || c.includes('lifecycle')) return 'lifecycle';
  return 'lifecycle';
}

export function getCategoryLabel(cat?: string | null): string {
  const norm = normalizeCategory(cat);
  const found = EMAIL_TEMPLATE_CATEGORIES.find(c => c.key === norm);
  return found ? found.label : (cat || 'Other Lifecycle Templates');
}

export function getCategoryShortLabel(cat?: string | null): string {
  const norm = normalizeCategory(cat);
  const found = EMAIL_TEMPLATE_CATEGORIES.find(c => c.key === norm);
  return found ? found.shortLabel : (cat || 'Lifecycle');
}
