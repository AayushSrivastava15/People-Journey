import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'wouter';
import {
  AlertCircle,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileCheck,
  FileText,
  HelpCircle,
  Loader2,
  Mail,
  Send,
  ShieldCheck,
  Sparkles,
  User,
  XCircle,
} from 'lucide-react';
import type {
  ExitQuestionnaireSchema,
  QuestionnaireQuestion,
  QuestionnaireSection,
} from '@/types/api';
import { buildApiUrl } from '@/api/client';

interface ResolveData {
  valid: boolean;
  reason?: 'NOT_FOUND' | 'ALREADY_SUBMITTED' | 'CANCELLED' | 'EXPIRED' | string;
  interviewId?: string;
  shortCode?: string;
  expiresAt?: string;
  responseDueDate?: string | null;
  company?: {
    companyName: string;
    displayName: string;
    logoUrl: string | null;
    brandPrimaryColor: string;
    hrContactName: string;
    hrContactEmail: string | null;
    departmentTeam: string;
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

export function ShortLinkRedirectPage() {
  const params = useParams<{ code: string }>();
  const code = params.code || '';

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ResolveData | null>(null);
  const [currentStep, setCurrentStep] = useState(0); // 0 = Welcome, 1..N = Sections, N+1 = Review
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [draftRestored, setDraftRestored] = useState(false);

  // Storage key for local auto-save
  const storageKey = `exit_survey_draft_${code}`;

  // Fetch resolution data
  useEffect(() => {
    if (!code) {
      setData({ valid: false, reason: 'NOT_FOUND' });
      setLoading(false);
      return;
    }

    let isMounted = true;
    async function loadSurvey() {
      try {
        const res = await fetch(buildApiUrl(`/exit-interviews/resolve/${encodeURIComponent(code)}`), {
          headers: {
            Accept: 'application/json',
          },
        });
        const json = await res.json();
        if (!isMounted) return;

        if (json.success && json.data) {
          setData(json.data);
          // Restore draft if available
          try {
            const savedDraft = localStorage.getItem(storageKey);
            if (savedDraft) {
              const parsed = JSON.parse(savedDraft);
              if (parsed && typeof parsed === 'object') {
                setAnswers(parsed);
                setDraftRestored(true);
              }
            }
          } catch {
            // ignore localstorage errors
          }
        } else {
          setData({
            valid: false,
            reason: json.error?.code || json.data?.reason || 'NOT_FOUND',
          });
        }
      } catch (err) {
        if (!isMounted) return;
        setData({ valid: false, reason: 'SERVER_ERROR' });
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadSurvey();
    return () => {
      isMounted = false;
    };
  }, [code, storageKey]);

  // Auto-save to localStorage
  const updateAnswer = (questionId: string, value: any) => {
    setAnswers(prev => {
      const updated = { ...prev, [questionId]: value };
      try {
        localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });

    // Clear validation error if answered
    if (validationErrors[questionId]) {
      setValidationErrors(prev => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
    }
  };

  const sections = useMemo(() => data?.template?.schema?.sections || [], [data]);
  const totalSteps = sections.length + 2; // Step 0 (welcome) + Sections + Step N+1 (review)

  // Primary brand color
  const brandColor = data?.company?.brandPrimaryColor || '#59424f';
  const companyName = data?.company?.displayName || data?.company?.companyName || 'Our Company';

  // Section validation before moving to next step
  const validateCurrentSection = (sectionIndex: number): boolean => {
    if (sectionIndex < 0 || sectionIndex >= sections.length) return true;
    const sec = sections[sectionIndex];
    const errors: Record<string, string> = {};

    for (const q of sec.questions) {
      if (q.required) {
        const val = answers[q.id];
        if (val === undefined || val === null || val === '') {
          errors[q.id] = 'This question requires an answer.';
        } else if (Array.isArray(val) && val.length === 0) {
          errors[q.id] = 'Please select at least one option.';
        } else if (q.type === 'rating_matrix' && q.matrixRows) {
          // Verify each row in matrix has been rated
          if (typeof val !== 'object') {
            errors[q.id] = 'Please rate all items in this matrix.';
          } else {
            const missing = q.matrixRows.some(row => !val[row.id]);
            if (missing) {
              errors[q.id] = 'Please provide a rating for each statement.';
            }
          }
        } else if (q.type === 'declaration') {
          if (!val || typeof val !== 'object' || !val.agreed || !val.signature) {
            errors[q.id] = 'Please confirm the declaration and provide your signature.';
          }
        }
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNext = () => {
    if (currentStep === 0) {
      // From Welcome to Section 1
      setCurrentStep(1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const currentSectionIdx = currentStep - 1;
    if (currentSectionIdx < sections.length) {
      const isValid = validateCurrentSection(currentSectionIdx);
      if (!isValid) {
        window.scrollTo({ top: 150, behavior: 'smooth' });
        return;
      }
    }

    setCurrentStep(prev => prev + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(0, prev - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmissionError(null);

    try {
      const res = await fetch(buildApiUrl(`/exit-interviews/submit/${encodeURIComponent(code)}`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          answers,
          metadata: {
            submittedAt: new Date().toISOString(),
            userAgent: navigator.userAgent,
          },
        }),
      });

      const result = await res.json();
      if (res.ok && result.success) {
        try {
          localStorage.removeItem(storageKey);
        } catch {
          // ignore
        }
        setSubmitted(true);
      } else {
        setSubmissionError(
          result.error?.message || result.reason || 'Could not submit feedback. Please check required fields.'
        );
      }
    } catch (err) {
      setSubmissionError('Connection error. Please verify your internet connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // LOADING STATE
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf7f5] flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <Loader2 className="animate-spin mx-auto text-[#59424f]" size={36} />
          <p className="text-sm font-medium text-stone-600">Loading your feedback survey…</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // ERROR & TERMINAL STATUS SCREENS
  // ---------------------------------------------------------------------------
  if (!data?.valid) {
    const isCompleted = data?.reason === 'ALREADY_SUBMITTED' || data?.reason === 'COMPLETED';
    const isExpired = data?.reason === 'EXPIRED';
    const isCancelled = data?.reason === 'CANCELLED' || data?.reason === 'REVOKED';

    return (
      <div className="min-h-screen bg-[#faf7f5] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-[#ebdada] shadow-sm p-8 text-center space-y-5">
          <div
            className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center ${
              isCompleted
                ? 'bg-emerald-50 text-emerald-600'
                : isExpired
                ? 'bg-amber-50 text-amber-600'
                : isCancelled
                ? 'bg-rose-50 text-rose-600'
                : 'bg-stone-100 text-stone-600'
            }`}
          >
            {isCompleted ? (
              <CheckCircle2 size={36} />
            ) : isExpired ? (
              <Clock size={36} />
            ) : isCancelled ? (
              <AlertCircle size={36} />
            ) : (
              <XCircle size={36} />
            )}
          </div>

          <div>
            <h1 className="text-xl font-bold text-stone-800">
              {isCompleted
                ? 'Feedback Already Received'
                : isExpired
                ? 'Survey Link Expired'
                : isCancelled
                ? 'Survey Link Inactive'
                : 'Survey Link Not Found'}
            </h1>
            <p className="text-xs text-stone-500 mt-2 leading-relaxed">
              {isCompleted
                ? 'Thank you! Your exit feedback survey has already been submitted and safely recorded in our HR system.'
                : isExpired
                ? 'This feedback link has reached its expiration date. If you still wish to submit feedback, please reach out to your HR team.'
                : isCancelled
                ? 'This survey link is no longer active because a newer invitation was issued or the exit process was updated.'
                : 'We could not locate an exit feedback survey for this reference code. Please verify the URL from your invitation email.'}
            </p>
          </div>

          {data?.company?.hrContactEmail && (
            <div className="pt-4 border-t border-stone-100 text-xs text-stone-500 space-y-1">
              <p>Questions? Contact HR:</p>
              <a
                href={`mailto:${data.company.hrContactEmail}`}
                className="font-semibold text-[#59424f] hover:underline inline-flex items-center gap-1"
              >
                <Mail size={13} /> {data.company.hrContactEmail}
              </a>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // SUCCESS / SUBMITTED SCREEN
  // ---------------------------------------------------------------------------
  if (submitted) {
    return (
      <div className="min-h-screen bg-[#faf7f5] flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white rounded-2xl border border-[#ebdada] shadow-sm p-8 text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl mx-auto bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 size={38} />
          </div>

          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-700">
              Submission Confirmed
            </span>
            <h1 className="text-2xl font-bold text-stone-800">Thank You For Your Feedback</h1>
            <p className="text-xs text-stone-500 leading-relaxed max-w-md mx-auto">
              Your comprehensive exit feedback has been securely submitted to <b>{companyName}</b>.
              We sincerely appreciate your time, openness, and contributions during your tenure with us.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-600 text-left space-y-1.5">
            <div className="flex justify-between">
              <span className="text-stone-400">Employee:</span>
              <span className="font-semibold text-stone-800">{data?.employee?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-400">Submission Date:</span>
              <span className="font-semibold text-stone-800">
                {new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'short' }).format(
                  new Date()
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-400">Reference Code:</span>
              <span className="font-mono text-stone-800">{code}</span>
            </div>
          </div>

          <div className="pt-2 text-xs text-stone-400">
            You may now safely close this browser window.
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // MULTI-STEP WIZARD
  // ---------------------------------------------------------------------------
  const activeSectionIndex = currentStep - 1;
  const activeSection = sections[activeSectionIndex];
  const isReviewStep = currentStep === sections.length + 1;

  return (
    <div className="min-h-screen bg-[#faf7f5] flex flex-col">
      {/* Top Company Branding Header */}
      <header className="bg-white border-b border-[#f0e4e6] sticky top-0 z-30 shadow-2xs">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {data.company?.logoUrl ? (
              <img
                src={data.company.logoUrl}
                alt={companyName}
                className="h-9 w-auto max-w-[120px] object-contain rounded"
              />
            ) : (
              <div
                className="w-9 h-9 rounded-xl text-white font-bold text-sm flex items-center justify-center shadow-xs"
                style={{ backgroundColor: brandColor }}
              >
                {companyName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <h2 className="text-sm font-bold text-stone-800 leading-tight">{companyName}</h2>
              <p className="text-[11px] text-stone-500">Exit Feedback Survey</p>
            </div>
          </div>

          {/* Step Progress Counter */}
          <div className="flex items-center gap-3 text-xs">
            <span className="text-stone-500 hidden sm:inline">
              Step <b>{currentStep + 1}</b> of <b>{totalSteps}</b>
            </span>
            <div className="w-24 sm:w-32 h-2 rounded-full bg-stone-100 overflow-hidden">
              <div
                className="h-full transition-all duration-300"
                style={{
                  width: `${((currentStep + 1) / totalSteps) * 100}%`,
                  backgroundColor: brandColor,
                }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-3xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Draft Restored Banner */}
        {draftRestored && currentStep === 0 && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-amber-600" />
              <span>We restored your previously saved responses on this device.</span>
            </div>
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.removeItem(storageKey);
                } catch {}
                setAnswers({});
                setDraftRestored(false);
              }}
              className="text-amber-900 font-semibold underline text-[11px]"
            >
              Start Fresh
            </button>
          </div>
        )}

        {/* STEP 0: WELCOME & EMPLOYEE VERIFICATION */}
        {currentStep === 0 && (
          <div className="bg-white rounded-2xl border border-[#ebdada] shadow-xs p-6 sm:p-8 space-y-6">
            <div className="space-y-2">
              <span
                className="text-xs font-bold uppercase tracking-wider block"
                style={{ color: brandColor }}
              >
                Confidential & Secure Feedback
              </span>
              <h1 className="text-2xl font-bold text-stone-800">
                Welcome, {data.employee?.name || 'Valued Team Member'}
              </h1>
              <p className="text-xs text-stone-500 leading-relaxed">
                Thank you for taking the time to share your thoughts. Your open and honest responses
                help us understand your experience and make {companyName} a better place to work for
                everyone. This survey covers 9 structured sections and takes approximately 8–10 minutes.
              </p>
            </div>

            {/* Read-Only Employee Details Confirmation */}
            <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-stone-700">
                <ShieldCheck size={16} className="text-emerald-600" />
                <span>Confirmed Employee Profile</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-stone-400 block">Full Name</span>
                  <b className="text-stone-800">{data.employee?.name}</b>
                </div>
                <div>
                  <span className="text-stone-400 block">Employee Code</span>
                  <b className="font-mono text-stone-800">{data.employee?.employeeCode}</b>
                </div>
                <div>
                  <span className="text-stone-400 block">Department</span>
                  <b className="text-stone-800">{data.employee?.department || '—'}</b>
                </div>
                <div>
                  <span className="text-stone-400 block">Designation</span>
                  <b className="text-stone-800">{data.employee?.designation || '—'}</b>
                </div>
                <div>
                  <span className="text-stone-400 block">Hire Date</span>
                  <b className="text-stone-800">{data.employee?.hireDate || '—'}</b>
                </div>
                <div>
                  <span className="text-stone-400 block">Exit Date</span>
                  <b className="text-stone-800">{data.employee?.exitDate || '—'}</b>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-purple-50/50 border border-purple-100 text-xs text-stone-600 space-y-1">
              <p className="font-semibold text-stone-800">Your privacy matters</p>
              <p className="text-[11px] leading-relaxed">
                Your responses will be treated with professional care and utilized solely for organizational improvement, culture evaluation, and knowledge transfer.
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={handleNext}
                className="px-6 py-3 rounded-xl text-white text-xs font-semibold shadow-sm flex items-center gap-2 hover:opacity-95 transition-opacity"
                style={{ backgroundColor: brandColor }}
              >
                <span>Begin Exit Survey</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* STEPS 1..N: ACTIVE SECTION QUESTIONS */}
        {currentStep > 0 && !isReviewStep && activeSection && (
          <div className="bg-white rounded-2xl border border-[#ebdada] shadow-xs p-6 sm:p-8 space-y-6">
            <div className="border-b border-[#f0e4e6] pb-4 space-y-1">
              <span
                className="text-xs font-bold uppercase tracking-wider block"
                style={{ color: brandColor }}
              >
                Section {activeSectionIndex + 1} of {sections.length}
              </span>
              <h2 className="text-xl font-bold text-stone-800">{activeSection.title}</h2>
              {activeSection.description && (
                <p className="text-xs text-stone-500">{activeSection.description}</p>
              )}
            </div>

            {/* Questions List */}
            <div className="space-y-6">
              {activeSection.questions.map((q, qIdx) => {
                const error = validationErrors[q.id];
                const value = answers[q.id];

                return (
                  <div
                    key={q.id}
                    className={`p-4 rounded-xl border transition-all ${
                      error
                        ? 'border-rose-300 bg-rose-50/30'
                        : 'border-stone-100 bg-[#fffdfb] hover:border-stone-200'
                    }`}
                  >
                    <label className="block text-xs font-semibold text-stone-800 mb-1.5 leading-snug">
                      <span className="text-stone-400 font-mono mr-1.5">{qIdx + 1}.</span>
                      {q.label}
                      {q.required && <span className="text-rose-500 ml-1">*</span>}
                    </label>

                    {/* Question Input Variations */}
                    {q.type === 'textarea' ? (
                      <textarea
                        value={value || ''}
                        onChange={e => updateAnswer(q.id, e.target.value)}
                        placeholder={q.placeholder || 'Please share your detailed thoughts...'}
                        rows={3}
                        className="w-full text-xs p-3 rounded-lg border border-stone-200 bg-white outline-none focus:border-[#59424f] resize-none"
                      />
                    ) : q.type === 'radio' && q.options ? (
                      <div className="space-y-2 pt-1">
                        {q.options.map(opt => {
                          const checked = value === opt;
                          return (
                            <label
                              key={opt}
                              onClick={() => updateAnswer(q.id, opt)}
                              className={`flex items-center gap-3 p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                                checked
                                  ? 'border-[#59424f] bg-[#59424f]/5 font-semibold text-stone-900'
                                  : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                              }`}
                            >
                              <div
                                className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                  checked
                                    ? 'border-[#59424f] bg-[#59424f] text-white'
                                    : 'border-stone-300'
                                }`}
                              >
                                {checked && <Check size={10} />}
                              </div>
                              <span>{opt}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : q.type === 'checkbox' && q.options ? (
                      <div className="space-y-2 pt-1">
                        {q.options.map(opt => {
                          const currentVals: string[] = Array.isArray(value) ? value : [];
                          const checked = currentVals.includes(opt);
                          return (
                            <label
                              key={opt}
                              onClick={() => {
                                const nextVals = checked
                                  ? currentVals.filter(v => v !== opt)
                                  : [...currentVals, opt];
                                updateAnswer(q.id, nextVals);
                              }}
                              className={`flex items-center gap-3 p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                                checked
                                  ? 'border-[#59424f] bg-[#59424f]/5 font-semibold text-stone-900'
                                  : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                              }`}
                            >
                              <div
                                className={`w-4 h-4 rounded border flex items-center justify-center ${
                                  checked
                                    ? 'border-[#59424f] bg-[#59424f] text-white'
                                    : 'border-stone-300'
                                }`}
                              >
                                {checked && <Check size={10} />}
                              </div>
                              <span>{opt}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : q.type === 'rating' ? (
                      <div className="pt-2">
                        <div className="flex items-center justify-between max-w-sm gap-2">
                          {[1, 2, 3, 4, 5].map(n => {
                            const isSelected = value === n;
                            return (
                              <button
                                key={n}
                                type="button"
                                onClick={() => updateAnswer(q.id, n)}
                                className={`flex-1 py-2.5 rounded-lg border text-xs font-bold transition-all ${
                                  isSelected
                                    ? 'border-[#59424f] bg-[#59424f] text-white shadow-xs'
                                    : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                                }`}
                              >
                                {n}
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex justify-between max-w-sm text-[11px] text-stone-400 mt-1.5 px-1">
                          <span>{q.minLabel || '1 = Poor'}</span>
                          <span>{q.maxLabel || '5 = Excellent'}</span>
                        </div>
                      </div>
                    ) : q.type === 'rating_matrix' && q.matrixRows ? (
                      <div className="overflow-x-auto pt-2">
                        <table className="w-full text-xs border border-stone-200 rounded-lg overflow-hidden bg-white">
                          <thead className="bg-stone-50 border-b border-stone-200">
                            <tr>
                              <th className="p-3 text-left font-semibold text-stone-700">Evaluation Statement</th>
                              {[1, 2, 3, 4, 5].map(n => (
                                <th key={n} className="p-3 text-center text-stone-600 font-semibold w-12">
                                  {n}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {q.matrixRows.map(row => {
                              const matrixAnswers = typeof value === 'object' && value !== null ? value : {};
                              const rowVal = matrixAnswers[row.id];
                              return (
                                <tr key={row.id} className="border-t border-stone-100 hover:bg-stone-50/50">
                                  <td className="p-3 text-stone-800 font-medium">{row.label}</td>
                                  {[1, 2, 3, 4, 5].map(n => {
                                    const selected = rowVal === n;
                                    return (
                                      <td key={n} className="p-3 text-center">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            updateAnswer(q.id, {
                                              ...matrixAnswers,
                                              [row.id]: n,
                                            })
                                          }
                                          className={`w-7 h-7 rounded-full border text-[11px] font-bold mx-auto transition-all flex items-center justify-center ${
                                            selected
                                              ? 'border-[#59424f] bg-[#59424f] text-white'
                                              : 'border-stone-200 hover:border-stone-300 text-stone-600'
                                          }`}
                                        >
                                          {n}
                                        </button>
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : q.type === 'declaration' ? (
                      <div className="space-y-4 pt-2">
                        <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-600 leading-relaxed space-y-2">
                          <p className="font-semibold text-stone-800">Exit Feedback Declaration</p>
                          <p>
                            I confirm that the feedback provided across all sections of this questionnaire is truthful, honest, and reflective of my authentic personal experience while employed at {companyName}. I acknowledge that this feedback will be handled in accordance with company HR policies.
                          </p>
                        </div>

                        {/* Agreement Checkbox */}
                        <label className="flex items-start gap-3 p-3 rounded-lg border border-stone-200 bg-white text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!value?.agreed}
                            onChange={e =>
                              updateAnswer(q.id, {
                                ...value,
                                agreed: e.target.checked,
                              })
                            }
                            className="mt-0.5 rounded text-[#59424f]"
                          />
                          <span className="font-medium text-stone-800">
                            I accept and confirm the declaration statement above.
                          </span>
                        </label>

                        {/* Electronic Signature */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-stone-700 mb-1">
                              Electronic Signature (Type your full legal name)
                            </label>
                            <input
                              type="text"
                              value={value?.signature || ''}
                              onChange={e =>
                                updateAnswer(q.id, {
                                  ...value,
                                  signature: e.target.value,
                                })
                              }
                              placeholder="e.g. Johnathan Doe"
                              className="w-full text-xs p-2.5 rounded-lg border border-stone-200 bg-white outline-none focus:border-[#59424f]"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-stone-700 mb-1">
                              Date of Signature
                            </label>
                            <input
                              type="date"
                              value={value?.date || new Date().toISOString().slice(0, 10)}
                              onChange={e =>
                                updateAnswer(q.id, {
                                  ...value,
                                  date: e.target.value,
                                })
                              }
                              className="w-full text-xs p-2.5 rounded-lg border border-stone-200 bg-white outline-none focus:border-[#59424f]"
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <input
                        type={q.type === 'email' ? 'email' : q.type === 'date' ? 'date' : 'text'}
                        value={value || ''}
                        onChange={e => updateAnswer(q.id, e.target.value)}
                        placeholder={q.placeholder || 'Type your answer...'}
                        className="w-full text-xs p-2.5 rounded-lg border border-stone-200 bg-white outline-none focus:border-[#59424f]"
                      />
                    )}

                    {error && (
                      <p className="text-[11px] text-rose-600 font-semibold mt-1.5 flex items-center gap-1">
                        <AlertCircle size={13} /> {error}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Bottom Actions */}
            <div className="pt-4 border-t border-[#f0e4e6] flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleBack}
                className="px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-xs font-semibold text-stone-700 hover:bg-stone-50 flex items-center gap-1.5"
              >
                <ChevronLeft size={16} /> Back
              </button>

              <button
                type="button"
                onClick={handleNext}
                className="px-6 py-2.5 rounded-xl text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 hover:opacity-95"
                style={{ backgroundColor: brandColor }}
              >
                <span>{activeSectionIndex === sections.length - 1 ? 'Review Feedback' : 'Next Section'}</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* STEP N+1: REVIEW & SUBMIT */}
        {isReviewStep && (
          <div className="bg-white rounded-2xl border border-[#ebdada] shadow-xs p-6 sm:p-8 space-y-6">
            <div className="border-b border-[#f0e4e6] pb-4 space-y-1">
              <span
                className="text-xs font-bold uppercase tracking-wider block"
                style={{ color: brandColor }}
              >
                Final Step
              </span>
              <h2 className="text-xl font-bold text-stone-800">Review & Submit Your Feedback</h2>
              <p className="text-xs text-stone-500">
                Please take a moment to review your answers across all 9 sections before submitting.
              </p>
            </div>

            {submissionError && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle size={16} className="text-rose-600 shrink-0" />
                <span>{submissionError}</span>
              </div>
            )}

            {/* Section Summary Cards */}
            <div className="space-y-4">
              {sections.map((sec, idx) => (
                <div
                  key={sec.id}
                  className="p-4 rounded-xl border border-stone-100 bg-[#fffdfb] space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                    <span className="font-bold text-stone-800">
                      Section {idx + 1}: {sec.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentStep(idx + 1);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="font-semibold text-xs underline"
                      style={{ color: brandColor }}
                    >
                      Edit
                    </button>
                  </div>

                  <div className="space-y-1.5 text-stone-600">
                    {sec.questions.slice(0, 3).map(q => {
                      const ans = answers[q.id];
                      let display = '—';
                      if (ans !== undefined && ans !== null && ans !== '') {
                        if (q.type === 'rating_matrix' && typeof ans === 'object') {
                          display = `${Object.keys(ans).length} items evaluated`;
                        } else if (Array.isArray(ans)) {
                          display = ans.join(', ');
                        } else if (q.type === 'declaration' && typeof ans === 'object') {
                          display = ans.signature ? `Signed by ${ans.signature}` : 'Declaration agreed';
                        } else {
                          display = String(ans);
                        }
                      }
                      return (
                        <div key={q.id} className="flex justify-between gap-4">
                          <span className="text-stone-400 truncate flex-1">{q.label}:</span>
                          <span className="font-medium text-stone-800 text-right truncate max-w-xs">
                            {display}
                          </span>
                        </div>
                      );
                    })}
                    {sec.questions.length > 3 && (
                      <span className="text-[11px] text-stone-400 block pt-0.5">
                        + {sec.questions.length - 3} more questions completed in this section
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Final Submission Buttons */}
            <div className="pt-4 border-t border-[#f0e4e6] flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleBack}
                className="px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-xs font-semibold text-stone-700 hover:bg-stone-50 flex items-center gap-1.5"
              >
                <ChevronLeft size={16} /> Back
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className="px-8 py-3 rounded-xl text-white text-xs font-semibold shadow-sm flex items-center gap-2 hover:opacity-95 disabled:opacity-50"
                style={{ backgroundColor: brandColor }}
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Submitting Feedback...</span>
                  </>
                ) : (
                  <>
                    <Send size={15} />
                    <span>Submit Complete Exit Survey</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-stone-400 border-t border-stone-200/50 bg-white/50">
        <p>Powered securely by People Journey HR Portal · Confidential Employee Feedback</p>
      </footer>
    </div>
  );
}
