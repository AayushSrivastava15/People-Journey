import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import { smartImportService } from '../../src/services/smart-import.service.js';
import { excelSheetAnalyzer } from '../../src/services/excel-sheet-analyzer.js';
import { executeSql, closePool } from '../../src/config/database.js';

describe('Smart Employee Import Multi-Sheet & Intelligent Header Detection Tests', () => {
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
    // Construct a worksheet with title banner in Row 1, instructions in Row 2, headers in Row 3
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

    // Ignored sheets
    const readme = excelSheetAnalyzer.classifySheet('Read Me', ['Purpose', 'Suggested workflow']);
    assert.strictEqual(readme.category, 'IGNORE');
    assert.strictEqual(readme.importable, false);

    const dash = excelSheetAnalyzer.classifySheet('Dashboard', ['Metric', 'Value']);
    assert.strictEqual(dash.category, 'IGNORE');
    assert.strictEqual(dash.importable, false);

    const rec = excelSheetAnalyzer.classifySheet('Recruitment Master', ['Req ID', 'Candidate', 'Stage']);
    assert.strictEqual(rec.category, 'IGNORE');
    assert.strictEqual(rec.importable, false);
  });

  it('3. should process the test workbook and reconcile across worksheets', async () => {
    if (!fs.existsSync(sampleWorkbookPath)) {
      // Skip test if sample workbook is not in default download path
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

    // Verify Read Me was classified as IGNORE
    const readMeSheet = parsed.sheets.find((s) => s.sheetName === 'Read Me');
    assert.ok(readMeSheet);
    assert.strictEqual(readMeSheet.category, 'IGNORE');

    // Verify Employee MIS detected header on Row 3
    const empMis = parsed.sheets.find((s) => s.sheetName === 'Employee MIS');
    assert.ok(empMis);
    assert.strictEqual(empMis.headerRowIndex, 3);
    assert.strictEqual(empMis.category, 'REGULAR_EMPLOYEES');
    assert.strictEqual(empMis.sampleRows.length, 5);
    // Ensure sample rows are real data rows, NOT title/instruction banner text!
    assert.strictEqual(empMis.sampleRows[0]['Employee Code'], 'PJ1001');
    assert.strictEqual(empMis.sampleRows[0]['Name'], 'Aarav Mehta');

    // Verify Third Party MIS detected header on Row 3
    const tpMis = parsed.sheets.find((s) => s.sheetName === 'Third Party MIS');
    assert.ok(tpMis);
    assert.strictEqual(tpMis.headerRowIndex, 3);
    assert.strictEqual(tpMis.category, 'THIRD_PARTY');
    assert.strictEqual(tpMis.sampleRows[0]['Worker Name'], 'Naman Gill');
    assert.strictEqual(tpMis.sampleRows[0]['Worker Ref'], 'VND-001');

    // Build per-sheet mappings
    const sheetMappings: Record<string, Record<string, string>> = {};
    parsed.sheets.forEach((s) => {
      sheetMappings[s.sheetName] = s.columnMapping || {};
    });

    // Run multi-sheet reconciliation and validation
    const session = await smartImportService.validateMultiSheetMapping(
      parsed.session.sessionId,
      userA,
      sheetMappings,
      false
    );

    assert.ok(session.validatedRows.length > 0);

    // Verify Sara Khan (PJ1008):
    // In Employee MIS -> Active
    // In Resignation Tracker -> Resignation Date & LWD
    // In Retention Tracker -> Resignation Withdrawn -> Final status restored to Active!
    const saraKhan = session.validatedRows.find((r) => r.mappedData.employeeCode === 'PJ1008');
    assert.ok(saraKhan, 'Sara Khan (PJ1008) must be present in reconciled list');
    assert.strictEqual(saraKhan.mappedData.employmentStatus, 'ACTIVE', 'Resignation withdrawal restores to ACTIVE');
    assert.strictEqual(saraKhan.mappedData.lastWorkingDay, null, 'Pending LWD is cleared on withdrawal');
    assert.ok(
      saraKhan.sourceSheets?.includes('Employee MIS') &&
      saraKhan.sourceSheets?.includes('Retention Tracker'),
      'Source sheets must record reconciliation trail'
    );

    // Verify Diya Sharma (PJ1002):
    // Transferred from Noida to Lucknow in Transfer sheet
    const diyaSharma = session.validatedRows.find((r) => r.mappedData.employeeCode === 'PJ1002');
    assert.ok(diyaSharma);
    assert.ok(
      diyaSharma.mappedData.exitNotes?.includes('Lucknow') ||
      (diyaSharma as any).mappedData.workLocation === 'Lucknow',
      'Location transfer to Lucknow must be captured in employee record'
    );

    // Verify Third Party contractor VND-001 (Naman Gill)
    const namanGill = session.validatedRows.find((r) => r.mappedData.employeeCode === 'VND-001');
    assert.ok(namanGill, 'Third-party worker VND-001 must be present using vendor reference code');
    assert.strictEqual(namanGill.mappedData.fullName, 'Naman Gill');

    // Verify Historical exit records from Resignation Tracker (HIST001)
    const hist001 = session.validatedRows.find((r) => r.mappedData.employeeCode === 'HIST001');
    assert.ok(hist001, 'Historical exit employee HIST001 must be reconciled');
    assert.strictEqual(hist001.mappedData.employmentStatus, 'EXITED');
    assert.strictEqual(hist001.isHistorical, true);
  });
});
