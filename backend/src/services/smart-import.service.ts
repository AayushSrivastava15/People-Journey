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
} from './import-session.store.js';

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
    aliases: ['employee code', 'employee id', 'staff id', 'emp code', 'emp id', 'staff code', 'id', 'emp no', 'employee no', 'code', 'worker id'],
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
   * Parse uploaded Excel buffer and detect columns intelligently
   */
  async parseAndDetectColumns(
    buffer: Buffer,
    fileName: string,
    ownerUserId: string
  ): Promise<{
    session: ImportSession;
    detection: ColumnDetectionResult;
  }> {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    } catch (err) {
      throw new Error('Failed to read Excel file. Please ensure the file is a valid .xlsx or .xls document.');
    }

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error('The uploaded Excel document does not contain any sheets.');
    }

    const worksheet = workbook.Sheets[firstSheetName];
    // Convert to JSON with headers
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '', raw: false });

    if (rawRows.length === 0) {
      throw new Error('The uploaded Excel sheet contains no data rows.');
    }

    if (rawRows.length > 2500) {
      throw new Error(`File row count (${rawRows.length}) exceeds the maximum import limit of 2,500 rows per batch.`);
    }

    // Extract headers across all rows so columns with empty first cells are never missed
    const headerSet = new Set<string>();
    for (const row of rawRows) {
      for (const k of Object.keys(row)) {
        if (k && !k.startsWith('__EMPTY')) {
          headerSet.add(k);
        }
      }
    }
    const detectedHeaders = Array.from(headerSet);
    if (detectedHeaders.length === 0) {
      throw new Error('No column headers detected in your sheet.');
    }

    // Retrieve saved workspace mappings
    const savedMapping = await this.getSavedWorkspaceMapping(ownerUserId);

    const suggestedMapping: Record<string, string> = {};
    const confidence: Record<string, number> = {};
    let savedMappingMatched = false;

    // First check saved mappings
    for (const header of detectedHeaders) {
      if (savedMapping[header]) {
        suggestedMapping[header] = savedMapping[header];
        confidence[header] = 1.0;
        savedMappingMatched = true;
      }
    }

    // For unmapped headers, apply alias matching
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
            const score = Math.min(norm.length, alias.length) / Math.max(norm.length, alias.length) * 0.8;
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

    // Create session in bounded memory store
    const session = importSessionStore.createSession(
      ownerUserId,
      fileName,
      buffer.length,
      detectedHeaders,
      rawRows,
      suggestedMapping
    );

    return {
      session,
      detection: {
        detectedHeaders,
        suggestedMapping,
        confidence,
        previewSampleRows: rawRows.slice(0, 5),
        savedMappingMatched,
      },
    };
  }

  /**
   * Run deep validation on all extracted rows using the confirmed column mapping
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

    const activeMapping = (columnMapping && Object.keys(columnMapping).length > 0)
      ? columnMapping 
      : (session.columnMapping || {});

    if (saveMappingForWorkspace) {
      await this.saveWorkspaceMapping(ownerUserId, activeMapping);
    }

    // Invert mapping for quick lookup: canonicalField -> excelHeader
    const fieldToHeader: Record<string, string> = {};
    for (const [header, field] of Object.entries(activeMapping)) {
      if (field) {
        fieldToHeader[field] = header;
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

    // Pre-calculate code frequencies within the file to flag all occurrences of intra-file duplicates
    const codeOccurrences = new Map<string, number[]>();
    const codeHeader = fieldToHeader['employeeCode'];
    if (codeHeader) {
      for (let i = 0; i < session.rawRows.length; i++) {
        const raw = session.rawRows[i] || {};
        const rowIndex = i + 2;
        const v = raw[codeHeader];
        if (v !== undefined && v !== null) {
          const code = String(v).trim().toLowerCase();
          if (code) {
            const list = codeOccurrences.get(code) || [];
            list.push(rowIndex);
            codeOccurrences.set(code, list);
          }
        }
      }
    }

    const fileSeenEmails = new Map<string, number>(); // email -> first rowIndex

    const validatedRows: ValidatedImportRow[] = [];

    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Process every row
    for (let i = 0; i < session.rawRows.length; i++) {
      const raw = session.rawRows[i] || {};
      const rowIndex = i + 2; // Excel row number (1 is header)
      const errors: RowValidationError[] = [];
      const warnings: string[] = [];

      // Extract raw mapped values
      const getVal = (field: string): string => {
        const header = fieldToHeader[field];
        if (!header) return '';
        const v = raw[header];
        return v !== undefined && v !== null ? String(v).trim() : '';
      };

      const employeeCode = getVal('employeeCode');
      const fullName = getVal('fullName');
      let firstName = getVal('firstName');
      let lastName = getVal('lastName');

      if (fullName && !firstName) {
        const parts = fullName.split(/\s+/);
        firstName = parts[0] || '';
        lastName = parts.slice(1).join(' ') || lastName;
      }

      const workEmail = getVal('workEmail');
      const personalEmail = getVal('personalEmail');
      const phone = getVal('phone');
      const department = getVal('department');
      const designation = getVal('designation');
      const rawStatus = getVal('employmentStatus');
      const rawHireDate = getVal('hireDate');
      const rawLwd = getVal('lastWorkingDay');
      const exitReason = getVal('exitReason') || null;
      const exitNotes = getVal('exitNotes') || null;

      // 1. Employee Code Validation (CRITICAL: Never auto-generate!)
      if (!employeeCode) {
        errors.push({
          field: 'employeeCode',
          message: 'Employee ID / Code is missing. HR must supply an employee identifier.',
          critical: true,
        });
      } else {
        const lowerCode = employeeCode.toLowerCase();
        const dupRows = codeOccurrences.get(lowerCode) || [];
        if (existingCodes.has(lowerCode)) {
          errors.push({
            field: 'employeeCode',
            message: `Employee Code "${employeeCode}" already exists in your workspace. Overwrites are not permitted.`,
            critical: true,
          });
        } else if (dupRows.length > 1) {
          const otherRows = dupRows.filter(r => r !== rowIndex).join(', ');
          errors.push({
            field: 'employeeCode',
            message: `Duplicate Employee Code "${employeeCode}" within file (also appears in Row ${otherRows}).`,
            critical: true,
          });
        }
      }

      // 2. Name Validation
      if (!firstName && !fullName) {
        errors.push({
          field: 'firstName',
          message: 'Employee name is required.',
          critical: true,
        });
      }

      // 3. Email Validation
      if (workEmail) {
        if (!EMAIL_REGEX.test(workEmail)) {
          errors.push({
            field: 'workEmail',
            message: `Invalid work email format: "${workEmail}".`,
            critical: true,
          });
        } else {
          const lowerEmail = workEmail.toLowerCase();
          if (existingEmails.has(lowerEmail)) {
            warnings.push(`Work email "${workEmail}" is already used by an existing employee.`);
          }
          if (fileSeenEmails.has(lowerEmail)) {
            warnings.push(`Work email "${workEmail}" appears multiple times in this file (matches Row ${fileSeenEmails.get(lowerEmail)}).`);
          } else {
            fileSeenEmails.set(lowerEmail, rowIndex);
          }
        }
      }

      if (personalEmail && !EMAIL_REGEX.test(personalEmail)) {
        errors.push({
          field: 'personalEmail',
          message: `Invalid personal email format: "${personalEmail}".`,
          critical: true,
        });
      }

      // 4. Date & Lifecycle Resolution
      const hireDate = this.parseDateValue(rawHireDate);
      if (!hireDate) {
        errors.push({
          field: 'hireDate',
          message: rawHireDate ? `Invalid joining date: "${rawHireDate}". Expected format: YYYY-MM-DD or DD/MM/YYYY.` : 'Date of Joining is required.',
          critical: true,
        });
      }

      const lastWorkingDay = this.parseDateValue(rawLwd);
      if (rawLwd && !lastWorkingDay) {
        errors.push({
          field: 'lastWorkingDay',
          message: `Invalid last working day / exit date: "${rawLwd}".`,
          critical: true,
        });
      }

      // Resolve Lifecycle Status
      let resolvedStatus: 'ONBOARDING' | 'ACTIVE' | 'OFFBOARDING' | 'EXITED' = 'ACTIVE';
      const normStatus = rawStatus.toUpperCase().trim();

      if (['ONBOARDING', 'ACTIVE', 'OFFBOARDING', 'EXITED'].includes(normStatus)) {
        resolvedStatus = normStatus as typeof resolvedStatus;
      } else if (normStatus) {
        if (normStatus.includes('ONBOARD') || normStatus.includes('JOIN')) {
          resolvedStatus = 'ONBOARDING';
        } else if (normStatus.includes('OFFBOARD') || normStatus.includes('RESIGN') || normStatus.includes('NOTICE')) {
          resolvedStatus = 'OFFBOARDING';
        } else if (normStatus.includes('EXIT') || normStatus.includes('LEFT') || normStatus.includes('RELIEV') || normStatus.includes('TERMINAT')) {
          resolvedStatus = 'EXITED';
        } else if (normStatus.includes('ACT') || normStatus.includes('WORK') || normStatus.includes('EMPLOY')) {
          resolvedStatus = 'ACTIVE';
        } else {
          errors.push({
            field: 'employmentStatus',
            message: `Unrecognized lifecycle status: "${rawStatus}". Must be Onboarding, Active, Offboarding, or Exited.`,
            critical: true,
          });
        }
      } else {
        // Date-based inference only if status absent and unambiguous
        const today = new Date().toISOString().slice(0, 10);
        if (lastWorkingDay) {
          if (lastWorkingDay < today) {
            resolvedStatus = 'EXITED';
          } else {
            resolvedStatus = 'OFFBOARDING';
          }
        } else if (hireDate && hireDate > today) {
          resolvedStatus = 'ONBOARDING';
        } else {
          resolvedStatus = 'ACTIVE';
        }
      }

      // Specific lifecycle rule validations
      if (resolvedStatus === 'OFFBOARDING' && !lastWorkingDay) {
        errors.push({
          field: 'lastWorkingDay',
          message: 'Last working day is mandatory for offboarding employees.',
          critical: true,
        });
      }

      if (resolvedStatus === 'EXITED' && !lastWorkingDay) {
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

      let validationStatus: 'VALID' | 'NEEDS_ATTENTION' | 'DUPLICATE' = 'VALID';
      if (errors.some(e => e.message.includes('Duplicate') || e.message.includes('already exists'))) {
        validationStatus = 'DUPLICATE';
      } else if (errors.length > 0) {
        validationStatus = 'NEEDS_ATTENTION';
      }

      validatedRows.push({
        rowIndex,
        originalData: raw,
        mappedData: {
          employeeCode,
          firstName,
          lastName,
          fullName: `${firstName} ${lastName}`.trim() || firstName,
          workEmail,
          personalEmail,
          phone,
          department,
          designation,
          employmentStatus: resolvedStatus,
          hireDate: hireDate || rawHireDate,
          lastWorkingDay: lastWorkingDay || null,
          exitDate: resolvedStatus === 'EXITED' ? lastWorkingDay : null,
          exitReason,
          exitNotes,
        },
        validationStatus,
        errors,
        warnings,
      });
    }

    // Build summary counts
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

    const updatedSession = importSessionStore.updateSessionValidation(
      sessionId,
      ownerUserId,
      columnMapping,
      validatedRows,
      summary
    );

    return updatedSession!;
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
