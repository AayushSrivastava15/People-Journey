import { executeSql } from '../config/database.js';
import type { DashboardStats } from '../models/dashboard.model.js';
import { userService } from './user.service.js';

export interface PersonalDashboardData {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    photoUrl: string | null;
    role: string;
    accountStatus: string;
    createdAt?: string;
  };
  employeeProfile: {
    employeeId: number;
    employeeCode: string;
    departmentName: string | null;
    designationName: string | null;
    status: string;
    hireDate: string;
    exitDate: string | null;
  } | null;
  notifications: Array<{
    id: number;
    title: string;
    message: string;
    type: string;
    isRead: boolean;
    createdAt: string;
  }>;
  checklist: Array<{
    id: string;
    title: string;
    description: string;
    completed: boolean;
  }>;
}

export const dashboardService = {
  /**
   * Calculate live KPI metrics and aggregates from PostgreSQL for personal HR Workspace.
   * Scoped strictly to the authenticated user's workspace.
   */
  async getStats(ownerUserId: string): Promise<DashboardStats> {
    // 1. Month buckets for the last 6 months
    const now = new Date();
    const monthKeys: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d);
      monthKeys.push({ key, label });
    }

    // Consolidated single-scan query for status counts and date-range KPIs
    const kpiSummarySql = `
      SELECT
        COUNT(*) FILTER (WHERE UPPER(employment_status) = 'ACTIVE')::int AS active_cnt,
        COUNT(*) FILTER (WHERE UPPER(employment_status) = 'ONBOARDING')::int AS onboarding_cnt,
        COUNT(*) FILTER (WHERE UPPER(employment_status) = 'OFFBOARDING')::int AS offboarding_cnt,
        COUNT(*) FILTER (WHERE UPPER(employment_status) = 'EXITED')::int AS exited_cnt,
        COUNT(*) FILTER (
          WHERE hire_date >= DATE_TRUNC('month', CURRENT_TIMESTAMP)
            AND hire_date < DATE_TRUNC('month', CURRENT_TIMESTAMP) + INTERVAL '1 month'
        )::int AS joining_month_cnt,
        COUNT(*) FILTER (
          WHERE UPPER(employment_status) = 'ONBOARDING'
            AND hire_date >= CURRENT_DATE
            AND hire_date <= CURRENT_DATE + INTERVAL '14 days'
        )::int AS upcoming_joiners_cnt,
        COUNT(*) FILTER (
          WHERE UPPER(employment_status) = 'OFFBOARDING'
            AND COALESCE(last_working_day, exit_date) >= CURRENT_DATE
            AND COALESCE(last_working_day, exit_date) <= CURRENT_DATE + INTERVAL '14 days'
        )::int AS upcoming_exits_cnt
      FROM hr_employees
      WHERE owner_user_id = $1
    `;

    // Department breakdown
    const deptSql = `
      SELECT 
        COALESCE(d.department_name, 'Unassigned') AS dept_name,
        COUNT(e.employee_id)::int AS cnt
      FROM hr_employees e
      LEFT JOIN hr_departments d ON e.department_id = d.department_id
      WHERE e.owner_user_id = $1
        AND UPPER(e.employment_status) != 'EXITED'
      GROUP BY d.department_name
      ORDER BY cnt DESC
    `;

    // Monthly hires
    const hiresByMonthSql = `
      SELECT 
        TO_CHAR(hire_date, 'YYYY-MM') AS month_key,
        COUNT(*)::int AS cnt
      FROM hr_employees
      WHERE owner_user_id = $1
        AND hire_date >= DATE_TRUNC('month', CURRENT_TIMESTAMP) - INTERVAL '5 months'
      GROUP BY TO_CHAR(hire_date, 'YYYY-MM')
    `;

    // Monthly exits
    const exitsByMonthSql = `
      SELECT 
        TO_CHAR(exit_date, 'YYYY-MM') AS month_key,
        COUNT(*)::int AS cnt
      FROM hr_employees
      WHERE owner_user_id = $1
        AND exit_date IS NOT NULL 
        AND exit_date >= DATE_TRUNC('month', CURRENT_TIMESTAMP) - INTERVAL '5 months'
      GROUP BY TO_CHAR(exit_date, 'YYYY-MM')
    `;

    // Upcoming events (next 14 days)
    const eventsSql = `
      SELECT 
        e.employee_id::text AS id,
        TRIM(e.first_name || ' ' || COALESCE(e.last_name, '')) AS person,
        'Joining date' AS label,
        TO_CHAR(e.hire_date, 'YYYY-MM-DD') AS event_date,
        'Onboarding' AS status,
        '/dashboard/onboarding' AS path
      FROM hr_employees e
      WHERE e.owner_user_id = $1
        AND UPPER(e.employment_status) = 'ONBOARDING'
        AND e.hire_date >= CURRENT_DATE
        AND e.hire_date <= CURRENT_DATE + INTERVAL '14 days'
      UNION ALL
      SELECT 
        e.employee_id::text AS id,
        TRIM(e.first_name || ' ' || COALESCE(e.last_name, '')) AS person,
        'Last working day' AS label,
        TO_CHAR(COALESCE(e.last_working_day, e.exit_date), 'YYYY-MM-DD') AS event_date,
        'Offboarding' AS status,
        '/dashboard/offboarding' AS path
      FROM hr_employees e
      WHERE e.owner_user_id = $1
        AND UPPER(e.employment_status) = 'OFFBOARDING'
        AND COALESCE(e.last_working_day, e.exit_date) >= CURRENT_DATE
        AND COALESCE(e.last_working_day, e.exit_date) <= CURRENT_DATE + INTERVAL '14 days'
      ORDER BY event_date ASC
      LIMIT 6
    `;

    // Execute all 5 optimized queries concurrently in parallel
    const [
      kpiRes,
      deptRes,
      hiresByMonthRes,
      exitsByMonthRes,
      eventsRes,
    ] = await Promise.all([
      executeSql<{
        active_cnt: number;
        onboarding_cnt: number;
        offboarding_cnt: number;
        exited_cnt: number;
        joining_month_cnt: number;
        upcoming_joiners_cnt: number;
        upcoming_exits_cnt: number;
      }>(kpiSummarySql, [ownerUserId]),
      executeSql<{ dept_name: string; cnt: number }>(deptSql, [ownerUserId]),
      executeSql<{ month_key: string; cnt: number }>(hiresByMonthSql, [ownerUserId]),
      executeSql<{ month_key: string; cnt: number }>(exitsByMonthSql, [ownerUserId]),
      executeSql<{
        id: string;
        person: string;
        label: string;
        event_date: string;
        status: string;
        path: string;
      }>(eventsSql, [ownerUserId]),
    ]);

    const kpi = kpiRes.rows?.[0] || {
      active_cnt: 0,
      onboarding_cnt: 0,
      offboarding_cnt: 0,
      exited_cnt: 0,
      joining_month_cnt: 0,
      upcoming_joiners_cnt: 0,
      upcoming_exits_cnt: 0,
    };

    const activeCount = Number(kpi.active_cnt) || 0;
    const onboardingCount = Number(kpi.onboarding_cnt) || 0;
    const offboardingCount = Number(kpi.offboarding_cnt) || 0;
    const exitedCount = Number(kpi.exited_cnt) || 0;
    const totalCount = activeCount + onboardingCount + offboardingCount;

    const statusDistribution = [
      { name: 'Active', value: activeCount },
      { name: 'Onboarding', value: onboardingCount },
      { name: 'Offboarding', value: offboardingCount },
      { name: 'Exited', value: exitedCount },
    ];

    const departmentBreakdown = (deptRes.rows || []).map(r => ({
      name: r.dept_name,
      value: Number(r.cnt),
    }));

    const hiresMap = new Map<string, number>();
    for (const r of hiresByMonthRes.rows || []) {
      hiresMap.set(r.month_key, Number(r.cnt));
    }

    const exitsMap = new Map<string, number>();
    for (const r of exitsByMonthRes.rows || []) {
      exitsMap.set(r.month_key, Number(r.cnt));
    }

    const monthlyActivity = monthKeys.map(m => ({
      month: m.label,
      joining: hiresMap.get(m.key) || 0,
      exits: exitsMap.get(m.key) || 0,
    }));

    const upcomingEvents = (eventsRes.rows || []).map(e => ({
      id: e.id,
      person: e.person,
      label: e.label,
      date: e.event_date,
      status: e.status,
      path: e.path,
    }));

    return {
      totalEmployees: totalCount,
      activeEmployees: activeCount,
      onboardingEmployees: onboardingCount,
      offboardingEmployees: offboardingCount,
      exitedEmployees: exitedCount,
      joiningThisMonth: Number(kpi.joining_month_cnt) || 0,
      upcomingJoiners: Number(kpi.upcoming_joiners_cnt) || 0,
      upcomingExits: Number(kpi.upcoming_exits_cnt) || 0,
      statusDistribution,
      departmentBreakdown,
      monthlyActivity,
      upcomingEvents,
    };
  },

  /**
   * Retrieve personal dashboard data scoped specifically to the authenticated user.
   * Isolates records to only what this user owns or is authorized to see.
   */
  async getPersonalDashboard(userId: string, email: string): Promise<PersonalDashboardData> {
    const user = await userService.findById(userId);
    if (!user) {
      throw new Error('User not found.');
    }

    // Look for employee record matching user_id or email
    const empSql = `
      SELECT 
        e.employee_id,
        e.employee_code,
        e.employment_status,
        TO_CHAR(e.hire_date, 'YYYY-MM-DD') AS hire_date,
        TO_CHAR(e.exit_date, 'YYYY-MM-DD') AS exit_date,
        d.department_name,
        des.designation_name
      FROM hr_employees e
      LEFT JOIN hr_departments d ON e.department_id = d.department_id
      LEFT JOIN hr_designations des ON e.designation_id = des.designation_id
      WHERE e.user_id = $1 OR LOWER(e.work_email) = LOWER($2) OR LOWER(e.personal_email) = LOWER($2)
      LIMIT 1
    `;
    const empRes = await executeSql<{
      employee_id: number;
      employee_code: string;
      employment_status: string;
      hire_date: string;
      exit_date: string | null;
      department_name: string | null;
      designation_name: string | null;
    }>(empSql, [userId, email]);

    const empRow = empRes.rows?.[0];
    const employeeProfile = empRow
      ? {
          employeeId: empRow.employee_id,
          employeeCode: empRow.employee_code,
          departmentName: empRow.department_name,
          designationName: empRow.designation_name,
          status: empRow.employment_status,
          hireDate: empRow.hire_date,
          exitDate: empRow.exit_date,
        }
      : null;

    // Retrieve user notifications
    const notifSql = `
      SELECT id, title, message, type, is_read, created_at
      FROM user_notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `;
    const notifRes = await executeSql<{
      id: number;
      title: string;
      message: string;
      type: string;
      is_read: boolean;
      created_at: Date;
    }>(notifSql, [userId]);

    const notifications = (notifRes.rows || []).map(n => ({
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.type,
      isRead: n.is_read,
      createdAt: new Date(n.created_at).toISOString(),
    }));

    // Standard personal onboarding & journey checklist
    const checklist = [
      {
        id: 'chk-1',
        title: 'Account Registered',
        description: 'Google Authentication identity linked with PostgreSQL profile',
        completed: true,
      },
      {
        id: 'chk-2',
        title: 'Complete Profile Information',
        description: 'Verify your display name, notification preferences, and contact details',
        completed: Boolean(user.displayName),
      },
      {
        id: 'chk-3',
        title: 'Employee Record Linkage',
        description: employeeProfile
          ? `Linked to employee code ${employeeProfile.employeeCode} (${employeeProfile.status})`
          : 'HR Administrator profile link pending',
        completed: Boolean(employeeProfile),
      },
      {
        id: 'chk-4',
        title: 'Workspace Review',
        description: 'Explore the employee journey milestones and touchpoints',
        completed: true,
      },
    ];

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName ?? null,
        photoUrl: user.photoUrl ?? null,
        role: user.role,
        accountStatus: user.accountStatus,
        createdAt: user.createdAt,
      },
      employeeProfile,
      notifications,
      checklist,
    };
  },
};
