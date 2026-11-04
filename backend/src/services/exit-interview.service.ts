import { createHash, randomBytes, timingSafeEqual, randomUUID } from 'node:crypto';
import { executeSql, withTransaction } from '../config/database.js';
import { env } from '../config/env.js';

const hashToken = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex');

export interface ExitInterviewRow {
  id: string;
  employeeId: number;
  status: string;
  expiresAt: string;
  invitationStatus: string;
  completedAt: string | null;
  createdAt: string;
  shortCode: string | null;
  responseDueDate: string | null;
  firstName: string;
  lastName: string | null;
  employeeCode: string;
  departmentName: string | null;
  designationName: string | null;
  templateName: string;
}

export interface ExitInterviewDetailRow extends ExitInterviewRow {
  offboardingId: number | null;
  template: any;
  reopenedAt: string | null;
  workEmail: string | null;
  googleFormResponseId: string | null;
  rawResponsePayload: any;
}

/**
 * Generates a cryptographically random, collision-resistant 7-character short code.
 */
export function generateShortCode(): string {
  const chars = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = randomBytes(8);
  let str = '';
  for (let i = 0; i < 7; i++) {
    str += chars[bytes[i] % chars.length];
  }
  return str;
}

/**
 * Builds the canonical employee-facing short URL.
 */
export function getShortUrl(shortCode: string): string {
  const base = env.APP_BASE_URL || env.PUBLIC_APP_URL || 'http://localhost:5000';
  return `${base.replace(/\/$/, '')}/e/${shortCode}`;
}

/**
 * Builds the prefilled Google Forms URL with real entry IDs discovered on the Infravision form.
 */
export function buildPrefilledGoogleFormsUrl(data: {
  shortCode: string;
  employeeName?: string;
  employeeCode?: string;
  designation?: string;
  department?: string;
  exitDate?: string | Date | null;
  hireDate?: string | Date | null;
}): string {
  const baseUrl = env.GOOGLE_FORMS_URL;
  const url = new URL(baseUrl);
  url.searchParams.set('usp', 'pp_url');

  // Real entry IDs on the Infravision Google Form
  if (data.employeeName) {
    url.searchParams.set('entry.146083293', data.employeeName);
  }
  if (data.employeeCode) {
    url.searchParams.set('entry.1437116560', `${data.employeeCode} [Ref: ${data.shortCode}]`);
  } else {
    url.searchParams.set('entry.1437116560', `[Ref: ${data.shortCode}]`);
  }
  if (data.designation) {
    url.searchParams.set('entry.2056942741', data.designation);
  }
  if (data.department) {
    url.searchParams.set('entry.2060277361', data.department);
  }
  if (data.exitDate) {
    const dStr = typeof data.exitDate === 'string'
      ? data.exitDate.slice(0, 10)
      : new Date(data.exitDate).toISOString().slice(0, 10);
    url.searchParams.set('entry.1963555139', dStr);
  }
  if (data.hireDate) {
    const dStr = typeof data.hireDate === 'string'
      ? data.hireDate.slice(0, 10)
      : new Date(data.hireDate).toISOString().slice(0, 10);
    url.searchParams.set('entry.1034195049', dStr);
  }

  return url.toString();
}

function questionList(schema: any): any[] {
  if (!schema || !Array.isArray(schema.sections)) return [];
  return schema.sections.flatMap((s: any) => Array.isArray(s.questions) ? s.questions : []);
}

export function validateExitInterviewAnswers(schema: any, answers: Record<string, unknown>): string | null {
  const questions = questionList(schema).filter(q => q && q.hrOnly !== true && q.visibility !== 'hr');
  const allowed = new Map(questions.map(q => [String(q.id), q]));
  for (const [id, answer] of Object.entries(answers)) {
    const q = allowed.get(id);
    if (!q) return 'Unknown or unauthorized question.';
    const type = String(q.type || '').toLowerCase();
    if (type === 'rating') {
      if (!Number.isInteger(answer) || (answer as number) < (Number(q.min) || 1) || (answer as number) > (Number(q.max) || 5)) return 'Invalid answer value.';
    } else if (type === 'checkbox' || type === 'multiselect') {
      if (!Array.isArray(answer) || (q.required && answer.length === 0) || answer.some(v => typeof v !== 'string') || (Array.isArray(q.options) && answer.some(v => !q.options.includes(v)))) return 'Invalid answer value.';
    } else if (type === 'select' || type === 'radio') {
      if (typeof answer !== 'string' || (Array.isArray(q.options) && !q.options.includes(answer))) return 'Invalid answer value.';
    } else if (type === 'boolean' || type === 'declaration') {
      if (typeof answer !== 'boolean' || (q.required && answer !== true)) return 'Invalid answer value.';
    } else if (type === 'text' || type === 'textarea') {
      if (typeof answer !== 'string' || answer.length > (Number(q.maxLength) || 10000)) return 'Invalid answer value.';
    } else return 'Unsupported question type.';
  }
  for (const q of questions) if (q.required && !Object.prototype.hasOwnProperty.call(answers, String(q.id))) return 'Required answers are missing.';
  return null;
}

export const exitInterviewService = {
  async listTemplates(owner: string) {
    const r = await executeSql(`SELECT id, name, description, version, is_default AS "isDefault", is_system_template AS "isSystemTemplate"
      FROM hr_exit_interview_templates WHERE is_active = TRUE AND (is_system_template = TRUE OR owner_user_id = $1)
      ORDER BY is_default DESC, name ASC`, [owner]);
    return r.rows;
  },

  async list(owner: string, f: {page:number;limit:number;employeeId?:number;status?:string;departmentId?:number;from?:string;to?:string}) {
    const params: unknown[] = [owner];
    let where = 'i.owner_user_id = $1';
    const clause = (sql: string, value: unknown) => { params.push(value); where += ` AND ${sql.replace('?', `$${params.length}`)}`; };
    if (f.employeeId) clause('i.employee_id = ?', f.employeeId);
    if (f.status === 'EXPIRED') where += " AND i.status IN ('PENDING','OPENED') AND i.expires_at <= CURRENT_TIMESTAMP";
    else if (f.status) clause('i.status = ?', f.status);
    if (f.departmentId) clause('e.department_id = ?', f.departmentId);
    if (f.from) clause('i.created_at >= ?::date', f.from);
    if (f.to) clause("i.created_at < (?::date + INTERVAL '1 day')", f.to);

    const count = await executeSql(`SELECT COUNT(*)::int AS total FROM hr_exit_interviews i JOIN hr_employees e ON e.employee_id=i.employee_id AND e.owner_user_id=i.owner_user_id WHERE ${where}`, params);
    const limit = f.limit, offset = (f.page - 1) * f.limit;

    const rows = await executeSql<ExitInterviewRow>(`SELECT i.id, i.employee_id AS "employeeId",
        CASE WHEN i.status IN ('PENDING','OPENED') AND i.expires_at<=CURRENT_TIMESTAMP THEN 'EXPIRED' ELSE i.status END AS status,
        i.expires_at AS "expiresAt", i.invitation_status AS "invitationStatus", i.completed_at AS "completedAt", i.created_at AS "createdAt",
        i.short_code AS "shortCode", i.response_due_date AS "responseDueDate",
        e.first_name AS "firstName", e.last_name AS "lastName", e.employee_code AS "employeeCode",
        d.department_name AS "departmentName", des.designation_name AS "designationName", t.name AS "templateName"
      FROM hr_exit_interviews i
      JOIN hr_employees e ON e.employee_id=i.employee_id AND e.owner_user_id=i.owner_user_id
      LEFT JOIN hr_departments d ON d.department_id=e.department_id
      LEFT JOIN hr_designations des ON des.designation_id=e.designation_id
      LEFT JOIN hr_exit_interview_templates t ON t.id=i.template_id
      WHERE ${where} ORDER BY i.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,limit,offset]);

    const data = rows.rows.map(r => ({
      ...r,
      shortUrl: r.shortCode ? getShortUrl(r.shortCode) : '',
      publicUrl: r.shortCode ? getShortUrl(r.shortCode) : '',
    }));

    return { data, total: count.rows[0].total, page: f.page, limit };
  },

  async create(owner: string, input: {employeeId:number;offboardingId?:number;templateId:string;expiryDays:number;responseDueDate?:string|null}) {
    const raw = randomBytes(32).toString('hex');
    const tokenHash = hashToken(raw);

    const result = await withTransaction(async client => {
      const emp = await client.query(`SELECT employee_id FROM hr_employees WHERE employee_id=$1 AND owner_user_id=$2 FOR UPDATE`, [input.employeeId,owner]);
      if (!emp.rowCount) throw new Error('EMPLOYEE_NOT_FOUND');
      if (input.offboardingId) {
        const ob = await client.query(`SELECT offboarding_id FROM hr_offboarding WHERE offboarding_id=$1 AND employee_id=$2 AND owner_user_id=$3`, [input.offboardingId,input.employeeId,owner]);
        if (!ob.rowCount) throw new Error('OFFBOARDING_NOT_FOUND');
      }
      const t = await client.query(`SELECT id,name,description,version,schema_json,is_system_template FROM hr_exit_interview_templates WHERE id=$1 AND is_active=TRUE AND (is_system_template=TRUE OR owner_user_id=$2)`, [input.templateId,owner]);
      if (!t.rowCount) throw new Error('TEMPLATE_NOT_FOUND');
      const eventParam = input.offboardingId || null;
      const duplicate = await client.query(`SELECT 1 FROM hr_exit_interviews WHERE owner_user_id=$1 AND employee_id=$2 AND status IN ('PENDING','OPENED') AND expires_at>CURRENT_TIMESTAMP AND offboarding_id IS NOT DISTINCT FROM $3 FOR UPDATE`, [owner,input.employeeId,eventParam]);
      if (duplicate.rowCount) throw new Error('ACTIVE_INTERVIEW_EXISTS');

      let shortCode = generateShortCode();
      for (let attempt = 0; attempt < 5; attempt++) {
        const ex = await client.query('SELECT 1 FROM hr_exit_interviews WHERE short_code = $1', [shortCode]);
        if (!ex.rowCount) break;
        shortCode = generateShortCode();
      }

      const template = t.rows[0];
      const snapshot = { id: template.id, name: template.name, description: template.description, version: template.version, schema: template.schema_json };
      const dueDate = input.responseDueDate ? input.responseDueDate.slice(0, 10) : null;

      const inserted = await client.query(`INSERT INTO hr_exit_interviews(
          owner_user_id,employee_id,offboarding_id,template_id,template_snapshot,template_version,token_hash,short_code,response_due_date,expires_at
        )
        VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,CURRENT_TIMESTAMP + ($10::int * INTERVAL '1 day'))
        RETURNING id,status,expires_at AS "expiresAt",short_code AS "shortCode",response_due_date AS "responseDueDate"`,
        [owner,input.employeeId,eventParam,input.templateId,JSON.stringify(snapshot),template.version,tokenHash,shortCode,dueDate,input.expiryDays]
      );
      return inserted.rows[0];
    });

    const shortUrl = getShortUrl(result.shortCode);
    return { ...result, shortUrl, publicUrl: shortUrl, token: raw };
  },

  async regenerate(owner: string, id: string, actor: string, days = 14) {
    const raw = randomBytes(32).toString('hex');
    return withTransaction(async client => {
      let shortCode = generateShortCode();
      for (let attempt = 0; attempt < 5; attempt++) {
        const ex = await client.query('SELECT 1 FROM hr_exit_interviews WHERE short_code = $1', [shortCode]);
        if (!ex.rowCount) break;
        shortCode = generateShortCode();
      }

      const updated = await client.query(
        `UPDATE hr_exit_interviews
         SET status = 'PENDING',
             token_hash = $3,
             short_code = $4,
             expires_at = CURRENT_TIMESTAMP + ($5::int * INTERVAL '1 day'),
             completed_at = NULL,
             reopened_by = $2,
             reopened_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND owner_user_id = $6
         RETURNING id, status, expires_at AS "expiresAt", short_code AS "shortCode", response_due_date AS "responseDueDate"`,
        [id, actor, hashToken(raw), shortCode, days, owner]
      );
      if (!updated.rowCount) return null;

      await client.query(
        `INSERT INTO hr_audit_logs(user_id, action_type, entity_type, entity_id, details)
         VALUES($1, 'EXIT_INTERVIEW_REGENERATED', 'EXIT_INTERVIEW', $2, $3::jsonb)`,
        [actor, id, JSON.stringify({ expiryDays: days, shortCode })]
      );

      const r = updated.rows[0];
      const shortUrl = getShortUrl(shortCode);
      return { ...r, shortUrl, publicUrl: shortUrl, token: raw };
    });
  },

  async get(owner: string, id: string): Promise<(ExitInterviewDetailRow & { shortUrl: string; publicUrl: string }) | null> {
    const r = await executeSql<ExitInterviewDetailRow>(`SELECT i.id, i.employee_id AS "employeeId", i.offboarding_id AS "offboardingId",
        i.template_snapshot AS "template",
        CASE WHEN i.status IN ('PENDING','OPENED') AND i.expires_at<=CURRENT_TIMESTAMP THEN 'EXPIRED' ELSE i.status END AS status,
        i.expires_at AS "expiresAt", i.invitation_status AS "invitationStatus", i.completed_at AS "completedAt",
        i.created_at AS "createdAt", i.reopened_at AS "reopenedAt",
        i.short_code AS "shortCode", i.response_due_date AS "responseDueDate",
        i.google_form_response_id AS "googleFormResponseId", i.raw_response_payload AS "rawResponsePayload",
        e.first_name AS "firstName", e.last_name AS "lastName", e.employee_code AS "employeeCode", e.work_email AS "workEmail",
        d.department_name AS "departmentName", des.designation_name AS "designationName"
      FROM hr_exit_interviews i
      JOIN hr_employees e ON e.employee_id=i.employee_id AND e.owner_user_id=i.owner_user_id
      LEFT JOIN hr_departments d ON d.department_id=e.department_id
      LEFT JOIN hr_designations des ON des.designation_id=e.designation_id
      WHERE i.id=$1 AND i.owner_user_id=$2`, [id,owner]);

    const row = r.rows[0];
    if (!row) return null;
    const shortUrl = row.shortCode ? getShortUrl(row.shortCode) : '';
    return { ...row, shortUrl, publicUrl: shortUrl };
  },

  async revoke(owner: string, id: string, actor: string) {
    return withTransaction(async client => {
      const r = await client.query(
        `UPDATE hr_exit_interviews
         SET status='REVOKED',
             token_hash=encode(digest(gen_random_uuid()::text,'sha256'),'hex'),
             updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 AND owner_user_id=$2 AND status IN ('PENDING','OPENED')
         RETURNING id`,
        [id,owner]
      );
      if (!r.rowCount) return false;
      await client.query(`INSERT INTO hr_audit_logs(user_id,action_type,entity_type,entity_id,details) VALUES($1,'EXIT_INTERVIEW_REVOKED','EXIT_INTERVIEW',$2,'{}'::jsonb)`,[actor,id]);
      return true;
    });
  },

  async reopen(owner: string, id: string, actor: string, days: number) {
    const raw = randomBytes(32).toString('hex');
    const r = await withTransaction(async client => {
      let shortCode = generateShortCode();
      for (let attempt = 0; attempt < 5; attempt++) {
        const ex = await client.query('SELECT 1 FROM hr_exit_interviews WHERE short_code = $1', [shortCode]);
        if (!ex.rowCount) break;
        shortCode = generateShortCode();
      }

      const updated = await client.query(
        `UPDATE hr_exit_interviews
         SET status='PENDING',
             token_hash=$3,
             short_code=$4,
             expires_at=CURRENT_TIMESTAMP+($5::int*INTERVAL '1 day'),
             completed_at=NULL,
             reopened_by=$2,
             reopened_at=CURRENT_TIMESTAMP,
             updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 AND owner_user_id=$6 AND status='COMPLETED'
         RETURNING id,expires_at AS "expiresAt",short_code AS "shortCode"`,
        [id,actor,hashToken(raw),shortCode,days,owner]
      );
      if (!updated.rowCount) return null;
      await client.query(`INSERT INTO hr_audit_logs(user_id,action_type,entity_type,entity_id,details) VALUES($1,'EXIT_INTERVIEW_REOPENED','EXIT_INTERVIEW',$2,$3::jsonb)`,[actor,id,JSON.stringify({expiryDays:days,shortCode})]);
      return updated.rows[0];
    });

    if (!r) return null;
    const shortUrl = getShortUrl(r.shortCode);
    return { ...r, shortUrl, publicUrl: shortUrl, token: raw };
  },

  /**
   * Resolves a short code: checks active, unexpired, non-revoked state, updates status to OPENED if PENDING,
   * and generates the prefilled Google Forms redirection URL.
   */
  async resolveShortCode(shortCode: string): Promise<
    | { status: 'ACTIVE'; redirectUrl: string; invitationId: string; employee: { name: string; code: string } }
    | { status: 'NOT_FOUND' }
    | { status: 'CANCELLED' }
    | { status: 'EXPIRED'; expiresAt: Date }
    | { status: 'COMPLETED'; completedAt: Date | null }
  > {
    return withTransaction(async client => {
      const q = await client.query(
        `SELECT i.id, i.status, i.expires_at, i.short_code, i.completed_at,
                (i.expires_at > CURRENT_TIMESTAMP) AS is_valid,
                e.first_name, e.last_name, e.employee_code, e.hire_date, e.exit_date,
                d.department_name, des.designation_name
         FROM hr_exit_interviews i
         JOIN hr_employees e ON e.employee_id = i.employee_id AND e.owner_user_id = i.owner_user_id
         LEFT JOIN hr_departments d ON d.department_id = e.department_id
         LEFT JOIN hr_designations des ON des.designation_id = e.designation_id
         WHERE i.short_code = $1
         FOR UPDATE OF i`,
        [shortCode]
      );

      if (!q.rowCount) return { status: 'NOT_FOUND' as const };
      const row = q.rows[0];

      if (row.status === 'REVOKED') {
        return { status: 'CANCELLED' as const };
      }
      if (row.status === 'COMPLETED') {
        return { status: 'COMPLETED' as const, completedAt: row.completed_at };
      }
      if (!row.is_valid) {
        return { status: 'EXPIRED' as const, expiresAt: row.expires_at };
      }

      // Mark as OPENED on first link access
      if (row.status === 'PENDING') {
        await client.query(
          `UPDATE hr_exit_interviews SET status = 'OPENED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [row.id]
        );
      }

      const fullName = `${row.first_name}${row.last_name ? ' ' + row.last_name : ''}`.trim();
      const redirectUrl = buildPrefilledGoogleFormsUrl({
        shortCode: row.short_code,
        employeeName: fullName,
        employeeCode: row.employee_code,
        designation: row.designation_name || undefined,
        department: row.department_name || undefined,
        exitDate: row.exit_date || undefined,
        hireDate: row.hire_date || undefined,
      });

      return {
        status: 'ACTIVE' as const,
        redirectUrl,
        invitationId: row.id,
        employee: { name: fullName, code: row.employee_code },
      };
    });
  },

  /**
   * Processes Google Forms response webhook payload from Apps Script.
   * Enforces idempotency via google_form_response_id, updates status to COMPLETED,
   * stores submitted answers, and logs audit events.
   */
  async handleGoogleFormsWebhook(payload: {
    responseId?: string;
    timestamp?: string;
    invitationReference?: string;
    employeeId?: string;
    employeeName?: string;
    answers: Record<string, unknown>;
  }): Promise<{ success: boolean; code?: string; message: string; interviewId?: string }> {
    let ref = payload.invitationReference?.trim();

    if (!ref && payload.answers) {
      const empIdField = String(
        payload.answers['Employee ID'] ||
        payload.answers['entry.1437116560'] ||
        payload.answers['employee_id'] ||
        payload.answers['Employee id'] ||
        ''
      );
      const match = empIdField.match(/(?:\[Ref:\s*|Ref:\s*|\b)([a-zA-Z0-9_-]{6,12})\b/);
      if (match) ref = match[1];
    }

    return withTransaction(async client => {
      let q;
      if (ref) {
        q = await client.query(
          `SELECT id, owner_user_id, status, expires_at, google_form_response_id
           FROM hr_exit_interviews
           WHERE short_code = $1 OR id::text = $1
           FOR UPDATE`,
          [ref]
        );
      }

      // Fallback matching by employee code if reference was cleared or omitted
      if ((!q || !q.rowCount) && (payload.employeeId || payload.answers['Employee ID'])) {
        const rawCode = String(payload.employeeId || payload.answers['Employee ID']).replace(/\s*\[Ref:.*\]/i, '').trim();
        if (rawCode) {
          q = await client.query(
            `SELECT i.id, i.owner_user_id, i.status, i.expires_at, i.google_form_response_id
             FROM hr_exit_interviews i
             JOIN hr_employees e ON e.employee_id = i.employee_id AND e.owner_user_id = i.owner_user_id
             WHERE e.employee_code = $1 AND i.status IN ('PENDING', 'OPENED')
             ORDER BY i.created_at DESC
             LIMIT 1
             FOR UPDATE OF i`,
            [rawCode]
          );
        }
      }

      if (!q || !q.rowCount) {
        return { success: false, code: 'INVITATION_NOT_FOUND', message: 'No matching exit interview invitation found.' };
      }

      const interview = q.rows[0];

      // Idempotency: response already processed
      if (interview.status === 'COMPLETED') {
        if (payload.responseId && interview.google_form_response_id === payload.responseId) {
          return { success: true, message: 'Response already recorded (idempotent)', interviewId: interview.id };
        }
        return { success: true, message: 'Interview already completed; duplicate submission ignored', interviewId: interview.id };
      }

      if (interview.status === 'REVOKED') {
        return { success: false, code: 'INVITATION_CANCELLED', message: 'This interview invitation was cancelled.' };
      }

      const submissionId = randomUUID();
      const respId = payload.responseId || `gform_${submissionId}`;

      // Update invitation state to COMPLETED
      await client.query(
        `UPDATE hr_exit_interviews
         SET status = 'COMPLETED',
             completed_at = CURRENT_TIMESTAMP,
             google_form_response_id = $2,
             raw_response_payload = $3::jsonb,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [interview.id, respId, JSON.stringify(payload)]
      );

      // Store responses
      if (payload.answers && typeof payload.answers === 'object') {
        for (const [question, answer] of Object.entries(payload.answers)) {
          await client.query(
            `INSERT INTO hr_exit_interview_responses (interview_id, submission_id, question_id, answer, submitted_at)
             VALUES ($1, $2, $3, $4::jsonb, CURRENT_TIMESTAMP)
             ON CONFLICT (submission_id, question_id) DO NOTHING`,
            [interview.id, submissionId, question, JSON.stringify(answer)]
          );
        }
      }

      await client.query(
        `INSERT INTO hr_audit_logs(user_id, action_type, entity_type, entity_id, details)
         VALUES($1, 'EXIT_INTERVIEW_COMPLETED', 'EXIT_INTERVIEW', $2, $3::jsonb)`,
        [interview.owner_user_id, interview.id, JSON.stringify({ googleFormResponseId: respId })]
      );

      return { success: true, interviewId: interview.id, message: 'Exit interview response recorded successfully.' };
    });
  },

  async responses(owner: string, id: string) {
    const r = await executeSql(
      `SELECT r.submission_id AS "submissionId", r.question_id AS "questionId", r.answer, r.submitted_at AS "submittedAt"
       FROM hr_exit_interview_responses r
       JOIN hr_exit_interviews i ON i.id=r.interview_id
       WHERE i.id=$1 AND i.owner_user_id=$2
       ORDER BY r.submitted_at, r.id`,
      [id, owner]
    );
    return r.rows;
  },

  async getEvaluation(owner: string, id: string) {
    const r = await executeSql(
      `SELECT v.interviewer_name AS "interviewerName", v.interview_date AS "interviewDate",
              v.interview_mode AS "interviewMode", v.reason_category AS "reasonCategory",
              v.regrettable_exit AS "regrettableExit", v.rehire_eligibility AS "rehireEligibility",
              v.hr_observations AS "hrObservations", v.action_items AS "actionItems",
              v.hr_signature AS "hrSignature", v.updated_at AS "updatedAt"
       FROM hr_exit_interview_evaluations v
       JOIN hr_exit_interviews i ON i.id=v.interview_id
       WHERE i.id=$1 AND i.owner_user_id=$2`,
      [id, owner]
    );
    return r.rows[0] || null;
  },

  async updateEvaluation(owner: string, id: string, actor: string, v: any) {
    return withTransaction(async client => {
      const exists = await client.query(`SELECT id FROM hr_exit_interviews WHERE id=$1 AND owner_user_id=$2`, [id, owner]);
      if (!exists.rowCount) return false;
      const current = await client.query(`SELECT interviewer_name,interview_date,interview_mode,reason_category,regrettable_exit,rehire_eligibility,hr_observations,action_items,hr_signature FROM hr_exit_interview_evaluations WHERE interview_id=$1 FOR UPDATE`, [id]);
      const old = current.rows[0] || {};
      const value = (camel: string, snake: string) => v[camel] !== undefined ? v[camel] : (old[snake] ?? null);
      await client.query(`INSERT INTO hr_exit_interview_evaluations(interview_id,interviewer_name,interview_date,interview_mode,reason_category,regrettable_exit,rehire_eligibility,hr_observations,action_items,hr_signature,updated_by,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,CURRENT_TIMESTAMP) ON CONFLICT(interview_id) DO UPDATE SET interviewer_name=EXCLUDED.interviewer_name,interview_date=EXCLUDED.interview_date,interview_mode=EXCLUDED.interview_mode,reason_category=EXCLUDED.reason_category,regrettable_exit=EXCLUDED.regrettable_exit,rehire_eligibility=EXCLUDED.rehire_eligibility,hr_observations=EXCLUDED.hr_observations,action_items=EXCLUDED.action_items,hr_signature=EXCLUDED.hr_signature,updated_by=EXCLUDED.updated_by,updated_at=CURRENT_TIMESTAMP`, [id, value('interviewerName', 'interviewer_name'), value('interviewDate', 'interview_date'), value('interviewMode', 'interview_mode'), value('reasonCategory', 'reason_category'), value('regrettableExit', 'regrettable_exit'), value('rehireEligibility', 'rehire_eligibility'), value('hrObservations', 'hr_observations'), JSON.stringify(value('actionItems', 'action_items') ?? []), value('hrSignature', 'hr_signature'), actor]);
      return true;
    });
  },

  // Preserved for backward-compatibility with public form testing
  async publicForm(token: string) {
    const h = hashToken(token);
    const row = await withTransaction(async client => {
      const r = await client.query(`SELECT i.id,i.token_hash,i.status,i.expires_at,(i.expires_at>CURRENT_TIMESTAMP) AS is_valid,i.template_snapshot,e.first_name,e.last_name,e.employee_code,e.hire_date,e.exit_date,c.company_name,c.logo_url
        FROM hr_exit_interviews i JOIN hr_employees e ON e.employee_id=i.employee_id AND e.owner_user_id=i.owner_user_id LEFT JOIN hr_company_profiles c ON c.owner_user_id=i.owner_user_id WHERE i.token_hash=$1 FOR UPDATE OF i`,[h]);
      const found = r.rows[0] as any;
      if (!found || !timingSafeEqual(Buffer.from(h,'hex'),Buffer.from(found.token_hash,'hex')) || found.status === 'REVOKED' || found.status === 'COMPLETED' || !found.is_valid) return null;
      if (found.status === 'PENDING') {
        const opened=await client.query(`UPDATE hr_exit_interviews SET status='OPENED',updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status='PENDING' AND expires_at>CURRENT_TIMESTAMP RETURNING id`,[found.id]);
        if (!opened.rowCount) return null;
      }
      return found;
    });
    if (!row) return null;
    const snap = row.template_snapshot || {};
    const schema = snap.schema || {};
    const sections = Array.isArray(schema.sections) ? schema.sections.map((s: any) => ({
      id: s.id, title: s.title, description: s.description,
      questions: (s.questions || []).filter((q:any)=>q && q.hrOnly !== true && q.visibility !== 'hr').map((q:any) => {
        const publicQuestion: Record<string, unknown> = {};
        for (const key of ['id','type','label','required','options','min','max','placeholder','maxLength']) if (q[key] !== undefined) publicQuestion[key] = q[key];
        return publicQuestion;
      }),
    })) : [];
    return { company: { name: row.company_name || null, logoUrl: row.logo_url || null }, introduction: schema.introduction || '', template: { name: snap.name, version: snap.version, sections }, employee: { firstName: row.first_name, lastName: row.last_name || null, employeeCode: row.employee_code, hireDate: row.hire_date, exitDate: row.exit_date }, expiresAt: row.expires_at, status: row.status === 'PENDING' ? 'OPENED' : row.status };
  },

  async submit(token: string, answers: Record<string, unknown>) {
    const h = hashToken(token), submissionId = randomUUID();
    return withTransaction(async client => {
      const r = await client.query(`SELECT id,token_hash,status,expires_at,(expires_at>CURRENT_TIMESTAMP) AS is_valid,template_snapshot FROM hr_exit_interviews WHERE token_hash=$1 FOR UPDATE`,[h]);
      const row = r.rows[0] as any;
      if (!row || !timingSafeEqual(Buffer.from(h,'hex'),Buffer.from(row.token_hash,'hex')) || row.status==='REVOKED' || row.status==='COMPLETED' || !row.is_valid) return { ok:false as const, reason:'UNAVAILABLE' };
      const msg = validateExitInterviewAnswers(row.template_snapshot?.schema,answers);
      if (msg) return { ok:false as const, reason:msg };
      const status = await client.query(`UPDATE hr_exit_interviews SET status='COMPLETED',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status IN ('PENDING','OPENED') AND expires_at>CURRENT_TIMESTAMP RETURNING id`,[row.id]);
      if (!status.rowCount) return {ok:false as const,reason:'UNAVAILABLE'};
      for (const [questionId,answer] of Object.entries(answers)) await client.query(`INSERT INTO hr_exit_interview_responses(interview_id,submission_id,question_id,answer) VALUES($1,$2,$3,$4::jsonb)`,[row.id,submissionId,questionId,JSON.stringify(answer)]);
      return {ok:true as const};
    });
  },
};
