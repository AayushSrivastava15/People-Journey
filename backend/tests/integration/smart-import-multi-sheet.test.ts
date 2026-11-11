import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import { smartImportService } from '../../src/services/smart-import.service.js';
import { excelSheetAnalyzer } from '../../src/services/excel-sheet-analyzer.js';
import { importSessionStore } from '../../src/services/import-session.store.js';
import { executeSql, closePool } from '../../src/config/database.js';

describe('Smart Employee Import Multi-Sheet & Editable Preview Integration Tests', () => {
  const userA = 'eeeeeeee-1111-4000-8000-000000000001';
  const sampleWorkbookPath = 'C:\\Users\\aayus\\Downloads\\People_Journey_Sample_HR_Import_Test_Workbook.xlsx';

  before(async () => {
    await executeSql(
      `INSERT INTO app_users (id, firebase_uid, email, display_name, role)
       VALUES ($1, 'fb-multisheet-a', 'multisheet@test.local', 'MultiSheet User A', 'user')
       ON CONFLICT (id) DO NOTHING`,
      [userA]
    );
  });

  after(async () => {
    await executeSql(`DELETE FROM hr_audit_logs WHERE user_id = $1`, [userA]);
    await executeSql(`DELETE FROM hr_employee_import_history WHERE owner_user_id = $1`, [userA]);
    await executeSql(`DELETE FROM hr_employees WHERE owner_user_id = $1`, [userA]);
    await executeSql(`DELETE FROM app_users WHERE id = $1`, [userA]);
    await closePool();
  });

  it('1. should scan candidate rows and accurately isolate table headers from title/instruction banners', () => {
    const grid = [
      ['Acme Global Corporation | Internal Headcount Report'],
      ['Confidential HR data. Synthetic test dataset for import validation.'],
      ['Employee Code', 'Full Name', 'Department', 'Role', 'Joining Date', 'Status'],
      ['ACM-101', 'Alice Vance', 'Engineering', 'Staff Engineer', '2025-01-15', 'Active'],
      ['ACM-102', 'Bob Builder', 'Operations', 'Operations Lead', '2025-03-01', 'Active'],
    ];

    const detection = excelSheetAnalyzer.detectHeaderRow(grid);
    assert.strictEqual(detection.headerRowIndex, 3, 'Detected header must be Row 3, ignoring rows 1 & 2');
    assert.deepStrictEqual(detection.detectedHeaders, [
      'Employee Code',
      'Full Name',
      'Department',
      'Role',
      'Joining Date',
      'Status',
    ]);
    assert.strictEqual(detection.isLowConfidence, false);
    assert.ok(detection.confidence > 0.85);
  });

  it('2. should correctly classify worksheet categories based on name and headers', () => {
    // Regular employees
    const reg = excelSheetAnalyzer.classifySheet('Employee MIS', ['Employee Code', 'Name', 'DOJ', 'Role']);
    assert.strictEqual(reg.category, 'REGULAR_EMPLOYEES');
    assert.strictEqual(reg.importable, true);

    // Third party workforce
    const tp = excelSheetAnalyzer.classifySheet('Third Party MIS', ['Worker Name', 'Site', 'Worker Ref', 'Vendor']);
    assert.strictEqual(tp.category, 'THIRD_PARTY');
    assert.strictEqual(tp.importable, true);

    // Resignation tracker
    const res = excelSheetAnalyzer.classifySheet('Resignation Tracker', ['Emp Code', 'Resignation Date', 'Last Working Day']);
    assert.strictEqual(res.category, 'RESIGNATION_TRACKER');
    assert.strictEqual(res.importable, true);

    // Retention tracker
    const ret = excelSheetAnalyzer.classifySheet('Retention Tracker', ['Employee Code', 'Resignation Status', 'Withdrawal Date']);
    assert.strictEqual(ret.category, 'RETENTION_TRACKER');
    assert.strictEqual(ret.importable, true);

    // Transfer
    const trf = excelSheetAnalyzer.classifySheet('Transfer', ['Employee Code', 'Transferred From', 'Transferred To']);
    assert.strictEqual(trf.category, 'TRANSFER');
    assert.strictEqual(trf.importable, true);

    // Recruitment Onboarding
    const rec = excelSheetAnalyzer.classifySheet('Recruitment Master', ['Req ID', 'Candidate', 'Stage']);
    assert.strictEqual(rec.category, 'RECRUITMENT');
    assert.strictEqual(rec.importable, true);

    // Ignored sheets
    const readme = excelSheetAnalyzer.classifySheet('Read Me', ['Purpose', 'Suggested workflow']);
    assert.strictEqual(readme.category, 'IGNORE');
    assert.strictEqual(readme.importable, false);

    const dash = excelSheetAnalyzer.classifySheet('Dashboard', ['Metric', 'Value']);
    assert.strictEqual(dash.category, 'IGNORE');
    assert.strictEqual(dash.importable, false);

    const closed = excelSheetAnalyzer.classifySheet('closed position', ['Position ID', 'Role', 'Department']);
    assert.strictEqual(closed.category, 'IGNORE');
    assert.strictEqual(closed.importable, false);
  });

  it('3. should process the test workbook and automatically reconcile in 1 step upon upload', async () => {
    if (!fs.existsSync(sampleWorkbookPath)) {
      return;
    }

    const buffer = fs.readFileSync(sampleWorkbookPath);
    const parsed = await smartImportService.parseAndDetectColumns(
      buffer,
      'People_Journey_Sample_HR_Import_Test_Workbook.xlsx',
      userA
    );

    assert.ok(parsed.session.sessionId);
    assert.strictEqual(parsed.sheets.length, 10, 'Workbook should have 10 sheets');

    // Confirm that session is already validated on upload (3-stage flow)
    const session = parsed.session;
    assert.ok(session.validatedRows.length > 0, 'Rows should be pre-validated upon upload');
    assert.strictEqual(session.summary.totalRecords, 50);

    // 1. Sara Khan (PJ1008): In Employee MIS, in Resignation Tracker, restored in Retention Tracker!
    const saraKhan = session.validatedRows.find((r) => r.mappedData.employeeCode === 'PJ1008');
    assert.ok(saraKhan, 'Sara Khan (PJ1008) must be present in reconciled list');
    assert.strictEqual(saraKhan.mappedData.employmentStatus, 'ACTIVE', 'Resignation withdrawal restores to ACTIVE');
    assert.strictEqual(saraKhan.mappedData.lastWorkingDay, null, 'Pending LWD is cleared on withdrawal');

    // 2. Diya Sharma (PJ1002): Location transfer to Lucknow
    const diyaSharma = session.validatedRows.find((r) => r.mappedData.employeeCode === 'PJ1002');
    assert.ok(diyaSharma);
    assert.strictEqual(diyaSharma.mappedData.workLocation, 'Lucknow', 'Location updated to Lucknow');

    // 3. Third-party workforce: VND-001 Naman Gill
    const namanGill = session.validatedRows.find((r) => r.mappedData.employeeCode === 'VND-001');
    assert.ok(namanGill, 'Third-party worker VND-001 must be present using vendor reference code');
    assert.strictEqual(namanGill.mappedData.fullName, 'Naman Gill');
    assert.strictEqual(namanGill.isThirdParty, true);

    // 4. Recruitment Master: Candidate B (Offer) extracted for onboarding; Candidate A (Interview) ignored
    const candidateB = session.validatedRows.find((r) => r.mappedData.fullName === 'Candidate B');
    assert.ok(candidateB, 'Candidate B in Offer stage must be extracted for onboarding');
    assert.strictEqual(candidateB.mappedData.employmentStatus, 'ONBOARDING');
    assert.strictEqual(candidateB.mappedData.designation, 'HR Executive');

    const candidateA = session.validatedRows.find((r) => r.mappedData.fullName === 'Candidate A');
    assert.strictEqual(candidateA, undefined, 'Candidate A in Interview stage must never be created as employee');

    // 5. Historical exit records from Resignation Tracker (HIST001)
    const hist001 = session.validatedRows.find((r) => r.mappedData.employeeCode === 'HIST001');
    assert.ok(hist001, 'Historical exit employee HIST001 must be reconciled');
    assert.strictEqual(hist001.mappedData.employmentStatus, 'EXITED');
    assert.strictEqual(hist001.reconciliationType, 'HISTORICAL_EXIT');
    assert.strictEqual(hist001.approvedForImport, false, 'Historical records require explicit approval');
  });

  it('4. should track manual edits, mark records as Manually Edited, and support reverting', async () => {
    if (!fs.existsSync(sampleWorkbookPath)) return;

    const buffer = fs.readFileSync(sampleWorkbookPath);
    const parsed = await smartImportService.parseAndDetectColumns(
      buffer,
      'People_Journey_Sample_HR_Import_Test_Workbook.xlsx',
      userA
    );

    const sessionId = parsed.session.sessionId;
    const targetRow = parsed.session.validatedRows[0];
    const initialName = targetRow.mappedData.fullName;

    // Perform an edit on targetRow
    const updated = importSessionStore.updateRow(sessionId, userA, targetRow.rowIndex, {
      fullName: 'Aarav Mehta Updated',
      department: 'Executive Leadership',
    });

    assert.ok(updated);
    assert.strictEqual(updated.isEdited, true, 'isEdited flag must be true');
    assert.deepStrictEqual(updated.editedFields, ['fullName', 'department']);
    assert.strictEqual(updated.mappedData.fullName, 'Aarav Mehta Updated');
    assert.strictEqual(updated.mappedData.department, 'Executive Leadership');

    // Revert the row
    const reverted = importSessionStore.revertRow(sessionId, userA, targetRow.rowIndex);
    assert.ok(reverted);
    assert.strictEqual(reverted.isEdited, false, 'isEdited must be false after revert');
    assert.deepStrictEqual(reverted.editedFields, []);
    assert.strictEqual(reverted.mappedData.fullName, initialName, 'Name must be restored to original');
  });

  it('5. should support explicit approval toggle and bulk approval for existing updates and historical exits', async () => {
    if (!fs.existsSync(sampleWorkbookPath)) return;

    const buffer = fs.readFileSync(sampleWorkbookPath);
    const parsed = await smartImportService.parseAndDetectColumns(
      buffer,
      'People_Journey_Sample_HR_Import_Test_Workbook.xlsx',
      userA
    );

    const sessionId = parsed.session.sessionId;
    const histRow = parsed.session.validatedRows.find(r => r.reconciliationType === 'HISTORICAL_EXIT')!;
    assert.strictEqual(histRow.approvedForImport, false);

    // Toggle approval
    const approvedRow = importSessionStore.toggleRowApproval(sessionId, userA, histRow.rowIndex, true);
    assert.strictEqual(approvedRow?.approvedForImport, true);

    // Bulk approve all historical exits
    importSessionStore.bulkSetApproval(sessionId, userA, 'historical_exits', true);
    const refreshed = importSessionStore.getSession(sessionId, userA)!;
    const allHist = refreshed.validatedRows.filter(r => r.reconciliationType === 'HISTORICAL_EXIT');
    for (const h of allHist) {
      assert.strictEqual(h.approvedForImport, true, `${h.mappedData.employeeCode} must be approved`);
    }
  });
});
