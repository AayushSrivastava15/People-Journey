import { executeSql } from '../config/database.js';
import type {
  EmailTemplate,
  CreateEmailTemplateDto,
  UpdateEmailTemplateDto,
} from '../models/email-template.model.js';
import { logger } from '../utils/logger.js';

function mapRowToEmailTemplate(row: any): EmailTemplate {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id || null,
    name: row.name,
    category: row.category,
    description: row.description || null,
    subjectTemplate: row.subject_template,
    bodyTemplate: row.body_template,
    isActive: row.is_active ?? true,
    isSystemTemplate: row.is_system_template ?? false,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

export class EmailTemplateService {
  async listTemplates(
    userId: string,
    category?: string,
    search?: string
  ): Promise<EmailTemplate[]> {
    let query = `
      SELECT * FROM hr_email_templates
      WHERE (owner_user_id = $1 OR is_system_template = TRUE)
        AND is_active = TRUE
    `;
    const params: any[] = [userId];

    if (category && category !== 'all') {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      query += ` AND (LOWER(name) LIKE $${params.length} OR LOWER(description) LIKE $${params.length})`;
    }

    query += ` ORDER BY is_system_template ASC, name ASC`;

    const result = await executeSql(query, params);
    return result.rows.map(mapRowToEmailTemplate);
  }

  async getTemplateById(userId: string, templateId: string): Promise<EmailTemplate | null> {
    const result = await executeSql(
      `SELECT * FROM hr_email_templates 
       WHERE id = $1 AND (owner_user_id = $2 OR is_system_template = TRUE)
       LIMIT 1`,
      [templateId, userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return mapRowToEmailTemplate(result.rows[0]);
  }

  async createTemplate(
    userId: string,
    data: CreateEmailTemplateDto
  ): Promise<EmailTemplate> {
    const query = `
      INSERT INTO hr_email_templates (
        owner_user_id,
        name,
        category,
        description,
        subject_template,
        body_template,
        is_active,
        is_system_template
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)
      RETURNING *;
    `;

    const values = [
      userId,
      data.name.trim(),
      data.category,
      data.description ? data.description.trim() : null,
      data.subjectTemplate.trim(),
      data.bodyTemplate.trim(),
      data.isActive ?? true,
    ];

    const result = await executeSql(query, values);
    logger.info({ userId, templateId: result.rows[0].id, name: data.name }, 'Created custom email template');
    return mapRowToEmailTemplate(result.rows[0]);
  }

  async updateTemplate(
    userId: string,
    templateId: string,
    data: UpdateEmailTemplateDto
  ): Promise<EmailTemplate> {
    const existing = await executeSql(
      `SELECT * FROM hr_email_templates WHERE id = $1 LIMIT 1`,
      [templateId]
    );

    if (existing.rows.length === 0) {
      throw new Error('Template not found');
    }

    const row = existing.rows[0];
    if (row.is_system_template) {
      throw new Error('System starter templates cannot be modified directly. Duplicate the template to customize it in your workspace.');
    }

    if (row.owner_user_id !== userId) {
      throw new Error('Unauthorized to modify this template');
    }

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(data.name.trim());
    }
    if (data.category !== undefined) {
      fields.push(`category = $${idx++}`);
      values.push(data.category);
    }
    if (data.description !== undefined) {
      fields.push(`description = $${idx++}`);
      values.push(data.description ? data.description.trim() : null);
    }
    if (data.subjectTemplate !== undefined) {
      fields.push(`subject_template = $${idx++}`);
      values.push(data.subjectTemplate.trim());
    }
    if (data.bodyTemplate !== undefined) {
      fields.push(`body_template = $${idx++}`);
      values.push(data.bodyTemplate.trim());
    }
    if (data.isActive !== undefined) {
      fields.push(`is_active = $${idx++}`);
      values.push(data.isActive);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(templateId);
    values.push(userId);

    const query = `
      UPDATE hr_email_templates
      SET ${fields.join(', ')}
      WHERE id = $${idx++} AND owner_user_id = $${idx++}
      RETURNING *;
    `;

    const result = await executeSql(query, values);
    return mapRowToEmailTemplate(result.rows[0]);
  }

  async duplicateTemplate(userId: string, templateId: string): Promise<EmailTemplate> {
    const source = await this.getTemplateById(userId, templateId);
    if (!source) {
      throw new Error('Template not found');
    }

    return this.createTemplate(userId, {
      name: `${source.name} (Custom)`,
      category: source.category,
      description: source.description || undefined,
      subjectTemplate: source.subjectTemplate,
      bodyTemplate: source.bodyTemplate,
      isActive: true,
    });
  }

  async deleteTemplate(userId: string, templateId: string): Promise<boolean> {
    const existing = await executeSql(
      `SELECT * FROM hr_email_templates WHERE id = $1 LIMIT 1`,
      [templateId]
    );

    if (existing.rows.length === 0) {
      return false;
    }

    if (existing.rows[0].is_system_template) {
      throw new Error('System starter templates cannot be deleted.');
    }

    if (existing.rows[0].owner_user_id !== userId) {
      throw new Error('Unauthorized to delete this template');
    }

    const result = await executeSql(
      `DELETE FROM hr_email_templates WHERE id = $1 AND owner_user_id = $2`,
      [templateId, userId]
    );

    return (result.rowCount ?? 0) > 0;
  }
}

export const emailTemplateService = new EmailTemplateService();
