import { executeSql } from '../config/database';
import type { DashboardStats } from '../models/dashboard.model';

export const dashboardService = {
  /**
   * Calculate live KPI metrics and aggregates from Oracle Database.
   */
  async getStats(): Promise<DashboardStats> {
    // 1. Status distribution
    const statusSql = `
      SELECT EMPLOYMENT_STATUS, COUNT(*) AS CNT
      FROM HR_EMPLOYEES
      GROUP BY EMPLOYMENT_STATUS
    `;
    const statusRes = await executeSql<{ EMPLOYMENT_STATUS: string; CNT: number }>(statusSql);
    const statusMap = new Map<string, number>();
    for (const row of statusRes.rows || []) {
      statusMap.set(row.EMPLOYMENT_STATUS.toUpperCase(), Number(row.CNT));
    }

    const activeCount = statusMap.get('ACTIVE') || 0;
    const onboardingCount = statusMap.get('ONBOARDING') || 0;
    const offboardingCount = statusMap.get('OFFBOARDING') || 0;
    const exitedCount = statusMap.get('EXITED') || 0;
    const totalCount = activeCount + onboardingCount + offboardingCount;

    const statusDistribution = [
      { name: 'Active', value: activeCount },
      { name: 'Onboarding', value: onboardingCount },
      { name: 'Offboarding', value: offboardingCount },
      { name: 'Exited', value: exitedCount },
    ];

    // 2. Joining this month
    const joiningMonthSql = `
      SELECT COUNT(*) AS CNT
      FROM HR_EMPLOYEES
      WHERE HIRE_DATE >= TRUNC(SYSDATE, 'MM') 
        AND HIRE_DATE < ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1)
    `;
    const joiningMonthRes = await executeSql<{ CNT: number }>(joiningMonthSql);
    const joiningThisMonth = Number(joiningMonthRes.rows?.[0]?.CNT || 0);

    // 3. Upcoming joiners (next 7 days)
    const upcomingJoinersSql = `
      SELECT COUNT(*) AS CNT
      FROM HR_EMPLOYEES
      WHERE EMPLOYMENT_STATUS = 'ONBOARDING'
        AND HIRE_DATE >= TRUNC(SYSDATE)
        AND HIRE_DATE <= TRUNC(SYSDATE) + 7
    `;
    const upcomingJoinersRes = await executeSql<{ CNT: number }>(upcomingJoinersSql);
    const upcomingJoiners = Number(upcomingJoinersRes.rows?.[0]?.CNT || 0);

    // 4. Upcoming exits (next 7 days)
    const upcomingExitsSql = `
      SELECT COUNT(*) AS CNT
      FROM HR_EMPLOYEES
      WHERE EMPLOYMENT_STATUS = 'OFFBOARDING'
        AND EXIT_DATE >= TRUNC(SYSDATE)
        AND EXIT_DATE <= TRUNC(SYSDATE) + 7
    `;
    const upcomingExitsRes = await executeSql<{ CNT: number }>(upcomingExitsSql);
    const upcomingExits = Number(upcomingExitsRes.rows?.[0]?.CNT || 0);

    // 5. Department breakdown
    const deptSql = `
      SELECT 
        COALESCE(d.DEPARTMENT_NAME, 'Unassigned') AS DEPT_NAME,
        COUNT(e.EMPLOYEE_ID) AS CNT
      FROM HR_EMPLOYEES e
      LEFT JOIN HR_DEPARTMENTS d ON e.DEPARTMENT_ID = d.DEPARTMENT_ID
      WHERE e.EMPLOYMENT_STATUS != 'EXITED'
      GROUP BY d.DEPARTMENT_NAME
      ORDER BY CNT DESC
    `;
    const deptRes = await executeSql<{ DEPT_NAME: string; CNT: number }>(deptSql);
    const departmentBreakdown = (deptRes.rows || []).map(r => ({
      name: r.DEPT_NAME,
      value: Number(r.CNT),
    }));

    // 6. Monthly activity (last 6 months)
    const now = new Date();
    const monthKeys: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d);
      monthKeys.push({ key, label });
    }

    const hiresByMonthSql = `
      SELECT 
        TO_CHAR(HIRE_DATE, 'YYYY-MM') AS MONTH_KEY,
        COUNT(*) AS CNT
      FROM HR_EMPLOYEES
      WHERE HIRE_DATE >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -5)
      GROUP BY TO_CHAR(HIRE_DATE, 'YYYY-MM')
    `;
    const hiresByMonthRes = await executeSql<{ MONTH_KEY: string; CNT: number }>(hiresByMonthSql);
    const hiresMap = new Map<string, number>();
    for (const r of hiresByMonthRes.rows || []) {
      hiresMap.set(r.MONTH_KEY, Number(r.CNT));
    }

    const exitsByMonthSql = `
      SELECT 
        TO_CHAR(EXIT_DATE, 'YYYY-MM') AS MONTH_KEY,
        COUNT(*) AS CNT
      FROM HR_EMPLOYEES
      WHERE EXIT_DATE IS NOT NULL 
        AND EXIT_DATE >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -5)
      GROUP BY TO_CHAR(EXIT_DATE, 'YYYY-MM')
    `;
    const exitsByMonthRes = await executeSql<{ MONTH_KEY: string; CNT: number }>(exitsByMonthSql);
    const exitsMap = new Map<string, number>();
    for (const r of exitsByMonthRes.rows || []) {
      exitsMap.set(r.MONTH_KEY, Number(r.CNT));
    }

    const monthlyActivity = monthKeys.map(m => ({
      month: m.label,
      joining: hiresMap.get(m.key) || 0,
      exits: exitsMap.get(m.key) || 0,
    }));

    // 7. Upcoming events (next 14 days)
    const eventsSql = `
      SELECT 
        TO_CHAR(EMPLOYEE_ID) AS ID,
        TRIM(FIRST_NAME || ' ' || NVL(LAST_NAME, '')) AS PERSON,
        'Joining date' AS LABEL,
        TO_CHAR(HIRE_DATE, 'YYYY-MM-DD') AS EVENT_DATE,
        'Onboarding' AS STATUS,
        '/dashboard/onboarding' AS PATH
      FROM HR_EMPLOYEES
      WHERE EMPLOYMENT_STATUS = 'ONBOARDING'
        AND HIRE_DATE >= TRUNC(SYSDATE)
        AND HIRE_DATE <= TRUNC(SYSDATE) + 14
      UNION ALL
      SELECT 
        TO_CHAR(EMPLOYEE_ID) AS ID,
        TRIM(FIRST_NAME || ' ' || NVL(LAST_NAME, '')) AS PERSON,
        'Last working day' AS LABEL,
        TO_CHAR(EXIT_DATE, 'YYYY-MM-DD') AS EVENT_DATE,
        'Offboarding' AS STATUS,
        '/dashboard/offboarding' AS PATH
      FROM HR_EMPLOYEES
      WHERE EMPLOYMENT_STATUS = 'OFFBOARDING'
        AND EXIT_DATE >= TRUNC(SYSDATE)
        AND EXIT_DATE <= TRUNC(SYSDATE) + 14
      ORDER BY EVENT_DATE ASC
      FETCH FIRST 6 ROWS ONLY
    `;
    const eventsRes = await executeSql<{
      ID: string;
      PERSON: string;
      LABEL: string;
      EVENT_DATE: string;
      STATUS: string;
      PATH: string;
    }>(eventsSql);

    const upcomingEvents = (eventsRes.rows || []).map(e => ({
      id: e.ID,
      person: e.PERSON,
      label: e.LABEL,
      date: e.EVENT_DATE,
      status: e.STATUS,
      path: e.PATH,
    }));

    return {
      totalEmployees: totalCount,
      activeEmployees: activeCount,
      onboardingEmployees: onboardingCount,
      offboardingEmployees: offboardingCount,
      exitedEmployees: exitedCount,
      joiningThisMonth,
      upcomingJoiners,
      upcomingExits,
      statusDistribution,
      departmentBreakdown,
      monthlyActivity,
      upcomingEvents,
    };
  },
};
