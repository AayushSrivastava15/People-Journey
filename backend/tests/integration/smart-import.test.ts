import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as XLSX from 'xlsx';
import { smartImportService } from '../../src/services/smart-import.service.js';
import { importSessionStore } from '../../src/services/import-session.store.js';
import { employeeService } from '../../src/services/employee.service.js';
import { executeSql, closePool } from '../../src/config/database.js';

describe('Smart Employee Import Integration Tests', () => {
  const userA = 'cccccccc-1111-4000-8000-000000000001';
  const userB = 'dddddddd-2222-4000-8000-000000000002';
  const prefix = `IMP${Date.now().toString().slice(-4)}`;

  const existingCode = `${prefix}-EXT`;
  let existingEmpId: number;

  before(async () => {
    // Ensure test users exist
    await executeSql(
      `INSERT INTO app_users (id, firebase_uid, email, display_name, role)
       VALUES 
         ($1, 'fb-imp-a', 'impa@test.local', 'Import User A', 'user'),
         ($2, 'fb-imp-b', 'impb@test.local', 'Import User B', 'user')
       ON CONFLICT (id) DO NOTHING`,
      [userA, userB]
    );

    // Create an existing employee in User A's workspace to test workspace duplicate detection
    const emp = await employeeService.createEmployee(
      {
        employeeCode: existingCode,
        firstName: 'Existing',
        lastName: 'Worker',
        workEmail: `existing.${Date.now()}@workspace.local`,
        employmentStatus: 'ACTIVE',
        hireDate: '2025-01-15',
      },
      userA
    );
    existingEmpId = emp.employeeId;
  });

  after(async () => {
    // Clean up created employees, import history and test users
    await executeSql(`DELETE FROM hr_audit_logs WHERE user_id IN ($1, $2)`, [userA, userB]);
    await executeSql(`DELETE FROM hr_employee_import_history WHERE owner_user_id IN ($1, $2)`, [userA, userB]);
    await executeSql(`DELETE FROM hr_employees WHERE owner_user_id IN ($1, $2)`, [userA, userB]);
    await executeSql(`DELETE FROM app_users WHERE id IN ($1, $2)`, [userA, userB]);
    await closePool();
  });

  function createTestWorkbookBuffer(rows: Record<string, any>[]): Buffer {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Staff List');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  it('1. should detect columns and match aliases from raw Excel headers', async () => {
    const buffer = createTestWorkbookBuffer([
      {
        'Staff ID': `${prefix}-001`,
        'Full Name': 'Alice Springs',
        'Office Email': 'alice@company.local',
        'Dept': 'Engineering',
        'Role': 'Software Engineer',
        'Join Date': '2026-02-01',
        'Current Status': 'Active',
      },
    ]);

    const result = await smartImportService.parseAndDetectColumns(buffer, 'test_staff.xlsx', userA);

    assert.ok(result.session.sessionId);
    assert.strictEqual(result.session.rawRows.length, 1);
    assert.strictEqual(result.detection.detectedHeaders.length, 7);

    // Check alias matching in suggestedMapping
    assert.strictEqual(result.detection.suggestedMapping['Staff ID'], 'employeeCode');
    assert.strictEqual(result.detection.suggestedMapping['Full Name'], 'fullName');
    assert.strictEqual(result.detection.suggestedMapping['Office Email'], 'workEmail');
  });

  it('2. should flag missing employee IDs as NEEDS_ATTENTION and NEVER auto-generate them', async () => {
    const buffer = createTestWorkbookBuffer([
      {
        'Staff ID': '', // Blank employee code
        'Full Name': 'Missing Code Person',
        'Office Email': 'missing@company.local',
        'Join Date': '2026-02-01',
      },
    ]);

    const parsed = await smartImportService.parseAndDetectColumns(buffer, 'missing_id.xlsx', userA);
    const validatedSession = await smartImportService.validateSessionRows(
      parsed.session.sessionId,
      userA,
      parsed.detection.suggestedMapping,
      false
    );

    assert.strictEqual(validatedSession.summary.totalRecords, 1);
    assert.strictEqual(validatedSession.summary.needsAttentionRecords, 1);
    assert.strictEqual(validatedSession.summary.validRecords, 0);

    const row = validatedSession.validatedRows[0];
    assert.strictEqual(row.validationStatus, 'NEEDS_ATTENTION');
    // Ensure code is empty, not auto-generated
    assert.strictEqual(row.mappedData.employeeCode, '');
    assert.ok(row.errors.some(e => e.message.toLowerCase().includes('employee code') || e.message.toLowerCase().includes('employee id')));
  });

  it('3. should detect both in-file duplicates and existing database workspace duplicates', async () => {
    const buffer = createTestWorkbookBuffer([
      {
        'Staff ID': existingCode, // Workspace database duplicate
        'Full Name': 'Clone of Existing',
        'Office Email': 'clone@company.local',
        'Join Date': '2026-02-01',
      },
      {
        'Staff ID': `${prefix}-DUP`, // File duplicate 1
        'Full Name': 'Duplicate One',
        'Office Email': 'dup1@company.local',
        'Join Date': '2026-02-01',
      },
      {
        'Staff ID': `${prefix}-DUP`, // File duplicate 2
        'Full Name': 'Duplicate Two',
        'Office Email': 'dup2@company.local',
        'Join Date': '2026-02-01',
      },
    ]);

    const parsed = await smartImportService.parseAndDetectColumns(buffer, 'duplicates.xlsx', userA);
    const session = await smartImportService.validateSessionRows(
      parsed.session.sessionId,
      userA,
      parsed.detection.suggestedMapping,
      false
    );

    assert.strictEqual(session.summary.totalRecords, 3);
    assert.strictEqual(session.summary.duplicateRecords, 3);

    // Row 1: Workspace duplicate
    assert.strictEqual(session.validatedRows[0].validationStatus, 'DUPLICATE');
    assert.ok(session.validatedRows[0].errors.some(e => e.message.includes('already exists in your workspace')));

    // Row 2 & 3: File duplicates
    assert.strictEqual(session.validatedRows[1].validationStatus, 'DUPLICATE');
    assert.ok(session.validatedRows[1].errors.some(e => e.message.toLowerCase().includes('duplicate employee')));
    assert.strictEqual(session.validatedRows[2].validationStatus, 'DUPLICATE');
    assert.ok(session.validatedRows[2].errors.some(e => e.message.toLowerCase().includes('duplicate employee')));
  });

  it('4. should require Last Working Day for Offboarding and Exit Date for Exited status', async () => {
    const buffer = createTestWorkbookBuffer([
      {
        'Staff ID': `${prefix}-OFF-BAD`,
        'Full Name': 'Bad Offboarding',
        'Office Email': 'offbad@company.local',
        'Join Date': '2025-01-01',
        'Status': 'Offboarding', // Missing lastWorkingDay
      },
      {
        'Staff ID': `${prefix}-OFF-OK`,
        'Full Name': 'Good Offboarding',
        'Office Email': 'offgood@company.local',
        'Join Date': '2025-01-01',
        'Status': 'Offboarding',
        'Last Working Day': '2026-03-31',
      },
      {
        'Staff ID': `${prefix}-EXIT-BAD`,
        'Full Name': 'Bad Exited',
        'Office Email': 'exitbad@company.local',
        'Join Date': '2024-01-01',
        'Status': 'Exited', // Missing exitDate
      },
    ]);

    const parsed = await smartImportService.parseAndDetectColumns(buffer, 'lifecycle.xlsx', userA);
    const session = await smartImportService.validateSessionRows(
      parsed.session.sessionId,
      userA,
      parsed.detection.suggestedMapping,
      false
    );

    const badOff = session.validatedRows.find(r => r.mappedData.employeeCode === `${prefix}-OFF-BAD`);
    assert.ok(badOff);
    assert.strictEqual(badOff.validationStatus, 'NEEDS_ATTENTION');
    assert.ok(badOff.errors.some(e => e.message.toLowerCase().includes('last working day')));

    const goodOff = session.validatedRows.find(r => r.mappedData.employeeCode === `${prefix}-OFF-OK`);
    assert.ok(goodOff);
    assert.strictEqual(goodOff.validationStatus, 'VALID');

    const badExit = session.validatedRows.find(r => r.mappedData.employeeCode === `${prefix}-EXIT-BAD`);
    assert.ok(badExit);
    assert.strictEqual(badExit.validationStatus, 'NEEDS_ATTENTION');
    assert.ok(badExit.errors.some(e => e.message.toLowerCase().includes('exit date')));
  });

  it('5. should allow inline preview editing and re-validation', async () => {
    const buffer = createTestWorkbookBuffer([
      {
        'Staff ID': '', // Missing code initially
        'Full Name': 'Fixable Employee',
        'Office Email': 'fixable@company.local',
        'Join Date': '2026-01-01',
        'Status': 'Active',
      },
    ]);

    const parsed = await smartImportService.parseAndDetectColumns(buffer, 'fixable.xlsx', userA);
    let session = await smartImportService.validateSessionRows(
      parsed.session.sessionId,
      userA,
      parsed.detection.suggestedMapping,
      false
    );

    assert.strictEqual(session.summary.needsAttentionRecords, 1);
    assert.strictEqual(session.summary.validRecords, 0);

    // Update row in session store with an assigned code
    const updatedRow = importSessionStore.updateRow(
      session.sessionId,
      userA,
      session.validatedRows[0].rowIndex,
      { employeeCode: `${prefix}-FIXED` }
    );
    assert.ok(updatedRow);

    // Revalidate
    session = await smartImportService.validateSessionRows(
      session.sessionId,
      userA,
      session.columnMapping,
      false
    );

    assert.strictEqual(session.summary.needsAttentionRecords, 0);
    assert.strictEqual(session.summary.validRecords, 1);
    assert.strictEqual(session.validatedRows[0].validationStatus, 'VALID');
    assert.strictEqual(session.validatedRows[0].mappedData.employeeCode, `${prefix}-FIXED`);
  });

  it('6. should execute batch commit and record import history', async () => {
    const validCode1 = `${prefix}-BATCH-1`;
    const validCode2 = `${prefix}-BATCH-2`;

    const buffer = createTestWorkbookBuffer([
      {
        'Staff ID': validCode1,
        'Full Name': 'Batch Worker One',
        'Office Email': `batch1.${Date.now()}@company.local`,
        'Dept': 'Engineering',
        'Role': 'Backend Dev',
        'Join Date': '2026-01-10',
        'Status': 'Active',
      },
      {
        'Staff ID': validCode2,
        'Full Name': 'Batch Worker Two',
        'Office Email': `batch2.${Date.now()}@company.local`,
        'Dept': 'Design',
        'Role': 'Product Designer',
        'Join Date': '2026-01-12',
        'Status': 'Active',
      },
    ]);

    const parsed = await smartImportService.parseAndDetectColumns(buffer, 'batch_commit.xlsx', userA);
    const session = await smartImportService.validateSessionRows(
      parsed.session.sessionId,
      userA,
      parsed.detection.suggestedMapping,
      false
    );

    assert.strictEqual(session.summary.validRecords, 2);

    // Commit import
    const commitResult = await smartImportService.executeImport(session.sessionId, userA, 'valid_only');
    assert.strictEqual(commitResult.importedCount, 2);
    assert.strictEqual(commitResult.skippedCount, 0);
    assert.strictEqual(commitResult.errorCount, 0);

    // Verify employees exist in database
    const empList = await employeeService.listEmployees({ page: 1, limit: 10, search: prefix }, userA);
    const importedCodes = empList.data.map(e => e.employeeCode);
    assert.ok(importedCodes.includes(validCode1));
    assert.ok(importedCodes.includes(validCode2));

    // Verify import history record
    const history = await smartImportService.listImportHistory(userA);
    assert.ok(history.length >= 1);
    const latestBatch = history[0];
    assert.strictEqual(latestBatch.importedRecords, 2);
    assert.strictEqual(latestBatch.totalRecords, 2);
  });

  it('7. should enforce workspace isolation on session access', async () => {
    const buffer = createTestWorkbookBuffer([
      {
        'Staff ID': `${prefix}-ISO`,
        'Full Name': 'Isolated User',
        'Office Email': 'iso@company.local',
      },
    ]);

    const parsed = await smartImportService.parseAndDetectColumns(buffer, 'iso.xlsx', userA);

    // User B tries to access User A's session -> must return null
    const unauthorizedSession = importSessionStore.getSession(parsed.session.sessionId, userB);
    assert.strictEqual(unauthorizedSession, null);

    // User B tries to update User A's session -> must return null
    const updateAttempt = importSessionStore.updateRow(parsed.session.sessionId, userB, 1, { employeeCode: 'HACK' });
    assert.strictEqual(updateAttempt, null);
  });
});
