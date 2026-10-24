import { executeSql } from '../config/database';
import type { Department, Designation, CreateDepartmentInput, CreateDesignationInput } from '../models/master.model';
import { auditService } from './audit.service';
import { logger } from '../utils/logger';

interface RawDepartmentRow {
  department_id: number;
  department_name: string;
  description: string | null;
  is_active: boolean;
  employee_count?: number | string;
  created_at?: Date | string;
  owner_user_id?: string;
}

interface RawDesignationRow {
  designation_id: number;
  designation_name: string;
  description: string | null;
  created_at?: Date | string;
  owner_user_id?: string;
}

const DEFAULT_DEPARTMENTS = [
  { name: 'Product', desc: 'Product Strategy & Management' },
  { name: 'Engineering', desc: 'Software & Infrastructure Engineering' },
  { name: 'Design', desc: 'Product & User Experience Design' },
  { name: 'People', desc: 'Human Resources & Talent Management' },
  { name: 'Operations', desc: 'Business & Office Operations' },
];

const DEFAULT_DESIGNATIONS = [
  { name: 'Software Engineer', desc: 'Full-stack software engineering' },
  { name: 'Senior Software Engineer', desc: 'Senior software engineering & architecture' },
  { name: 'Product Manager', desc: 'Product leadership and roadmap execution' },
  { name: 'Product Designer', desc: 'UI/UX interface and interaction design' },
  { name: 'HR Specialist', desc: 'People operations & lifecycle specialist' },
  { name: 'Operations Lead', desc: 'Cross-functional operational coordination' },
];

let isMasterDataSeeded = false;

export const masterService = {
  /**
   * Seed initial departments and designations if tables are empty.
   */
  async ensureSeededDefaults(): Promise<void> {
    if (isMasterDataSeeded) return;

    try {
      const deptCountRes = await executeSql<{ cnt: string }>('SELECT COUNT(*) AS cnt FROM hr_departments');
      if (parseInt(deptCountRes.rows?.[0]?.cnt || '0', 10) === 0) {
        logger.info('Seeding default HR departments into PostgreSQL...');
        for (const d of DEFAULT_DEPARTMENTS) {
          await executeSql(
            `INSERT INTO hr_departments (department_name, description, is_active, owner_user_id)
             VALUES ($1, $2, TRUE, NULL)
             ON CONFLICT (department_name) DO NOTHING`,
            [d.name, d.desc]
          );
        }
      }

      const desigCountRes = await executeSql<{ cnt: string }>('SELECT COUNT(*) AS cnt FROM hr_designations');
      if (parseInt(desigCountRes.rows?.[0]?.cnt || '0', 10) === 0) {
        logger.info('Seeding default HR designations into PostgreSQL...');
        for (const des of DEFAULT_DESIGNATIONS) {
          await executeSql(
            `INSERT INTO hr_designations (designation_name, description, owner_user_id)
             VALUES ($1, $2, NULL)
             ON CONFLICT (designation_name) DO NOTHING`,
            [des.name, des.desc]
          );
        }
      }
      isMasterDataSeeded = true;
    } catch (err) {
      logger.error({ err }, 'Error during default master data seeding in PostgreSQL');
    }
  },

  /**
   * Get all active departments with employee counts scoped to the user workspace.
   */
  async getDepartments(ownerUserId?: string): Promise<Department[]> {
    await this.ensureSeededDefaults();

    const sql = `
      SELECT 
        d.department_id,
        d.department_name,
        d.description,
        d.is_active,
        d.created_at,
        COUNT(e.employee_id)::int AS employee_count
      FROM hr_departments d
      LEFT JOIN hr_employees e 
        ON d.department_id = e.department_id 
        AND e.employment_status != 'EXITED'
        AND ($1::uuid IS NULL OR e.owner_user_id = $1::uuid)
      WHERE d.is_active = TRUE
        AND ($1::uuid IS NULL OR d.owner_user_id IS NULL OR d.owner_user_id = $1::uuid)
      GROUP BY d.department_id, d.department_name, d.description, d.is_active, d.created_at
      ORDER BY d.department_name ASC
    `;

    const result = await executeSql<RawDepartmentRow>(sql, [ownerUserId || null]);
    return (result.rows || []).map(row => ({
      departmentId: Number(row.department_id),
      departmentName: row.department_name,
      description: row.description,
      isActive: Boolean(row.is_active),
      employeeCount: Number(row.employee_count || 0),
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    }));
  },

  /**
   * Find department by ID.
   */
  async findDepartmentById(id: number): Promise<Department | null> {
    const result = await executeSql<RawDepartmentRow>(
      `SELECT department_id, department_name, description, is_active, created_at
       FROM hr_departments
       WHERE department_id = $1`,
      [id]
    );
    const row = result.rows?.[0];
    if (!row) return null;
    return {
      departmentId: Number(row.department_id),
      departmentName: row.department_name,
      description: row.description,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    };
  },

  /**
   * Create a new department for the user workspace.
   */
  async createDepartment(input: CreateDepartmentInput, ownerUserId?: string): Promise<Department> {
    const sql = `
      INSERT INTO hr_departments (department_name, description, is_active, owner_user_id)
      VALUES ($1, $2, TRUE, $3)
      RETURNING department_id, department_name, description, is_active, created_at;
    `;

    const result = await executeSql<RawDepartmentRow>(sql, [
      input.departmentName.trim(),
      input.description?.trim() || null,
      ownerUserId || null,
    ]);

    const row = result.rows?.[0];
    if (!row) {
      throw new Error('Failed to create department in PostgreSQL.');
    }

    const dept: Department = {
      departmentId: Number(row.department_id),
      departmentName: row.department_name,
      description: row.description,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    };

    await auditService.log({
      userId: ownerUserId,
      actionType: 'CREATE_DEPARTMENT',
      entityType: 'HR_DEPARTMENTS',
      entityId: String(dept.departmentId),
      details: { departmentName: dept.departmentName },
    });

    return dept;
  },

  /**
   * Get all designations accessible in workspace (global defaults + user created).
   */
  async getDesignations(ownerUserId?: string): Promise<Designation[]> {
    await this.ensureSeededDefaults();

    const result = await executeSql<RawDesignationRow>(
      `SELECT designation_id, designation_name, description, created_at
       FROM hr_designations
       WHERE ($1::uuid IS NULL OR owner_user_id IS NULL OR owner_user_id = $1::uuid)
       ORDER BY designation_name ASC`,
      [ownerUserId || null]
    );

    return (result.rows || []).map(row => ({
      designationId: Number(row.designation_id),
      designationName: row.designation_name,
      description: row.description,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    }));
  },

  /**
   * Find designation by ID.
   */
  async findDesignationById(id: number): Promise<Designation | null> {
    const result = await executeSql<RawDesignationRow>(
      `SELECT designation_id, designation_name, description, created_at
       FROM hr_designations
       WHERE designation_id = $1`,
      [id]
    );
    const row = result.rows?.[0];
    if (!row) return null;
    return {
      designationId: Number(row.designation_id),
      designationName: row.designation_name,
      description: row.description,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    };
  },

  /**
   * Create a new designation for user workspace.
   */
  async createDesignation(input: CreateDesignationInput, ownerUserId?: string): Promise<Designation> {
    const sql = `
      INSERT INTO hr_designations (designation_name, description, owner_user_id)
      VALUES ($1, $2, $3)
      RETURNING designation_id, designation_name, description, created_at;
    `;

    const result = await executeSql<RawDesignationRow>(sql, [
      input.designationName.trim(),
      input.description?.trim() || null,
      ownerUserId || null,
    ]);

    const row = result.rows?.[0];
    if (!row) {
      throw new Error('Failed to create designation in PostgreSQL.');
    }

    const desig: Designation = {
      designationId: Number(row.designation_id),
      designationName: row.designation_name,
      description: row.description,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    };

    await auditService.log({
      userId: ownerUserId,
      actionType: 'CREATE_DESIGNATION',
      entityType: 'HR_DESIGNATIONS',
      entityId: String(desig.designationId),
      details: { designationName: desig.designationName },
    });

    return desig;
  },
};
