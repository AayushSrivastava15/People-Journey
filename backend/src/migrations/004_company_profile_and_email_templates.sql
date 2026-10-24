-- Migration 004: Company Profile, Email Templates, and Email Draft History
-- Creates tables for company/HR profile settings, email templates library, and user draft history.

-- 1. hr_company_profiles: Per-user workspace company and HR contact details
CREATE TABLE IF NOT EXISTS hr_company_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE CASCADE,
    company_name VARCHAR(255) NOT NULL,
    hr_contact_name VARCHAR(255),
    hr_contact_email VARCHAR(255),
    company_address TEXT,
    office_location VARCHAR(255),
    hr_contact_phone VARCHAR(50),
    default_sender_name VARCHAR(255),
    default_email_signature TEXT,
    company_website VARCHAR(255),
    department_team VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hr_company_profiles_owner 
    ON hr_company_profiles(owner_user_id);

-- 2. hr_email_templates: System starter templates and user-customized templates
CREATE TABLE IF NOT EXISTS hr_email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID REFERENCES app_users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT,
    subject_template TEXT NOT NULL,
    body_template TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_system_template BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hr_email_templates_owner 
    ON hr_email_templates(owner_user_id);

CREATE INDEX IF NOT EXISTS idx_hr_email_templates_category 
    ON hr_email_templates(category);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_email_templates_system_name 
    ON hr_email_templates(name) 
    WHERE is_system_template = TRUE;

-- 3. hr_email_drafts: User-scoped draft snapshots and Gmail workflow history
CREATE TABLE IF NOT EXISTS hr_email_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    employee_id INTEGER REFERENCES hr_employees(employee_id) ON DELETE SET NULL,
    template_id UUID REFERENCES hr_email_templates(id) ON DELETE SET NULL,
    lifecycle_event VARCHAR(100) NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    recipient_name VARCHAR(255),
    subject_snapshot TEXT NOT NULL,
    body_snapshot TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared', 'gmail_opened', 'sent_unconfirmed', 'cancelled')),
    prepared_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    gmail_opened_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hr_email_drafts_owner 
    ON hr_email_drafts(owner_user_id, prepared_at DESC);

CREATE INDEX IF NOT EXISTS idx_hr_email_drafts_employee 
    ON hr_email_drafts(employee_id);

-- 4. Idempotent Seed for Professional Starter Email Templates
INSERT INTO hr_email_templates (name, category, description, subject_template, body_template, is_active, is_system_template)
VALUES
  -- A. Recruitment and Candidate Communication
  (
    'Application Received Acknowledgment',
    'recruitment',
    'Confirm receipt of candidate application and set expectations for review.',
    'Application Received: {{job_title}} at {{company_name}}',
    E'Dear {{candidate_first_name}},\n\nThank you for applying for the {{job_title}} position at {{company_name}}.\n\nWe have received your application and resume. Our team is currently reviewing your qualifications against our role requirements.\n\nIf your profile matches what we are looking for, we will reach out with the next steps regarding an interview. In the meantime, please feel free to learn more about our culture and work at {{company_website}}.\n\nThank you again for your interest in {{company_name}}.\n\nBest regards,\n{{sender_name}}\n{{company_name}}',
    TRUE,
    TRUE
  ),
  (
    'Interview Invitation',
    'recruitment',
    'Invite a candidate to an interview round with date, time, and location details.',
    'Interview Invitation: {{job_title}} at {{company_name}}',
    E'Dear {{candidate_first_name}},\n\nThank you for your application for the {{job_title}} position at {{company_name}}. We were impressed with your background and would like to invite you for an interview.\n\nProposed Date: {{joining_date}}\nMeeting Location / Link: {{meeting_location}}\nInterview Point of Contact: {{hr_contact_name}}\n\nPlease let us know if this time works for you or if you need to suggest an alternative.\n\nBest regards,\n{{sender_name}}\n{{company_name}}\n{{hr_contact_email}}',
    TRUE,
    TRUE
  ),
  (
    'Interview Confirmation',
    'recruitment',
    'Confirm interview schedule and share preparation guidance.',
    'Confirmed: Interview for {{job_title}} with {{company_name}}',
    E'Dear {{candidate_first_name}},\n\nThis message confirms your upcoming interview for the {{job_title}} role at {{company_name}}.\n\nSchedule: {{joining_date}} at {{joining_time}}\nLocation: {{meeting_location}}\nInterviewer: {{manager_name}}\n\nIf you have any questions before the session, reach out to {{hr_contact_name}} at {{hr_contact_email}}.\n\nWe look forward to speaking with you.\n\nBest regards,\n{{sender_name}}\n{{company_name}}',
    TRUE,
    TRUE
  ),
  (
    'Formal Job Offer',
    'recruitment',
    'Extend a formal offer of employment with position and start date details.',
    'Job Offer: {{job_title}} at {{company_name}}',
    E'Dear {{candidate_first_name}},\n\nOn behalf of {{company_name}}, we are excited to extend an offer of employment for the role of {{job_title}} within the {{department_name}} team.\n\nAnticipated Start Date: {{joining_date}}\nOffice Location: {{office_location}}\nReporting Manager: {{manager_name}}\n\nPlease review the attached offer letter and return a signed copy by {{today_date}}. If you have any questions regarding compensation, benefits, or next steps, please contact {{hr_contact_name}} at {{hr_contact_email}}.\n\nWe would love to have you on our team!\n\nWarm regards,\n{{sender_name}}\n{{company_name}}',
    TRUE,
    TRUE
  ),
  (
    'Candidate Rejection (Application Review)',
    'recruitment',
    'Polite, respectful notification for candidates not moving forward.',
    'Update regarding your application for {{job_title}} at {{company_name}}',
    E'Dear {{candidate_first_name}},\n\nThank you for your interest in {{company_name}} and for taking the time to apply for the {{job_title}} position.\n\nAfter careful consideration of your qualifications and our current team requirements, we will not be moving forward with your application at this time.\n\nWe truly appreciate your interest and wish you the very best in your career pursuits.\n\nKind regards,\n{{sender_name}}\n{{company_name}}',
    TRUE,
    TRUE
  ),
  (
    'Candidate Rejection (Post-Interview)',
    'recruitment',
    'Thoughtful, courteous update for candidates who completed interview rounds.',
    'Follow-up regarding your interview for {{job_title}} at {{company_name}}',
    E'Dear {{candidate_first_name}},\n\nThank you for taking the time to interview with our team for the {{job_title}} position at {{company_name}}. We enjoyed speaking with you and learning more about your experience.\n\nWhile our team was impressed by your skills, we have decided to move forward with another candidate whose background more closely aligns with our immediate technical needs.\n\nWe will keep your details on file for future opportunities. Thank you again for your time and thoughtful conversation.\n\nBest regards,\n{{sender_name}}\n{{company_name}}',
    TRUE,
    TRUE
  ),

  -- B. New Joiner and Preboarding
  (
    'New Joiner Welcome',
    'preboarding',
    'Heartfelt welcome for newly hired employees before their first day.',
    'Welcome to {{company_name}}, {{employee_first_name}}!',
    E'Dear {{employee_first_name}},\n\nWelcome to {{company_name}}! We are thrilled to have you join our team as {{job_title}} in the {{department_name}} department.\n\nYour official joining date is {{joining_date}}.\n\nOver the coming days, we will send detailed first-day instructions and access credentials to ensure your start is smooth and rewarding.\n\nIf you have any questions prior to your start date, please contact {{hr_contact_name}} at {{hr_contact_email}} or {{hr_contact_phone}}.\n\nWe look forward to embarking on this journey together!\n\nWarm regards,\n{{sender_name}}\n{{company_name}}\n{{company_website}}',
    TRUE,
    TRUE
  ),
  (
    'Joining Date Confirmation',
    'preboarding',
    'Formal verification of employee start date and department placement.',
    'Joining Date Confirmation: {{joining_date}} - {{company_name}}',
    E'Dear {{employee_first_name}},\n\nThis message serves as formal confirmation of your joining date with {{company_name}} on {{joining_date}}.\n\nDesignation: {{job_title}}\nDepartment: {{department_name}}\nReporting Manager: {{manager_name}}\n\nPlease ensure any pending preboarding documents are submitted before {{joining_date}} to complete your enrollment.\n\nIf you have questions, reach out to {{hr_contact_name}} at {{hr_contact_email}}.\n\nBest regards,\n{{sender_name}}\n{{company_name}}',
    TRUE,
    TRUE
  ),
  (
    'Preboarding Instructions & Paperwork',
    'preboarding',
    'Clear checklist of onboarding documentation required prior to joining.',
    'Preboarding Checklist & Documentation for {{company_name}}',
    E'Dear {{employee_first_name}},\n\nAs we prepare for your first day on {{joining_date}}, please complete the following onboarding formalities:\n\nRequired Documentation: {{required_documents}}\nPending Tasks: {{pending_tasks}}\n\nPlease submit these items at your earliest convenience so your workspace profile and accounts can be provisioned on time.\n\nFor any support, please contact {{hr_contact_name}} at {{hr_contact_email}}.\n\nBest regards,\n{{sender_name}}\n{{company_name}}',
    TRUE,
    TRUE
  ),
  (
    'Joining Date Reminder',
    'preboarding',
    'Friendly reminder sent a few days prior to the employee start date.',
    'Reminder: Your upcoming start date at {{company_name}} is {{joining_date}}',
    E'Dear {{employee_first_name}},\n\nThis is a quick reminder that your first day at {{company_name}} is just around the corner on {{joining_date}}!\n\nOur team is eagerly preparing for your arrival. Please ensure all your personal details and preboarding materials are finalized.\n\nIf you have any questions or require special accommodations, do not hesitate to contact {{hr_contact_name}} at {{hr_contact_email}}.\n\nSee you soon!\n\nBest regards,\n{{sender_name}}\n{{company_name}}',
    TRUE,
    TRUE
  ),
  (
    'First-Day Schedule & Arrival Instructions',
    'preboarding',
    'Essential arrival logistics, schedule, office address, and contact person.',
    'Your first day at {{company_name}}: Schedule and Instructions',
    E'Dear {{employee_first_name}},\n\nWe are looking forward to welcoming you on {{joining_date}}! Here are the details for your first day:\n\nReporting Time: {{joining_time}}\nOffice Location: {{office_location}}\nOffice Address: {{company_address}}\nHost / Initial Contact: {{manager_name}}\n\nPlease bring: {{required_documents}}\n\nUpon arrival, your host will greet you and introduce you to your workstation and teammates.\n\nIf you run into any trouble finding the office, please call {{hr_contact_phone}}.\n\nBest regards,\n{{sender_name}}\n{{company_name}}',
    TRUE,
    TRUE
  ),
  (
    'Equipment & Account Setup Coordination',
    'preboarding',
    'Coordination details for laptop, software access, and workstation tools.',
    'IT Setup & Equipment Provisioning for {{employee_first_name}}',
    E'Dear {{employee_first_name}},\n\nTo ensure you hit the ground running on {{joining_date}}, our IT team has scheduled equipment provisioning for your role as {{job_title}}.\n\nYour company email ({{employee_email}}) and primary workspace accounts will be activated on your first morning.\n\nIf you need any specific technical tools or software licenses, please inform {{hr_contact_name}} at {{hr_contact_email}}.\n\nBest regards,\n{{sender_name}}\n{{company_name}}',
    TRUE,
    TRUE
  ),

  -- C. First-Day and Onboarding
  (
    'First-Day Welcome Message',
    'onboarding',
    'Warm congratulations sent on day one to start the employee journey.',
    'Happy First Day at {{company_name}}, {{employee_first_name}}!',
    E'Dear {{employee_first_name}},\n\nHappy first day! We are thrilled to officially welcome you to {{company_name}}.\n\nToday is focused on settling in, meeting your teammates in {{department_name}}, and setting up your workspace. Your manager, {{manager_name}}, will guide you through today’s agenda.\n\nRemember to take things at your own pace and ask plenty of questions. Everyone here is excited to support you.\n\nHave a fantastic first day!\n\nWarmly,\n{{sender_name}}\n{{company_name}}\n{{company_signature}}',
    TRUE,
    TRUE
  ),
  (
    'First-Week Onboarding Instructions',
    'onboarding',
    'Guide for navigating the first week of orientation and team milestones.',
    'Your First Week at {{company_name}}: Key Milestones',
    E'Dear {{employee_first_name}},\n\nCongratulations on completing your first day! To help you plan your week, here is an overview of key orientation milestones:\n\n1. Complete company policy acknowledgments.\n2. Meet with your manager ({{manager_name}}) to align on 30-day goals.\n3. Schedule introductory chats with {{department_name}} teammates.\n4. Complete any outstanding profile details.\n\nIf anything feels unclear, reach out to {{hr_contact_name}} at {{hr_contact_email}}.\n\nBest regards,\n{{sender_name}}\n{{company_name}}',
    TRUE,
    TRUE
  ),
  (
    'End of Week One Check-In',
    'onboarding',
    'Check-in at the end of the first week to assess initial settling in.',
    'How was your first week at {{company_name}}, {{employee_first_name}}?',
    E'Dear {{employee_first_name}},\n\nYou have officially completed your first week at {{company_name}}! We hope you have had a positive and welcoming experience.\n\nWe would love to hear how your first days have felt. Are your tools and systems working smoothly? Do you have everything you need from {{manager_name}} and the {{department_name}} team?\n\nPlease feel free to reply directly or book a quick chat with {{hr_contact_name}} at {{hr_contact_email}}.\n\nHave a restful weekend!\n\nBest regards,\n{{sender_name}}\n{{company_name}}',
    TRUE,
    TRUE
  ),
  (
    '30-Day Onboarding Check-In',
    'onboarding',
    'Milestone review for employee completion of the first month.',
    '30-Day Milestone Check-In: {{employee_first_name}} at {{company_name}}',
    E'Dear {{employee_first_name}},\n\nCongratulations on reaching your 30-day milestone with {{company_name}}!\n\nThis is a great moment to reflect on your onboarding progress, celebrate your early wins, and ensure you have all the resources you need for long-term success.\n\nPlease take a few minutes to connect with {{manager_name}} for your 30-day touchpoint. If you have any feedback or observations about our onboarding process, we would love to hear them.\n\nThank you for your energy and dedication!\n\nWarm regards,\n{{sender_name}}\n{{company_name}}',
    TRUE,
    TRUE
  ),
  (
    '60-Day Progress Review',
    'onboarding',
    'Midway milestone touchpoint to review role independence and goals.',
    '60-Day Progress Touchpoint - {{employee_first_name}}',
    E'Dear {{employee_first_name}},\n\nYou have been with {{company_name}} for two months now! We appreciate your hard work and contributions to the {{department_name}} department.\n\nAs you transition into full project ownership, please coordinate with {{manager_name}} to review your role goals and any learning opportunities you would like to explore.\n\nAs always, {{hr_contact_name}} ({{hr_contact_email}}) is here if you need any HR support.\n\nBest regards,\n{{sender_name}}\n{{company_name}}',
    TRUE,
    TRUE
  ),
  (
    '90-Day Onboarding Completion',
    'onboarding',
    'Formal celebration of completing the full 90-day onboarding journey.',
    'Congratulations on completing 90 days at {{company_name}}!',
    E'Dear {{employee_first_name}},\n\nCongratulations on successfully completing your 90-day onboarding period with {{company_name}}!\n\nYou are now fully integrated into the team, and we are grateful for the impact and positive spirit you bring to {{department_name}}.\n\nThank you for choosing to grow your journey with us. We look forward to supporting your continued professional growth.\n\nWarm regards,\n{{sender_name}}\n{{company_name}}\n{{company_signature}}',
    TRUE,
    TRUE
  ),

  -- D. General Employee Communication
  (
    'Employee Information Confirmation',
    'general',
    'Confirm that employee contact details and personal records are up to date.',
    'Verification of your personnel record at {{company_name}}',
    E'Dear {{employee_first_name}},\n\nThis email confirms that your personnel record at {{company_name}} has been updated.\n\nRecorded Email: {{employee_email}}\nDepartment: {{department_name}}\nRole: {{job_title}}\n\nIf any of this information appears incorrect, please inform {{hr_contact_name}} at {{hr_contact_email}} promptly.\n\nThank you for keeping your workspace records current.\n\nBest regards,\n{{sender_name}}\n{{company_name}}',
    TRUE,
    TRUE
  ),
  (
    'Missing Document Reminder',
    'general',
    'Request for outstanding documentation or compliance filings.',
    'Action Required: Outstanding documentation for {{company_name}}',
    E'Dear {{employee_first_name}},\n\nOur records indicate that we still require the following documentation for your personnel file:\n\nPending Items: {{required_documents}}\nDue Date: {{today_date}}\n\nPlease submit these documents to {{hr_contact_email}} at your earliest convenience to ensure uninterrupted payroll and administrative processing.\n\nThank you for your prompt attention.\n\nBest regards,\n{{sender_name}}\n{{company_name}}',
    TRUE,
    TRUE
  ),
  (
    'Work Anniversary Greeting',
    'general',
    'Celebrate employee milestones and show gratitude for contributions.',
    'Happy Work Anniversary, {{employee_first_name}}!',
    E'Dear {{employee_first_name}},\n\nHappy Work Anniversary! Today marks another year since you joined {{company_name}} on {{joining_date}}.\n\nWe want to take this opportunity to thank you for your commitment, expertise, and collaboration in the {{department_name}} team. You play an essential role in our culture and success.\n\nThank you for everything you do, and we wish you another fulfilling year ahead!\n\nWarm regards,\n{{sender_name}}\n{{company_name}}\n{{company_signature}}',
    TRUE,
    TRUE
  ),

  -- E. Offboarding and Last Working Day
  (
    'Resignation Acknowledgment',
    'offboarding',
    'Formal, respectful acknowledgment of employee resignation.',
    'Resignation Acknowledgment: {{employee_name}} - {{company_name}}',
    E'Dear {{employee_first_name}},\n\nThis message formally acknowledges receipt of your resignation from your position as {{job_title}} at {{company_name}}.\n\nYour proposed last working day is {{last_working_day}}. We will initiate the offboarding workflow to ensure a smooth transition of your responsibilities.\n\n{{hr_contact_name}} will be in touch with practical details regarding knowledge transfer, benefits continuation, and equipment return.\n\nThank you for your contributions during your tenure with us.\n\nBest regards,\n{{sender_name}}\n{{company_name}}\n{{hr_contact_email}}',
    TRUE,
    TRUE
  ),
  (
    'Last Working Day Confirmation',
    'offboarding',
    'Official confirmation of the departing employee last working day.',
    'Confirmation of Last Working Day: {{last_working_day}} - {{employee_name}}',
    E'Dear {{employee_first_name}},\n\nThis message confirms that your recorded last working day with {{company_name}} will be {{last_working_day}}.\n\nPlease coordinate with {{manager_name}} regarding your knowledge transfer tasks and handovers before that date.\n\nPrior to {{last_working_day}}, our HR team will provide final exit instructions and clearance steps.\n\nIf you have any questions about your benefits or final documentation, please reach out to {{hr_contact_name}} at {{hr_contact_email}}.\n\nBest regards,\n{{sender_name}}\n{{company_name}}',
    TRUE,
    TRUE
  ),
  (
    'Knowledge Transfer & Handover Reminder',
    'offboarding',
    'Reminder to wrap up handovers, documentation, and client transitions.',
    'Offboarding Handover & Transition Reminder: {{employee_name}}',
    E'Dear {{employee_first_name}},\n\nAs your last working day ({{last_working_day}}) approaches, please ensure all key transition tasks are documented and shared:\n\n1. Project documentation and repository access.\n2. In-flight task handovers to {{manager_name}} or designated colleagues.\n3. Passwords and shared account credentials returned or updated.\n\nThank you for ensuring a thorough handover for the {{department_name}} team.\n\nFor questions, contact {{hr_contact_email}}.\n\nBest regards,\n{{sender_name}}\n{{company_name}}',
    TRUE,
    TRUE
  ),
  (
    'Company Equipment Return Request',
    'offboarding',
    'Logistics and checklist for returning laptop, security badges, and company property.',
    'Company Property & Equipment Return: {{employee_name}}',
    E'Dear {{employee_first_name}},\n\nIn preparation for your exit on {{last_working_day}}, please arrange for the return of all company-issued assets:\n\nItems to return:\n- Company laptop and power adapters\n- Office security pass / building keycard\n- Any company peripherals and mobile devices\n\nReturn Location: {{office_location}}\nReturn Deadline: {{last_working_day}}\n\nPlease contact {{hr_contact_name}} at {{hr_contact_email}} to schedule equipment handover or obtain a prepaid shipping label.\n\nThank you for your cooperation.\n\nBest regards,\n{{sender_name}}\n{{company_name}}',
    TRUE,
    TRUE
  ),
  (
    'Farewell and Best Wishes',
    'offboarding',
    'Warm, heartfelt message of appreciation sent to the departing employee.',
    'Thank you and Best Wishes, {{employee_first_name}}!',
    E'Dear {{employee_first_name}},\n\nAs your time at {{company_name}} draws to a close on {{last_working_day}}, we want to express our sincere appreciation for the passion, talent, and energy you shared with us.\n\nYour presence in the {{department_name}} team will be missed. We are truly grateful for the impact you made during your journey with our company.\n\nWe wish you immense success and fulfillment in your next chapter. Please stay in touch!\n\nWarmest regards,\n{{sender_name}}\n{{company_name}}\n{{company_signature}}',
    TRUE,
    TRUE
  ),
  (
    'Departure Announcement Draft',
    'offboarding',
    'Internal announcement draft to inform the team of a colleague transition.',
    'Team Announcement: Transition of {{employee_name}}',
    E'Hi Team,\n\nWe would like to share that {{employee_name}}, our {{job_title}} in {{department_name}}, will be leaving {{company_name}} on {{last_working_day}} to pursue a new career opportunity.\n\nOver their time with us, {{employee_first_name}} has made significant contributions to our team and culture. Please join us in thanking {{employee_first_name}} for their hard work and wishing them all the best in their next adventure.\n\nTransition arrangements and point-of-contact handovers are being coordinated by {{manager_name}}.\n\nBest regards,\n{{sender_name}}\n{{company_name}}',
    TRUE,
    TRUE
  ),

  -- F. Exit Interview
  (
    'Exit Interview Invitation',
    'exit_interview',
    'Invite departing employee to an exit interview session to gather feedback.',
    'Exit Interview Invitation: {{employee_first_name}} - {{company_name}}',
    E'Dear {{employee_first_name}},\n\nAs part of your offboarding from {{company_name}}, we would like to invite you to an Exit Interview.\n\nProposed Date: {{exit_interview_date}}\nProposed Time: {{exit_interview_time}}\nMeeting Location / Link: {{meeting_location}}\nHR Contact: {{hr_contact_name}} ({{hr_contact_email}})\n\nThe exit interview provides a confidential opportunity for you to share feedback about your experience at {{company_name}} and help us identify ways we can improve for future team members.\n\nPlease let us know if the proposed schedule works for you.\n\nBest regards,\n{{sender_name}}\n{{company_name}}',
    TRUE,
    TRUE
  ),
  (
    'Exit Interview Reminder',
    'exit_interview',
    'Friendly reminder of upcoming exit interview time and location.',
    'Reminder: Exit Interview on {{exit_interview_date}}',
    E'Dear {{employee_first_name}},\n\nThis is a quick reminder regarding your upcoming exit interview scheduled for {{exit_interview_date}} at {{exit_interview_time}}.\n\nLocation / Meeting Link: {{meeting_location}}\n\nWe look forward to speaking with you and hearing your thoughts.\n\nBest regards,\n{{sender_name}}\n{{company_name}}',
    TRUE,
    TRUE
  ),
  (
    'Thank You Post-Exit Interview',
    'exit_interview',
    'Thank departing employee for their constructive exit interview feedback.',
    'Thank you for your feedback, {{employee_first_name}}',
    E'Dear {{employee_first_name}},\n\nThank you for taking the time to speak with us during your exit interview today. We appreciate your candid, thoughtful feedback about your time at {{company_name}}.\n\nYour insights are invaluable in helping us make our workspace an even better environment for everyone.\n\nWe wish you all the best in your future endeavors!\n\nWarm regards,\n{{sender_name}}\n{{company_name}}\n{{company_signature}}',
    TRUE,
    TRUE
  ),

  -- G. Other Lifecycle Templates
  (
    'Joining Date Postponed Notice',
    'lifecycle',
    'Notify and confirm revised joining date when a start date changes.',
    'Updated Start Date: {{joining_date}} - {{company_name}}',
    E'Dear {{employee_first_name}},\n\nThis message confirms that your scheduled joining date with {{company_name}} has been adjusted to {{joining_date}}.\n\nAll other terms of your employment as {{job_title}} in the {{department_name}} department remain unchanged.\n\nIf you have any questions regarding your updated schedule, please contact {{hr_contact_name}} at {{hr_contact_email}}.\n\nWe look forward to welcoming you on your new start date.\n\nBest regards,\n{{sender_name}}\n{{company_name}}',
    TRUE,
    TRUE
  ),
  (
    'General HR Follow-up',
    'lifecycle',
    'Versatile follow-up template for any personnel or administrative inquiry.',
    'Follow-up from HR: {{company_name}}',
    E'Dear {{employee_first_name}},\n\nI am writing to follow up regarding your recent inquiry with {{company_name}}.\n\nPlease review your details and let us know if you require any additional information or documentation.\n\nYou can reach our team anytime at {{hr_contact_email}} or {{hr_contact_phone}}.\n\nBest regards,\n{{sender_name}}\n{{company_name}}\n{{company_signature}}',
    TRUE,
    TRUE
  )
ON CONFLICT (name) WHERE is_system_template = TRUE DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  subject_template = EXCLUDED.subject_template,
  body_template = EXCLUDED.body_template,
  updated_at = CURRENT_TIMESTAMP;
