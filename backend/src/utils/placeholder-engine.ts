import type { CompanyProfile } from '../models/company-profile.model';

export interface PlaceholderEmployeeData {
  employeeName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  employeeCode?: string;
  designation?: string;
  department?: string;
  hireDate?: string;
  exitDate?: string;
  manager?: string;
}

export interface PlaceholderContext {
  companyProfile?: CompanyProfile | null;
  employee?: PlaceholderEmployeeData | null;
  candidateName?: string | null;
  candidateEmail?: string | null;
  customValues?: Record<string, string>;
}

export interface ResolvedTemplateResult {
  text: string;
  detectedPlaceholders: string[];
  missingPlaceholders: string[];
  unresolvedPlaceholders: string[];
}

/**
 * Standardizes date formatting to human-friendly format (e.g. "October 24, 2026").
 */
export function formatPlaceholderDate(dateStr?: string | null): string {
  if (!dateStr || typeof dateStr !== 'string' || !dateStr.trim()) return '';
  const trimmed = dateStr.trim();
  const parts = trimmed.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      const date = new Date(y, m, d, 12, 0, 0);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      }
    }
  }
  const fallback = new Date(trimmed);
  return !isNaN(fallback.getTime())
    ? fallback.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : trimmed;
}

/**
 * Resolves all supported placeholders in a template string safely without code execution.
 */
export function resolvePlaceholders(
  template: string,
  context: PlaceholderContext
): ResolvedTemplateResult {
  if (!template) {
    return {
      text: '',
      detectedPlaceholders: [],
      missingPlaceholders: [],
      unresolvedPlaceholders: [],
    };
  }

  const { companyProfile, employee, candidateName, candidateEmail, customValues = {} } = context;

  // Derive employee names
  const rawEmpName = employee?.employeeName || (employee?.firstName ? `${employee.firstName} ${employee.lastName || ''}`.trim() : '');
  const empParts = rawEmpName ? rawEmpName.split(/\s+/) : [];
  const empFirst = employee?.firstName || empParts[0] || '';
  const empLast = employee?.lastName || empParts.slice(1).join(' ') || '';

  // Derive candidate names
  const candParts = candidateName ? candidateName.trim().split(/\s+/) : [];
  const candFirst = candParts[0] || empFirst || 'Candidate';

  // Format today's date
  const todayFormatted = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Build key-value map for all supported placeholders
  const map: Record<string, string | undefined> = {
    // Company placeholders
    company_name: companyProfile?.companyName || undefined,
    company_address: companyProfile?.officeLocation || companyProfile?.companyAddress || '',
    office_location: companyProfile?.officeLocation || companyProfile?.companyAddress || '',
    company_website: companyProfile?.companyWebsite || '',
    hr_contact_name: companyProfile?.hrContactName || undefined,
    hr_contact_email: companyProfile?.hrContactEmail || undefined,
    hr_contact_phone: companyProfile?.hrContactPhone || '',
    sender_name: companyProfile?.defaultSenderName || companyProfile?.hrContactName || companyProfile?.companyName || 'HR Team',
    company_signature: '',

    // Employee & Candidate placeholders
    employee_name: rawEmpName || undefined,
    employee_first_name: empFirst || undefined,
    employee_last_name: empLast || undefined,
    employee_email: employee?.email || undefined,
    employee_code: employee?.employeeCode || undefined,
    candidate_first_name: candFirst,
    candidate_email: candidateEmail || employee?.email || undefined,
    job_title: employee?.designation || customValues.job_title || 'Team Member',
    department_name: employee?.department || companyProfile?.departmentTeam || 'Team',
    joining_date: formatPlaceholderDate(employee?.hireDate || customValues.joining_date) || undefined,
    joining_time: customValues.joining_time || '9:30 AM',
    last_working_day: formatPlaceholderDate(employee?.exitDate || customValues.last_working_day) || undefined,
    offboarding_date: formatPlaceholderDate(employee?.exitDate || customValues.offboarding_date) || undefined,
    exit_interview_date: formatPlaceholderDate(customValues.exit_interview_date) || undefined,
    exit_interview_time: customValues.exit_interview_time || '2:00 PM',
    meeting_location: customValues.meeting_location || companyProfile?.officeLocation || 'Google Meet / Conference Room',
    manager_name: employee?.manager || customValues.manager_name || 'Your Reporting Manager',
    required_documents: customValues.required_documents || 'Government Photo ID, signed offer letter, direct deposit authorization form',
    pending_tasks: customValues.pending_tasks || 'Complete profile enrollment and review team guidelines',
    form_link: customValues.form_link || companyProfile?.companyWebsite || '',
    today_date: todayFormatted,
  };

  // Merge any explicitly provided customValues overrides
  for (const [k, v] of Object.entries(customValues)) {
    if (v !== undefined) {
      if (typeof v === 'string' && (k.endsWith('_date') || k.endsWith('_day') || /^\d{4}-\d{2}-\d{2}/.test(v))) {
        map[k] = formatPlaceholderDate(v);
      } else {
        map[k] = v;
      }
    }
  }

  const detected = new Set<string>();
  const missing = new Set<string>();
  const unresolved = new Set<string>();

  const regex = /\{\{([a-zA-Z0-9_]+)\}\}/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(template)) !== null) {
    const key = match[1];
    detected.add(key);

    const val = map[key];
    if (val === undefined || val === null) {
      missing.add(key);
      unresolved.add(match[0]);
    }
  }

  // Replace placeholders in template
  const text = template.replace(regex, (fullMatch, key) => {
    const val = map[key];
    if (val !== undefined && val !== null) {
      return val;
    }
    // Return original placeholder tag if unresolved, so preview highlights it clearly
    return fullMatch;
  });

  return {
    text,
    detectedPlaceholders: Array.from(detected),
    missingPlaceholders: Array.from(missing),
    unresolvedPlaceholders: Array.from(unresolved),
  };
}
