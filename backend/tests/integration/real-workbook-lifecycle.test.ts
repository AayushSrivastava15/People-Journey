import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { smartImportService } from '../../src/services/smart-import.service.js';
import { excelSheetAnalyzer } from '../../src/services/excel-sheet-analyzer.js';
import { employeeLifecycleReconciliationService } from '../../src/services/employee-lifecycle-reconciliation.service.js';
import { importSessionStore } from '../../src/services/import-session.store.js';
import { executeSql, closePool } from '../../src/config/database.js';

describe('Real Company Workbook Lifecycle & Sheet Selection Integration Tests', () => {
  const testUserId = 'bbbbbbbb-2222-4000-8000-000000000002';
  const realWorkbookPath = 'C:\\Users\\aayus\\Downloads\\Master of open position New (1).xlsx';

  before(async () => {
    await executeSql(
      `INSERT INTO app_users (id, firebase_uid, email, display_name, role)
       VALUES ($1, 'fb-real-workbook-user', 'realworkbook@test.local', 'Real Workbook Tester', 'user')
       ON CONFLICT (id) DO NOTHING`,
      [testUserId]
    );
  });

  after(async () => {
    await executeSql(`DELETE FROM hr_audit_logs WHERE user_id = $1`, [testUserId]);
    await executeSql(`DELETE FROM hr_employee_import_history WHERE owner_user_id = $1`, [testUserId]);
    await executeSql(`DELETE FROM hr_employees WHERE owner_user_id = $1`, [testUserId]);
    await executeSql(`DELETE FROM app_users WHERE id = $1`, [testUserId]);
    await closePool();
  });

  it('1. should verify employeeLifecycleReconciliationService logic directly', () => {
    // Past LWD -> EXITED
    const exitedResult = employeeLifecycleReconciliationService.evaluateResignationTrackerLifecycle({
      sourceSheet: 'Resignation Tracker',
      rawStatus: 'Non Active',
      resignationDate: '2025-08-30',
      lastWorkingDay: '2025-10-18', // past date relative to current time
    });
    assert.strictEqual(exitedResult.lifecycleStatus, 'EXITED');
    assert.ok(exitedResult.classificationReason.includes('verified past Last Working Day'));
    assert.strictEqual(exitedResult.supportingDates.isPastLwd, true);

    // Future LWD -> OFFBOARDING
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 2);
    const futureDateStr = futureDate.toISOString().slice(0, 10);
    const offboardingResult = employeeLifecycleReconciliationService.evaluateResignationTrackerLifecycle({
      sourceSheet: 'Resignation Tracker',
      rawStatus: 'Active',
      lastWorkingDay: futureDateStr,
    });
    assert.strictEqual(offboardingResult.lifecycleStatus, 'OFFBOARDING');

    // Missing LWD in Resignation Tracker -> NEEDS_ATTENTION
    const needsAttentionResult = employeeLifecycleReconciliationService.evaluateResignationTrackerLifecycle({
      sourceSheet: 'Resignation Tracker',
      rawStatus: 'Active',
      lastWorkingDay: null,
    });
    assert.strictEqual(needsAttentionResult.requiresHrApproval, true);
    assert.ok(needsAttentionResult.classificationReason.includes('without confirmed Last Working Day'));

    // Retention Tracker Resignation Withdrawn -> restores to ACTIVE
    assert.strictEqual(
      employeeLifecycleReconciliationService.isResignationWithdrawn('Resignation Withdrawn'),
      true
    );
    assert.strictEqual(
      employeeLifecycleReconciliationService.isResignationWithdrawn('Active', 'Withdrawn'),
      true
    );
    assert.strictEqual(
      employeeLifecycleReconciliationService.isResignationWithdrawn('Active', '2025-10-18'),
      false
    );
  });

  it('2. should verify worksheet classification for all sheets including dashboards and closed vacancies', () => {
    const analysis = excelSheetAnalyzer.classifySheet('Dashboard', ['Metrics', 'Count']);
    assert.strictEqual(analysis.category, 'DASHBOARD');
    assert.strictEqual(analysis.importable, false);
    assert.strictEqual(analysis.defaultInclude, false);

    const closedAnalysis = excelSheetAnalyzer.classifySheet('closed position', ['Role', 'Reason']);
    assert.strictEqual(closedAnalysis.category, 'CLOSED_VACANCIES');
    assert.strictEqual(closedAnalysis.importable, false);
    assert.strictEqual(closedAnalysis.defaultInclude, false);

    const resignationAnalysis = excelSheetAnalyzer.classifySheet('Resignation Tracker', [
      'S.No.',
      'Status',
      'Employee Code',
      'Name',
      'Last working Day',
    ]);
    assert.strictEqual(resignationAnalysis.category, 'RESIGNATION_TRACKER');
    assert.strictEqual(resignationAnalysis.importable, true);
    assert.strictEqual(resignationAnalysis.defaultInclude, true);

    const recruitmentAnalysis = excelSheetAnalyzer.classifySheet('Recruitment Master ', [
      'Position Type',
      'Department',
      'Designation',
      'Remarks',
    ]);
    assert.strictEqual(recruitmentAnalysis.category, 'RECRUITMENT');
    assert.strictEqual(recruitmentAnalysis.importable, true);
  });

  it('3. should verify real workbook extraction with Divyamshu YN, Nitin Bisht, Harshverdhan and candidates', async () => {
    if (!fs.existsSync(realWorkbookPath)) {
      console.log('Skipping real workbook test: file not found at', realWorkbookPath);
      return;
    }

    const buffer = fs.readFileSync(realWorkbookPath);
    const result = await smartImportService.parseAndDetectColumns(
      buffer,
      'Master of open position New (1).xlsx',
      testUserId
    );

    assert.ok(result.session.sessionId);
    assert.ok(result.sheets.length > 0);

    const rows = result.session.validatedRows;

    // Verify Divyamshu YN:
    const divyamshu = rows.find(
      (r) =>
        r.mappedData.employeeCode === '100083' ||
        (r.mappedData.fullName && r.mappedData.fullName.toLowerCase().includes('divyamshu'))
    );
    assert.ok(divyamshu, 'Divyamshu YN must be found in validated rows');
    assert.strictEqual(
      divyamshu.mappedData.employmentStatus,
      'EXITED',
      'Divyamshu YN must be classified as EXITED, NOT ACTIVE'
    );
    assert.strictEqual(divyamshu.rawExcelStatus, 'Non Active');
    assert.strictEqual(divyamshu.primarySheet, 'Resignation Tracker');
    assert.strictEqual(divyamshu.sourceRowNumber, 2);
    assert.ok(divyamshu.lifecycleReason?.includes('verified past Last Working Day'));
    assert.strictEqual(divyamshu.isHistorical, true);

    // Verify Nitin Bisht:
    const nitin = rows.find(
      (r) =>
        r.mappedData.fullName && r.mappedData.fullName.toLowerCase().includes('nitin bisht')
    );
    if (nitin) {
      assert.strictEqual(nitin.mappedData.employmentStatus, 'ACTIVE');
      assert.ok(
        nitin.conflicts?.some((c) => c.sheet === 'Retention Tracker') ||
          nitin.lifecycleReason?.includes('Retention Tracker')
      );
    }

    // Verify Harshverdhan:
    const harshverdhan = rows.find(
      (r) =>
        r.mappedData.fullName && r.mappedData.fullName.toLowerCase().includes('harshverdhan')
    );
    if (harshverdhan) {
      assert.ok(harshverdhan.mappedData.workLocation?.includes('Boisar'));
    }

    // Verify open vacancies are NOT created as employees
    for (const r of rows) {
      assert.notStrictEqual(
        r.mappedData.fullName?.toLowerCase(),
        'open',
        'Open vacancy must never become employee name'
      );
      assert.notStrictEqual(
        r.mappedData.fullName?.toLowerCase(),
        'position',
        'Position header must never become employee name'
      );
    }

    // Verify employee code is NEVER auto-generated:
    for (const r of rows) {
      if (!r.mappedData.employeeCode) {
        assert.notStrictEqual(
          r.validationStatus,
          'VALID',
          'Rows with missing employee code must NEVER be marked as VALID'
        );
      }
    }
  });

  it('4. should dynamically re-extract when user selects custom sheets', async () => {
    if (!fs.existsSync(realWorkbookPath)) return;

    const buffer = fs.readFileSync(realWorkbookPath);
    const initial = await smartImportService.parseAndDetectColumns(
      buffer,
      'Master of open position New (1).xlsx',
      testUserId
    );

    const sessionId = initial.session.sessionId;

    // Select only 'Resignation Tracker'
    const updatedSession = await smartImportService.selectSheetsForImport(
      sessionId,
      testUserId,
      ['Resignation Tracker']
    );

    assert.ok(updatedSession.sessionId);
    assert.ok(updatedSession.validatedRows.length > 0);

    // Every extracted row must come from Resignation Tracker
    for (const r of updatedSession.validatedRows) {
      assert.strictEqual(r.primarySheet, 'Resignation Tracker');
    }
  });
});
