export type LifecycleStatus = 'Active' | 'Onboarding' | 'Offboarding' | 'Exited';
export type NoticeStatus = 'Pending' | 'Processing' | 'Sent' | 'Failed' | 'Cancelled';
export type AppRole = 'user';

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
  phone: string | null;
  departmentId: number | null;
  designationId: number | null;
  departmentName: string | null;
  designationName: string | null;
  employmentStatus: 'ACTIVE' | 'ONBOARDING' | 'OFFBOARDING' | 'EXITED';
  status: LifecycleStatus;
  hireDate: string;
  exitDate: string | null;
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
  userId: string;
  title: string;
  message: string;
  type: 'offboarding' | 'onboarding' | 'exit_management' | 'info' | string;
  isRead: boolean;
  createdAt: string;
}

export interface UserNotificationsResponse {
  notifications: UserNotificationItem[];
  unreadCount: number;
  total: number;
}

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
  departmentId?: number;
  department?: string;
  designationId?: number;
  designation?: string;
  manager?: string;
  employmentStatus?: string;
  hireDate: string;
  joiningDate?: string;
  exitDate?: string | null;
  lastWorkingDay?: string | null;
}

export interface UpdateEmployeePayload {
  firstName?: string;
  lastName?: string;
  workEmail?: string;
  phone?: string;
  departmentId?: number | null;
  designationId?: number | null;
  employmentStatus?: string;
  hireDate?: string;
  exitDate?: string | null;
}

export interface OffboardEmployeePayload {
  plannedExitDate: string;
  lastWorkingDay?: string;
  noticeDate?: string;
  exitReason?: string;
  notes?: string;
  contactEmail?: string;
}

export interface CompanyProfile {
  id: string;
  ownerUserId: string;
  companyName: string;
  hrContactName?: string | null;
  hrContactEmail?: string | null;
  companyAddress?: string | null;
  officeLocation?: string | null;
  hrContactPhone?: string | null;
  defaultSenderName?: string | null;
  defaultEmailSignature?: string | null;
  companyWebsite?: string | null;
  departmentTeam?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpsertCompanyProfileInput {
  companyName: string;
  hrContactName?: string;
  hrContactEmail?: string;
  companyAddress?: string;
  officeLocation?: string;
  hrContactPhone?: string;
  defaultSenderName?: string;
  defaultEmailSignature?: string;
  companyWebsite?: string;
  departmentTeam?: string;
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

export interface PreviewDraftResult {
  recipientEmail: string;
  recipientName: string;
  subject: string;
  body: string;
  detectedPlaceholders: string[];
  missingPlaceholders: string[];
  unresolvedPlaceholders: string[];
  hasCompanyProfile: boolean;
  companyName?: string;
}

export interface CreateDraftInput {
  employeeId?: number;
  templateId?: string;
  lifecycleEvent: string;
  recipientEmail: string;
  recipientName?: string;
  subjectSnapshot: string;
  bodySnapshot: string;
  status?: EmailDraftStatus;
}

export type ExitInterviewStatus = 'PENDING' | 'OPENED' | 'COMPLETED' | 'REVOKED' | 'EXPIRED';

export interface ExitInterviewTemplate {
  id: string;
  name: string;
  description: string | null;
  version: number;
  isDefault: boolean;
  isSystemTemplate: boolean;
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
  shortCode?: string | null;
  shortUrl?: string;
  publicUrl?: string;
  responseDueDate?: string | null;
}

export interface ExitInterviewDetail extends ExitInterviewRecord {
  template: { name: string; version: number; description?: string | null; schema?: ExitInterviewSchema };
  workEmail: string | null;
  reopenedAt?: string | null;
  googleFormResponseId?: string | null;
  rawResponsePayload?: any;
}

export interface ExitInterviewQuestion {
  id: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
}

export interface ExitInterviewSchema {
  introduction?: string;
  sections?: Array<{ id: string; title: string; description?: string; questions: ExitInterviewQuestion[] }>;
}

export interface ExitInterviewLinkResult {
  id: string;
  status: ExitInterviewStatus;
  expiresAt: string;
  publicUrl: string;
  token: string;
  shortCode?: string;
  shortUrl?: string;
  responseDueDate?: string | null;
}

export interface ExitInterviewResponse {
  submissionId: string;
  questionId: string;
  answer: unknown;
  submittedAt: string;
}

export interface ExitInterviewEvaluation {
  interviewerName?: string | null;
  interviewDate?: string | null;
  interviewMode?: 'in_person' | 'video' | 'phone' | 'other' | null;
  reasonCategory?: string | null;
  regrettableExit?: boolean | null;
  rehireEligibility?: 'eligible' | 'not_eligible' | 'conditional' | 'undetermined' | null;
  hrObservations?: string | null;
  actionItems?: string[];
  hrSignature?: string | null;
  updatedAt?: string;
}

