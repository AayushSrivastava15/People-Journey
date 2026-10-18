import oracledb from 'oracledb';
import { executeSql } from '../config/database';
import type { Department, Designation, CreateDepartmentInput, CreateDesignationInput } from '../models/master.model';
import { auditService } from './audit.service';
import { logger } from '../utils/logger';

interface RawDepartmentRow {
  DEPARTMENT_ID: number;
  DEPARTMENT_NAME: string;
  DESCRIPTION: string | null;
  IS_ACTIVE: string;
  EMPLOYEE_COUNT?: number;
  CREATED_AT?: Date | string;
}

interface RawDesignationRow {
  DESIGNATION_ID: number;
  DESIGNATION_NAME: string;
  DESCRIPTION: string | null;
  CREATED_AT?: Date | string;
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

export const masterService = {
  /**
   * Automatically seed initial departments and designations if tables are empty.
   */
  async ensureSeededDefaults(): Promise<void> {
    try {
      const deptCount = await executeSql<{ CNT: number }>('SELECT COUNT(*) AS CNT FROM HR_DEPARTMENTS');
      if (Number(deptCount.rows?.[0]?.CNT || 0) === 0) {
        logger.info('Seeding default HR departments into Oracle...');
        for (const d of DEFAULT_DEPARTMENTS) {
          await executeSql(
            `INSERT INTO HR_DEPARTMENTS (DEPARTMENT_NAME, DESCRIPTION, IS_ACTIVE)
             VALUES (:name, :description, 'Y')`,
            { name: d.name, description: d.desc }
          );
        }
      }

      const desigCount = await executeSql<{ CNT: number }>('SELECT COUNT(*) AS CNT FROM HR_DESIGNATIONS');
      if (Number(desigCount.rows?.[0]?.CNT || 0) === 0) {
        logger.info('Seeding default HR designations into Oracle...');
        for (const des of DEFAULT_DESIGNATIONS) {
          await executeSql(
            `INSERT INTO HR_DESIGNATIONS (DESIGNATION_NAME, DESCRIPTION)
             VALUES (:name, :description)`,
            { name: des.name, description: des.desc }
          );
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error during default master data seeding');
    }
  },

  /**
   * Get all active departments with employee counts.
   */
  async getDepartments(): Promise<Department[]> {
    await this.ensureSeededDefaults();

    const sql = `
      SELECT 
        d.DEPARTMENT_ID,
        d.DEPARTMENT_NAME,
        d.DESCRIPTION,
        d.IS_ACTIVE,
        d.CREATED_AT,
        COUNT(e.EMPLOYEE_ID) AS EMPLOYEE_COUNT
      FROM HR_DEPARTMENTS d
      LEFT JOIN HR_EMPLOYEES e 
        ON d.DEPARTMENT_ID = e.DEPARTMENT_ID 
        AND e.EMPLOYMENT_STATUS != 'EXITED'
      WHERE d.IS_ACTIVE = 'Y'
      GROUP BY d.DEPARTMENT_ID, d.DEPARTMENT_NAME, d.DESCRIPTION, d.IS_ACTIVE, d.CREATED_AT
      ORDER BY d.DEPARTMENT_NAME ASC
    `;

    const result = await executeSql<RawDepartmentRow>(sql);
    return (result.rows || []).map(row => ({
      departmentId: Number(row.DEPARTMENT_ID),
      departmentName: row.DEPARTMENT_NAME,
      description: row.DESCRIPTION,
      isActive: row.IS_ACTIVE === 'Y',
      employeeCount: Number(row.EMPLOYEE_COUNT || 0),
      createdAt: row.CREATED_AT ? new Date(row.CREATED_AT).toISOString() : undefined,
    }));
  },

  /**
   * Find department by ID.
   */
  async findDepartmentById(id: number): Promise<Department | null> {
    const result = await executeSql<RawDepartmentRow>(
      `SELECT DEPARTMENT_ID, DEPARTMENT_NAME, DESCRIPTION, IS_ACTIVE, CREATED_AT
       FROM HR_DEPARTMENTS
       WHERE DEPARTMENT_ID = :id`,
      { id }
    );
    const row = result.rows?.[0];
    if (!row) return null;
    return {
      departmentId: Number(row.DEPARTMENT_ID),
      departmentName: row.DEPARTMENT_NAME,
      description: row.DESCRIPTION,
      isActive: row.IS_ACTIVE === 'Y',
      createdAt: row.CREATED_AT ? new Date(row.CREATED_AT).toISOString() : undefined,
    };
  },

  /**
   * Create a new department.
   */
  async createDepartment(input: CreateDepartmentInput, hrUserId?: number): Promise<Department> {
    const binds = {
      name: input.departmentName,
      description: input.description || null,
      out_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    };

    const result = await executeSql(
      `INSERT INTO HR_DEPARTMENTS (DEPARTMENT_NAME, DESCRIPTION, IS_ACTIVE)
       VALUES (:name, :description, 'Y')
       RETURNING DEPARTMENT_ID INTO :out_id`,
      binds
    );

    const outId = (result.outBinds as { out_id: number[] })?.out_id?.[0];
    const dept = (await this.findDepartmentById(outId))!;

    await auditService.log({
      hrUserId,
      actionType: 'CREATE_DEPARTMENT',
      entityType: 'HR_DEPARTMENTS',
      entityId: dept.departmentId,
      details: { departmentName: dept.departmentName },
    });

    return dept;
  },

  /**
   * Get all designations.
   */
  async getDesignations(): Promise<Designation[]> {
    await this.ensureSeededDefaults();

    const result = await executeSql<RawDesignationRow>(
      `SELECT DESIGNATION_ID, DESIGNATION_NAME, DESCRIPTION, CREATED_AT
       FROM HR_DESIGNATIONS
       ORDER BY DESIGNATION_NAME ASC`
    );

    return (result.rows || []).map(row => ({
      designationId: Number(row.DESIGNATION_ID),
      designationName: row.DESIGNATION_NAME,
      description: row.DESCRIPTION,
      createdAt: row.CREATED_AT ? new Date(row.CREATED_AT).toISOString() : undefined,
    }));
  },

  /**
   * Find designation by ID.
   */
  async findDesignationById(id: number): Promise<Designation | null> {
    const result = await executeSql<RawDesignationRow>(
      `SELECT DESIGNATION_ID, DESIGNATION_NAME, DESCRIPTION, CREATED_AT
       FROM HR_DESIGNATIONS
       WHERE DESIGNATION_ID = :id`,
      { id }
    );
    const row = result.rows?.[0];
    if (!row) return null;
    return {
      designationId: Number(row.DESIGNATION_ID),
      designationName: row.DESIGNATION_NAME,
      description: row.DESCRIPTION,
      createdAt: row.CREATED_AT ? new Date(row.CREATED_AT).toISOString() : undefined,
    };
  },

  /**
   * Create a new designation.
   */
  async createDesignation(input: CreateDesignationInput, hrUserId?: number): Promise<Designation> {
    const binds = {
      name: input.designationName,
      description: input.description || null,
      out_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    };

    const result = await executeSql(
      `INSERT INTO HR_DESIGNATIONS (DESIGNATION_NAME, DESCRIPTION)
       VALUES (:name, :description)
       RETURNING DESIGNATION_ID INTO :out_id`,
      binds
    );

    const outId = (result.outBinds as { out_id: number[] })?.out_id?.[0];
    const desig = (await this.findDesignationById(outId))!;

    await auditService.log({
      hrUserId,
      actionType: 'CREATE_DESIGNATION',
      entityType: 'HR_DESIGNATIONS',
      entityId: desig.designationId,
      details: { designationName: desig.designationName },
    });

    return desig;
  },
};
