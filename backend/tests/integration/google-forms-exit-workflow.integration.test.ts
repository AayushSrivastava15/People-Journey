import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { executeSql, closePool } from '../../src/config/database.js';
import { exitInterviewService } from '../../src/services/exit-interview.service.js';

describe('Google Forms Exit Workflow, Short URL & Webhook Integration Tests', () => {
  let userId: string;
  let employeeId: number;
  let templateId: string;
  let createdInterviewId: string;
  let createdShortCode: string;

  before(async () => {
    // 1. Create test user
    const uRes = await executeSql<{ id: string }>(
      `INSERT INTO app_users (firebase_uid, email, display_name, role)
       VALUES ($1, $2, 'HR Test Manager', 'user')
       RETURNING id`,
      [`fb_test_gform_${Date.now()}`, `gform.test.${Date.now()}@example.com`]
    );
    userId = uRes.rows[0].id;

    // 2. Create test employee in OFFBOARDING
    const eRes = await executeSql<{ employee_id: number }>(
      `INSERT INTO hr_employees (
         owner_user_id, employee_code, first_name, last_name, work_email,
         employment_status, hire_date, exit_date
       ) VALUES ($1, $2, 'Ananya', 'Sharma', 'ananya.sharma@example.com', 'OFFBOARDING', '2023-01-15', '2026-11-30')
       RETURNING employee_id`,
      [userId, `EMP-GF-${Date.now()}`]
    );
    employeeId = eRes.rows[0].employee_id;

    // 3. Retrieve system template
    const tRes = await executeSql<{ id: string }>(
      `SELECT id FROM hr_exit_interview_templates WHERE is_system_template = TRUE LIMIT 1`
    );
    templateId = tRes.rows[0].id;
  });

  after(async () => {
    if (userId) {
      await executeSql(`DELETE FROM hr_exit_interview_responses WHERE interview_id IN (SELECT id FROM hr_exit_interviews WHERE owner_user_id = $1)`, [userId]);
      await executeSql(`DELETE FROM hr_exit_interviews WHERE owner_user_id = $1`, [userId]);
      await executeSql(`DELETE FROM hr_employees WHERE owner_user_id = $1`, [userId]);
      await executeSql(`DELETE FROM app_users WHERE id = $1`, [userId]);
    }
    await closePool();
  });

  it('should generate an invitation with unique short code and short URL', async () => {
    const res = await exitInterviewService.create(userId, {
      employeeId,
      templateId,
      expiryDays: 14,
      responseDueDate: '2026-11-25',
    });

    assert.ok(res.id);
    assert.ok(res.shortCode);
    assert.match(res.shortCode, /^[a-zA-Z0-9_-]{6,10}$/);
    assert.ok(res.shortUrl.includes(`/e/${res.shortCode}`));
    assert.strictEqual(res.status, 'PENDING');

    createdInterviewId = res.id;
    createdShortCode = res.shortCode;
  });

  it('should resolve short code to prefilled Infravision Google Forms URL and mark status OPENED', async () => {
    const resolved = await exitInterviewService.resolveShortCode(createdShortCode);
    assert.strictEqual(resolved.status, 'ACTIVE');

    if (resolved.status === 'ACTIVE') {
      assert.ok(resolved.redirectUrl.includes('docs.google.com/forms'));
      // Verifies Infravision prefill entry IDs
      assert.ok(resolved.redirectUrl.includes('entry.146083293=Ananya+Sharma') || resolved.redirectUrl.includes('Ananya'));
      assert.ok(resolved.redirectUrl.includes('entry.1437116560='));
      assert.ok(resolved.redirectUrl.includes(createdShortCode));
    }

    // Verify status was transitioned to OPENED
    const interview = await exitInterviewService.get(userId, createdInterviewId);
    assert.strictEqual(interview?.status, 'OPENED');
  });

  it('should synchronize response via webhook and mark status COMPLETED', async () => {
    const webhookRes = await exitInterviewService.handleGoogleFormsWebhook({
      responseId: `gform_test_${Date.now()}`,
      timestamp: new Date().toISOString(),
      invitationReference: createdShortCode,
      employeeName: 'Ananya Sharma',
      answers: {
        'Employee Name': 'Ananya Sharma',
        'Employee ID': `EMP-GF-01 [Ref: ${createdShortCode}]`,
        'Reason(s) for leaving': ['Better compensation / benefits'],
        'Primary reason for leaving': 'Higher compensation elsewhere',
        'Overall satisfaction with your time here': '5',
        'Would you recommend us as an employer to friends / family?': 'Yes',
      },
    });

    assert.strictEqual(webhookRes.success, true);
    assert.strictEqual(webhookRes.interviewId, createdInterviewId);

    // Verify database state
    const interview = await exitInterviewService.get(userId, createdInterviewId);
    assert.strictEqual(interview?.status, 'COMPLETED');
    assert.ok(interview?.completedAt);
    assert.ok(interview?.googleFormResponseId);

    // Verify submitted answers in responses table
    const responses = await exitInterviewService.responses(userId, createdInterviewId);
    assert.ok(responses.length >= 5);
  });

  it('should be idempotent: duplicate webhook submission does not duplicate records', async () => {
    const existing = await exitInterviewService.get(userId, createdInterviewId);
    const respId = existing?.googleFormResponseId || 'test_resp_id';

    const duplicateRes = await exitInterviewService.handleGoogleFormsWebhook({
      responseId: respId,
      invitationReference: createdShortCode,
      answers: {
        'Employee Name': 'Ananya Sharma',
      },
    });

    assert.strictEqual(duplicateRes.success, true);
    assert.match(duplicateRes.message, /already|idempotent/i);

    // Verify still completed and no extra responses
    const interview = await exitInterviewService.get(userId, createdInterviewId);
    assert.strictEqual(interview?.status, 'COMPLETED');
  });

  it('should reject link resolution once completed', async () => {
    const resolved = await exitInterviewService.resolveShortCode(createdShortCode);
    assert.strictEqual(resolved.status, 'COMPLETED');
  });

  it('should regenerate link with a new short code and revoke previous link', async () => {
    const regen = await exitInterviewService.regenerate(userId, createdInterviewId, userId, 7);
    assert.ok(regen);
    assert.notStrictEqual(regen.shortCode, createdShortCode);
    assert.strictEqual(regen.status, 'PENDING');

    // Old short code should now be rejected or not match active interview
    const oldResolved = await exitInterviewService.resolveShortCode(createdShortCode);
    assert.strictEqual(oldResolved.status, 'NOT_FOUND');

    // New short code resolves cleanly
    const newResolved = await exitInterviewService.resolveShortCode(regen.shortCode);
    assert.strictEqual(newResolved.status, 'ACTIVE');
  });
});

