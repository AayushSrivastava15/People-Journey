import { createHash, randomBytes } from 'node:crypto';
import { executeSql, withTransaction } from '../config/database.js';
import { env } from '../config/env.js';
import { MASTER_EXIT_QUESTIONNAIRE, type ExitQuestionnaireSchema } from '../config/master-exit-questionnaire.js';
import type { ExportResponseItem } from '../utils/exit-interview-export.js';
import { logger } from '../utils/logger.js';

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

export function getShortUrl(shortCode: string): string {
  const frontendBase = (env.FRONTEND_URL || env.CORS_ORIGIN || 'http://localhost:3000').replace(/\/$/, '');
  return `${frontendBase}/e/${shortCode}`;
}

export interface ExitInterviewRow {
  id: string;
  employeeId: number;
  status: string;
  expiresAt: Date | string;
  invitationStatus: string;
  completedAt: Date | string | null;
  createdAt: Date | string;
  shortCode: string | null;
  responseDueDate: string | null;
  firstName: string;
  lastName: string | null;
  employeeCode: string;
  departmentName: string | null;
  designationName: string | null;
  templateName: string;
  templateVersion?: number;
}

export interface ExitInterviewDetailRow extends ExitInterviewRow {
  offboardingId?: number | null;
  template: any;
  reopenedAt?: Date | string | null;
  workEmail?: string | null;
  answersJson?: any;
}

function questionList(schema: any): any[] {
  if (!schema || !Array.isArray(schema.sections)) return [];
  return schema.sections.flatMap((s: any) => (Array.isArray(s.questions) ? s.questions : []));
}

export function validateExitInterviewAnswers(schema: any, answers: Record<string, unknown>): string | null {
  const questions = questionList(schema).filter(q => q && q.hrOnly !== true && q.visibility !== 'hr');
  const allowed = new Map(questions.map(q => [String(q.id), q]));

  for (const [id, answer] of Object.entries(answers)) {
    const q = allowed.get(id);
    if (!q) return 'Unknown or unauthorized question.';

    const type = String(q.type || '').toLowerCase();

    if (type === 'rating') {
      const num = Number(answer);
      if (!Number.isInteger(num) || num < (Number(q.min) || 1) || num > (Number(q.max) || 5)) {
        return `Rating for "${q.label || q.id}" must be between ${q.min || 1} and ${q.max || 5}.`;
      }
    } else if (type === 'rating_matrix') {
      if (typeof answer !== 'object' || answer === null) {
        return `Answer for "${q.label || q.id}" must be a rating matrix.`;
      }
      const rowAnswers = answer as Record<string, unknown>;
      if (Array.isArray(q.matrixRows)) {
        for (const row of q.matrixRows) {
          if (row.required && (rowAnswers[row.id] === undefined || rowAnswers[row.id] === null || rowAnswers[row.id] === '')) {
            return `Please rate: "${row.label}" in section ${q.label || q.id}.`;
          }
          if (rowAnswers[row.id] !== undefined && rowAnswers[row.id] !== null && rowAnswers[row.id] !== '') {
            const val = Number(rowAnswers[row.id]);
            if (!Number.isInteger(val) || val < (Number(q.min) || 1) || val > (Number(q.max) || 5)) {
              return `Rating for "${row.label}" must be between ${q.min || 1} and ${q.max || 5}.`;
            }
          }
        }
      }
    } else if (type === 'checkbox' || type === 'multiselect') {
      if (!Array.isArray(answer)) {
        return `Answer for "${q.label || q.id}" must be a list of choices.`;
      }
      if (q.required && answer.length === 0) {
        return `Please select at least one option for "${q.label || q.id}".`;
      }
      if (Array.isArray(q.options) && answer.some((v: any) => !q.options.includes(v))) {
        return `Invalid option selected for "${q.label || q.id}".`;
      }
    } else if (type === 'select' || type === 'radio' || type === 'dropdown') {
      if (typeof answer !== 'string') {
        return `Answer for "${q.label || q.id}" must be a selection.`;
      }
      if (q.required && answer.trim().length === 0) {
        return `Please select an answer for "${q.label || q.id}".`;
      }
      if (Array.isArray(q.options) && !q.options.includes(answer)) {
        return `Invalid option selected for "${q.label || q.id}".`;
      }
    } else if (type === 'boolean' || type === 'yes_no') {
      if (q.required && answer !== true && answer !== 'Yes' && answer !== 'true') {
        return `Confirmation is required for "${q.label}".`;
      }
    } else if (type === 'email') {
      if (typeof answer !== 'string' || (q.required && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answer))) {
        return `Please enter a valid email address for "${q.label}".`;
      }
    } else if (type === 'text' || type === 'textarea' || type === 'phone' || type === 'date') {
      if (typeof answer !== 'string') {
        return `Invalid answer type for "${q.label}".`;
      }
      if (q.required && answer.trim().length === 0) {
        return `Please answer "${q.label}".`;
      }
    }
  }

  for (const q of questions) {
    if (q.required && !Object.prototype.hasOwnProperty.call(answers, String(q.id))) {
      return `Required question "${q.label}" has not been answered.`;
    }
  }

  return null;
}

export const exitInterviewService = {
  // -------------------------------------------------------------------------
  // MULTI-COMPANY TEMPLATE ARCHITECTURE & VERSIONING
  // -------------------------------------------------------------------------

  /**
   * Retrieves or initializes the company's independent exit interview template and version history.
   */
  async getOrCreateCompanyTemplate(ownerUserId: string): Promise<{
    id: string;
    name: string;
    description: string | null;
    version: number;
    schema: ExitQuestionnaireSchema;
    isDefault: boolean;
    updatedAt: string;
    versions: Array<{
      id: string;
      versionNumber: number;
      changeSummary: string | null;
      publishedAt: string;
    }>;
  }> {
    // 1. Check for company-owned template
    let tmplRes = await executeSql<any>(
      `SELECT id, name, description, version, schema_json, is_default, updated_at
       FROM hr_exit_interview_templates
       WHERE owner_user_id = $1 AND is_active = TRUE
       ORDER BY is_default DESC, created_at ASC
       LIMIT 1`,
      [ownerUserId]
    );

    let templateId: string;
    let templateName: string;
    let description: string | null;
    let version: number;
    let schema: ExitQuestionnaireSchema;
    let isDefault: boolean;
    let updatedAt: string;

    if (tmplRes.rows.length === 0) {
      // Get company name for personalizing template title
      const profRes = await executeSql<{ company_name: string }>(
        `SELECT company_name FROM hr_company_profiles WHERE owner_user_id = $1 LIMIT 1`,
        [ownerUserId]
      );
      const companyName = profRes.rows[0]?.company_name || 'Company';

      templateName = `${companyName} Exit Feedback Questionnaire`;
      description = `Official Exit Interview questionnaire for ${companyName}.`;
      version = 1;
      schema = MASTER_EXIT_QUESTIONNAIRE;
      isDefault = true;

      const insRes = await executeSql<{ id: string; updated_at: Date }>(
        `INSERT INTO hr_exit_interview_templates (
          owner_user_id,
          name,
          description,
          version,
          schema_json,
          is_active,
          is_default,
          is_system_template
        ) VALUES ($1, $2, $3, 1, $4, TRUE, TRUE, FALSE)
        RETURNING id, updated_at`,
        [ownerUserId, templateName, description, JSON.stringify(schema)]
      );

      templateId = insRes.rows[0].id;
      updatedAt = new Date(insRes.rows[0].updated_at).toISOString();

      // Create Version 1 snapshot
      await executeSql(
        `INSERT INTO hr_exit_interview_template_versions (
          template_id,
          version_number,
          schema_json,
          change_summary,
          published_by
        ) VALUES ($1, 1, $2, $3, $4)
        ON CONFLICT (template_id, version_number) DO NOTHING`,
        [templateId, JSON.stringify(schema), 'Initial master questionnaire setup.', ownerUserId]
      );
    } else {
      const row = tmplRes.rows[0];
      templateId = row.id;
      templateName = row.name;
      description = row.description;
      version = row.version;
      schema = row.schema_json;
      isDefault = row.is_default;
      updatedAt = new Date(row.updated_at).toISOString();
    }

    // 2. Fetch published version history
    const versionsRes = await executeSql<{
      id: string;
      version_number: number;
      change_summary: string | null;
      published_at: Date;
    }>(
      `SELECT id, version_number, change_summary, published_at
       FROM hr_exit_interview_template_versions
       WHERE template_id = $1
       ORDER BY version_number DESC`,
      [templateId]
    );

    return {
      id: templateId,
      name: templateName,
      description,
      version,
      schema,
      isDefault,
      updatedAt,
      versions: versionsRes.rows.map(v => ({
        id: v.id,
        versionNumber: v.version_number,
        changeSummary: v.change_summary,
        publishedAt: new Date(v.published_at).toISOString(),
      })),
    };
  },

  /**
   * Updates working draft of the company template without publishing a new version.
   */
  async updateTemplateDraft(
    ownerUserId: string,
    data: { name?: string; description?: string | null; schema: ExitQuestionnaireSchema }
  ) {
    const current = await this.getOrCreateCompanyTemplate(ownerUserId);

    const updated = await executeSql(
      `UPDATE hr_exit_interview_templates
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           schema_json = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND owner_user_id = $5
       RETURNING id, name, description, version, schema_json AS schema, updated_at`,
      [
        data.name ? data.name.trim() : null,
        data.description !== undefined ? data.description : null,
        JSON.stringify(data.schema),
        current.id,
        ownerUserId,
      ]
    );

    return updated.rows[0];
  },

  /**
   * Publishes the current draft as a new immutable version.
   */
  async publishTemplate(ownerUserId: string, changeSummary?: string | null) {
    return withTransaction(async client => {
      const tmplRes = await client.query(
        `SELECT id, version, schema_json FROM hr_exit_interview_templates
         WHERE owner_user_id = $1 AND is_active = TRUE
         LIMIT 1
         FOR UPDATE`,
        [ownerUserId]
      );

      if (tmplRes.rows.length === 0) {
        throw new Error('TEMPLATE_NOT_FOUND');
      }

      const tmpl = tmplRes.rows[0];
      const newVersion = Number(tmpl.version) + 1;

      // 1. Increment version on template
      await client.query(
        `UPDATE hr_exit_interview_templates
         SET version = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [newVersion, tmpl.id]
      );

      // 2. Insert new version snapshot
      const verRes = await client.query(
        `INSERT INTO hr_exit_interview_template_versions (
          template_id,
          version_number,
          schema_json,
          change_summary,
          published_by
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id, version_number, change_summary, published_at`,
        [
          tmpl.id,
          newVersion,
          JSON.stringify(tmpl.schema_json),
          changeSummary ? changeSummary.trim() : `Published version ${newVersion}.`,
          ownerUserId,
        ]
      );

      logger.info({ ownerUserId, templateId: tmpl.id, newVersion }, 'Published new exit interview template version');

      return {
        templateId: tmpl.id,
        version: newVersion,
        versionId: verRes.rows[0].id,
        changeSummary: verRes.rows[0].change_summary,
        publishedAt: verRes.rows[0].published_at,
      };
    });
  },

  /**
   * Resets the company questionnaire draft back to the canonical master template.
   */
  async resetTemplateToDefault(ownerUserId: string) {
    const current = await this.getOrCreateCompanyTemplate(ownerUserId);

    await executeSql(
      `UPDATE hr_exit_interview_templates
       SET schema_json = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND owner_user_id = $3`,
      [JSON.stringify(MASTER_EXIT_QUESTIONNAIRE), current.id, ownerUserId]
    );

    return this.getOrCreateCompanyTemplate(ownerUserId);
  },

  /**
   * Lists all available templates for selection (system master + company templates).
   */
  async listTemplates(ownerUserId: string) {
    await this.getOrCreateCompanyTemplate(ownerUserId);

    const r = await executeSql(
      `SELECT id, name, description, version, is_default AS "isDefault", is_system_template AS "isSystemTemplate"
       FROM hr_exit_interview_templates
       WHERE is_active = TRUE AND (is_system_template = TRUE OR owner_user_id = $1)
       ORDER BY is_system_template ASC, is_default DESC, name ASC`,
      [ownerUserId]
    );
    return r.rows;
  },

  // -------------------------------------------------------------------------
  // INVITATION WORKFLOW & SECURE SHORT LINKS
  // -------------------------------------------------------------------------

  async create(
    owner: string,
    input: {
      employeeId: number;
      offboardingId?: number;
      templateId?: string;
      expiryDays: number;
      responseDueDate?: string | null;
    }
  ) {
    const raw = randomBytes(32).toString('hex');
    const tokenHash = hashToken(raw);

    const result = await withTransaction(async client => {
      // 1. Verify employee belongs to owner
      const emp = await client.query(
        'SELECT employee_id, employment_status FROM hr_employees WHERE employee_id = $1 AND owner_user_id = $2',
        [input.employeeId, owner]
      );
      if (!emp.rowCount) throw new Error('EMPLOYEE_NOT_FOUND');

      let eventParam = input.offboardingId ?? null;
      if (!eventParam) {
        const off = await client.query(
          'SELECT offboarding_id FROM hr_offboarding WHERE employee_id = $1 AND owner_user_id = $2 ORDER BY created_at DESC LIMIT 1',
          [input.employeeId, owner]
        );
        eventParam = off.rows[0]?.offboarding_id ?? null;
      }

      // Check duplicate active invitation
      const dup = await client.query(
        `SELECT id FROM hr_exit_interviews
         WHERE employee_id = $1 AND owner_user_id = $2 AND status IN ('PENDING', 'OPENED') AND expires_at > CURRENT_TIMESTAMP`,
        [input.employeeId, owner]
      );
      if (dup.rowCount) throw new Error('ACTIVE_INTERVIEW_EXISTS');

      // Resolve template
      let templateId = input.templateId;
      if (!templateId) {
        const companyTmpl = await client.query(
          `SELECT id FROM hr_exit_interview_templates WHERE owner_user_id = $1 AND is_active = TRUE LIMIT 1`,
          [owner]
        );
        templateId = companyTmpl.rows[0]?.id;
      }

      const t = await client.query(
        'SELECT id, name, description, version, schema_json FROM hr_exit_interview_templates WHERE id = $1 AND is_active = TRUE',
        [templateId]
      );
      if (!t.rowCount) throw new Error('TEMPLATE_NOT_FOUND');

      const template = t.rows[0];

      // Get or create latest version id
      let verRes = await client.query(
        `SELECT id FROM hr_exit_interview_template_versions WHERE template_id = $1 AND version_number = $2 LIMIT 1`,
        [template.id, template.version]
      );
      let templateVersionId = verRes.rows[0]?.id;
      if (!templateVersionId) {
        const insVer = await client.query(
          `INSERT INTO hr_exit_interview_template_versions (template_id, version_number, schema_json, published_at)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
           ON CONFLICT (template_id, version_number) DO UPDATE SET schema_json = EXCLUDED.schema_json
           RETURNING id`,
          [template.id, template.version, JSON.stringify(template.schema_json)]
        );
        templateVersionId = insVer.rows[0]?.id;
      }

      let shortCode = generateShortCode();
      for (let attempt = 0; attempt < 5; attempt++) {
        const ex = await client.query('SELECT 1 FROM hr_exit_interviews WHERE short_code = $1', [shortCode]);
        if (!ex.rowCount) break;
        shortCode = generateShortCode();
      }

      const snapshot = {
        id: template.id,
        name: template.name,
        description: template.description,
        version: template.version,
        schema: template.schema_json,
      };
      const dueDate = input.responseDueDate ? input.responseDueDate.slice(0, 10) : null;

      const inserted = await client.query(
        `INSERT INTO hr_exit_interviews (
          owner_user_id,
          employee_id,
          offboarding_id,
          template_id,
          template_version_id,
          template_snapshot,
          template_version,
          token_hash,
          short_code,
          response_due_date,
          expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, CURRENT_TIMESTAMP + ($11::int * INTERVAL '1 day'))
        RETURNING id, status, expires_at AS "expiresAt", short_code AS "shortCode", response_due_date AS "responseDueDate"`,
        [
          owner,
          input.employeeId,
          eventParam,
          template.id,
          templateVersionId,
          JSON.stringify(snapshot),
          template.version,
          tokenHash,
          shortCode,
          dueDate,
          input.expiryDays,
        ]
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

  async revoke(owner: string, id: string, actor: string) {
    return withTransaction(async client => {
      const r = await client.query(
        `UPDATE hr_exit_interviews
         SET status='REVOKED',
             token_hash=encode(digest(gen_random_uuid()::text,'sha256'),'hex'),
             updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 AND owner_user_id=$2 AND status IN ('PENDING','OPENED')
         RETURNING id`,
        [id, owner]
      );
      if (!r.rowCount) return false;
      await client.query(
        `INSERT INTO hr_audit_logs(user_id,action_type,entity_type,entity_id,details)
         VALUES($1,'EXIT_INTERVIEW_REVOKED','EXIT_INTERVIEW',$2,'{}'::jsonb)`,
        [actor, id]
      );
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
         RETURNING id, expires_at AS "expiresAt", short_code AS "shortCode"`,
        [id, actor, hashToken(raw), shortCode, days, owner]
      );
      if (!updated.rowCount) return null;
      await client.query(
        `INSERT INTO hr_audit_logs(user_id,action_type,entity_type,entity_id,details)
         VALUES($1,'EXIT_INTERVIEW_REOPENED','EXIT_INTERVIEW',$2,$3::jsonb)`,
        [actor, id, JSON.stringify({ expiryDays: days, shortCode })]
      );
      return updated.rows[0];
    });

    if (!r) return null;
    const shortUrl = getShortUrl(r.shortCode);
    return { ...r, shortUrl, publicUrl: shortUrl, token: raw };
  },

  async get(owner: string, id: string): Promise<(ExitInterviewDetailRow & { shortUrl: string; publicUrl: string }) | null> {
    const r = await executeSql<ExitInterviewDetailRow>(
      `SELECT i.id, i.employee_id AS "employeeId", i.offboarding_id AS "offboardingId",
        i.template_snapshot AS "template",
        CASE WHEN i.status IN ('PENDING','OPENED') AND i.expires_at<=CURRENT_TIMESTAMP THEN 'EXPIRED' ELSE i.status END AS status,
        i.expires_at AS "expiresAt", i.invitation_status AS "invitationStatus", i.completed_at AS "completedAt",
        i.created_at AS "createdAt", i.reopened_at AS "reopenedAt",
        i.short_code AS "shortCode", i.response_due_date AS "responseDueDate",
        e.first_name AS "firstName", e.last_name AS "lastName", e.employee_code AS "employeeCode", e.work_email AS "workEmail",
        d.department_name AS "departmentName", des.designation_name AS "designationName"
      FROM hr_exit_interviews i
      JOIN hr_employees e ON e.employee_id=i.employee_id AND e.owner_user_id=i.owner_user_id
      LEFT JOIN hr_departments d ON d.department_id=e.department_id
      LEFT JOIN hr_designations des ON des.designation_id=e.designation_id
      WHERE i.id=$1 AND i.owner_user_id=$2`,
      [id, owner]
    );

    const row = r.rows[0];
    if (!row) return null;
    const shortUrl = row.shortCode ? getShortUrl(row.shortCode) : '';
    return { ...row, shortUrl, publicUrl: shortUrl };
  },

  async list(
    owner: string,
    f: {
      page: number;
      limit: number;
      employeeId?: number;
      status?: string;
      departmentId?: number;
      search?: string;
      from?: string;
      to?: string;
    }
  ) {
    const params: unknown[] = [owner];
    let where = 'i.owner_user_id = $1';
    const clause = (sql: string, value: unknown) => {
      params.push(value);
      where += ` AND ${sql.replace('?', `$${params.length}`)}`;
    };

    if (f.employeeId) clause('i.employee_id = ?', f.employeeId);
    if (f.status === 'EXPIRED') where += " AND i.status IN ('PENDING','OPENED') AND i.expires_at <= CURRENT_TIMESTAMP";
    else if (f.status) clause('i.status = ?', f.status);
    if (f.departmentId) clause('e.department_id = ?', f.departmentId);
    if (f.search) {
      params.push(`%${f.search}%`);
      where += ` AND (e.first_name ILIKE $${params.length} OR e.last_name ILIKE $${params.length} OR e.employee_code ILIKE $${params.length})`;
    }
    if (f.from) clause('i.created_at >= ?::date', f.from);
    if (f.to) clause("i.created_at < (?::date + INTERVAL '1 day')", f.to);

    const count = await executeSql<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM hr_exit_interviews i JOIN hr_employees e ON e.employee_id=i.employee_id AND e.owner_user_id=i.owner_user_id WHERE ${where}`,
      params
    );
    const limit = f.limit,
      offset = (f.page - 1) * f.limit;

    params.push(limit, offset);
    const rows = await executeSql<ExitInterviewRow>(
      `SELECT i.id, i.employee_id AS "employeeId",
        CASE WHEN i.status IN ('PENDING','OPENED') AND i.expires_at<=CURRENT_TIMESTAMP THEN 'EXPIRED' ELSE i.status END AS status,
        i.expires_at AS "expiresAt", i.invitation_status AS "invitationStatus", i.completed_at AS "completedAt", i.created_at AS "createdAt",
        i.short_code AS "shortCode", i.response_due_date AS "responseDueDate",
        e.first_name AS "firstName", e.last_name AS "lastName", e.employee_code AS "employeeCode",
        d.department_name AS "departmentName", des.designation_name AS "designationName", t.name AS "templateName",
        i.template_version AS "templateVersion"
      FROM hr_exit_interviews i
      JOIN hr_employees e ON e.employee_id=i.employee_id AND e.owner_user_id=i.owner_user_id
      LEFT JOIN hr_departments d ON d.department_id=e.department_id
      LEFT JOIN hr_designations des ON des.designation_id=e.designation_id
      LEFT JOIN hr_exit_interview_templates t ON t.id=i.template_id
      WHERE ${where}
      ORDER BY i.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return {
      total: count.rows[0]?.total ?? 0,
      page: f.page,
      limit: f.limit,
      data: rows.rows.map(r => ({
        ...r,
        shortUrl: r.shortCode ? getShortUrl(r.shortCode) : '',
        publicUrl: r.shortCode ? getShortUrl(r.shortCode) : '',
      })),
    };
  },

  // -------------------------------------------------------------------------
  // HOSTED FORM RESOLUTION & SUBMISSION
  // -------------------------------------------------------------------------

  /**
   * Resolves a public short code for native People Journey dynamic form rendering.
   * Loads company branding, employee details, and questionnaire schema snapshot.
   */
  async resolveShortCode(shortCode: string): Promise<
    | {
        status: 'ACTIVE';
        invitationId: string;
        shortCode: string;
        expiresAt: string;
        responseDueDate: string | null;
        company: {
          companyName: string;
          displayName: string | null;
          logoUrl: string | null;
          brandPrimaryColor: string;
          hrContactName: string | null;
          hrContactEmail: string | null;
          departmentTeam: string | null;
          companyWebsite: string | null;
        };
        employee: {
          name: string;
          employeeCode: string;
          designation: string;
          department: string;
          hireDate: string | null;
          exitDate: string | null;
          workEmail: string | null;
        };
        template: {
          id: string;
          name: string;
          version: number;
          schema: ExitQuestionnaireSchema;
        };
      }
    | { status: 'NOT_FOUND' }
    | { status: 'CANCELLED' }
    | { status: 'EXPIRED'; expiresAt: Date }
    | { status: 'COMPLETED'; completedAt: Date | null }
  > {
    return withTransaction(async client => {
      const q = await client.query(
        `SELECT i.id, i.owner_user_id, i.status, i.expires_at, i.short_code, i.response_due_date, i.completed_at,
                i.template_snapshot, i.template_version,
                (i.expires_at > CURRENT_TIMESTAMP) AS is_valid,
                e.first_name, e.last_name, e.employee_code, e.hire_date, e.exit_date, e.work_email,
                d.department_name, des.designation_name,
                p.company_name, p.display_name, p.logo_url, p.brand_primary_color,
                p.hr_contact_name, p.hr_contact_email, p.department_team, p.company_website
         FROM hr_exit_interviews i
         JOIN hr_employees e ON e.employee_id = i.employee_id AND e.owner_user_id = i.owner_user_id
         LEFT JOIN hr_departments d ON d.department_id = e.department_id
         LEFT JOIN hr_designations des ON des.designation_id = e.designation_id
         LEFT JOIN hr_company_profiles p ON p.owner_user_id = i.owner_user_id
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

      // Mark as OPENED on link access
      if (row.status === 'PENDING') {
        await client.query(
          `UPDATE hr_exit_interviews SET status = 'OPENED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [row.id]
        );
      }

      const fullName = `${row.first_name}${row.last_name ? ' ' + row.last_name : ''}`.trim();
      const templateSnapshot = row.template_snapshot || {};
      const questionnaireSchema = templateSnapshot.schema || templateSnapshot.schema_json || MASTER_EXIT_QUESTIONNAIRE;

      return {
        status: 'ACTIVE' as const,
        invitationId: row.id,
        shortCode: row.short_code,
        expiresAt: new Date(row.expires_at).toISOString(),
        responseDueDate: row.response_due_date ? String(row.response_due_date).slice(0, 10) : null,
        company: {
          companyName: row.company_name || 'Our Company',
          displayName: row.display_name || row.company_name || 'Our Company',
          logoUrl: row.logo_url || null,
          brandPrimaryColor: row.brand_primary_color || '#59424f',
          hrContactName: row.hr_contact_name || 'HR Team',
          hrContactEmail: row.hr_contact_email || null,
          departmentTeam: row.department_team || 'Human Resources',
          companyWebsite: row.company_website || null,
        },
        employee: {
          name: fullName,
          employeeCode: row.employee_code,
          designation: row.designation_name || 'Team Member',
          department: row.department_name || 'General',
          hireDate: row.hire_date ? new Date(row.hire_date).toISOString().slice(0, 10) : null,
          exitDate: row.exit_date ? new Date(row.exit_date).toISOString().slice(0, 10) : null,
          workEmail: row.work_email || null,
        },
        template: {
          id: templateSnapshot.id || row.id,
          name: templateSnapshot.name || 'Exit Feedback Questionnaire',
          version: Number(row.template_version || 1),
          schema: questionnaireSchema,
        },
      };
    });
  },

  /**
   * Submits answers from native hosted People Journey employee form.
   * Enforces schema validation, updates status to COMPLETED, stores answers in PostgreSQL.
   */
  async submitPublicFeedback(
    shortCode: string,
    answers: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): Promise<{ ok: boolean; reason?: string }> {
    return withTransaction(async client => {
      const q = await client.query(
        `SELECT id, owner_user_id, status, expires_at, template_snapshot, (expires_at > CURRENT_TIMESTAMP) AS is_valid
         FROM hr_exit_interviews
         WHERE short_code = $1
         FOR UPDATE`,
        [shortCode]
      );

      if (!q.rowCount) return { ok: false, reason: 'NOT_FOUND' };
      const row = q.rows[0];

      if (row.status === 'COMPLETED') return { ok: false, reason: 'ALREADY_SUBMITTED' };
      if (row.status === 'REVOKED') return { ok: false, reason: 'CANCELLED' };
      if (!row.is_valid) return { ok: false, reason: 'EXPIRED' };

      const snapshot = row.template_snapshot || {};
      const schema = snapshot.schema || snapshot.schema_json || MASTER_EXIT_QUESTIONNAIRE;

      const validationError = validateExitInterviewAnswers(schema, answers);
      if (validationError) {
        return { ok: false, reason: validationError };
      }

      // Mark invitation as COMPLETED
      await client.query(
        `UPDATE hr_exit_interviews
         SET status = 'COMPLETED',
             completed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [row.id]
      );

      // Save complete answers_json and granular rows
      const submissionId = randomBytes(16).toString('hex');

      await client.query(
        `INSERT INTO hr_exit_interview_responses (
          interview_id,
          submission_id,
          question_id,
          answer,
          answers_json,
          submission_metadata,
          submitted_at
        ) VALUES ($1, $2, 'all', $3::jsonb, $3::jsonb, $4::jsonb, CURRENT_TIMESTAMP)`,
        [
          row.id,
          '00000000-0000-0000-0000-000000000000',
          JSON.stringify(answers),
          JSON.stringify(metadata || {}),
        ]
      );

      for (const [qId, val] of Object.entries(answers)) {
        await client.query(
          `INSERT INTO hr_exit_interview_responses (
            interview_id,
            submission_id,
            question_id,
            answer,
            submitted_at
          ) VALUES ($1, $2, $3, $4::jsonb, CURRENT_TIMESTAMP)
          ON CONFLICT (submission_id, question_id) DO NOTHING`,
          [
            row.id,
            '00000000-0000-0000-0000-000000000001',
            qId,
            JSON.stringify(val),
          ]
        );
      }

      await client.query(
        `INSERT INTO hr_audit_logs(user_id, action_type, entity_type, entity_id, details)
         VALUES($1, 'EXIT_INTERVIEW_SUBMITTED', 'EXIT_INTERVIEW', $2, $3::jsonb)`,
        [row.owner_user_id, row.id, JSON.stringify({ shortCode, submissionId })]
      );

      logger.info({ interviewId: row.id, shortCode }, 'Exit interview feedback successfully submitted and saved.');
      return { ok: true };
    });
  },

  // -------------------------------------------------------------------------
  // RESPONSE DETAILS & EXPORT REPORTING
  // -------------------------------------------------------------------------

  /**
   * Retrieves full structured response for HR review, with question hierarchy.
   */
  async getResponseDetail(ownerUserId: string, interviewId: string) {
    const q = await executeSql<any>(
      `SELECT i.id, i.employee_id, i.completed_at, i.created_at, i.short_code, i.response_due_date,
              i.template_version, i.template_snapshot,
              e.first_name, e.last_name, e.employee_code, e.hire_date, e.exit_date, e.work_email,
              d.department_name, des.designation_name,
              p.company_name, p.display_name, p.logo_url, p.brand_primary_color,
              r.answers_json
       FROM hr_exit_interviews i
       JOIN hr_employees e ON e.employee_id = i.employee_id AND e.owner_user_id = i.owner_user_id
       LEFT JOIN hr_departments d ON d.department_id = e.department_id
       LEFT JOIN hr_designations des ON des.designation_id = e.designation_id
       LEFT JOIN hr_company_profiles p ON p.owner_user_id = i.owner_user_id
       LEFT JOIN hr_exit_interview_responses r ON r.interview_id = i.id AND r.question_id = 'all'
       WHERE i.id = $1 AND i.owner_user_id = $2`,
      [interviewId, ownerUserId]
    );

    if (!q.rows.length) return null;
    const row = q.rows[0];

    const snapshot = row.template_snapshot || {};
    const schema: ExitQuestionnaireSchema = snapshot.schema || snapshot.schema_json || MASTER_EXIT_QUESTIONNAIRE;
    const answers: Record<string, any> = row.answers_json || {};

    // Organize response by sections and questions
    const organizedSections = schema.sections.map(sec => ({
      id: sec.id,
      title: sec.title,
      description: sec.description,
      questions: sec.questions.map(quest => {
        const rawAnswer = answers[quest.id];
        let displayAnswer = '—';
        if (rawAnswer !== undefined && rawAnswer !== null) {
          if (quest.type === 'rating_matrix' && typeof rawAnswer === 'object') {
            displayAnswer = JSON.stringify(rawAnswer);
          } else if (Array.isArray(rawAnswer)) {
            displayAnswer = rawAnswer.join(', ');
          } else {
            displayAnswer = String(rawAnswer);
          }
        }
        return {
          id: quest.id,
          label: quest.label,
          type: quest.type,
          matrixRows: quest.matrixRows,
          rawAnswer,
          displayAnswer,
        };
      }),
    }));

    return {
      interviewId: row.id,
      employee: {
        id: row.employee_id,
        name: `${row.first_name}${row.last_name ? ' ' + row.last_name : ''}`.trim(),
        code: row.employee_code,
        designation: row.designation_name || 'Team Member',
        department: row.department_name || 'General',
        hireDate: row.hire_date ? String(row.hire_date).slice(0, 10) : '—',
        exitDate: row.exit_date ? String(row.exit_date).slice(0, 10) : '—',
        workEmail: row.work_email,
      },
      company: {
        name: row.display_name || row.company_name || 'Company',
        logoUrl: row.logo_url,
        brandPrimaryColor: row.brand_primary_color || '#59424f',
      },
      template: {
        name: snapshot.name || 'Exit Feedback Questionnaire',
        version: Number(row.template_version || 1),
      },
      submissionDate: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      sections: organizedSections,
      rawAnswers: answers,
    };
  },

  /**
   * Generates normalized data for multi-sheet Excel / CSV exports.
   */
  async getExportData(ownerUserId: string, filters?: { departmentId?: number; from?: string; to?: string }): Promise<{
    companyName: string;
    items: ExportResponseItem[];
  }> {
    const profRes = await executeSql<{ company_name: string }>(
      `SELECT company_name FROM hr_company_profiles WHERE owner_user_id = $1 LIMIT 1`,
      [ownerUserId]
    );
    const companyName = profRes.rows[0]?.company_name || 'Company';

    const params: unknown[] = [ownerUserId];
    let where = "i.owner_user_id = $1 AND i.status = 'COMPLETED'";
    if (filters?.departmentId) {
      params.push(filters.departmentId);
      where += ` AND e.department_id = $${params.length}`;
    }
    if (filters?.from) {
      params.push(filters.from);
      where += ` AND i.completed_at >= $${params.length}::date`;
    }
    if (filters?.to) {
      params.push(filters.to);
      where += ` AND i.completed_at < ($${params.length}::date + INTERVAL '1 day')`;
    }

    const q = await executeSql<any>(
      `SELECT i.id, i.completed_at, i.status, i.template_snapshot,
              e.first_name, e.last_name, e.employee_code, e.hire_date, e.exit_date,
              d.department_name, des.designation_name,
              r.answers_json
       FROM hr_exit_interviews i
       JOIN hr_employees e ON e.employee_id = i.employee_id AND e.owner_user_id = i.owner_user_id
       LEFT JOIN hr_departments d ON d.department_id = e.department_id
       LEFT JOIN hr_designations des ON des.designation_id = e.designation_id
       LEFT JOIN hr_exit_interview_responses r ON r.interview_id = i.id AND r.question_id = 'all'
       WHERE ${where}
       ORDER BY i.completed_at DESC`,
      params
    );

    const items: ExportResponseItem[] = q.rows.map(row => {
      const answers = row.answers_json || {};
      const snapshot = row.template_snapshot || {};
      const schema: ExitQuestionnaireSchema = snapshot.schema || snapshot.schema_json || MASTER_EXIT_QUESTIONNAIRE;

      const employeeName = `${row.first_name}${row.last_name ? ' ' + row.last_name : ''}`.trim();
      const hireDateStr = row.hire_date ? String(row.hire_date).slice(0, 10) : '—';
      const exitDateStr = row.exit_date ? String(row.exit_date).slice(0, 10) : '—';
      const submissionDateStr = row.completed_at ? String(row.completed_at).slice(0, 10) : '—';

      const secItems = schema.sections.map(sec => ({
        sectionTitle: sec.title,
        questions: sec.questions.map(quest => {
          const val = answers[quest.id];
          let answerText = '—';
          if (val !== undefined && val !== null) {
            if (quest.type === 'rating_matrix' && typeof val === 'object') {
              const rows = quest.matrixRows || [];
              answerText = rows
                .map(r => `${r.label}: ${val[r.id] ?? '—'}`)
                .join('; ');
            } else if (Array.isArray(val)) {
              answerText = val.join(', ');
            } else {
              answerText = String(val);
            }
          }
          return {
            questionLabel: quest.label,
            answerText,
          };
        }),
      }));

      return {
        interviewId: row.id,
        employeeCode: row.employee_code,
        employeeName,
        department: row.department_name || 'General',
        designation: row.designation_name || 'Team Member',
        hireDate: hireDateStr,
        exitDate: exitDateStr,
        submissionDate: submissionDateStr,
        status: row.status,
        overallSatisfaction: answers.overall_satisfaction || '—',
        primaryReason: answers.primary_reason || '—',
        reasonsForLeaving: Array.isArray(answers.reasons_for_leaving) ? answers.reasons_for_leaving.join(', ') : '—',
        recommendEmployer: answers.recommend_employer || '—',
        rejoiningConsideration: answers.consider_rejoining || '—',
        sections: secItems,
      };
    });

    return { companyName, items };
  },

  // Legacy public token endpoints preserved for backward compatibility
  async publicForm(rawToken: string) {
    const r = await executeSql(
      `SELECT i.id, i.template_snapshot AS template, (i.expires_at > CURRENT_TIMESTAMP) AS is_valid,
        e.first_name AS "firstName", e.last_name AS "lastName", e.employee_code AS "employeeCode",
        d.department_name AS "departmentName", des.designation_name AS "designationName",
        p.company_name AS "companyName", p.brand_primary_color AS "brandPrimaryColor", p.logo_url AS "logoUrl"
      FROM hr_exit_interviews i
      JOIN hr_employees e ON e.employee_id=i.employee_id AND e.owner_user_id=i.owner_user_id
      LEFT JOIN hr_departments d ON d.department_id=e.department_id
      LEFT JOIN hr_designations des ON des.designation_id=e.designation_id
      LEFT JOIN hr_company_profiles p ON p.owner_user_id=i.owner_user_id
      WHERE i.token_hash = $1 AND i.status IN ('PENDING','OPENED')`,
      [hashToken(rawToken)]
    );
    const row = r.rows[0];
    if (!row || !row.is_valid) return null;
    return row;
  },

  async submit(rawToken: string, answers: Record<string, unknown>) {
    return withTransaction(async client => {
      const q = await client.query(
        `SELECT id, status, expires_at, template_snapshot, (expires_at > CURRENT_TIMESTAMP) AS is_valid
         FROM hr_exit_interviews WHERE token_hash = $1 FOR UPDATE`,
        [hashToken(rawToken)]
      );
      if (!q.rowCount) return { ok: false, reason: 'UNAVAILABLE' };
      const row = q.rows[0];
      if (row.status !== 'PENDING' && row.status !== 'OPENED') return { ok: false, reason: 'UNAVAILABLE' };
      if (!row.is_valid) return { ok: false, reason: 'UNAVAILABLE' };

      const v = validateExitInterviewAnswers(row.template_snapshot?.schema || MASTER_EXIT_QUESTIONNAIRE, answers);
      if (v) return { ok: false, reason: v };

      await client.query(`UPDATE hr_exit_interviews SET status='COMPLETED', completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [row.id]);
      await client.query(
        `INSERT INTO hr_exit_interview_responses (interview_id, submission_id, question_id, answer, answers_json)
         VALUES ($1, gen_random_uuid(), 'all', $2::jsonb, $2::jsonb)`,
        [row.id, JSON.stringify(answers)]
      );

      return { ok: true };
    });
  },

  async getEvaluation(owner: string, interviewId: string) {
    const r = await executeSql(
      `SELECT e.* FROM hr_exit_interview_evaluations e
       JOIN hr_exit_interviews i ON i.id = e.interview_id
       WHERE e.interview_id = $1 AND i.owner_user_id = $2`,
      [interviewId, owner]
    );
    return r.rows[0] || null;
  },

  async saveEvaluation(owner: string, interviewId: string, actor: string, data: any) {
    const chk = await executeSql('SELECT id FROM hr_exit_interviews WHERE id = $1 AND owner_user_id = $2', [interviewId, owner]);
    if (!chk.rowCount) return null;

    const r = await executeSql(
      `INSERT INTO hr_exit_interview_evaluations(
        interview_id, interviewer_name, interview_date, interview_mode, reason_category,
        regrettable_exit, rehire_eligibility, hr_observations, action_items, hr_signature, updated_by
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)
      ON CONFLICT(interview_id) DO UPDATE SET
        interviewer_name = EXCLUDED.interviewer_name,
        interview_date = EXCLUDED.interview_date,
        interview_mode = EXCLUDED.interview_mode,
        reason_category = EXCLUDED.reason_category,
        regrettable_exit = EXCLUDED.regrettable_exit,
        rehire_eligibility = EXCLUDED.rehire_eligibility,
        hr_observations = EXCLUDED.hr_observations,
        action_items = EXCLUDED.action_items,
        hr_signature = EXCLUDED.hr_signature,
        updated_by = EXCLUDED.updated_by,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
      [
        interviewId,
        data.interviewerName ?? null,
        data.interviewDate ?? null,
        data.interviewMode ?? null,
        data.reasonCategory ?? null,
        data.regrettableExit ?? null,
        data.rehireEligibility ?? null,
        data.hrObservations ?? null,
        JSON.stringify(data.actionItems || []),
        data.hrSignature ?? null,
        actor,
      ]
    );
    return r.rows[0];
  },
};
