export type LifecycleStatus = 'Active' | 'Onboarding' | 'Offboarding' | 'Exited';
export type NoticeStatus = 'Pending' | 'Processing' | 'Sent' | 'Failed' | 'Cancelled';

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
  createdBy?: number | null;
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
