import { executeSql } from '../config/database.js';
import type {
  AppUser,
  AppRole,
  CreateUserInput,
  UpdateUserProfileInput,
  AdminUpdateUserInput,
} from '../models/user.model.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { authCache } from '../utils/auth-cache.js';

interface RawAppUserRow {
  id: string;
  firebase_uid: string;
  email: string;
  display_name: string | null;
  photo_url: string | null;
  role: 'user';
  account_status: 'active' | 'deactivated' | 'suspended';
  preferences: Record<string, unknown> | null;
  created_at: Date | string;
  updated_at: Date | string;
  last_login_at: Date | string | null;
}

function mapRowToAppUser(row: RawAppUserRow): AppUser {
  return {
    id: row.id,
    firebaseUid: row.firebase_uid,
    email: row.email,
    displayName: row.display_name,
    photoUrl: row.photo_url,
    role: row.role,
    accountStatus: row.account_status,
    preferences: row.preferences || {},
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
  };
}

export const userService = {
  /**
   * Find user by authoritative Firebase UID.
   */
  async findByFirebaseUid(firebaseUid: string): Promise<AppUser | null> {
    const result = await executeSql<RawAppUserRow>(
      `SELECT id, firebase_uid, email, display_name, photo_url, role, account_status, preferences, created_at, updated_at, last_login_at
       FROM app_users
       WHERE firebase_uid = $1`,
      [firebaseUid]
    );

    const row = result.rows?.[0];
    return row ? mapRowToAppUser(row) : null;
  },

  /**
   * Find user by email (case-insensitive).
   */
  async findByEmail(email: string): Promise<AppUser | null> {
    const result = await executeSql<RawAppUserRow>(
      `SELECT id, firebase_uid, email, display_name, photo_url, role, account_status, preferences, created_at, updated_at, last_login_at
       FROM app_users
       WHERE LOWER(email) = LOWER($1)`,
      [email.trim().toLowerCase()]
    );

    const row = result.rows?.[0];
    return row ? mapRowToAppUser(row) : null;
  },

  /**
   * Find user by primary UUID key.
   */
  async findById(id: string): Promise<AppUser | null> {
    const result = await executeSql<RawAppUserRow>(
      `SELECT id, firebase_uid, email, display_name, photo_url, role, account_status, preferences, created_at, updated_at, last_login_at
       FROM app_users
       WHERE id = $1`,
      [id]
    );

    const row = result.rows?.[0];
    return row ? mapRowToAppUser(row) : null;
  },

  /**
   * Get total count of registered application users.
   */
  async count(): Promise<number> {
    const result = await executeSql<{ total: string }>('SELECT COUNT(*) AS total FROM app_users');
    return parseInt(result.rows?.[0]?.total || '0', 10);
  },

  /**
   * Atomic Google Authentication registration and login sync.
   * - New user: auto-created with role 'user' and status 'active'.
   * - Returning user: updates last_login_at and syncs display info.
   * - Concurrency-safe: utilizes ON CONFLICT (firebase_uid) atomic upsert.
   */
  async syncGoogleUser(data: {
    firebaseUid: string;
    email: string;
    displayName?: string;
    photoUrl?: string;
  }): Promise<AppUser> {
    const email = data.email.trim().toLowerCase();
    const displayName = data.displayName?.trim() || null;
    const photoUrl = data.photoUrl?.trim() || null;
    const initialRole: AppRole = 'user';

    const sql = `
      INSERT INTO app_users (
        firebase_uid,
        email,
        display_name,
        photo_url,
        role,
        account_status,
        preferences,
        last_login_at
      )
      VALUES ($1, $2, $3, $4, $5, 'active', '{}'::jsonb, CURRENT_TIMESTAMP)
      ON CONFLICT (firebase_uid) DO UPDATE
      SET
        email = EXCLUDED.email,
        display_name = COALESCE(EXCLUDED.display_name, app_users.display_name),
        photo_url = COALESCE(EXCLUDED.photo_url, app_users.photo_url),
        last_login_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, firebase_uid, email, display_name, photo_url, role, account_status, preferences, created_at, updated_at, last_login_at;
    `;

    const result = await executeSql<RawAppUserRow>(sql, [
      data.firebaseUid,
      email,
      displayName,
      photoUrl,
      initialRole,
    ]);

    const row = result.rows?.[0];
    if (!row) {
      throw new Error('Failed to register or update user profile in PostgreSQL.');
    }

    return mapRowToAppUser(row);
  },

  /**
   * Manual creation (e.g. for provisioning scripts or admins).
   */
  async create(data: CreateUserInput): Promise<AppUser> {
    const email = data.email.trim().toLowerCase();
    const role = data.role || 'user';
    const status = data.accountStatus || 'active';
    const preferences = data.preferences || {};

    const sql = `
      INSERT INTO app_users (
        firebase_uid,
        email,
        display_name,
        photo_url,
        role,
        account_status,
        preferences
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, firebase_uid, email, display_name, photo_url, role, account_status, preferences, created_at, updated_at, last_login_at;
    `;

    const result = await executeSql<RawAppUserRow>(sql, [
      data.firebaseUid,
      email,
      data.displayName || null,
      data.photoUrl || null,
      role,
      status,
      JSON.stringify(preferences),
    ]);

    const row = result.rows?.[0];
    if (!row) {
      throw new Error('Failed to create user in database.');
    }

    return mapRowToAppUser(row);
  },

  /**
   * User self-service profile update (only display_name, photo_url, preferences).
   */
  async updateProfile(userId: string, data: UpdateUserProfileInput): Promise<AppUser> {
    const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const params: unknown[] = [userId];
    let paramIndex = 2;

    if (data.displayName !== undefined) {
      updates.push(`display_name = $${paramIndex++}`);
      params.push(data.displayName);
    }

    if (data.photoUrl !== undefined) {
      updates.push(`photo_url = $${paramIndex++}`);
      params.push(data.photoUrl || null);
    }

    if (data.preferences !== undefined) {
      updates.push(`preferences = $${paramIndex++}`);
      params.push(JSON.stringify(data.preferences));
    }

    const sql = `
      UPDATE app_users
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING id, firebase_uid, email, display_name, photo_url, role, account_status, preferences, created_at, updated_at, last_login_at;
    `;

    const result = await executeSql<RawAppUserRow>(sql, params);
    const row = result.rows?.[0];
    if (!row) {
      throw new Error(`User with ID ${userId} not found.`);
    }

    authCache.invalidate(userId);
    return mapRowToAppUser(row);
  },

  /**
   * Administrative user update (role, account status, display name).
   */
  async adminUpdate(userId: string, data: AdminUpdateUserInput): Promise<AppUser> {
    const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const params: unknown[] = [userId];
    let paramIndex = 2;

    if (data.role !== undefined) {
      updates.push(`role = $${paramIndex++}`);
      params.push(data.role);
    }

    if (data.accountStatus !== undefined) {
      updates.push(`account_status = $${paramIndex++}`);
      params.push(data.accountStatus);
    }

    if (data.displayName !== undefined) {
      updates.push(`display_name = $${paramIndex++}`);
      params.push(data.displayName);
    }

    const sql = `
      UPDATE app_users
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING id, firebase_uid, email, display_name, photo_url, role, account_status, preferences, created_at, updated_at, last_login_at;
    `;

    const result = await executeSql<RawAppUserRow>(sql, params);
    const row = result.rows?.[0];
    if (!row) {
      throw new Error(`User with ID ${userId} not found.`);
    }

    authCache.invalidate(userId);
    return mapRowToAppUser(row);
  },

  /**
   * List all registered users (Admin only).
   */
  async findAll(): Promise<AppUser[]> {
    const result = await executeSql<RawAppUserRow>(
      `SELECT id, firebase_uid, email, display_name, photo_url, role, account_status, preferences, created_at, updated_at, last_login_at
       FROM app_users
       ORDER BY created_at DESC`
    );

    return (result.rows || []).map(mapRowToAppUser);
  },
};
