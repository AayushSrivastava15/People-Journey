import { useState, useEffect, useMemo } from 'react';
import {
  X, Mail, Send, Copy, Check, AlertCircle, Sparkles, ExternalLink,
  Loader2, Info, ChevronDown, CheckCircle2, FileText, ArrowRight
} from 'lucide-react';
import {
  useEmailTemplates,
  useCompanyProfile,
  useEmployees,
  usePreviewEmailDraft,
  useCreateEmailDraft,
  useUpdateDraftStatus,
} from '@/api/queries';
import type { Employee, EmailTemplate, EmailTemplateCategory } from '@/types/api';
import { useToast } from '@/hooks/use-toast';
import { AnimatedSelect } from '@/components/ui/animated-select';
import {
  EMAIL_TEMPLATE_CATEGORIES,
  normalizeCategory,
  getCategoryLabel,
} from '@/utils/email-categories';

interface EmailPreparationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialEmployeeId?: number;
  initialTemplateId?: string;
  initialCategory?: string;
  additionalCustomValues?: Record<string, string>;
}

const SUPPORTED_PLACEHOLDERS = [
  { token: '{{company_name}}', desc: 'Saved company name' },
  { token: '{{hr_contact_name}}', desc: 'Saved HR contact name' },
  { token: '{{hr_contact_email}}', desc: 'Saved HR contact email' },
  { token: '{{office_location}}', desc: 'Saved office location' },
  { token: '{{sender_name}}', desc: 'Saved sender / HR display name' },
  { token: '{{employee_name}}', desc: 'Selected employee full name' },
  { token: '{{employee_first_name}}', desc: 'Employee first name' },
  { token: '{{employee_email}}', desc: 'Employee work email' },
  { token: '{{job_title}}', desc: 'Employee designation / title' },
  { token: '{{department_name}}', desc: 'Employee department' },
  { token: '{{joining_date}}', desc: 'Scheduled start date' },
  { token: '{{last_working_day}}', desc: 'Recorded exit date' },
  { token: '{{exit_interview_link}}', desc: 'Unique survey short link' },
  { token: '{{response_due_date}}', desc: 'Feedback form response deadline' },
  { token: '{{form_link}}', desc: 'Survey form link' },
  { token: '{{company_signature}}', desc: 'Saved email signature' },
];

function formatDisplayDate(val?: string): string {
  if (!val) return '—';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return val;
  }
}

export function EmailPreparationDialog({
  isOpen,
  onClose,
  initialEmployeeId,
  initialTemplateId,
  initialCategory,
  additionalCustomValues,
}: EmailPreparationDialogProps) {
  const { toast } = useToast();
  const { data: profile } = useCompanyProfile();
  const { data: templates = [], isLoading: templatesLoading } = useEmailTemplates();
  const { data: employeeData } = useEmployees({ limit: 100 });
  const employees = employeeData?.data || [];

  const previewMutation = usePreviewEmailDraft();
  const createDraftMutation = useCreateEmailDraft();
  const updateStatusMutation = useUpdateDraftStatus();

  // Selection states
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | undefined>(initialEmployeeId);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(initialTemplateId);
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory ? normalizeCategory(initialCategory) : 'all');

  // Candidate mode toggle
  const [isCandidateMode, setIsCandidateMode] = useState<boolean>(false);
  const [candidateName, setCandidateName] = useState<string>('');
  const [candidateEmail, setCandidateEmail] = useState<string>('');

  // Draft editable fields
  const [recipient, setRecipient] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [body, setBody] = useState<string>('');
  const [missingPlaceholders, setMissingPlaceholders] = useState<string[]>([]);
  const [hasCompanyProfile, setHasCompanyProfile] = useState<boolean>(true);

  // Custom placeholder overrides
  const [responseDueDate, setResponseDueDate] = useState<string>(additionalCustomValues?.response_due_date || '');

  // Status and feedback
  const [copied, setCopied] = useState<boolean>(false);
  const [popupBlockedUrl, setPopupBlockedUrl] = useState<string | null>(null);
  const [showPlaceholdersCheat, setShowPlaceholdersCheat] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Sync initial props
  useEffect(() => {
    if (initialEmployeeId) {
      setSelectedEmployeeId(initialEmployeeId);
      setIsCandidateMode(false);
    }
  }, [initialEmployeeId]);

  useEffect(() => {
    if (initialTemplateId) {
      setSelectedTemplateId(initialTemplateId);
    }
  }, [initialTemplateId]);

  // If no template is selected, select an appropriate one based on employee status
  useEffect(() => {
    if (!selectedTemplateId && templates.length > 0) {
      const selectedEmp = employees.find(e => e.employeeId === selectedEmployeeId);
      let defaultTpl: EmailTemplate | undefined;

      if (normalizeCategory(selectedCategory) === 'exit_interview') {
        defaultTpl = templates.find(t => normalizeCategory(t.category) === 'exit_interview');
      } else if (selectedEmp?.employmentStatus === 'OFFBOARDING' || selectedEmp?.exitDate) {
        defaultTpl = templates.find(t => t.name === 'Last Working Day') || templates.find(t => normalizeCategory(t.category) === 'offboarding');
      } else if (selectedEmp?.employmentStatus === 'ONBOARDING') {
        defaultTpl = templates.find(t => t.name === 'New Joiner Welcome') || templates.find(t => normalizeCategory(t.category) === 'preboarding');
      }

      if (!defaultTpl) {
        defaultTpl = templates[0];
      }

      if (defaultTpl) {
        setSelectedTemplateId(defaultTpl.id);
      }
    }
  }, [selectedTemplateId, templates, selectedEmployeeId, employees, selectedCategory]);

  // Filtered templates
  const filteredTemplates = useMemo(() => {
    if (selectedCategory === 'all' || selectedCategory === 'All') return templates;
    return templates.filter(t => normalizeCategory(t.category) === normalizeCategory(selectedCategory));
  }, [templates, selectedCategory]);

  // Active template
  const currentTemplate = useMemo(() => {
    return templates.find(t => t.id === selectedTemplateId);
  }, [templates, selectedTemplateId]);

  // Active employee
  const currentEmployee = useMemo(() => {
    return employees.find(e => e.employeeId === selectedEmployeeId);
  }, [employees, selectedEmployeeId]);

  // Generate preview when selection or overrides change
  useEffect(() => {
    if (!isOpen) return;
    if (!currentTemplate) return;

    const customValues: Record<string, string> = { ...(additionalCustomValues || {}) };
    if (responseDueDate) customValues.response_due_date = responseDueDate;
    let surveyLink = additionalCustomValues?.exit_interview_link || additionalCustomValues?.form_link;
    if (surveyLink) {
      if (surveyLink.includes(',')) {
        surveyLink = surveyLink.split(',')[0].trim();
      }
      if (typeof window !== 'undefined' && window.location.origin) {
        surveyLink = surveyLink.replace(/^https?:\/\/localhost:\d+/, window.location.origin);
      }
      customValues.exit_interview_link = surveyLink;
      customValues.form_link = surveyLink;
    }

    previewMutation.mutate(
      {
        employeeId: isCandidateMode ? undefined : selectedEmployeeId,
        candidateName: isCandidateMode ? candidateName : undefined,
        candidateEmail: isCandidateMode ? candidateEmail : undefined,
        templateId: currentTemplate.id,
        customValues,
      },
      {
        onSuccess: res => {
          setRecipient(res.data.recipientEmail || '');
          const effectiveCompanyName = profile?.companyName || 'our company';
          const effectiveHrName = profile?.hrContactName || 'HR Team';
          const effectiveHrEmail = profile?.hrContactEmail || '';
          const effectiveDueDate = responseDueDate
            ? formatDisplayDate(responseDueDate)
            : additionalCustomValues?.response_due_date
            ? formatDisplayDate(additionalCustomValues.response_due_date)
            : '—';

          let subj = res.data.subject || '';
          let bdy = res.data.body || '';

          subj = subj.replace(/\{\{company_name\}\}/g, effectiveCompanyName);
          bdy = bdy.replace(/\{\{company_name\}\}/g, effectiveCompanyName);
          subj = subj.replace(/\{\{hr_contact_name\}\}/g, effectiveHrName);
          bdy = bdy.replace(/\{\{hr_contact_name\}\}/g, effectiveHrName);
          subj = subj.replace(/\{\{hr_contact_email\}\}/g, effectiveHrEmail);
          bdy = bdy.replace(/\{\{hr_contact_email\}\}/g, effectiveHrEmail);
          subj = subj.replace(/\{\{response_due_date\}\}/g, effectiveDueDate);
          bdy = bdy.replace(/\{\{response_due_date\}\}/g, effectiveDueDate);
          subj = subj.replace(/\{\{employee_code\}\}/g, '');
          bdy = bdy.replace(/\{\{employee_code\}\}/g, '');

          if (surveyLink) {
            subj = subj.replace(/\{\{exit_interview_link\}\}/g, surveyLink).replace(/\{\{form_link\}\}/g, surveyLink);
            bdy = bdy.replace(/\{\{exit_interview_link\}\}/g, surveyLink).replace(/\{\{form_link\}\}/g, surveyLink);
            if (!bdy.includes(surveyLink)) {
              bdy = `${bdy.trim()}\n\nExit Feedback Form: ${surveyLink}`.trim();
            }
          }

          setSubject(subj);
          setBody(bdy);
          setMissingPlaceholders(res.data.missingPlaceholders || []);
          setHasCompanyProfile(res.data.hasCompanyProfile);
        },
      }
    );
  }, [
    isOpen,
    selectedTemplateId,
    selectedEmployeeId,
    isCandidateMode,
    candidateName,
    candidateEmail,
    responseDueDate,
    additionalCustomValues,
    profile,
  ]);

  if (!isOpen) return null;

  const handleOpenGmail = async () => {
    if (!recipient.trim()) {
      toast({
        variant: 'destructive',
        title: 'Recipient Required',
        description: 'Please specify a valid recipient email before opening Gmail.',
      });
      return;
    }

    if (!subject.trim()) {
      toast({
        variant: 'destructive',
        title: 'Subject Required',
        description: 'Please enter a subject line for your email.',
      });
      return;
    }

    // Clean up any remaining raw {{tokens}} so they don't appear in Gmail
    const finalSubject = subject.replace(/\{\{[a-zA-Z0-9_]+\}\}/g, '').trim();
    const finalBody = body.replace(/\{\{[a-zA-Z0-9_]+\}\}/g, '').trim();

    setIsSubmitting(true);
    setPopupBlockedUrl(null);

    // Open a new tab immediately during direct user click to prevent browser popup blockers
    const win = window.open('about:blank', '_blank');

    try {
      // 1. Persist snapshot to Supabase PostgreSQL
      const res = await createDraftMutation.mutateAsync({
        employeeId: isCandidateMode ? undefined : selectedEmployeeId,
        templateId: currentTemplate?.id,
        lifecycleEvent: currentTemplate?.category || 'Employee Communication',
        recipientEmail: recipient.trim(),
        recipientName: isCandidateMode
          ? candidateName.trim()
          : currentEmployee
          ? `${currentEmployee.firstName} ${currentEmployee.lastName || ''}`.trim()
          : undefined,
        subjectSnapshot: finalSubject,
        bodySnapshot: finalBody,
        status: 'prepared',
      });

      // Safely extract draft ID whether returned as entity or wrapped in data
      const draftId = (res as { id?: string })?.id || (res as { data?: { id?: string } })?.data?.id;

      // 2. Build standard Gmail compose URL
      const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
        recipient.trim()
      )}&su=${encodeURIComponent(finalSubject)}&body=${encodeURIComponent(finalBody)}`;

      // 3. Mark status as gmail_opened
      if (draftId) {
        try {
          await updateStatusMutation.mutateAsync({
            id: draftId,
            status: 'gmail_opened',
            recordGmailOpen: true,
          });
        } catch (updateErr) {
          console.warn('Could not update status to gmail_opened:', updateErr);
        }
      }

      // 4. Navigate tab to Gmail compose
      if (win && !win.closed) {
        win.location.href = gmailUrl;
        toast({
          title: 'Gmail Draft Opened',
          description: 'Your email snapshot is saved. Please review the prefilled draft in Gmail and click Send.',
        });
        onClose();
      } else {
        // Browser aggressively blocked the window opening
        setPopupBlockedUrl(gmailUrl);
        toast({
          title: 'Draft Saved',
          description: 'Your browser prevented the new tab from opening automatically. Click the link in the banner to open Gmail.',
        });
      }
    } catch (err) {
      if (win && !win.closed) {
        win.close();
      }
      const rawData = (err as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
      const errorMsg =
        (rawData?.error as Record<string, unknown>)?.message ||
        rawData?.message ||
        (err as Error).message ||
        'An error occurred while saving the draft.';

      toast({
        variant: 'destructive',
        title: 'Failed to Prepare Draft',
        description: String(errorMsg),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyClipboard = () => {
    const fullText = `To: ${recipient}\nSubject: ${subject}\n\n${body}`;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: 'Copied to Clipboard',
      description: 'Recipient, subject, and body copied.',
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        backgroundColor: 'rgba(29, 21, 26, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.15s ease-out',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '920px',
          maxHeight: '92vh',
          backgroundColor: '#fffcfc',
          borderRadius: '16px',
          boxShadow: '0 20px 45px rgba(29, 21, 26, 0.25)',
          border: '1px solid #f0e2e2',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #f2e4e4',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(to right, #fffafa, #fff6f8)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#fce7ee',
                display: 'grid',
                placeItems: 'center',
                color: '#be185d',
              }}
            >
              <Mail size={18} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#3b2b35' }}>
                Prepare Lifecycle Email
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#88747f' }}>
                Personalize templates with real company and employee data, then open in Gmail to send.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              padding: '6px',
              borderRadius: '8px',
              cursor: 'pointer',
              color: '#8b7a84',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Step Guide Bar */}
        <div
          style={{
            padding: '10px 24px',
            background: '#faf6f8',
            borderBottom: '1px solid #f0e2ea',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: '#7a6471',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#974862' }}>
            <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#974862', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700 }}>1</span>
            Recipient
          </div>
          <span style={{ color: '#d8cad2' }}>→</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#974862' }}>
            <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#974862', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700 }}>2</span>
            Template
          </div>
          <span style={{ color: '#d8cad2' }}>→</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#974862' }}>
            <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#974862', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700 }}>3</span>
            Review & Open in Gmail
          </div>
        </div>

        {/* Popup Blocked Fallback Banner */}
        {popupBlockedUrl && (
          <div
            style={{
              padding: '12px 24px',
              background: '#ecfdf5',
              borderBottom: '1px solid #a7f3d0',
              color: '#065f46',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={16} style={{ color: '#059669' }} />
              <span>
                <b>Draft saved!</b> Browser blocked opening the popup tab automatically.
              </span>
            </div>
            <a
              href={popupBlockedUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '4px 12px',
                borderRadius: '6px',
                background: '#059669',
                color: '#ffffff',
                fontWeight: 600,
                textDecoration: 'none',
                fontSize: '11px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              Click here to Open Gmail <ExternalLink size={12} />
            </a>
          </div>
        )}

        {/* Body content */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {/* Row 1: Target Recipient / Mode */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginBottom: '16px' }}>
            {/* Employee Selector */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#4b3843', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#974862', color: '#fff', fontSize: '10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>1</span>
                  Target Recipient
                </label>
                <button
                  type="button"
                  onClick={() => setIsCandidateMode(!isCandidateMode)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '11px',
                    color: '#bd7b92',
                    cursor: 'pointer',
                    fontWeight: 600,
                    textDecoration: 'underline',
                  }}
                >
                  {isCandidateMode ? 'Select existing employee' : 'Enter candidate info instead'}
                </button>
              </div>

              {isCandidateMode ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <input
                    value={candidateName}
                    onChange={e => setCandidateName(e.target.value)}
                    placeholder="Candidate full name"
                    style={{ fontSize: '12px', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e0d0d0' }}
                  />
                  <input
                    type="email"
                    value={candidateEmail}
                    onChange={e => setCandidateEmail(e.target.value)}
                    placeholder="candidate@example.com"
                    style={{ fontSize: '12px', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e0d0d0' }}
                  />
                </div>
              ) : (
                <AnimatedSelect
                  variant="form"
                  value={selectedEmployeeId ? String(selectedEmployeeId) : ''}
                  placeholder="— Select an employee from workspace —"
                  onChange={val => setSelectedEmployeeId(val ? Number(val) : undefined)}
                  options={[
                    { value: '', label: '— Select an employee from workspace —' },
                    ...employees.map(emp => ({
                      value: String(emp.employeeId),
                      label: `${emp.name} — ${emp.workEmail || 'Registered'}`,
                      badge: emp.status,
                    })),
                  ]}
                />
              )}
            </div>

            {/* Template Selector */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#4b3843', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#974862', color: '#fff', fontSize: '10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>2</span>
                  Email Template
                </label>
                <span style={{ fontSize: '10px', color: '#88747f' }}>
                  {filteredTemplates.length} templates available
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr', gap: '8px' }}>
                <AnimatedSelect
                  variant="filter"
                  value={selectedCategory}
                  onChange={val => setSelectedCategory(val)}
                  options={[
                    { value: 'all', label: 'All Categories' },
                    ...EMAIL_TEMPLATE_CATEGORIES.map(c => ({
                      value: c.key,
                      label: c.label,
                    })),
                  ]}
                />
                <AnimatedSelect
                  variant="form"
                  value={selectedTemplateId || ''}
                  placeholder="Select a template…"
                  onChange={val => setSelectedTemplateId(val)}
                  options={filteredTemplates.map(t => ({
                    value: t.id,
                    label: t.name,
                    badge: !t.isSystemTemplate ? 'Custom' : undefined,
                  }))}
                />
              </div>
            </div>
          </div>

          {/* Contextual Override inputs for Exit Interview / Feedback Form */}
          {(currentTemplate?.name.includes('Exit') || normalizeCategory(currentTemplate?.category) === 'exit_interview') && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                padding: '12px 14px',
                borderRadius: '10px',
                background: '#faf5f8',
                border: '1px solid #f3e6ec',
                marginBottom: '16px',
              }}
            >
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#7a5a6a', display: 'block' }}>
                  Response Due Date (Optional)
                </label>
                <span style={{ fontSize: '10px', color: '#9d8a95' }}>
                  Submission deadline for the employee's feedback form. Leave empty if no strict deadline is needed.
                </span>
              </div>
              <input
                type="date"
                value={responseDueDate}
                onChange={e => setResponseDueDate(e.target.value)}
                style={{
                  width: '150px',
                  fontSize: '11px',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  border: '1px solid #e6d8df',
                  background: '#ffffff',
                  color: '#57434c',
                }}
              />
            </div>
          )}

          {/* Email Preview & Edit Form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
              <span style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#974862', color: '#fff', fontSize: '10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>3</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#3b2b35' }}>Review Message & Send</span>
            </div>

            {/* Recipient */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#4b3843' }}>
                  Recipient Email (To:) <span style={{ color: '#e11d48' }}>*</span>
                </label>
                <span style={{ fontSize: '10px', color: '#88747f' }}>
                  Sender identity in Gmail will be your active Google account
                </span>
              </div>
              <input
                type="email"
                value={recipient}
                onChange={e => setRecipient(e.target.value)}
                placeholder="recipient@example.com"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #e2d2d2',
                  fontSize: '13px',
                }}
              />
            </div>

            {/* Subject */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#4b3843' }}>
                  Email Subject <span style={{ color: '#e11d48' }}>*</span>
                </label>
              </div>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Subject line"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #e2d2d2',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#2e2129',
                }}
              />
            </div>

            {/* Body */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#4b3843' }}>
                  Email Body (Pre-filled snapshot)
                </label>
                <button
                  type="button"
                  onClick={() => setShowPlaceholdersCheat(!showPlaceholdersCheat)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '11px',
                    color: '#bd7b92',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Sparkles size={12} /> {showPlaceholdersCheat ? 'Hide placeholders list' : 'View available placeholders'}
                </button>
              </div>

              {showPlaceholdersCheat && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: '#fdf8fa',
                    border: '1px solid #f4e5ec',
                    marginBottom: '8px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '6px',
                    fontSize: '11px',
                  }}
                >
                  {SUPPORTED_PLACEHOLDERS.map(p => (
                    <div key={p.token} style={{ display: 'flex', flexDirection: 'column' }}>
                      <code style={{ color: '#be185d', fontWeight: 600 }}>{p.token}</code>
                      <span style={{ color: '#7a6773', fontSize: '10px' }}>{p.desc}</span>
                    </div>
                  ))}
                </div>
              )}

              <textarea
                rows={9}
                value={body}
                onChange={e => setBody(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid #e2d2d2',
                  fontSize: '13px',
                  lineHeight: 1.6,
                  fontFamily: 'inherit',
                  whiteSpace: 'pre-wrap',
                }}
              />
            </div>
          </div>

          {/* Honest Disclaimer Notice */}
          <div
            style={{
              marginTop: '16px',
              padding: '10px 14px',
              borderRadius: '8px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '11px',
              color: '#64748b',
            }}
          >
            <Info size={16} style={{ flexShrink: 0, color: '#3b82f6' }} />
            <span>
              <b>Workflow:</b> Clicking <b>Open Gmail Draft</b> opens a new Gmail tab pre-filled with this recipient, subject, and message. You can review and click Send from your Google account.
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #f2e4e4',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#fffdfd',
          }}
        >
          <button
            type="button"
            className="secondary-action"
            onClick={handleCopyClipboard}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {copied ? <Check size={14} style={{ color: '#16a34a' }} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy Message'}
          </button>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className="secondary-action"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary-action"
              onClick={handleOpenGmail}
              disabled={isSubmitting}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                minWidth: '170px',
                justifyContent: 'center',
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Preparing Draft…
                </>
              ) : (
                <>
                  <ExternalLink size={16} /> Open Gmail Draft
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
