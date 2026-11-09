import React from 'react';
import {
  Building2,
  Mail,
  Phone,
  Globe,
  MapPin,
  User,
  Clock,
  ShieldCheck,
  ExternalLink,
  Edit3,
  CheckCircle2,
  Sparkles,
  FileText,
  Palette,
} from 'lucide-react';
import type { CompanyProfile } from '@/types/api';
import { TIMEZONE_OPTIONS } from '@/components/ui/timezone-select';

interface CompanyProfileOverviewProps {
  profile: CompanyProfile;
  onEdit: () => void;
  onOpenTemplateEditor?: () => void;
  onPreviewTemplate?: () => void;
}

export function CompanyProfileOverview({
  profile,
  onEdit,
  onOpenTemplateEditor,
  onPreviewTemplate,
}: CompanyProfileOverviewProps) {
  const tzOption = TIMEZONE_OPTIONS.find(t => t.value === (profile.timezone || 'UTC'));
  const tzDisplay = tzOption ? `${tzOption.value} (${tzOption.city} · ${tzOption.offset})` : (profile.timezone || 'UTC');

  return (
    <div className="bg-white rounded-3xl border border-[#eadfe0] shadow-xs overflow-hidden mb-8 transition-all">
      {/* Top Banner / Hero Card */}
      <div className="p-6 sm:p-7 bg-gradient-to-r from-[#fbf5f7] via-[#fffbfb] to-[#f9f2f5] border-b border-[#f0e4e7]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            {/* Logo or Branded Avatar */}
            {profile.logoUrl ? (
              <div className="w-16 h-16 rounded-2xl border border-[#ebdce1] p-1.5 bg-white shadow-xs flex items-center justify-center shrink-0 overflow-hidden">
                <img
                  src={profile.logoUrl}
                  alt={`${profile.companyName} logo`}
                  className="max-h-full max-w-full object-contain"
                  onError={e => {
                    (e.target as HTMLImageElement).style.opacity = '0.3';
                  }}
                />
              </div>
            ) : (
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-xs shrink-0"
                style={{ backgroundColor: profile.brandPrimaryColor || '#59424f' }}
              >
                {(profile.companyName || 'C').charAt(0).toUpperCase()}
              </div>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-bold text-[#3d2f38] truncate">
                  {profile.displayName || profile.companyName}
                </h2>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 size={13} className="text-emerald-600" />
                  Configuration Complete
                </span>
              </div>

              {/* Sub-tags */}
              <div className="flex items-center gap-2 text-xs text-[#72616c] mt-1 flex-wrap">
                {profile.industry && <span>{profile.industry}</span>}
                {profile.industry && (profile.country || profile.officeLocation) && <span>•</span>}
                {profile.country && <span>{profile.country}</span>}
                {profile.country && profile.officeLocation && <span>•</span>}
                {profile.officeLocation && <span>{profile.officeLocation}</span>}
              </div>

              <p className="text-[11px] text-[#937f8a] mt-0.5">
                Company profile information is saved and active across hosted exit forms.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onEdit}
            className="self-start sm:self-center inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[#ebdce1] bg-white hover:bg-[#faf4f6] text-[#3d2f38] text-xs font-semibold shadow-2xs transition-all hover:border-[#bd7b92] shrink-0"
          >
            <Edit3 size={14} className="text-[#8c5369]" />
            <span>Edit Company Details</span>
          </button>
        </div>
      </div>

      {/* Structured Overview Grid */}
      <div className="p-6 sm:p-7 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 bg-white">
        {/* Card 1: Official Corporate Details */}
        <div className="p-4 rounded-2xl border border-[#f0e4e7] bg-[#fffdfb] space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#935269]">
            <Building2 size={15} />
            <span>Corporate Details</span>
          </div>

          <div className="space-y-2 text-xs">
            <div>
              <span className="text-[11px] text-[#8c7b85] block">Legal Name</span>
              <span className="font-semibold text-[#3d2f38]">{profile.companyName}</span>
            </div>

            {profile.companyWebsite ? (
              <div>
                <span className="text-[11px] text-[#8c7b85] block">Website</span>
                <a
                  href={profile.companyWebsite.startsWith('http') ? profile.companyWebsite : `https://${profile.companyWebsite}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[#8c5369] hover:underline inline-flex items-center gap-1 truncate max-w-full"
                >
                  <span className="truncate">{profile.companyWebsite}</span>
                  <ExternalLink size={12} className="shrink-0" />
                </a>
              </div>
            ) : (
              <div>
                <span className="text-[11px] text-[#8c7b85] block">Website</span>
                <span className="text-stone-400 italic">Not specified</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[11px] text-[#8c7b85] block">Email</span>
                <span className="font-medium text-[#3d2f38] truncate block" title={profile.companyEmail || undefined}>
                  {profile.companyEmail || '—'}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-[#8c7b85] block">Phone</span>
                <span className="font-medium text-[#3d2f38] truncate block">
                  {profile.companyPhone || '—'}
                </span>
              </div>
            </div>

            {profile.companyAddress && (
              <div>
                <span className="text-[11px] text-[#8c7b85] block">Registered Address</span>
                <p className="text-stone-600 text-[11px] line-clamp-2">{profile.companyAddress}</p>
              </div>
            )}
          </div>
        </div>

        {/* Card 2: HR Operations & Signatures */}
        <div className="p-4 rounded-2xl border border-[#f0e4e7] bg-[#fffdfb] space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#935269]">
            <User size={15} />
            <span>HR Operations</span>
          </div>

          <div className="space-y-2 text-xs">
            <div>
              <span className="text-[11px] text-[#8c7b85] block">Primary HR Contact</span>
              <span className="font-semibold text-[#3d2f38]">
                {profile.hrContactName || 'HR Team Member'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <span className="text-[11px] text-[#8c7b85] block">Official Email</span>
                <span className="font-medium text-[#3d2f38] truncate block" title={profile.hrContactEmail || undefined}>
                  {profile.hrContactEmail || '—'}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-[#8c7b85] block">Phone</span>
                <span className="font-medium text-[#3d2f38] truncate block">
                  {profile.hrContactPhone || '—'}
                </span>
              </div>
            </div>

            <div>
              <span className="text-[11px] text-[#8c7b85] block">Department / Team</span>
              <span className="font-medium text-[#3d2f38]">
                {profile.departmentTeam || 'Human Resources'}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-[#8c7b85] block">Timezone</span>
              <div className="flex items-center gap-1.5 text-stone-700 font-medium">
                <Clock size={13} className="text-[#8c5369] shrink-0" />
                <span className="truncate">{tzDisplay}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Brand & Form System */}
        <div className="p-4 rounded-2xl border border-[#f0e4e7] bg-[#fffdfb] space-y-3 md:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#935269]">
            <Palette size={15} />
            <span>Brand & Feedback Form</span>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <span className="text-[11px] text-[#8c7b85] block mb-1">Brand Primary Accent</span>
              <div className="flex items-center gap-2.5">
                <div
                  className="w-6 h-6 rounded-lg border border-black/10 shadow-2xs shrink-0"
                  style={{ backgroundColor: profile.brandPrimaryColor || '#59424f' }}
                />
                <span className="font-mono text-stone-700 text-xs font-semibold">
                  {profile.brandPrimaryColor || '#59424f'}
                </span>
                <span
                  className="text-[10px] px-2 py-0.5 rounded-md font-semibold text-white ml-auto"
                  style={{ backgroundColor: profile.brandPrimaryColor || '#59424f' }}
                >
                  Live Accent
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-[#f3e7e9]">
              <span className="text-[11px] text-[#8c7b85] block mb-1">Hosted Exit Form Status</span>
              <div className="flex items-center gap-1.5 text-emerald-800 font-medium bg-emerald-50/80 border border-emerald-200/70 p-2 rounded-xl text-[11px]">
                <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
                <span>9-Section Master Template Active</span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              {onPreviewTemplate && (
                <button
                  type="button"
                  onClick={onPreviewTemplate}
                  className="flex-1 py-1.5 px-2.5 rounded-lg border border-[#ebdce1] hover:bg-stone-50 text-[11px] font-semibold text-stone-700 text-center transition-colors"
                >
                  Preview Form
                </button>
              )}
              {onOpenTemplateEditor && (
                <button
                  type="button"
                  onClick={onOpenTemplateEditor}
                  className="flex-1 py-1.5 px-2.5 rounded-lg bg-[#59424f] hover:bg-[#46333e] text-[11px] font-semibold text-white text-center transition-colors"
                >
                  Customize Form
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

