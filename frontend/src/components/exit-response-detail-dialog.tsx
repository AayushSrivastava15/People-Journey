import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { useExitResponseDetail } from '@/api/queries';
import {
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Download,
  FileCheck,
  FileSpreadsheet,
  FileText,
  Loader2,
  Mail,
  Printer,
  ShieldCheck,
  User,
  X,
  Star,
  ChevronRight,
  Sparkles,
  HelpCircle,
  Briefcase,
  Layers,
  MapPin,
  ExternalLink,
} from 'lucide-react';
import type { ExitResponseDetail, ExitResponseQuestionDetail } from '@/types/api';
import { exportResponseToPdf, exportResponseToExcel } from '@/utils/exit-response-export';

interface ResponseDetailDialogProps {
  id: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ratingLabel = (score: number) => {
  switch (score) {
    case 5:
      return { text: '5 - Exceptional', color: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
    case 4:
      return { text: '4 - Commendable', color: 'bg-teal-50 text-teal-800 border-teal-200' };
    case 3:
      return { text: '3 - Competent', color: 'bg-sky-50 text-sky-800 border-sky-200' };
    case 2:
      return { text: '2 - Marginal', color: 'bg-amber-50 text-amber-800 border-amber-200' };
    case 1:
      return { text: '1 - Unsatisfactory', color: 'bg-rose-50 text-rose-800 border-rose-200' };
    default:
      return { text: `${score} / 5`, color: 'bg-stone-50 text-stone-700 border-stone-200' };
  }
};

function formatDate(val: string | null | undefined): string {
  if (!val || val === '—' || val === '-') return '—';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return String(val);
  }
}

export function ResponseDetailDialog({ id, open, onOpenChange }: ResponseDetailDialogProps) {
  const { data: detail, isLoading, isError } = useExitResponseDetail(id || undefined);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  // Compute response statistics dynamically from actual saved answers
  const stats = useMemo(() => {
    if (!detail?.sections) return { total: 0, answered: 0, unanswered: 0, percentage: 0, avgRating: null };

    let total = 0;
    let answered = 0;
    const ratingScores: number[] = [];

    detail.sections.forEach(sec => {
      sec.questions.forEach(q => {
        total++;
        const raw = q.rawAnswer;
        const hasAnswer =
          raw !== undefined &&
          raw !== null &&
          raw !== '' &&
          raw !== '-' &&
          !(Array.isArray(raw) && raw.length === 0) &&
          !(typeof raw === 'object' && Object.keys(raw).length === 0);

        if (hasAnswer) {
          answered++;
        }

        // Collect ratings
        if (q.type === 'rating' && raw && !isNaN(Number(raw))) {
          ratingScores.push(Number(raw));
        } else if (q.type === 'rating_matrix' && typeof raw === 'object' && raw !== null) {
          Object.values(raw).forEach(v => {
            if (v && !isNaN(Number(v))) ratingScores.push(Number(v));
          });
        }
      });
    });

    const unanswered = Math.max(0, total - answered);
    const percentage = total > 0 ? Math.round((answered / total) * 100) : 0;
    const avgRating =
      ratingScores.length > 0
        ? (ratingScores.reduce((a, b) => a + b, 0) / ratingScores.length).toFixed(1)
        : null;

    return { total, answered, unanswered, percentage, avgRating };
  }, [detail]);

  // Extract resignation date from Section A questions if present
  const resignationDate = useMemo(() => {
    if (!detail) return null;
    const secA = detail.sections.find(s => s.id === 'section_a_employee_details');
    const qResign = secA?.questions.find(
      q => q.id === 'emp_date_of_resignation' || q.label.toLowerCase().includes('resignation')
    );
    return qResign?.rawAnswer ? String(qResign.rawAnswer) : null;
  }, [detail]);

  if (!open) return null;

  const handleDownloadPdf = async () => {
    if (!detail) return;
    try {
      setIsExportingPdf(true);
      exportResponseToPdf(detail);
    } catch (err) {
      console.error('Failed to export PDF', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportExcel = async () => {
    if (!detail) return;
    try {
      setIsExportingExcel(true);
      exportResponseToExcel(detail);
    } catch (err) {
      console.error('Failed to export Excel', err);
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handlePrint = () => {
    document.body.classList.add('is-printing-dialog');
    const cleanup = () => {
      document.body.classList.remove('is-printing-dialog');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
    setTimeout(cleanup, 1500);
  };

  const scrollToSection = (secId: string) => {
    setActiveSectionId(secId);
    const el = document.getElementById(`section-${secId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton={true}
        className="max-w-5xl w-[96vw] h-[92vh] p-0 flex flex-col bg-[#fffdfb] overflow-hidden border border-[#ebdada] rounded-3xl shadow-2xl print:block print:w-full print:max-w-full print:h-auto print:max-h-none print:overflow-visible print:border-none print:rounded-none print:shadow-none print:bg-white"
      >
        {/* Header Bar: Exactly ONE close button, no overlapping actions */}
        <div className="px-5 sm:px-7 py-3.5 sm:py-4 border-b border-[#f0e4e6] flex items-center justify-between gap-3 bg-white no-print shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-2xl text-white font-bold flex items-center justify-center shadow-xs text-sm shrink-0"
              style={{ backgroundColor: detail?.company?.brandPrimaryColor || '#59424f' }}
            >
              <FileCheck size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-stone-800 truncate">
                  Exit Interview Response Record
                </h2>
                {detail && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#ebdada] text-[#59424f] shrink-0">
                    v{detail.template.version}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                  <CheckCircle2 size={11} className="text-emerald-600" />
                  Verified Submission
                </span>
              </div>
              <p className="text-xs text-stone-500 truncate mt-0.5">
                Official employee exit feedback questionnaire stored in People Journey database.
              </p>
            </div>
          </div>

          {/* Action buttons + Exactly ONE Close Button */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={!detail || isExportingPdf}
              className="primary-action text-xs px-2.5 sm:px-3 py-1.5 flex items-center gap-1.5 shadow-xs"
              title="Download Full Multi-Page PDF Report"
            >
              {isExportingPdf ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              <span className="hidden sm:inline">Download PDF</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              disabled={!detail || isExportingExcel}
              className="secondary-action text-xs px-2.5 sm:px-3 py-1.5 flex items-center gap-1.5 shadow-2xs"
              title="Download Clean Formatted Excel (.xlsx)"
            >
              {isExportingExcel ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}
              <span className="hidden md:inline">Export Excel</span>
              <span className="hidden sm:inline md:hidden">Excel</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              disabled={!detail}
              className="secondary-action text-xs px-2.5 py-1.5 flex items-center gap-1.5 shadow-2xs"
              title="Print via Browser"
            >
              <Printer size={13} />
              <span className="hidden lg:inline">Print</span>
            </button>

            <div className="w-[1px] h-5 bg-stone-200 mx-0.5" />

            {/* Accessible, styled Single Close Button */}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-[#bd7b92]"
              aria-label="Close response record"
              title="Close response record"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Section Navigation Quick Index Bar (Sub-header) */}
        {detail && detail.sections?.length > 0 && (
          <div className="bg-[#fff9fa] border-b border-[#f2e6e8] px-5 sm:px-7 py-2 flex items-center gap-1.5 overflow-x-auto no-print scrollbar-thin">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#935269] shrink-0 mr-1 flex items-center gap-1">
              <Layers size={13} />
              Sections:
            </span>
            {detail.sections.map((sec, idx) => {
              const letter = String.fromCharCode(65 + idx);
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => scrollToSection(sec.id)}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-all shrink-0 ${
                    activeSectionId === sec.id
                      ? 'bg-[#8c5369] text-white shadow-2xs'
                      : 'bg-white hover:bg-[#faeff2] text-[#55444f] border border-[#ecdce0]'
                  }`}
                  title={sec.title}
                >
                  {letter}. {sec.title.replace(/^Section\s+[A-I]:?\s*/i, '').slice(0, 18)}
                  {sec.title.length > 20 ? '…' : ''}
                </button>
              );
            })}
          </div>
        )}

        {/* Modal Body / Report Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-8 space-y-6 print-container scrollbar-thin print:block print:overflow-visible print:h-auto print:max-h-none print:p-0">
          {isLoading ? (
            <div className="py-24 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="animate-spin text-[#8c5369]" size={36} />
              <p className="text-xs font-semibold text-stone-600">Loading structured response report…</p>
            </div>
          ) : isError || !detail ? (
            <div className="py-20 text-center space-y-2">
              <p className="text-sm font-bold text-stone-700">Could not load response record</p>
              <p className="text-xs text-stone-500">Please verify your connection and try again.</p>
            </div>
          ) : (
            <div className="space-y-6 max-w-4xl mx-auto print:max-w-full print:w-full print:space-y-5">
              {/* Executive Document Header for Print Only */}
              <div className="hidden print:block pb-4 mb-4 border-b-2 border-stone-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-xl font-bold text-stone-900 tracking-tight">Exit Interview Response Record</h1>
                    <p className="text-xs text-stone-600 mt-0.5">Official employee exit feedback record · Confidential HR document</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                      Verified Submission
                    </span>
                    <span className="text-[11px] text-stone-500 block mt-1">
                      Printed: {new Date().toLocaleDateString(undefined, { dateStyle: 'medium' })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 1: Employee Information Overview Grid */}
              <div className="p-5 sm:p-6 rounded-3xl border border-[#ebdada] bg-white shadow-2xs space-y-5 break-inside-avoid">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#f2e7e9] pb-4">
                  <div className="flex items-center gap-3.5">
                    {detail.company.logoUrl ? (
                      <div className="w-12 h-12 rounded-xl border border-[#ebdce1] p-1 bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-2xs">
                        <img
                          src={detail.company.logoUrl}
                          alt={detail.company.name}
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                    ) : (
                      <div
                        className="w-12 h-12 rounded-xl text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-2xs"
                        style={{ backgroundColor: detail.company.brandPrimaryColor || '#59424f' }}
                      >
                        {detail.company.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <b className="text-sm text-stone-800 block">{detail.company.name}</b>
                      <span className="text-xs text-stone-500 block">
                        Template: {detail.template.name} · Version {detail.template.version}
                      </span>
                    </div>
                  </div>

                  <div className="text-left sm:text-right">
                    <span className="text-[11px] text-stone-400 block font-medium uppercase tracking-wider">
                      Submission Timestamp
                    </span>
                    <b className="text-xs text-stone-800">
                      {detail.submissionDate
                        ? new Intl.DateTimeFormat(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }).format(new Date(detail.submissionDate))
                        : '—'}
                    </b>
                  </div>
                </div>

                {/* 4-column compact employee metadata grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div className="p-3 rounded-2xl bg-[#fffdfb] border border-[#f2e7e9]">
                    <span className="text-[11px] text-stone-400 block font-medium">Departing Employee</span>
                    <b className="text-stone-800 text-sm block mt-0.5 truncate">{detail.employee.name}</b>
                    <span className="text-[11px] text-[#8c5369] font-mono font-semibold block">
                      {detail.employee.code}
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-[#fffdfb] border border-[#f2e7e9]">
                    <span className="text-[11px] text-stone-400 block font-medium">Role & Department</span>
                    <b className="text-stone-800 text-xs block mt-0.5 truncate">{detail.employee.designation}</b>
                    <span className="text-[11px] text-stone-600 block truncate">
                      {detail.employee.department}
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-[#fffdfb] border border-[#f2e7e9]">
                    <span className="text-[11px] text-stone-400 block font-medium">Service Timeline</span>
                    <div className="text-[11px] text-stone-700 mt-0.5 space-y-0.5">
                      <div>Joined: <b className="text-stone-800">{formatDate(detail.employee.hireDate)}</b></div>
                      <div>Last Day: <b className="text-stone-800">{formatDate(detail.employee.exitDate)}</b></div>
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-[#fffdfb] border border-[#f2e7e9]">
                    <span className="text-[11px] text-stone-400 block font-medium">Contact & Exit Details</span>
                    <div className="text-[11px] text-stone-700 mt-0.5 space-y-0.5">
                      <div className="truncate" title={detail.employee.workEmail || undefined}>
                        Email: <b className="text-stone-800">{detail.employee.workEmail || '—'}</b>
                      </div>
                      {resignationDate && (
                        <div>Notice: <b className="text-stone-800">{formatDate(resignationDate)}</b></div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Response Completion & Statistics Overview */}
              <div className="p-5 sm:p-6 rounded-3xl border border-[#ebdada] bg-gradient-to-r from-[#fffbfb] via-[#fff8fa] to-[#faf1f5] shadow-2xs space-y-4 break-inside-avoid">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-[#8c5369]" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#8c5369]">
                      Response Completion Overview
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-stone-700">
                    <span>Completion Rate:</span>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
                      {stats.percentage}%
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2 rounded-full bg-stone-200/80 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#bd7b92] to-[#8c5369] transition-all duration-500"
                    style={{ width: `${stats.percentage}%` }}
                  />
                </div>

                {/* Stat metric tiles */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="p-2.5 rounded-xl bg-white border border-[#f0e4e7] shadow-3xs">
                    <span className="text-[10px] text-stone-400 font-semibold uppercase tracking-wider block">
                      Total Questions
                    </span>
                    <b className="text-lg font-bold text-stone-800">{stats.total}</b>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white border border-[#f0e4e7] shadow-3xs">
                    <span className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wider block">
                      Answered
                    </span>
                    <b className="text-lg font-bold text-emerald-700">{stats.answered}</b>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white border border-[#f0e4e7] shadow-3xs">
                    <span className="text-[10px] text-stone-400 font-semibold uppercase tracking-wider block">
                      Unanswered Optional
                    </span>
                    <b className="text-lg font-bold text-stone-600">{stats.unanswered}</b>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white border border-[#f0e4e7] shadow-3xs">
                    <span className="text-[10px] text-[#8c5369] font-semibold uppercase tracking-wider block">
                      Avg Rating Given
                    </span>
                    <b className="text-lg font-bold text-[#8c5369]">
                      {stats.avgRating ? `${stats.avgRating} / 5` : '—'}
                    </b>
                  </div>
                </div>
              </div>

              {/* All 9 Sections Cards */}
              <div className="space-y-6">
                {detail.sections.map((section, secIdx) => {
                  const letter = String.fromCharCode(65 + secIdx);
                  return (
                    <div
                      key={section.id}
                      id={`section-${section.id}`}
                      className="p-5 sm:p-7 rounded-3xl border border-[#ebdada] bg-white shadow-2xs space-y-5 break-inside-avoid scroll-mt-20"
                    >
                      {/* Section Card Header */}
                      <div className="border-b border-[#f0e4e6] pb-3">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-[#f4e6ec] text-[#8c5369]">
                            Section {letter}
                          </span>
                          <span className="text-xs text-stone-400">
                            ({section.questions.length} questions)
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-stone-800 mt-1">{section.title}</h3>
                        {section.description && (
                          <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">
                            {section.description}
                          </p>
                        )}
                      </div>

                      {/* Question & Answer List */}
                      <div className="space-y-5">
                        {section.questions.map((q, qIdx) => {
                          const isAnswered =
                            q.rawAnswer !== undefined &&
                            q.rawAnswer !== null &&
                            q.rawAnswer !== '' &&
                            q.rawAnswer !== '-' &&
                            !(Array.isArray(q.rawAnswer) && q.rawAnswer.length === 0);

                          return (
                            <div key={q.id} className="space-y-2 text-xs">
                              {/* Question Label */}
                              <div className="flex items-start gap-2">
                                <span className="font-bold text-[#8c5369] shrink-0 mt-0.5">
                                  {qIdx + 1}.
                                </span>
                                <label className="font-semibold text-stone-800 block leading-snug">
                                  {q.label}
                                </label>
                              </div>

                              {/* Formatted Answer by Question Type */}
                              {!isAnswered ? (
                                <div className="pl-5">
                                  <span className="inline-block px-3 py-1 rounded-lg bg-stone-50 border border-stone-200/80 text-stone-400 text-xs italic">
                                    Not answered
                                  </span>
                                </div>
                              ) : q.type === 'rating_matrix' && q.matrixRows ? (
                                /* Rating Matrix Table */
                                <div className="pl-5 overflow-x-auto rounded-xl border border-stone-200 shadow-3xs">
                                  <table className="w-full text-xs">
                                    <thead className="bg-[#faf5f7] border-b border-stone-200">
                                      <tr>
                                        <th className="p-3 text-left text-stone-700 font-semibold">
                                          Evaluation Dimension
                                        </th>
                                        <th className="p-3 text-right text-stone-700 font-semibold w-40">
                                          Rating (1-5)
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {q.matrixRows.map(row => {
                                        const rawVal =
                                          typeof q.rawAnswer === 'object' && q.rawAnswer !== null
                                            ? q.rawAnswer[row.id]
                                            : undefined;
                                        const ratingInfo = rawVal ? ratingLabel(Number(rawVal)) : null;

                                        return (
                                          <tr key={row.id} className="border-t border-stone-100 hover:bg-[#fffdfb]">
                                            <td className="p-3 text-stone-700 font-medium">{row.label}</td>
                                            <td className="p-3 text-right">
                                              {ratingInfo ? (
                                                <span
                                                  className={`inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${ratingInfo.color}`}
                                                >
                                                  {ratingInfo.text}
                                                </span>
                                              ) : (
                                                <span className="text-stone-400 italic">Not rated</span>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              ) : q.type === 'rating' ? (
                                /* Single Numerical Rating */
                                <div className="pl-5 flex items-center gap-3">
                                  <span
                                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold border ${
                                      ratingLabel(Number(q.rawAnswer)).color
                                    }`}
                                  >
                                    <Star size={13} className="fill-current text-amber-500 stroke-none" />
                                    <span>{ratingLabel(Number(q.rawAnswer)).text}</span>
                                  </span>

                                  {/* Visual 5-pip dots */}
                                  <div className="flex items-center gap-1">
                                    {[1, 2, 3, 4, 5].map(step => (
                                      <div
                                        key={step}
                                        className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                                          step <= Number(q.rawAnswer)
                                            ? 'bg-[#8c5369] text-white'
                                            : 'bg-stone-200 text-stone-400'
                                        }`}
                                      >
                                        {step}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : q.type === 'yes_no' ? (
                                /* Yes / No Semantic Pill */
                                <div className="pl-5">
                                  {String(q.rawAnswer).toLowerCase() === 'yes' ? (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      <Check size={13} />
                                      Yes
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-stone-100 text-stone-700 border border-stone-200">
                                      No
                                    </span>
                                  )}
                                </div>
                              ) : q.type === 'declaration' ? (
                                /* Declaration & Electronic Signature */
                                <div className="pl-5">
                                  <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-200 text-xs space-y-2">
                                    <div className="flex items-center gap-2 text-emerald-800 font-bold">
                                      <ShieldCheck size={16} />
                                      <span>Declaration Signed & Formally Confirmed</span>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-stone-700 pt-1">
                                      <div>
                                        <span className="text-stone-400 block text-[11px]">
                                          Electronic Signature:
                                        </span>
                                        <b className="font-serif italic text-stone-900 text-sm">
                                          {typeof q.rawAnswer === 'object' && q.rawAnswer?.signature
                                            ? q.rawAnswer.signature
                                            : 'Confirmed electronically'}
                                        </b>
                                      </div>
                                      <div>
                                        <span className="text-stone-400 block text-[11px]">Date of Sign-off:</span>
                                        <b className="text-stone-800">
                                          {typeof q.rawAnswer === 'object' && q.rawAnswer?.date
                                            ? formatDate(q.rawAnswer.date)
                                            : '—'}
                                        </b>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ) : Array.isArray(q.rawAnswer) ? (
                                /* Multi-Choice Checkboxes Tags */
                                <div className="pl-5 flex flex-wrap gap-2 pt-0.5">
                                  {q.rawAnswer.map((item: string, i: number) => (
                                    <span
                                      key={i}
                                      className="px-3 py-1 bg-[#fbf5f7] border border-[#ebdce1] rounded-full text-[#59424f] text-xs font-semibold shadow-3xs"
                                    >
                                      {item}
                                    </span>
                                  ))}
                                </div>
                              ) : q.type === 'date' ? (
                                /* Date Answer */
                                <div className="pl-5 flex items-center gap-2 text-xs font-semibold text-stone-800">
                                  <Calendar size={14} className="text-[#8c5369]" />
                                  <span>{formatDate(String(q.rawAnswer))}</span>
                                </div>
                              ) : String(q.displayAnswer).length > 80 ? (
                                /* Long Text / Paragraph Answer */
                                <div className="pl-5">
                                  <div className="p-4 rounded-2xl bg-[#fffdfb] border border-[#f0e4e6] text-[#3d2f38] leading-relaxed whitespace-pre-wrap border-l-4 border-l-[#bd7b92] shadow-3xs">
                                    {q.displayAnswer}
                                  </div>
                                </div>
                              ) : (
                                /* Short Text / Single Choice Read-Only Container */
                                <div className="pl-5">
                                  <div className="px-3.5 py-2.5 rounded-xl bg-[#fffdfb] border border-[#f0e4e6] text-[#3d2f38] font-medium inline-block min-w-[200px] max-w-full shadow-3xs">
                                    {q.displayAnswer}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
