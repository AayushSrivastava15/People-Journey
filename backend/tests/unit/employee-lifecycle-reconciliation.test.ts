import test from 'node:test';
import assert from 'node:assert/strict';
import {
  employeeLifecycleReconciliationService,
  RawEmployeeRecord,
} from '../../src/services/employee-lifecycle-reconciliation.service.js';

test('Employee Lifecycle Reconciliation Service Unit Tests', async (t) => {
  const TODAY = '2026-11-11';

  await t.test('Rule 1: Employee MIS with explicit Active status becomes ACTIVE without attention', () => {
    const record: RawEmployeeRecord = {
      sourceSheet: 'Employee MIS',
      sourceRowNumber: 2,
      employeeCode: 'EMP001',
      fullName: 'Alice Smith',
      rawStatus: 'Active',
      hireDate: '2023-01-15',
    };

    const res = employeeLifecycleReconciliationService.evaluateEmployeeMisLifecycle(record);
    assert.equal(res.lifecycleStatus, 'ACTIVE');
    assert.equal(res.needsAttention, false);
    assert.equal(res.rawExcelStatus, 'Active');
    assert.match(res.classificationReason, /Explicit Active/i);
  });

  await t.test('Rule 1b: Employee MIS with missing status does NOT infer Active automatically', () => {
    const record: RawEmployeeRecord = {
      sourceSheet: 'Employee MIS',
      sourceRowNumber: 3,
      employeeCode: 'EMP002',
      fullName: 'Bob Jones',
      rawStatus: '',
      hireDate: '2023-02-15',
    };

    const res = employeeLifecycleReconciliationService.evaluateEmployeeMisLifecycle(record);
    assert.equal(res.needsAttention, true);
    assert.match(res.attentionReason || '', /missing.*Cannot infer Active/i);
  });

  await t.test('Rule 2: Never replace an explicit Non Active value with Active', () => {
    const record: RawEmployeeRecord = {
      sourceSheet: 'Employee MIS',
      sourceRowNumber: 4,
      employeeCode: 'EMP003',
      fullName: 'Charlie Brown',
      rawStatus: 'Non Active',
      hireDate: '2022-01-10',
    };

    const res = employeeLifecycleReconciliationService.evaluateEmployeeMisLifecycle(record);
    assert.equal(res.lifecycleStatus, 'EXITED');
    assert.notEqual(res.lifecycleStatus, 'ACTIVE');
    assert.equal(res.rawExcelStatus, 'Non Active');
  });

  await t.test('Rule 3: Resignation Tracker - Non Active + verified past Last Working Day -> EXITED', () => {
    const record: RawEmployeeRecord = {
      sourceSheet: 'Resignation Tracker',
      sourceRowNumber: 2,
      employeeCode: '100083',
      fullName: 'Divyamshu YN',
      rawStatus: 'Non Active',
      hireDate: '2025-06-13',
      resignationDate: '2025-08-30',
      lastWorkingDay: '2025-10-18', // Past relative to 2026-11-11
      fnfDone: 'Done',
    };

    const res = employeeLifecycleReconciliationService.evaluateResignationTrackerLifecycle(record, TODAY);
    assert.equal(res.lifecycleStatus, 'EXITED');
    assert.equal(res.needsAttention, false);
    assert.equal(res.rawExcelStatus, 'Non Active');
    assert.match(res.classificationReason, /verified past Last Working Day/i);
  });

  await t.test('Rule 4: Resignation Tracker - Active + confirmed future Last Working Day -> OFFBOARDING', () => {
    const record: RawEmployeeRecord = {
      sourceSheet: 'Resignation Tracker',
      sourceRowNumber: 5,
      employeeCode: 'EMP005',
      fullName: 'David Lee',
      rawStatus: 'Active',
      resignationDate: '2026-10-01',
      lastWorkingDay: '2026-12-15', // Future relative to 2026-11-11
    };

    const res = employeeLifecycleReconciliationService.evaluateResignationTrackerLifecycle(record, TODAY);
    assert.equal(res.lifecycleStatus, 'OFFBOARDING');
    assert.equal(res.needsAttention, false);
    assert.match(res.classificationReason, /serving notice period/i);
  });

  await t.test('Rule 5: Resignation Tracker - Active + missing Last Working Day -> NEED ATTENTION (not EXITED)', () => {
    const record: RawEmployeeRecord = {
      sourceSheet: 'Resignation Tracker',
      sourceRowNumber: 6,
      employeeCode: 'EMP006',
      fullName: 'Eva Green',
      rawStatus: 'Active',
      resignationDate: '2026-10-15',
      lastWorkingDay: null, // Missing!
    };

    const res = employeeLifecycleReconciliationService.evaluateResignationTrackerLifecycle(record, TODAY);
    assert.notEqual(res.lifecycleStatus, 'EXITED');
    assert.equal(res.needsAttention, true);
    assert.equal(res.requiresHrApproval, true);
    assert.match(res.attentionReason || '', /missing or not yet confirmed/i);
  });

  await t.test('Rule 6: Resignation Tracker - Non Active + missing Last Working Day -> NEED ATTENTION', () => {
    const record: RawEmployeeRecord = {
      sourceSheet: 'Resignation Tracker',
      sourceRowNumber: 7,
      employeeCode: 'EMP007',
      fullName: 'Frank White',
      rawStatus: 'Non Active',
      lastWorkingDay: null,
    };

    const res = employeeLifecycleReconciliationService.evaluateResignationTrackerLifecycle(record, TODAY);
    assert.equal(res.lifecycleStatus, 'EXITED');
    assert.equal(res.needsAttention, true);
    assert.equal(res.requiresHrApproval, true);
    assert.match(res.attentionReason || '', /Last Working Day is missing/i);
  });

  await t.test('Rule 7: Retention Tracker - Resignation Withdrawn restores to ACTIVE', () => {
    const record: RawEmployeeRecord = {
      sourceSheet: 'Retention Tracker',
      sourceRowNumber: 2,
      employeeCode: '100210',
      fullName: 'Nitin Bisht',
      rawStatus: 'Active/Resignation Withdrawn',
      lastWorkingDay: 'Resignation Withdrawn',
    };

    const res = employeeLifecycleReconciliationService.evaluateRetentionTrackerLifecycle(record);
    assert.equal(res.lifecycleStatus, 'ACTIVE');
    assert.equal(res.needsAttention, false);
    assert.match(res.classificationReason, /withdrawn/i);
  });

  await t.test('Rule 8: Cross-sheet: MIS Active + Resignation confirmed exit -> confirmed exit takes priority (EXITED)', () => {
    const misRecord: RawEmployeeRecord = {
      sourceSheet: 'Employee MIS',
      sourceRowNumber: 10,
      employeeCode: 'EMP010',
      fullName: 'Grace Hopper',
      rawStatus: 'Active',
    };

    const resignationRecord: RawEmployeeRecord = {
      sourceSheet: 'Resignation Tracker',
      sourceRowNumber: 12,
      employeeCode: 'EMP010',
      fullName: 'Grace Hopper',
      rawStatus: 'Non Active',
      lastWorkingDay: '2026-05-01', // Past
      fnfDone: 'Done',
    };

    const res = employeeLifecycleReconciliationService.reconcileEmployeeLifecycle(misRecord, [resignationRecord], TODAY);
    assert.equal(res.lifecycleStatus, 'EXITED');
    assert.equal(res.needsAttention, false);
    assert.match(res.classificationReason, /Confirmed exit takes priority/i);
    assert.equal(res.conflicts.length, 1);
  });

  await t.test('Rule 9: Cross-sheet: MIS Active + Resignation ongoing (future LWD) -> OFFBOARDING', () => {
    const misRecord: RawEmployeeRecord = {
      sourceSheet: 'Employee MIS',
      sourceRowNumber: 15,
      employeeCode: 'EMP015',
      fullName: 'Helen Keller',
      rawStatus: 'Active',
    };

    const resignationRecord: RawEmployeeRecord = {
      sourceSheet: 'Resignation Tracker',
      sourceRowNumber: 18,
      employeeCode: 'EMP015',
      fullName: 'Helen Keller',
      rawStatus: 'Active',
      lastWorkingDay: '2026-12-31', // Future
    };

    const res = employeeLifecycleReconciliationService.reconcileEmployeeLifecycle(misRecord, [resignationRecord], TODAY);
    assert.equal(res.lifecycleStatus, 'OFFBOARDING');
    assert.equal(res.needsAttention, false);
    assert.match(res.classificationReason, /Serving notice period/i);
  });

  await t.test('Rule 10: Cross-sheet: MIS Active + Resignation + Retention Withdrawn -> ACTIVE (Retention wins)', () => {
    const misRecord: RawEmployeeRecord = {
      sourceSheet: 'Employee MIS',
      sourceRowNumber: 20,
      employeeCode: 'EMP020',
      fullName: 'Ian Malcolm',
      rawStatus: 'Active',
    };

    const resignationRecord: RawEmployeeRecord = {
      sourceSheet: 'Resignation Tracker',
      sourceRowNumber: 22,
      employeeCode: 'EMP020',
      fullName: 'Ian Malcolm',
      rawStatus: 'Non Active',
      lastWorkingDay: '2026-10-15',
    };

    const retentionRecord: RawEmployeeRecord = {
      sourceSheet: 'Retention Tracker',
      sourceRowNumber: 3,
      employeeCode: 'EMP020',
      fullName: 'Ian Malcolm',
      rawStatus: 'Active/Resignation Withdrawn',
      lastWorkingDay: 'Resignation Withdrawn',
    };

    const res = employeeLifecycleReconciliationService.reconcileEmployeeLifecycle(
      misRecord,
      [resignationRecord, retentionRecord],
      TODAY
    );
    assert.equal(res.lifecycleStatus, 'ACTIVE');
    assert.equal(res.needsAttention, false);
    assert.match(res.classificationReason, /Retention Tracker.*Restored to Active/i);
  });
});
