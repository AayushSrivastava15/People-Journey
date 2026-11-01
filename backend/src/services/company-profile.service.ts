import { executeSql } from '../config/database.js';
import type { CompanyProfile, UpsertCompanyProfileDto } from '../models/company-profile.model.js';
import { logger } from '../utils/logger.js';

function mapRowToCompanyProfile(row: any): CompanyProfile {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    companyName: row.company_name,
    hrContactName: row.hr_contact_name || null,
    hrContactEmail: row.hr_contact_email || null,
    companyAddress: row.company_address || null,
    officeLocation: row.office_location || null,
    hrContactPhone: row.hr_contact_phone || null,
    defaultSenderName: row.default_sender_name || null,
    defaultEmailSignature: row.default_email_signature || null,
    companyWebsite: row.company_website || null,
    departmentTeam: row.department_team || null,
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

  async upsertProfile(
    ownerUserId: string,
    data: UpsertCompanyProfileDto
  ): Promise<CompanyProfile> {
    const query = `
      INSERT INTO hr_company_profiles (
        owner_user_id,
        company_name,
        hr_contact_name,
        hr_contact_email,
        company_address,
        office_location,
        hr_contact_phone,
        default_sender_name,
        default_email_signature,
        company_website,
        department_team,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
      ON CONFLICT (owner_user_id) DO UPDATE SET
        company_name = EXCLUDED.company_name,
        hr_contact_name = EXCLUDED.hr_contact_name,
        hr_contact_email = EXCLUDED.hr_contact_email,
        company_address = EXCLUDED.company_address,
        office_location = EXCLUDED.office_location,
        hr_contact_phone = EXCLUDED.hr_contact_phone,
        default_sender_name = EXCLUDED.default_sender_name,
        default_email_signature = EXCLUDED.default_email_signature,
        company_website = EXCLUDED.company_website,
        department_team = EXCLUDED.department_team,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;

    const values = [
      ownerUserId,
      data.companyName.trim(),
      data.hrContactName ? data.hrContactName.trim() : null,
      data.hrContactEmail ? data.hrContactEmail.trim().toLowerCase() : null,
      data.companyAddress ? data.companyAddress.trim() : null,
      data.officeLocation ? data.officeLocation.trim() : null,
      data.hrContactPhone ? data.hrContactPhone.trim() : null,
      data.defaultSenderName ? data.defaultSenderName.trim() : null,
      data.defaultEmailSignature ? data.defaultEmailSignature.trim() : null,
      data.companyWebsite ? data.companyWebsite.trim() : null,
      data.departmentTeam ? data.departmentTeam.trim() : null,
    ];

    const result = await executeSql(query, values);
    logger.info({ ownerUserId, companyName: data.companyName }, 'Saved company profile in PostgreSQL');
    return mapRowToCompanyProfile(result.rows[0]);
  }
}

export const companyProfileService = new CompanyProfileService();
