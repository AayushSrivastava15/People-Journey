import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import type {
  Employee,
  PaginatedResponse,
  Department,
  Designation,
  DashboardStats,
  PersonalDashboardData,
  AppUser,
  CreateEmployeePayload,
  UpdateEmployeePayload,
  OffboardEmployeePayload,
  CompanyProfile,
  CompanyOnboardingStatus,
  UpsertCompanyProfileInput,
  EmailTemplate,
  CreateEmailTemplateInput,
  UpdateEmailTemplateInput,
  EmailDraft,
  PreviewDraftInput,
  PreviewDraftResult,
  CreateDraftInput,
  EmailDraftStatus,
  ExitInterviewTemplate,
  CompanyExitTemplateDetail,
  ExitQuestionnaireSchema,
  ExitInterviewRecord,
  ExitInterviewDetail,
  ExitResponseDetail,
  ExitInterviewLinkResult,
  ExitInterviewResponse,
  ExitInterviewEvaluation,
  UserNotificationItem,
  UserNotificationsResponse,
} from '../types/api';

export const QUERY_KEYS = {
  dashboardStats: ['dashboard', 'stats'] as const,
  personalDashboard: ['dashboard', 'me'] as const,
  userProfile: ['users', 'me'] as const,
  users: ['auth', 'users'] as const,
  employees: (params?: Record<string, unknown>) => ['employees', params || {}] as const,
  departments: ['departments'] as const,
  designations: ['designations'] as const,
  companyProfile: ['company-profile'] as const,
  companyOnboardingStatus: ['company-profile', 'onboarding-status'] as const,
  emailTemplates: (category?: string) => ['email-templates', category || 'all'] as const,
  emailDrafts: (params?: Record<string, unknown>) => ['email-drafts', params || {}] as const,
  exitInterviewTemplates: ['exit-interviews', 'templates'] as const,
  companyExitTemplate: ['exit-interviews', 'company-template'] as const,
  exitInterviews: (params?: Record<string, unknown>) => ['exit-interviews', params || {}] as const,
  exitInterview: (id: string) => ['exit-interviews', id] as const,
  exitResponseDetail: (id: string) => ['exit-interviews', 'responses', id] as const,
  notifications: ['notifications'] as const,
};

export function usePersonalDashboard() {
  return useQuery({
    queryKey: QUERY_KEYS.personalDashboard,
    queryFn: async () => {
      const res = await apiClient<{ success: boolean; data: PersonalDashboardData }>('/dashboard/me');
      return res.data;
    },
    staleTime: 60000,
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: QUERY_KEYS.notifications,
    queryFn: async () => {
      const res = await apiClient<{ success: boolean; data: UserNotificationsResponse }>('/notifications');
      return res.data;
    },
    staleTime: 15000,
    refetchInterval: 30000,
  });
}

export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      return apiClient<{ success: boolean }>(`/notifications/${id}/read`, {
        method: 'PATCH',
      });
    },
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.notifications });
      const previous = queryClient.getQueryData<UserNotificationsResponse>(QUERY_KEYS.notifications);
      if (previous) {
        queryClient.setQueryData<UserNotificationsResponse>(QUERY_KEYS.notifications, {
          ...previous,
          unreadCount: Math.max(0, previous.unreadCount - 1),
          notifications: previous.notifications.map(n => (n.id === id ? { ...n, isRead: true } : n)),
        });
      }
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEYS.notifications, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notifications });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.personalDashboard });
    },
  });
}

export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      return apiClient<{ success: boolean; updatedCount: number }>('/notifications/mark-all-read', {
        method: 'PATCH',
      });
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.notifications });
      const previous = queryClient.getQueryData<UserNotificationsResponse>(QUERY_KEYS.notifications);
      if (previous) {
        queryClient.setQueryData<UserNotificationsResponse>(QUERY_KEYS.notifications, {
          ...previous,
          unreadCount: 0,
          notifications: previous.notifications.map(n => ({ ...n, isRead: true })),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEYS.notifications, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notifications });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.personalDashboard });
    },
  });
}

// ----------------------------------------------------------------------
// Exit interviews
// ----------------------------------------------------------------------

export function useExitInterviewTemplates() {
  return useQuery({
    queryKey: QUERY_KEYS.exitInterviewTemplates,
    queryFn: async () => (await apiClient<{ success: boolean; data: ExitInterviewTemplate[] }>('/exit-interviews/templates')).data,
  });
}

export function useCompanyExitTemplate() {
  return useQuery({
    queryKey: QUERY_KEYS.companyExitTemplate,
    queryFn: async () => {
      const res = await apiClient<{ success: boolean; data: CompanyExitTemplateDetail }>('/exit-interviews/template');
      return res.data;
    },
    staleTime: 30000,
  });
}

export function useUpdateTemplateDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name?: string; description?: string | null; schema: ExitQuestionnaireSchema }) =>
      (await apiClient<{ success: boolean; data: any }>('/exit-interviews/template', {
        method: 'PUT',
        body: JSON.stringify(payload),
      })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.companyExitTemplate });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.exitInterviewTemplates });
    },
  });
}

export function usePublishTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { changeSummary?: string | null }) =>
      (await apiClient<{ success: boolean; data: any }>('/exit-interviews/template/publish', {
        method: 'POST',
        body: JSON.stringify(payload),
      })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.companyExitTemplate });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.exitInterviewTemplates });
    },
  });
}

export function useResetTemplateToDefault() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await apiClient<{ success: boolean; data: CompanyExitTemplateDetail }>('/exit-interviews/template/reset-default', {
        method: 'POST',
      })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.companyExitTemplate });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.exitInterviewTemplates });
    },
  });
}

export function useExitResponseDetail(interviewId?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.exitResponseDetail(interviewId || ''),
    enabled: !!interviewId,
    queryFn: async () => {
      const res = await apiClient<{ success: boolean; data: ExitResponseDetail }>(`/exit-interviews/responses/${interviewId}`);
      return res.data;
    },
  });
}

export function useExitInterviews(params: { page?: number; limit?: number; employeeId?: number; status?: string; departmentId?: number; from?: string; to?: string } = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') query.set(key, String(value));
  const suffix = query.toString();
  return useQuery({
    queryKey: QUERY_KEYS.exitInterviews(params),
    queryFn: () => apiClient<{ success: boolean; data: ExitInterviewRecord[]; total: number; page: number; limit: number }>(`/exit-interviews${suffix ? `?${suffix}` : ''}`),
  });
}

export function useExitInterview(id?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.exitInterview(id || ''),
    enabled: !!id,
    queryFn: async () => (await apiClient<{ success: boolean; data: ExitInterviewDetail }>(`/exit-interviews/${id}`)).data,
  });
}

function invalidateExitInterviews(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['exit-interviews'] });
  queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notifications });
}

export function useCreateExitInterview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { employeeId: number; offboardingId?: number; templateId: string; expiryDays: number; responseDueDate?: string | null }) =>
      (await apiClient<{ success: boolean; data: ExitInterviewLinkResult }>('/exit-interviews', { method: 'POST', body: JSON.stringify(payload) })).data,
    onSuccess: () => invalidateExitInterviews(queryClient),
  });
}

export function useRegenerateExitInterview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, expiryDays }: { id: string; expiryDays?: number }) =>
      (await apiClient<{ success: boolean; data: ExitInterviewLinkResult }>(`/exit-interviews/${id}/regenerate`, {
        method: 'POST',
        body: JSON.stringify({ expiryDays: expiryDays ?? 14 }),
      })).data,
    onSuccess: () => invalidateExitInterviews(queryClient),
  });
}

export function useRevokeExitInterview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient<{ success: boolean }>(`/exit-interviews/${id}/revoke`, { method: 'POST' }),
    onSuccess: () => invalidateExitInterviews(queryClient),
  });
}

export function useReopenExitInterview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, expiryDays }: { id: string; expiryDays: number }) =>
      (await apiClient<{ success: boolean; data: ExitInterviewLinkResult }>(`/exit-interviews/${id}/reopen`, { method: 'POST', body: JSON.stringify({ confirm: true, expiryDays }) })).data,
    onSuccess: () => invalidateExitInterviews(queryClient),
  });
}

export function useExitInterviewResponses(id?: string) {
  return useQuery({
    queryKey: ['exit-interviews', id, 'responses'],
    enabled: !!id,
    queryFn: async () => (await apiClient<{ success: boolean; data: ExitInterviewResponse[] }>(`/exit-interviews/${id}/responses`)).data,
  });
}

export function useExitInterviewEvaluation(id?: string) {
  return useQuery({
    queryKey: ['exit-interviews', id, 'evaluation'], enabled: !!id,
    queryFn: async () => (await apiClient<{ success: boolean; data: ExitInterviewEvaluation | null }>(`/exit-interviews/${id}/evaluation`)).data,
  });
}

export function useUpdateExitInterviewEvaluation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: ExitInterviewEvaluation }) =>
      (await apiClient<{ success: boolean; data: ExitInterviewEvaluation }>(`/exit-interviews/${id}/evaluation`, { method: 'PUT', body: JSON.stringify(payload) })).data,
    onSuccess: (_data, variables) => queryClient.invalidateQueries({ queryKey: ['exit-interviews', variables.id, 'evaluation'] }),
  });
}

export function useUserProfile() {
  return useQuery({
    queryKey: QUERY_KEYS.userProfile,
    queryFn: async () => {
      const res = await apiClient<{ success: boolean; data: AppUser }>('/users/me');
      return res.data;
    },
    staleTime: 60000,
  });
}

export function useUpdateUserProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { displayName?: string; photoUrl?: string; preferences?: Record<string, unknown> }) =>
      apiClient<{ success: boolean; data: AppUser }>('/users/me', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userProfile });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.personalDashboard });
    },
  });
}

export function useDashboardStats() {
  return useQuery({
    queryKey: QUERY_KEYS.dashboardStats,
    queryFn: () => apiClient<DashboardStats>('/dashboard/stats'),
    staleTime: 60000,
  });
}

export function useEmployees(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  departmentId?: number;
}) {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.set('page', String(params.page));
  if (params.limit) queryParams.set('limit', String(params.limit));
  if (params.search) queryParams.set('search', params.search);
  if (params.status && params.status !== 'All' && params.status !== 'All statuses') {
    queryParams.set('status', params.status);
  }
  if (params.departmentId) queryParams.set('departmentId', String(params.departmentId));

  const queryString = queryParams.toString();
  const endpoint = queryString ? `/employees?${queryString}` : '/employees';

  return useQuery({
    queryKey: QUERY_KEYS.employees(params),
    queryFn: () => apiClient<PaginatedResponse<Employee>>(endpoint),
    staleTime: 60000,
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: QUERY_KEYS.departments,
    queryFn: () => apiClient<Department[]>('/departments'),
    staleTime: 60000,
  });
}

export function useDesignations() {
  return useQuery({
    queryKey: QUERY_KEYS.designations,
    queryFn: () => apiClient<Designation[]>('/designations'),
    staleTime: 60000,
  });
}

export function useCreateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateEmployeePayload) =>
      apiClient<Employee>('/employees', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardStats });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.departments });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notifications });
    },
  });
}

export function useUpdateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      employeeId,
      payload,
    }: {
      employeeId: number;
      payload: UpdateEmployeePayload;
    }) =>
      apiClient<Employee>(`/employees/${employeeId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardStats });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.departments });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.personalDashboard });
    },
  });
}

export function useOffboardEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      employeeId,
      payload,
    }: {
      employeeId: number | string;
      payload: OffboardEmployeePayload;
    }) =>
      apiClient<{ employee: Employee; offboardingId: number }>(`/employees/${employeeId}/offboard`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardStats });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.departments });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notifications });
    },
  });
}

// ----------------------------------------------------------------------
// Company Profile Hooks
// ----------------------------------------------------------------------

export function useCompanyProfile() {
  return useQuery({
    queryKey: QUERY_KEYS.companyProfile,
    queryFn: async () => {
      const res = await apiClient<{ success: boolean; data: CompanyProfile | null }>('/company-profile');
      return res.data;
    },
    staleTime: 60000,
  });
}

export function useCompanyOnboardingStatus() {
  return useQuery({
    queryKey: QUERY_KEYS.companyOnboardingStatus,
    queryFn: async () => {
      const res = await apiClient<{ success: boolean; data: CompanyOnboardingStatus }>('/company-profile/onboarding-status');
      return res.data;
    },
    staleTime: 30000,
  });
}

export function useUpdateCompanyProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpsertCompanyProfileInput) =>
      apiClient<{ success: boolean; data: CompanyProfile }>('/company-profile', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.companyProfile });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.companyOnboardingStatus });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.companyExitTemplate });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.exitInterviewTemplates });
    },
  });
}

// ----------------------------------------------------------------------
// Email Templates Hooks
// ----------------------------------------------------------------------

export function useEmailTemplates(category?: string) {
  const queryParams = new URLSearchParams();
  if (category && category !== 'All' && category !== 'All Categories') {
    queryParams.set('category', category);
  }
  const queryString = queryParams.toString();
  const endpoint = queryString ? `/email-templates?${queryString}` : '/email-templates';

  return useQuery({
    queryKey: QUERY_KEYS.emailTemplates(category),
    queryFn: async () => {
      const res = await apiClient<{ success: boolean; data: EmailTemplate[] }>(endpoint);
      return res.data;
    },
    staleTime: 60000,
  });
}

export function useCreateEmailTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateEmailTemplateInput) =>
      apiClient<{ success: boolean; data: EmailTemplate }>('/email-templates', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
    },
  });
}

export function useUpdateEmailTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateEmailTemplateInput }) =>
      apiClient<{ success: boolean; data: EmailTemplate }>(`/email-templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
    },
  });
}

export function useDuplicateEmailTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ success: boolean; data: EmailTemplate }>(`/email-templates/${id}/duplicate`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
    },
  });
}

export function useDeleteEmailTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ success: boolean; message: string }>(`/email-templates/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
    },
  });
}

// ----------------------------------------------------------------------
// Email Drafts & Gmail Workflow Hooks
// ----------------------------------------------------------------------

export function useEmailDrafts(params: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
} = {}) {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.set('page', String(params.page));
  if (params.limit) queryParams.set('limit', String(params.limit));
  if (params.status && params.status !== 'All') queryParams.set('status', params.status);
  if (params.search) queryParams.set('search', params.search);

  const queryString = queryParams.toString();
  const endpoint = queryString ? `/email-drafts?${queryString}` : '/email-drafts';

  return useQuery({
    queryKey: QUERY_KEYS.emailDrafts(params),
    queryFn: async () => {
      return apiClient<{
        success: boolean;
        data: EmailDraft[];
        total: number;
        page: number;
        limit: number;
      }>(endpoint);
    },
    staleTime: 30000,
  });
}

export function usePreviewEmailDraft() {
  return useMutation({
    mutationFn: (payload: PreviewDraftInput) =>
      apiClient<{ success: boolean; data: PreviewDraftResult }>('/email-drafts/preview', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  });
}

export function useCreateEmailDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateDraftInput) => {
      const res = await apiClient<{ success: boolean; data: EmailDraft }>('/email-drafts', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-drafts'] });
    },
  });
}

export function useUpdateDraftStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
      recordGmailOpen,
    }: {
      id: string;
      status: EmailDraftStatus;
      recordGmailOpen?: boolean;
    }) => {
      const res = await apiClient<{ success: boolean; data: EmailDraft }>(`/email-drafts/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, gmailOpened: !!recordGmailOpen }),
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-drafts'] });
    },
  });
}

