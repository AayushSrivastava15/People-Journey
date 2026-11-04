import { executeSql } from '../config/database.js';
import { logger } from '../utils/logger.js';

export interface UserNotificationRecord {
  id: number;
  userId: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

const formatHumanDate = (dateVal: string | Date | null | undefined): string => {
  if (!dateVal) return 'soon';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(d);
  } catch {
    return String(dateVal);
  }
};

export const notificationService = {
  /**
   * Automatically reconciles active workspace lifecycle stages into user_notifications.
   * Ensures that active onboarding/offboarding employees and pending exit interviews
   * have a corresponding notification without generating duplicate rows.
   */
  async syncWorkspaceNotifications(userId: string): Promise<void> {
    try {
      // 1. Check active offboarding employees
      const offboardingRes = await executeSql<{
        employee_id: number;
        first_name: string;
        last_name: string | null;
        exit_date: Date | null;
      }>(
        `SELECT employee_id, first_name, last_name, exit_date
         FROM hr_employees
         WHERE owner_user_id = $1 AND employment_status = 'OFFBOARDING'`,
        [userId]
      );

      for (const emp of offboardingRes.rows) {
        const fullName = `${emp.first_name}${emp.last_name ? ' ' + emp.last_name : ''}`.trim();
        const dateStr = formatHumanDate(emp.exit_date);
        const title = 'Upcoming Employee Exit';
        const expectedPattern = `%${fullName}%`;

        // Check if a notification already exists for this offboarding employee
        const existing = await executeSql(
          `SELECT id FROM user_notifications
           WHERE user_id = $1 AND type = 'offboarding' AND message LIKE $2
           LIMIT 1`,
          [userId, expectedPattern]
        );

        if (existing.rowCount === 0) {
          await executeSql(
            `INSERT INTO user_notifications (user_id, title, message, type, is_read, created_at)
             VALUES ($1, $2, $3, 'offboarding', FALSE, CURRENT_TIMESTAMP)`,
            [
              userId,
              title,
              `${fullName} has an upcoming last working day on ${dateStr}.`,
            ]
          );
        }
      }

      // 2. Check active onboarding employees
      const onboardingRes = await executeSql<{
        employee_id: number;
        first_name: string;
        last_name: string | null;
        hire_date: Date | null;
      }>(
        `SELECT employee_id, first_name, last_name, hire_date
         FROM hr_employees
         WHERE owner_user_id = $1 AND employment_status = 'ONBOARDING'`,
        [userId]
      );

      for (const emp of onboardingRes.rows) {
        const fullName = `${emp.first_name}${emp.last_name ? ' ' + emp.last_name : ''}`.trim();
        const dateStr = formatHumanDate(emp.hire_date);
        const title = 'New Employee Onboarding';
        const expectedPattern = `%${fullName}%`;

        const existing = await executeSql(
          `SELECT id FROM user_notifications
           WHERE user_id = $1 AND type = 'onboarding' AND message LIKE $2
           LIMIT 1`,
          [userId, expectedPattern]
        );

        if (existing.rowCount === 0) {
          await executeSql(
            `INSERT INTO user_notifications (user_id, title, message, type, is_read, created_at)
             VALUES ($1, $2, $3, 'onboarding', FALSE, CURRENT_TIMESTAMP)`,
            [
              userId,
              title,
              `${fullName} has been added to your workspace (Scheduled start: ${dateStr}).`,
            ]
          );
        }
      }

      // 3. Check completed exit interviews awaiting review
      const exitRes = await executeSql<{
        id: string;
        first_name: string;
        last_name: string | null;
      }>(
        `SELECT i.id, e.first_name, e.last_name
         FROM hr_exit_interviews i
         JOIN hr_employees e ON e.employee_id = i.employee_id AND e.owner_user_id = i.owner_user_id
         WHERE i.owner_user_id = $1 AND i.status = 'COMPLETED'
           AND NOT EXISTS (
             SELECT 1 FROM hr_exit_interview_evaluations ev WHERE ev.interview_id = i.id
           )`,
        [userId]
      );

      for (const interview of exitRes.rows) {
        const fullName = `${interview.first_name}${interview.last_name ? ' ' + interview.last_name : ''}`.trim();
        const title = 'Pending Exit Interview';
        const expectedPattern = `%${fullName}%`;

        const existing = await executeSql(
          `SELECT id FROM user_notifications
           WHERE user_id = $1 AND type = 'exit_management' AND message LIKE $2
           LIMIT 1`,
          [userId, expectedPattern]
        );

        if (existing.rowCount === 0) {
          await executeSql(
            `INSERT INTO user_notifications (user_id, title, message, type, is_read, created_at)
             VALUES ($1, $2, $3, 'exit_management', FALSE, CURRENT_TIMESTAMP)`,
            [
              userId,
              title,
              `${fullName}'s exit interview response is awaiting review.`,
            ]
          );
        }
      }
    } catch (err) {
      logger.error({ message: (err as Error).message }, 'Error during workspace notification synchronization');
    }
  },

  /**
   * Retrieves paginated notifications and total unread count for the user.
   */
  async getNotifications(userId: string, limit = 10): Promise<{
    notifications: UserNotificationRecord[];
    unreadCount: number;
    total: number;
  }> {
    // Reconcile lifecycle events first
    await this.syncWorkspaceNotifications(userId);

    const rowsRes = await executeSql<{
      id: number;
      user_id: string;
      title: string;
      message: string;
      type: string;
      is_read: boolean;
      created_at: Date;
    }>(
      `SELECT id, user_id, title, message, type, is_read, created_at
       FROM user_notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    const countRes = await executeSql<{ unread_count: number; total_count: number }>(
      `SELECT
         COUNT(*) FILTER (WHERE is_read = FALSE)::int AS unread_count,
         COUNT(*)::int AS total_count
       FROM user_notifications
       WHERE user_id = $1`,
      [userId]
    );

    const notifications: UserNotificationRecord[] = (rowsRes.rows || []).map(r => ({
      id: r.id,
      userId: r.user_id,
      title: r.title,
      message: r.message,
      type: r.type,
      isRead: r.is_read,
      createdAt: new Date(r.created_at).toISOString(),
    }));

    const counts = countRes.rows[0] || { unread_count: 0, total_count: 0 };

    return {
      notifications,
      unreadCount: counts.unread_count || 0,
      total: counts.total_count || 0,
    };
  },

  /**
   * Marks a single notification as read.
   */
  async markAsRead(userId: string, notificationId: number): Promise<boolean> {
    const res = await executeSql(
      `UPDATE user_notifications
       SET is_read = TRUE
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [notificationId, userId]
    );
    return (res.rowCount ?? 0) > 0;
  },

  /**
   * Marks all unread notifications for a user as read.
   */
  async markAllAsRead(userId: string): Promise<number> {
    const res = await executeSql(
      `UPDATE user_notifications
       SET is_read = TRUE
       WHERE user_id = $1 AND is_read = FALSE
       RETURNING id`,
      [userId]
    );
    return res.rowCount ?? 0;
  },

  /**
   * Creates a custom notification.
   */
  async createNotification(
    userId: string,
    data: { title: string; message: string; type: string }
  ): Promise<UserNotificationRecord> {
    const res = await executeSql<{
      id: number;
      user_id: string;
      title: string;
      message: string;
      type: string;
      is_read: boolean;
      created_at: Date;
    }>(
      `INSERT INTO user_notifications (user_id, title, message, type, is_read, created_at)
       VALUES ($1, $2, $3, $4, FALSE, CURRENT_TIMESTAMP)
       RETURNING id, user_id, title, message, type, is_read, created_at`,
      [userId, data.title, data.message, data.type]
    );

    const r = res.rows[0];
    return {
      id: r.id,
      userId: r.user_id,
      title: r.title,
      message: r.message,
      type: r.type,
      isRead: r.is_read,
      createdAt: new Date(r.created_at).toISOString(),
    };
  },
};
