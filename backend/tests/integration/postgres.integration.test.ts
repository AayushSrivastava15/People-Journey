import { describe, it, after } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { executeSql, withTransaction, closePool, isPoolInitialized } from '../../src/config/database';
import { auditService } from '../../src/services/audit.service';
import { masterService } from '../../src/services/master.service';
import { dashboardService } from '../../src/services/dashboard.service';
import { userService } from '../../src/services/user.service';
import { env } from '../../src/config/env';

describe('Supabase PostgreSQL Integration & Transaction Tests', () => {
  after(async () => {
    if (env.DATABASE_URL) {
      try {
        await executeSql(`DELETE FROM hr_audit_logs WHERE action_type = 'INTEGRATION_TEST'`);
      } catch {
        // Ignore cleanup error if database was not reached
      }
    }
    await closePool();
  });

  it('should verify connection pool state helper', () => {
    strictEqual(typeof isPoolInitialized(), 'boolean');
  });

  it('should test transaction rollback atomicity when an error occurs', async () => {
    if (!env.DATABASE_URL) {
      // If DATABASE_URL is not set in local test environment, skip live test safely
      ok(true, 'Skipped: DATABASE_URL not set');
      return;
    }

    const testDeptName = 'TST_ROLLBACK_' + Date.now().toString().slice(-4);
    let errorThrown = false;

    try {
      await withTransaction(async (client) => {
        await client.query(
          `INSERT INTO hr_departments (department_name, description, is_active) VALUES ($1, $2, TRUE)`,
          [testDeptName, 'Rollback Test Department']
        );
        throw new Error('Simulated failure triggering transaction rollback');
      });
    } catch (err) {
      errorThrown = true;
      strictEqual((err as Error).message, 'Simulated failure triggering transaction rollback');
    }

    ok(errorThrown, 'Transaction block should have thrown an error');

    // Query to confirm the uncommitted row was rolled back
    const verifyResult = await executeSql<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM hr_departments WHERE department_name = $1`,
      [testDeptName]
    );
    const count = parseInt(verifyResult.rows?.[0]?.cnt || '0', 10);
    strictEqual(count, 0, 'Uncommitted insert must be rolled back');
  });

  it('should record and query audit log entries in hr_audit_logs', async () => {
    if (!env.DATABASE_URL) {
      ok(true, 'Skipped: DATABASE_URL not set');
      return;
    }

    const uniqueEntityId = 'ITEST_' + Date.now();
    await auditService.log({
      userId: null,
      actionType: 'INTEGRATION_TEST',
      entityType: 'SYSTEM_VERIFY',
      entityId: uniqueEntityId,
      details: { testPassed: true, dialect: 'PostgreSQL' },
    });

    const result = await executeSql<{
      action_type: string;
      entity_type: string;
      entity_id: string;
      details: { testPassed: boolean; dialect: string };
    }>(
      `SELECT action_type, entity_type, entity_id, details
       FROM hr_audit_logs
       WHERE action_type = 'INTEGRATION_TEST' AND entity_id = $1`,
      [uniqueEntityId]
    );

    ok(result.rows && result.rows.length > 0, 'Audit record should exist in hr_audit_logs');
    const log = result.rows[0];
    strictEqual(log.action_type, 'INTEGRATION_TEST');
    strictEqual(log.entity_type, 'SYSTEM_VERIFY');
    strictEqual(log.entity_id, uniqueEntityId);
    strictEqual(log.details.dialect, 'PostgreSQL');
  });

  it('should prevent duplicate profiles and preserve role on repeated login', async () => {
    if (!env.DATABASE_URL) {
      ok(true, 'Skipped: DATABASE_URL not set');
      return;
    }

    const testUid = `test_uid_${Date.now()}`;
    const testEmail = `user_${Date.now()}@example.com`;

    // First login -> role = 'user'
    const firstLogin = await userService.syncGoogleUser({
      firebaseUid: testUid,
      email: testEmail,
      displayName: 'First Time User',
    });

    strictEqual(firstLogin.firebaseUid, testUid);
    strictEqual(firstLogin.role, 'user');
    strictEqual(firstLogin.accountStatus, 'active');

    // Second login -> preserves role, does not duplicate
    const secondLogin = await userService.syncGoogleUser({
      firebaseUid: testUid,
      email: testEmail,
      displayName: 'First Time User Updated',
    });

    strictEqual(secondLogin.id, firstLogin.id);
    strictEqual(secondLogin.role, 'user');

    // Cleanup
    await executeSql('DELETE FROM app_users WHERE id = $1', [firstLogin.id]);
  });

  it('should enforce strict data isolation between User A and User B workspaces', async () => {
    if (!env.DATABASE_URL) {
      ok(true, 'Skipped: DATABASE_URL not set');
      return;
    }

    const { employeeService } = await import('../../src/services/employee.service');

    // Create User A
    const userA = await userService.syncGoogleUser({
      firebaseUid: `test_usera_${Date.now()}`,
      email: `usera_${Date.now()}@domain.com`,
      displayName: 'User A',
    });

    // Create User B
    const userB = await userService.syncGoogleUser({
      firebaseUid: `test_userb_${Date.now()}`,
      email: `userb_${Date.now()}@domain.com`,
      displayName: 'User B',
    });

    try {
      // 1. User A creates an employee in Workspace A
      const empA = await employeeService.createEmployee(
        {
          employeeCode: `ISO-${Date.now().toString().slice(-4)}A`,
          firstName: 'Alice',
          lastName: 'Smith',
          workEmail: `alice_${Date.now()}@example.com`,
          hireDate: '2026-01-15',
        },
        userA.id
      );
      strictEqual(empA.firstName, 'Alice');

      // 2. User B lists employees -> Workspace B total must be 0 (cannot see User A's employee)
      const listB = await employeeService.listEmployees({ page: 1, limit: 10, sortBy: 'CREATED_AT', sortOrder: 'DESC' }, userB.id);
      const foundInB = listB.data.some(e => e.employeeId === empA.employeeId);
      strictEqual(foundInB, false, 'User B must not see User A employees in employee list');

      // 3. User B attempts direct read of User A employee ID -> must return null
      const directReadByB = await employeeService.getEmployeeById(empA.employeeId, userB.id);
      strictEqual(directReadByB, null, 'User B must receive null when querying User A employee ID');

      // 4. User B attempts update of User A employee ID -> must throw error
      let updateErrorThrown = false;
      try {
        await employeeService.updateEmployee(empA.employeeId, { firstName: 'Hacked' }, userB.id);
      } catch (err) {
        updateErrorThrown = true;
        strictEqual((err as Error).message.includes('not found in your workspace'), true);
      }
      strictEqual(updateErrorThrown, true, 'User B must not be permitted to update User A employee');

      // 5. User A can read and update their own employee
      const readByA = await employeeService.getEmployeeById(empA.employeeId, userA.id);
      strictEqual(readByA?.firstName, 'Alice');
      const updatedByA = await employeeService.updateEmployee(empA.employeeId, { firstName: 'Alice Updated' }, userA.id);
      strictEqual(updatedByA.firstName, 'Alice Updated');

      // Clean up employee
      await executeSql('DELETE FROM hr_employees WHERE employee_id = $1', [empA.employeeId]);
    } finally {
      // Clean up users
      await executeSql('DELETE FROM app_users WHERE id IN ($1, $2)', [userA.id, userB.id]);
    }
  });
});

