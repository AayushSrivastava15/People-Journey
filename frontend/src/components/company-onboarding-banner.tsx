import { useState } from 'react';
import { useLocation } from 'wouter';
import { CheckCircle2, ChevronRight, Sparkles, Building2, Palette, UserCheck, FileText, ArrowRight, Eye, Edit3 } from 'lucide-react';
import { useCompanyOnboardingStatus } from '@/api/queries';

interface CompanyOnboardingBannerProps {
  onOpenTemplateEditor?: () => void;
  onPreviewTemplate?: () => void;
}

export function CompanyOnboardingBanner({
  onOpenTemplateEditor,
  onPreviewTemplate,
}: CompanyOnboardingBannerProps) {
  const [, setLocation] = useLocation();
  const { data: status, isLoading } = useCompanyOnboardingStatus();
  const [dismissed, setDismissed] = useState(false);

  if (isLoading || !status || status.setupCompleted || dismissed) {
    return null;
  }

  const steps = [
    {
      id: 'details',
      label: 'Company Details',
      desc: 'Legal name, industry & address',
      icon: Building2,
      done: status.steps.details,
    },
    {
      id: 'branding',
      label: 'Company Branding',
      desc: 'Logo, brand colors & display name',
      icon: Palette,
      done: status.steps.branding,
    },
    {
      id: 'hrContact',
      label: 'HR Contact Details',
      desc: 'Primary contact for employee touchpoints',
      icon: UserCheck,
      done: status.steps.hrContact,
    },
    {
      id: 'exitForm',
      label: 'Exit Interview Setup',
      desc: 'Default 9-section master form ready',
      icon: FileText,
      done: status.steps.exitForm,
    },
  ];

  return (
    <div className="mb-8 rounded-3xl border border-[#ebdce1] 'bg-gradient-to-br' from-[#fffbfa] via-[#fff5f7] to-[#fbf2f4] p-6 md:p-8 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-[#f3e1e6]">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#fce8ed] border border-[#f5d0dc] text-[#935269] text-xs font-semibold mb-3">
            <Sparkles size={13} />
            <span>Workspace Setup · Guided Onboarding</span>
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-[#3d2f38] tracking-tight">
            Welcome to People Journey!
          </h2>
          <p className="text-sm text-[#72616c] mt-1 max-w-2xl leading-relaxed">
            Let&apos;s set up your company workspace before managing employee lifecycle activities.
            Configure your branding and contact details to automatically personalize employee exit feedback surveys and communications.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setLocation('/dashboard/settings')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#59424f] hover:bg-[#46333e] text-white text-xs font-semibold shadow-sm transition-all"
          >
            <span>Complete Company Setup</span>
            <ArrowRight size={14} />
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="px-4 py-2.5 rounded-xl border border-[#ebdce1] bg-white/80 hover:bg-white text-[#72616c] text-xs font-medium transition-colors"
          >
            Continue to Dashboard
          </button>
        </div>
      </div>

      {/* Progress Indicator */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-[#8c5369] uppercase tracking-wider">
            Company setup: {status.stepsCompleted} of {status.totalSteps} completed
          </span>
          <span className="text-xs font-medium text-[#72616c]">
            {Math.round((status.stepsCompleted / status.totalSteps) * 100)}% Ready
          </span>
        </div>

        <div className="w-full h-2 rounded-full bg-[#fae5eb] overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#bd7b92] to-[#8c5369] transition-all duration-500 rounded-full"
            style={{ width: `${(status.stepsCompleted / status.totalSteps) * 100}%` }}
          />
        </div>

        {/* 4 Steps Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          {steps.map((st, idx) => {
            const Icon = st.icon;
            return (
              <div
                key={st.id}
                onClick={() => setLocation('/dashboard/settings')}
                className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                  st.done
                    ? 'bg-white/90 border-[#e5d4d9] text-[#3d2f38]'
                    : 'bg-white/60 border-dashed border-[#e8d5da] text-[#7a6a75] hover:bg-white'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                      st.done ? 'bg-[#f7e6eb] text-[#8c5369]' : 'bg-stone-100 text-stone-500'
                    }`}
                  >
                    <Icon size={16} />
                  </div>
                  {st.done ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                      <CheckCircle2 size={13} />
                      Done
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-stone-400">Step {idx + 1}</span>
                  )}
                </div>
                <h3 className="text-xs font-bold text-[#3d2f38]">{st.label}</h3>
                <p className="text-[11px] text-[#7a6a75] mt-0.5 leading-snug">{st.desc}</p>
              </div>
            );
          })}
        </div>

        {/* Exit Interview Readiness Card */}
        <div className="mt-5 p-4 rounded-2xl bg-white border border-[#ebdce1] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#fcf0f3] border border-[#f5d5de] flex items-center justify-center text-[#8c5369] shrink-0">
              <FileText size={18} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[#3d2f38]">
                Your Default Exit Feedback Questionnaire is Ready!
              </h4>
              <p className="text-[11px] text-[#72616c]">
                People Journey has prepared the comprehensive 9-section master questionnaire. You can use it immediately or customize questions.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onPreviewTemplate && (
              <button
                type="button"
                onClick={onPreviewTemplate}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#ebdce1] bg-[#fbf5f7] hover:bg-[#f6eaee] text-xs font-medium text-[#72616c] transition-colors"
              >
                <Eye size={13} />
                <span>Preview Default Form</span>
              </button>
            )}
            {onOpenTemplateEditor && (
              <button
                type="button"
                onClick={onOpenTemplateEditor}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#ebdce1] bg-white hover:bg-stone-50 text-xs font-medium text-[#72616c] transition-colors"
              >
                <Edit3 size={13} />
                <span>Customize Form</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
