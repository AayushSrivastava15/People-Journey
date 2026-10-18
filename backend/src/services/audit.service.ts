import type oracledb from 'oracledb';
import { executeSql } from '../config/database';
import { logger } from '../utils/logger';

export interface AuditLogEntry {
  hrUserId?: number | null;
  actionType: string;
  entityType: string;
  entityId?: string | number | null;
  details?: Record<string, unknown> | string | null;
}

export const auditService = {
  /**
   * Record an audit event into HR_AUDIT_LOGS.
   * Can be executed within an ongoing Oracle transaction connection or standalone.
   */
  async log(entry: AuditLogEntry, connection?: oracledb.Connection): Promise<void> {
    const detailsStr = entry.details
      ? typeof entry.details === 'string'
        ? entry.details.slice(0, 2000)
        : JSON.stringify(entry.details).slice(0, 2000)
      : null;

    const binds = {
      hrUserId: entry.hrUserId ?? null,
      actionType: entry.actionType.slice(0, 50),
      entityType: entry.entityType.slice(0, 50),
      entityId: entry.entityId ? String(entry.entityId).slice(0, 100) : null,
      details: detailsStr,
    };

    const sql = `
      INSERT INTO HR_AUDIT_LOGS (HR_USER_ID, ACTION_TYPE, ENTITY_TYPE, ENTITY_ID, DETAILS)
      VALUES (:hrUserId, :actionType, :entityType, :entityId, :details)
    `;

    try {
      if (connection) {
        await connection.execute(sql, binds);
      } else {
        await executeSql(sql, binds);
      }
    } catch (err) {
      // Audit logging should not crash the main operation, but must be logged
      logger.error({ err, entry }, 'Failed to record audit log entry');
    }
  },
};
