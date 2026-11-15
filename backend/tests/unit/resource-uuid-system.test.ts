import { describe, it } from 'node:test';
import { strictEqual, ok, notStrictEqual } from 'node:assert';
import { EmployeeSchema } from '../../src/models/employee.model.js';

describe('Resource UUID System - Schema and Validation', () => {
  const sampleUuid = 'c8373250-9f5b-4d40-9a40-218080649539';
  const invalidUuid = 'not-a-valid-uuid';

  it('1. should accept and validate an employee with a valid UUID resource identifier', () => {
    const payload = {
      employeeId: 42,
      uuid: sampleUuid,
      employeeCode: 'EMP-0042',
      firstName: 'Aarav',
      lastName: 'Sharma',
      name: 'Aarav Sharma',
      workEmail: 'aarav.sharma@company.com',
      personalEmail: null,
      phone: '+91 9876543210',
      departmentId: 1,
      designationId: 2,
      departmentName: 'Engineering',
      designationName: 'Senior Software Engineer',
      employmentStatus: 'ACTIVE',
      status: 'Active',
      hireDate: '2026-01-15',
      exitDate: null,
      createdAt: '2026-01-15T09:00:00Z',
      updatedAt: '2026-01-15T09:00:00Z',
    };

    const parsed = EmployeeSchema.safeParse(payload);
    ok(parsed.success, 'Valid employee with UUID should pass parsing');
    if (parsed.success) {
      strictEqual(parsed.data.uuid, sampleUuid);
      strictEqual(parsed.data.employeeId, 42);
      strictEqual(parsed.data.employeeCode, 'EMP-0042');
    }
  });

  it('2. should reject an employee with a corrupted or invalid UUID format', () => {
    const payload = {
      employeeId: 42,
      uuid: invalidUuid,
      employeeCode: 'EMP-0042',
      firstName: 'Aarav',
      lastName: null,
      name: 'Aarav',
      workEmail: 'aarav@company.com',
      departmentId: null,
      designationId: null,
      departmentName: null,
      designationName: null,
      employmentStatus: 'ACTIVE',
      status: 'Active',
      hireDate: '2026-01-15',
      exitDate: null,
    };

    const parsed = EmployeeSchema.safeParse(payload);
    strictEqual(parsed.success, false, 'Invalid UUID string format must fail schema validation');
  });

  it('3. should allow backward-compatible employee object without uuid field (optional)', () => {
    const payload = {
      employeeId: 101,
      employeeCode: 'EMP-0101',
      firstName: 'Priya',
      lastName: 'Patel',
      name: 'Priya Patel',
      workEmail: 'priya@company.com',
      departmentId: null,
      designationId: null,
      departmentName: null,
      designationName: null,
      employmentStatus: 'ACTIVE',
      status: 'Active',
      hireDate: '2026-02-01',
      exitDate: null,
    };

    const parsed = EmployeeSchema.safeParse(payload);
    ok(parsed.success, 'Employee without explicit uuid should still be accepted for backwards compatibility');
  });
});

describe('Resource UUID Identifier Parser Contract', () => {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function parseEmployeeIdentifier(raw: unknown): number | string | null {
    const value = Array.isArray(raw) ? raw[0] : raw;
    const trimmed = typeof value === 'string' ? value.trim() : String(value || '').trim();
    if (UUID_REGEX.test(trimmed)) {
      return trimmed;
    }
    const numeric = Number(trimmed);
    if (!isNaN(numeric) && Number.isInteger(numeric) && numeric > 0) {
      return numeric;
    }
    return null;
  }

  it('4. should correctly identify standard lowercase UUIDv4', () => {
    const input = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
    const parsed = parseEmployeeIdentifier(input);
    strictEqual(parsed, input);
  });

  it('5. should correctly identify uppercase UUIDv4 and normalize whitespace', () => {
    const input = '  A1B2C3D4-E5F6-4A7B-8C9D-0E1F2A3B4C5D  ';
    const parsed = parseEmployeeIdentifier(input);
    strictEqual(parsed, input.trim());
  });

  it('6. should correctly identify numeric legacy employee ID', () => {
    const input = '123';
    const parsed = parseEmployeeIdentifier(input);
    strictEqual(parsed, 123);
  });

  it('7. should reject invalid strings, negative numbers, and injection attacks', () => {
    strictEqual(parseEmployeeIdentifier('not-a-uuid-or-number'), null);
    strictEqual(parseEmployeeIdentifier('-5'), null);
    strictEqual(parseEmployeeIdentifier('0'), null);
    strictEqual(parseEmployeeIdentifier("123; DROP TABLE hr_employees;"), null);
    strictEqual(parseEmployeeIdentifier(''), null);
    strictEqual(parseEmployeeIdentifier(undefined), null);
    strictEqual(parseEmployeeIdentifier(null), null);
  });
});
