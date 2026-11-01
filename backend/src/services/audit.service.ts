import type pg from 'pg';
import { executeSql } from '../config/database.js';
import { logger } from '../utils/logger.js';

export interface AuditLogEntry {
  userId?: string | null;
  hrUserId?: number | string | null; // compatibility alias
  actionType: string;
  entityType: string;
  entityId?: string | number | null;
  details?: Record<string, unknown> | string | null;
}

export const auditService = {
  /**
   * Record an audit event into hr_audit_logs.
   * Can be executed within an ongoing PostgreSQL transaction client or standalone.
   */
  async log(entry: AuditLogEntry, client?: pg.PoolClient): Promise<void> {
    const rawUserId = entry.userId || (entry.hrUserId ? String(entry.hrUserId) : null);
    
    // Check if rawUserId is a valid UUID, otherwise null
    const isValidUuid = rawUserId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawUserId);
    const userId = isValidUuid ? rawUserId : null;

    const detailsJson = entry.details
      ? typeof entry.details === 'string'
        ? entry.details
        : JSON.stringify(entry.details)
      : null;

    const sql = `
      INSERT INTO hr_audit_logs (user_id, action_type, entity_type, entity_id, details)
      VALUES ($1, $2, $3, $4, $5::jsonb)
    `;

    const params = [
      userId,
      entry.actionType.slice(0, 100),
      entry.entityType.slice(0, 100),
      entry.entityId ? String(entry.entityId).slice(0, 100) : null,
      detailsJson,
    ];

    try {
      if (client) {
        await client.query(sql, params);
      } else {
        await executeSql(sql, params);
      }
    } catch (err) {
      // Audit logging should not crash the main business operation, but must be logged
      logger.error({ err, entry }, 'Failed to record audit log entry in PostgreSQL');
    }
  },
};
