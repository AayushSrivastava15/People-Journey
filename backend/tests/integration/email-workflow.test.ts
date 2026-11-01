import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { executeSql, closePool } from '../../src/config/database.js';
import { emailTemplateService } from '../../src/services/email-template.service.js';
import { emailDraftService } from '../../src/services/email-draft.service.js';
import { companyProfileService } from '../../src/services/company-profile.service.js';

describe('Email Templates & Draft Workflow Integration Tests', () => {
  let userAId: string;
  let userBId: string;
  let employeeId: number;
  let createdDraftId: string;
  let customTemplateId: string;

  before(async () => {
    // User A
    const resA = await executeSql(
      `INSERT INTO app_users (firebase_uid, email, display_name, role)
       VALUES ($1, $2, $3, 'user')
       RETURNING id`,
      [`fb_test_email_a_${Date.now()}`, `test.email.a.${Date.now()}@example.com`, 'User A']
    );
    userAId = (resA.rows[0] as { id: string }).id;

    // User B
    const resB = await executeSql(
      `INSERT INTO app_users (firebase_uid, email, display_name, role)
       VALUES ($1, $2, $3, 'user')
       RETURNING id`,
      [`fb_test_email_b_${Date.now()}`, `test.email.b.${Date.now()}@example.com`, 'User B']
    );
    userBId = (resB.rows[0] as { id: string }).id;

    // Company profile for User A
    await companyProfileService.upsertProfile(userAId, {
      companyName: 'Horizon Creative Labs',
      hrContactName: 'Elena Rostova',
      hrContactEmail: 'elena@horizonlabs.com',
      officeLocation: 'Brooklyn Tech Center',
    });

    // Employee for User A
    const empRes = await executeSql(
      `INSERT INTO hr_employees (
        owner_user_id, employee_code, first_name, last_name,
        work_email, hire_date, employment_status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'ONBOARDING')
      RETURNING employee_id`,
      [userAId, `HZ-${Date.now().toString().slice(-4)}`, 'Julian', 'Vance', 'julian.vance@horizonlabs.com', '2026-11-01']
    );
    employeeId = (empRes.rows[0] as { employee_id: number }).employee_id;
  });

  after(async () => {
    if (userAId) {
      await executeSql(`DELETE FROM hr_email_drafts WHERE owner_user_id = $1`, [userAId]);
      await executeSql(`DELETE FROM hr_email_templates WHERE owner_user_id = $1`, [userAId]);
      await executeSql(`DELETE FROM hr_employees WHERE owner_user_id = $1`, [userAId]);
      await executeSql(`DELETE FROM hr_company_profiles WHERE owner_user_id = $1`, [userAId]);
      await executeSql(`DELETE FROM app_users WHERE id = $1`, [userAId]);
    }
    if (userBId) {
      await executeSql(`DELETE FROM hr_email_drafts WHERE owner_user_id = $1`, [userBId]);
      await executeSql(`DELETE FROM hr_email_templates WHERE owner_user_id = $1`, [userBId]);
      await executeSql(`DELETE FROM app_users WHERE id = $1`, [userBId]);
    }
    await closePool();
  });

  it('should list system starter templates for user A', async () => {
    const templates = await emailTemplateService.listTemplates(userAId);
    assert.ok(templates.length >= 20, 'Should have comprehensive starter templates library');
    const welcome = templates.find(t => t.name === 'New Joiner Welcome');
    assert.ok(welcome, 'New Joiner Welcome template should exist');
    assert.strictEqual(welcome.isSystemTemplate, true);
  });

  it('should allow user A to duplicate a system template into workspace', async () => {
    const templates = await emailTemplateService.listTemplates(userAId);
    const starter = templates.find(t => t.name === 'New Joiner Welcome')!;

    const duplicate = await emailTemplateService.duplicateTemplate(userAId, starter.id);
    assert.ok(duplicate.id);
    assert.strictEqual(duplicate.ownerUserId, userAId);
    assert.strictEqual(duplicate.isSystemTemplate, false);
    assert.ok(duplicate.name.includes('(Custom)'));
    customTemplateId = duplicate.id;
  });

  it('should generate draft preview with company profile and employee substitutions', async () => {
    const templates = await emailTemplateService.listTemplates(userAId);
    const welcome = templates.find(t => t.name === 'New Joiner Welcome')!;

    const preview = await emailDraftService.previewDraft(userAId, {
      employeeId,
      templateId: welcome.id,
    });

    assert.strictEqual(preview.recipientEmail, 'julian.vance@horizonlabs.com');
    assert.ok(preview.subject.includes('Horizon Creative Labs'));
    assert.ok(preview.subject.includes('Julian'));
    assert.ok(preview.body.includes('Horizon Creative Labs'));
    assert.ok(preview.body.includes('Julian'));
    assert.ok(preview.body.includes('Elena Rostova'));
    assert.strictEqual(preview.hasCompanyProfile, true);
    assert.strictEqual(preview.missingPlaceholders.length, 0);
  });

  it('should save an email draft snapshot in PostgreSQL', async () => {
    const draft = await emailDraftService.createDraft(userAId, {
      employeeId,
      lifecycleEvent: 'Onboarding Welcome',
      recipientEmail: 'julian.vance@horizonlabs.com',
      recipientName: 'Julian Vance',
      subjectSnapshot: 'Welcome to Horizon Creative Labs, Julian!',
      bodySnapshot: 'Dear Julian,\nWelcome to Horizon Creative Labs!\nBest,\nElena Rostova',
      status: 'prepared',
    });

    assert.ok(draft.id);
    assert.strictEqual(draft.ownerUserId, userAId);
    assert.strictEqual(draft.status, 'prepared');
    createdDraftId = draft.id;

    const list = await emailDraftService.listDrafts(userAId);
    assert.ok(list.data.some(d => d.id === draft.id));
  });

  it('should update draft status to gmail_opened with timestamp', async () => {
    const updated = await emailDraftService.updateDraftStatus(
      userAId,
      createdDraftId,
      'gmail_opened',
      true
    );

    assert.strictEqual(updated.status, 'gmail_opened');
    assert.ok(updated.gmailOpenedAt, 'Should record gmail_opened_at timestamp');
  });

  it('should enforce data isolation: User B cannot view User A drafts or custom templates', async () => {
    const userBDrafts = await emailDraftService.listDrafts(userBId);
    assert.strictEqual(userBDrafts.total, 0, 'User B must not see User A drafts');

    const draftForB = await emailDraftService.getDraftById(userBId, createdDraftId);
    assert.strictEqual(draftForB, null, 'User B must not fetch User A draft by ID');

    const templateForB = await emailTemplateService.getTemplateById(userBId, customTemplateId);
    assert.strictEqual(templateForB, null, 'User B must not access User A custom template');
  });
});
