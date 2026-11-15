import crypto from 'node:crypto';
import { logger } from '../utils/logger.js';
import type { SheetCategory } from './excel-sheet-analyzer.js';

export type RowValidationStatus = 'VALID' | 'NEEDS_ATTENTION' | 'DUPLICATE';

export interface RowValidationError {
  field: string;
  message: string;
  critical: boolean;
}

export interface FieldDiff {
  field: string;
  label: string;
  currentVal: string;
  proposedVal: string;
}

export type ReconciliationType =
  | 'NEW_EMPLOYEE'
  | 'EXISTING_UPDATE'
  | 'LIFECYCLE_CHANGE'
  | 'RESTORATION'
  | 'LOCATION_TRANSFER'
  | 'THIRD_PARTY'
  | 'HISTORICAL_EXIT'
  | 'EXISTING_UNCHANGED';

export interface ValidatedImportRow {
  rowId: string; // Stable unique identifier: sessionId + sheet + originalRowNumber
  rowIndex: number; // 1-indexed row number from original Excel
  originalRowIndex?: number;
  sourceRowNumber?: number;
  primarySheet?: string;
  sourceSheets: string[];
  isHistorical?: boolean;
  isThirdParty?: boolean;
  vendor?: string;
  needsAttention?: boolean;
  attentionReason?: string;

  // Raw Excel status and human-readable lifecycle tracking
  rawExcelStatus?: string;
  lifecycleReason?: string;
  supportingDates?: {
    hireDate?: string | null;
    resignationDate?: string | null;
    lastWorkingDay?: string | null;
    isPastLwd?: boolean;
    isFutureLwd?: boolean;
  };
  conflicts?: Array<{
    sheet: string;
    field: string;
    value: unknown;
    conflictDescription: string;
  }>;
  requiresHrApproval?: boolean;

  // Immutable original values extracted before any manual edits
  originalExtractedData: Record<string, unknown>;

  // Raw original row object from Excel
  originalData: Record<string, unknown>;

  mappedData: {
    employeeCode: string;
    firstName: string;
    lastName: string;
    fullName: string;
    workEmail: string;
    personalEmail: string;
    phone: string;
    department: string;
    designation: string;
    employmentStatus: 'ONBOARDING' | 'ACTIVE' | 'OFFBOARDING' | 'EXITED';
    hireDate: string; // YYYY-MM-DD
    lastWorkingDay: string | null; // YYYY-MM-DD
    exitDate: string | null; // YYYY-MM-DD
    exitReason: string | null;
    exitNotes: string | null;
    workLocation?: string;
    reportingManager?: string;
    vendor?: string;
    employmentCategory?: 'REGULAR' | 'THIRD_PARTY' | 'HISTORICAL_EXIT' | 'ONBOARDING';
  };

  // Change tracking
  isEdited?: boolean;
  editedFields?: string[];

  // Reconciliation against existing workspace database
  isExistingEmployee?: boolean;
  existingEmployeeId?: number;
  existingDbData?: Record<string, unknown>;
  fieldDiffs?: FieldDiff[];
  reconciliationType: ReconciliationType;
  approvedForImport: boolean;

  validationStatus: RowValidationStatus;
  errors: RowValidationError[];
  warnings: string[];
}

export interface ImportSummary {
  totalRecords: number;
  validRecords: number;
  needsAttentionRecords: number;
  duplicateRecords: number;
  existingUpdatesCount?: number;
  thirdPartyCount?: number;
  historicalExitsCount?: number;
  approvedCount?: number;
  statusBreakdown: {
    onboarding: number;
    active: number;
    offboarding: number;
    exited: number;
  };
}

export interface SheetSessionData {
  sheetName: string;
  category: SheetCategory;
  categoryLabel: string;
  detectedContentType?: string;
  contentDescription?: string;
  defaultInclude?: boolean;
  importable: boolean;
  headerRowIndex: number; // 1-indexed
  confidence: number;
  isLowConfidence: boolean;
  totalRows: number;
  estimatedDataRows: number;
  columnCount: number;
  detectedHeaders: string[];
  columnMapping: Record<string, string>; // Excel header -> canonical field
  rawGrid: any[][];
  rawRows: Record<string, unknown>[];
  sampleRows: Record<string, string>[];
  previewGrid: Array<{ rowIndex: number; cells: string[] }>;
}

export interface ImportSession {
  sessionId: string;
  ownerUserId: string;
  fileName: string;
  fileSize: number;
  uploadedAt: Date;
  expiresAt: Date;
  sheets: Record<string, SheetSessionData>;
  sheetOrder: string[];
  // Primary sheet backwards-compatibility aliases
  detectedHeaders: string[];
  rawRows: Record<string, unknown>[];
  columnMapping: Record<string, string>;
  validatedRows: ValidatedImportRow[];
  summary: ImportSummary;
  deletedRowIds?: Set<string>;
}

class ImportSessionStore {
  private sessions = new Map<string, ImportSession>();
  private readonly TTL_MS = 30 * 60 * 1000; // 30 minutes expiration
  private readonly MAX_SESSIONS = 100;

  constructor() {
    // Run cleanup interval every 5 minutes
    setInterval(() => this.cleanupExpired(), 5 * 60 * 1000).unref();
  }

  createSession(
    ownerUserId: string,
    fileName: string,
    fileSize: number,
    detectedHeaders: string[],
    rawRows: Record<string, unknown>[],
    columnMapping: Record<string, string> = {}
  ): ImportSession {
    this.cleanupExpired();

    if (this.sessions.size >= this.MAX_SESSIONS) {
      const oldestKey = this.sessions.keys().next().value;
      if (oldestKey) {
        this.sessions.delete(oldestKey);
      }
    }

    const sessionId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.TTL_MS);

    // Create a default sheet entry for backwards compatibility
    const defaultSheet: SheetSessionData = {
      sheetName: 'Sheet1',
      category: 'REGULAR_EMPLOYEES',
      categoryLabel: 'Regular Employees',
      importable: true,
      headerRowIndex: 1,
      confidence: 0.95,
      isLowConfidence: false,
      totalRows: rawRows.length + 1,
      estimatedDataRows: rawRows.length,
      columnCount: detectedHeaders.length,
      detectedHeaders,
      columnMapping,
      rawGrid: [],
      rawRows,
      sampleRows: rawRows.slice(0, 5) as Record<string, string>[],
      previewGrid: [],
    };

    const session: ImportSession = {
      sessionId,
      ownerUserId,
      fileName,
      fileSize,
      uploadedAt: now,
      expiresAt,
      sheets: { Sheet1: defaultSheet },
      sheetOrder: ['Sheet1'],
      detectedHeaders,
      rawRows,
      columnMapping,
      validatedRows: [],
      summary: {
        totalRecords: rawRows.length,
        validRecords: 0,
        needsAttentionRecords: 0,
        duplicateRecords: 0,
        statusBreakdown: { onboarding: 0, active: 0, offboarding: 0, exited: 0 },
      },
    };

    this.sessions.set(sessionId, session);
    logger.info({ sessionId, ownerUserId, fileName, rowCount: rawRows.length }, 'Created import preview session');
    return session;
  }

  createMultiSheetSession(
    ownerUserId: string,
    fileName: string,
    fileSize: number,
    sheets: SheetSessionData[]
  ): ImportSession {
    this.cleanupExpired();

    if (this.sessions.size >= this.MAX_SESSIONS) {
      const oldestKey = this.sessions.keys().next().value;
      if (oldestKey) {
        this.sessions.delete(oldestKey);
      }
    }

    const sessionId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.TTL_MS);

    const sheetMap: Record<string, SheetSessionData> = {};
    const sheetOrder: string[] = [];

    sheets.forEach((s) => {
      sheetMap[s.sheetName] = s;
      sheetOrder.push(s.sheetName);
    });

    // Primary importable sheet (e.g. Employee MIS)
    const primarySheet =
      sheets.find(s => s.importable && s.category === 'REGULAR_EMPLOYEES') ||
      sheets.find(s => s.importable) ||
      sheets[0];

    const session: ImportSession = {
      sessionId,
      ownerUserId,
      fileName,
      fileSize,
      uploadedAt: now,
      expiresAt,
      sheets: sheetMap,
      sheetOrder,
      detectedHeaders: primarySheet?.detectedHeaders || [],
      rawRows: primarySheet?.rawRows || [],
      columnMapping: primarySheet?.columnMapping || {},
      validatedRows: [],
      summary: {
        totalRecords: primarySheet?.rawRows.length || 0,
        validRecords: 0,
        needsAttentionRecords: 0,
        duplicateRecords: 0,
        statusBreakdown: { onboarding: 0, active: 0, offboarding: 0, exited: 0 },
      },
    };

    this.sessions.set(sessionId, session);
    logger.info({ sessionId, ownerUserId, fileName, sheetCount: sheets.length }, 'Created multi-sheet import session');
    return session;
  }

  getSession(sessionId: string, ownerUserId: string): ImportSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    if (session.ownerUserId !== ownerUserId) {
      logger.warn({ sessionId, ownerUserId, actualOwner: session.ownerUserId }, 'Unauthorized access attempt to import session');
      return null;
    }

    // Refresh TTL on active access
    session.expiresAt = new Date(Date.now() + this.TTL_MS);
    return session;
  }

  updateSheetHeaderRow(
    sessionId: string,
    ownerUserId: string,
    sheetName: string,
    newHeaderRow: number // 1-indexed
  ): SheetSessionData | null {
    const session = this.getSession(sessionId, ownerUserId);
    if (!session || !session.sheets[sheetName]) return null;

    const sheet = session.sheets[sheetName];
    const grid = sheet.rawGrid;
    if (!grid || newHeaderRow < 1 || newHeaderRow > grid.length) return null;

    const headerIdx = newHeaderRow - 1;
    const rawHeaders = (grid[headerIdx] || []).map((c, idx) => {
      const val = String(c ?? '').trim();
      return val || `Column_${idx + 1}`;
    });

    // Trim trailing placeholder columns
    let lastValidIdx = rawHeaders.length - 1;
    while (lastValidIdx >= 0 && rawHeaders[lastValidIdx].startsWith('Column_')) {
      lastValidIdx--;
    }
    const detectedHeaders = rawHeaders.slice(0, lastValidIdx + 1);

    // Re-extract data rows
    const rawRows: Record<string, unknown>[] = [];
    const sampleRows: Record<string, string>[] = [];

    for (let r = newHeaderRow; r < grid.length; r++) {
      const row = grid[r] || [];
      const hasData = row.some(c => c !== '' && c !== null && c !== undefined);
      if (hasData) {
        const rowObj: Record<string, unknown> = {};
        detectedHeaders.forEach((h, colIdx) => {
          rowObj[h] = row[colIdx] ?? '';
        });
        rawRows.push(rowObj);
        if (sampleRows.length < 5) {
          const sampleObj: Record<string, string> = {};
          detectedHeaders.forEach((h, colIdx) => {
            sampleObj[h] = row[colIdx] !== undefined && row[colIdx] !== null ? String(row[colIdx]).trim() : '';
          });
          sampleRows.push(sampleObj);
        }
      }
    }

    sheet.headerRowIndex = newHeaderRow;
    sheet.detectedHeaders = detectedHeaders;
    sheet.columnCount = detectedHeaders.length;
    sheet.rawRows = rawRows;
    sheet.estimatedDataRows = rawRows.length;
    sheet.sampleRows = sampleRows;
    sheet.confidence = 1.0; // Confirmed by manual user action
    sheet.isLowConfidence = false;

    // If this is the primary sheet, also update root aliases
    if (session.sheetOrder[0] === sheetName || sheet.category === 'REGULAR_EMPLOYEES') {
      session.detectedHeaders = detectedHeaders;
      session.rawRows = rawRows;
    }

    return sheet;
  }

  updateSheetConfig(
    sessionId: string,
    ownerUserId: string,
    sheetName: string,
    category: SheetCategory,
    importable: boolean
  ): SheetSessionData | null {
    const session = this.getSession(sessionId, ownerUserId);
    if (!session || !session.sheets[sheetName]) return null;

    const sheet = session.sheets[sheetName];
    sheet.category = category;
    sheet.importable = importable;

    const labels: Record<SheetCategory, string> = {
      REGULAR_EMPLOYEES: 'Employee records',
      THIRD_PARTY: 'Vendor workforce',
      RESIGNATION_TRACKER: 'Employee resignations and exits',
      RETENTION_TRACKER: 'Withdrawn resignations',
      TRANSFER: 'Employee transfers',
      RECRUITMENT: 'Candidates and open positions',
      DASHBOARD: 'HR summary and metrics',
      CLOSED_VACANCIES: 'Closed vacancies',
      PROJECTS: 'Project planning',
      IGNORE: 'Ignored',
    };
    sheet.categoryLabel = labels[category] || 'Custom';

    return sheet;
  }

  updateSheetMapping(
    sessionId: string,
    ownerUserId: string,
    sheetName: string,
    mapping: Record<string, string>
  ): SheetSessionData | null {
    const session = this.getSession(sessionId, ownerUserId);
    if (!session || !session.sheets[sheetName]) return null;

    session.sheets[sheetName].columnMapping = mapping;
    return session.sheets[sheetName];
  }

  updateSessionValidation(
    sessionId: string,
    ownerUserId: string,
    columnMapping: Record<string, string>,
    validatedRows: ValidatedImportRow[],
    summary: ImportSummary
  ): ImportSession | null {
    const session = this.getSession(sessionId, ownerUserId);
    if (!session) return null;

    session.columnMapping = columnMapping;
    session.validatedRows = validatedRows;
    session.summary = summary;
    return session;
  }

  updateRow(
    sessionId: string,
    ownerUserId: string,
    rowIdentifier: number | string,
    updatedMappedData: Partial<ValidatedImportRow['mappedData']>
  ): ValidatedImportRow | null {
    const session = this.getSession(sessionId, ownerUserId);
    if (!session) return null;

    const numIndex = typeof rowIdentifier === 'number' ? rowIdentifier : parseInt(rowIdentifier, 10);
    const strIdentifier = String(rowIdentifier);

    const row = session.validatedRows.find(
      r => (r.rowId && r.rowId === strIdentifier) || (!isNaN(numIndex) && r.rowIndex === numIndex)
    );
    if (!row) return null;

    // Snapshot original values before first manual edit if not already done
    if (!row.originalExtractedData) {
      row.originalExtractedData = { ...row.mappedData };
    }

    // Track changed fields against original extracted data
    const editedFieldsSet = new Set(row.editedFields || []);
    for (const [key, val] of Object.entries(updatedMappedData)) {
      const origVal = row.originalExtractedData ? (row.originalExtractedData as any)[key] : undefined;
      const currentVal = val ?? '';
      const baseVal = origVal ?? '';
      if (String(currentVal).trim() !== String(baseVal).trim()) {
        editedFieldsSet.add(key);
      } else {
        editedFieldsSet.delete(key);
      }
    }

    row.mappedData = {
      ...row.mappedData,
      ...updatedMappedData,
    };

    row.editedFields = Array.from(editedFieldsSet);
    row.isEdited = row.editedFields.length > 0;

    // IMMUTABILITY: The original workbook session.rawRows and session.sheets are NEVER modified!
    return row;
  }

  revertRow(sessionId: string, ownerUserId: string, rowIdentifier: number | string): ValidatedImportRow | null {
    const session = this.getSession(sessionId, ownerUserId);
    if (!session) return null;

    const numIndex = typeof rowIdentifier === 'number' ? rowIdentifier : parseInt(rowIdentifier, 10);
    const strIdentifier = String(rowIdentifier);

    const row = session.validatedRows.find(
      r => (r.rowId && r.rowId === strIdentifier) || (!isNaN(numIndex) && r.rowIndex === numIndex)
    );
    if (!row || !row.originalExtractedData) return null;

    // Revert mappedData to original extracted snapshot
    row.mappedData = {
      ...(row.originalExtractedData as any),
    };
    row.isEdited = false;
    row.editedFields = [];

    // IMMUTABILITY: The original workbook data is preserved without mutation
    return row;
  }

  toggleRowApproval(
    sessionId: string,
    ownerUserId: string,
    rowIdentifier: number | string,
    approved?: boolean
  ): ValidatedImportRow | null {
    const session = this.getSession(sessionId, ownerUserId);
    if (!session) return null;

    const numIndex = typeof rowIdentifier === 'number' ? rowIdentifier : parseInt(rowIdentifier, 10);
    const strIdentifier = String(rowIdentifier);

    const row = session.validatedRows.find(
      r => (r.rowId && r.rowId === strIdentifier) || (!isNaN(numIndex) && r.rowIndex === numIndex)
    );
    if (!row) return null;

    row.approvedForImport = approved !== undefined ? approved : !row.approvedForImport;
    this.recalculateSummary(session);
    return row;
  }

  bulkSetApproval(
    sessionId: string,
    ownerUserId: string,
    filterType: 'all' | 'existing_updates' | 'historical_exits' | 'valid_only',
    approved: boolean
  ): boolean {
    const session = this.getSession(sessionId, ownerUserId);
    if (!session) return false;

    for (const row of session.validatedRows) {
      if (filterType === 'all') {
        if (row.validationStatus === 'VALID') row.approvedForImport = approved;
      } else if (filterType === 'existing_updates') {
        if (row.isExistingEmployee) row.approvedForImport = approved;
      } else if (filterType === 'historical_exits') {
        if (row.reconciliationType === 'HISTORICAL_EXIT') row.approvedForImport = approved;
      } else if (filterType === 'valid_only') {
        if (row.validationStatus === 'VALID') row.approvedForImport = approved;
      }
    }

    this.recalculateSummary(session);
    return true;
  }

  deleteRow(sessionId: string, ownerUserId: string, rowIdentifier: number | string): ValidatedImportRow | null {
    const session = this.getSession(sessionId, ownerUserId);
    if (!session) return null;

    const numIndex = typeof rowIdentifier === 'number' ? rowIdentifier : parseInt(rowIdentifier, 10);
    const strIdentifier = String(rowIdentifier);

    const idx = session.validatedRows.findIndex(
      r => (r.rowId && r.rowId === strIdentifier) || (!isNaN(numIndex) && r.rowIndex === numIndex)
    );
    if (idx === -1) return null;

    const [deletedRow] = session.validatedRows.splice(idx, 1);
    if (deletedRow?.rowId) {
      if (!session.deletedRowIds) {
        session.deletedRowIds = new Set<string>();
      }
      session.deletedRowIds.add(deletedRow.rowId);
    }
    this.recalculateSummary(session);
    return deletedRow;
  }

  recalculateSummary(session: ImportSession): void {
    let valid = 0;
    let attention = 0;
    let duplicate = 0;
    const breakdown = { onboarding: 0, active: 0, offboarding: 0, exited: 0 };

    for (const r of session.validatedRows) {
      if (r.validationStatus === 'VALID') {
        valid++;
        const st = r.mappedData.employmentStatus?.toLowerCase() as keyof typeof breakdown;
        if (breakdown[st] !== undefined) {
          breakdown[st]++;
        }
      } else if (r.validationStatus === 'DUPLICATE') {
        duplicate++;
      } else {
        attention++;
      }
    }

    session.summary = {
      totalRecords: session.validatedRows.length,
      validRecords: valid,
      needsAttentionRecords: attention,
      duplicateRecords: duplicate,
      existingUpdatesCount: session.validatedRows.filter(r => r.isExistingEmployee).length,
      thirdPartyCount: session.validatedRows.filter(r => r.isThirdParty).length,
      historicalExitsCount: session.validatedRows.filter(r => r.reconciliationType === 'HISTORICAL_EXIT').length,
      approvedCount: session.validatedRows.filter(r => r.approvedForImport).length,
      statusBreakdown: breakdown,
    };
  }

  deleteSession(sessionId: string, ownerUserId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.ownerUserId !== ownerUserId) return false;
    this.sessions.delete(sessionId);
    return true;
  }

  private cleanupExpired(): void {
    const now = new Date();
    for (const [id, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(id);
      }
    }
  }
}

export const importSessionStore = new ImportSessionStore();
