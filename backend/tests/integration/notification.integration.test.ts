import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { executeSql, closePool } from '../../src/config/database.js';
import { notificationService } from '../../src/services/notification.service.js';

describe('Notification Synchronization & Read/Unread Integration Tests', () => {
  let userAId: string;
  let userBId: string;
  let employeeAId: number;

  before(async () => {
    // Create User A
    const resA = await executeSql<{ id: string }>(
      `INSERT INTO app_users (firebase_uid, email, display_name, role)
       VALUES ($1, $2, $3, 'user')
       RETURNING id`,
      [`fb_test_notif_a_${Date.now()}`, `test.notif.a.${Date.now()}@example.com`, 'User A']
    );
    userAId = resA.rows[0].id;

    // Create User B
    const resB = await executeSql<{ id: string }>(
      `INSERT INTO app_users (firebase_uid, email, display_name, role)
       VALUES ($1, $2, $3, 'user')
       RETURNING id`,
      [`fb_test_notif_b_${Date.now()}`, `test.notif.b.${Date.now()}@example.com`, 'User B']
    );
    userBId = resB.rows[0].id;

    // Create an employee in OFFBOARDING status for User A
    const empRes = await executeSql<{ employee_id: number }>(
      `INSERT INTO hr_employees (
         owner_user_id, employee_code, first_name, last_name, work_email,
         employment_status, hire_date, exit_date
       ) VALUES ($1, $2, $3, $4, $5, 'OFFBOARDING', CURRENT_DATE - INTERVAL '1 year', CURRENT_DATE + INTERVAL '14 days')
       RETURNING employee_id`,
      [
        userAId,
        `EMP-NOTIF-${Date.now()}`,
        'Siddharth',
        'Kapoor',
        `siddharth.${Date.now()}@testcompany.org`,
      ]
    );
    employeeAId = empRes.rows[0].employee_id;
  });

  after(async () => {
    if (userAId) {
      await executeSql(`DELETE FROM user_notifications WHERE user_id = $1`, [userAId]);
      await executeSql(`DELETE FROM hr_employees WHERE owner_user_id = $1`, [userAId]);
      await executeSql(`DELETE FROM app_users WHERE id = $1`, [userAId]);
    }
    if (userBId) {
      await executeSql(`DELETE FROM user_notifications WHERE user_id = $1`, [userBId]);
      await executeSql(`DELETE FROM app_users WHERE id = $1`, [userBId]);
    }
    await closePool();
  });

  it('should automatically synchronize offboarding lifecycle event into unread notification', async () => {
    const res = await notificationService.getNotifications(userAId);
    assert.strictEqual(res.total, 1);
    assert.strictEqual(res.unreadCount, 1);
    assert.strictEqual(res.notifications.length, 1);

    const notif = res.notifications[0];
    assert.strictEqual(notif.type, 'offboarding');
    assert.strictEqual(notif.isRead, false);
    assert.match(notif.title, /upcoming employee exit/i);
    assert.match(notif.message, /Siddharth Kapoor/);
  });

  it('should not duplicate notifications on repeated synchronization', async () => {
    // Re-run getNotifications multiple times
    const res1 = await notificationService.getNotifications(userAId);
    const res2 = await notificationService.getNotifications(userAId);

    assert.strictEqual(res1.total, 1);
    assert.strictEqual(res1.unreadCount, 1);
    assert.strictEqual(res2.total, 1);
    assert.strictEqual(res2.unreadCount, 1);
  });

  it('should mark a single notification as read and decrement unread count', async () => {
    const initial = await notificationService.getNotifications(userAId);
    const notifId = initial.notifications[0].id;

    const marked = await notificationService.markAsRead(userAId, notifId);
    assert.strictEqual(marked, true);

    const updated = await notificationService.getNotifications(userAId);
    assert.strictEqual(updated.total, 1);
    assert.strictEqual(updated.unreadCount, 0);
    assert.strictEqual(updated.notifications[0].isRead, true);
  });

  it('should preserve read status on subsequent synchronization without re-inserting unread notice', async () => {
    // Sync runs again during getNotifications
    const res = await notificationService.getNotifications(userAId);
    assert.strictEqual(res.total, 1);
    assert.strictEqual(res.unreadCount, 0);
    assert.strictEqual(res.notifications[0].isRead, true);
  });

  it('should mark all notifications as read', async () => {
    // Add two more custom notifications
    await notificationService.createNotification(userAId, {
      title: 'Milestone Anniversary',
      message: 'Employee completed 1 year.',
      type: 'info',
    });
    await notificationService.createNotification(userAId, {
      title: 'New Policy Published',
      message: 'Workspace policy updated.',
      type: 'info',
    });

    const before = await notificationService.getNotifications(userAId);
    assert.strictEqual(before.unreadCount, 2);
    assert.strictEqual(before.total, 3);

    const updatedCount = await notificationService.markAllAsRead(userAId);
    assert.strictEqual(updatedCount, 2);

    const after = await notificationService.getNotifications(userAId);
    assert.strictEqual(after.unreadCount, 0);
    assert.strictEqual(after.total, 3);
  });

  it('should enforce tenant isolation: User B cannot see or mark User A notifications', async () => {
    const userBRes = await notificationService.getNotifications(userBId);
    assert.strictEqual(userBRes.total, 0);
    assert.strictEqual(userBRes.unreadCount, 0);
    assert.strictEqual(userBRes.notifications.length, 0);

    // User B tries to mark User A's notification as read
    const userANotifs = await notificationService.getNotifications(userAId);
    const userANotifId = userANotifs.notifications[0].id;

    const markedByB = await notificationService.markAsRead(userBId, userANotifId);
    assert.strictEqual(markedByB, false);
  });
});
