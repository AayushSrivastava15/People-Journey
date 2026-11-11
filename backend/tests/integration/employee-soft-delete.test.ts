import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { employeeService } from '../../src/services/employee.service.js';
import { dashboardService } from '../../src/services/dashboard.service.js';
import { executeSql, closePool } from '../../src/config/database.js';

describe('Employee Soft Deletion Integration Tests', () => {
  const userA = 'aaaaaaaa-1111-4000-8000-000000000001';
  const userB = 'bbbbbbbb-2222-4000-8000-000000000002';
  let createdEmployeeId: number;
  const testCode = `TEST-DEL-${Date.now().toString().slice(-4)}`;

  before(async () => {
    // Ensure test users exist in app_users
    await executeSql(
      `INSERT INTO app_users (id, firebase_uid, email, display_name, role)
       VALUES 
         ($1, 'fb-del-a', 'dela@test.local', 'Del User A', 'user'),
         ($2, 'fb-del-b', 'delb@test.local', 'Del User B', 'user')
       ON CONFLICT (id) DO NOTHING`,
      [userA, userB]
    );

    // Create an employee in User A's workspace
    const emp = await employeeService.createEmployee(
      {
        employeeCode: testCode,
        firstName: 'Deletion',
        lastName: 'Candidate',
        workEmail: `del.${Date.now()}@candidate.local`,
        employmentStatus: 'ACTIVE',
        hireDate: '2026-01-15',
      },
      userA
    );
    createdEmployeeId = emp.employeeId;
  });

  after(async () => {
    if (createdEmployeeId) {
      await executeSql(`DELETE FROM hr_audit_logs WHERE entity_id = $1`, [String(createdEmployeeId)]);
      await executeSql(`DELETE FROM hr_employees WHERE employee_id = $1`, [createdEmployeeId]);
    }
    await executeSql(`DELETE FROM app_users WHERE id IN ($1, $2)`, [userA, userB]);
    await closePool();
  });

  it('1. should find the created employee in active listing and stats before deletion', async () => {
    const list = await employeeService.listEmployees({ page: 1, limit: 10, search: testCode }, userA);
    assert.strictEqual(list.total, 1);
    assert.strictEqual(list.data[0].employeeCode, testCode);

    const emp = await employeeService.getEmployeeById(createdEmployeeId, userA);
    assert.ok(emp);
    assert.strictEqual(emp.employeeCode, testCode);

    const stats = await dashboardService.getStats(userA);
    assert.ok(stats.activeEmployees >= 1);
  });

  it('2. should forbid User B from deleting User A employee (workspace isolation)', async () => {
    const deletedByB = await employeeService.deleteEmployee(createdEmployeeId, userB);
    assert.strictEqual(deletedByB, false, 'User B must not be able to delete User A employee');

    // Confirm still active for User A
    const emp = await employeeService.getEmployeeById(createdEmployeeId, userA);
    assert.ok(emp, 'Employee must remain active after unauthorized deletion attempt');
  });

  it('3. should successfully soft-delete employee for User A', async () => {
    const deleted = await employeeService.deleteEmployee(createdEmployeeId, userA);
    assert.strictEqual(deleted, true);

    // Verify raw row in database has deleted_at populated (not permanently dropped)
    const raw = await executeSql<{ employee_id: number; deleted_at: string | null }>(
      `SELECT employee_id, deleted_at FROM hr_employees WHERE employee_id = $1`,
      [createdEmployeeId]
    );
    assert.ok(raw.rows[0]);
    assert.ok(raw.rows[0].deleted_at !== null, 'deleted_at must be populated');
  });

  it('4. should exclude soft-deleted employee from normal list and getEmployeeById', async () => {
    const list = await employeeService.listEmployees({ page: 1, limit: 10, search: testCode }, userA);
    assert.strictEqual(list.total, 0, 'Soft-deleted employee must not appear in normal list');

    const emp = await employeeService.getEmployeeById(createdEmployeeId, userA);
    assert.strictEqual(emp, null, 'getEmployeeById must return null for soft-deleted employee');
  });

  it('5. should record an immutable DELETE_EMPLOYEE action in hr_audit_logs', async () => {
    const auditRes = await executeSql<{ action_type: string; entity_id: string }>(
      `SELECT action_type, entity_id FROM hr_audit_logs 
       WHERE entity_id = $1 AND action_type = 'DELETE_EMPLOYEE' AND user_id = $2`,
      [String(createdEmployeeId), userA]
    );
    assert.ok((auditRes.rows || []).length > 0, 'Audit record must be logged');
    assert.strictEqual(auditRes.rows[0].action_type, 'DELETE_EMPLOYEE');
  });
});

