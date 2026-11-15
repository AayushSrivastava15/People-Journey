import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { employeeService } from '../../src/services/employee.service.js';
import { executeSql, closePool } from '../../src/config/database.js';

describe('Employee UUID Unique Resource System Integration Tests', () => {
  const userA = 'aaaaaaaa-1111-4000-8000-000000000010';
  const userB = 'bbbbbbbb-2222-4000-8000-000000000020';
  let createdEmployeeId: number;
  let createdUuid: string;
  const testCode = `UUID-TEST-${Date.now().toString().slice(-4)}`;

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  before(async () => {
    // Ensure test workspace users exist
    await executeSql(
      `INSERT INTO app_users (id, firebase_uid, email, display_name, role)
       VALUES 
         ($1, 'fb-uuid-a', 'uuid-a@test.local', 'UUID User A', 'user'),
         ($2, 'fb-uuid-b', 'uuid-b@test.local', 'UUID User B', 'user')
       ON CONFLICT (id) DO NOTHING`,
      [userA, userB]
    );

    // Create an employee in User A's workspace
    const emp = await employeeService.createEmployee(
      {
        employeeCode: testCode,
        firstName: 'Devon',
        lastName: 'Archer',
        workEmail: `devon.${Date.now()}@test.local`,
        employmentStatus: 'ACTIVE',
        hireDate: '2026-02-10',
      },
      userA
    );
    createdEmployeeId = emp.employeeId;
    assert.ok(emp.uuid, 'Created employee must have a uuid');
    createdUuid = emp.uuid;
  });

  after(async () => {
    if (createdEmployeeId) {
      await executeSql(`DELETE FROM hr_audit_logs WHERE entity_id = $1`, [String(createdEmployeeId)]);
      await executeSql(`DELETE FROM hr_employees WHERE employee_id = $1`, [createdEmployeeId]);
    }
    await executeSql(`DELETE FROM app_users WHERE id IN ($1, $2)`, [userA, userB]);
    await closePool();
  });

  it('1. should automatically generate and persist a valid UUIDv4 for new employees', async () => {
    assert.ok(createdUuid, 'UUID should be populated');
    assert.ok(UUID_REGEX.test(createdUuid), `UUID "${createdUuid}" must match standard UUID format`);
  });

  it('2. should fetch employee by UUID string in workspace', async () => {
    const fetched = await employeeService.getEmployeeById(createdUuid, userA);
    assert.ok(fetched, 'Employee must be retrievable by UUID');
    assert.strictEqual(fetched.employeeId, createdEmployeeId);
    assert.strictEqual(fetched.uuid, createdUuid);
    assert.strictEqual(fetched.employeeCode, testCode);
  });

  it('3. should fetch employee by numeric ID for backward compatibility', async () => {
    const fetched = await employeeService.getEmployeeById(createdEmployeeId, userA);
    assert.ok(fetched, 'Employee must be retrievable by numeric ID');
    assert.strictEqual(fetched.employeeId, createdEmployeeId);
    assert.strictEqual(fetched.uuid, createdUuid);
  });

  it('4. should prevent IDOR: User B cannot access User A employee even with valid UUID', async () => {
    const fetched = await employeeService.getEmployeeById(createdUuid, userB);
    assert.strictEqual(fetched, null, 'User B must not be able to retrieve User A employee by UUID');
  });

  it('5. should keep UUID immutable across profile updates', async () => {
    const updated = await employeeService.updateEmployee(
      createdUuid,
      {
        phone: '+1 555-0199',
        personalEmail: 'devon.personal@test.local',
      },
      userA
    );

    assert.strictEqual(updated.uuid, createdUuid, 'UUID must remain identical after update');
    assert.strictEqual(updated.phone, '+1 555-0199');
    assert.strictEqual(updated.personalEmail, 'devon.personal@test.local');

    // Confirm database state
    const directRes = await executeSql<{ uuid: string }>(
      `SELECT uuid FROM hr_employees WHERE employee_id = $1`,
      [createdEmployeeId]
    );
    assert.strictEqual(directRes.rows?.[0]?.uuid, createdUuid);
  });

  it('6. should soft-delete employee using UUID identifier', async () => {
    const deleted = await employeeService.deleteEmployee(createdUuid, userA);
    assert.strictEqual(deleted, true, 'Soft-delete by UUID must return true');

    // Trying to fetch deleted employee should now return null
    const fetchedAfterDelete = await employeeService.getEmployeeById(createdUuid, userA);
    assert.strictEqual(fetchedAfterDelete, null, 'Deleted employee must not be returned in normal lookup');

    // Database row still exists with deleted_at timestamp
    const rawRes = await executeSql<{ deleted_at: string }>(
      `SELECT deleted_at FROM hr_employees WHERE employee_id = $1`,
      [createdEmployeeId]
    );
    assert.ok(rawRes.rows?.[0]?.deleted_at, 'Row should have deleted_at timestamp');
  });
});
