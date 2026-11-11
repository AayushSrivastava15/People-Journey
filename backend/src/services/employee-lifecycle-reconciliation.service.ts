/**
 * Employee Lifecycle Reconciliation Service
 * 
 * Reusable backend service implementing strict enterprise HR lifecycle rules:
 * - Differentiates Employee MIS, Resignation Tracker, Retention Tracker, Recruitment, and Transfers.
 * - Prevents assuming "Active" for unknown or missing statuses.
 * - Enforces verified past vs future Last Working Day (LWD) evaluations.
 * - Manages cross-sheet conflicts, resignation withdrawals, and historical departures.
 * - Preserves raw Excel statuses and tracks human-readable classification reasons.
 */

export type CanonicalLifecycleStatus = 'ONBOARDING' | 'ACTIVE' | 'OFFBOARDING' | 'EXITED';

export interface RawEmployeeRecord {
  sourceSheet: string;
  sourceRowNumber?: number;
  employeeCode?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  workEmail?: string;
  rawStatus?: string;
  hireDate?: string | null;
  resignationDate?: string | null;
  lastWorkingDay?: string | null;
  exitReason?: string | null;
  fnfDone?: string | null;
  positionType?: string | null;
  notes?: string | null;
  [key: string]: unknown;
}

export interface ReconciledLifecycleResult {
  lifecycleStatus: CanonicalLifecycleStatus;
  needsAttention: boolean;
  attentionReason?: string;
  classificationReason: string;
  rawExcelStatus: string;
  supportingDates: {
    hireDate?: string | null;
    resignationDate?: string | null;
    lastWorkingDay?: string | null;
    isPastLwd?: boolean;
    isFutureLwd?: boolean;
  };
  conflicts: Array<{
    sheet: string;
    field: string;
    value: unknown;
    conflictDescription: string;
  }>;
  requiresHrApproval: boolean;
}

export class EmployeeLifecycleReconciliationService {
  /**
   * Helper to get today's date in YYYY-MM-DD format (or reference date for testing)
   */
  getTodayDateString(referenceDate?: string): string {
    if (referenceDate) return referenceDate;
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Normalize raw Excel status string into an upper-cased trimmed string
   */
  normalizeStatusString(rawStatus?: unknown): string {
    if (rawStatus === undefined || rawStatus === null) return '';
    return String(rawStatus).trim();
  }

  /**
   * Check if a status string explicitly denotes Active
   */
  isExplicitActiveStatus(statusStr: string): boolean {
    const s = statusStr.toLowerCase();
    return s === 'active' || s === 'active employee' || s === 'active/full time' || s === 'confirmed';
  }

  /**
   * Check if a status string explicitly denotes Non-Active / Exited
   */
  isExplicitNonActiveStatus(statusStr: string): boolean {
    const s = statusStr.toLowerCase();
    return (
      s === 'non active' ||
      s === 'non-active' ||
      s === 'inactive' ||
      s === 'exit' ||
      s === 'exited' ||
      s === 'left' ||
      s === 'terminated' ||
      s === 'relieved' ||
      s === 'separated' ||
      s === 'deactivated'
    );
  }

  /**
   * Check if a status string denotes resignation / notice / offboarding
   */
  isOffboardingStatus(statusStr: string): boolean {
    const s = statusStr.toLowerCase();
    return (
      s.includes('resigned') ||
      s.includes('resignation') ||
      s.includes('notice') ||
      s.includes('serving notice') ||
      s.includes('offboarding')
    );
  }

  /**
   * Check if a status string denotes resignation withdrawn
   */
  isResignationWithdrawn(statusStr?: string | null, lwdVal?: string | null): boolean {
    const s = (statusStr || '').toLowerCase();
    const l = (lwdVal || '').toLowerCase();
    return (
      s.includes('withdrawn') ||
      s.includes('resignation withdrawn') ||
      s.includes('active/resignation withdrawn') ||
      s.includes('retained') ||
      l.includes('withdrawn') ||
      l.includes('resignation withdrawn')
    );
  }

  /**
   * Evaluate single-row lifecycle for Employee MIS (Regular Employees)
   */
  evaluateEmployeeMisLifecycle(record: RawEmployeeRecord): ReconciledLifecycleResult {
    const rawStatus = this.normalizeStatusString(record.rawStatus);
    const supportingDates = {
      hireDate: record.hireDate || null,
      resignationDate: record.resignationDate || null,
      lastWorkingDay: record.lastWorkingDay || null,
    };

    // 1. Explicit Active status -> ACTIVE
    if (this.isExplicitActiveStatus(rawStatus)) {
      return {
        lifecycleStatus: 'ACTIVE',
        needsAttention: false,
        classificationReason: 'Explicit Active status in Employee MIS.',
        rawExcelStatus: rawStatus,
        supportingDates,
        conflicts: [],
        requiresHrApproval: false,
      };
    }

    // 2. Explicit Non Active status -> EXITED (Never replace Non Active with Active!)
    if (this.isExplicitNonActiveStatus(rawStatus)) {
      return {
        lifecycleStatus: 'EXITED',
        needsAttention: false,
        classificationReason: `Explicit Non Active status ("${rawStatus}") in Employee MIS.`,
        rawExcelStatus: rawStatus,
        supportingDates,
        conflicts: [],
        requiresHrApproval: false,
      };
    }

    // 3. Offboarding / notice period
    if (this.isOffboardingStatus(rawStatus)) {
      return {
        lifecycleStatus: 'OFFBOARDING',
        needsAttention: false,
        classificationReason: `Notice period / offboarding status ("${rawStatus}") in Employee MIS.`,
        rawExcelStatus: rawStatus,
        supportingDates,
        conflicts: [],
        requiresHrApproval: false,
      };
    }

    // 4. Onboarding status
    if (rawStatus.toLowerCase().includes('onboard') || rawStatus.toLowerCase().includes('joined')) {
      return {
        lifecycleStatus: 'ONBOARDING',
        needsAttention: false,
        classificationReason: `Onboarding status ("${rawStatus}") in Employee MIS.`,
        rawExcelStatus: rawStatus,
        supportingDates,
        conflicts: [],
        requiresHrApproval: false,
      };
    }

    // 5. Missing or invalid status -> MUST NOT infer Active! Mark NEED ATTENTION!
    return {
      lifecycleStatus: 'ACTIVE', // Fallback display enum, but flagged for attention
      needsAttention: true,
      attentionReason: rawStatus
        ? `Unrecognized employee status "${rawStatus}" in Employee MIS. Please verify.`
        : 'Employee status is missing in Employee MIS. Cannot infer Active automatically.',
      classificationReason: rawStatus
        ? `Unrecognized status "${rawStatus}". Flagged for HR review.`
        : 'Missing status in Employee MIS. Requires HR verification.',
      rawExcelStatus: rawStatus || '(Empty)',
      supportingDates,
      conflicts: [],
      requiresHrApproval: true,
    };
  }

  /**
   * Evaluate lifecycle for a record originating in Resignation Tracker
   */
  evaluateResignationTrackerLifecycle(
    record: RawEmployeeRecord,
    todayDate?: string
  ): ReconciledLifecycleResult {
    const rawStatus = this.normalizeStatusString(record.rawStatus);
    const today = this.getTodayDateString(todayDate);
    const lwd = record.lastWorkingDay ? String(record.lastWorkingDay).trim() : null;
    const isPastLwd = Boolean(lwd && lwd <= today);
    const isFutureLwd = Boolean(lwd && lwd > today);
    const fnfDone = String(record.fnfDone || '').trim().toLowerCase() === 'done';

    const supportingDates = {
      hireDate: record.hireDate || null,
      resignationDate: record.resignationDate || null,
      lastWorkingDay: lwd,
      isPastLwd,
      isFutureLwd,
    };

    // Rule: Check if resignation was withdrawn in this sheet
    if (this.isResignationWithdrawn(rawStatus, lwd)) {
      return {
        lifecycleStatus: 'ACTIVE',
        needsAttention: false,
        classificationReason: 'Resignation Withdrawn recorded in Resignation Tracker. Restored to Active.',
        rawExcelStatus: rawStatus,
        supportingDates,
        conflicts: [],
        requiresHrApproval: false,
      };
    }

    // Case A: Explicit Non Active status
    if (this.isExplicitNonActiveStatus(rawStatus)) {
      if (isPastLwd || fnfDone) {
        // Non Active + verified past Last Working Day -> EXITED
        return {
          lifecycleStatus: 'EXITED',
          needsAttention: false,
          classificationReason: `Non Active with verified past Last Working Day (${lwd || 'Past'}${fnfDone ? ', FNF Completed' : ''}). Confirmed completed employment exit.`,
          rawExcelStatus: rawStatus,
          supportingDates,
          conflicts: [],
          requiresHrApproval: false,
        };
      }

      if (isFutureLwd) {
        // Non Active but future LWD -> OFFBOARDING
        return {
          lifecycleStatus: 'OFFBOARDING',
          needsAttention: false,
          classificationReason: `Marked Non Active in Resignation Tracker but confirmed Last Working Day (${lwd}) is in the future. Serving notice period.`,
          rawExcelStatus: rawStatus,
          supportingDates,
          conflicts: [],
          requiresHrApproval: false,
        };
      }

      // Non Active + missing or invalid Last Working Day -> NEED ATTENTION
      return {
        lifecycleStatus: 'EXITED',
        needsAttention: true,
        attentionReason: 'Non Active in Resignation Tracker but Last Working Day is missing or unverified.',
        classificationReason: 'Non Active status in Resignation Tracker without confirmed Last Working Day date. Requires HR attention.',
        rawExcelStatus: rawStatus,
        supportingDates,
        conflicts: [],
        requiresHrApproval: true,
      };
    }

    // Case B: Explicit Active status in Resignation Tracker (Resignation submitted, employee currently serving notice)
    if (this.isExplicitActiveStatus(rawStatus)) {
      if (isFutureLwd) {
        // Active + confirmed future Last Working Day -> OFFBOARDING
        return {
          lifecycleStatus: 'OFFBOARDING',
          needsAttention: false,
          classificationReason: `Active status in Resignation Tracker with confirmed future Last Working Day (${lwd}). Employee is serving notice period.`,
          rawExcelStatus: rawStatus,
          supportingDates,
          conflicts: [],
          requiresHrApproval: false,
        };
      }

      if (isPastLwd) {
        // Active in sheet, but Last Working Day is already in the past -> EXITED
        return {
          lifecycleStatus: 'EXITED',
          needsAttention: false,
          classificationReason: `Active status in Resignation Tracker, but Last Working Day (${lwd}) has passed. Employment exit completed.`,
          rawExcelStatus: rawStatus,
          supportingDates,
          conflicts: [],
          requiresHrApproval: false,
        };
      }

      // Active + missing Last Working Day -> NEED ATTENTION!
      // "Resignation submitted without a confirmed last working date must not automatically become EXITED."
      return {
        lifecycleStatus: 'OFFBOARDING',
        needsAttention: true,
        attentionReason: 'Resignation recorded with Active status, but Last Working Day is missing or not yet confirmed.',
        classificationReason: 'Resignation submitted without confirmed Last Working Day. Requires HR date confirmation.',
        rawExcelStatus: rawStatus,
        supportingDates,
        conflicts: [],
        requiresHrApproval: true,
      };
    }

    // Case C: Status unspecified or other phrase
    if (isPastLwd || fnfDone) {
      return {
        lifecycleStatus: 'EXITED',
        needsAttention: false,
        classificationReason: `Resignation entry with verified past Last Working Day (${lwd || 'Past'}${fnfDone ? ', FNF Completed' : ''}).`,
        rawExcelStatus: rawStatus || '(Not specified)',
        supportingDates,
        conflicts: [],
        requiresHrApproval: false,
      };
    }

    if (isFutureLwd) {
      return {
        lifecycleStatus: 'OFFBOARDING',
        needsAttention: false,
        classificationReason: `Resignation entry with confirmed future Last Working Day (${lwd}). Employee is serving notice.`,
        rawExcelStatus: rawStatus || '(Not specified)',
        supportingDates,
        conflicts: [],
        requiresHrApproval: false,
      };
    }

    // Missing LWD and missing status
    return {
      lifecycleStatus: 'OFFBOARDING',
      needsAttention: true,
      attentionReason: 'Resignation entry lacks confirmed Last Working Day and status. Cannot determine exit date.',
      classificationReason: 'Resignation entry without status or confirmed Last Working Day. Requires HR attention.',
      rawExcelStatus: rawStatus || '(Empty)',
      supportingDates,
      conflicts: [],
      requiresHrApproval: true,
    };
  }

  /**
   * Evaluate single-row lifecycle for Retention Tracker (Withdrawn resignations)
   */
  evaluateRetentionTrackerLifecycle(record: RawEmployeeRecord): ReconciledLifecycleResult {
    const rawStatus = this.normalizeStatusString(record.rawStatus);
    return {
      lifecycleStatus: 'ACTIVE',
      needsAttention: false,
      classificationReason: 'Resignation officially withdrawn in Retention Tracker. Restored to Active.',
      rawExcelStatus: rawStatus || 'Resignation Withdrawn',
      supportingDates: {
        hireDate: record.hireDate || null,
        resignationDate: record.resignationDate || null,
        lastWorkingDay: null,
      },
      conflicts: [],
      requiresHrApproval: false,
    };
  }

  /**
   * Reconcile employee across multiple worksheets (Employee MIS + Resignation Tracker + Retention Tracker + Transfers)
   */
  reconcileEmployeeLifecycle(
    primaryRecord: RawEmployeeRecord,
    relatedRecords: RawEmployeeRecord[],
    todayDate?: string
  ): ReconciledLifecycleResult {
    const today = this.getTodayDateString(todayDate);
    const allRecords = [primaryRecord, ...relatedRecords];

    // 1. Check if Retention Tracker has a record for this employee
    const retentionRecord = allRecords.find(
      r =>
        r.sourceSheet.toLowerCase().includes('retention') ||
        this.isResignationWithdrawn(r.rawStatus, r.lastWorkingDay)
    );

    if (retentionRecord) {
      // Retention Tracker withdrawal MUST be considered when resolving resignation records!
      // Overrides resignation and restores to ACTIVE.
      const rawStatuses = allRecords.map(r => `${r.sourceSheet}: ${r.rawStatus || '(empty)'}`).join('; ');
      return {
        lifecycleStatus: 'ACTIVE',
        needsAttention: false,
        classificationReason: 'Resignation officially withdrawn in Retention Tracker. Restored to Active status.',
        rawExcelStatus: retentionRecord.rawStatus || 'Resignation Withdrawn',
        supportingDates: {
          hireDate: primaryRecord.hireDate || null,
          resignationDate: primaryRecord.resignationDate || null,
          lastWorkingDay: null, // Cleared because resignation was withdrawn
        },
        conflicts: [],
        requiresHrApproval: false,
      };
    }

    // 2. Check for Resignation Tracker record
    const resignationRecord = allRecords.find(r => r.sourceSheet.toLowerCase().includes('resignation'));
    const employeeMisRecord = allRecords.find(
      r => r.sourceSheet.toLowerCase().includes('employee') || r.sourceSheet.toLowerCase().includes('mis')
    );

    // If both Employee MIS and Resignation Tracker are present:
    if (employeeMisRecord && resignationRecord) {
      const resResult = this.evaluateResignationTrackerLifecycle(resignationRecord, today);
      const misStatus = this.normalizeStatusString(employeeMisRecord.rawStatus);
      const resStatus = this.normalizeStatusString(resignationRecord.rawStatus);

      // Rule: "If Employee MIS says Active but Resignation Tracker has a confirmed exit, the confirmed exit must take priority."
      if (this.isExplicitActiveStatus(misStatus) && resResult.lifecycleStatus === 'EXITED' && !resResult.needsAttention) {
        return {
          lifecycleStatus: 'EXITED',
          needsAttention: false,
          classificationReason: `Employee MIS listed status as Active, but Resignation Tracker confirms completed exit (Last Working Day: ${resResult.supportingDates.lastWorkingDay || 'Past'}). Confirmed exit takes priority.`,
          rawExcelStatus: `MIS: ${misStatus} | Resignation: ${resStatus}`,
          supportingDates: resResult.supportingDates,
          conflicts: [
            {
              sheet: employeeMisRecord.sourceSheet,
              field: 'employmentStatus',
              value: misStatus,
              conflictDescription: 'Listed as Active in Employee MIS despite confirmed departure in Resignation Tracker.',
            },
          ],
          requiresHrApproval: false,
        };
      }

      // Rule: "If Employee MIS says Active but Resignation Tracker indicates an ongoing resignation, classify as OFFBOARDING only when sufficiently supported."
      if (this.isExplicitActiveStatus(misStatus) && resResult.lifecycleStatus === 'OFFBOARDING') {
        const isSupported = Boolean(resResult.supportingDates.lastWorkingDay && resResult.supportingDates.isFutureLwd);
        if (isSupported) {
          return {
            lifecycleStatus: 'OFFBOARDING',
            needsAttention: false,
            classificationReason: `Employee MIS lists Active status, but Resignation Tracker indicates ongoing resignation with confirmed Last Working Day (${resResult.supportingDates.lastWorkingDay}). Serving notice period.`,
            rawExcelStatus: `MIS: ${misStatus} | Resignation: ${resStatus}`,
            supportingDates: resResult.supportingDates,
            conflicts: [],
            requiresHrApproval: false,
          };
        } else {
          // Ongoing resignation not sufficiently supported (missing LWD)
          return {
            lifecycleStatus: 'OFFBOARDING',
            needsAttention: true,
            attentionReason: 'Employee MIS lists Active, and Resignation Tracker indicates resignation but lacks confirmed Last Working Day.',
            classificationReason: 'Contradictory records between Employee MIS and Resignation Tracker without confirmed Last Working Day.',
            rawExcelStatus: `MIS: ${misStatus} | Resignation: ${resStatus}`,
            supportingDates: resResult.supportingDates,
            conflicts: [
              {
                sheet: resignationRecord.sourceSheet,
                field: 'lastWorkingDay',
                value: null,
                conflictDescription: 'Resignation entry lacks confirmed Last Working Day.',
              },
            ],
            requiresHrApproval: true,
          };
        }
      }

      // If both say Exited / Non Active
      if (this.isExplicitNonActiveStatus(misStatus) && resResult.lifecycleStatus === 'EXITED') {
        return {
          lifecycleStatus: 'EXITED',
          needsAttention: resResult.needsAttention,
          attentionReason: resResult.attentionReason,
          classificationReason: resResult.classificationReason,
          rawExcelStatus: resStatus || misStatus,
          supportingDates: resResult.supportingDates,
          conflicts: [],
          requiresHrApproval: resResult.requiresHrApproval,
        };
      }

      // Rule: "If records contradict each other and cannot be resolved confidently, mark NEED ATTENTION."
      return {
        lifecycleStatus: resResult.lifecycleStatus,
        needsAttention: true,
        attentionReason: `Contradicting records between Employee MIS ("${misStatus}") and Resignation Tracker ("${resStatus}"). Requires HR verification.`,
        classificationReason: `Contradictory status values across sheets (${employeeMisRecord.sourceSheet} vs ${resignationRecord.sourceSheet}). Flagged for HR review.`,
        rawExcelStatus: `MIS: ${misStatus} | Resignation: ${resStatus}`,
        supportingDates: resResult.supportingDates,
        conflicts: [
          {
            sheet: employeeMisRecord.sourceSheet,
            field: 'employmentStatus',
            value: misStatus,
            conflictDescription: `Status "${misStatus}" contradicts Resignation Tracker status "${resStatus}".`,
          },
        ],
        requiresHrApproval: true,
      };
    }

    // 3. Only Resignation Tracker record exists (Historical Departure absent from Employee MIS)
    if (resignationRecord && !employeeMisRecord) {
      return this.evaluateResignationTrackerLifecycle(resignationRecord, today);
    }

    // 4. Only Employee MIS record exists
    if (employeeMisRecord) {
      return this.evaluateEmployeeMisLifecycle(employeeMisRecord);
    }

    // 5. Fallback for other sheets (Third Party, Recruitment, etc.)
    return this.evaluateEmployeeMisLifecycle(primaryRecord);
  }
}

export const employeeLifecycleReconciliationService = new EmployeeLifecycleReconciliationService();
