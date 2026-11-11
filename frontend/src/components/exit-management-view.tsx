import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ClipboardCheck,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Layers,
  Link2,
  ListFilter,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  X,
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import {
  useCreateExitInterview,
  useDepartments,
  useEmployees,
  useExitInterview,
  useExitInterviewEvaluation,
  useExitInterviewResponses,
  useExitInterviews,
  useExitInterviewTemplates,
  useRegenerateExitInterview,
  useReopenExitInterview,
  useRevokeExitInterview,
  useUpdateExitInterviewEvaluation,
} from '@/api/queries';
import { DatePicker } from '@/components/ui/date-picker';
import type {
  ExitInterviewDetail,
  ExitInterviewEvaluation,
  ExitInterviewLinkResult,
  ExitInterviewRecord,
} from '@/types/api';
import { ApiError, buildApiUrl } from '@/api/client';
import { auth } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { EmailPreparationDialog } from '@/components/email-preparation-dialog';
import { TemplateEditorDialog } from '@/components/template-editor-dialog';
import { ResponseDetailDialog } from '@/components/exit-response-detail-dialog';
import { AnimatedSelect } from '@/components/ui/animated-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const date = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date(value))
    : '—';

const displayStatus = (status: string) =>
  ({
    PENDING: 'Not Started',
    OPENED: 'In Progress',
    COMPLETED: 'Completed',
    EXPIRED: 'Expired',
    REVOKED: 'Cancelled',
  }[status] || status);

const statusClass = (status: string) => {
  switch (status) {
    case 'COMPLETED':
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    case 'OPENED':
      return 'bg-sky-50 text-sky-700 border border-sky-200';
    case 'PENDING':
      return 'bg-amber-50 text-amber-700 border border-amber-200';
    case 'EXPIRED':
      return 'bg-stone-100 text-stone-600 border border-stone-200';
    case 'REVOKED':
    default:
      return 'bg-rose-50 text-rose-700 border border-rose-200';
  }
};

const inviteLabel = (status: string) =>
  ({
    NOT_PREPARED: 'Not prepared',
    PREPARED: 'Draft prepared',
    GMAIL_OPENED: 'Gmail opened',
    SENT_UNCONFIRMED: 'Manually sent',
  }[status] || status);

function Heading({
  responses,
  onCreate,
  onCustomizeTemplate,
  onExportExcel,
  onExportCsv,
  isExporting,
}: {
  responses: boolean;
  onCreate?: () => void;
  onCustomizeTemplate?: () => void;
  onExportExcel?: () => void;
  onExportCsv?: () => void;
  isExporting?: boolean;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-bold tracking-widest text-[#b67c90] uppercase">Exit Management</p>
        <h1 className="mt-1 text-2xl font-bold text-stone-800">
          {responses ? 'Interview Responses' : 'Exit Interviews'}
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          {responses
            ? 'Review submitted employee feedback collected via our hosted People Journey questionnaire.'
            : 'Generate employee-specific survey links and track feedback collection through completion.'}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {responses ? (
          <>
            <button
              type="button"
              className="secondary-action text-xs"
              disabled={isExporting}
              onClick={onExportExcel}
            >
              {isExporting ? <Loader2 size={14} className="animate-spin mr-1" /> : <FileSpreadsheet size={14} className="mr-1" />}
              Export Excel (.xlsx)
            </button>
            <button
              type="button"
              className="secondary-action text-xs"
              disabled={isExporting}
              onClick={onExportCsv}
            >
              {isExporting ? <Loader2 size={14} className="animate-spin mr-1" /> : <Download size={14} className="mr-1" />}
              Export CSV
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="secondary-action text-xs"
              onClick={onCustomizeTemplate}
            >
              <Layers size={14} className="mr-1" /> Customize Feedback Form
            </button>
            {onCreate && (
              <button type="button" className="primary-action text-xs" onClick={onCreate}>
                <Plus size={16} className="mr-1" /> Create Exit Interview
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function ExitManagementView({ mode }: { mode: 'records' | 'responses' }) {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [templateEditorMode, setTemplateEditorMode] = useState<'editor' | 'preview'>('editor');
  const [isExporting, setIsExporting] = useState(false);

  const { data: departments = [] } = useDepartments();
  const { data, isLoading, isError } = useExitInterviews({
    page,
    limit: 20,
    status: status || undefined,
    departmentId: departmentId ? Number(departmentId) : undefined,
  });

  const handleExport = async (format: 'excel' | 'csv') => {
    try {
      setIsExporting(true);
      const url = buildApiUrl(`/exit-interviews/export/${format}`);
      const headers = new Headers();
      if (auth.currentUser) {
        const token = await auth.currentUser.getIdToken();
        if (token) headers.set('Authorization', `Bearer ${token}`);
      }
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const ext = format === 'excel' ? 'xlsx' : 'csv';
      a.download = `Exit_Interview_Responses_${new Date().toISOString().slice(0, 10)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
      toast({
        title: `${format === 'excel' ? 'Excel' : 'CSV'} export complete!`,
        description: 'File downloaded successfully.',
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Export failed',
        description: err instanceof Error ? err.message : 'Could not generate export file.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const rows = useMemo(
    () =>
      (data?.data || []).filter(row => {
        const matchesSearch = `${row.firstName} ${row.lastName || ''} ${row.employeeCode} ${row.templateName} ${row.shortCode || ''}`
          .toLowerCase()
          .includes(search.toLowerCase());
        return matchesSearch && (mode === 'records' || row.status === 'COMPLETED');
      }),
    [data, search, mode]
  );

  const metrics = useMemo(() => {
    const all = data?.data || [];
    const total = data?.total || 0;
    const done = all.filter(x => x.status === 'COMPLETED').length;
    const pending = all.filter(x => x.status === 'PENDING').length;
    const inProgress = all.filter(x => x.status === 'OPENED').length;
    const overdue = all.filter(x => x.status === 'EXPIRED').length;
    const cancelled = all.filter(x => x.status === 'REVOKED').length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, pending, inProgress, overdue, cancelled, pct };
  }, [data]);

  return (
    <>
      <Heading
        responses={mode === 'responses'}
        onCreate={mode === 'records' ? () => setCreateOpen(true) : undefined}
        onCustomizeTemplate={() => {
          setTemplateEditorMode('editor');
          setTemplateEditorOpen(true);
        }}
        onExportExcel={() => handleExport('excel')}
        onExportCsv={() => handleExport('csv')}
        isExporting={isExporting}
      />

      {mode === 'records' && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Total Invitations', metrics.total],
            ['Completed', metrics.done],
            ['Not Started', metrics.pending],
            ['In Progress', metrics.inProgress],
            ['Overdue', metrics.overdue],
            ['Completion Rate', `${metrics.pct}%`],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-xl border border-[#ebdada] bg-[#fffdfb] p-4 shadow-sm"
            >
              <span className="block text-xs font-medium text-stone-500">{label}</span>
              <b className="mt-1 block text-xl font-bold text-stone-800">{value}</b>
            </div>
          ))}
        </div>
      )}

      <section className="panel overflow-hidden p-0 border border-[#ebdada] bg-white rounded-xl">
        <div className="flex flex-wrap gap-3 border-b border-[#f0e4e6] p-4 bg-[#fffdfb]">
          <label className="flex min-w-56 flex-1 items-center gap-2 rounded-lg border border-stone-200 bg-white px-3">
            <Search size={15} className="text-stone-400" />
            <input
              aria-label="Search exit interviews"
              className="w-full border-0 bg-transparent py-2 text-xs outline-none"
              placeholder="Search employee, ID, short code, or template…"
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>

          <AnimatedSelect
            variant="filter"
            icon={<ListFilter size={13} />}
            value={status}
            onChange={val => {
              setStatus(val);
              setPage(1);
            }}
            options={[
              { value: '', label: 'All statuses' },
              { value: 'PENDING', label: 'Not Started' },
              { value: 'OPENED', label: 'In Progress' },
              { value: 'COMPLETED', label: 'Completed' },
              { value: 'EXPIRED', label: 'Expired' },
              { value: 'REVOKED', label: 'Cancelled' },
            ]}
          />

          <AnimatedSelect
            variant="filter"
            value={departmentId}
            onChange={val => {
              setDepartmentId(val);
              setPage(1);
            }}
            options={[
              { value: '', label: 'All departments' },
              ...departments.map(d => ({
                value: String(d.departmentId),
                label: d.departmentName,
              })),
            ]}
          />
        </div>

        {isLoading ? (
          <Loading />
        ) : isError ? (
          <Empty
            title="Could not load exit interviews"
            text="Please check your connection and try again."
          />
        ) : rows.length === 0 ? (
          <Empty
            title={mode === 'responses' ? 'No completed responses yet' : 'No exit interviews found'}
            text={
              mode === 'responses'
                ? 'Completed feedback submissions from the Google Form will appear here automatically.'
                : 'Create an exit interview to issue a unique survey link for departing personnel.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] text-left text-sm">
              <thead className="bg-[#fcf5f7] text-xs uppercase tracking-wide text-stone-500 border-b border-[#f0e4e6]">
                <tr>
                  <th className="p-4">Employee</th>
                  <th className="p-4">Department</th>
                  <th className="p-4">Survey Reference</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">
                    {mode === 'responses' ? 'Submitted Date' : 'Response Deadline'}
                  </th>
                  <th className="p-4">Invitation</th>
                  <th className="p-4 text-right" />
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr
                    className="border-t border-stone-100 hover:bg-[#fffbfc] transition-colors"
                    key={row.id}
                  >
                    <td className="p-4">
                      <b className="block text-stone-800 text-xs">
                        {row.firstName} {row.lastName || ''}
                      </b>
                      <span className="text-[11px] text-stone-500 font-mono">
                        {row.employeeCode}
                      </span>
                    </td>
                    <td className="p-4 text-xs text-stone-600">
                      {row.departmentName || '—'}
                    </td>
                    <td className="p-4 text-xs">
                      {row.shortCode ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-stone-100 font-mono text-[11px] text-stone-700">
                          /e/{row.shortCode}
                        </span>
                      ) : (
                        <span className="text-stone-400">—</span>
                      )}
                    </td>
                    <td className="p-4">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusClass(
                          row.status
                        )}`}
                      >
                        {displayStatus(row.status)}
                      </span>
                    </td>
                    <td className="p-4 text-xs text-stone-600">
                      {mode === 'responses'
                        ? date(row.completedAt)
                        : row.responseDueDate
                        ? date(row.responseDueDate)
                        : date(row.expiresAt)}
                    </td>
                    <td className="p-4 text-xs text-stone-600">
                      {inviteLabel(row.invitationStatus)}
                    </td>
                    <td className="p-4 text-right">
                      <button
                        className="text-action text-xs"
                        onClick={() => setSelectedId(row.id)}
                      >
                        {mode === 'responses' ? 'View Response' : 'Manage'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > data.limit && (
          <div className="flex items-center justify-between border-t border-stone-100 p-4 text-xs text-stone-500 bg-[#fffdfb]">
            <span>Page {data.page} of {Math.ceil(data.total / data.limit)}</span>
            <div className="flex gap-2">
              <button
                className="text-action"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <button
                className="text-action"
                disabled={data.data.length < data.limit}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      <CreateInterviewDialog open={createOpen} onOpenChange={setCreateOpen} />
      {mode === 'responses' ? (
        <ResponseDetailDialog
          id={selectedId}
          open={!!selectedId}
          onOpenChange={open => !open && setSelectedId(null)}
        />
      ) : (
        <InterviewDetailDialog
          id={selectedId}
          open={!!selectedId}
          onOpenChange={open => !open && setSelectedId(null)}
          initialTab="details"
        />
      )}
      <TemplateEditorDialog
        open={templateEditorOpen}
        onOpenChange={setTemplateEditorOpen}
        initialMode={templateEditorMode}
      />
    </>
  );
}

function CreateInterviewDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const { toast } = useToast();
  const { data: employeeResponse, isLoading: employeesLoading, isError: employeesError } =
    useEmployees({ limit: 100 });
  const { data: exitInterviewsList } = useExitInterviews({ limit: 100 });
  const {
    data: templates = [],
    isLoading: templatesLoading,
    isError: templatesError,
  } = useExitInterviewTemplates();

  const create = useCreateExitInterview();
  const regenerate = useRegenerateExitInterview();
  const [employeeId, setEmployeeId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [responseDueDate, setResponseDueDate] = useState('');
  const [expiryDays, setExpiryDays] = useState(14);
  const [result, setResult] = useState<ExitInterviewLinkResult | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);

  const employees = (employeeResponse?.data || []).filter(
    e => e.employmentStatus === 'OFFBOARDING' || e.employmentStatus === 'EXITED'
  );

  const selectedEmployee = employees.find(e => String(e.employeeId) === String(employeeId));
  const effectiveTemplateId = templateId || templates.find(t => t.isDefault)?.id || templates[0]?.id;
  const selectedTemplate = templates.find(t => t.id === effectiveTemplateId);

  const activeExistingInterview = useMemo(() => {
    if (!employeeId || !exitInterviewsList?.data) return null;
    return exitInterviewsList.data.find(
      i =>
        i.employeeId === Number(employeeId) &&
        (i.status === 'PENDING' || i.status === 'OPENED') &&
        (!i.expiresAt || new Date(i.expiresAt) > new Date())
    );
  }, [employeeId, exitInterviewsList]);

  useEffect(() => {
    if (!templateId && templates.length > 0) {
      setTemplateId(templates.find(t => t.isDefault)?.id || templates[0].id);
    }
  }, [templateId, templates]);

  const isPendingAction = create.isPending || regenerate.isPending;
  const canCreate = Boolean(
    employeeId && !isPendingAction && !employeesLoading
  );

  const submit = async () => {
    if (!canCreate) return;
    try {
      if (activeExistingInterview) {
        const r = await regenerate.mutateAsync({
          id: activeExistingInterview.id,
          expiryDays,
        });
        setResult(r);
        toast({
          title: 'Survey link regenerated!',
          description: 'Previous survey link was revoked. Your new survey link is ready to share.',
        });
        return;
      }

      const r = await create.mutateAsync({
        employeeId: Number(employeeId),
        templateId: effectiveTemplateId || undefined,
        expiryDays,
        responseDueDate: responseDueDate || null,
      });
      setResult(r);
      toast({
        title: 'Survey link generated!',
        description: 'New employee feedback survey link is ready to share.',
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Please try again.';
      const isConflict =
        message.toLowerCase().includes('active exit interview') ||
        message.toLowerCase().includes('active interview') ||
        message.toLowerCase().includes('conflict') ||
        message.includes('ACTIVE_INTERVIEW');
      toast({
        variant: 'destructive',
        title: isConflict ? 'Active survey link exists' : 'Could not create survey invitation',
        description: isConflict
          ? 'An active exit interview invitation already exists for this employee. Click "Revoke & Regenerate Fresh Link" to replace it with a new link.'
          : message || 'The survey link could not be generated. Please try again.',
      });
    }
  };

  const surveyUrl = useMemo(() => {
    const code = result?.shortCode;
    if (code && typeof window !== 'undefined' && window.location.origin) {
      return `${window.location.origin}/e/${code.trim()}`;
    }
    let raw = result?.shortUrl || result?.publicUrl || '';
    if (raw.includes(',')) {
      raw = raw.split(',')[0].trim();
    }
    if (raw && typeof window !== 'undefined' && window.location.origin) {
      raw = raw.replace(/^https?:\/\/localhost:\d+/, window.location.origin);
      if (raw.startsWith('/')) {
        raw = `${window.location.origin}${raw}`;
      }
    }
    return raw;
  }, [result]);

  const copy = async () => {
    if (surveyUrl) {
      await navigator.clipboard.writeText(surveyUrl);
      toast({
        title: 'Short URL copied!',
        description: 'The employee feedback survey link is ready to share.',
      });
    }
  };

  const close = () => {
    onOpenChange(false);
    setResult(null);
    setEmailOpen(false);
    setResponseDueDate('');
  };

  return (
    <>
      <Dialog open={open} onOpenChange={value => !value && close()}>
        <DialogContent
          className="max-w-xl border-[#ebdada] bg-[#fffdfb] p-0"
          onPointerDownOutside={e => {
            const target = e.target as HTMLElement;
            if (target?.closest?.('.animated-select-container') || target?.closest?.('[role="listbox"]')) {
              e.preventDefault();
            }
          }}
          onInteractOutside={e => {
            const target = e.target as HTMLElement;
            if (target?.closest?.('.animated-select-container') || target?.closest?.('[role="listbox"]')) {
              e.preventDefault();
            }
          }}
        >
          <div className="max-h-[85vh] overflow-y-auto p-6">
            <DialogHeader>
              <DialogTitle>
                {result ? 'Employee Survey Link Created' : 'Create Exit Interview'}
              </DialogTitle>
              <DialogDescription>
                {result
                  ? 'Share this personalized short survey link with the departing employee. It opens their native confidential exit questionnaire.'
                  : 'Select an eligible departing employee, a response deadline, and survey link validity.'}
              </DialogDescription>
            </DialogHeader>

            {result ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800 flex items-center gap-2">
                  <Check size={16} className="text-emerald-600 flex-shrink-0" />
                  <span>
                    <b>{selectedEmployee?.name}</b> · Link active for {expiryDays} days (Expires {date(result.expiresAt)})
                  </span>
                </div>

                <div className="rounded-xl border border-[#ebdada] bg-white p-4">
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wide">
                    Employee Feedback Short Link
                  </label>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      readOnly
                      value={surveyUrl}
                      className="w-full rounded-lg border border-stone-200 bg-stone-50 p-2.5 font-mono text-xs text-stone-800 outline-none select-all"
                    />
                    <button
                      type="button"
                      className="secondary-action whitespace-nowrap"
                      onClick={copy}
                    >
                      <Copy size={14} /> Copy
                    </button>
                    <button
                      type="button"
                      className="secondary-action whitespace-nowrap"
                      onClick={() => window.open(surveyUrl, '_blank')}
                      title="Open Feedback Survey in new tab"
                    >
                      <ExternalLink size={14} /> Open
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-stone-500">
                    This link opens their confidential feedback questionnaire, securely recorded in People Journey.
                  </p>
                </div>

                <DialogFooter className="mt-6 flex gap-2">
                  <button
                    type="button"
                    className="primary-action"
                    onClick={() => setEmailOpen(true)}
                  >
                    <Mail size={15} /> Prepare Invitation Email
                  </button>
                  <button type="button" className="text-action" onClick={close}>
                    Close
                  </button>
                </DialogFooter>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {/* 1. Employee selection */}
                <section className="rounded-xl border border-[#ebdada] bg-white p-4">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#b67c90]">
                    1. Departing Employee
                  </span>
                  {employeesLoading ? (
                    <div className="flex items-center gap-2 text-xs text-stone-500">
                      <Loader2 className="animate-spin" size={14} /> Loading eligible employees…
                    </div>
                  ) : employeesError ? (
                    <p className="text-xs text-rose-700">Could not load employees. Check connection.</p>
                  ) : employees.length === 0 ? (
                    <p className="text-xs text-stone-600">
                      No employees are currently marked as <b>Offboarding</b> or <b>Exited</b>. Move an employee to offboarding to generate an exit interview.
                    </p>
                  ) : (
                    <AnimatedSelect
                      id="departing-employee-select"
                      variant="form"
                      searchable
                      searchPlaceholder="Search employee name, code, or department…"
                      placeholder="Select an offboarding or exited employee"
                      value={employeeId}
                      onChange={val => setEmployeeId(val)}
                      options={[
                        { value: '', label: 'Select an offboarding or exited employee' },
                        ...employees.map(emp => {
                          const hasActive = exitInterviewsList?.data?.some(
                            i =>
                              i.employeeId === emp.employeeId &&
                              (i.status === 'PENDING' || i.status === 'OPENED') &&
                              (!i.expiresAt || new Date(i.expiresAt) > new Date())
                          );
                          return {
                            value: String(emp.employeeId),
                            label: `${emp.name} · ${emp.employeeCode}`,
                            subtext: `${emp.departmentName || 'General'} · ${emp.workEmail || 'No email registered'}`,
                            badge: hasActive ? 'Active Survey in Progress' : undefined,
                          };
                        }),
                      ]}
                    />
                  )}
                  {selectedEmployee && (
                    <div className="mt-3 rounded-lg bg-stone-50 p-2.5 text-xs text-stone-600 flex justify-between">
                      <span>Last Working Day: <b>{date(selectedEmployee.exitDate || selectedEmployee.lastWorkingDay)}</b></span>
                      <span>Email: <b>{selectedEmployee.workEmail || selectedEmployee.personalEmail || 'None'}</b></span>
                    </div>
                  )}

                  {/* Active interview notice & quick actions */}
                  {activeExistingInterview && (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-900 space-y-2">
                      <div className="flex items-center gap-1.5 font-bold text-amber-950">
                        <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                        <span>Active Survey Link Already Exists</span>
                      </div>
                      <p className="text-[11px] text-amber-800 leading-relaxed">
                        An active survey link (<b>{activeExistingInterview.shortCode ? `/e/${activeExistingInterview.shortCode}` : 'active'}</b>) was already created for this employee and is valid until <b>{date(activeExistingInterview.expiresAt)}</b>.
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        <button
                          type="button"
                          className="secondary-action text-xs px-2.5 py-1 bg-white hover:bg-stone-50"
                          onClick={() => {
                            const shortUrl = activeExistingInterview.shortCode
                              ? `${window.location.origin}/e/${activeExistingInterview.shortCode}`
                              : '';
                            if (shortUrl) {
                              navigator.clipboard.writeText(shortUrl);
                              toast({ title: 'Active survey link copied to clipboard!' });
                            }
                          }}
                        >
                          <Copy size={12} className="mr-1" /> Copy Active Link
                        </button>
                        <button
                          type="button"
                          className="secondary-action text-xs px-2.5 py-1 bg-white hover:bg-stone-50"
                          onClick={() => {
                            const shortUrl = activeExistingInterview.shortCode
                              ? `${window.location.origin}/e/${activeExistingInterview.shortCode}`
                              : '';
                            if (shortUrl) window.open(shortUrl, '_blank');
                          }}
                        >
                          <ExternalLink size={12} className="mr-1" /> Open Form
                        </button>
                      </div>
                    </div>
                  )}
                </section>

                {/* 2. Response Due Date */}
                <section className="rounded-xl border border-[#ebdada] bg-white p-4">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#b67c90]">
                    2. Response Due Date (Optional)
                  </span>
                  <div className="flex items-center gap-3">
                    <DatePicker
                      value={responseDueDate}
                      onChange={setResponseDueDate}
                      placeholder="Select target response due date (optional)"
                      className="w-full text-xs"
                    />
                  </div>
                  <span className="mt-1.5 block text-[11px] text-stone-500">
                    Target submission deadline for the feedback form. Leave empty if no strict deadline is required.
                  </span>
                </section>

                {/* 3. Link Expiry Period */}
                <section className="rounded-xl border border-[#ebdada] bg-[#fffbfb] p-4">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#b67c90]">
                    3. Link Validity: <span className="text-stone-800 normal-case">{expiryDays} days</span>
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="90"
                    value={expiryDays}
                    onChange={e => setExpiryDays(Number(e.target.value))}
                    className="mt-3 block w-full accent-[#b67c90]"
                  />
                  <span className="mt-1.5 block text-[11px] text-stone-500">
                    The short survey link will stop accepting responses after {expiryDays} days.
                  </span>
                </section>

                <DialogFooter className="mt-6 flex justify-end gap-2">
                  <button type="button" className="text-action text-xs" onClick={close}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="primary-action text-xs"
                    onClick={submit}
                    disabled={!canCreate}
                  >
                    {isPendingAction ? (
                      <>
                        <Loader2 className="animate-spin mr-1" size={14} /> Generating Link…
                      </>
                    ) : activeExistingInterview ? (
                      <>
                        <RefreshCw size={14} className="mr-1" /> Revoke & Regenerate Fresh Link
                      </>
                    ) : (
                      <>
                        <Link2 size={14} className="mr-1" /> Generate Survey Link
                      </>
                    )}
                  </button>
                </DialogFooter>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <EmailPreparationDialog
        isOpen={emailOpen}
        onClose={() => setEmailOpen(false)}
        initialEmployeeId={selectedEmployee?.employeeId}
        initialCategory="exit_interview"
        additionalCustomValues={
          result
            ? {
                exit_interview_link: surveyUrl,
                form_link: surveyUrl,
                response_due_date: responseDueDate,
                last_working_day: selectedEmployee?.exitDate || '',
              }
            : undefined
        }
      />
    </>
  );
}

function InterviewDetailDialog({
  id,
  open,
  onOpenChange,
  initialTab,
}: {
  id: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialTab: 'details' | 'responses' | 'evaluation';
}) {
  const { toast } = useToast();
  const { data: detail, isLoading } = useExitInterview(id || undefined);
  const { data: responses = [] } = useExitInterviewResponses(id || undefined);
  const { data: evaluation } = useExitInterviewEvaluation(id || undefined);

  const revoke = useRevokeExitInterview();
  const regenerate = useRegenerateExitInterview();
  const updateEvaluation = useUpdateExitInterviewEvaluation();

  const [tab, setTab] = useState<'details' | 'responses' | 'evaluation'>(initialTab);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<ExitInterviewEvaluation>>({});
  const [emailOpen, setEmailOpen] = useState(false);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const surveyUrl = useMemo(() => {
    const code = detail?.shortCode;
    if (code && typeof window !== 'undefined' && window.location.origin) {
      return `${window.location.origin}/e/${code.trim()}`;
    }
    let raw = detail?.shortUrl || detail?.publicUrl || '';
    if (raw.includes(',')) {
      raw = raw.split(',')[0].trim();
    }
    if (raw && typeof window !== 'undefined' && window.location.origin) {
      raw = raw.replace(/^https?:\/\/localhost:\d+/, window.location.origin);
      if (raw.startsWith('/')) {
        raw = `${window.location.origin}${raw}`;
      }
    }
    return raw;
  }, [detail]);

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast({ title: 'Link copied to clipboard!' });
  };

  const handleOpenForm = () => {
    if (surveyUrl) {
      window.open(surveyUrl, '_blank');
    }
  };

  const confirmRevoke = async () => {
    if (!id) return;
    if (
      !window.confirm(
        'Revoke this employee survey link? The short link will immediately stop accepting responses.'
      )
    )
      return;

    try {
      await revoke.mutateAsync(id);
      toast({ title: 'Survey link revoked successfully.' });
      onOpenChange(false);
    } catch {
      toast({ variant: 'destructive', title: 'Could not revoke link.' });
    }
  };

  const confirmRegenerate = async () => {
    if (!id) return;
    if (
      !window.confirm(
        'Regenerating creates a brand new survey link and immediately revokes the previous link. Any recipient with the old link will no longer be able to open it. Continue?'
      )
    )
      return;

    try {
      const res = await regenerate.mutateAsync({ id, expiryDays: 14 });
      toast({
        title: 'New survey link created!',
        description: 'Previous link revoked. New link is ready to share.',
      });
      const freshLink = res?.shortCode && typeof window !== 'undefined' && window.location.origin
        ? `${window.location.origin}/e/${res.shortCode.trim()}`
        : (res?.shortUrl || '').split(',')[0].trim();
      if (freshLink) {
        await navigator.clipboard.writeText(freshLink);
      }
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Could not regenerate link',
        description: e instanceof Error ? e.message : undefined,
      });
    }
  };

  const saveEvaluation = async () => {
    if (!id) return;
    try {
      await updateEvaluation.mutateAsync({ id, payload: form });
      setEditing(false);
      toast({ title: 'Evaluation saved successfully.' });
    } catch {
      toast({ variant: 'destructive', title: 'Could not save evaluation.' });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-3xl border-[#ebdada] bg-[#fffdfb] p-0"
          onPointerDownOutside={e => {
            const target = e.target as HTMLElement;
            if (target?.closest?.('.animated-select-container') || target?.closest?.('[role="listbox"]')) {
              e.preventDefault();
            }
          }}
          onInteractOutside={e => {
            const target = e.target as HTMLElement;
            if (target?.closest?.('.animated-select-container') || target?.closest?.('[role="listbox"]')) {
              e.preventDefault();
            }
          }}
        >
          <div className="max-h-[85vh] overflow-y-auto p-6">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-stone-800">
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="animate-spin" size={16} /> Loading interview…
                  </span>
                ) : (
                  `${detail?.firstName || ''} ${detail?.lastName || ''}`
                )}
              </DialogTitle>
              <DialogDescription>
                {detail?.employeeCode} · {detail?.departmentName || 'General'} ·{' '}
                {detail?.designationName || 'Team Member'}
              </DialogDescription>
            </DialogHeader>

            {detail && (
              <div className="mt-5 space-y-5">
                {/* Navigation Tabs */}
                <div className="flex gap-2 border-b border-stone-200">
                  {(['details', 'responses', 'evaluation'] as const).map(item => (
                    <button
                      key={item}
                      className={`border-b-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                        tab === item
                          ? 'border-[#b67c90] text-[#8c5369]'
                          : 'border-transparent text-stone-500 hover:text-stone-800'
                      }`}
                      onClick={() => {
                        setTab(item);
                        if (item === 'evaluation') setForm(evaluation || {});
                      }}
                    >
                      {item === 'details'
                        ? 'Survey Link & Details'
                        : item === 'responses'
                        ? `Responses (${detail.status === 'COMPLETED' ? 'Completed' : 'Pending'})`
                        : 'HR Evaluation'}
                    </button>
                  ))}
                </div>

                {/* TAB 1: DETAILS & DEDICATED EMPLOYEE FEEDBACK LINK SECTION */}
                {tab === 'details' && (
                  <div className="space-y-4">
                    {/* Dedicated Section: Employee Feedback Link (Part 6) */}
                    <div className="rounded-xl border border-[#ebdada] bg-white p-5 shadow-sm space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#b67c90] uppercase tracking-wider flex items-center gap-1.5">
                          <Link2 size={14} /> Employee Feedback Link
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusClass(
                            detail.status
                          )}`}
                        >
                          {displayStatus(detail.status)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          readOnly
                          value={surveyUrl || 'No short URL active'}
                          className="w-full rounded-lg border border-stone-200 bg-stone-50 p-2.5 font-mono text-xs text-stone-800 outline-none select-all"
                        />
                        <button
                          type="button"
                          className="secondary-action whitespace-nowrap text-xs"
                          onClick={() => copy(surveyUrl)}
                          disabled={!surveyUrl || detail.status === 'REVOKED'}
                        >
                          <Copy size={13} /> Copy Link
                        </button>
                        <button
                          type="button"
                          className="secondary-action whitespace-nowrap text-xs"
                          onClick={handleOpenForm}
                          disabled={!surveyUrl || detail.status === 'REVOKED'}
                        >
                          <ExternalLink size={13} /> Open Form
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center justify-between text-xs text-stone-500 pt-1">
                        <span>
                          Expires on: <b>{date(detail.expiresAt)}</b>
                          {detail.responseDueDate && (
                            <span className="ml-3">
                              Due Date: <b>{date(detail.responseDueDate)}</b>
                            </span>
                          )}
                        </span>
                        <span>
                          Reference Code: <b className="font-mono">{detail.shortCode || '—'}</b>
                        </span>
                      </div>

                      {/* Management Action Buttons */}
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-stone-100">
                        <button
                          type="button"
                          className="secondary-action text-xs"
                          onClick={() => setEmailOpen(true)}
                        >
                          <Mail size={13} /> Prepare Email Draft
                        </button>

                        <button
                          type="button"
                          className="secondary-action text-xs"
                          onClick={confirmRegenerate}
                          title="Generate a new link and revoke this one"
                        >
                          <RefreshCw size={13} /> Regenerate Link
                        </button>

                        {(detail.status === 'PENDING' || detail.status === 'OPENED') && (
                          <button
                            type="button"
                            className="text-action text-xs text-rose-700 bg-rose-50 border-rose-200"
                            onClick={confirmRevoke}
                          >
                            <Trash2 size={13} /> Revoke Link
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Metadata card */}
                    <div className="grid grid-cols-2 gap-3 rounded-xl bg-stone-50 p-4 text-xs border border-stone-200">
                      <div>
                        <span className="text-stone-500 block">Employee Code</span>
                        <b className="text-stone-800 font-mono">{detail.employeeCode}</b>
                      </div>
                      <div>
                        <span className="text-stone-500 block">Official Email</span>
                        <b className="text-stone-800">{detail.workEmail || 'Not recorded'}</b>
                      </div>
                      <div>
                        <span className="text-stone-500 block">Survey Invitation Status</span>
                        <b className="text-stone-800">{inviteLabel(detail.invitationStatus)}</b>
                      </div>
                      <div>
                        <span className="text-stone-500 block">Completion Timestamp</span>
                        <b className="text-stone-800">
                          {detail.completedAt ? date(detail.completedAt) : 'Pending response'}
                        </b>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: INTERVIEW RESPONSES (Part 8) */}
                {tab === 'responses' && (
                  <div className="space-y-4">
                    {/* Header Summary info */}
                    <div className="rounded-xl border border-[#ebdada] bg-[#fffdfb] p-4 text-xs space-y-2">
                      <div className="flex items-center justify-between border-b border-[#f0e4e6] pb-2">
                        <span className="font-bold text-stone-800 text-sm">
                          {detail.firstName} {detail.lastName || ''} ({detail.employeeCode})
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 font-semibold text-[11px] ${statusClass(
                            detail.status
                          )}`}
                        >
                          {displayStatus(detail.status)}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-stone-600">
                        <div>
                          <span className="text-stone-400 block">Department</span>
                          <b>{detail.departmentName || 'General'}</b>
                        </div>
                        <div>
                          <span className="text-stone-400 block">Designation</span>
                          <b>{detail.designationName || 'Team Member'}</b>
                        </div>
                        <div>
                          <span className="text-stone-400 block">Submission Date</span>
                          <b>{detail.completedAt ? date(detail.completedAt) : 'Not submitted'}</b>
                        </div>
                        <div>
                          <span className="text-stone-400 block">Invitation Reference</span>
                          <b className="font-mono">{detail.shortCode || '—'}</b>
                        </div>
                      </div>
                    </div>

                    {/* Actual Answers list */}
                    {detail.status !== 'COMPLETED' ? (
                      <Empty
                        title="Feedback not yet submitted"
                        text="This record is waiting for the employee to complete and submit the Infravision Google Form. As soon as submitted, the full response answers will appear here."
                      />
                    ) : responses.length > 0 ? (
                      <div className="space-y-3">
                        {responses.map((resp, i) => (
                          <div
                            key={i}
                            className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
                          >
                            <span className="text-xs font-semibold text-stone-700 block">
                              {resp.questionId}
                            </span>
                            <div className="mt-1 text-xs text-stone-800 font-medium whitespace-pre-wrap">
                              {Array.isArray(resp.answer)
                                ? resp.answer.join(', ')
                                : typeof resp.answer === 'object' && resp.answer !== null
                                ? JSON.stringify(resp.answer, null, 2)
                                : String(resp.answer || '—')}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : detail.rawResponsePayload?.answers ? (
                      <div className="space-y-3">
                        {Object.entries(detail.rawResponsePayload.answers).map(([q, ans], i) => (
                          <div
                            key={i}
                            className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
                          >
                            <span className="text-xs font-semibold text-stone-700 block">{q}</span>
                            <div className="mt-1 text-xs text-stone-800 font-medium whitespace-pre-wrap">
                              {Array.isArray(ans)
                                ? ans.join(', ')
                                : typeof ans === 'object' && ans !== null
                                ? JSON.stringify(ans, null, 2)
                                : String(ans || '—')}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl bg-stone-50 p-6 text-center text-xs text-stone-600">
                        Response recorded successfully from Google Forms.
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: HR EVALUATION */}
                {tab === 'evaluation' && (
                  <div className="space-y-4">
                    {editing ? (
                      <EvaluationForm value={form} onChange={setForm} />
                    ) : (
                      <div className="rounded-xl bg-stone-50 p-4 text-xs text-stone-700 space-y-2 border border-stone-200">
                        <p>
                          <b>Interviewer:</b> {evaluation?.interviewerName || '—'}
                        </p>
                        <p>
                          <b>Reason Category:</b> {evaluation?.reasonCategory || '—'}
                        </p>
                        <p>
                          <b>Rehire Eligibility:</b> {evaluation?.rehireEligibility || '—'}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap">
                          <b>HR Observations:</b> {evaluation?.hrObservations || '—'}
                        </p>
                      </div>
                    )}

                    <div className="flex justify-end gap-2">
                      {editing ? (
                        <>
                          <button
                            type="button"
                            className="text-action"
                            onClick={() => setEditing(false)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="primary-action"
                            onClick={saveEvaluation}
                            disabled={updateEvaluation.isPending}
                          >
                            Save Evaluation
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="secondary-action"
                          onClick={() => {
                            setForm(evaluation || {});
                            setEditing(true);
                          }}
                        >
                          <ShieldCheck size={14} />{' '}
                          {evaluation ? 'Edit HR Evaluation' : 'Add HR Evaluation'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Prepare Invitation Email from Manage Modal */}
      {detail && (
        <EmailPreparationDialog
          isOpen={emailOpen}
          onClose={() => setEmailOpen(false)}
          initialEmployeeId={detail.employeeId}
          initialCategory="exit_interview"
          additionalCustomValues={{
            exit_interview_link: surveyUrl,
            form_link: surveyUrl,
            response_due_date: detail.responseDueDate || '',
            last_working_day: '',
          }}
        />
      )}
    </>
  );
}

function EvaluationForm({
  value,
  onChange,
}: {
  value: ExitInterviewEvaluation;
  onChange: (v: ExitInterviewEvaluation) => void;
}) {
  const set = (key: keyof ExitInterviewEvaluation, val: unknown) =>
    onChange({ ...value, [key]: val });

  return (
    <div className="grid gap-3 sm:grid-cols-2 text-xs">
      <label className="block">
        HR Interviewer
        <input
          className="mt-1 w-full rounded border border-stone-200 bg-white p-2 outline-none focus:border-[#b67c90]"
          value={value.interviewerName || ''}
          onChange={e => set('interviewerName', e.target.value)}
        />
      </label>

      <label className="block">
        Reason Category
        <input
          className="mt-1 w-full rounded border border-stone-200 bg-white p-2 outline-none focus:border-[#b67c90]"
          placeholder="e.g. Compensation, Career growth, Relocation"
          value={value.reasonCategory || ''}
          onChange={e => set('reasonCategory', e.target.value)}
        />
      </label>

      <div className="block text-xs font-medium text-stone-700">
        <span className="mb-1 block">Rehire Eligibility</span>
        <AnimatedSelect
          variant="form"
          placeholder="Undetermined"
          value={value.rehireEligibility || ''}
          onChange={val => set('rehireEligibility', val || null)}
          options={[
            { value: '', label: 'Undetermined' },
            { value: 'eligible', label: 'Eligible for rehire' },
            { value: 'not_eligible', label: 'Not eligible' },
            { value: 'conditional', label: 'Conditional review required' },
          ]}
        />
      </div>

      <label className="flex items-center gap-2 pt-6">
        <input
          type="checkbox"
          checked={value.regrettableExit || false}
          onChange={e => set('regrettableExit', e.target.checked)}
          className="accent-[#b67c90]"
        />
        <b>Regrettable Exit</b> (Key performer transition)
      </label>

      <label className="block sm:col-span-2">
        HR Observations & Feedback Review
        <textarea
          className="mt-1 min-h-24 w-full rounded border border-stone-200 bg-white p-2 outline-none focus:border-[#b67c90]"
          placeholder="Summary of employee feedback and key takeaways…"
          value={value.hrObservations || ''}
          onChange={e => set('hrObservations', e.target.value)}
        />
      </label>

      <label className="block sm:col-span-2">
        Action Items (one per line)
        <textarea
          className="mt-1 min-h-16 w-full rounded border border-stone-200 bg-white p-2 outline-none focus:border-[#b67c90]"
          value={(value.actionItems || []).join('\n')}
          onChange={e =>
            set(
              'actionItems',
              e.target.value
                .split('\n')
                .map(x => x.trim())
                .filter(Boolean)
            )
          }
        />
      </label>
    </div>
  );
}

function Loading() {
  return (
    <div className="grid min-h-56 place-items-center text-stone-500">
      <Loader2 className="animate-spin text-[#b67c90]" size={24} />
    </div>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="grid min-h-56 place-items-center p-8 text-center">
      <div>
        <FileText className="mx-auto mb-3 text-[#d8a8b8]" size={28} />
        <b className="block text-stone-700 text-sm">{title}</b>
        <p className="mt-1 max-w-sm text-xs text-stone-500 leading-relaxed">{text}</p>
      </div>
    </div>
  );
}
