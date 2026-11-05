import { executeSql } from '../config/database.js';
import type { CompanyProfile, CompanyOnboardingStatus, UpsertCompanyProfileDto } from '../models/company-profile.model.js';
import { MASTER_EXIT_QUESTIONNAIRE } from '../config/master-exit-questionnaire.js';
import { logger } from '../utils/logger.js';

function mapRowToCompanyProfile(row: any): CompanyProfile {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    companyName: row.company_name,
    displayName: row.display_name || null,
    logoUrl: row.logo_url || null,
    brandPrimaryColor: row.brand_primary_color || '#59424f',
    industry: row.industry || null,
    companyWebsite: row.company_website || null,
    companyAddress: row.company_address || null,
    officeLocation: row.office_location || null,
    companyEmail: row.company_email || null,
    companyPhone: row.company_phone || null,
    country: row.country || null,
    timezone: row.timezone || 'UTC',
    hrContactName: row.hr_contact_name || null,
    hrContactEmail: row.hr_contact_email || null,
    hrContactPhone: row.hr_contact_phone || null,
    departmentTeam: row.department_team || null,
    defaultSenderName: row.default_sender_name || null,
    defaultEmailSignature: row.default_email_signature || null,
    setupCompleted: Boolean(row.setup_completed),
    setupStep: Number(row.setup_step || 1),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

export class CompanyProfileService {
  async getProfile(ownerUserId: string): Promise<CompanyProfile | null> {
    const result = await executeSql(
      `SELECT * FROM hr_company_profiles WHERE owner_user_id = $1 LIMIT 1`,
      [ownerUserId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return mapRowToCompanyProfile(result.rows[0]);
  }

  async getOnboardingStatus(ownerUserId: string): Promise<CompanyOnboardingStatus> {
    const profile = await this.getProfile(ownerUserId);

    // Check if company has an exit template
    const templateRes = await executeSql(
      `SELECT id FROM hr_exit_interview_templates WHERE owner_user_id = $1 AND is_active = TRUE LIMIT 1`,
      [ownerUserId]
    );
    const hasDefaultTemplate = templateRes.rows.length > 0;

    const step1Details = Boolean(profile?.companyName && profile.companyName.trim().length > 0);
    const step2Branding = Boolean(
      profile?.displayName || profile?.logoUrl || (profile?.brandPrimaryColor && profile.brandPrimaryColor !== '#59424f')
    );
    const step3HrContact = Boolean(profile?.hrContactName && profile?.hrContactEmail);
    const step4ExitForm = hasDefaultTemplate;

    let stepsCompleted = 0;
    if (step1Details) stepsCompleted++;
    if (step2Branding) stepsCompleted++;
    if (step3HrContact) stepsCompleted++;
    if (step4ExitForm) stepsCompleted++;

    const isAllComplete = step1Details && step3HrContact && step4ExitForm;

    return {
      setupCompleted: profile?.setupCompleted ?? isAllComplete,
      setupStep: profile?.setupStep || (stepsCompleted < 4 ? stepsCompleted + 1 : 4),
      stepsCompleted,
      totalSteps: 4,
      steps: {
        details: step1Details,
        branding: step2Branding,
        hrContact: step3HrContact,
        exitForm: step4ExitForm,
      },
      hasDefaultTemplate,
    };
  }

  async upsertProfile(
    ownerUserId: string,
    data: UpsertCompanyProfileDto
  ): Promise<CompanyProfile> {
    const query = `
      INSERT INTO hr_company_profiles (
        owner_user_id,
        company_name,
        display_name,
        logo_url,
        brand_primary_color,
        industry,
        company_website,
        company_address,
        office_location,
        company_email,
        company_phone,
        country,
        timezone,
        hr_contact_name,
        hr_contact_email,
        hr_contact_phone,
        department_team,
        default_sender_name,
        default_email_signature,
        setup_completed,
        setup_step,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, CURRENT_TIMESTAMP
      )
      ON CONFLICT (owner_user_id) DO UPDATE SET
        company_name = EXCLUDED.company_name,
        display_name = COALESCE(EXCLUDED.display_name, hr_company_profiles.display_name),
        logo_url = COALESCE(EXCLUDED.logo_url, hr_company_profiles.logo_url),
        brand_primary_color = COALESCE(EXCLUDED.brand_primary_color, hr_company_profiles.brand_primary_color),
        industry = COALESCE(EXCLUDED.industry, hr_company_profiles.industry),
        company_website = COALESCE(EXCLUDED.company_website, hr_company_profiles.company_website),
        company_address = COALESCE(EXCLUDED.company_address, hr_company_profiles.company_address),
        office_location = COALESCE(EXCLUDED.office_location, hr_company_profiles.office_location),
        company_email = COALESCE(EXCLUDED.company_email, hr_company_profiles.company_email),
        company_phone = COALESCE(EXCLUDED.company_phone, hr_company_profiles.company_phone),
        country = COALESCE(EXCLUDED.country, hr_company_profiles.country),
        timezone = COALESCE(EXCLUDED.timezone, hr_company_profiles.timezone),
        hr_contact_name = EXCLUDED.hr_contact_name,
        hr_contact_email = EXCLUDED.hr_contact_email,
        hr_contact_phone = EXCLUDED.hr_contact_phone,
        department_team = EXCLUDED.department_team,
        default_sender_name = EXCLUDED.default_sender_name,
        default_email_signature = EXCLUDED.default_email_signature,
        setup_completed = COALESCE(EXCLUDED.setup_completed, hr_company_profiles.setup_completed),
        setup_step = COALESCE(EXCLUDED.setup_step, hr_company_profiles.setup_step),
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;

    const values = [
      ownerUserId,
      data.companyName.trim(),
      data.displayName ? data.displayName.trim() : null,
      data.logoUrl ? data.logoUrl.trim() : null,
      data.brandPrimaryColor ? data.brandPrimaryColor.trim() : '#59424f',
      data.industry ? data.industry.trim() : null,
      data.companyWebsite ? data.companyWebsite.trim() : null,
      data.companyAddress ? data.companyAddress.trim() : null,
      data.officeLocation ? data.officeLocation.trim() : null,
      data.companyEmail ? data.companyEmail.trim().toLowerCase() : null,
      data.companyPhone ? data.companyPhone.trim() : null,
      data.country ? data.country.trim() : null,
      data.timezone ? data.timezone.trim() : 'UTC',
      data.hrContactName ? data.hrContactName.trim() : null,
      data.hrContactEmail ? data.hrContactEmail.trim().toLowerCase() : null,
      data.hrContactPhone ? data.hrContactPhone.trim() : null,
      data.departmentTeam ? data.departmentTeam.trim() : null,
      data.defaultSenderName ? data.defaultSenderName.trim() : null,
      data.defaultEmailSignature ? data.defaultEmailSignature.trim() : null,
      data.setupCompleted ?? false,
      data.setupStep ?? 1,
    ];

    const result = await executeSql(query, values);
    const profile = mapRowToCompanyProfile(result.rows[0]);
    logger.info({ ownerUserId, companyName: data.companyName }, 'Saved company profile in PostgreSQL');

    // Automatically clone the master template for this company if one does not exist
    await this.ensureCompanyTemplate(ownerUserId, profile.companyName);

    return profile;
  }

  /**
   * Ensures the company workspace has an independent copy of the master questionnaire.
   * If not already created, copies MASTER_EXIT_QUESTIONNAIRE and creates version 1.
   */
  async ensureCompanyTemplate(ownerUserId: string, companyName: string): Promise<string> {
    const existing = await executeSql<{ id: string }>(
      `SELECT id FROM hr_exit_interview_templates WHERE owner_user_id = $1 AND is_active = TRUE LIMIT 1`,
      [ownerUserId]
    );

    if (existing.rows.length > 0) {
      return existing.rows[0].id;
    }

    const templateName = `${companyName || 'Company'} Exit Feedback Questionnaire`;
    const insRes = await executeSql<{ id: string }>(
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
      RETURNING id`,
      [
        ownerUserId,
        templateName,
        `Official Exit Interview feedback questionnaire for ${companyName || 'the organisation'}.`,
        JSON.stringify(MASTER_EXIT_QUESTIONNAIRE),
      ]
    );

    const templateId = insRes.rows[0].id;

    // Create immutable Version 1 snapshot
    await executeSql(
      `INSERT INTO hr_exit_interview_template_versions (
        template_id,
        version_number,
        schema_json,
        change_summary,
        published_by
      ) VALUES ($1, 1, $2, $3, $4)
      ON CONFLICT (template_id, version_number) DO NOTHING`,
      [
        templateId,
        JSON.stringify(MASTER_EXIT_QUESTIONNAIRE),
        'Initial company template generated from master questionnaire.',
        ownerUserId,
      ]
    );

    logger.info({ ownerUserId, templateId }, 'Initialized independent company exit interview template & version 1');
    return templateId;
  }
}

export const companyProfileService = new CompanyProfileService();
