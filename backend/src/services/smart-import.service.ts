import * as XLSX from 'xlsx';
import { executeSql, withTenantContext } from '../config/database.js';
import { masterService } from './master.service.js';
import { auditService } from './audit.service.js';
import { dashboardCache } from '../utils/dashboard-cache.js';
import { logger } from '../utils/logger.js';
import {
  importSessionStore,
  type ValidatedImportRow,
  type RowValidationError,
  type ImportSummary,
  type ImportSession,
  type SheetSessionData,
} from './import-session.store.js';
import { excelSheetAnalyzer, type SheetAnalysis, type SheetCategory } from './excel-sheet-analyzer.js';

export interface ColumnAliasDefinition {
  field: string;
  label: string;
  aliases: string[];
  required: boolean;
  description: string;
}

export const CANONICAL_IMPORT_FIELDS: ColumnAliasDefinition[] = [
  {
    field: 'employeeCode',
    label: 'Employee ID / Code',
    aliases: ['employee code', 'employee id', 'staff id', 'emp code', 'emp id', 'staff code', 'id', 'emp no', 'employee no', 'code', 'worker id', 'worker ref', 'ref'],
    required: true,
    description: 'Unique company employee code or staff ID. Never auto-generated.',
  },
  {
    field: 'fullName',
    label: 'Full Name',
    aliases: ['full name', 'employee name', 'emp name', 'staff name', 'worker name', 'name', 'person name', 'candidate name'],
    required: false,
    description: 'Complete employee name (or first name + last name).',
  },
  {
    field: 'firstName',
    label: 'First Name',
    aliases: ['first name', 'fname', 'given name'],
    required: false,
    description: 'Employee given name.',
  },
  {
    field: 'lastName',
    label: 'Last Name',
    aliases: ['last name', 'lname', 'surname', 'family name'],
    required: false,
    description: 'Employee surname / family name.',
  },
  {
    field: 'workEmail',
    label: 'Work Email',
    aliases: ['work email', 'email', 'official email', 'company email', 'email address', 'e-mail', 'office email'],
    required: false,
    description: 'Primary corporate or official email address.',
  },
  {
    field: 'personalEmail',
    label: 'Personal Email',
    aliases: ['personal email', 'private email', 'alt email', 'secondary email', 'home email', 'personal email id'],
    required: false,
    description: 'Personal email for post-exit communications or onboarding.',
  },
  {
    field: 'phone',
    label: 'Phone Number',
    aliases: ['phone', 'phone number', 'mobile', 'mobile number', 'contact', 'contact number', 'tel', 'cell'],
    required: false,
    description: 'Contact phone or mobile number.',
  },
  {
    field: 'department',
    label: 'Department',
    aliases: ['department', 'dept', 'team', 'division', 'unit', 'business unit', 'function'],
    required: false,
    description: 'Department or business unit name.',
  },
  {
    field: 'designation',
    label: 'Designation / Role',
    aliases: ['designation', 'role', 'title', 'job title', 'position', 'job role'],
    required: false,
    description: 'Official job title or designation.',
  },
  {
    field: 'employmentStatus',
    label: 'Lifecycle Status',
    aliases: ['status', 'employment status', 'working status', 'lifecycle status', 'current status', 'stage', 'lifecycle stage'],
    required: false,
    description: 'Onboarding, Active, Offboarding, or Exited.',
  },
  {
    field: 'hireDate',
    label: 'Date of Joining',
    aliases: ['joining date', 'hire date', 'date of joining', 'doj', 'start date', 'appointment date', 'join date', 'date of hire', 'joining'],
    required: true,
    description: 'Official employment start date.',
  },
  {
    field: 'lastWorkingDay',
    label: 'Last Working Day',
    aliases: ['last working day', 'last working date', 'lwd', 'exit date', 'resignation date', 'relieving date', 'separation date', 'end date'],
    required: false,
    description: 'Scheduled or actual departure date (required for Offboarding & Exited).',
  },
  {
    field: 'exitReason',
    label: 'Reason for Leaving',
    aliases: ['exit reason', 'reason for leaving', 'separation reason', 'resignation reason', 'departure reason'],
    required: false,
    description: 'Optional departure classification.',
  },
  {
    field: 'exitNotes',
    label: 'Handover & Exit Notes',
    aliases: ['exit notes', 'remarks', 'notes', 'comments', 'handover notes'],
    required: false,
    description: 'Transition and handover comments.',
  },
  {
    field: 'workLocation',
    label: 'Work Location / Site',
    aliases: ['location', 'site', 'work location', 'office location', 'city', 'branch', 'transferred to', 'transfer destination'],
    required: false,
    description: 'Office site, city, or work location.',
  },
  {
    field: 'reportingManager',
    label: 'Reporting Manager',
    aliases: ['reporting manager', 'manager', 'supervisor', 'reports to', 'lead'],
    required: false,
    description: 'Direct reporting manager or team supervisor.',
  },
  {
    field: 'vendor',
    label: 'Third Party Vendor',
    aliases: ['vendor', 'agency', 'provider', 'third party', 'supplier', 'contractor agency'],
    required: false,
    description: 'Third-party vendor or staffing agency name.',
  },
];

export interface ColumnDetectionResult {
  detectedHeaders: string[];
  suggestedMapping: Record<string, string>; // Excel header -> canonical field
  confidence: Record<string, number>; // 0 to 1
  previewSampleRows: Record<string, unknown>[];
  savedMappingMatched: boolean;
}

export class SmartImportService {
  /**
   * Normalize text string for fuzzy alias comparison
   */
  private normalizeHeader(header: string): string {
    return String(header || '')
      .toLowerCase()
      .replace(/[_\-.]+/g, ' ')
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Parse various date formats safely into YYYY-MM-DD
   */
  parseDateValue(rawVal: unknown): string | null {
    if (rawVal === undefined || rawVal === null || rawVal === '') {
      return null;
    }

    if (rawVal instanceof Date) {
      if (isNaN(rawVal.getTime())) return null;
      const y = rawVal.getUTCFullYear();
      const m = String(rawVal.getUTCMonth() + 1).padStart(2, '0');
      const d = String(rawVal.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    // Excel numeric date code (e.g. 45200)
    if (typeof rawVal === 'number' && rawVal > 1000 && rawVal < 100000) {
      const parsed = XLSX.SSF.parse_date_code(rawVal);
      if (parsed) {
        const y = parsed.y;
        const m = String(parsed.m).padStart(2, '0');
        const d = String(parsed.d).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }

    const str = String(rawVal).trim();
    if (!str) return null;

    // ISO format: YYYY-MM-DD
    const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (isoMatch) {
      const y = parseInt(isoMatch[1], 10);
      const m = String(parseInt(isoMatch[2], 10)).padStart(2, '0');
      const d = String(parseInt(isoMatch[3], 10)).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    // Common DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (dmyMatch) {
      const d = String(parseInt(dmyMatch[1], 10)).padStart(2, '0');
      const m = String(parseInt(dmyMatch[2], 10)).padStart(2, '0');
      const y = parseInt(dmyMatch[3], 10);
      return `${y}-${m}-${d}`;
    }

    // Textual dates e.g. "15-Jan-2026", "15 Jan 2026", "January 15, 2026"
    const parsedTs = Date.parse(str);
    if (!isNaN(parsedTs)) {
      const d = new Date(parsedTs);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dt = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dt}`;
    }

    return null;
  }

  /**
   * Retrieve workspace's saved import mappings from hr_company_profiles
   */
  async getSavedWorkspaceMapping(ownerUserId: string): Promise<Record<string, string>> {
    try {
      const res = await executeSql<{ saved_import_mappings: Record<string, string> | null }>(
        `SELECT saved_import_mappings FROM hr_company_profiles WHERE owner_user_id = $1 LIMIT 1`,
        [ownerUserId],
        { userId: ownerUserId, role: 'user' }
      );
      return res.rows[0]?.saved_import_mappings || {};
    } catch {
      return {};
    }
  }

  /**
   * Persist workspace column mappings
   */
  async saveWorkspaceMapping(ownerUserId: string, mapping: Record<string, string>): Promise<void> {
    try {
      await executeSql(
        `UPDATE hr_company_profiles
         SET saved_import_mappings = $1::jsonb, updated_at = CURRENT_TIMESTAMP
         WHERE owner_user_id = $2`,
        [JSON.stringify(mapping), ownerUserId],
        { userId: ownerUserId, role: 'user' }
      );
      logger.info({ ownerUserId }, 'Saved workspace import column mapping');
    } catch (err) {
      logger.warn({ err, ownerUserId }, 'Failed to save workspace import mapping');
    }
  }

  /**
   * Helper to suggest canonical column mappings for detected headers
   */
  suggestMappingForHeaders(
    detectedHeaders: string[],
    savedMapping: Record<string, string> = {}
  ): {
    suggestedMapping: Record<string, string>;
    confidence: Record<string, number>;
    savedMappingMatched: boolean;
  } {
    const suggestedMapping: Record<string, string> = {};
    const confidence: Record<string, number> = {};
    let savedMappingMatched = false;

    // 1. First check saved mappings
    for (const header of detectedHeaders) {
      if (savedMapping[header]) {
        suggestedMapping[header] = savedMapping[header];
        confidence[header] = 1.0;
        savedMappingMatched = true;
      }
    }

    // 2. For unmapped headers, apply alias matching
    for (const header of detectedHeaders) {
      if (suggestedMapping[header]) continue;

      const norm = this.normalizeHeader(header);
      let bestField = '';
      let highestScore = 0;

      for (const def of CANONICAL_IMPORT_FIELDS) {
        // Exact match against aliases
        if (def.aliases.includes(norm)) {
          bestField = def.field;
          highestScore = 0.95;
          break;
        }

        // Substring check
        for (const alias of def.aliases) {
          if (norm.includes(alias) || alias.includes(norm)) {
            const score = (Math.min(norm.length, alias.length) / Math.max(norm.length, alias.length)) * 0.8;
            if (score > highestScore) {
              highestScore = score;
              bestField = def.field;
            }
          }
        }
      }

      if (bestField && highestScore >= 0.5) {
        // Ensure canonical field isn't already assigned to a higher-confidence column
        const existingHeader = Object.keys(suggestedMapping).find(h => suggestedMapping[h] === bestField);
        if (!existingHeader || (confidence[existingHeader] || 0) < highestScore) {
          if (existingHeader) {
            delete suggestedMapping[existingHeader];
            delete confidence[existingHeader];
          }
          suggestedMapping[header] = bestField;
          confidence[header] = highestScore;
        }
      }
    }

    return { suggestedMapping, confidence, savedMappingMatched };
  }

  /**
   * Parse uploaded Excel buffer and detect columns intelligently across all sheets
   */
  async parseAndDetectColumns(
    buffer: Buffer,
    fileName: string,
    ownerUserId: string
  ): Promise<{
    session: ImportSession;
    detection: ColumnDetectionResult;
    sheets: SheetSessionData[];
    sheetOrder: string[];
    canonicalFields: ColumnAliasDefinition[];
  }> {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    } catch {
      throw new Error('Failed to read Excel file. Please ensure the file is a valid .xlsx or .xls document.');
    }

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('The uploaded Excel document does not contain any sheets.');
    }

    // 1. Analyze all sheets using excelSheetAnalyzer
    const workbookAnalysis = excelSheetAnalyzer.analyzeWorkbook(buffer, fileName);
    const savedMapping = await this.getSavedWorkspaceMapping(ownerUserId);

    // 2. Build SheetSessionData for every sheet in workbook
    const sheetSessionList: SheetSessionData[] = [];

    for (const sheetAnalysis of workbookAnalysis.sheets) {
      const worksheet = workbook.Sheets[sheetAnalysis.sheetName];
      if (!worksheet) continue;

      const rawGrid = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
      const headerRowIndex = sheetAnalysis.headerRowIndex; // 1-indexed
      const detectedHeaders = sheetAnalysis.detectedHeaders;

      // Extract raw rows (rows from headerRowIndex to end of grid)
      const rawRows: Record<string, unknown>[] = [];
      const sampleRows: Record<string, string>[] = [];

      for (let r = headerRowIndex; r < rawGrid.length; r++) {
        const row = rawGrid[r] || [];
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

      // Compute suggested column mappings for this sheet
      const mappingResult = this.suggestMappingForHeaders(detectedHeaders, savedMapping);

      sheetSessionList.push({
        sheetName: sheetAnalysis.sheetName,
        category: sheetAnalysis.suggestedCategory,
        categoryLabel: sheetAnalysis.categoryLabel,
        importable: sheetAnalysis.importable,
        headerRowIndex,
        confidence: sheetAnalysis.confidence,
        isLowConfidence: sheetAnalysis.isLowConfidence,
        totalRows: sheetAnalysis.totalRows,
        estimatedDataRows: rawRows.length,
        columnCount: detectedHeaders.length,
        detectedHeaders,
        columnMapping: mappingResult.suggestedMapping,
        rawGrid,
        rawRows,
        sampleRows,
        previewGrid: sheetAnalysis.previewGrid,
      });
    }

    // 3. Create multi-sheet session in session store
    const session = importSessionStore.createMultiSheetSession(
      ownerUserId,
      fileName,
      buffer.length,
      sheetSessionList
    );

    // Primary sheet detection result for backwards compatibility
    const primarySheet =
      sheetSessionList.find(s => s.importable && s.category === 'REGULAR_EMPLOYEES') ||
      sheetSessionList.find(s => s.importable) ||
      sheetSessionList[0];

    const primaryMapping = primarySheet ? this.suggestMappingForHeaders(primarySheet.detectedHeaders, savedMapping) : {
      suggestedMapping: {},
      confidence: {},
      savedMappingMatched: false,
    };

    return {
      session,
      detection: {
        detectedHeaders: primarySheet?.detectedHeaders || [],
        suggestedMapping: primaryMapping.suggestedMapping,
        confidence: primaryMapping.confidence,
        previewSampleRows: primarySheet?.rawRows.slice(0, 5) || [],
        savedMappingMatched: primaryMapping.savedMappingMatched,
      },
      sheets: Object.values(session.sheets),
      sheetOrder: session.sheetOrder,
      canonicalFields: CANONICAL_IMPORT_FIELDS,
    };
  }

  /**
   * Update header row for a specific worksheet and re-extract headers and mapping
   */
  async updateSheetHeader(
    sessionId: string,
    ownerUserId: string,
    sheetName: string,
    newHeaderRow: number
  ): Promise<SheetSessionData> {
    const updated = importSessionStore.updateSheetHeaderRow(sessionId, ownerUserId, sheetName, newHeaderRow);
    if (!updated) {
      throw new Error(`Unable to update header row for sheet "${sheetName}". Sheet not found or invalid row index.`);
    }

    const savedMapping = await this.getSavedWorkspaceMapping(ownerUserId);
    const mappingResult = this.suggestMappingForHeaders(updated.detectedHeaders, savedMapping);
    updated.columnMapping = mappingResult.suggestedMapping;

    return updated;
  }

  /**
   * Update category or importable state for a specific worksheet
   */
  async updateSheetConfig(
    sessionId: string,
    ownerUserId: string,
    sheetName: string,
    category: SheetCategory,
    importable: boolean
  ): Promise<SheetSessionData> {
    const updated = importSessionStore.updateSheetConfig(sessionId, ownerUserId, sheetName, category, importable);
    if (!updated) {
      throw new Error(`Unable to update configuration for sheet "${sheetName}".`);
    }
    return updated;
  }

  /**
   * Reconcile all active worksheets and validate unified employee records
   */
  async validateMultiSheetMapping(
    sessionId: string,
    ownerUserId: string,
    sheetMappings: Record<string, Record<string, string>> = {},
    saveMappingForWorkspace = false
  ): Promise<ImportSession> {
    const session = importSessionStore.getSession(sessionId, ownerUserId);
    if (!session) {
      throw new Error('Your import session has expired. Please upload the Excel file again.');
    }

    // Update each sheet's mapping from payload
    for (const [sheetName, mapping] of Object.entries(sheetMappings)) {
      if (session.sheets[sheetName]) {
        session.sheets[sheetName].columnMapping = mapping;
      }
    }

    // Save primary sheet mapping if requested
    if (saveMappingForWorkspace) {
      const primarySheet =
        Object.values(session.sheets).find(s => s.importable && s.category === 'REGULAR_EMPLOYEES') ||
        Object.values(session.sheets).find(s => s.importable);
      if (primarySheet && primarySheet.columnMapping) {
        await this.saveWorkspaceMapping(ownerUserId, primarySheet.columnMapping);
      }
    }

    // Fetch existing employee codes and emails in workspace to detect duplicates
    const existingEmpRes = await executeSql<{ employee_code: string; work_email: string | null }>(
      `SELECT employee_code, work_email 
       FROM hr_employees 
       WHERE owner_user_id = $1 AND deleted_at IS NULL`,
      [ownerUserId],
      { userId: ownerUserId, role: 'user' }
    );

    const existingCodes = new Set(
      (existingEmpRes.rows || []).map(r => String(r.employee_code).trim().toLowerCase())
    );
    const existingEmails = new Set(
      (existingEmpRes.rows || [])
        .map(r => (r.work_email ? String(r.work_email).trim().toLowerCase() : ''))
        .filter(Boolean)
    );

    // Reconciled employee internal model
    interface MutableReconciledRow {
      rowIndex: number;
      primarySheet: string;
      sourceSheets: Set<string>;
      isHistorical: boolean;
      originalData: Record<string, unknown>;
      employeeCode: string;
      fullName: string;
      firstName: string;
      lastName: string;
      workEmail: string;
      personalEmail: string;
      phone: string;
      department: string;
      designation: string;
      employmentStatus: 'ONBOARDING' | 'ACTIVE' | 'OFFBOARDING' | 'EXITED';
      hireDate: string;
      lastWorkingDay: string | null;
      exitDate: string | null;
      exitReason: string | null;
      exitNotes: string | null;
      workLocation?: string;
      reportingManager?: string;
      vendor?: string;
      customNotes: string[];
    }

    const reconciledRows: MutableReconciledRow[] = [];
    const codeToRowsMap = new Map<string, MutableReconciledRow[]>();
    let generatedRowSeq = 1;

    const addRow = (row: MutableReconciledRow) => {
      reconciledRows.push(row);
      if (row.employeeCode) {
        const lower = row.employeeCode.toLowerCase();
        const list = codeToRowsMap.get(lower) || [];
        list.push(row);
        codeToRowsMap.set(lower, list);
      }
    };

    // Helper to extract a mapped field from a raw row
    const getFieldVal = (raw: Record<string, unknown>, mapping: Record<string, string>, field: string): string => {
      const header = Object.keys(mapping).find(h => mapping[h] === field);
      if (!header) return '';
      const v = raw[header];
      return v !== undefined && v !== null ? String(v).trim() : '';
    };

    // PASS 1: Base employees from REGULAR_EMPLOYEES sheets
    const regularSheets = Object.values(session.sheets).filter(s => s.importable && s.category === 'REGULAR_EMPLOYEES');
    for (const sheet of regularSheets) {
      const mapping = sheet.columnMapping || {};
      sheet.rawRows.forEach((raw, i) => {
        const rowNum = sheet.headerRowIndex + 1 + i;
        const code = getFieldVal(raw, mapping, 'employeeCode');

        const fullName = getFieldVal(raw, mapping, 'fullName');
        let firstName = getFieldVal(raw, mapping, 'firstName');
        let lastName = getFieldVal(raw, mapping, 'lastName');
        if (fullName && !firstName) {
          const parts = fullName.split(/\s+/);
          firstName = parts[0] || '';
          lastName = parts.slice(1).join(' ') || lastName;
        }

        const rawStatus = getFieldVal(raw, mapping, 'employmentStatus');
        let employmentStatus: 'ONBOARDING' | 'ACTIVE' | 'OFFBOARDING' | 'EXITED' = 'ACTIVE';
        if (rawStatus) {
          const norm = rawStatus.toUpperCase();
          if (['ONBOARDING', 'ACTIVE', 'OFFBOARDING', 'EXITED'].includes(norm)) {
            employmentStatus = norm as any;
          } else if (norm.includes('ONBOARD') || norm.includes('JOIN')) {
            employmentStatus = 'ONBOARDING';
          } else if (norm.includes('OFFBOARD') || norm.includes('RESIGN') || norm.includes('NOTICE')) {
            employmentStatus = 'OFFBOARDING';
          } else if (norm.includes('EXIT') || norm.includes('LEFT') || norm.includes('RELIEV') || norm.includes('TERMINAT')) {
            employmentStatus = 'EXITED';
          }
        }

        const rawHireDate = getFieldVal(raw, mapping, 'hireDate');
        const rawLwd = getFieldVal(raw, mapping, 'lastWorkingDay');
        const parsedHire = this.parseDateValue(rawHireDate);
        const parsedLwd = this.parseDateValue(rawLwd);

        addRow({
          rowIndex: rowNum,
          primarySheet: sheet.sheetName,
          sourceSheets: new Set([sheet.sheetName]),
          isHistorical: false,
          originalData: raw,
          employeeCode: code,
          fullName: fullName || `${firstName} ${lastName}`.trim(),
          firstName,
          lastName,
          workEmail: getFieldVal(raw, mapping, 'workEmail'),
          personalEmail: getFieldVal(raw, mapping, 'personalEmail'),
          phone: getFieldVal(raw, mapping, 'phone'),
          department: getFieldVal(raw, mapping, 'department'),
          designation: getFieldVal(raw, mapping, 'designation'),
          employmentStatus,
          hireDate: parsedHire || rawHireDate,
          lastWorkingDay: parsedLwd,
          exitDate: employmentStatus === 'EXITED' ? parsedLwd : null,
          exitReason: getFieldVal(raw, mapping, 'exitReason') || null,
          exitNotes: getFieldVal(raw, mapping, 'exitNotes') || null,
          workLocation: getFieldVal(raw, mapping, 'workLocation'),
          reportingManager: getFieldVal(raw, mapping, 'reportingManager'),
          customNotes: [],
        });
      });
    }

    // PASS 2: Third party workforce from THIRD_PARTY sheets
    const thirdPartySheets = Object.values(session.sheets).filter(s => s.importable && s.category === 'THIRD_PARTY');
    for (const sheet of thirdPartySheets) {
      const mapping = sheet.columnMapping || {};
      sheet.rawRows.forEach((raw, i) => {
        const rowNum = sheet.headerRowIndex + 1 + i;
        const code = getFieldVal(raw, mapping, 'employeeCode');

        const fullName = getFieldVal(raw, mapping, 'fullName');
        let firstName = getFieldVal(raw, mapping, 'firstName');
        let lastName = getFieldVal(raw, mapping, 'lastName');
        if (fullName && !firstName) {
          const parts = fullName.split(/\s+/);
          firstName = parts[0] || '';
          lastName = parts.slice(1).join(' ') || lastName;
        }

        const rawStatus = getFieldVal(raw, mapping, 'employmentStatus');
        let employmentStatus: 'ONBOARDING' | 'ACTIVE' | 'OFFBOARDING' | 'EXITED' = 'ACTIVE';
        if (rawStatus && rawStatus.toLowerCase().includes('exit')) {
          employmentStatus = 'EXITED';
        }

        const rawHireDate = getFieldVal(raw, mapping, 'hireDate');
        const parsedHire = this.parseDateValue(rawHireDate);
        const vendor = getFieldVal(raw, mapping, 'vendor');

        const existingMatching = code ? codeToRowsMap.get(code.toLowerCase()) : null;
        if (!existingMatching || existingMatching.length === 0) {
          addRow({
            rowIndex: rowNum,
            primarySheet: sheet.sheetName,
            sourceSheets: new Set([sheet.sheetName]),
            isHistorical: false,
            originalData: raw,
            employeeCode: code,
            fullName: fullName || `${firstName} ${lastName}`.trim(),
            firstName,
            lastName,
            workEmail: getFieldVal(raw, mapping, 'workEmail'),
            personalEmail: getFieldVal(raw, mapping, 'personalEmail'),
            phone: getFieldVal(raw, mapping, 'phone'),
            department: getFieldVal(raw, mapping, 'department') || (vendor ? `Third Party (${vendor})` : 'Third Party Workforce'),
            designation: getFieldVal(raw, mapping, 'designation') || 'Contractor',
            employmentStatus,
            hireDate: parsedHire || rawHireDate,
            lastWorkingDay: null,
            exitDate: null,
            exitReason: null,
            exitNotes: vendor ? `Vendor: ${vendor}` : null,
            workLocation: getFieldVal(raw, mapping, 'workLocation'),
            vendor,
            customNotes: vendor ? [`Vendor: ${vendor}`] : [],
          });
        } else {
          for (const existing of existingMatching) {
            existing.sourceSheets.add(sheet.sheetName);
            if (vendor) existing.vendor = vendor;
          }
        }
      });
    }

    // PASS 3: RESIGNATION_TRACKER sheets (lifecycle updates / historical departures)
    const resignationSheets = Object.values(session.sheets).filter(s => s.importable && s.category === 'RESIGNATION_TRACKER');
    for (const sheet of resignationSheets) {
      const mapping = sheet.columnMapping || {};
      sheet.rawRows.forEach((raw, i) => {
        const rowNum = sheet.headerRowIndex + 1 + i;
        const code = getFieldVal(raw, mapping, 'employeeCode');
        const key = code ? code.toLowerCase() : null;

        const rawLwd = getFieldVal(raw, mapping, 'lastWorkingDay');
        const parsedLwd = this.parseDateValue(rawLwd);
        const exitReason = getFieldVal(raw, mapping, 'exitReason') || 'Resignation';
        const rawStatus = getFieldVal(raw, mapping, 'employmentStatus');

        let statusToSet: 'OFFBOARDING' | 'EXITED' = 'OFFBOARDING';
        const today = new Date().toISOString().slice(0, 10);
        if (parsedLwd && parsedLwd < today) {
          statusToSet = 'EXITED';
        } else if (rawStatus && (rawStatus.toLowerCase().includes('non active') || rawStatus.toLowerCase().includes('exit'))) {
          statusToSet = 'EXITED';
        }

        const existingMatching = key ? codeToRowsMap.get(key) : null;
        if (existingMatching && existingMatching.length > 0) {
          for (const existing of existingMatching) {
            existing.sourceSheets.add(sheet.sheetName);
            existing.lastWorkingDay = parsedLwd || existing.lastWorkingDay;
            existing.exitReason = exitReason;
            existing.employmentStatus = statusToSet;
            if (statusToSet === 'EXITED') {
              existing.exitDate = existing.lastWorkingDay;
            }
            existing.customNotes.push(`Resignation tracked (${sheet.sheetName})`);
          }
        } else if (code) {
          // Historical exit record
          const fullName = getFieldVal(raw, mapping, 'fullName');
          let firstName = getFieldVal(raw, mapping, 'firstName');
          let lastName = getFieldVal(raw, mapping, 'lastName');
          if (fullName && !firstName) {
            const parts = fullName.split(/\s+/);
            firstName = parts[0] || '';
            lastName = parts.slice(1).join(' ') || lastName;
          }
          const rawHireDate = getFieldVal(raw, mapping, 'hireDate');
          const parsedHire = this.parseDateValue(rawHireDate);

          addRow({
            rowIndex: rowNum,
            primarySheet: sheet.sheetName,
            sourceSheets: new Set([sheet.sheetName]),
            isHistorical: true,
            originalData: raw,
            employeeCode: code,
            fullName: fullName || `${firstName} ${lastName}`.trim(),
            firstName,
            lastName,
            workEmail: getFieldVal(raw, mapping, 'workEmail'),
            personalEmail: getFieldVal(raw, mapping, 'personalEmail'),
            phone: getFieldVal(raw, mapping, 'phone'),
            department: getFieldVal(raw, mapping, 'department') || 'Historical Records',
            designation: getFieldVal(raw, mapping, 'designation') || 'Former Employee',
            employmentStatus: 'EXITED',
            hireDate: parsedHire || rawHireDate,
            lastWorkingDay: parsedLwd,
            exitDate: parsedLwd,
            exitReason,
            exitNotes: 'Historical exit record imported from Resignation Tracker',
            customNotes: ['Historical departure record'],
          });
        }
      });
    }

    // PASS 4: RETENTION_TRACKER sheets (resignation withdrawals & employee restoration)
    const retentionSheets = Object.values(session.sheets).filter(s => s.importable && s.category === 'RETENTION_TRACKER');
    for (const sheet of retentionSheets) {
      const mapping = sheet.columnMapping || {};
      sheet.rawRows.forEach((raw) => {
        const code = getFieldVal(raw, mapping, 'employeeCode');
        const key = code ? code.toLowerCase() : null;
        if (!key) return;

        const existingMatching = codeToRowsMap.get(key);
        if (existingMatching && existingMatching.length > 0) {
          for (const existing of existingMatching) {
            existing.sourceSheets.add(sheet.sheetName);
            // Restore to Active and clear pending LWD
            existing.employmentStatus = 'ACTIVE';
            existing.lastWorkingDay = null;
            existing.exitDate = null;
            existing.exitReason = null;
            existing.customNotes.push('Resignation withdrawn: Restored to Active');
          }
        }
      });
    }

    // PASS 5: TRANSFER sheets (location updates)
    const transferSheets = Object.values(session.sheets).filter(s => s.importable && s.category === 'TRANSFER');
    for (const sheet of transferSheets) {
      const mapping = sheet.columnMapping || {};
      sheet.rawRows.forEach((raw) => {
        const code = getFieldVal(raw, mapping, 'employeeCode');
        const key = code ? code.toLowerCase() : null;
        if (!key) return;

        const newLocation = getFieldVal(raw, mapping, 'workLocation') || String(raw['Transferred To'] || raw['transferred to'] || '').trim();
        const effectiveDate = String(raw['Effective Date'] || raw['effective date'] || '').trim();

        const existingMatching = codeToRowsMap.get(key);
        if (existingMatching && existingMatching.length > 0) {
          for (const existing of existingMatching) {
            existing.sourceSheets.add(sheet.sheetName);
            if (newLocation) {
              existing.workLocation = newLocation;
              existing.customNotes.push(`Transferred to ${newLocation}${effectiveDate ? ` effective ${effectiveDate}` : ''}`);
            }
          }
        }
      });
    }

    // Compute intra-batch code occurrences for duplicate checking
    const codeOccurrences = new Map<string, number[]>();
    for (const row of reconciledRows) {
      if (row.employeeCode) {
        const lowerCode = row.employeeCode.toLowerCase();
        const list = codeOccurrences.get(lowerCode) || [];
        list.push(row.rowIndex);
        codeOccurrences.set(lowerCode, list);
      }
    }

    const fileSeenEmails = new Map<string, number>();
    const validatedRows: ValidatedImportRow[] = [];
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // VALIDATION PHASE
    let displayRowIndex = 2;
    for (const row of reconciledRows) {
      const rowIndex = displayRowIndex++;
      const errors: RowValidationError[] = [];
      const warnings: string[] = [];

      // 1. Employee Code Validation (CRITICAL: Never auto-generate!)
      if (!row.employeeCode) {
        errors.push({
          field: 'employeeCode',
          message: 'Employee ID / Code is missing. HR must supply an employee identifier.',
          critical: true,
        });
      } else {
        const lowerCode = row.employeeCode.toLowerCase();
        const dupRows = codeOccurrences.get(lowerCode) || [];
        if (existingCodes.has(lowerCode)) {
          errors.push({
            field: 'employeeCode',
            message: `Employee Code "${row.employeeCode}" already exists in your workspace. Overwrites are not permitted.`,
            critical: true,
          });
        } else if (dupRows.length > 1) {
          const otherRows = dupRows.filter(r => r !== row.rowIndex).join(', ');
          errors.push({
            field: 'employeeCode',
            message: `Duplicate Employee Code "${row.employeeCode}" within file (also appears in Row ${otherRows}).`,
            critical: true,
          });
        }
      }

      // 2. Name Validation
      if (!row.firstName && !row.fullName) {
        errors.push({
          field: 'firstName',
          message: 'Employee name is required.',
          critical: true,
        });
      }

      // 3. Email Validation
      if (row.workEmail) {
        if (!EMAIL_REGEX.test(row.workEmail)) {
          errors.push({
            field: 'workEmail',
            message: `Invalid work email format: "${row.workEmail}".`,
            critical: true,
          });
        } else {
          const lowerEmail = row.workEmail.toLowerCase();
          if (existingEmails.has(lowerEmail)) {
            warnings.push(`Work email "${row.workEmail}" is already used by an existing employee.`);
          }
          if (fileSeenEmails.has(lowerEmail)) {
            warnings.push(`Work email "${row.workEmail}" appears multiple times in this import.`);
          } else {
            fileSeenEmails.set(lowerEmail, rowIndex);
          }
        }
      }

      if (row.personalEmail && !EMAIL_REGEX.test(row.personalEmail)) {
        errors.push({
          field: 'personalEmail',
          message: `Invalid personal email format: "${row.personalEmail}".`,
          critical: true,
        });
      }

      // 4. Date & Lifecycle Resolution
      const hireDate = this.parseDateValue(row.hireDate);
      if (!hireDate) {
        errors.push({
          field: 'hireDate',
          message: row.hireDate ? `Invalid joining date: "${row.hireDate}". Expected format: YYYY-MM-DD or DD/MM/YYYY.` : 'Date of Joining is required.',
          critical: true,
        });
      }

      const lastWorkingDay = this.parseDateValue(row.lastWorkingDay);
      if (row.lastWorkingDay && !lastWorkingDay) {
        errors.push({
          field: 'lastWorkingDay',
          message: `Invalid last working day / exit date: "${row.lastWorkingDay}".`,
          critical: true,
        });
      }

      if (row.employmentStatus === 'OFFBOARDING' && !lastWorkingDay) {
        errors.push({
          field: 'lastWorkingDay',
          message: 'Last working day is mandatory for offboarding employees.',
          critical: true,
        });
      }

      if (row.employmentStatus === 'EXITED' && !lastWorkingDay) {
        errors.push({
          field: 'lastWorkingDay',
          message: 'Exit date is mandatory for exited employees.',
          critical: true,
        });
      }

      if (hireDate && lastWorkingDay && lastWorkingDay < hireDate) {
        errors.push({
          field: 'lastWorkingDay',
          message: `Departure date (${lastWorkingDay}) cannot precede joining date (${hireDate}).`,
          critical: true,
        });
      }

      // Append custom notes to exitNotes
      let finalExitNotes = row.exitNotes || '';
      if (row.customNotes.length > 0) {
        finalExitNotes = finalExitNotes ? `${finalExitNotes} | ${row.customNotes.join('; ')}` : row.customNotes.join('; ');
      }

      let validationStatus: 'VALID' | 'NEEDS_ATTENTION' | 'DUPLICATE' = 'VALID';
      if (errors.some(e => e.message.includes('Duplicate') || e.message.includes('already exists'))) {
        validationStatus = 'DUPLICATE';
      } else if (errors.length > 0) {
        validationStatus = 'NEEDS_ATTENTION';
      }

      validatedRows.push({
        rowIndex,
        originalData: row.originalData,
        mappedData: {
          employeeCode: row.employeeCode,
          firstName: row.firstName,
          lastName: row.lastName,
          fullName: row.fullName || `${row.firstName} ${row.lastName}`.trim(),
          workEmail: row.workEmail,
          personalEmail: row.personalEmail,
          phone: row.phone,
          department: row.department,
          designation: row.designation,
          employmentStatus: row.employmentStatus,
          hireDate: hireDate || row.hireDate,
          lastWorkingDay: lastWorkingDay || null,
          exitDate: row.employmentStatus === 'EXITED' ? lastWorkingDay : null,
          exitReason: row.exitReason,
          exitNotes: finalExitNotes || null,
        },
        validationStatus,
        errors,
        warnings,
        sourceSheets: Array.from(row.sourceSheets),
        isHistorical: row.isHistorical,
      });
    }

    // Build summary
    let valid = 0;
    let attention = 0;
    let duplicate = 0;
    const breakdown = { onboarding: 0, active: 0, offboarding: 0, exited: 0 };

    for (const r of validatedRows) {
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

    const summary: ImportSummary = {
      totalRecords: validatedRows.length,
      validRecords: valid,
      needsAttentionRecords: attention,
      duplicateRecords: duplicate,
      statusBreakdown: breakdown,
    };

    // Primary mapping alias
    const primaryMapping = (session.sheetOrder[0] && session.sheets[session.sheetOrder[0]])
      ? session.sheets[session.sheetOrder[0]].columnMapping
      : {};

    const updatedSession = importSessionStore.updateSessionValidation(
      sessionId,
      ownerUserId,
      primaryMapping,
      validatedRows,
      summary
    );

    return updatedSession!;
  }

  /**
   * Run validation on all extracted rows using the confirmed column mapping (backward compatible)
   */
  async validateSessionRows(
    sessionId: string,
    ownerUserId: string,
    columnMapping: Record<string, string>,
    saveMappingForWorkspace = false
  ): Promise<ImportSession> {
    const session = importSessionStore.getSession(sessionId, ownerUserId);
    if (!session) {
      throw new Error('Your import session has expired. Please upload the Excel file again.');
    }

    // Apply columnMapping to all active sheets or primary sheet
    const sheetMappings: Record<string, Record<string, string>> = {};
    for (const sheetName of session.sheetOrder) {
      sheetMappings[sheetName] = columnMapping;
    }

    return this.validateMultiSheetMapping(sessionId, ownerUserId, sheetMappings, saveMappingForWorkspace);
  }

  /**
   * Commit and insert approved valid records into PostgreSQL in controlled batches
   */
  async executeImport(
    sessionId: string,
    ownerUserId: string,
    mode: 'valid_only' | 'all' = 'valid_only'
  ): Promise<{
    historyId: string;
    totalProcessed: number;
    importedCount: number;
    skippedCount: number;
    errorCount: number;
    duplicateCount: number;
    statusBreakdown: Record<string, number>;
  }> {
    const session = importSessionStore.getSession(sessionId, ownerUserId);
    if (!session) {
      throw new Error('Your import session has expired. Please upload the Excel file again.');
    }

    const rowsToImport = session.validatedRows.filter(r => r.validationStatus === 'VALID');

    if (rowsToImport.length === 0) {
      throw new Error('There are no valid records to import. Please correct the records requiring attention or upload a valid file.');
    }

    const skippedRows = session.validatedRows.filter(r => r.validationStatus !== 'VALID');
    const duplicateCount = session.validatedRows.filter(r => r.validationStatus === 'DUPLICATE').length;

    // 1. Resolve or create departments and designations in workspace
    const existingDepts = await masterService.getDepartments(ownerUserId);
    const existingDesigs = await masterService.getDesignations(ownerUserId);

    const deptMap = new Map<string, number>();
    for (const d of existingDepts) {
      deptMap.set(d.departmentName.toLowerCase(), d.departmentId);
    }

    const desigMap = new Map<string, number>();
    for (const d of existingDesigs) {
      desigMap.set(d.designationName.toLowerCase(), d.designationId);
    }

    // Provision missing departments
    for (const row of rowsToImport) {
      const dName = row.mappedData.department?.trim();
      if (dName && !deptMap.has(dName.toLowerCase())) {
        try {
          const created = await masterService.createDepartment({ departmentName: dName }, ownerUserId);
          deptMap.set(dName.toLowerCase(), created.departmentId);
        } catch {
          // Handled or exists
        }
      }

      const desName = row.mappedData.designation?.trim();
      if (desName && !desigMap.has(desName.toLowerCase())) {
        try {
          const created = await masterService.createDesignation({ designationName: desName }, ownerUserId);
          desigMap.set(desName.toLowerCase(), created.designationId);
        } catch {
          // Handled or exists
        }
      }
    }

    // 2. Batch insert employees in chunks of 100 within a tenant transaction
    const BATCH_SIZE = 100;
    let importedCount = 0;
    const statusBreakdown = { ONBOARDING: 0, ACTIVE: 0, OFFBOARDING: 0, EXITED: 0 };

    await withTenantContext({ userId: ownerUserId, role: 'user' }, async (client) => {
      for (let i = 0; i < rowsToImport.length; i += BATCH_SIZE) {
        const chunk = rowsToImport.slice(i, i + BATCH_SIZE);

        for (const row of chunk) {
          const m = row.mappedData;
          const deptId = m.department ? deptMap.get(m.department.toLowerCase()) || null : null;
          const desigId = m.designation ? desigMap.get(m.designation.toLowerCase()) || null : null;

          const insertRes = await client.query<{ employee_id: number }>(
            `INSERT INTO hr_employees (
              owner_user_id,
              employee_code,
              first_name,
              last_name,
              work_email,
              personal_email,
              phone,
              department_id,
              designation_id,
              employment_status,
              hire_date,
              exit_date,
              last_working_day,
              exit_reason,
              exit_notes,
              created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $1)
            ON CONFLICT DO NOTHING
            RETURNING employee_id`,
            [
              ownerUserId,
              m.employeeCode,
              m.firstName,
              m.lastName || null,
              m.workEmail || null,
              m.personalEmail || null,
              m.phone || null,
              deptId,
              desigId,
              m.employmentStatus,
              m.hireDate,
              m.exitDate || m.lastWorkingDay || null,
              m.lastWorkingDay || null,
              m.exitReason || null,
              m.exitNotes || null,
            ]
          );

          if ((insertRes.rows || []).length > 0) {
            importedCount++;
            statusBreakdown[m.employmentStatus]++;
            const newEmpId = insertRes.rows[0].employee_id;

            // If offboarding, initialize hr_offboarding record
            if (m.employmentStatus === 'OFFBOARDING' && m.lastWorkingDay) {
              await client.query(
                `INSERT INTO hr_offboarding (
                  owner_user_id,
                  employee_id,
                  notice_date,
                  planned_exit_date,
                  exit_reason,
                  clearance_status,
                  notes,
                  contact_email,
                  created_by
                ) VALUES ($1, $2, CURRENT_DATE, $3, $4, 'PENDING', $5, $6, $1)
                ON CONFLICT DO NOTHING`,
                [
                  ownerUserId,
                  newEmpId,
                  m.lastWorkingDay,
                  m.exitReason || 'Imported offboarding schedule',
                  m.exitNotes,
                  m.personalEmail || m.workEmail || null,
                ]
              );
            }
          }
        }
      }
    });

    // 3. Store lightweight import history record in hr_employee_import_history
    const errorSummary = skippedRows.map(r => ({
      rowIndex: r.rowIndex,
      employeeCode: r.mappedData.employeeCode || 'MISSING',
      name: r.mappedData.fullName || 'UNSPECIFIED',
      status: r.validationStatus,
      errors: r.errors.map(e => e.message),
    }));

    const historyRes = await executeSql<{ id: string }>(
      `INSERT INTO hr_employee_import_history (
        owner_user_id,
        filename,
        uploaded_by,
        total_records,
        imported_records,
        skipped_records,
        failed_records,
        duplicate_records,
        status,
        error_summary,
        status_breakdown,
        column_mapping
      ) VALUES ($1, $2, $1, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb)
      RETURNING id`,
      [
        ownerUserId,
        session.fileName,
        session.rawRows.length,
        importedCount,
        skippedRows.length,
        session.summary.needsAttentionRecords,
        duplicateCount,
        importedCount === session.rawRows.length ? 'COMPLETED' : importedCount > 0 ? 'PARTIAL' : 'FAILED',
        JSON.stringify(errorSummary.slice(0, 100)), // Bounded error summary
        JSON.stringify(statusBreakdown),
        JSON.stringify(session.columnMapping),
      ],
      { userId: ownerUserId, role: 'user' }
    );

    const historyId = historyRes.rows[0]?.id || '';

    // 4. Log in hr_audit_logs
    await auditService.log({
      userId: ownerUserId,
      actionType: 'IMPORT_EMPLOYEES',
      entityType: 'HR_EMPLOYEES',
      entityId: historyId,
      details: {
        fileName: session.fileName,
        importedCount,
        skippedCount: skippedRows.length,
        duplicateCount,
        statusBreakdown,
      },
    });

    // 5. Invalidate caches
    await dashboardCache.invalidate(ownerUserId);

    // 6. Delete completed temporary session from memory
    importSessionStore.deleteSession(sessionId, ownerUserId);

    logger.info({ ownerUserId, historyId, importedCount, skippedCount: skippedRows.length }, 'Completed employee batch import');

    return {
      historyId,
      totalProcessed: session.rawRows.length,
      importedCount,
      skippedCount: skippedRows.length,
      errorCount: session.summary.needsAttentionRecords,
      duplicateCount,
      statusBreakdown,
    };
  }

  /**
   * Generate an Excel error report buffer for a session
   */
  generateErrorReport(session: ImportSession): Buffer {
    const errorRows = session.validatedRows
      .filter(r => r.validationStatus !== 'VALID')
      .map(r => ({
        'Excel Row': r.rowIndex,
        'Employee ID / Code': r.mappedData.employeeCode || '',
        'Employee Name': r.mappedData.fullName || '',
        'Work Email': r.mappedData.workEmail || '',
        'Department': r.mappedData.department || '',
        'Designation': r.mappedData.designation || '',
        'Status': r.mappedData.employmentStatus || '',
        'Joining Date': r.mappedData.hireDate || '',
        'Last Working Day': r.mappedData.lastWorkingDay || '',
        'Validation Issues': r.errors.map(e => e.message).join(' | '),
        'Warnings': r.warnings.join(' | '),
      }));

    const worksheet = XLSX.utils.json_to_sheet(errorRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Import Errors');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  /**
   * Generate downloadable sample Excel template
   */
  generateStarterTemplate(): Buffer {
    const sampleData = [
      {
        'Employee ID': 'EMP-1001',
        'Full Name': 'Sarah Jenkins',
        'Work Email': 'sarah.j@acme.com',
        'Personal Email': 'sarah.jenkins@gmail.com',
        'Phone Number': '+1-555-0199',
        'Department': 'Engineering',
        'Job Title': 'Senior Frontend Engineer',
        'Employment Status': 'Active',
        'Date of Joining': '2025-03-10',
        'Last Working Day': '',
        'Exit Reason': '',
        'Handover Notes': '',
      },
      {
        'Employee ID': 'EMP-1002',
        'Full Name': 'David Zhao',
        'Work Email': 'david.z@acme.com',
        'Personal Email': 'davidzhao@gmail.com',
        'Phone Number': '+1-555-0142',
        'Department': 'Product Design',
        'Job Title': 'UI/UX Designer',
        'Employment Status': 'Onboarding',
        'Date of Joining': '2026-12-01',
        'Last Working Day': '',
        'Exit Reason': '',
        'Handover Notes': '',
      },
      {
        'Employee ID': 'EMP-1003',
        'Full Name': 'Elena Rostova',
        'Work Email': 'elena.r@acme.com',
        'Personal Email': 'elena.rostova@outlook.com',
        'Phone Number': '+1-555-0188',
        'Department': 'Marketing',
        'Job Title': 'Brand Strategist',
        'Employment Status': 'Offboarding',
        'Date of Joining': '2024-06-15',
        'Last Working Day': '2026-11-30',
        'Exit Reason': 'Relocation',
        'Handover Notes': 'Client brand guidelines transferred to team lead.',
      },
      {
        'Employee ID': 'EMP-1004',
        'Full Name': 'Michael Thorne',
        'Work Email': 'michael.t@acme.com',
        'Personal Email': 'm.thorne@gmail.com',
        'Phone Number': '+1-555-0177',
        'Department': 'Sales',
        'Job Title': 'Account Executive',
        'Employment Status': 'Exited',
        'Date of Joining': '2023-01-10',
        'Last Working Day': '2026-10-31',
        'Exit Reason': 'Better career opportunity',
        'Handover Notes': 'All accounts handed over to regional director.',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Employee Template');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  /**
   * List past import history for workspace
   */
  async listImportHistory(ownerUserId: string): Promise<Array<{
    id: string;
    filename: string;
    uploadedAt: string;
    totalRecords: number;
    importedRecords: number;
    skippedRecords: number;
    failedRecords: number;
    duplicateRecords: number;
    status: string;
    hasErrors: boolean;
  }>> {
    const res = await executeSql<{
      id: string;
      filename: string;
      created_at: string;
      total_records: number;
      imported_records: number;
      skipped_records: number;
      failed_records: number;
      duplicate_records: number;
      status: string;
      error_summary: unknown[];
    }>(
      `SELECT 
        id,
        filename,
        created_at,
        total_records,
        imported_records,
        skipped_records,
        failed_records,
        duplicate_records,
        status,
        error_summary
       FROM hr_employee_import_history
       WHERE owner_user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [ownerUserId],
      { userId: ownerUserId, role: 'user' }
    );

    return (res.rows || []).map(r => ({
      id: r.id,
      filename: r.filename,
      uploadedAt: new Date(r.created_at).toISOString(),
      totalRecords: Number(r.total_records),
      importedRecords: Number(r.imported_records),
      skippedRecords: Number(r.skipped_records),
      failedRecords: Number(r.failed_records),
      duplicateRecords: Number(r.duplicate_records),
      status: r.status,
      hasErrors: Array.isArray(r.error_summary) && r.error_summary.length > 0,
    }));
  }
}

export const smartImportService = new SmartImportService();
