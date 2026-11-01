import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { executeSql, closePool } from '../../src/config/database.js';
import { companyProfileService } from '../../src/services/company-profile.service.js';

describe('Company Profile Integration Tests', () => {
  let userAId: string;
  let userBId: string;

  before(async () => {
    // Create User A
    const resA = await executeSql(
      `INSERT INTO app_users (firebase_uid, email, display_name, role)
       VALUES ($1, $2, $3, 'user')
       RETURNING id`,
      [`fb_test_comp_a_${Date.now()}`, `test.comp.a.${Date.now()}@example.com`, 'User A']
    );
    userAId = (resA.rows[0] as { id: string }).id;

    // Create User B
    const resB = await executeSql(
      `INSERT INTO app_users (firebase_uid, email, display_name, role)
       VALUES ($1, $2, $3, 'user')
       RETURNING id`,
      [`fb_test_comp_b_${Date.now()}`, `test.comp.b.${Date.now()}@example.com`, 'User B']
    );
    userBId = (resB.rows[0] as { id: string }).id;
  });

  after(async () => {
    if (userAId) {
      await executeSql(`DELETE FROM hr_company_profiles WHERE owner_user_id = $1`, [userAId]);
      await executeSql(`DELETE FROM app_users WHERE id = $1`, [userAId]);
    }
    if (userBId) {
      await executeSql(`DELETE FROM hr_company_profiles WHERE owner_user_id = $1`, [userBId]);
      await executeSql(`DELETE FROM app_users WHERE id = $1`, [userBId]);
    }
    await closePool();
  });

  it('should return null for an unconfigured company profile', async () => {
    const profile = await companyProfileService.getProfile(userAId);
    assert.strictEqual(profile, null);
  });

  it('should create and retrieve a company profile for authenticated user A', async () => {
    const created = await companyProfileService.upsertProfile(userAId, {
      companyName: 'Nexus Global Systems',
      hrContactName: 'Sarah Jenkins',
      hrContactEmail: 'hr@nexusglobal.io',
      companyAddress: '450 Silicon Blvd',
      officeLocation: 'Austin Office',
      hrContactPhone: '+1 (512) 555-0199',
      defaultSenderName: 'Sarah Jenkins (Head of Talent)',
      defaultEmailSignature: 'Warm regards,\nSarah Jenkins\nNexus Global Systems',
      companyWebsite: 'https://nexusglobal.io',
      departmentTeam: 'People Operations',
    });

    assert.ok(created.id);
    assert.strictEqual(created.ownerUserId, userAId);
    assert.strictEqual(created.companyName, 'Nexus Global Systems');
    assert.strictEqual(created.hrContactEmail, 'hr@nexusglobal.io');

    const fetched = await companyProfileService.getProfile(userAId);
    assert.ok(fetched);
    assert.strictEqual(fetched.companyName, 'Nexus Global Systems');
    assert.strictEqual(fetched.officeLocation, 'Austin Office');
  });

  it('should update company profile without creating duplicate rows on repeated save', async () => {
    const updated = await companyProfileService.upsertProfile(userAId, {
      companyName: 'Nexus Global Inc.',
      hrContactName: 'Sarah Jenkins',
      hrContactEmail: 'sarah.jenkins@nexusglobal.io',
    });

    assert.strictEqual(updated.companyName, 'Nexus Global Inc.');
    assert.strictEqual(updated.hrContactEmail, 'sarah.jenkins@nexusglobal.io');

    const countRes = await executeSql(
      `SELECT COUNT(*)::int AS count FROM hr_company_profiles WHERE owner_user_id = $1`,
      [userAId]
    );
    assert.strictEqual(countRes.rows[0].count, 1, 'Should have exactly 1 company profile row per user');
  });

  it('should enforce strict isolation: User B cannot see User A company profile', async () => {
    const userBProfile = await companyProfileService.getProfile(userBId);
    assert.strictEqual(userBProfile, null, 'User B must not see User A company profile');
  });
});
