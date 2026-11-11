import { executeSql } from '../config/database.js';
import type {
  EmailDraft,
  PreviewDraftDto,
  CreateDraftDto,
  DraftStatus,
} from '../models/email-draft.model.js';
import { companyProfileService } from './company-profile.service.js';
import { emailTemplateService } from './email-template.service.js';
import { resolvePlaceholders, type PlaceholderEmployeeData } from '../utils/placeholder-engine.js';
import { logger } from '../utils/logger.js';

function mapRowToEmailDraft(row: any): EmailDraft {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    employeeId: row.employee_id ? Number(row.employee_id) : null,
    templateId: row.template_id || null,
    lifecycleEvent: row.lifecycle_event,
    recipientEmail: row.recipient_email,
    recipientName: row.recipient_name || null,
    subjectSnapshot: row.subject_snapshot,
    bodySnapshot: row.body_snapshot,
    status: row.status,
    preparedAt: row.prepared_at ? new Date(row.prepared_at).toISOString() : new Date().toISOString(),
    gmailOpenedAt: row.gmail_opened_at ? new Date(row.gmail_opened_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
    employeeCode: row.employee_code || undefined,
    departmentName: row.department_name || undefined,
    templateName: row.template_name || undefined,
  };
}

export class EmailDraftService {
  async previewDraft(userId: string, payload: PreviewDraftDto) {
    // 1. Fetch company profile
    const companyProfile = await companyProfileService.getProfile(userId);

    // 2. Fetch employee if employeeId is specified
    let employeeData: PlaceholderEmployeeData | null = null;
    let recipientEmail = payload.candidateEmail || '';
    let recipientName = payload.candidateName || '';

    if (payload.employeeId) {
      const empRes = await executeSql(
        `SELECT e.*, d.department_name, des.designation_name
         FROM hr_employees e
         LEFT JOIN hr_departments d ON e.department_id = d.department_id
         LEFT JOIN hr_designations des ON e.designation_id = des.designation_id
         WHERE e.employee_id = $1 AND e.owner_user_id = $2
         LIMIT 1`,
        [payload.employeeId, userId],
        { userId, role: 'user' }
      );

      if (empRes.rows.length === 0) {
        throw new Error('Employee not found in your workspace');
      }

      const emp = empRes.rows[0] as {
        first_name: string;
        last_name?: string | null;
        work_email?: string | null;
        personal_email?: string | null;
        employee_code?: string;
        designation_name?: string;
        department_name?: string;
        hire_date?: string | Date;
        exit_date?: string | Date;
      };
      employeeData = {
        employeeName: `${emp.first_name} ${emp.last_name || ''}`.trim(),
        firstName: emp.first_name,
        lastName: emp.last_name || '',
        email: emp.work_email || emp.personal_email || '',
        employeeCode: emp.employee_code,
        designation: emp.designation_name,
        department: emp.department_name,
        hireDate: emp.hire_date ? new Date(emp.hire_date).toISOString().split('T')[0] : undefined,
        exitDate: emp.exit_date ? new Date(emp.exit_date).toISOString().split('T')[0] : undefined,
      };

      recipientEmail = emp.work_email || emp.personal_email || recipientEmail;
      recipientName = employeeData?.employeeName || recipientName || 'Team Member';
    }

    // 3. Fetch template if templateId is specified
    let rawSubject = payload.subjectOverride || '';
    let rawBody = payload.bodyOverride || '';
    let templateName = 'Custom Draft';

    if (payload.templateId) {
      const template = await emailTemplateService.getTemplateById(userId, payload.templateId);
      if (!template) {
        throw new Error('Template not found');
      }
      templateName = template.name;
      if (!rawSubject) rawSubject = template.subjectTemplate;
      if (!rawBody) rawBody = template.bodyTemplate;
    }

    const effectiveCustomValues = payload.customPlaceholders || payload.customValues || {};

    const resolvedSubject = resolvePlaceholders(rawSubject, {
      companyProfile,
      employee: employeeData,
      candidateName: payload.candidateName,
      candidateEmail: payload.candidateEmail,
      customValues: effectiveCustomValues,
    });

    const resolvedBody = resolvePlaceholders(rawBody, {
      companyProfile,
      employee: employeeData,
      candidateName: payload.candidateName,
      candidateEmail: payload.candidateEmail,
      customValues: effectiveCustomValues,
    });

    const missingPlaceholders = Array.from(
      new Set([...resolvedSubject.missingPlaceholders, ...resolvedBody.missingPlaceholders])
    );

    return {
      templateName,
      recipientEmail,
      recipientName,
      subject: resolvedSubject.text,
      body: resolvedBody.text,
      detectedPlaceholders: Array.from(
        new Set([...resolvedSubject.detectedPlaceholders, ...resolvedBody.detectedPlaceholders])
      ),
      missingPlaceholders,
      unresolvedPlaceholders: Array.from(
        new Set([...resolvedSubject.unresolvedPlaceholders, ...resolvedBody.unresolvedPlaceholders])
      ),
      hasCompanyProfile: !!companyProfile,
      companyProfileStatus: {
        hasName: !!companyProfile?.companyName,
        hasHrName: !!companyProfile?.hrContactName,
        hasHrEmail: !!companyProfile?.hrContactEmail,
      },
    };
  }

  async createDraft(userId: string, data: CreateDraftDto): Promise<EmailDraft> {
    // Verify employee ownership if employeeId passed
    if (data.employeeId) {
      const check = await executeSql(
        `SELECT employee_id FROM hr_employees WHERE employee_id = $1 AND owner_user_id = $2`,
        [data.employeeId, userId],
        { userId, role: 'user' }
      );
      if (check.rows.length === 0) {
        throw new Error('Referenced employee does not belong to your workspace');
      }
    }

    const query = `
      INSERT INTO hr_email_drafts (
        owner_user_id,
        employee_id,
        template_id,
        lifecycle_event,
        recipient_email,
        recipient_name,
        subject_snapshot,
        body_snapshot,
        status,
        prepared_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
      RETURNING *;
    `;

    const values = [
      userId,
      data.employeeId || null,
      data.templateId || null,
      data.lifecycleEvent.trim(),
      data.recipientEmail.trim().toLowerCase(),
      data.recipientName ? data.recipientName.trim() : null,
      data.subjectSnapshot.trim(),
      data.bodySnapshot.trim(),
      data.status || 'prepared',
    ];

    const result = await executeSql(query, values, { userId, role: 'user' });
    logger.info({ userId, draftId: result.rows[0].id, recipient: data.recipientEmail }, 'Created email draft snapshot');
    return mapRowToEmailDraft(result.rows[0]);
  }

  async listDrafts(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      status?: string;
      search?: string;
    } = {}
  ): Promise<{ data: EmailDraft[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(100, options.limit || 10));
    const offset = (page - 1) * limit;

    let whereClause = `WHERE d.owner_user_id = $1`;
    const params: any[] = [userId];

    if (options.status && options.status !== 'All') {
      params.push(options.status);
      whereClause += ` AND d.status = $${params.length}`;
    }

    if (options.search && options.search.trim()) {
      params.push(`%${options.search.trim().toLowerCase()}%`);
      whereClause += ` AND (
        LOWER(d.recipient_email) LIKE $${params.length}
        OR LOWER(d.recipient_name) LIKE $${params.length}
        OR LOWER(d.subject_snapshot) LIKE $${params.length}
        OR LOWER(d.lifecycle_event) LIKE $${params.length}
      )`;
    }

    const countQuery = `
      SELECT COUNT(*)::int AS count 
      FROM hr_email_drafts d 
      ${whereClause}
    `;

    const dataQuery = `
      SELECT 
        d.*,
        e.employee_code,
        dept.department_name,
        t.name AS template_name
      FROM hr_email_drafts d
      LEFT JOIN hr_employees e ON d.employee_id = e.employee_id
      LEFT JOIN hr_departments dept ON e.department_id = dept.department_id
      LEFT JOIN hr_email_templates t ON d.template_id = t.id
      ${whereClause}
      ORDER BY d.prepared_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const userContext = { userId, role: 'user' };
    const [countRes, dataRes] = await Promise.all([
      executeSql(countQuery, params, userContext),
      executeSql(dataQuery, [...params, limit, offset], userContext),
    ]);

    const total = parseInt(String(countRes.rows[0]?.count || 0), 10);
    const data = dataRes.rows.map(mapRowToEmailDraft);

    return { data, total, page, limit };
  }

  async getDraftById(userId: string, draftId: string): Promise<EmailDraft | null> {
    const query = `
      SELECT 
        d.*,
        e.employee_code,
        dept.department_name,
        t.name AS template_name
      FROM hr_email_drafts d
      LEFT JOIN hr_employees e ON d.employee_id = e.employee_id
      LEFT JOIN hr_departments dept ON e.department_id = dept.department_id
      LEFT JOIN hr_email_templates t ON d.template_id = t.id
      WHERE d.id = $1 AND d.owner_user_id = $2
      LIMIT 1
    `;

    const result = await executeSql(query, [draftId, userId], { userId, role: 'user' });
    if (result.rows.length === 0) return null;
    return mapRowToEmailDraft(result.rows[0]);
  }

  async updateDraftStatus(
    userId: string,
    draftId: string,
    status: DraftStatus,
    gmailOpened?: boolean
  ): Promise<EmailDraft> {
    let query: string;
    let params: any[];

    if (gmailOpened || status === 'gmail_opened') {
      query = `
        UPDATE hr_email_drafts
        SET status = $1,
            gmail_opened_at = COALESCE(gmail_opened_at, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND owner_user_id = $3
        RETURNING *;
      `;
      params = [status, draftId, userId];
    } else {
      query = `
        UPDATE hr_email_drafts
        SET status = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND owner_user_id = $3
        RETURNING *;
      `;
      params = [status, draftId, userId];
    }

    const result = await executeSql(query, params, { userId, role: 'user' });
    if (result.rows.length === 0) {
      throw new Error('Draft not found or unauthorized');
    }

    return mapRowToEmailDraft(result.rows[0]);
  }
}

export const emailDraftService = new EmailDraftService();
