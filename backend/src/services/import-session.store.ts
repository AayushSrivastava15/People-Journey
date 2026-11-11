import crypto from 'node:crypto';
import { logger } from '../utils/logger.js';

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

export interface ImportSession {
  sessionId: string;
  ownerUserId: string;
  fileName: string;
  fileSize: number;
  uploadedAt: Date;
  expiresAt: Date;
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
      // Evict oldest session
      const oldestKey = this.sessions.keys().next().value;
      if (oldestKey) {
        this.sessions.delete(oldestKey);
      }
    }

    const sessionId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.TTL_MS);

    const session: ImportSession = {
      sessionId,
      ownerUserId,
      fileName,
      fileSize,
      uploadedAt: now,
      expiresAt,
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

  getSession(sessionId: string, ownerUserId: string): ImportSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    if (session.ownerUserId !== ownerUserId) {
      logger.warn({ sessionId, ownerUserId, actualOwner: session.ownerUserId }, 'Unauthorized access attempt to import session');
      return null;
    }

    if (new Date() > session.expiresAt) {
      this.sessions.delete(sessionId);
      logger.info({ sessionId }, 'Import preview session expired and removed');
      return null;
    }

    // Refresh expiration on activity
    session.expiresAt = new Date(Date.now() + this.TTL_MS);
    return session;
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
    session.expiresAt = new Date(Date.now() + this.TTL_MS);
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

    // Keep rawRows in sync so revalidation reflects inline edits
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
