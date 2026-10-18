import { describe, it } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import {
  CreateEmployeeSchema,
  UpdateEmployeeSchema,
  OffboardEmployeeSchema,
  EmployeeQuerySchema,
} from '../../src/models/employee.model';
import { CreateDepartmentSchema, CreateDesignationSchema } from '../../src/models/master.model';

describe('Employee Validation Schemas', () => {
  it('should validate valid employee creation payload', () => {
    const input = {
      firstName: 'Maya',
      lastName: 'Chen',
      workEmail: 'maya.chen@company.com',
      hireDate: '2026-03-01',
      employmentStatus: 'ACTIVE',
      departmentId: 1,
    };
    const result = CreateEmployeeSchema.safeParse(input);
    ok(result.success, 'Valid input must parse successfully');
    if (result.success) {
      strictEqual(result.data.firstName, 'Maya');
      strictEqual(result.data.employmentStatus, 'ACTIVE');
    }
  });

  it('should reject employee creation missing hireDate', () => {
    const input = {
      firstName: 'Maya',
      workEmail: 'maya.chen@company.com',
    };
    const result = CreateEmployeeSchema.safeParse(input);
    strictEqual(result.success, false);
  });

  it('should reject invalid email format', () => {
    const input = {
      firstName: 'Maya',
      workEmail: 'not-an-email',
      hireDate: '2026-03-01',
    };
    const result = CreateEmployeeSchema.safeParse(input);
    strictEqual(result.success, false);
  });

  it('should validate employee query parameters with defaults', () => {
    const result = EmployeeQuerySchema.safeParse({});
    ok(result.success);
    if (result.success) {
      strictEqual(result.data.page, 1);
      strictEqual(result.data.limit, 10);
      strictEqual(result.data.sortBy, 'CREATED_AT');
      strictEqual(result.data.sortOrder, 'DESC');
    }
  });

  it('should reject unapproved sort columns', () => {
    const result = EmployeeQuerySchema.safeParse({ sortBy: 'PASSWORD' });
    strictEqual(result.success, false);
  });

  it('should validate offboarding payload', () => {
    const result = OffboardEmployeeSchema.safeParse({
      plannedExitDate: '2026-04-15',
      exitReason: 'Career transition',
      notes: 'Handover complete',
    });
    ok(result.success);
  });

  it('should reject offboarding without planned exit date', () => {
    const result = OffboardEmployeeSchema.safeParse({
      exitReason: 'Career transition',
    });
    strictEqual(result.success, false);
  });
});

describe('Master Lookup Schemas', () => {
  it('should validate department creation', () => {
    const result = CreateDepartmentSchema.safeParse({
      departmentName: 'Engineering',
      description: 'Platform team',
    });
    ok(result.success);
  });

  it('should reject empty department name', () => {
    const result = CreateDepartmentSchema.safeParse({
      departmentName: '   ',
    });
    strictEqual(result.success, false);
  });

  it('should validate designation creation', () => {
    const result = CreateDesignationSchema.safeParse({
      designationName: 'Staff Engineer',
    });
    ok(result.success);
  });
});
