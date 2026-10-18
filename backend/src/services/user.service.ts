import oracledb from 'oracledb';
import { executeSql } from '../config/database';
import type { HrUser, CreateHrUserInput, UpdateHrUserInput } from '../models/user.model';
import { logger } from '../utils/logger';

interface RawHrUserRow {
  HR_USER_ID: number;
  FIREBASE_UID: string;
  EMAIL: string;
  FULL_NAME: string;
  HR_ROLE: 'hr_admin' | 'hr_staff';
  IS_ACTIVE: string;
  CREATED_AT?: Date | string;
  UPDATED_AT?: Date | string;
}

function mapRowToHrUser(row: RawHrUserRow): HrUser {
  return {
    hrUserId: Number(row.HR_USER_ID),
    firebaseUid: row.FIREBASE_UID,
    email: row.EMAIL,
    fullName: row.FULL_NAME,
    role: row.HR_ROLE,
    isActive: row.IS_ACTIVE === 'Y',
    createdAt: row.CREATED_AT ? new Date(row.CREATED_AT).toISOString() : undefined,
    updatedAt: row.UPDATED_AT ? new Date(row.UPDATED_AT).toISOString() : undefined,
  };
}

export const userService = {
  /**
   * Find an HR user by their verified Firebase UID.
   */
  async findByFirebaseUid(firebaseUid: string): Promise<HrUser | null> {
    const result = await executeSql<RawHrUserRow>(
      `SELECT HR_USER_ID, FIREBASE_UID, EMAIL, FULL_NAME, HR_ROLE, IS_ACTIVE, CREATED_AT, UPDATED_AT
       FROM HR_USERS
       WHERE FIREBASE_UID = :firebaseUid`,
      { firebaseUid }
    );

    const row = result.rows?.[0];
    return row ? mapRowToHrUser(row) : null;
  },

  /**
   * Find an HR user by email (case-insensitive).
   */
  async findByEmail(email: string): Promise<HrUser | null> {
    const result = await executeSql<RawHrUserRow>(
      `SELECT HR_USER_ID, FIREBASE_UID, EMAIL, FULL_NAME, HR_ROLE, IS_ACTIVE, CREATED_AT, UPDATED_AT
       FROM HR_USERS
       WHERE LOWER(EMAIL) = LOWER(:email)`,
      { email: email.trim().toLowerCase() }
    );

    const row = result.rows?.[0];
    return row ? mapRowToHrUser(row) : null;
  },

  /**
   * Find an HR user by their database primary key.
   */
  async findById(hrUserId: number): Promise<HrUser | null> {
    const result = await executeSql<RawHrUserRow>(
      `SELECT HR_USER_ID, FIREBASE_UID, EMAIL, FULL_NAME, HR_ROLE, IS_ACTIVE, CREATED_AT, UPDATED_AT
       FROM HR_USERS
       WHERE HR_USER_ID = :hrUserId`,
      { hrUserId }
    );

    const row = result.rows?.[0];
    return row ? mapRowToHrUser(row) : null;
  },

  /**
   * Get the total count of registered HR users in Oracle.
   */
  async count(): Promise<number> {
    const result = await executeSql<{ TOTAL: number }>('SELECT COUNT(*) AS TOTAL FROM HR_USERS');
    return Number(result.rows?.[0]?.TOTAL || 0);
  },

  /**
   * Link an existing user record to a newly verified Firebase UID.
   */
  async linkFirebaseUid(hrUserId: number, firebaseUid: string): Promise<void> {
    await executeSql(
      `UPDATE HR_USERS
       SET FIREBASE_UID = :firebaseUid, UPDATED_AT = CURRENT_TIMESTAMP
       WHERE HR_USER_ID = :hrUserId`,
      { firebaseUid, hrUserId }
    );
  },

  /**
   * Create a new HR user record in Oracle.
   */
  async create(data: CreateHrUserInput): Promise<HrUser> {
    const email = data.email.trim().toLowerCase();
    const fullName = data.fullName.trim();
    const role = data.role || 'hr_staff';
    const firebaseUid = data.firebaseUid || `pending_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const binds = {
      firebaseUid,
      email,
      fullName,
      role,
      out_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    };

    const result = await executeSql(
      `INSERT INTO HR_USERS (FIREBASE_UID, EMAIL, FULL_NAME, HR_ROLE, IS_ACTIVE)
       VALUES (:firebaseUid, :email, :fullName, :role, 'Y')
       RETURNING HR_USER_ID INTO :out_id`,
      binds
    );

    const outId = (result.outBinds as { out_id: number[] })?.out_id?.[0];
    if (!outId) {
      throw new Error('Failed to retrieve generated HR_USER_ID from insert operation.');
    }

    const created = await this.findById(outId);
    if (!created) {
      throw new Error('Failed to load created HR user from database.');
    }

    logger.info({ hrUserId: outId, email, role }, 'Created new HR user in Oracle');
    return created;
  },

  /**
   * List all HR users.
   */
  async findAll(): Promise<HrUser[]> {
    const result = await executeSql<RawHrUserRow>(
      `SELECT HR_USER_ID, FIREBASE_UID, EMAIL, FULL_NAME, HR_ROLE, IS_ACTIVE, CREATED_AT, UPDATED_AT
       FROM HR_USERS
       ORDER BY CREATED_AT DESC`
    );

    return (result.rows || []).map(mapRowToHrUser);
  },

  /**
   * Update an existing HR user's details or status.
   */
  async update(hrUserId: number, data: UpdateHrUserInput): Promise<HrUser> {
    const existing = await this.findById(hrUserId);
    if (!existing) {
      throw new Error(`HR User with ID ${hrUserId} not found.`);
    }

    const updates: string[] = ['UPDATED_AT = CURRENT_TIMESTAMP'];
    const binds: oracledb.BindParameters = { hrUserId };

    if (data.fullName !== undefined) {
      updates.push('FULL_NAME = :fullName');
      binds.fullName = data.fullName.trim();
    }

    if (data.role !== undefined) {
      updates.push('HR_ROLE = :role');
      binds.role = data.role;
    }

    if (data.isActive !== undefined) {
      updates.push('IS_ACTIVE = :isActive');
      binds.isActive = data.isActive ? 'Y' : 'N';
    }

    await executeSql(
      `UPDATE HR_USERS
       SET ${updates.join(', ')}
       WHERE HR_USER_ID = :hrUserId`,
      binds
    );

    return (await this.findById(hrUserId))!;
  },
};
