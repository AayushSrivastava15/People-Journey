import { describe, it, after } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { executeSql, withTransaction, closePool } from '../../src/config/database';
import { auditService } from '../../src/services/audit.service';
import { masterService } from '../../src/services/master.service';
import { dashboardService } from '../../src/services/dashboard.service';

describe('Oracle Database Free Integration Tests', () => {
  after(async () => {
    // Clean up any test records and close the Oracle connection pool
    try {
      await executeSql(`DELETE FROM HR_AUDIT_LOGS WHERE ACTION_TYPE = 'INTEGRATION_TEST'`);
    } catch {
      // Ignore cleanup error if table was untouched
    }
    await closePool();
  });

  it('should verify transaction rollback when an error occurs inside withTransaction', async () => {
    const testDeptName = 'TST_ROLLBACK_' + Date.now().toString().slice(-4);

    let errorThrown = false;
    try {
      await withTransaction(async (conn) => {
        await conn.execute(
          `INSERT INTO HR_DEPARTMENTS (DEPARTMENT_NAME, DESCRIPTION, IS_ACTIVE) VALUES (:name, :description, 'Y')`,
          { name: testDeptName, description: 'Rollback Test Department' }
        );
        // Simulate failure midway through the transaction
        throw new Error('Simulated failure triggering rollback');
      });
    } catch (err) {
      errorThrown = true;
      strictEqual((err as Error).message, 'Simulated failure triggering rollback');
    }

    ok(errorThrown, 'Transaction block should have thrown an error');

    // Query to confirm the uncommitted row was indeed rolled back
    const verifyResult = await executeSql<{ CNT: number }>(
      `SELECT COUNT(*) AS CNT FROM HR_DEPARTMENTS WHERE DEPARTMENT_NAME = :name`,
      { name: testDeptName }
    );
    const count = Number(verifyResult.rows?.[0]?.CNT || 0);
    strictEqual(count, 0, 'Uncommitted insert must be rolled back');
  });

  it('should successfully record and query an entry in HR_AUDIT_LOGS', async () => {
    const uniqueEntityId = 'ITEST_' + Date.now();

    await auditService.log({
      hrUserId: null,
      actionType: 'INTEGRATION_TEST',
      entityType: 'SYSTEM_VERIFY',
      entityId: uniqueEntityId,
      details: { environment: 'Debian Home Server', testPassed: true },
    });

    const result = await executeSql<{
      ACTION_TYPE: string;
      ENTITY_TYPE: string;
      ENTITY_ID: string;
      DETAILS: string;
    }>(
      `SELECT ACTION_TYPE, ENTITY_TYPE, ENTITY_ID, DETAILS 
       FROM HR_AUDIT_LOGS 
       WHERE ACTION_TYPE = 'INTEGRATION_TEST' AND ENTITY_ID = :eid`,
      { eid: uniqueEntityId }
    );

    ok(result.rows && result.rows.length > 0, 'Audit record should exist in HR_AUDIT_LOGS');
    const log = result.rows[0];
    strictEqual(log.ACTION_TYPE, 'INTEGRATION_TEST');
    strictEqual(log.ENTITY_TYPE, 'SYSTEM_VERIFY');
    strictEqual(log.ENTITY_ID, uniqueEntityId);
    ok(log.DETAILS.includes('Debian Home Server'), 'Details column should contain JSON payload');
  });

  it('should retrieve departments and designations from Oracle master tables', async () => {
    const departments = await masterService.getDepartments();
    ok(Array.isArray(departments), 'Departments should return an array');
    ok(departments.length > 0, 'At least one default department should be present');

    const designations = await masterService.getDesignations();
    ok(Array.isArray(designations), 'Designations should return an array');
    ok(designations.length > 0, 'At least one default designation should be present');
  });

  it('should aggregate live KPI metrics and distributions via dashboardService', async () => {
    const stats = await dashboardService.getStats();

    strictEqual(typeof stats.totalEmployees, 'number');
    strictEqual(typeof stats.activeEmployees, 'number');
    strictEqual(typeof stats.onboardingEmployees, 'number');
    strictEqual(typeof stats.offboardingEmployees, 'number');
    strictEqual(typeof stats.exitedEmployees, 'number');
    strictEqual(typeof stats.joiningThisMonth, 'number');
    strictEqual(typeof stats.upcomingJoiners, 'number');
    strictEqual(typeof stats.upcomingExits, 'number');

    ok(Array.isArray(stats.statusDistribution), 'statusDistribution should be an array');
    ok(Array.isArray(stats.departmentBreakdown), 'departmentBreakdown should be an array');
    ok(Array.isArray(stats.monthlyActivity), 'monthlyActivity should be an array');
    ok(Array.isArray(stats.upcomingEvents), 'upcomingEvents should be an array');
    strictEqual(stats.monthlyActivity.length, 6, 'Monthly activity should cover 6 months');
  });
});
