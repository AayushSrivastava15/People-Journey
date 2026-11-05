import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { executeSql, closePool } from '../../src/config/database.js';
import { exitInterviewService } from '../../src/services/exit-interview.service.js';
import { generateResponsesExcel, generateResponsesCsv } from '../../src/utils/exit-interview-export.js';

describe('Hosted Multi-Company Exit Feedback Workflow Integration Tests', () => {
  const companyAUser = 'a1111111-1111-4000-8000-000000000001';
  const companyBUser = 'b2222222-2222-4000-8000-000000000002';
  let employeeAId: number;
  let employeeBId: number;
  let invitationAId: string;
  let shortCodeA: string;

  before(async () => {
    // 1. Ensure test users exist in app_users
    await executeSql(
      `INSERT INTO app_users (id, firebase_uid, email, display_name, role)
       VALUES ($1, 'fb_comp_a', 'hr@companya.com', 'HR Admin A', 'hr_admin'),
              ($2, 'fb_comp_b', 'hr@companyb.com', 'HR Admin B', 'hr_admin')
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`,
      [companyAUser, companyBUser]
    );

    // 2. Set up Company A and Company B profiles
    await executeSql(
      `INSERT INTO hr_company_profiles (
        owner_user_id, company_name, display_name, brand_primary_color, hr_contact_name, hr_contact_email, setup_completed
      ) VALUES
        ($1, 'Apex Dynamics Corp', 'Apex Dynamics', '#59424f', 'Alice HR', 'alice@apexdynamics.com', true),
        ($2, 'Beacon Global Labs', 'Beacon Labs', '#2563eb', 'Bob HR', 'bob@beaconlabs.com', true)
      ON CONFLICT (owner_user_id) DO UPDATE SET
        company_name = EXCLUDED.company_name,
        brand_primary_color = EXCLUDED.brand_primary_color`,
      [companyAUser, companyBUser]
    );

    // 3. Create test departments and employees
    const deptA = await executeSql<{ department_id: number }>(
      `INSERT INTO hr_departments (owner_user_id, department_name)
       VALUES ($1, 'Engineering')
       ON CONFLICT DO NOTHING
       RETURNING department_id`,
      [companyAUser]
    );
    const dIdA = deptA.rows[0]?.department_id || 1;

    const empARes = await executeSql<{ employee_id: number }>(
      `INSERT INTO hr_employees (owner_user_id, employee_code, first_name, last_name, work_email, department_id, hire_date, employment_status)
       VALUES ($1, 'APX-101', 'Elena', 'Rostova', 'elena.rostova@apexdynamics.com', $2, '2023-01-15', 'OFFBOARDING')
       RETURNING employee_id`,
      [companyAUser, dIdA]
    );
    employeeAId = empARes.rows[0].employee_id;

    const empBRes = await executeSql<{ employee_id: number }>(
      `INSERT INTO hr_employees (owner_user_id, employee_code, first_name, last_name, work_email, hire_date, employment_status)
       VALUES ($1, 'BCN-202', 'Marcus', 'Vance', 'marcus.vance@beaconlabs.com', '2022-06-01', 'OFFBOARDING')
       RETURNING employee_id`,
      [companyBUser]
    );
    employeeBId = empBRes.rows[0].employee_id;
  });

  after(async () => {
    // Clean up test data
    if (employeeAId) {
      await executeSql(`DELETE FROM hr_employees WHERE employee_id IN ($1, $2)`, [employeeAId, employeeBId]);
    }
    await executeSql(`DELETE FROM hr_company_profiles WHERE owner_user_id IN ($1, $2)`, [companyAUser, companyBUser]);
    await executeSql(`DELETE FROM app_users WHERE id IN ($1, $2)`, [companyAUser, companyBUser]);
    await closePool();
  });

  it('should initialize independent company templates for Company A and Company B', async () => {
    const tmplA = await exitInterviewService.getOrCreateCompanyTemplate(companyAUser);
    const tmplB = await exitInterviewService.getOrCreateCompanyTemplate(companyBUser);

    assert.ok(tmplA.id, 'Company A template ID should exist');
    assert.ok(tmplB.id, 'Company B template ID should exist');
    assert.notStrictEqual(tmplA.id, tmplB.id, 'Company A and B must have completely distinct templates');
    assert.strictEqual(tmplA.version, 1, 'Initial template version must be 1');
    assert.strictEqual(tmplA.schema.sections.length, 9, 'Template must contain all 9 canonical sections');
  });

  it('should allow Company A to customize draft and publish a new version without affecting Company B', async () => {
    const tmplA = await exitInterviewService.getOrCreateCompanyTemplate(companyAUser);

    // Modify Company A draft
    const customSchema = JSON.parse(JSON.stringify(tmplA.schema));
    customSchema.sections[0].questions.push({
      id: 'custom_question_a',
      label: 'Specific Apex Dynamics Query',
      type: 'text',
      required: false,
      orderIndex: 99,
    });

    await exitInterviewService.updateTemplateDraft(companyAUser, {
      name: 'Apex Dynamics Exit Feedback (Customized)',
      schema: customSchema,
    });

    // Publish new version for Company A
    const published = await exitInterviewService.publishTemplate(companyAUser, 'Added custom question for Apex');
    assert.strictEqual(published.version, 2, 'New version for Company A should be 2');

    // Verify Company B remains completely unaffected at version 1
    const tmplB = await exitInterviewService.getOrCreateCompanyTemplate(companyBUser);
    assert.strictEqual(tmplB.version, 1, 'Company B version must remain 1');
    const bHasCustom = tmplB.schema.sections[0].questions.some((q: any) => q.id === 'custom_question_a');
    assert.strictEqual(bHasCustom, false, 'Company B must not contain Company A custom question');
  });

  it('should create an exit interview invitation with a unique short code and short URL', async () => {
    const inv = await exitInterviewService.create(companyAUser, {
      employeeId: employeeAId,
      expiryDays: 14,
      responseDueDate: '2026-11-20',
    });

    assert.ok(inv.id, 'Invitation ID should be returned');
    assert.ok(inv.shortCode, 'Short code should be generated');
    assert.ok(inv.shortUrl.includes(`/e/${inv.shortCode}`), 'Short URL must use /e/:code pattern');
    assert.strictEqual(inv.status, 'PENDING');

    invitationAId = inv.id;
    shortCodeA = inv.shortCode;
  });

  it('should resolve short link into native hosted questionnaire schema with dynamic company branding', async () => {
    const resolved = await exitInterviewService.resolveShortCode(shortCodeA);

    assert.strictEqual(resolved.status, 'ACTIVE');
    if (resolved.status === 'ACTIVE') {
      assert.strictEqual(resolved.company.companyName, 'Apex Dynamics Corp');
      assert.strictEqual(resolved.company.brandPrimaryColor, '#59424f');
      assert.strictEqual(resolved.employee.name, 'Elena Rostova');
      assert.strictEqual(resolved.employee.employeeCode, 'APX-101');
      assert.strictEqual(resolved.template.version, 2, 'Invitation should use published version 2');
      assert.strictEqual(resolved.template.schema.sections.length, 9);
    }
  });

  it('should securely submit feedback, validate answers, and automatically mark status COMPLETED', async () => {
    const validAnswers: Record<string, unknown> = {
      employee_name: 'Elena Rostova',
      employee_id: 'APX-101',
      designation: 'Staff Engineer',
      department: 'Engineering',
      reporting_manager: 'Director Sarah',
      location: 'Site A',
      date_of_joining: '2023-01-15',
      date_of_resignation: '2026-10-15',
      last_working_day: '2026-11-15',
      total_tenure: '3 years 10 months',
      employment_type: 'Permanent',
      reasons_for_leaving: ['Better career opportunity'],
      primary_reason: 'Better career opportunity',
      reason_elaboration: 'Pursuing a principal architecture role.',
      joining_another_org: 'Yes',
      role_ratings: {
        role_responsibilities_match: 4,
        role_skills_utilization: 5,
        role_goals_clarity: 4,
        role_tools_resources: 5,
        role_workload_manageable: 4,
        role_meaningful_work: 5,
        role_induction_helped: 4,
      },
      manager_ratings: {
        manager_clear_direction: 4,
        manager_respect_fairness: 5,
        manager_recognition: 4,
        manager_career_support: 5,
        manager_approachable: 5,
        team_cooperation: 4,
        team_coordination_sites: 4,
      },
      culture_ratings: {
        culture_values_reflected: 4,
        culture_valued_respected: 4,
        culture_policies_fair: 4,
        culture_upskill_opportunities: 4,
        culture_promotions_fair: 4,
        culture_safe_environment: 5,
        culture_leadership_communication: 4,
        culture_engagement_activities: 4,
      },
      compensation_ratings: {
        comp_salary_fair: 4,
        comp_benefits_satisfactory: 4,
        comp_payroll_timely: 5,
        comp_work_hours_balance: 4,
        comp_physical_environment: 4,
        comp_hr_responsive: 4,
      },
      overall_satisfaction: 5,
      recommend_employer: 'Yes',
      consider_rejoining: 'Yes',
      personal_email: 'elena.rostova@personalmail.com',
      personal_phone: '+1 555-0199',
      preferred_address: '456 Innovation Road, Apt 12',
      declaration_agreement: ['I agree to the above declaration'],
      declaration_signature: 'Elena Rostova',
      declaration_date: '2026-11-05',
    };

    const submitRes = await exitInterviewService.submitPublicFeedback(shortCodeA, validAnswers, {
      userAgent: 'Automated-Test-Runner',
    });

    assert.strictEqual(submitRes.ok, true, 'Submission must succeed');

    // Verify invitation status is now COMPLETED
    const detail = await exitInterviewService.get(companyAUser, invitationAId);
    assert.strictEqual(detail?.status, 'COMPLETED');
    assert.ok(detail?.completedAt, 'completedAt timestamp must be recorded');
  });

  it('should enforce multi-company data isolation: Company B cannot view Company A responses or exports', async () => {
    // Company A can view response
    const resA = await exitInterviewService.getResponseDetail(companyAUser, invitationAId);
    assert.ok(resA, 'Company A must be able to view its own employee response');
    assert.strictEqual(resA?.employee.name, 'Elena Rostova');

    // Company B must receive null / 404
    const resB = await exitInterviewService.getResponseDetail(companyBUser, invitationAId);
    assert.strictEqual(resB, null, 'Company B must NOT be able to access Company A response');

    // Verify Company B export contains zero items from Company A
    const exportB = await exitInterviewService.getExportData(companyBUser);
    assert.strictEqual(exportB.items.length, 0, 'Company B export must be completely isolated');

    // Verify Company A export contains the response
    const exportA = await exitInterviewService.getExportData(companyAUser);
    assert.strictEqual(exportA.items.length, 1);
    assert.strictEqual(exportA.items[0].employeeCode, 'APX-101');

    // Test Excel buffer generation
    const excelBuffer = generateResponsesExcel(exportA.companyName, exportA.items);
    assert.ok(excelBuffer && excelBuffer.length > 0, 'Excel buffer must be generated successfully');

    // Test CSV generation
    const csvContent = generateResponsesCsv(exportA.items);
    assert.ok(csvContent.includes('APX-101'), 'CSV must contain employee record');
    assert.ok(csvContent.includes('Better career opportunity'), 'CSV must contain answers');
  });
});
