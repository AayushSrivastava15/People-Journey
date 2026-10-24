import { describe, it } from 'node:test';
import assert from 'node:assert';
import { resolvePlaceholders, formatPlaceholderDate } from '../../src/utils/placeholder-engine';
import type { CompanyProfile } from '../../src/models/company-profile.model';

describe('Placeholder Engine Unit Tests', () => {
  const mockCompanyProfile: CompanyProfile = {
    id: 'f1e1d1c1-b1a1-4000-8000-000000000001',
    ownerUserId: 'u1e1d1c1-b1a1-4000-8000-000000000001',
    companyName: 'Acme Technologies Inc.',
    hrContactName: 'Jane Smith',
    hrContactEmail: 'hr@acmetech.com',
    companyAddress: '100 Innovation Way, Suite 400',
    officeLocation: 'San Francisco Headquarters',
    hrContactPhone: '+1 (555) 019-2834',
    defaultSenderName: 'Jane Smith (HR Operations)',
    defaultEmailSignature: 'Best regards,\nJane Smith\nPeople & Culture | Acme Technologies',
    companyWebsite: 'https://acmetech.com',
    departmentTeam: 'People Operations',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockEmployee = {
    employeeName: 'Avery Morgan',
    firstName: 'Avery',
    lastName: 'Morgan',
    email: 'avery.morgan@acmetech.com',
    employeeCode: 'ACM-1042',
    designation: 'Senior Product Designer',
    department: 'Design & UX',
    hireDate: '2026-11-02',
    exitDate: '2027-11-02',
    manager: 'Sarah Connor',
  };

  it('should substitute company and employee placeholders correctly', () => {
    const template = 'Welcome to {{company_name}}, {{employee_first_name}}! Your code is {{employee_code}}.';
    const result = resolvePlaceholders(template, {
      companyProfile: mockCompanyProfile,
      employee: mockEmployee,
    });

    assert.strictEqual(
      result.text,
      'Welcome to Acme Technologies Inc., Avery! Your code is ACM-1042.'
    );
    assert.deepStrictEqual(result.missingPlaceholders, []);
    assert.deepStrictEqual(result.unresolvedPlaceholders, []);
  });

  it('should format dates to readable human format', () => {
    const template = 'Your joining date is {{joining_date}}.';
    const result = resolvePlaceholders(template, {
      companyProfile: mockCompanyProfile,
      employee: mockEmployee,
    });

    assert.ok(result.text.includes('November 2, 2026'));
  });

  it('should identify missing required company placeholders when profile is null', () => {
    const template = 'Welcome to {{company_name}}! Contact {{hr_contact_name}} at {{hr_contact_email}}.';
    const result = resolvePlaceholders(template, {
      companyProfile: null,
      employee: mockEmployee,
    });

    assert.ok(result.missingPlaceholders.includes('company_name'));
    assert.ok(result.missingPlaceholders.includes('hr_contact_name'));
    assert.ok(result.missingPlaceholders.includes('hr_contact_email'));
    assert.strictEqual(result.missingPlaceholders.length, 3);
  });

  it('should fall back sender_name to hr_contact_name if defaultSenderName is empty', () => {
    const partialProfile: CompanyProfile = {
      ...mockCompanyProfile,
      defaultSenderName: null,
    };

    const template = 'Regards,\n{{sender_name}}';
    const result = resolvePlaceholders(template, {
      companyProfile: partialProfile,
      employee: mockEmployee,
    });

    assert.strictEqual(result.text, 'Regards,\nJane Smith');
  });

  it('should preserve line breaks, formatting, and punctuation exactly', () => {
    const template = 'Hello {{employee_first_name}},\n\nLine 1: {{company_name}}!\nLine 2: {{office_location}}.\n\nThank you.';
    const result = resolvePlaceholders(template, {
      companyProfile: mockCompanyProfile,
      employee: mockEmployee,
    });

    assert.strictEqual(
      result.text,
      'Hello Avery,\n\nLine 1: Acme Technologies Inc.!\nLine 2: San Francisco Headquarters.\n\nThank you.'
    );
  });

  it('should support candidate placeholders when candidateName and candidateEmail are provided', () => {
    const template = 'Dear {{candidate_first_name}},\nThank you for applying to {{company_name}}.';
    const result = resolvePlaceholders(template, {
      companyProfile: mockCompanyProfile,
      candidateName: 'Michael Scott',
      candidateEmail: 'michael@dunder.com',
    });

    assert.strictEqual(
      result.text,
      'Dear Michael,\nThank you for applying to Acme Technologies Inc..'
    );
  });

  it('should allow custom placeholder overrides like meeting_location and exit_interview_date', () => {
    const template = 'Exit interview on {{exit_interview_date}} at {{meeting_location}}.';
    const result = resolvePlaceholders(template, {
      companyProfile: mockCompanyProfile,
      employee: mockEmployee,
      customValues: {
        exit_interview_date: '2026-11-15',
        meeting_location: 'Executive Boardroom B',
      },
    });

    assert.ok(result.text.includes('November 15, 2026'));
    assert.ok(result.text.includes('Executive Boardroom B'));
  });

  it('should never evaluate JavaScript code or inject undefined/null', () => {
    const template = 'Profile: {{company_name}} - {{non_existent_key}}';
    const result = resolvePlaceholders(template, {
      companyProfile: mockCompanyProfile,
      employee: mockEmployee,
    });

    assert.strictEqual(result.text.includes('undefined'), false);
    assert.strictEqual(result.text.includes('null'), false);
    assert.ok(result.missingPlaceholders.includes('non_existent_key'));
  });
});
