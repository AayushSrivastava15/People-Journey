import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as XLSX from 'xlsx';
import { smartImportService } from '../../src/services/smart-import.service.js';
import { importSessionStore } from '../../src/services/import-session.store.js';
import { executeSql, closePool } from '../../src/config/database.js';

describe('Excel Import Row Deletion & Data Corruption Regression Tests (10 Critical Scenarios)', () => {
  const testUserId = 'cccccccc-3333-4000-8000-000000000003';
  let testWorkbookBuffer: Buffer;

  before(async () => {
    await executeSql(
      `INSERT INTO app_users (id, firebase_uid, email, display_name, role)
       VALUES ($1, 'fb-excel-delete-tester', 'excel-delete@test.local', 'Excel Delete Tester', 'user')
       ON CONFLICT (id) DO NOTHING`,
      [testUserId]
    );

    // Build a realistic synthetic workbook matching the user's reproduction structure:
    // - Total 258 rows in Employee MIS
    // - Row 173 is Saumya (PJ-173)
    // - 163 valid rows, 95 needs attention rows (e.g. missing name or invalid email)
    // - Multi-sheet: Employee MIS, Third Party MIS, Resignation Tracker
    const wb = XLSX.utils.book_new();

    // Sheet 1: Employee MIS (258 data rows)
    const misData: any[][] = [
      ['Employee Code', 'Full Name', 'Email', 'Contact Number', 'Department', 'Designation', 'Location', 'Status', 'Joining Date'],
    ];

    for (let i = 1; i <= 258; i++) {
      if (i === 173) {
        misData.push([
          'PJ-173',
          'Saumya',
          'saumya@company.local',
          '9876543210',
          'Engineering',
          'Software Engineer',
          'Noida',
          'Active',
          '2024-01-15',
        ]);
      } else if (i <= 164) {
        // Valid records (163 of them, plus Saumya = 164)
        misData.push([
          `PJ-${String(i).padStart(4, '0')}`,
          `Employee ${i}`,
          `emp${i}@company.local`,
          `987650${String(i).padStart(4, '0')}`,
          i % 2 === 0 ? 'Engineering' : 'Human Resources',
          i % 2 === 0 ? 'Software Engineer' : 'HR Specialist',
          'Bengaluru',
          'Active',
          '2023-05-10',
        ]);
      } else {
        // Needs attention records (missing email or invalid email to require attention)
        misData.push([
          `PJ-${String(i).padStart(4, '0')}`,
          `Employee Needs Attention ${i}`,
          'invalid-email-address', // triggers validation error
          '',
          'Operations',
          'Operations Associate',
          'Mumbai',
          'Active',
          '2023-08-01',
        ]);
      }
    }

    const wsMis = XLSX.utils.aoa_to_sheet(misData);
    XLSX.utils.book_append_sheet(wb, wsMis, 'Employee MIS');

    // Sheet 2: Third Party MIS
    const thirdPartyData = [
      ['Worker Ref', 'Worker Name', 'Vendor', 'Site', 'Status'],
      ['TP-901', 'Contractor One', 'Apex Staffing', 'Noida', 'Active'],
      ['TP-902', 'Contractor Two', 'Apex Staffing', 'Gurugram', 'Active'],
    ];
    const wsThirdParty = XLSX.utils.aoa_to_sheet(thirdPartyData);
    XLSX.utils.book_append_sheet(wb, wsThirdParty, 'Third Party MIS');

    // Sheet 3: Resignation Tracker
    const resignationData = [
      ['Emp Code', 'Name', 'Resignation Date', 'Last Working Day', 'Exit Reason'],
      ['PJ-0002', 'Employee 2', '2025-01-10', '2025-02-28', 'Better Opportunity'],
      ['HIST-801', 'Historical Departed Staff', '2023-01-15', '2023-03-31', 'Personal Reasons'],
    ];
    const wsResignation = XLSX.utils.aoa_to_sheet(resignationData);
    XLSX.utils.book_append_sheet(wb, wsResignation, 'Resignation Tracker');

    testWorkbookBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  });

  after(async () => {
    await executeSql(`DELETE FROM hr_audit_logs WHERE user_id = $1`, [testUserId]);
    await executeSql(`DELETE FROM hr_employee_import_history WHERE owner_user_id = $1`, [testUserId]);
    await executeSql(`DELETE FROM hr_employees WHERE owner_user_id = $1`, [testUserId]);
    await executeSql(`DELETE FROM app_users WHERE id = $1`, [testUserId]);
    await closePool();
  });

  it('Test 1: Delete one valid record (Saumya, Row 173) without corrupting remaining workbook data', async () => {
    const parsed = await smartImportService.parseAndDetectColumns(
      testWorkbookBuffer,
      'Test_Workbook.xlsx',
      testUserId
    );
    const sessionId = parsed.session.sessionId;
    const session = importSessionStore.getSession(sessionId, testUserId)!;

    // Verify initial state
    const initialTotal = session.validatedRows.length;
    assert.ok(initialTotal >= 258, `Initial records must be at least 258, got ${initialTotal}`);
    
    // Find Saumya (PJ-173)
    const saumyaRow = session.validatedRows.find(r => r.mappedData.employeeCode === 'PJ-173');
    assert.ok(saumyaRow, 'Saumya (PJ-173) must exist in initial extraction');
    assert.strictEqual(saumyaRow.mappedData.fullName, 'Saumya');
    assert.strictEqual(saumyaRow.mappedData.department, 'Engineering');
    assert.strictEqual(saumyaRow.mappedData.workEmail, 'saumya@company.local');

    // Also pick control rows before and after Saumya
    const controlRowBefore = session.validatedRows.find(r => r.mappedData.employeeCode === 'PJ-0001')!;
    const controlRowAfter = session.validatedRows.find(r => r.mappedData.employeeCode === 'PJ-0200')!;
    assert.ok(controlRowBefore, 'Control row PJ-0001 must exist');
    assert.ok(controlRowAfter, 'Control row PJ-0200 must exist');

    const initialSummary = { ...session.summary };

    // ACTION: Delete Saumya using stable rowId or rowIndex
    const deleted = importSessionStore.deleteRow(sessionId, testUserId, saumyaRow.rowId || saumyaRow.rowIndex);
    assert.ok(deleted, 'deleteRow must return deleted row');
    assert.strictEqual(deleted.mappedData.employeeCode, 'PJ-173');

    // Revalidate remaining rows in-memory (controller behaviour)
    smartImportService.revalidateActiveSessionRows(session);

    // VERIFY POST-DELETION INTEGRITY:
    // 1. Total records must decrease by exactly 1
    assert.strictEqual(session.validatedRows.length, initialTotal - 1, 'Total records must decrease by exactly 1');
    assert.strictEqual(session.summary.totalRecords, initialTotal - 1);

    // 2. Saumya must NOT be present
    const findSaumya = session.validatedRows.find(r => r.mappedData.employeeCode === 'PJ-173');
    assert.strictEqual(findSaumya, undefined, 'Deleted employee Saumya must not exist');

    // 3. ZERO DATA CORRUPTION on remaining records:
    for (const row of session.validatedRows) {
      assert.notStrictEqual(row.mappedData.employeeCode, '', 'No employee code should become blank or empty');
      assert.notStrictEqual(row.mappedData.employeeCode, 'Missing Code', 'No employee code should become "Missing Code"');
      assert.notStrictEqual(row.mappedData.fullName, '', 'No employee name should become empty');
      assert.notStrictEqual(row.mappedData.fullName, '—', 'No employee name should become "—"');
    }

    // 4. Control rows must retain exact original values
    const checkBefore = session.validatedRows.find(r => r.mappedData.employeeCode === 'PJ-0001')!;
    assert.strictEqual(checkBefore.mappedData.fullName, controlRowBefore.mappedData.fullName);
    assert.strictEqual(checkBefore.mappedData.workEmail, controlRowBefore.mappedData.workEmail);
    assert.strictEqual(checkBefore.mappedData.department, controlRowBefore.mappedData.department);

    const checkAfter = session.validatedRows.find(r => r.mappedData.employeeCode === 'PJ-0200')!;
    assert.strictEqual(checkAfter.mappedData.fullName, controlRowAfter.mappedData.fullName);
    assert.strictEqual(checkAfter.mappedData.department, controlRowAfter.mappedData.department);

    // 5. Valid count decreased by 1 (since Saumya was valid)
    assert.strictEqual(session.summary.validRecords, initialSummary.validRecords - 1);
    // Needs attention count must remain identical
    assert.strictEqual(session.summary.needsAttentionRecords, initialSummary.needsAttentionRecords);
  });

  it('Test 2: Delete one invalid record from Needs Attention', async () => {
    const parsed = await smartImportService.parseAndDetectColumns(testWorkbookBuffer, 'Test2.xlsx', testUserId);
    const session = importSessionStore.getSession(parsed.session.sessionId, testUserId)!;

    const invalidRow = session.validatedRows.find(r => r.validationStatus === 'NEEDS_ATTENTION')!;
    assert.ok(invalidRow, 'An invalid row must exist');
    const invalidCode = invalidRow.mappedData.employeeCode;
    const initialValidCount = session.summary.validRecords;
    const initialAttentionCount = session.summary.needsAttentionRecords;

    // Delete the invalid row
    const deleted = importSessionStore.deleteRow(session.sessionId, testUserId, invalidRow.rowId || invalidRow.rowIndex);
    assert.ok(deleted);
    smartImportService.revalidateActiveSessionRows(session);

    // Valid records must remain unchanged
    assert.strictEqual(session.summary.validRecords, initialValidCount, 'Valid records count must not change');
    // Needs attention must decrease by 1
    assert.strictEqual(session.summary.needsAttentionRecords, initialAttentionCount - 1);
    // Deleted record is gone
    assert.strictEqual(session.validatedRows.some(r => r.mappedData.employeeCode === invalidCode), false);
  });

  it('Test 3: Delete from filtered results and verify tabs consistency', async () => {
    const parsed = await smartImportService.parseAndDetectColumns(testWorkbookBuffer, 'Test3.xlsx', testUserId);
    const session = importSessionStore.getSession(parsed.session.sessionId, testUserId)!;

    const needsAttentionList = session.validatedRows.filter(r => r.validationStatus === 'NEEDS_ATTENTION');
    const targetToDelete = needsAttentionList[0];

    const deleted = importSessionStore.deleteRow(session.sessionId, testUserId, targetToDelete.rowId || targetToDelete.rowIndex);
    assert.ok(deleted);
    smartImportService.revalidateActiveSessionRows(session);

    // Switching tabs (filtering)
    const validFiltered = session.validatedRows.filter(r => r.validationStatus === 'VALID');
    const attentionFiltered = session.validatedRows.filter(r => r.validationStatus === 'NEEDS_ATTENTION');

    assert.strictEqual(validFiltered.length, session.summary.validRecords);
    assert.strictEqual(attentionFiltered.length, session.summary.needsAttentionRecords);
    assert.strictEqual(validFiltered.length + attentionFiltered.length, session.validatedRows.length);
  });

  it('Test 4: Delete from a later page using stable rowId', async () => {
    const parsed = await smartImportService.parseAndDetectColumns(testWorkbookBuffer, 'Test4.xlsx', testUserId);
    const session = importSessionStore.getSession(parsed.session.sessionId, testUserId)!;

    // Page 5 with limit 10 corresponds to rows at offset 40-49
    const limit = 10;
    const page5Target = session.validatedRows[45];
    assert.ok(page5Target);
    const targetId = page5Target.rowId;
    const targetCode = page5Target.mappedData.employeeCode;

    // Delete using stable rowId string
    const deleted = importSessionStore.deleteRow(session.sessionId, testUserId, targetId);
    assert.ok(deleted);
    assert.strictEqual(deleted.mappedData.employeeCode, targetCode);

    smartImportService.revalidateActiveSessionRows(session);

    // Check pagination calculation
    const totalRemaining = session.validatedRows.length;
    const totalPages = Math.ceil(totalRemaining / limit);
    assert.ok(totalPages >= 5, 'Should still have 5 or more pages');

    // Target must not exist in any page
    assert.strictEqual(session.validatedRows.some(r => r.rowId === targetId), false);
  });

  it('Test 5: Edit then delete preserves edited values on unaffected records', async () => {
    const parsed = await smartImportService.parseAndDetectColumns(testWorkbookBuffer, 'Test5.xlsx', testUserId);
    const session = importSessionStore.getSession(parsed.session.sessionId, testUserId)!;

    const rowToEdit = session.validatedRows[0];
    const rowToDelete = session.validatedRows[1];

    // Edit row 0
    importSessionStore.updateRow(session.sessionId, testUserId, rowToEdit.rowId || rowToEdit.rowIndex, {
      fullName: 'Aarav Mehta Senior VP',
      department: 'Executive Board',
    });

    // Delete row 1
    importSessionStore.deleteRow(session.sessionId, testUserId, rowToDelete.rowId || rowToDelete.rowIndex);
    smartImportService.revalidateActiveSessionRows(session);

    // Verify rowToEdit kept its manual edit
    const refreshedEditRow = session.validatedRows.find(r => r.rowId === rowToEdit.rowId)!;
    assert.ok(refreshedEditRow);
    assert.strictEqual(refreshedEditRow.mappedData.fullName, 'Aarav Mehta Senior VP');
    assert.strictEqual(refreshedEditRow.mappedData.department, 'Executive Board');
    assert.strictEqual(refreshedEditRow.isEdited, true);

    // Verify rowToDelete is gone
    assert.strictEqual(session.validatedRows.some(r => r.rowId === rowToDelete.rowId), false);
  });

  it('Test 6: Multiple sheets - deleting a row from one sheet leaves other sheets intact', async () => {
    const parsed = await smartImportService.parseAndDetectColumns(testWorkbookBuffer, 'Test6.xlsx', testUserId);
    const session = importSessionStore.getSession(parsed.session.sessionId, testUserId)!;

    // Ensure third-party records exist from Sheet 2
    const tpRow = session.validatedRows.find(r => r.isThirdParty === true)!;
    assert.ok(tpRow, 'Third party row must exist');
    const tpVendor = tpRow.vendor;

    // Delete a regular employee from Sheet 1
    const regularRow = session.validatedRows.find(r => !r.isThirdParty && !r.isHistorical)!;
    importSessionStore.deleteRow(session.sessionId, testUserId, regularRow.rowId || regularRow.rowIndex);
    smartImportService.revalidateActiveSessionRows(session);

    // Verify third party row remains completely unchanged
    const refreshedTp = session.validatedRows.find(r => r.rowId === tpRow.rowId)!;
    assert.ok(refreshedTp, 'Third party row must remain');
    assert.strictEqual(refreshedTp.isThirdParty, true);
    assert.strictEqual(refreshedTp.vendor, tpVendor);
    assert.strictEqual(refreshedTp.mappedData.employeeCode, tpRow.mappedData.employeeCode);
  });

  it('Test 7: Historical exits - delete historical record while preserving approval rules', async () => {
    const parsed = await smartImportService.parseAndDetectColumns(testWorkbookBuffer, 'Test7.xlsx', testUserId);
    const session = importSessionStore.getSession(parsed.session.sessionId, testUserId)!;

    const histRows = session.validatedRows.filter(r => r.reconciliationType === 'HISTORICAL_EXIT');
    assert.ok(histRows.length >= 1, 'Historical exit row must be present');
    const histTarget = histRows[0];

    // Ensure approval is false by default
    assert.strictEqual(histTarget.approvedForImport, false, 'Historical records must require explicit approval');

    // Delete this historical exit record
    const deleted = importSessionStore.deleteRow(session.sessionId, testUserId, histTarget.rowId || histTarget.rowIndex);
    assert.ok(deleted);
    smartImportService.revalidateActiveSessionRows(session);

    assert.strictEqual(session.validatedRows.some(r => r.rowId === histTarget.rowId), false);
  });

  it('Test 8: Third-party MIS - delete one third-party record while preserving third-party classifications', async () => {
    const parsed = await smartImportService.parseAndDetectColumns(testWorkbookBuffer, 'Test8.xlsx', testUserId);
    const session = importSessionStore.getSession(parsed.session.sessionId, testUserId)!;

    const tpRows = session.validatedRows.filter(r => r.isThirdParty === true);
    assert.strictEqual(tpRows.length, 2, 'Should have 2 third-party rows from sheet 2');

    const tpToDelete = tpRows[0];
    const tpToKeep = tpRows[1];

    importSessionStore.deleteRow(session.sessionId, testUserId, tpToDelete.rowId || tpToDelete.rowIndex);
    smartImportService.revalidateActiveSessionRows(session);

    // Remaining third party record must retain classification and vendor
    const remainingTp = session.validatedRows.find(r => r.rowId === tpToKeep.rowId)!;
    assert.ok(remainingTp);
    assert.strictEqual(remainingTp.isThirdParty, true);
    assert.strictEqual(remainingTp.mappedData.employeeCode, 'TP-902');
    assert.strictEqual(remainingTp.vendor, 'Apex Staffing');
  });

  it('Test 9: Final confirmation - deleted record is never inserted into database', async () => {
    const parsed = await smartImportService.parseAndDetectColumns(testWorkbookBuffer, 'Test9.xlsx', testUserId);
    const session = importSessionStore.getSession(parsed.session.sessionId, testUserId)!;

    // Approve only 2 rows to keep DB batch insert fast and focused
    for (const r of session.validatedRows) {
      r.approvedForImport = false;
    }
    const approvedRow1 = session.validatedRows.find(r => r.mappedData.employeeCode === 'PJ-0001')!;
    approvedRow1.approvedForImport = true;

    // Target to delete: PJ-0005
    const rowToDelete = session.validatedRows.find(r => r.mappedData.employeeCode === 'PJ-0005')!;
    assert.ok(rowToDelete);
    importSessionStore.deleteRow(session.sessionId, testUserId, rowToDelete.rowId || rowToDelete.rowIndex);
    smartImportService.revalidateActiveSessionRows(session);

    // Commit approved valid rows
    const commitRes = await smartImportService.executeImport(session.sessionId, testUserId, 'valid_only');
    assert.strictEqual(commitRes.importedCount, 1, 'Only the 1 approved record should be committed');

    // Verify in PostgreSQL that PJ-0001 was imported, and PJ-0005 was NOT imported
    const dbCheckImported = await executeSql(
      `SELECT employee_code FROM hr_employees WHERE owner_user_id = $1 AND employee_code = 'PJ-0001'`,
      [testUserId],
      { userId: testUserId, role: 'user' }
    );
    assert.strictEqual(dbCheckImported.rows.length, 1, 'Approved employee PJ-0001 must be inserted');

    const dbCheckDeleted = await executeSql(
      `SELECT employee_code FROM hr_employees WHERE owner_user_id = $1 AND employee_code = 'PJ-0005'`,
      [testUserId],
      { userId: testUserId, role: 'user' }
    );
    assert.strictEqual(dbCheckDeleted.rows.length, 0, 'Deleted employee PJ-0005 must NEVER be inserted into database');
  });

  it('Test 10: Re-extraction in a new import session parses clean workbook without leaked delete state', async () => {
    // Session A: Upload and delete Saumya
    const parsedA = await smartImportService.parseAndDetectColumns(testWorkbookBuffer, 'SessionA.xlsx', testUserId);
    const saumya = parsedA.session.validatedRows.find(r => r.mappedData.employeeCode === 'PJ-173')!;
    importSessionStore.deleteRow(parsedA.session.sessionId, testUserId, saumya.rowId || saumya.rowIndex);

    // Session B: Fresh upload of same workbook
    const parsedB = await smartImportService.parseAndDetectColumns(testWorkbookBuffer, 'SessionB.xlsx', testUserId);
    const sessionB = importSessionStore.getSession(parsedB.session.sessionId, testUserId)!;

    // Saumya must be present in Session B with full employee info
    const saumyaB = sessionB.validatedRows.find(r => r.mappedData.employeeCode === 'PJ-173');
    assert.ok(saumyaB, 'Fresh session must cleanly extract Saumya without leaked delete state');
    assert.strictEqual(saumyaB.mappedData.fullName, 'Saumya');
    assert.strictEqual(saumyaB.mappedData.workEmail, 'saumya@company.local');
    assert.strictEqual(saumyaB.mappedData.department, 'Engineering');
  });
});
