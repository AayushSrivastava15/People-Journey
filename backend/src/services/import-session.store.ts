import crypto from 'node:crypto';
import { logger } from '../utils/logger.js';
import type { SheetCategory } from './excel-sheet-analyzer.js';

export type RowValidationStatus = 'VALID' | 'NEEDS_ATTENTION' | 'DUPLICATE';

export interface RowValidationError {
  field: string;
  message: string;
  critical: boolean;
}

export interface ValidatedImportRow {
  rowIndex: number; // 1-indexed row number from original Excel
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
  };
  validationStatus: RowValidationStatus;
  errors: RowValidationError[];
  warnings: string[];
  sourceSheets?: string[];
  isHistorical?: boolean;
}

export interface ImportSummary {
  totalRecords: number;
  validRecords: number;
  needsAttentionRecords: number;
  duplicateRecords: number;
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
      REGULAR_EMPLOYEES: 'Regular Employees',
      THIRD_PARTY: 'Third Party Workforce',
      RESIGNATION_TRACKER: 'Lifecycle Updates / Historical Employees',
      RETENTION_TRACKER: 'Employee Restoration',
      TRANSFER: 'Employee Location Updates',
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
    rowIndex: number,
    updatedMappedData: Partial<ValidatedImportRow['mappedData']>
  ): ValidatedImportRow | null {
    const session = this.getSession(sessionId, ownerUserId);
    if (!session) return null;

    const row = session.validatedRows.find(r => r.rowIndex === rowIndex);
    if (!row) return null;

    row.mappedData = {
      ...row.mappedData,
      ...updatedMappedData,
    };

    // Keep rawRows in sync
    const rawIdx = rowIndex - 2;
    if (session.rawRows[rawIdx]) {
      for (const [canonicalField, newVal] of Object.entries(updatedMappedData)) {
        let header = Object.keys(session.columnMapping).find(h => session.columnMapping[h] === canonicalField);
        if (!header) {
          header = canonicalField;
          session.columnMapping[header] = canonicalField;
        }
        session.rawRows[rawIdx][header] = newVal;
      }
    }

    return row;
  }

  deleteRow(sessionId: string, ownerUserId: string, rowIndex: number): boolean {
    const session = this.getSession(sessionId, ownerUserId);
    if (!session) return false;

    const idx = session.validatedRows.findIndex(r => r.rowIndex === rowIndex);
    if (idx === -1) return false;

    session.validatedRows.splice(idx, 1);
    this.recalculateSummary(session);
    return true;
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
