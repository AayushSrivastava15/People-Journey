import { executeSql, withTransaction } from '../config/database';
import type {
  Employee,
  CreateEmployeeInput,
  UpdateEmployeeInput,
  OffboardEmployeeInput,
  EmployeeQueryParams,
  EmploymentStatus,
} from '../models/employee.model';
import { auditService } from './audit.service';
import { masterService } from './master.service';
import { logger } from '../utils/logger';

interface RawEmployeeRow {
  employee_id: number;
  employee_code: string;
  first_name: string;
  last_name: string | null;
  work_email: string | null;
  phone: string | null;
  department_id: number | null;
  designation_id: number | null;
  department_name: string | null;
  designation_name: string | null;
  employment_status: EmploymentStatus;
  hire_date: Date | string;
  exit_date: Date | string | null;
  created_at?: Date | string;
  updated_at?: Date | string;
  created_by?: string | null;
  owner_user_id?: string;
}

function normalizeStatusForFrontend(status: string): 'Active' | 'Onboarding' | 'Offboarding' | 'Exited' {
  switch (status.toUpperCase()) {
    case 'ACTIVE': return 'Active';
    case 'ONBOARDING': return 'Onboarding';
    case 'OFFBOARDING': return 'Offboarding';
    case 'EXITED': return 'Exited';
    default: return 'Active';
  }
}

function formatDateOnly(val: Date | string | null | undefined): string {
  if (!val) return '';
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10);
  }
  return String(val).slice(0, 10);
}

function mapRowToEmployee(row: RawEmployeeRow): Employee {
  const firstName = row.first_name || '';
  const lastName = row.last_name || '';
  const fullName = `${firstName} ${lastName}`.trim() || firstName;

  return {
    employeeId: Number(row.employee_id),
    employeeCode: row.employee_code,
    firstName,
    lastName: row.last_name,
    name: fullName,
    workEmail: row.work_email,
    phone: row.phone,
    departmentId: row.department_id ? Number(row.department_id) : null,
    designationId: row.designation_id ? Number(row.designation_id) : null,
    departmentName: row.department_name,
    designationName: row.designation_name,
    employmentStatus: row.employment_status,
    status: normalizeStatusForFrontend(row.employment_status),
    hireDate: formatDateOnly(row.hire_date),
    exitDate: row.exit_date ? formatDateOnly(row.exit_date) : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
    createdBy: row.created_by ? String(row.created_by) : null,
    ownerUserId: row.owner_user_id,
  };
}

export const employeeService = {
  /**
   * List employees with filtering, searching, sorting, and pagination scoped to owner's workspace.
   */
  async listEmployees(params: EmployeeQueryParams, ownerUserId: string): Promise<{
    data: Employee[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = Math.max(1, params.page);
    const limit = Math.max(1, Math.min(100, params.limit));
    const offset = (page - 1) * limit;

    const whereClauses: string[] = ['e.owner_user_id = $1'];
    const queryParams: unknown[] = [ownerUserId];
    let paramIndex = 2;

    if (params.search) {
      whereClauses.push(
        `(LOWER(e.employee_code) LIKE $${paramIndex} OR 
          LOWER(e.first_name) LIKE $${paramIndex} OR 
          LOWER(COALESCE(e.last_name, '')) LIKE $${paramIndex} OR 
          LOWER(COALESCE(e.work_email, '')) LIKE $${paramIndex} OR
          LOWER(COALESCE(d.department_name, '')) LIKE $${paramIndex})`
      );
      queryParams.push(`%${params.search.toLowerCase()}%`);
      paramIndex++;
    }

    if (params.status && params.status !== 'All' && params.status !== 'All statuses') {
      whereClauses.push(`UPPER(e.employment_status) = $${paramIndex}`);
      queryParams.push(params.status.toUpperCase());
      paramIndex++;
    }

    if (params.departmentId) {
      whereClauses.push(`e.department_id = $${paramIndex}`);
      queryParams.push(params.departmentId);
      paramIndex++;
    }

    if (params.designationId) {
      whereClauses.push(`e.designation_id = $${paramIndex}`);
      queryParams.push(params.designationId);
      paramIndex++;
    }

    const whereSql = whereClauses.join(' AND ');

    // 1. Total count query (omit departments join if search does not reference it)
    const countSql = params.search
      ? `
        SELECT COUNT(*)::int AS total
        FROM hr_employees e
        LEFT JOIN hr_departments d ON e.department_id = d.department_id
        WHERE ${whereSql}
      `
      : `
        SELECT COUNT(*)::int AS total
        FROM hr_employees e
        WHERE ${whereSql}
      `;

    // 2. Data query
    const columnMap: Record<string, string> = {
      CREATED_AT: 'e.created_at',
      FIRST_NAME: 'e.first_name',
      HIRE_DATE: 'e.hire_date',
      EMPLOYEE_CODE: 'e.employee_code',
    };
    const sortColumn = columnMap[params.sortBy] || 'e.created_at';
    const sortOrder = params.sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const dataSql = `
      SELECT 
        e.employee_id,
        e.employee_code,
        e.first_name,
        e.last_name,
        e.work_email,
        e.phone,
        e.department_id,
        e.designation_id,
        e.employment_status,
        e.hire_date,
        e.exit_date,
        e.created_at,
        e.updated_at,
        e.created_by,
        e.owner_user_id,
        d.department_name,
        des.designation_name
      FROM hr_employees e
      LEFT JOIN hr_departments d ON e.department_id = d.department_id
      LEFT JOIN hr_designations des ON e.designation_id = des.designation_id
      WHERE ${whereSql}
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const dataParams = [...queryParams, limit, offset];

    // Execute count and data queries concurrently
    const [countResult, dataResult] = await Promise.all([
      executeSql<{ total: number }>(countSql, queryParams),
      executeSql<RawEmployeeRow>(dataSql, dataParams),
    ]);

    const total = Number(countResult.rows?.[0]?.total || 0);
    const data = (dataResult.rows || []).map(mapRowToEmployee);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  },

  /**
   * Fetch single employee by ID, scoped to owner's workspace if ownerUserId provided.
   */
  async getEmployeeById(employeeId: number, ownerUserId?: string): Promise<Employee | null> {
    let sql = `
      SELECT 
        e.employee_id,
        e.employee_code,
        e.first_name,
        e.last_name,
        e.work_email,
        e.phone,
        e.department_id,
        e.designation_id,
        e.employment_status,
        e.hire_date,
        e.exit_date,
        e.created_at,
        e.updated_at,
        e.created_by,
        e.owner_user_id,
        d.department_name,
        des.designation_name
      FROM hr_employees e
      LEFT JOIN hr_departments d ON e.department_id = d.department_id
      LEFT JOIN hr_designations des ON e.designation_id = des.designation_id
      WHERE e.employee_id = $1
    `;
    const params: unknown[] = [employeeId];

    if (ownerUserId) {
      sql += ' AND e.owner_user_id = $2';
      params.push(ownerUserId);
    }

    const result = await executeSql<RawEmployeeRow>(sql, params);
    const row = result.rows?.[0];
    return row ? mapRowToEmployee(row) : null;
  },

  /**
   * Create a new employee record in PostgreSQL personal workspace.
   */
  async createEmployee(data: CreateEmployeeInput, ownerUserId: string): Promise<Employee> {
    if (!ownerUserId) {
      throw new Error('Owner user ID is required to create an employee record.');
    }

    // 1. Resolve departmentId if string department was given
    let departmentId = data.departmentId || null;
    if (!departmentId && data.department) {
      const depts = await masterService.getDepartments(ownerUserId);
      const match = depts.find(d => d.departmentName.toLowerCase() === data.department?.toLowerCase());
      if (match) {
        departmentId = match.departmentId;
      } else {
        const createdDept = await masterService.createDepartment({ departmentName: data.department }, ownerUserId);
        departmentId = createdDept.departmentId;
      }
    }

    // 2. Resolve designationId if string designation was given
    let designationId = data.designationId || null;
    if (!designationId && data.designation) {
      const desigs = await masterService.getDesignations(ownerUserId);
      const match = desigs.find(d => d.designationName.toLowerCase() === data.designation?.toLowerCase());
      if (match) {
        designationId = match.designationId;
      } else {
        const createdDesig = await masterService.createDesignation({ designationName: data.designation }, ownerUserId);
        designationId = createdDesig.designationId;
      }
    }

    // 3. Handle name splitting if fullName provided
    let firstName = data.firstName;
    let lastName = data.lastName || '';
    if (data.fullName && !data.firstName) {
      const parts = data.fullName.trim().split(/\s+/);
      firstName = parts[0] || 'Unknown';
      lastName = parts.slice(1).join(' ') || '';
    }

    // 4. Resolve hire date and exit date
    const hireDateStr = data.hireDate || data.joiningDate;
    if (!hireDateStr) {
      throw new Error('Hire/joining date is required.');
    }
    const exitDateStr = data.exitDate || data.lastWorkingDay || null;

    // 5. Auto-generate employee code if missing
    const employeeCode = data.employeeCode || `EMP-${Date.now().toString().slice(-6)}`;

    // 6. Normalize status
    const status = (data.employmentStatus || 'ONBOARDING').toUpperCase();
    const email = data.workEmail || data.personalEmail || null;

    const sql = `
      INSERT INTO hr_employees (
        owner_user_id,
        employee_code,
        first_name,
        last_name,
        work_email,
        phone,
        department_id,
        designation_id,
        employment_status,
        hire_date,
        exit_date,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING employee_id;
    `;

    try {
      const result = await executeSql<{ employee_id: number }>(sql, [
        ownerUserId,
        employeeCode,
        firstName,
        lastName || null,
        email,
        data.phone || null,
        departmentId,
        designationId,
        status,
        hireDateStr.slice(0, 10),
        exitDateStr ? exitDateStr.slice(0, 10) : null,
        ownerUserId,
      ]);

      const outId = result.rows?.[0]?.employee_id;
      if (!outId) {
        throw new Error('Failed to retrieve generated employee_id from insert.');
      }

      const created = (await this.getEmployeeById(outId, ownerUserId))!;

      await auditService.log({
        userId: ownerUserId,
        actionType: 'CREATE_EMPLOYEE',
        entityType: 'HR_EMPLOYEES',
        entityId: String(created.employeeId),
        details: { employeeCode: created.employeeCode, name: created.name, status: created.employmentStatus },
      });

      logger.info({ employeeId: created.employeeId, employeeCode: created.employeeCode, ownerUserId }, 'Created employee in personal workspace');
      return created;
    } catch (err) {
      const error = err as Error & { code?: string };
      if (error.code === '23505' || error.message.includes('unique constraint') || error.message.includes('already exists')) {
        throw new Error(`Employee code "${employeeCode}" already exists in your workspace. Please choose a unique code.`);
      }
      throw error;
    }
  },

  /**
   * Update permitted employee fields scoped to owner's workspace.
   */
  async updateEmployee(employeeId: number, data: UpdateEmployeeInput, ownerUserId: string): Promise<Employee> {
    const existing = await this.getEmployeeById(employeeId, ownerUserId);
    if (!existing) {
      throw new Error(`Employee with ID ${employeeId} not found in your workspace.`);
    }

    const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const params: unknown[] = [employeeId, ownerUserId];
    let paramIndex = 3;

    if (data.firstName !== undefined) {
      updates.push(`first_name = $${paramIndex++}`);
      params.push(data.firstName);
    }

    if (data.lastName !== undefined) {
      updates.push(`last_name = $${paramIndex++}`);
      params.push(data.lastName);
    }

    if (data.workEmail !== undefined) {
      updates.push(`work_email = $${paramIndex++}`);
      params.push(data.workEmail || null);
    }

    if (data.phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      params.push(data.phone || null);
    }

    if (data.departmentId !== undefined) {
      updates.push(`department_id = $${paramIndex++}`);
      params.push(data.departmentId);
    }

    if (data.designationId !== undefined) {
      updates.push(`designation_id = $${paramIndex++}`);
      params.push(data.designationId);
    }

    if (data.employmentStatus !== undefined) {
      updates.push(`employment_status = $${paramIndex++}`);
      params.push(data.employmentStatus.toUpperCase());
    }

    if (data.hireDate !== undefined) {
      updates.push(`hire_date = $${paramIndex++}`);
      params.push(data.hireDate.slice(0, 10));
    }

    if (data.exitDate !== undefined) {
      if (data.exitDate) {
        updates.push(`exit_date = $${paramIndex++}`);
        params.push(data.exitDate.slice(0, 10));
      } else {
        updates.push('exit_date = NULL');
      }
    }

    const sql = `
      UPDATE hr_employees
      SET ${updates.join(', ')}
      WHERE employee_id = $1 AND owner_user_id = $2
    `;

    await executeSql(sql, params);
    const updated = (await this.getEmployeeById(employeeId, ownerUserId))!;

    await auditService.log({
      userId: ownerUserId,
      actionType: 'UPDATE_EMPLOYEE',
      entityType: 'HR_EMPLOYEES',
      entityId: String(employeeId),
      details: { updatedFields: Object.keys(data) },
    });

    return updated;
  },

  /**
   * Transactional offboarding workflow scoped to owner's workspace:
   * 1. Inserts offboarding record into hr_offboarding with owner_user_id
   * 2. Sets hr_employees.employment_status = 'OFFBOARDING' and exit_date = plannedExitDate
   * 3. Logs action in hr_audit_logs
   */
  async offboardEmployee(employeeId: number, data: OffboardEmployeeInput, ownerUserId: string): Promise<{
    employee: Employee;
    offboardingId: number;
  }> {
    const plannedExitDate = data.plannedExitDate || data.lastWorkingDay;
    if (!plannedExitDate) {
      throw new Error('Planned exit date / last working day is required.');
    }

    const noticeDate = data.noticeDate ? data.noticeDate.slice(0, 10) : new Date().toISOString().slice(0, 10);

    const offboardingId = await withTransaction(async (client) => {
      // 1. Verify employee exists in owner workspace and can be offboarded
      const empRes = await client.query<RawEmployeeRow>(
        `SELECT employee_id, employee_code, employment_status, first_name, last_name
         FROM hr_employees
         WHERE employee_id = $1 AND owner_user_id = $2`,
        [employeeId, ownerUserId]
      );
      const emp = empRes.rows?.[0];
      if (!emp) {
        throw new Error(`Employee with ID ${employeeId} not found in your workspace.`);
      }

      if (emp.employment_status === 'EXITED') {
        throw new Error('Cannot schedule offboarding for an employee who has already exited.');
      }

      // Check for existing pending offboarding in owner workspace
      const existingOffboardRes = await client.query<{ offboarding_id: number }>(
        `SELECT offboarding_id
         FROM hr_offboarding
         WHERE employee_id = $1 AND owner_user_id = $2 AND clearance_status != 'COMPLETED'`,
        [employeeId, ownerUserId]
      );
      if ((existingOffboardRes.rows || []).length > 0) {
        throw new Error('An active offboarding workflow already exists for this employee in your workspace.');
      }

      // 2. Insert into hr_offboarding with owner_user_id
      const offboardSql = `
        INSERT INTO hr_offboarding (
          owner_user_id,
          employee_id,
          notice_date,
          planned_exit_date,
          exit_reason,
          clearance_status,
          notes,
          contact_email,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, $7, $8)
        RETURNING offboarding_id;
      `;

      const offboardResult = await client.query<{ offboarding_id: number }>(offboardSql, [
        ownerUserId,
        employeeId,
        noticeDate,
        plannedExitDate.slice(0, 10),
        data.exitReason || 'Scheduled transition',
        data.notes || null,
        data.contactEmail || null,
        ownerUserId,
      ]);
      const generatedId = offboardResult.rows?.[0]?.offboarding_id;

      // 3. Update employee lifecycle status and exit date
      await client.query(
        `UPDATE hr_employees
         SET 
           employment_status = 'OFFBOARDING',
           exit_date = $1,
           updated_at = CURRENT_TIMESTAMP
         WHERE employee_id = $2 AND owner_user_id = $3`,
        [plannedExitDate.slice(0, 10), employeeId, ownerUserId]
      );

      // 4. Record audit log
      await auditService.log(
        {
          userId: ownerUserId,
          actionType: 'OFFBOARD_EMPLOYEE',
          entityType: 'HR_OFFBOARDING',
          entityId: String(generatedId),
          details: {
            employeeId,
            plannedExitDate,
            reason: data.exitReason,
          },
        },
        client
      );

      logger.info({ employeeId, offboardingId: generatedId, plannedExitDate, ownerUserId }, 'Offboarding initiated in personal workspace');
      return generatedId;
    });

    // 5. Fetch updated employee record after transaction has successfully committed
    const updated = (await this.getEmployeeById(employeeId, ownerUserId))!;
    return { employee: updated, offboardingId };
  },
};
