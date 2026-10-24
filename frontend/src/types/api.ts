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

export interface OffboardEmployeePayload {
  plannedExitDate: string;
  lastWorkingDay?: string;
  noticeDate?: string;
  exitReason?: string;
  notes?: string;
  contactEmail?: string;
}
