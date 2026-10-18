import oracledb from 'oracledb';
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
  EMPLOYEE_ID: number;
  EMPLOYEE_CODE: string;
  FIRST_NAME: string;
  LAST_NAME: string | null;
  WORK_EMAIL: string | null;
  PHONE: string | null;
  DEPARTMENT_ID: number | null;
  DESIGNATION_ID: number | null;
  DEPARTMENT_NAME: string | null;
  DESIGNATION_NAME: string | null;
  EMPLOYMENT_STATUS: EmploymentStatus;
  HIRE_DATE: Date | string;
  EXIT_DATE: Date | string | null;
  CREATED_AT?: Date | string;
  UPDATED_AT?: Date | string;
  CREATED_BY?: number | null;
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
  const firstName = row.FIRST_NAME || '';
  const lastName = row.LAST_NAME || '';
  const fullName = `${firstName} ${lastName}`.trim() || firstName;

  return {
    employeeId: Number(row.EMPLOYEE_ID),
    employeeCode: row.EMPLOYEE_CODE,
    firstName,
    lastName: row.LAST_NAME,
    name: fullName,
    workEmail: row.WORK_EMAIL,
    phone: row.PHONE,
    departmentId: row.DEPARTMENT_ID ? Number(row.DEPARTMENT_ID) : null,
    designationId: row.DESIGNATION_ID ? Number(row.DESIGNATION_ID) : null,
    departmentName: row.DEPARTMENT_NAME,
    designationName: row.DESIGNATION_NAME,
    employmentStatus: row.EMPLOYMENT_STATUS,
    status: normalizeStatusForFrontend(row.EMPLOYMENT_STATUS),
    hireDate: formatDateOnly(row.HIRE_DATE),
    exitDate: row.EXIT_DATE ? formatDateOnly(row.EXIT_DATE) : null,
    createdAt: row.CREATED_AT ? new Date(row.CREATED_AT).toISOString() : undefined,
    updatedAt: row.UPDATED_AT ? new Date(row.UPDATED_AT).toISOString() : undefined,
    createdBy: row.CREATED_BY ? Number(row.CREATED_BY) : null,
  };
}

export const employeeService = {
  /**
   * List employees with filtering, searching, sorting, and pagination.
   */
  async listEmployees(params: EmployeeQueryParams): Promise<{
    data: Employee[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = Math.max(1, params.page);
    const limit = Math.max(1, Math.min(100, params.limit));
    const offset = (page - 1) * limit;

    const whereClauses: string[] = ['1=1'];
    const binds: oracledb.BindParameters = {};

    if (params.search) {
      whereClauses.push(
        `(LOWER(e.EMPLOYEE_CODE) LIKE :search OR 
          LOWER(e.FIRST_NAME) LIKE :search OR 
          LOWER(e.LAST_NAME) LIKE :search OR 
          LOWER(e.WORK_EMAIL) LIKE :search OR
          LOWER(d.DEPARTMENT_NAME) LIKE :search)`
      );
      (binds as Record<string, unknown>).search = `%${params.search.toLowerCase()}%`;
    }

    if (params.status && params.status !== 'All' && params.status !== 'All statuses') {
      whereClauses.push(`UPPER(e.EMPLOYMENT_STATUS) = :status`);
      (binds as Record<string, unknown>).status = params.status.toUpperCase();
    }

    if (params.departmentId) {
      whereClauses.push(`e.DEPARTMENT_ID = :departmentId`);
      (binds as Record<string, unknown>).departmentId = params.departmentId;
    }

    if (params.designationId) {
      whereClauses.push(`e.DESIGNATION_ID = :designationId`);
      (binds as Record<string, unknown>).designationId = params.designationId;
    }

    const whereSql = whereClauses.join(' AND ');

    // 1. Total count query
    const countSql = `
      SELECT COUNT(*) AS TOTAL
      FROM HR_EMPLOYEES e
      LEFT JOIN HR_DEPARTMENTS d ON e.DEPARTMENT_ID = d.DEPARTMENT_ID
      WHERE ${whereSql}
    `;
    const countResult = await executeSql<{ TOTAL: number }>(countSql, binds);
    const total = Number(countResult.rows?.[0]?.TOTAL || 0);

    // 2. Data query
    const sortColumn = ['CREATED_AT', 'FIRST_NAME', 'HIRE_DATE', 'EMPLOYEE_CODE'].includes(params.sortBy)
      ? `e.${params.sortBy}`
      : 'e.CREATED_AT';
    const sortOrder = params.sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const dataSql = `
      SELECT 
        e.EMPLOYEE_ID,
        e.EMPLOYEE_CODE,
        e.FIRST_NAME,
        e.LAST_NAME,
        e.WORK_EMAIL,
        e.PHONE,
        e.DEPARTMENT_ID,
        e.DESIGNATION_ID,
        e.EMPLOYMENT_STATUS,
        e.HIRE_DATE,
        e.EXIT_DATE,
        e.CREATED_AT,
        e.UPDATED_AT,
        e.CREATED_BY,
        d.DEPARTMENT_NAME,
        des.DESIGNATION_NAME
      FROM HR_EMPLOYEES e
      LEFT JOIN HR_DEPARTMENTS d ON e.DEPARTMENT_ID = d.DEPARTMENT_ID
      LEFT JOIN HR_DESIGNATIONS des ON e.DESIGNATION_ID = des.DESIGNATION_ID
      WHERE ${whereSql}
      ORDER BY ${sortColumn} ${sortOrder}
      OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
    `;

    const dataBinds: oracledb.BindParameters = {
      ...(binds as Record<string, unknown>),
      offset,
      limit,
    };

    const dataResult = await executeSql<RawEmployeeRow>(dataSql, dataBinds);
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
   * Fetch single employee by ID.
   */
  async getEmployeeById(employeeId: number): Promise<Employee | null> {
    const sql = `
      SELECT 
        e.EMPLOYEE_ID,
        e.EMPLOYEE_CODE,
        e.FIRST_NAME,
        e.LAST_NAME,
        e.WORK_EMAIL,
        e.PHONE,
        e.DEPARTMENT_ID,
        e.DESIGNATION_ID,
        e.EMPLOYMENT_STATUS,
        e.HIRE_DATE,
        e.EXIT_DATE,
        e.CREATED_AT,
        e.UPDATED_AT,
        e.CREATED_BY,
        d.DEPARTMENT_NAME,
        des.DESIGNATION_NAME
      FROM HR_EMPLOYEES e
      LEFT JOIN HR_DEPARTMENTS d ON e.DEPARTMENT_ID = d.DEPARTMENT_ID
      LEFT JOIN HR_DESIGNATIONS des ON e.DESIGNATION_ID = des.DESIGNATION_ID
      WHERE e.EMPLOYEE_ID = :employeeId
    `;

    const result = await executeSql<RawEmployeeRow>(sql, { employeeId });
    const row = result.rows?.[0];
    return row ? mapRowToEmployee(row) : null;
  },

  /**
   * Create a new employee record.
   */
  async createEmployee(data: CreateEmployeeInput, hrUserId?: number): Promise<Employee> {
    // 1. Resolve departmentId if string department was given
    let departmentId = data.departmentId || null;
    if (!departmentId && data.department) {
      const depts = await masterService.getDepartments();
      const match = depts.find(d => d.departmentName.toLowerCase() === data.department?.toLowerCase());
      if (match) {
        departmentId = match.departmentId;
      } else {
        const createdDept = await masterService.createDepartment({ departmentName: data.department }, hrUserId);
        departmentId = createdDept.departmentId;
      }
    }

    // 2. Resolve designationId if string designation was given
    let designationId = data.designationId || null;
    if (!designationId && data.designation) {
      const desigs = await masterService.getDesignations();
      const match = desigs.find(d => d.designationName.toLowerCase() === data.designation?.toLowerCase());
      if (match) {
        designationId = match.designationId;
      } else {
        const createdDesig = await masterService.createDesignation({ designationName: data.designation }, hrUserId);
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

    const binds = {
      code: employeeCode,
      firstName,
      lastName: lastName || null,
      email,
      phone: data.phone || null,
      departmentId,
      designationId,
      status,
      hireDate: hireDateStr.slice(0, 10),
      exitDate: exitDateStr ? exitDateStr.slice(0, 10) : null,
      createdBy: hrUserId || null,
      out_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    };

    const sql = `
      INSERT INTO HR_EMPLOYEES (
        EMPLOYEE_CODE,
        FIRST_NAME,
        LAST_NAME,
        WORK_EMAIL,
        PHONE,
        DEPARTMENT_ID,
        DESIGNATION_ID,
        EMPLOYMENT_STATUS,
        HIRE_DATE,
        EXIT_DATE,
        CREATED_BY
      ) VALUES (
        :code,
        :firstName,
        :lastName,
        :email,
        :phone,
        :departmentId,
        :designationId,
        :status,
        TO_DATE(:hireDate, 'YYYY-MM-DD'),
        CASE WHEN :exitDate IS NOT NULL THEN TO_DATE(:exitDate, 'YYYY-MM-DD') ELSE NULL END,
        :createdBy
      )
      RETURNING EMPLOYEE_ID INTO :out_id
    `;

    try {
      const result = await executeSql(sql, binds);
      const outId = (result.outBinds as { out_id: number[] })?.out_id?.[0];

      const created = (await this.getEmployeeById(outId))!;

      await auditService.log({
        hrUserId,
        actionType: 'CREATE_EMPLOYEE',
        entityType: 'HR_EMPLOYEES',
        entityId: created.employeeId,
        details: { employeeCode: created.employeeCode, name: created.name, status: created.employmentStatus },
      });

      logger.info({ employeeId: created.employeeId, employeeCode: created.employeeCode }, 'Created employee in Oracle');
      return created;
    } catch (err) {
      const error = err as Error;
      if (error.message.includes('ORA-00001')) {
        throw new Error(`Employee code "${employeeCode}" already exists. Please choose a unique code.`);
      }
      throw error;
    }
  },

  /**
   * Update permitted employee fields.
   */
  async updateEmployee(employeeId: number, data: UpdateEmployeeInput, hrUserId?: number): Promise<Employee> {
    const existing = await this.getEmployeeById(employeeId);
    if (!existing) {
      throw new Error(`Employee with ID ${employeeId} not found.`);
    }

    const updates: string[] = ['UPDATED_AT = CURRENT_TIMESTAMP'];
    const binds: oracledb.BindParameters = { employeeId };

    if (data.firstName !== undefined) {
      updates.push('FIRST_NAME = :firstName');
      (binds as Record<string, unknown>).firstName = data.firstName;
    }

    if (data.lastName !== undefined) {
      updates.push('LAST_NAME = :lastName');
      (binds as Record<string, unknown>).lastName = data.lastName;
    }

    if (data.workEmail !== undefined) {
      updates.push('WORK_EMAIL = :workEmail');
      (binds as Record<string, unknown>).workEmail = data.workEmail || null;
    }

    if (data.phone !== undefined) {
      updates.push('PHONE = :phone');
      (binds as Record<string, unknown>).phone = data.phone || null;
    }

    if (data.departmentId !== undefined) {
      updates.push('DEPARTMENT_ID = :departmentId');
      (binds as Record<string, unknown>).departmentId = data.departmentId;
    }

    if (data.designationId !== undefined) {
      updates.push('DESIGNATION_ID = :designationId');
      (binds as Record<string, unknown>).designationId = data.designationId;
    }

    if (data.employmentStatus !== undefined) {
      updates.push('EMPLOYMENT_STATUS = :status');
      (binds as Record<string, unknown>).status = data.employmentStatus.toUpperCase();
    }

    if (data.hireDate !== undefined) {
      updates.push("HIRE_DATE = TO_DATE(:hireDate, 'YYYY-MM-DD')");
      (binds as Record<string, unknown>).hireDate = data.hireDate.slice(0, 10);
    }

    if (data.exitDate !== undefined) {
      if (data.exitDate) {
        updates.push("EXIT_DATE = TO_DATE(:exitDate, 'YYYY-MM-DD')");
        (binds as Record<string, unknown>).exitDate = data.exitDate.slice(0, 10);
      } else {
        updates.push('EXIT_DATE = NULL');
      }
    }

    const sql = `
      UPDATE HR_EMPLOYEES
      SET ${updates.join(', ')}
      WHERE EMPLOYEE_ID = :employeeId
    `;

    await executeSql(sql, binds);
    const updated = (await this.getEmployeeById(employeeId))!;

    await auditService.log({
      hrUserId,
      actionType: 'UPDATE_EMPLOYEE',
      entityType: 'HR_EMPLOYEES',
      entityId: employeeId,
      details: { updatedFields: Object.keys(data) },
    });

    return updated;
  },

  /**
   * Transactional offboarding workflow:
   * 1. Inserts offboarding record into HR_OFFBOARDING
   * 2. Sets HR_EMPLOYEES.EMPLOYMENT_STATUS = 'OFFBOARDING' and EXIT_DATE = plannedExitDate
   * 3. Logs action in HR_AUDIT_LOGS
   */
  async offboardEmployee(employeeId: number, data: OffboardEmployeeInput, hrUserId?: number): Promise<{
    employee: Employee;
    offboardingId: number;
  }> {
    const plannedExitDate = data.plannedExitDate || data.lastWorkingDay;
    if (!plannedExitDate) {
      throw new Error('Planned exit date / last working day is required.');
    }

    const noticeDate = data.noticeDate ? data.noticeDate.slice(0, 10) : new Date().toISOString().slice(0, 10);

    const offboardingId = await withTransaction(async (conn) => {
      // 1. Verify employee exists and can be offboarded
      const empRes = await conn.execute<RawEmployeeRow>(
        `SELECT EMPLOYEE_ID, EMPLOYEE_CODE, EMPLOYMENT_STATUS, FIRST_NAME, LAST_NAME
         FROM HR_EMPLOYEES
         WHERE EMPLOYEE_ID = :employeeId`,
        { employeeId }
      );
      const emp = empRes.rows?.[0];
      if (!emp) {
        throw new Error(`Employee with ID ${employeeId} not found.`);
      }

      if (emp.EMPLOYMENT_STATUS === 'EXITED') {
        throw new Error('Cannot schedule offboarding for an employee who has already exited.');
      }

      // Check for existing pending offboarding
      const existingOffboardRes = await conn.execute<{ OFFBOARDING_ID: number }>(
        `SELECT OFFBOARDING_ID
         FROM HR_OFFBOARDING
         WHERE EMPLOYEE_ID = :employeeId AND CLEARANCE_STATUS != 'COMPLETED'`,
        { employeeId }
      );
      if ((existingOffboardRes.rows || []).length > 0) {
        throw new Error('An active offboarding workflow already exists for this employee.');
      }

      // 2. Insert into HR_OFFBOARDING
      const offboardBinds = {
        employeeId,
        noticeDate,
        plannedExitDate: plannedExitDate.slice(0, 10),
        reason: data.exitReason || 'Scheduled transition',
        notes: data.notes || null,
        createdBy: hrUserId || null,
        out_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      };

      const offboardSql = `
        INSERT INTO HR_OFFBOARDING (
          EMPLOYEE_ID,
          NOTICE_DATE,
          PLANNED_EXIT_DATE,
          EXIT_REASON,
          CLEARANCE_STATUS,
          NOTES,
          CREATED_BY
        ) VALUES (
          :employeeId,
          TO_DATE(:noticeDate, 'YYYY-MM-DD'),
          TO_DATE(:plannedExitDate, 'YYYY-MM-DD'),
          :reason,
          'PENDING',
          :notes,
          :createdBy
        )
        RETURNING OFFBOARDING_ID INTO :out_id
      `;

      const offboardResult = await conn.execute(offboardSql, offboardBinds);
      const generatedId = (offboardResult.outBinds as { out_id: number[] })?.out_id?.[0];

      // 3. Update employee lifecycle status and exit date
      await conn.execute(
        `UPDATE HR_EMPLOYEES
         SET 
           EMPLOYMENT_STATUS = 'OFFBOARDING',
           EXIT_DATE = TO_DATE(:plannedExitDate, 'YYYY-MM-DD'),
           UPDATED_AT = CURRENT_TIMESTAMP
         WHERE EMPLOYEE_ID = :employeeId`,
        { plannedExitDate: plannedExitDate.slice(0, 10), employeeId }
      );

      // 4. Record audit log
      await auditService.log(
        {
          hrUserId,
          actionType: 'OFFBOARD_EMPLOYEE',
          entityType: 'HR_OFFBOARDING',
          entityId: generatedId,
          details: {
            employeeId,
            plannedExitDate,
            reason: data.exitReason,
          },
        },
        conn
      );

      logger.info({ employeeId, offboardingId: generatedId, plannedExitDate }, 'Offboarding initiated in Oracle transaction');
      return generatedId;
    });

    // 5. Fetch updated employee record after transaction has successfully committed
    const updated = (await this.getEmployeeById(employeeId))!;
    return { employee: updated, offboardingId };
  },
};
