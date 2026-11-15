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
  type RowValidationStatus,
  type ImportSummary,
  type ImportSession,
  type SheetSessionData,
  type ReconciliationType,
  type FieldDiff,
} from './import-session.store.js';
import { excelSheetAnalyzer, type SheetAnalysis, type SheetCategory } from './excel-sheet-analyzer.js';
import {
  employeeLifecycleReconciliationService,
  type RawEmployeeRecord,
  type ReconciledLifecycleResult,
} from './employee-lifecycle-reconciliation.service.js';

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
        detectedContentType: sheetAnalysis.detectedContentType,
        contentDescription: sheetAnalysis.contentDescription,
        defaultInclude: sheetAnalysis.defaultInclude,
        importable: sheetAnalysis.defaultInclude,
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

    // 4. Automatically run multi-sheet reconciliation and validation
    await this.validateMultiSheetMapping(session.sessionId, ownerUserId);
    const validatedSession = importSessionStore.getSession(session.sessionId, ownerUserId) || session;

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
      session: validatedSession,
      detection: {
        detectedHeaders: primarySheet?.detectedHeaders || [],
        suggestedMapping: primaryMapping.suggestedMapping,
        confidence: primaryMapping.confidence,
        previewSampleRows: primarySheet?.rawRows.slice(0, 5) || [],
        savedMappingMatched: primaryMapping.savedMappingMatched,
      },
      sheets: Object.values(validatedSession.sheets),
      sheetOrder: validatedSession.sheetOrder,
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
   * Update active sheet selection for an import session and re-run reconciliation
   */
  async selectSheetsForImport(
    sessionId: string,
    ownerUserId: string,
    selectedSheets: string[]
  ): Promise<ImportSession> {
    const session = importSessionStore.getSession(sessionId, ownerUserId);
    if (!session) {
      throw new Error('Your import session has expired. Please upload the Excel file again.');
    }

    const selectedSet = new Set(selectedSheets.map(s => s.trim().toLowerCase()));
    for (const sheet of Object.values(session.sheets)) {
      sheet.importable = selectedSet.has(sheet.sheetName.trim().toLowerCase());
    }

    // Re-run validation & reconciliation with newly selected sheets
    await this.validateMultiSheetMapping(sessionId, ownerUserId);
    const updated = importSessionStore.getSession(sessionId, ownerUserId);
    if (!updated) {
      throw new Error('Failed to retrieve updated session.');
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

    // Update each sheet's mapping from payload only if non-empty
    for (const [sheetName, mapping] of Object.entries(sheetMappings)) {
      if (session.sheets[sheetName] && mapping && Object.keys(mapping).length > 0) {
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

    // Fetch existing employees in workspace to detect updates vs new employees
    interface DbEmployeeRecord {
      id: number;
      employee_code: string;
      first_name: string;
      last_name: string | null;
      work_email: string | null;
      personal_email: string | null;
      phone: string | null;
      department_name: string | null;
      designation_name: string | null;
      employment_status: string;
      hire_date: string | null;
      last_working_day: string | null;
      exit_reason: string | null;
      exit_notes: string | null;
    }

    const existingEmpRes = await executeSql<DbEmployeeRecord>(
      `SELECT e.employee_id as id, e.employee_code, e.first_name, e.last_name, 
              e.work_email, e.personal_email, e.phone,
              d.department_name, ds.designation_name,
              e.employment_status, 
              TO_CHAR(e.hire_date, 'YYYY-MM-DD') as hire_date,
              TO_CHAR(e.last_working_day, 'YYYY-MM-DD') as last_working_day,
              e.exit_reason, e.exit_notes
       FROM hr_employees e
       LEFT JOIN hr_departments d ON d.department_id = e.department_id AND d.owner_user_id = e.owner_user_id
       LEFT JOIN hr_designations ds ON ds.designation_id = e.designation_id AND ds.owner_user_id = e.owner_user_id
       WHERE e.owner_user_id = $1 AND e.deleted_at IS NULL`,
      [ownerUserId],
      { userId: ownerUserId, role: 'user' }
    );

    const existingCodeMap = new Map<string, DbEmployeeRecord>();
    const existingEmailMap = new Map<string, DbEmployeeRecord>();

    for (const emp of existingEmpRes.rows || []) {
      if (emp.employee_code) {
        existingCodeMap.set(String(emp.employee_code).trim().toLowerCase(), emp);
      }
      if (emp.work_email) {
        existingEmailMap.set(String(emp.work_email).trim().toLowerCase(), emp);
      }
    }

    // Map existing rows to preserve manual edits by stable rowId or rowIndex
    const existingRowMap = new Map<string | number, ValidatedImportRow>();
    if (session.validatedRows && session.validatedRows.length > 0) {
      for (const r of session.validatedRows) {
        if (r.rowId) existingRowMap.set(r.rowId, r);
        existingRowMap.set(r.rowIndex, r);
      }
    }

    // Reconciled employee internal model
    interface MutableReconciledRow {
      rowId: string;
      rowIndex: number;
      sourceRowNumber: number;
      primarySheet: string;
      sourceSheets: Set<string>;
      isHistorical: boolean;
      isThirdParty: boolean;
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
      employmentCategory: 'REGULAR' | 'THIRD_PARTY' | 'HISTORICAL_EXIT' | 'ONBOARDING';
      hireDate: string;
      lastWorkingDay: string | null;
      exitDate: string | null;
      exitReason: string | null;
      exitNotes: string | null;
      workLocation?: string;
      reportingManager?: string;
      vendor?: string;
      customNotes: string[];

      // Lifecycle evaluation details
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
      needsAttention?: boolean;
      attentionReason?: string;
      requiresHrApproval?: boolean;
    }

    const reconciledRows: MutableReconciledRow[] = [];
    const codeToRowsMap = new Map<string, MutableReconciledRow[]>();

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

    // PASS 1: Base employees from REGULAR_EMPLOYEES sheets (e.g. Employee MIS)
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
        const rawHireDate = getFieldVal(raw, mapping, 'hireDate');
        const rawLwd = getFieldVal(raw, mapping, 'lastWorkingDay');
        const parsedHire = this.parseDateValue(rawHireDate);
        const parsedLwd = this.parseDateValue(rawLwd);

        const rawEmpRecord: RawEmployeeRecord = {
          sourceSheet: sheet.sheetName,
          sourceRowNumber: rowNum,
          employeeCode: code,
          fullName: fullName || `${firstName} ${lastName}`.trim(),
          firstName,
          lastName,
          workEmail: getFieldVal(raw, mapping, 'workEmail'),
          rawStatus,
          hireDate: parsedHire || rawHireDate,
          lastWorkingDay: parsedLwd,
          exitReason: getFieldVal(raw, mapping, 'exitReason') || null,
        };

        const lifecycleEval = employeeLifecycleReconciliationService.evaluateEmployeeMisLifecycle(rawEmpRecord);

        const sheetSlug = sheet.sheetName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const rowId = `rec_${session.sessionId.slice(0, 8)}_${sheetSlug}_row_${rowNum}_${i + 1}`;
        if (session.deletedRowIds && session.deletedRowIds.has(rowId)) {
          return;
        }

        addRow({
          rowId,
          rowIndex: rowNum,
          sourceRowNumber: rowNum,
          primarySheet: sheet.sheetName,
          sourceSheets: new Set([sheet.sheetName]),
          isHistorical: false,
          isThirdParty: false,
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
          employmentStatus: lifecycleEval.lifecycleStatus,
          employmentCategory: 'REGULAR',
          hireDate: parsedHire || rawHireDate,
          lastWorkingDay: parsedLwd,
          exitDate: lifecycleEval.lifecycleStatus === 'EXITED' ? parsedLwd : null,
          exitReason: getFieldVal(raw, mapping, 'exitReason') || null,
          exitNotes: getFieldVal(raw, mapping, 'exitNotes') || null,
          workLocation: getFieldVal(raw, mapping, 'workLocation'),
          reportingManager: getFieldVal(raw, mapping, 'reportingManager'),
          customNotes: [],
          rawExcelStatus: lifecycleEval.rawExcelStatus,
          lifecycleReason: lifecycleEval.classificationReason,
          supportingDates: lifecycleEval.supportingDates,
          conflicts: lifecycleEval.conflicts,
          needsAttention: lifecycleEval.needsAttention,
          attentionReason: lifecycleEval.attentionReason,
          requiresHrApproval: lifecycleEval.requiresHrApproval,
        });
      });
    }

    // PASS 2: Third party workforce from THIRD_PARTY sheets (e.g. Third Party MIS)
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
        if (rawStatus && (rawStatus.toLowerCase().includes('exit') || rawStatus.toLowerCase().includes('inactive') || rawStatus.toLowerCase().includes('non active'))) {
          employmentStatus = 'EXITED';
        }

        const rawHireDate = getFieldVal(raw, mapping, 'hireDate');
        const parsedHire = this.parseDateValue(rawHireDate);
        const vendor = getFieldVal(raw, mapping, 'vendor') || String(raw['Payroll'] || raw['payroll'] || raw['Agency'] || raw['agency'] || '').trim();

        const sheetSlug = sheet.sheetName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const rowId = `rec_${session.sessionId.slice(0, 8)}_${sheetSlug}_row_${rowNum}_${i + 1}`;
        if (session.deletedRowIds && session.deletedRowIds.has(rowId)) {
          return;
        }

        const existingMatching = code ? codeToRowsMap.get(code.toLowerCase()) : null;
        if (!existingMatching || existingMatching.length === 0) {
          addRow({
            rowId,
            rowIndex: rowNum,
            sourceRowNumber: rowNum,
            primarySheet: sheet.sheetName,
            sourceSheets: new Set([sheet.sheetName]),
            isHistorical: false,
            isThirdParty: true,
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
            employmentCategory: 'THIRD_PARTY',
            hireDate: parsedHire || rawHireDate,
            lastWorkingDay: null,
            exitDate: null,
            exitReason: null,
            exitNotes: vendor ? `Vendor: ${vendor}` : null,
            workLocation: getFieldVal(raw, mapping, 'workLocation'),
            vendor,
            customNotes: vendor ? [`Vendor: ${vendor}`] : [],
            rawExcelStatus: rawStatus || 'Active',
            lifecycleReason: vendor ? `Third-party vendor workforce managed via ${vendor}.` : 'Third-party workforce contractor.',
            supportingDates: {
              hireDate: parsedHire || rawHireDate,
              lastWorkingDay: null,
            },
            conflicts: [],
            needsAttention: !code,
            attentionReason: !code ? 'Missing contractor/worker code.' : undefined,
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
        const rawResignDate = getFieldVal(raw, mapping, 'exitDate') || String(raw['Resignation Date'] || raw['resignation date'] || '').trim();
        const parsedResignDate = this.parseDateValue(rawResignDate);
        const exitReason = getFieldVal(raw, mapping, 'exitReason') || 'Resignation';
        const rawStatus = getFieldVal(raw, mapping, 'employmentStatus');
        const fnfDone = String(raw['FNF Done'] || raw['fnf done'] || raw['FNF'] || '').trim();

        const resRecord: RawEmployeeRecord = {
          sourceSheet: sheet.sheetName,
          sourceRowNumber: rowNum,
          employeeCode: code,
          rawStatus,
          resignationDate: parsedResignDate || rawResignDate,
          lastWorkingDay: parsedLwd,
          exitReason,
          fnfDone,
        };

        const existingMatching = key ? codeToRowsMap.get(key) : null;
        if (existingMatching && existingMatching.length > 0) {
          for (const existing of existingMatching) {
            existing.sourceSheets.add(sheet.sheetName);

            // Reconcile across Employee MIS and Resignation Tracker
            const reconciled = employeeLifecycleReconciliationService.reconcileEmployeeLifecycle(
              {
                sourceSheet: existing.primarySheet,
                sourceRowNumber: existing.sourceRowNumber,
                employeeCode: existing.employeeCode,
                rawStatus: existing.rawExcelStatus,
                hireDate: existing.hireDate,
              },
              [resRecord]
            );

            existing.employmentStatus = reconciled.lifecycleStatus;
            existing.rawExcelStatus = reconciled.rawExcelStatus;
            existing.lifecycleReason = reconciled.classificationReason;
            existing.supportingDates = {
              ...existing.supportingDates,
              ...reconciled.supportingDates,
            };
            existing.conflicts = reconciled.conflicts;
            if (reconciled.needsAttention) {
              existing.needsAttention = true;
              existing.attentionReason = reconciled.attentionReason || existing.attentionReason;
            }
            if (reconciled.requiresHrApproval) {
              existing.requiresHrApproval = true;
            }

            existing.lastWorkingDay = parsedLwd || existing.lastWorkingDay;
            existing.exitReason = exitReason;
            if (reconciled.lifecycleStatus === 'EXITED') {
              existing.exitDate = existing.lastWorkingDay;
            }
            existing.customNotes.push(`Resignation tracked (${sheet.sheetName}: ${reconciled.lifecycleStatus})`);
          }
        } else if (code) {
          // Historical exit record (not present in Employee MIS)
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

          resRecord.fullName = fullName || `${firstName} ${lastName}`.trim();
          resRecord.firstName = firstName;
          resRecord.lastName = lastName;
          resRecord.hireDate = parsedHire || rawHireDate;
          resRecord.workEmail = getFieldVal(raw, mapping, 'workEmail');

          const evalResult = employeeLifecycleReconciliationService.evaluateResignationTrackerLifecycle(resRecord);

          const sheetSlug = sheet.sheetName.replace(/[^a-zA-Z0-9_-]/g, '_');
          const rowId = `rec_${session.sessionId.slice(0, 8)}_${sheetSlug}_row_${rowNum}_${i + 1}`;
          if (session.deletedRowIds && session.deletedRowIds.has(rowId)) {
            return;
          }

          addRow({
            rowId,
            rowIndex: rowNum,
            sourceRowNumber: rowNum,
            primarySheet: sheet.sheetName,
            sourceSheets: new Set([sheet.sheetName]),
            isHistorical: true,
            isThirdParty: false,
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
            employmentStatus: evalResult.lifecycleStatus,
            employmentCategory: 'HISTORICAL_EXIT',
            hireDate: parsedHire || rawHireDate,
            lastWorkingDay: parsedLwd,
            exitDate: evalResult.lifecycleStatus === 'EXITED' ? parsedLwd : null,
            exitReason,
            exitNotes: 'Historical exit record imported from Resignation Tracker',
            customNotes: ['Historical departure record'],
            rawExcelStatus: evalResult.rawExcelStatus,
            lifecycleReason: evalResult.classificationReason,
            supportingDates: evalResult.supportingDates,
            conflicts: evalResult.conflicts,
            needsAttention: evalResult.needsAttention,
            attentionReason: evalResult.attentionReason,
            requiresHrApproval: true,
          });
        }
      });
    }

    // PASS 4: RETENTION_TRACKER sheets (resignation withdrawals & employee restoration)
    const retentionSheets = Object.values(session.sheets).filter(s => s.importable && s.category === 'RETENTION_TRACKER');
    for (const sheet of retentionSheets) {
      const mapping = sheet.columnMapping || {};
      sheet.rawRows.forEach((raw, i) => {
        const rowNum = sheet.headerRowIndex + 1 + i;
        const code = getFieldVal(raw, mapping, 'employeeCode');
        const key = code ? code.toLowerCase() : null;
        if (!key) return;

        const retRecord: RawEmployeeRecord = {
          sourceSheet: sheet.sheetName,
          sourceRowNumber: rowNum,
          employeeCode: code,
          rawStatus: getFieldVal(raw, mapping, 'employmentStatus') || 'Active/Resignation Withdrawn',
          lastWorkingDay: 'Resignation Withdrawn',
        };

        const existingMatching = codeToRowsMap.get(key);
        if (existingMatching && existingMatching.length > 0) {
          for (const existing of existingMatching) {
            existing.sourceSheets.add(sheet.sheetName);

            const reconciled = employeeLifecycleReconciliationService.reconcileEmployeeLifecycle(
              {
                sourceSheet: existing.primarySheet,
                sourceRowNumber: existing.sourceRowNumber,
                employeeCode: existing.employeeCode,
                rawStatus: existing.rawExcelStatus,
              },
              [retRecord]
            );

            // Restore to Active and clear pending LWD
            existing.employmentStatus = 'ACTIVE';
            existing.rawExcelStatus = reconciled.rawExcelStatus;
            existing.lifecycleReason = reconciled.classificationReason;
            existing.lastWorkingDay = null;
            existing.exitDate = null;
            existing.exitReason = null;
            existing.conflicts = [];
            existing.customNotes.push('Resignation withdrawn in Retention Tracker: Restored to Active');
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
        const effectiveDate = String(raw['Effective Date'] || raw['effective date'] || raw['Transfer letter date'] || raw['Transfer letter date '] || '').trim();

        const existingMatching = codeToRowsMap.get(key);
        if (existingMatching && existingMatching.length > 0) {
          for (const existing of existingMatching) {
            existing.sourceSheets.add(sheet.sheetName);
            if (newLocation) {
              existing.workLocation = newLocation;
              existing.customNotes.push(`Transferred to ${newLocation}${effectiveDate ? ` (Effective: ${effectiveDate})` : ''}`);
            }
          }
        }
      });
    }

    // PASS 6: RECRUITMENT sheets (candidates and open positions)
    const recruitmentSheets = Object.values(session.sheets).filter(s => s.importable && s.category === 'RECRUITMENT');
    for (const sheet of recruitmentSheets) {
      const mapping = sheet.columnMapping || {};
      sheet.rawRows.forEach((raw, i) => {
        const rowNum = sheet.headerRowIndex + 1 + i;

        // Check vacancy vs candidate
        const openClose = String(raw['Open/\r\nClose/\r\nWIP'] || raw['Open/Close/WIP'] || raw['Open/Close'] || '').trim().toLowerCase();
        const stageVal = (
          getFieldVal(raw, mapping, 'employmentStatus') ||
          String(raw['Status'] || raw['status'] || raw['Stage'] || raw['stage'] || raw['Onboarding Status'] || raw['onboarding status'] || '')
        ).trim().toLowerCase();
        const remarks = String(raw['Remarks'] || raw['remarks'] || raw['Remark'] || raw['remark'] || '').trim();

        // Vacancy rule: Open positions/vacancies without candidates are NOT employees!
        if (openClose === 'open' || stageVal === 'open' || stageVal === 'vacant') {
          return;
        }

        // Interview rule: Candidates who are still interviewing must NOT become employees!
        if (
          stageVal.includes('interview') ||
          stageVal.includes('screening') ||
          stageVal.includes('applied') ||
          (stageVal.includes('wip') && !stageVal.includes('joined') && !stageVal.includes('offer'))
        ) {
          return;
        }

        // Only genuine selected candidates (Offer, Offered, Selected, Joining, Joined, Hired, Accepted)
        const isSelected = ['offer', 'offered', 'selected', 'joining', 'joined', 'hired', 'accepted'].some(
          s => stageVal.includes(s) || remarks.toLowerCase().includes(s)
        );
        if (!isSelected) {
          return;
        }

        // Extract Candidate Name
        let candidateName = getFieldVal(raw, mapping, 'fullName') || String(raw['Candidate'] || raw['Candidate Name'] || raw['candidate'] || '').trim();

        // In company workbooks, candidate name is often recorded in Remarks e.g. "Karamjeet Singh Joined", "Lokraj Offered"
        if (!candidateName && remarks) {
          const match = remarks.match(/^([A-Za-z\s.'-]+?)\s+(joined|offered|accepted|selected|hired)/i);
          if (match && match[1]) {
            candidateName = match[1].trim();
          } else if (!remarks.toLowerCase().includes('position') && remarks.split(/\s+/).length <= 4) {
            candidateName = remarks;
          }
        }

        if (!candidateName) {
          // If no candidate name, this is an unfilled position/vacancy row -> do not create an employee!
          return;
        }

        let firstName = getFieldVal(raw, mapping, 'firstName');
        let lastName = getFieldVal(raw, mapping, 'lastName');
        if (candidateName && !firstName) {
          const parts = candidateName.split(/\s+/);
          firstName = parts[0] || '';
          lastName = parts.slice(1).join(' ') || '';
        }

        const designation = getFieldVal(raw, mapping, 'designation') || String(raw['Position'] || raw['Role'] || raw['Title'] || '').trim();
        const department = getFieldVal(raw, mapping, 'department') || String(raw['Department'] || raw['Dept'] || '').trim();
        const rawCode = getFieldVal(raw, mapping, 'employeeCode');
        const rawHireDate = getFieldVal(raw, mapping, 'hireDate') || String(raw['Tentative DOJ'] || raw['tentative doj'] || raw['Deployment Date'] || '').trim();
        const parsedHire = this.parseDateValue(rawHireDate);

        // Check if candidate already exists in employee roster (e.g. joined candidate already in Employee MIS)
        const existingByName = candidateName ? reconciledRows.find(r => r.fullName.toLowerCase() === candidateName.toLowerCase()) : null;
        if (existingByName) {
          existingByName.sourceSheets.add(sheet.sheetName);
          existingByName.customNotes.push(`Recruitment pipeline candidate: ${stageVal || remarks}`);
          return;
        }

        const needsCodeAttention = !rawCode;

        const sheetSlug = sheet.sheetName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const rowId = `rec_${session.sessionId.slice(0, 8)}_${sheetSlug}_row_${rowNum}_${i + 1}`;
        if (session.deletedRowIds && session.deletedRowIds.has(rowId)) {
          return;
        }

        addRow({
          rowId,
          rowIndex: rowNum,
          sourceRowNumber: rowNum,
          primarySheet: sheet.sheetName,
          sourceSheets: new Set([sheet.sheetName]),
          isHistorical: false,
          isThirdParty: false,
          originalData: raw,
          employeeCode: rawCode || '',
          fullName: candidateName || `${firstName} ${lastName}`.trim(),
          firstName,
          lastName,
          workEmail: getFieldVal(raw, mapping, 'workEmail'),
          personalEmail: getFieldVal(raw, mapping, 'personalEmail'),
          phone: getFieldVal(raw, mapping, 'phone'),
          department: department || 'Recruitment Onboarding',
          designation: designation || 'Selected Candidate',
          employmentStatus: 'ONBOARDING',
          employmentCategory: 'ONBOARDING',
          hireDate: parsedHire || rawHireDate,
          lastWorkingDay: null,
          exitDate: null,
          exitReason: null,
          exitNotes: `Selected candidate from ${sheet.sheetName} (Stage: ${stageVal || remarks})`,
          customNotes: [`Selected candidate (${stageVal || remarks})`],
          rawExcelStatus: stageVal || remarks,
          lifecycleReason: 'Selected candidate from recruitment pipeline with confirmed offer/joining stage.',
          supportingDates: {
            hireDate: parsedHire || rawHireDate,
            lastWorkingDay: null,
          },
          conflicts: [],
          needsAttention: needsCodeAttention,
          attentionReason: needsCodeAttention ? 'Missing Employee Code for onboarding candidate. Please assign an official Employee Code.' : undefined,
          requiresHrApproval: needsCodeAttention,
        });
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

      // Match against existing database employee
      const lowerCode = row.employeeCode ? row.employeeCode.toLowerCase() : '';
      const lowerEmail = row.workEmail ? row.workEmail.toLowerCase() : '';
      const existingDbMatch = (lowerCode && existingCodeMap.get(lowerCode)) || (lowerEmail && existingEmailMap.get(lowerEmail)) || null;

      let isExistingEmployee = false;
      let existingEmployeeId: number | undefined;
      let existingDbData: Record<string, unknown> | undefined;
      const fieldDiffs: FieldDiff[] = [];
      let reconciliationType: ReconciliationType = 'NEW_EMPLOYEE';
      let approvedForImport = true;

      if (existingDbMatch) {
        isExistingEmployee = true;
        existingEmployeeId = existingDbMatch.id;
        existingDbData = {
          id: existingDbMatch.id,
          employeeCode: existingDbMatch.employee_code,
          fullName: `${existingDbMatch.first_name || ''} ${existingDbMatch.last_name || ''}`.trim(),
          workEmail: existingDbMatch.work_email || '',
          department: existingDbMatch.department_name || '',
          designation: existingDbMatch.designation_name || '',
          employmentStatus: existingDbMatch.employment_status || '',
          hireDate: existingDbMatch.hire_date || '',
          lastWorkingDay: existingDbMatch.last_working_day || '',
        };

        if (row.department && existingDbMatch.department_name && row.department.toLowerCase() !== existingDbMatch.department_name.toLowerCase()) {
          fieldDiffs.push({ field: 'department', label: 'Department', currentVal: existingDbMatch.department_name, proposedVal: row.department });
        }
        if (row.designation && existingDbMatch.designation_name && row.designation.toLowerCase() !== existingDbMatch.designation_name.toLowerCase()) {
          fieldDiffs.push({ field: 'designation', label: 'Designation / Role', currentVal: existingDbMatch.designation_name, proposedVal: row.designation });
        }
        if (row.employmentStatus && existingDbMatch.employment_status && row.employmentStatus.toUpperCase() !== existingDbMatch.employment_status.toUpperCase()) {
          fieldDiffs.push({ field: 'employmentStatus', label: 'Lifecycle Status', currentVal: existingDbMatch.employment_status, proposedVal: row.employmentStatus });
        }
        if (row.workLocation) {
          fieldDiffs.push({ field: 'workLocation', label: 'Work Location', currentVal: 'Current Site', proposedVal: row.workLocation });
        }
        if (row.lastWorkingDay && existingDbMatch.last_working_day !== row.lastWorkingDay) {
          fieldDiffs.push({ field: 'lastWorkingDay', label: 'Last Working Day', currentVal: existingDbMatch.last_working_day || 'None', proposedVal: row.lastWorkingDay });
        }

        if (fieldDiffs.some(d => d.field === 'employmentStatus')) {
          if (row.employmentStatus === 'ACTIVE' && (existingDbMatch.employment_status === 'OFFBOARDING' || existingDbMatch.employment_status === 'EXITED')) {
            reconciliationType = 'RESTORATION';
          } else {
            reconciliationType = 'LIFECYCLE_CHANGE';
          }
        } else if (fieldDiffs.some(d => d.field === 'workLocation')) {
          reconciliationType = 'LOCATION_TRANSFER';
        } else if (fieldDiffs.length > 0) {
          reconciliationType = 'EXISTING_UPDATE';
        } else {
          reconciliationType = 'EXISTING_UNCHANGED';
        }

        // Existing employee updates require explicit approval before applying
        approvedForImport = false;
        warnings.push(`Matches existing employee "${existingDbMatch.employee_code}". Proposed changes require HR approval.`);
      } else if (row.isHistorical) {
        reconciliationType = 'HISTORICAL_EXIT';
        approvedForImport = false;
        warnings.push('Historical departure record. Explicit approval required to create as EXITED employee.');
      } else if (row.isThirdParty || row.vendor || (row.primarySheet && row.primarySheet.toLowerCase().includes('third party'))) {
        reconciliationType = 'THIRD_PARTY';
        approvedForImport = true;
      } else {
        reconciliationType = 'NEW_EMPLOYEE';
        approvedForImport = true;
      }

      // Check if row was previously manually edited in session
      const previousRow = existingRowMap.get(row.rowId) || existingRowMap.get(rowIndex);
      const isEdited = previousRow?.isEdited || false;
      const editedFields = previousRow?.editedFields || [];
      if (previousRow?.approvedForImport !== undefined) {
        approvedForImport = previousRow.approvedForImport;
      }

      // Preserve manually edited fields on revalidation
      if (previousRow && previousRow.isEdited && previousRow.mappedData) {
        if (previousRow.mappedData.employeeCode) row.employeeCode = previousRow.mappedData.employeeCode;
        if (previousRow.mappedData.fullName) row.fullName = previousRow.mappedData.fullName;
        if (previousRow.mappedData.firstName) row.firstName = previousRow.mappedData.firstName;
        if (previousRow.mappedData.lastName) row.lastName = previousRow.mappedData.lastName;
        if (previousRow.mappedData.workEmail) row.workEmail = previousRow.mappedData.workEmail;
        if (previousRow.mappedData.personalEmail) row.personalEmail = previousRow.mappedData.personalEmail;
        if (previousRow.mappedData.phone) row.phone = previousRow.mappedData.phone;
        if (previousRow.mappedData.department) row.department = previousRow.mappedData.department;
        if (previousRow.mappedData.designation) row.designation = previousRow.mappedData.designation;
        if (previousRow.mappedData.employmentStatus) row.employmentStatus = previousRow.mappedData.employmentStatus;
        if (previousRow.mappedData.hireDate) row.hireDate = previousRow.mappedData.hireDate;
        if (previousRow.mappedData.lastWorkingDay !== undefined) row.lastWorkingDay = previousRow.mappedData.lastWorkingDay;
        if (previousRow.mappedData.workLocation) row.workLocation = previousRow.mappedData.workLocation;
      }

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
        if (existingDbMatch && !approvedForImport) {
          errors.push({
            field: 'employeeCode',
            message: `Employee Code "${row.employeeCode}" already exists in your workspace. Overwrites are not permitted unless approved.`,
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
          if (existingEmailMap.has(lowerEmail) && !existingDbMatch) {
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

      // Handle attention reasons & conflicts
      if (row.attentionReason) {
        warnings.push(row.attentionReason);
      }
      if (row.conflicts && row.conflicts.length > 0) {
        for (const c of row.conflicts) {
          warnings.push(`[${c.sheet}] ${c.conflictDescription}`);
        }
      }

      let validationStatus: 'VALID' | 'NEEDS_ATTENTION' | 'DUPLICATE' = 'VALID';
      if (errors.some(e => e.message.includes('Duplicate') || e.message.includes('already exists'))) {
        validationStatus = 'DUPLICATE';
      } else if (errors.length > 0 || row.needsAttention) {
        validationStatus = 'NEEDS_ATTENTION';
      }

      const originalExtractedData = previousRow?.originalExtractedData || {
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
        workLocation: row.workLocation,
        reportingManager: row.reportingManager,
        vendor: row.vendor,
      };

      const isThirdParty = Boolean(row.isThirdParty || row.vendor || (row.primarySheet && row.primarySheet.toLowerCase().includes('third party')));

      validatedRows.push({
        rowId: row.rowId,
        rowIndex,
        originalRowIndex: row.sourceRowNumber || row.rowIndex,
        sourceRowNumber: row.sourceRowNumber,
        primarySheet: row.primarySheet,
        sourceSheets: Array.from(row.sourceSheets),
        isHistorical: row.isHistorical,
        isThirdParty,
        vendor: row.vendor,
        rawExcelStatus: row.rawExcelStatus || '(Not specified)',
        lifecycleReason: row.lifecycleReason || 'Classified from source records.',
        supportingDates: row.supportingDates,
        conflicts: row.conflicts || [],
        requiresHrApproval: row.requiresHrApproval || false,
        originalData: row.originalData,
        originalExtractedData,
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
          workLocation: row.workLocation,
          reportingManager: row.reportingManager,
          vendor: row.vendor,
          employmentCategory: row.employmentCategory || (isThirdParty ? 'THIRD_PARTY' : 'REGULAR'),
        },
        isEdited,
        editedFields,
        isExistingEmployee,
        existingEmployeeId,
        existingDbData,
        fieldDiffs,
        reconciliationType,
        approvedForImport,
        validationStatus,
        errors,
        warnings,
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
      existingUpdatesCount: validatedRows.filter(r => r.isExistingEmployee).length,
      thirdPartyCount: validatedRows.filter(r => r.isThirdParty).length,
      historicalExitsCount: validatedRows.filter(r => r.reconciliationType === 'HISTORICAL_EXIT').length,
      approvedCount: validatedRows.filter(r => r.approvedForImport).length,
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

    // Apply columnMapping to all active sheets or primary sheet only if non-empty
    const sheetMappings: Record<string, Record<string, string>> = {};
    if (columnMapping && Object.keys(columnMapping).length > 0) {
      for (const sheetName of session.sheetOrder) {
        sheetMappings[sheetName] = columnMapping;
      }
    }

    return this.validateMultiSheetMapping(sessionId, ownerUserId, sheetMappings, saveMappingForWorkspace);
  }

  /**
   * Fast in-memory revalidation of active preview rows.
   * Recalculates duplicate detection and rule validations across remaining rows
   * without re-parsing raw Excel sheets, preserving all original extracted data,
   * stable IDs, and column mappings.
   */
  revalidateActiveSessionRows(session: ImportSession): void {
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // 1. Recount intra-batch code occurrences across active remaining rows
    const codeOccurrences = new Map<string, number[]>();
    for (const r of session.validatedRows) {
      const code = r.mappedData.employeeCode ? String(r.mappedData.employeeCode).trim() : '';
      if (code) {
        const lower = code.toLowerCase();
        const list = codeOccurrences.get(lower) || [];
        list.push(r.rowIndex);
        codeOccurrences.set(lower, list);
      }
    }

    // 2. Re-evaluate each remaining row's validation errors in-memory
    for (const r of session.validatedRows) {
      // Preserve existing non-duplicate field errors (missing hire date, invalid email format, etc.)
      const nonDuplicateErrors = (r.errors || []).filter(
        e => !e.message.includes('Duplicate Employee Code') && !e.message.includes('already exists in your workspace')
      );
      const errors: RowValidationError[] = [...nonDuplicateErrors];
      const warnings: string[] = [];

      const code = r.mappedData.employeeCode ? String(r.mappedData.employeeCode).trim() : '';
      const lowerCode = code.toLowerCase();
      const fullName = r.mappedData.fullName ? String(r.mappedData.fullName).trim() : '';
      const firstName = r.mappedData.firstName ? String(r.mappedData.firstName).trim() : '';
      const workEmail = r.mappedData.workEmail ? String(r.mappedData.workEmail).trim() : '';
      const personalEmail = r.mappedData.personalEmail ? String(r.mappedData.personalEmail).trim() : '';

      // Employee Code check
      if (!code) {
        if (!errors.some(e => e.field === 'employeeCode')) {
          errors.push({
            field: 'employeeCode',
            message: 'Employee ID / Code is missing. HR must supply an employee identifier.',
            critical: true,
          });
        }
      } else {
        const dupRows = codeOccurrences.get(lowerCode) || [];
        if (r.isExistingEmployee && !r.approvedForImport) {
          errors.push({
            field: 'employeeCode',
            message: `Employee Code "${code}" already exists in your workspace. Overwrites are not permitted unless approved.`,
            critical: true,
          });
        } else if (dupRows.length > 1) {
          const otherRows = dupRows.filter(num => num !== r.rowIndex).join(', ');
          errors.push({
            field: 'employeeCode',
            message: `Duplicate Employee Code "${code}" within file (also appears in Row ${otherRows}).`,
            critical: true,
          });
        }
      }

      // Name check
      if (!firstName && !fullName) {
        if (!errors.some(e => e.field === 'firstName')) {
          errors.push({
            field: 'firstName',
            message: 'Employee name is required.',
            critical: true,
          });
        }
      }

      // Email format checks
      if (workEmail && !EMAIL_REGEX.test(workEmail)) {
        if (!errors.some(e => e.field === 'workEmail')) {
          errors.push({
            field: 'workEmail',
            message: `Invalid work email format: "${workEmail}".`,
            critical: true,
          });
        }
      }
      if (personalEmail && !EMAIL_REGEX.test(personalEmail)) {
        if (!errors.some(e => e.field === 'personalEmail')) {
          errors.push({
            field: 'personalEmail',
            message: `Invalid personal email format: "${personalEmail}".`,
            critical: true,
          });
        }
      }

      // Retain existing non-duplicate warnings (e.g. historical departure, needs approval, existing employee)
      for (const w of r.warnings || []) {
        if (!w.includes('Duplicate Employee Code') && !w.includes('already exists in your workspace')) {
          warnings.push(w);
        }
      }
      if (r.isExistingEmployee) {
        warnings.push(`Matches existing employee "${code}". Proposed changes require HR approval.`);
      }

      // Determine validation status
      let validationStatus: RowValidationStatus = 'VALID';
      if (errors.length > 0) {
        const hasDup = errors.some(e => e.message.includes('Duplicate') || e.message.includes('already exists'));
        validationStatus = hasDup ? 'DUPLICATE' : 'NEEDS_ATTENTION';
      } else if (r.needsAttention || (r.requiresHrApproval && !r.approvedForImport && r.reconciliationType === 'HISTORICAL_EXIT')) {
        validationStatus = 'NEEDS_ATTENTION';
      }

      r.errors = errors;
      r.warnings = warnings;
      r.validationStatus = validationStatus;
    }

    // 3. Recalculate summary counters from active preview dataset
    importSessionStore.recalculateSummary(session);
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

    const rowsToImport = session.validatedRows.filter(r => r.validationStatus === 'VALID' && r.approvedForImport === true);

    if (rowsToImport.length === 0) {
      throw new Error('There are no approved valid records to import. Please review and approve records or correct records requiring attention.');
    }

    const skippedRows = session.validatedRows.filter(r => r.validationStatus !== 'VALID' || !r.approvedForImport);
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

    // 2. Batch insert/update employees in chunks of 100 within a tenant transaction
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

          if (row.isExistingEmployee && row.existingEmployeeId) {
            // Update existing workspace employee record
            await client.query(
              `UPDATE hr_employees
               SET department_id = COALESCE($1, department_id),
                   designation_id = COALESCE($2, designation_id),
                   employment_status = COALESCE($3, employment_status),
                   hire_date = COALESCE($4, hire_date),
                   last_working_day = COALESCE($5, last_working_day),
                   exit_date = COALESCE($6, exit_date),
                   exit_reason = COALESCE($7, exit_reason),
                   exit_notes = COALESCE($8, exit_notes),
                   updated_at = CURRENT_TIMESTAMP
               WHERE employee_id = $9 AND owner_user_id = $10`,
              [
                deptId,
                desigId,
                m.employmentStatus,
                m.hireDate,
                m.lastWorkingDay || null,
                m.exitDate || m.lastWorkingDay || null,
                m.exitReason || null,
                m.exitNotes || null,
                row.existingEmployeeId,
                ownerUserId,
              ]
            );

            importedCount++;
            statusBreakdown[m.employmentStatus]++;

            // If offboarding, initialize/update hr_offboarding record
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
                ON CONFLICT (owner_user_id, employee_id) DO UPDATE
                SET planned_exit_date = EXCLUDED.planned_exit_date,
                    exit_reason = EXCLUDED.exit_reason,
                    notes = EXCLUDED.notes`,
                [
                  ownerUserId,
                  row.existingEmployeeId,
                  m.lastWorkingDay,
                  m.exitReason || 'Imported offboarding schedule',
                  m.exitNotes,
                  m.personalEmail || m.workEmail || null,
                ]
              );
            }
          } else {
            // Insert new employee record
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
                m.hireDate || null,
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
