import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useExitResponseDetail } from '@/api/queries';
import {
  Building2,
  Calendar,
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
      return { text: '5 - Exceptional', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    case 4:
      return { text: '4 - Commendable', color: 'bg-teal-100 text-teal-800 border-teal-200' };
    case 3:
      return { text: '3 - Competent', color: 'bg-sky-100 text-sky-800 border-sky-200' };
    case 2:
      return { text: '2 - Marginal', color: 'bg-amber-100 text-amber-800 border-amber-200' };
    case 1:
      return { text: '1 - Unsatisfactory', color: 'bg-rose-100 text-rose-800 border-rose-200' };
    default:
      return { text: `${score} / 5`, color: 'bg-stone-100 text-stone-700 border-stone-200' };
  }
};

export function ResponseDetailDialog({ id, open, onOpenChange }: ResponseDetailDialogProps) {
  const { data: detail, isLoading, isError } = useExitResponseDetail(id || undefined);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);

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
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] h-[90vh] p-0 flex flex-col bg-[#fffdfb] overflow-hidden border border-[#ebdada]">
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-[#f0e4e6] flex flex-wrap items-center justify-between gap-3 bg-white no-print">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl text-white font-bold flex items-center justify-center shadow-xs text-sm"
              style={{ backgroundColor: detail?.company?.brandPrimaryColor || '#59424f' }}
            >
              <FileCheck size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-stone-800">
                  Exit Interview Response Record
                </h2>
                {detail && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[#ebdada] text-[#59424f]">
                    v{detail.template.version}
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-500">
                Verified submission record stored in People Journey database.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={!detail || isExportingPdf}
              className="primary-action text-xs px-3 py-1.5 flex items-center gap-1.5"
              title="Download Full Multi-Page PDF Report"
            >
              {isExportingPdf ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              <span>Download PDF</span>
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={!detail || isExportingExcel}
              className="secondary-action text-xs px-3 py-1.5 flex items-center gap-1.5"
              title="Download Clean Formatted Excel (.xlsx)"
            >
              {isExportingExcel ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}
              <span>Export Excel (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={!detail}
              className="secondary-action text-xs px-2.5 py-1.5 flex items-center gap-1.5"
              title="Print via Browser"
            >
              <Printer size={13} />
              <span className="hidden sm:inline">Print</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body / Printable Content */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 print-container">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="animate-spin text-[#59424f]" size={36} />
              <p className="text-xs text-stone-500">Loading structured response report…</p>
            </div>
          ) : isError || !detail ? (
            <div className="py-16 text-center space-y-2">
              <p className="text-sm font-semibold text-stone-700">Could not load response record</p>
              <p className="text-xs text-stone-500">Please verify your connection and try again.</p>
            </div>
          ) : (
            <div className="space-y-6 max-w-3xl mx-auto">
              {/* Employee & Company Overview Card */}
              <div className="p-5 rounded-2xl border border-[#ebdada] bg-white shadow-2xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-3">
                  <div className="flex items-center gap-3">
                    {detail.company.logoUrl ? (
                      <img
                        src={detail.company.logoUrl}
                        alt={detail.company.name}
                        className="h-8 max-w-[120px] object-contain rounded"
                      />
                    ) : (
                      <div
                        className="w-8 h-8 rounded-lg text-white font-bold text-xs flex items-center justify-center"
                        style={{ backgroundColor: detail.company.brandPrimaryColor || '#59424f' }}
                      >
                        {detail.company.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <b className="text-xs text-stone-800">{detail.company.name}</b>
                      <span className="text-[11px] text-stone-500 block">
                        Template: {detail.template.name} (v{detail.template.version})
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[11px] text-stone-400 block">Submitted On</span>
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

                {/* Employee metadata grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-stone-400 block">Departing Employee</span>
                    <b className="text-stone-800 font-semibold">{detail.employee.name}</b>
                    <span className="text-[11px] text-stone-500 font-mono block">
                      {detail.employee.code}
                    </span>
                  </div>
                  <div>
                    <span className="text-stone-400 block">Department</span>
                    <b className="text-stone-800">{detail.employee.department}</b>
                    <span className="text-[11px] text-stone-500 block">
                      {detail.employee.designation}
                    </span>
                  </div>
                  <div>
                    <span className="text-stone-400 block">Hire Date</span>
                    <b className="text-stone-800">{detail.employee.hireDate}</b>
                  </div>
                  <div>
                    <span className="text-stone-400 block">Exit Date</span>
                    <b className="text-stone-800">{detail.employee.exitDate}</b>
                  </div>
                </div>
              </div>

              {/* All 9 Sections */}
              <div className="space-y-6">
                {detail.sections.map((section, secIdx) => (
                  <div
                    key={section.id}
                    className="p-5 rounded-2xl border border-[#ebdada] bg-white shadow-2xs space-y-4 break-inside-avoid"
                  >
                    <div className="border-b border-[#f0e4e6] pb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-[#b67c90]">
                        Section {secIdx + 1}
                      </span>
                      <h3 className="text-sm font-bold text-stone-800">{section.title}</h3>
                      {section.description && (
                        <p className="text-xs text-stone-500 mt-0.5">{section.description}</p>
                      )}
                    </div>

                    <div className="space-y-4">
                      {section.questions.map((q, qIdx) => (
                        <div key={q.id} className="space-y-1.5 text-xs">
                          <label className="font-semibold text-stone-700 block leading-snug">
                            <span className="text-stone-400 mr-1.5">{qIdx + 1}.</span>
                            {q.label}
                          </label>

                          {/* Matrix Rating Display */}
                          {q.type === 'rating_matrix' && q.matrixRows ? (
                            <div className="overflow-x-auto rounded-lg border border-stone-200 mt-1">
                              <table className="w-full text-xs">
                                <thead className="bg-stone-50 border-b border-stone-200">
                                  <tr>
                                    <th className="p-2.5 text-left text-stone-600 font-semibold">Evaluation Statement</th>
                                    <th className="p-2.5 text-right text-stone-600 font-semibold w-36">Rating (1-5)</th>
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
                                      <tr key={row.id} className="border-t border-stone-100">
                                        <td className="p-2.5 text-stone-700">{row.label}</td>
                                        <td className="p-2.5 text-right">
                                          {ratingInfo ? (
                                            <span
                                              className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-bold border ${ratingInfo.color}`}
                                            >
                                              {ratingInfo.text}
                                            </span>
                                          ) : (
                                            <span className="text-stone-400">—</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          ) : q.type === 'rating' ? (
                            /* Single Rating */
                            <div className="pt-0.5">
                              {q.rawAnswer ? (
                                <span
                                  className={`inline-block px-3 py-1 rounded text-xs font-bold border ${
                                    ratingLabel(Number(q.rawAnswer)).color
                                  }`}
                                >
                                  {ratingLabel(Number(q.rawAnswer)).text}
                                </span>
                              ) : (
                                <span className="text-stone-400 italic">No rating given</span>
                              )}
                            </div>
                          ) : q.type === 'declaration' ? (
                            /* Declaration & Signature */
                            <div className="p-3.5 rounded-xl bg-emerald-50/50 border border-emerald-200 text-xs space-y-2">
                              <div className="flex items-center gap-2 text-emerald-800 font-bold">
                                <ShieldCheck size={16} />
                                <span>Declaration Signed & Confirmed</span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-stone-700 pt-1">
                                <div>
                                  <span className="text-stone-400 block text-[11px]">Electronic Signature:</span>
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
                                      ? q.rawAnswer.date
                                      : '—'}
                                  </b>
                                </div>
                              </div>
                            </div>
                          ) : Array.isArray(q.rawAnswer) ? (
                            /* Multi-Choice Checkboxes */
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {q.rawAnswer.length > 0 ? (
                                q.rawAnswer.map((item: string, i: number) => (
                                  <span
                                    key={i}
                                    className="px-2.5 py-0.5 bg-stone-100 border border-stone-200 rounded text-stone-800 text-xs font-medium"
                                  >
                                    {item}
                                  </span>
                                ))
                              ) : (
                                <span className="text-stone-400 italic">None selected</span>
                              )}
                            </div>
                          ) : (
                            /* Text / Paragraph / Single Choice */
                            <div className="p-3 rounded-lg bg-stone-50 border border-stone-100 text-stone-800 whitespace-pre-wrap leading-relaxed">
                              {q.displayAnswer && q.displayAnswer !== '-' ? (
                                q.displayAnswer
                              ) : (
                                <span className="text-stone-400 italic">No comment provided</span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

