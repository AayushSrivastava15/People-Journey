import { initPool, closePool, executeSql, withTransaction } from '../src/config/database.js';
import { MASTER_EXIT_QUESTIONNAIRE } from '../src/config/master-exit-questionnaire.js';
import { notificationService } from '../src/services/notification.service.js';
import { randomBytes, randomUUID, createHash } from 'node:crypto';

const USER_ID = '015054b5-e1a0-433e-b072-f1b6fc8b3e44';
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const BASE62_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
function generateShortCode(length = 7): string {
  const bytes = randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += BASE62_CHARS[bytes[i] % 62];
  }
  return result;
}

const employeesToSeed = [
  // 1. Engineering
  {
    code: 'EMP-102901',
    firstName: 'Aarav',
    lastName: 'Sharma',
    email: 'aarav.sharma@lalacompany.com',
    phone: '+91 98201 11201',
    departmentId: 2, // Engineering
    designationId: 2, // Senior Software Engineer
    status: 'ACTIVE',
    hireDate: '2024-03-15',
    exitDate: null,
  },
  {
    code: 'EMP-102902',
    firstName: 'Priya',
    lastName: 'Patel',
    email: 'priya.patel@lalacompany.com',
    phone: '+91 98201 11202',
    departmentId: 2, // Engineering
    designationId: 1, // Software Engineer
    status: 'ACTIVE',
    hireDate: '2024-08-01',
    exitDate: null,
  },
  {
    code: 'EMP-102903',
    firstName: 'Rohan',
    lastName: 'Verma',
    email: 'rohan.verma@lalacompany.com',
    phone: '+91 98201 11203',
    departmentId: 2, // Engineering
    designationId: 2, // Senior Software Engineer
    status: 'OFFBOARDING',
    hireDate: '2023-05-10',
    exitDate: '2026-11-20',
    noticeDate: '2026-10-20',
    exitReason: 'Pursuing Master’s Degree abroad',
    hasPendingSurvey: true,
  },
  {
    code: 'EMP-102904',
    firstName: 'Vikram',
    lastName: 'Malhotra',
    email: 'vikram.malhotra@lalacompany.com',
    phone: '+91 98201 11204',
    departmentId: 2, // Engineering
    designationId: 1, // Software Engineer
    status: 'EXITED',
    hireDate: '2023-01-10',
    exitDate: '2026-10-31',
    noticeDate: '2026-09-30',
    exitReason: 'Better career growth opportunity',
    hasCompletedSurvey: true,
    surveyDetails: {
      primaryReason: 'Career growth & compensation',
      satisfaction: 4,
      recommend: 'Yes',
      rejoin: 'Yes',
      keyFeedback: 'Loved the engineering team and culture. Transition was very smooth.',
    },
  },
  {
    code: 'EMP-102905',
    firstName: 'Ananya',
    lastName: 'Gupta',
    email: 'ananya.gupta@lalacompany.com',
    phone: '+91 98201 11205',
    departmentId: 2, // Engineering
    designationId: 1, // Software Engineer
    status: 'ONBOARDING',
    hireDate: '2026-11-12',
    exitDate: null,
  },

  // 2. Product
  {
    code: 'EMP-102906',
    firstName: 'Karan',
    lastName: 'Kapoor',
    email: 'karan.kapoor@lalacompany.com',
    phone: '+91 98201 11206',
    departmentId: 1, // Product
    designationId: 3, // Product Manager
    status: 'ACTIVE',
    hireDate: '2023-11-01',
    exitDate: null,
  },
  {
    code: 'EMP-102907',
    firstName: 'Neha',
    lastName: 'Reddy',
    email: 'neha.reddy@lalacompany.com',
    phone: '+91 98201 11207',
    departmentId: 1, // Product
    designationId: 3, // Product Manager
    status: 'OFFBOARDING',
    hireDate: '2024-01-15',
    exitDate: '2026-11-25',
    noticeDate: '2026-10-25',
    exitReason: 'Relocation to another city',
    hasPendingSurvey: true,
  },
  {
    code: 'EMP-102908',
    firstName: 'Devendra',
    lastName: 'Singh',
    email: 'devendra.singh@lalacompany.com',
    phone: '+91 98201 11208',
    departmentId: 1, // Product
    designationId: 3, // Product Manager
    status: 'EXITED',
    hireDate: '2023-06-01',
    exitDate: '2026-10-15',
    noticeDate: '2026-09-15',
    exitReason: 'Accepted role at early-stage startup',
    hasCompletedSurvey: true,
    surveyDetails: {
      primaryReason: 'New venture startup opportunity',
      satisfaction: 5,
      recommend: 'Definitely',
      rejoin: 'Yes',
      keyFeedback: 'Incredible product roadmap and strong executive leadership.',
    },
  },
  {
    code: 'EMP-102909',
    firstName: 'Sanya',
    lastName: 'Joshi',
    email: 'sanya.joshi@lalacompany.com',
    phone: '+91 98201 11209',
    departmentId: 1, // Product
    designationId: 3, // Product Manager
    status: 'ONBOARDING',
    hireDate: '2026-11-18',
    exitDate: null,
  },

  // 3. Design
  {
    code: 'EMP-102910',
    firstName: 'Ishaan',
    lastName: 'Nair',
    email: 'ishaan.nair@lalacompany.com',
    phone: '+91 98201 11210',
    departmentId: 3, // Design
    designationId: 4, // Product Designer
    status: 'ACTIVE',
    hireDate: '2024-04-10',
    exitDate: null,
  },
  {
    code: 'EMP-102911',
    firstName: 'Tanvi',
    lastName: 'Mehta',
    email: 'tanvi.mehta@lalacompany.com',
    phone: '+91 98201 11211',
    departmentId: 3, // Design
    designationId: 4, // Product Designer
    status: 'OFFBOARDING',
    hireDate: '2023-09-01',
    exitDate: '2026-11-28',
    noticeDate: '2026-10-28',
    exitReason: 'Freelancing and independent consulting',
    hasPendingSurvey: true,
  },
  {
    code: 'EMP-102912',
    firstName: 'Kabir',
    lastName: 'Sen',
    email: 'kabir.sen@lalacompany.com',
    phone: '+91 98201 11212',
    departmentId: 3, // Design
    designationId: 4, // Product Designer
    status: 'EXITED',
    hireDate: '2023-02-15',
    exitDate: '2026-09-30',
    noticeDate: '2026-08-30',
    exitReason: 'Health and personal reasons',
    hasCompletedSurvey: true,
    surveyDetails: {
      primaryReason: 'Personal sabbatical',
      satisfaction: 4,
      recommend: 'Yes',
      rejoin: 'Maybe in future',
      keyFeedback: 'Design system was top notch. Appreciated the creative freedom.',
    },
  },
  {
    code: 'EMP-102913',
    firstName: 'Rhea',
    lastName: "D'Souza",
    email: 'rhea.dsouza@lalacompany.com',
    phone: '+91 98201 11213',
    departmentId: 3, // Design
    designationId: 4, // Product Designer
    status: 'ONBOARDING',
    hireDate: '2026-11-15',
    exitDate: null,
  },

  // 4. People / HR
  {
    code: 'EMP-102914',
    firstName: 'Aditi',
    lastName: 'Deshmukh',
    email: 'aditi.deshmukh@lalacompany.com',
    phone: '+91 98201 11214',
    departmentId: 4, // People
    designationId: 5, // HR Specialist
    status: 'ACTIVE',
    hireDate: '2024-02-01',
    exitDate: null,
  },
  {
    code: 'EMP-102915',
    firstName: 'Manish',
    lastName: 'Tiwari',
    email: 'manish.tiwari@lalacompany.com',
    phone: '+91 98201 11215',
    departmentId: 4, // People
    designationId: 5, // HR Specialist
    status: 'OFFBOARDING',
    hireDate: '2023-12-01',
    exitDate: '2026-11-19',
    noticeDate: '2026-10-19',
    exitReason: 'Offer from global enterprise firm',
    hasPendingSurvey: true,
  },
  {
    code: 'EMP-102916',
    firstName: 'Meera',
    lastName: 'Iyer',
    email: 'meera.iyer@lalacompany.com',
    phone: '+91 98201 11216',
    departmentId: 4, // People
    designationId: 5, // HR Specialist
    status: 'ONBOARDING',
    hireDate: '2026-11-10',
    exitDate: null,
  },

  // 5. Operations
  {
    code: 'EMP-102917',
    firstName: 'Rajesh',
    lastName: 'Kumar',
    email: 'rajesh.kumar@lalacompany.com',
    phone: '+91 98201 11217',
    departmentId: 5, // Operations
    designationId: 6, // Operations Lead
    status: 'ACTIVE',
    hireDate: '2023-08-20',
    exitDate: null,
  },
  {
    code: 'EMP-102918',
    firstName: 'Simran',
    lastName: 'Kaur',
    email: 'simran.kaur@lalacompany.com',
    phone: '+91 98201 11218',
    departmentId: 5, // Operations
    designationId: 6, // Operations Lead
    status: 'OFFBOARDING',
    hireDate: '2024-05-10',
    exitDate: '2026-11-30',
    noticeDate: '2026-10-30',
    exitReason: 'Higher studies',
    hasPendingSurvey: true,
  },
  {
    code: 'EMP-102919',
    firstName: 'Arjun',
    lastName: 'Rao',
    email: 'arjun.rao@lalacompany.com',
    phone: '+91 98201 11219',
    departmentId: 5, // Operations
    designationId: 6, // Operations Lead
    status: 'EXITED',
    hireDate: '2023-03-01',
    exitDate: '2026-10-20',
    noticeDate: '2026-09-20',
    exitReason: 'Transition to international role',
    hasCompletedSurvey: true,
    surveyDetails: {
      primaryReason: 'International assignment',
      satisfaction: 5,
      recommend: 'Highly Recommend',
      rejoin: 'Definitely',
      keyFeedback: 'Operations team was exceptionally supportive and processes were very efficient.',
    },
  },
  {
    code: 'EMP-102920',
    firstName: 'Pooja',
    lastName: 'Nambiar',
    email: 'pooja.nambiar@lalacompany.com',
    phone: '+91 98201 11220',
    departmentId: 5, // Operations
    designationId: 6, // Operations Lead
    status: 'ONBOARDING',
    hireDate: '2026-11-22',
    exitDate: null,
  },
];

async function seed() {
  await initPool();
  console.log('Seeding employees for user:', USER_ID);

  // Get active exit template for this workspace
  const tplRes = await executeSql<{ id: string; version: number; schema_json: any }>(
    `SELECT id, version, schema_json FROM hr_exit_interview_templates
     WHERE (owner_user_id = $1 OR is_system_template = TRUE) AND is_active = TRUE
     ORDER BY is_system_template ASC, version DESC LIMIT 1`,
    [USER_ID]
  );
  const templateId = tplRes.rows[0]?.id;
  const templateVer = tplRes.rows[0]?.version || 1;
  const templateSchema = tplRes.rows[0]?.schema_json || MASTER_EXIT_QUESTIONNAIRE;

  for (const emp of employeesToSeed) {
    // Check if employee already exists
    const existing = await executeSql<{ employee_id: number }>(
      `SELECT employee_id FROM hr_employees WHERE owner_user_id = $1 AND employee_code = $2`,
      [USER_ID, emp.code]
    );

    let employeeId: number;
    if (existing.rowCount && existing.rowCount > 0) {
      employeeId = existing.rows[0].employee_id;
      // Update employee details
      await executeSql(
        `UPDATE hr_employees
         SET first_name = $1, last_name = $2, work_email = $3, phone = $4,
             department_id = $5, designation_id = $6, employment_status = $7,
             hire_date = $8, exit_date = $9
         WHERE employee_id = $10 AND owner_user_id = $11`,
        [
          emp.firstName,
          emp.lastName,
          emp.email,
          emp.phone,
          emp.departmentId,
          emp.designationId,
          emp.status,
          emp.hireDate,
          emp.exitDate,
          employeeId,
          USER_ID,
        ]
      );
      console.log(`Updated employee: ${emp.firstName} ${emp.lastName} (${emp.code})`);
    } else {
      const ins = await executeSql<{ employee_id: number }>(
        `INSERT INTO hr_employees (
          owner_user_id,
          employee_code,
          first_name,
          last_name,
          work_email,
          phone,
          department_id,
          designation_id,
          employment_status,
          hire_date,
          exit_date,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING employee_id`,
        [
          USER_ID,
          emp.code,
          emp.firstName,
          emp.lastName,
          emp.email,
          emp.phone,
          emp.departmentId,
          emp.designationId,
          emp.status,
          emp.hireDate,
          emp.exitDate,
          USER_ID,
        ]
      );
      employeeId = ins.rows[0].employee_id;
      console.log(`Inserted employee: ${emp.firstName} ${emp.lastName} (${emp.code}) [ID: ${employeeId}]`);
    }

    // Handle offboarding record
    if ((emp.status === 'OFFBOARDING' || emp.status === 'EXITED') && emp.exitDate) {
      await executeSql(
        `INSERT INTO hr_offboarding (
          employee_id,
          owner_user_id,
          notice_date,
          planned_exit_date,
          exit_reason,
          clearance_status,
          contact_email,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT DO NOTHING`,
        [
          employeeId,
          USER_ID,
          emp.noticeDate || '2026-10-15',
          emp.exitDate,
          emp.exitReason || 'Career progression',
          emp.status === 'EXITED' ? 'COMPLETED' : 'IN_PROGRESS',
          emp.email,
          USER_ID,
        ]
      );
    }

    // Handle Exit Interviews
    if (emp.hasPendingSurvey) {
      // Check if interview exists
      const exInt = await executeSql<{ id: string }>(
        `SELECT id FROM hr_exit_interviews WHERE owner_user_id = $1 AND employee_id = $2`,
        [USER_ID, employeeId]
      );
      if (!exInt.rowCount) {
        const shortCode = generateShortCode();
        const rawToken = randomBytes(32).toString('hex');
        await executeSql(
          `INSERT INTO hr_exit_interviews (
            owner_user_id,
            employee_id,
            template_id,
            template_version,
            template_snapshot,
            status,
            short_code,
            token_hash,
            expires_at,
            response_due_date,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, $7, CURRENT_TIMESTAMP + INTERVAL '14 days', $8, CURRENT_TIMESTAMP)`,
          [
            USER_ID,
            employeeId,
            templateId,
            templateVer,
            JSON.stringify({ schema: templateSchema, version: templateVer }),
            shortCode,
            hashToken(rawToken),
            emp.exitDate,
          ]
        );
        console.log(`  -> Created Pending Exit Interview for ${emp.firstName} (code: ${shortCode})`);
      }
    } else if (emp.hasCompletedSurvey && emp.surveyDetails) {
      const exInt = await executeSql<{ id: string }>(
        `SELECT id FROM hr_exit_interviews WHERE owner_user_id = $1 AND employee_id = $2`,
        [USER_ID, employeeId]
      );
      let interviewId: string;
      const shortCode = generateShortCode();
      const rawToken = randomBytes(32).toString('hex');

      if (!exInt.rowCount) {
        const insInt = await executeSql<{ id: string }>(
          `INSERT INTO hr_exit_interviews (
            owner_user_id,
            employee_id,
            template_id,
            template_version,
            template_snapshot,
            status,
            short_code,
            token_hash,
            expires_at,
            completed_at,
            response_due_date,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, 'COMPLETED', $6, $7, CURRENT_TIMESTAMP + INTERVAL '14 days', CURRENT_TIMESTAMP - INTERVAL '2 days', $8, CURRENT_TIMESTAMP - INTERVAL '5 days')
          RETURNING id`,
          [
            USER_ID,
            employeeId,
            templateId,
            templateVer,
            JSON.stringify({ schema: templateSchema, version: templateVer }),
            shortCode,
            hashToken(rawToken),
            emp.exitDate,
          ]
        );
        interviewId = insInt.rows[0].id;
      } else {
        interviewId = exInt.rows[0].id;
        await executeSql(
          `UPDATE hr_exit_interviews SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP - INTERVAL '2 days' WHERE id = $1`,
          [interviewId]
        );
      }

      // Generate realistic answers matching the 9 sections
      const answers: Record<string, any> = {
        emp_name: `${emp.firstName} ${emp.lastName}`,
        emp_id: emp.code,
        designation: emp.designationId === 1 ? 'Software Engineer' : emp.designationId === 2 ? 'Senior Software Engineer' : emp.designationId === 3 ? 'Product Manager' : emp.designationId === 4 ? 'Product Designer' : emp.designationId === 5 ? 'HR Specialist' : 'Operations Lead',
        department: emp.departmentId === 1 ? 'Product' : emp.departmentId === 2 ? 'Engineering' : emp.departmentId === 3 ? 'Design' : emp.departmentId === 4 ? 'People' : 'Operations',
        manager_name: 'Aayush S.',
        work_location: 'Headquarters / Hybrid',
        joining_date: emp.hireDate,
        resignation_date: emp.noticeDate || '2026-09-15',
        last_working_day: emp.exitDate,
        total_tenure: '1 year 8 months',
        employment_type: 'Permanent Full-time',
        reasons_for_leaving: [emp.surveyDetails.primaryReason, 'Career Advancement'],
        primary_reason: emp.surveyDetails.primaryReason,
        reason_elaboration: emp.surveyDetails.keyFeedback,
        specific_incident: 'No specific incident, purely a personal decision for career milestones.',
        joining_another: 'Yes',
        new_industry: 'Technology Services',
        new_offer_better: ['Compensation / Salary', 'Career Opportunities'],
        role_clarity: 5,
        workload_balance: 4,
        tools_resources: 5,
        accomplishments: 'Delivered core product features and mentored junior engineers.',
        manager_support: 5,
        manager_communication: 5,
        team_collaboration: 4,
        manager_comments: 'My manager was exceptionally transparent, encouraging, and supportive.',
        learning_growth: 4,
        culture_values: 5,
        compensation_fairness: emp.surveyDetails.satisfaction,
        benefits_feedback: 'Health insurance and remote flexibility were great perks.',
        overall_satisfaction: emp.surveyDetails.satisfaction,
        recommend_employer: emp.surveyDetails.recommend,
        consider_rejoining: emp.surveyDetails.rejoin,
        suggestions: emp.surveyDetails.keyFeedback,
        handover_completed: ['Handover documentation written', 'Assets and keys returned', 'Access credentials revoked'],
        personal_email: `personal.${emp.firstName.toLowerCase()}@gmail.com`,
        personal_phone: emp.phone,
        declaration_confirm: {
          agreed: true,
          signature: `${emp.firstName} ${emp.lastName}`,
          date: String(emp.exitDate),
        },
      };

      const submissionId = randomUUID();
      await executeSql(
        `INSERT INTO hr_exit_interview_responses (
          interview_id,
          submission_id,
          question_id,
          answer,
          answers_json,
          submission_metadata,
          submitted_at
        ) VALUES ($1, $2, 'all', $3::jsonb, $3::jsonb, $4::jsonb, CURRENT_TIMESTAMP - INTERVAL '2 days')
        ON CONFLICT (submission_id, question_id) DO UPDATE
        SET answer = EXCLUDED.answer,
            answers_json = EXCLUDED.answers_json,
            submission_metadata = EXCLUDED.submission_metadata`,
        [
          interviewId,
          submissionId,
          JSON.stringify(answers),
          JSON.stringify({ userAgent: 'Seed Script (Test Data)', submittedAt: new Date().toISOString() }),
        ]
      );

      for (const [qId, val] of Object.entries(answers)) {
        await executeSql(
          `INSERT INTO hr_exit_interview_responses (
            interview_id,
            submission_id,
            question_id,
            answer,
            submitted_at
          ) VALUES ($1, $2, $3, $4::jsonb, CURRENT_TIMESTAMP - INTERVAL '2 days')
          ON CONFLICT (submission_id, question_id) DO UPDATE
          SET answer = EXCLUDED.answer`,
          [interviewId, submissionId, qId, JSON.stringify(val)]
        );
      }
      console.log(`  -> Completed Exit Interview & Responses submitted for ${emp.firstName} (${emp.code})`);
    }
  }

  // Sync workspace notifications
  console.log('Reconciling workspace notifications...');
  await notificationService.syncWorkspaceNotifications(USER_ID);
  console.log('Workspace notifications synchronized.');

  await closePool();
  console.log('Done! All 20 employees and lifecycle records seeded successfully.');
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});

