export type LifecycleStatus = 'Active' | 'Onboarding' | 'Offboarding' | 'Exited';
export type NoticeStatus = 'Pending' | 'Processing' | 'Sent' | 'Failed' | 'Cancelled';
export type AppRole = 'user' | 'hr_staff' | 'hr_admin' | 'admin';

export interface AppUser {
  id: string;
  uid?: string;
  firebaseUid: string;
  email: string;
  name?: string;
  displayName: string | null;
  picture?: string | null;
  photoUrl?: string | null;
  role: AppRole;
  accountStatus: 'active' | 'deactivated' | 'suspended';
  isActive?: boolean;
  preferences?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string | null;
}

export interface Employee {
  employeeId: number;
  employeeCode: string;
  firstName: string;
  lastName: string | null;
  name: string;
  workEmail: string | null;
  personalEmail?: string | null;
  phone: string | null;
  departmentId: number | null;
  designationId: number | null;
  departmentName: string | null;
  designationName: string | null;
  employmentStatus: 'ACTIVE' | 'ONBOARDING' | 'OFFBOARDING' | 'EXITED';
  status: LifecycleStatus;
  hireDate: string;
  exitDate: string | null;
  lastWorkingDay?: string | null;
  exitReason?: string | null;
  exitNotes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string | null;
  ownerUserId?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface Department {
  departmentId: number;
  departmentName: string;
  description: string | null;
  isActive: boolean;
  employeeCount?: number;
}

export interface Designation {
  designationId: number;
  designationName: string;
  departmentId?: number | null;
  departmentName?: string | null;
  description: string | null;
}

export interface DashboardStats {
  totalEmployees: number;
  activeEmployees: number;
  onboardingEmployees: number;
  offboardingEmployees: number;
  exitedEmployees: number;
  joiningThisMonth: number;
  upcomingJoiners: number;
  upcomingExits: number;
  statusDistribution: { name: string; value: number }[];
  departmentBreakdown: { name: string; value: number }[];
  monthlyActivity: { month: string; joining: number; exits: number }[];
  upcomingEvents: {
    id: string;
    person: string;
    label: string;
    date: string;
    status: string;
    path: string;
  }[];
}

export interface UserNotificationItem {
  id: number;
  userId?: string;
  title: string;
  message: string;
  type: 'offboarding' | 'onboarding' | 'exit_management' | 'info' | string;
  isRead: boolean;
  createdAt: string;
  actionUrl?: string | null;
}

export interface UserNotificationsResponse {
  notifications: UserNotificationItem[];
  unreadCount: number;
  total?: number;
}

export type NotificationItem = UserNotificationItem;
export type NotificationsResponse = UserNotificationsResponse;

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

export interface CreateEmployeePayload {
  employeeCode?: string;
  firstName: string;
  lastName?: string;
  fullName?: string;
  workEmail?: string;
  personalEmail?: string;
  phone?: string;
  departmentId?: number | null;
  department?: string;
  designationId?: number | null;
  designation?: string;
  manager?: string;
  employmentStatus?: string;
  hireDate: string;
  joiningDate?: string;
  exitDate?: string | null;
  lastWorkingDay?: string | null;
  exitReason?: string | null;
  exitNotes?: string | null;
  notes?: string;
}

export interface UpdateEmployeePayload {
  firstName?: string;
  lastName?: string;
  workEmail?: string;
  personalEmail?: string;
  phone?: string;
  departmentId?: number | null;
  designationId?: number | null;
  employmentStatus?: string;
  hireDate?: string;
  exitDate?: string | null;
  lastWorkingDay?: string | null;
  exitReason?: string | null;
  exitNotes?: string | null;
  notes?: string;
}

export interface OffboardEmployeePayload {
  plannedExitDate: string;
  lastWorkingDay?: string;
  contactEmail?: string;
  reason?: string;
  handoverNotes?: string;
  notes?: string;
  regrettable?: boolean;
}

export interface CompanyProfile {
  id: string;
  ownerUserId: string;
  companyName: string;
  displayName?: string | null;
  logoUrl?: string | null;
  brandPrimaryColor?: string | null;
  industry?: string | null;
  companyWebsite?: string | null;
  companyAddress?: string | null;
  officeLocation?: string | null;
  companyEmail?: string | null;
  companyPhone?: string | null;
  country?: string | null;
  timezone?: string | null;
  hrContactName?: string | null;
  hrContactEmail?: string | null;
  hrContactPhone?: string | null;
  departmentTeam?: string | null;
  defaultSenderName?: string | null;
  defaultEmailSignature?: string | null;
  setupCompleted?: boolean;
  setupStep?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CompanyOnboardingStatus {
  setupCompleted: boolean;
  setupStep: number;
  stepsCompleted: number;
  totalSteps: number;
  steps: {
    details: boolean;
    branding: boolean;
    hrContact: boolean;
    exitForm: boolean;
  };
  hasDefaultTemplate: boolean;
}

export interface UpsertCompanyProfileInput {
  companyName: string;
  displayName?: string;
  logoUrl?: string;
  brandPrimaryColor?: string;
  industry?: string;
  companyWebsite?: string;
  companyAddress?: string;
  officeLocation?: string;
  companyEmail?: string;
  companyPhone?: string;
  country?: string;
  timezone?: string;
  hrContactName?: string;
  hrContactEmail?: string;
  hrContactPhone?: string;
  departmentTeam?: string;
  defaultSenderName?: string;
  defaultEmailSignature?: string;
  setupCompleted?: boolean;
  setupStep?: number;
}

export type EmailTemplateCategory =
  | 'recruitment'
  | 'preboarding'
  | 'onboarding'
  | 'general'
  | 'offboarding'
  | 'exit_interview'
  | 'lifecycle'
  | 'Recruitment and Candidate Communication'
  | 'New Joiner and Preboarding'
  | 'First-Day and Onboarding'
  | 'General Employee Communication'
  | 'Offboarding and Last Working Day'
  | 'Exit Interview'
  | 'Other Lifecycle Templates'
  | string;

export interface EmailTemplate {
  id: string;
  ownerUserId?: string | null;
  name: string;
  category: EmailTemplateCategory;
  description?: string | null;
  subjectTemplate: string;
  bodyTemplate: string;
  isActive: boolean;
  isSystemTemplate: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateEmailTemplateInput {
  name: string;
  category: EmailTemplateCategory;
  description?: string;
  subjectTemplate: string;
  bodyTemplate: string;
  isActive?: boolean;
}

export interface UpdateEmailTemplateInput {
  name?: string;
  category?: EmailTemplateCategory;
  description?: string;
  subjectTemplate?: string;
  bodyTemplate?: string;
  isActive?: boolean;
}

export type EmailDraftStatus = 'prepared' | 'gmail_opened' | 'sent_unconfirmed' | 'cancelled';

export interface EmailDraft {
  id: string;
  ownerUserId: string;
  employeeId?: number | null;
  templateId?: string | null;
  lifecycleEvent: string;
  recipientEmail: string;
  recipientName?: string | null;
  subjectSnapshot: string;
  bodySnapshot: string;
  status: EmailDraftStatus;
  preparedAt: string;
  gmailOpenedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  employeeName?: string | null;
  employeeCode?: string | null;
  templateName?: string | null;
}

export interface PreviewDraftInput {
  employeeId?: number;
  candidateName?: string;
  candidateEmail?: string;
  templateId?: string;
  subjectTemplate?: string;
  bodyTemplate?: string;
  customValues?: Record<string, string>;
}

export interface CreateDraftInput {
  employeeId?: number;
  candidateName?: string;
  candidateEmail?: string;
  templateId?: string | null;
  lifecycleEvent?: string;
  recipientEmail?: string;
  recipientName?: string;
  subjectSnapshot: string;
  bodySnapshot: string;
  status?: EmailDraftStatus;
  customValues?: Record<string, string>;
}

export interface PreviewDraftResult {
  recipientEmail: string;
  recipientName: string;
  subject: string;
  body: string;
  detectedPlaceholders: string[];
  missingPlaceholders: string[];
  unresolvedPlaceholders: string[];
  hasCompanyProfile: boolean;
}

export type ExitInterviewStatus = 'PENDING' | 'OPENED' | 'COMPLETED' | 'REVOKED' | 'EXPIRED';

export interface QuestionnaireMatrixRow {
  id: string;
  label: string;
  required?: boolean;
}

export interface QuestionnaireQuestion {
  id: string;
  label: string;
  description?: string;
  type:
    | 'text'
    | 'textarea'
    | 'email'
    | 'phone'
    | 'number'
    | 'date'
    | 'radio'
    | 'checkbox'
    | 'dropdown'
    | 'rating'
    | 'rating_matrix'
    | 'declaration'
    | 'yes_no';
  required: boolean;
  options?: string[];
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
  matrixRows?: QuestionnaireMatrixRow[];
  placeholder?: string;
  orderIndex?: number;
}

export interface QuestionnaireSection {
  id: string;
  title: string;
  description?: string;
  orderIndex?: number;
  questions: QuestionnaireQuestion[];
}

export interface ExitQuestionnaireSchema {
  introduction?: string;
  sections: QuestionnaireSection[];
}

export interface ExitInterviewTemplate {
  id: string;
  name: string;
  description: string | null;
  version: number;
  isDefault: boolean;
  isSystemTemplate: boolean;
}

export interface CompanyExitTemplateDetail {
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
}

export interface ExitInterviewRecord {
  id: string;
  employeeId: number;
  offboardingId?: number | null;
  status: ExitInterviewStatus;
  expiresAt: string;
  invitationStatus: 'NOT_PREPARED' | 'PREPARED' | 'GMAIL_OPENED' | 'SENT_UNCONFIRMED';
  completedAt: string | null;
  createdAt: string;
  firstName: string;
  lastName: string | null;
  employeeCode: string;
  departmentName: string | null;
  designationName?: string | null;
  templateName: string;
  templateVersion?: number;
  shortCode?: string | null;
  shortUrl?: string;
  publicUrl?: string;
  responseDueDate?: string | null;
}

export interface ExitInterviewDetail extends ExitInterviewRecord {
  template: { name: string; version: number; description?: string | null; schema?: ExitQuestionnaireSchema };
  workEmail: string | null;
  reopenedAt?: string | null;
  answersJson?: any;
  rawResponsePayload?: any;
}

export interface ExitResponseQuestionDetail {
  id: string;
  label: string;
  type: string;
  matrixRows?: QuestionnaireMatrixRow[];
  rawAnswer: any;
  displayAnswer: string;
}

export interface ExitResponseSectionDetail {
  id: string;
  title: string;
  description?: string;
  questions: ExitResponseQuestionDetail[];
}

export interface ExitResponseDetail {
  interviewId: string;
  employee: {
    id: number;
    name: string;
    code: string;
    designation: string;
    department: string;
    hireDate: string;
    exitDate: string;
    workEmail?: string | null;
  };
  company: {
    name: string;
    logoUrl?: string | null;
    brandPrimaryColor: string;
  };
  template: {
    name: string;
    version: number;
  };
  submissionDate: string | null;
  sections: ExitResponseSectionDetail[];
  rawAnswers: Record<string, any>;
}

export interface PublicFormPayload {
  status: 'ACTIVE' | 'NOT_FOUND' | 'CANCELLED' | 'EXPIRED' | 'COMPLETED';
  invitationId?: string;
  shortCode?: string;
  expiresAt?: string;
  responseDueDate?: string | null;
  company?: {
    companyName: string;
    displayName: string | null;
    logoUrl: string | null;
    brandPrimaryColor: string;
    hrContactName: string | null;
    hrContactEmail: string | null;
    departmentTeam: string | null;
    companyWebsite: string | null;
  };
  employee?: {
    name: string;
    employeeCode: string;
    designation: string;
    department: string;
    hireDate: string | null;
    exitDate: string | null;
    workEmail: string | null;
  };
  template?: {
    id: string;
    name: string;
    version: number;
    schema: ExitQuestionnaireSchema;
  };
}

export interface ExitInterviewLinkResult {
  id: string;
  status: ExitInterviewStatus;
  expiresAt: string;
  publicUrl: string;
  token: string;
  shortCode?: string;
  shortUrl?: string;
}

export interface ExitInterviewResponse {
  id: string;
  questionId: string;
  answer: any;
  submittedAt: string;
}

export interface ExitInterviewEvaluation {
  interviewId?: string;
  interviewerName?: string | null;
  interviewDate?: string | null;
  interviewMode?: 'in_person' | 'video' | 'phone' | 'other' | null;
  reasonCategory?: string | null;
  regrettableExit?: boolean | null;
  rehireEligibility?: 'eligible' | 'not_eligible' | 'conditional' | 'undetermined' | null;
  hrObservations?: string | null;
  actionItems?: string[];
  hrSignature?: string | null;
  updatedBy?: string | null;
  updatedAt?: string;
}
