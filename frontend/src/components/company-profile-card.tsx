import { useState, useEffect } from 'react';
import {
  Building2,
  Mail,
  Phone,
  Globe,
  MapPin,
  User,
  Check,
  Loader2,
  Sparkles,
  AlertCircle,
  Palette,
  FileText,
  Clock,
  ShieldCheck,
  ExternalLink,
  Edit3,
} from 'lucide-react';
import { useCompanyProfile, useUpdateCompanyProfile, useCompanyOnboardingStatus } from '@/api/queries';
import { useToast } from '@/hooks/use-toast';

interface CompanyProfileCardProps {
  onOpenTemplateEditor?: () => void;
  onPreviewTemplate?: () => void;
}

const PRESET_COLORS = ['#59424f', '#2563eb', '#0d9488', '#4f46e5', '#7c3aed', '#b91c1c', '#ea580c', '#334155'];

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export function CompanyProfileCard({
  onOpenTemplateEditor,
  onPreviewTemplate,
}: CompanyProfileCardProps) {
  const { data: profile, isLoading } = useCompanyProfile();
  const { data: onboarding } = useCompanyOnboardingStatus();
  const updateMutation = useUpdateCompanyProfile();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<'details' | 'branding' | 'hr' | 'exit'>('details');

  const [formData, setFormData] = useState({
    companyName: '',
    displayName: '',
    logoUrl: '',
    brandPrimaryColor: '#59424f',
    industry: '',
    companyWebsite: '',
    companyAddress: '',
    officeLocation: '',
    companyEmail: '',
    companyPhone: '',
    country: '',
    timezone: 'UTC',
    hrContactName: '',
    hrContactEmail: '',
    hrContactPhone: '',
    departmentTeam: '',
    defaultSenderName: '',
    defaultEmailSignature: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (profile) {
      setFormData({
        companyName: profile.companyName || '',
        displayName: profile.displayName || profile.companyName || '',
        logoUrl: profile.logoUrl || '',
        brandPrimaryColor: profile.brandPrimaryColor || '#59424f',
        industry: profile.industry || '',
        companyWebsite: profile.companyWebsite || '',
        companyAddress: profile.companyAddress || '',
        officeLocation: profile.officeLocation || profile.companyAddress || '',
        companyEmail: profile.companyEmail || '',
        companyPhone: profile.companyPhone || '',
        country: profile.country || '',
        timezone: profile.timezone || 'UTC',
        hrContactName: profile.hrContactName || '',
        hrContactEmail: profile.hrContactEmail || '',
        hrContactPhone: profile.hrContactPhone || '',
        departmentTeam: profile.departmentTeam || '',
        defaultSenderName: profile.defaultSenderName || profile.hrContactName || '',
        defaultEmailSignature: profile.defaultEmailSignature || '',
      });
    }
  }, [profile]);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.companyName.trim()) {
      newErrors.companyName = 'Company legal name is required';
    }
    if (formData.companyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.companyEmail)) {
      newErrors.companyEmail = 'Invalid company email format';
    }
    if (formData.hrContactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.hrContactEmail)) {
      newErrors.hrContactEmail = 'Invalid HR contact email format';
    }
    if (formData.brandPrimaryColor && !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(formData.brandPrimaryColor)) {
      newErrors.brandPrimaryColor = 'Color must be a valid hex code (e.g. #59424f)';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!validate()) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Please correct the highlighted fields before saving.',
      });
      return;
    }

    try {
      await updateMutation.mutateAsync({
        companyName: formData.companyName.trim(),
        displayName: formData.displayName.trim() || undefined,
        logoUrl: formData.logoUrl.trim() || undefined,
        brandPrimaryColor: formData.brandPrimaryColor.trim() || '#59424f',
        industry: formData.industry.trim() || undefined,
        companyWebsite: formData.companyWebsite.trim() || undefined,
        companyAddress: formData.companyAddress.trim() || undefined,
        officeLocation: formData.officeLocation.trim() || undefined,
        companyEmail: formData.companyEmail.trim() || undefined,
        companyPhone: formData.companyPhone.trim() || undefined,
        country: formData.country.trim() || undefined,
        timezone: formData.timezone || 'UTC',
        hrContactName: formData.hrContactName.trim() || undefined,
        hrContactEmail: formData.hrContactEmail.trim() || undefined,
        hrContactPhone: formData.hrContactPhone.trim() || undefined,
        departmentTeam: formData.departmentTeam.trim() || undefined,
        defaultSenderName: formData.defaultSenderName.trim() || formData.hrContactName.trim() || undefined,
        defaultEmailSignature: formData.defaultEmailSignature.trim() || undefined,
        setupCompleted: true,
      });

      toast({
        title: 'Company Workspace Saved',
        description: 'Your company details and branding will now dynamically personalize employee exit forms.',
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: (err as Error).message || 'Failed to update company profile.',
      });
    }
  };

  if (isLoading) {
    return (
      <section className="panel" style={{ padding: '32px', textAlign: 'center', color: '#887582' }}>
        <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', color: '#bd7b92' }} />
        <span>Loading company settings…</span>
      </section>
    );
  }

  return (
    <div className="bg-white rounded-3xl border border-[#eadfe0] shadow-sm overflow-hidden mb-8">
      {/* Header */}
      <div className="p-6 md:p-8 bg-[#faf4f6] border-b border-[#f0e4e7] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#935269]">
            Company Configuration
          </span>
          <h2 className="text-xl md:text-2xl font-bold text-[#3d2f38] mt-0.5">
            {formData.displayName || formData.companyName || 'Company Workspace Settings'}
          </h2>
          <p className="text-xs md:text-sm text-[#72616c] mt-1">
            Manage your company details, brand appearance, HR contacts, and hosted feedback questionnaires.
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleSave()}
          disabled={updateMutation.isPending}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#59424f] hover:bg-[#46333e] text-white text-xs font-semibold shadow-sm transition-all shrink-0 disabled:opacity-50"
        >
          {updateMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          <span>Save Changes</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#f0e4e7] bg-[#fffafb] px-6 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('details')}
          className={`py-3.5 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all shrink-0 ${
            activeTab === 'details'
              ? 'border-[#bd7b92] text-[#8c5369]'
              : 'border-transparent text-[#72616c] hover:text-[#3d2f38]'
          }`}
        >
          <Building2 size={15} />
          <span>Step 1: Company Details</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('branding')}
          className={`py-3.5 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all shrink-0 ${
            activeTab === 'branding'
              ? 'border-[#bd7b92] text-[#8c5369]'
              : 'border-transparent text-[#72616c] hover:text-[#3d2f38]'
          }`}
        >
          <Palette size={15} />
          <span>Step 2: Company Branding</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('hr')}
          className={`py-3.5 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all shrink-0 ${
            activeTab === 'hr'
              ? 'border-[#bd7b92] text-[#8c5369]'
              : 'border-transparent text-[#72616c] hover:text-[#3d2f38]'
          }`}
        >
          <User size={15} />
          <span>Step 3: HR Contact Details</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('exit')}
          className={`py-3.5 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all shrink-0 ${
            activeTab === 'exit'
              ? 'border-[#bd7b92] text-[#8c5369]'
              : 'border-transparent text-[#72616c] hover:text-[#3d2f38]'
          }`}
        >
          <FileText size={15} />
          <span>Step 4: Exit Feedback Setup</span>
        </button>
      </div>

      {/* Tab Panels */}
      <form onSubmit={handleSave} className="p-6 md:p-8">
        {activeTab === 'details' && (
          <div className="space-y-6 max-w-4xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-[#3d2f38] mb-1.5">
                  Company Legal Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Building2 size={16} className="absolute left-3.5 top-3 text-[#a8959d]" />
                  <input
                    type="text"
                    value={formData.companyName}
                    onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                    placeholder="e.g. Infravision Transmission Solutions Pvt. Ltd."
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-xs text-[#3d2f38] focus:outline-none transition-colors ${
                      errors.companyName ? 'border-rose-400 bg-rose-50/30' : 'border-[#e5d4d9] focus:border-[#bd7b92]'
                    }`}
                  />
                </div>
                {errors.companyName && <p className="text-[11px] text-rose-500 mt-1">{errors.companyName}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#3d2f38] mb-1.5">Industry</label>
                <input
                  type="text"
                  value={formData.industry}
                  onChange={e => setFormData({ ...formData, industry: e.target.value })}
                  placeholder="e.g. Engineering & Power Infrastructure"
                  className="w-full px-4 py-2.5 rounded-xl border border-[#e5d4d9] text-xs text-[#3d2f38] focus:outline-none focus:border-[#bd7b92]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#3d2f38] mb-1.5">Company Website</label>
                <div className="relative">
                  <Globe size={16} className="absolute left-3.5 top-3 text-[#a8959d]" />
                  <input
                    type="url"
                    value={formData.companyWebsite}
                    onChange={e => setFormData({ ...formData, companyWebsite: e.target.value })}
                    placeholder="https://example.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#e5d4d9] text-xs text-[#3d2f38] focus:outline-none focus:border-[#bd7b92]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#3d2f38] mb-1.5">Company Email</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-3 text-[#a8959d]" />
                  <input
                    type="email"
                    value={formData.companyEmail}
                    onChange={e => setFormData({ ...formData, companyEmail: e.target.value })}
                    placeholder="contact@company.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#e5d4d9] text-xs text-[#3d2f38] focus:outline-none focus:border-[#bd7b92]"
                  />
                </div>
                {errors.companyEmail && <p className="text-[11px] text-rose-500 mt-1">{errors.companyEmail}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#3d2f38] mb-1.5">Company Phone</label>
                <div className="relative">
                  <Phone size={16} className="absolute left-3.5 top-3 text-[#a8959d]" />
                  <input
                    type="tel"
                    value={formData.companyPhone}
                    onChange={e => setFormData({ ...formData, companyPhone: e.target.value })}
                    placeholder="+91 22 1234 5678"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#e5d4d9] text-xs text-[#3d2f38] focus:outline-none focus:border-[#bd7b92]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#3d2f38] mb-1.5">Country</label>
                <input
                  type="text"
                  value={formData.country}
                  onChange={e => setFormData({ ...formData, country: e.target.value })}
                  placeholder="e.g. India, United States"
                  className="w-full px-4 py-2.5 rounded-xl border border-[#e5d4d9] text-xs text-[#3d2f38] focus:outline-none focus:border-[#bd7b92]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#3d2f38] mb-1.5">Time Zone</label>
                <select
                  value={formData.timezone}
                  onChange={e => setFormData({ ...formData, timezone: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-[#e5d4d9] text-xs text-[#3d2f38] focus:outline-none focus:border-[#bd7b92] bg-white"
                >
                  {TIMEZONES.map(tz => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#3d2f38] mb-1.5">Office / Site Location</label>
                <div className="relative">
                  <MapPin size={16} className="absolute left-3.5 top-3 text-[#a8959d]" />
                  <input
                    type="text"
                    value={formData.officeLocation}
                    onChange={e => setFormData({ ...formData, officeLocation: e.target.value })}
                    placeholder="e.g. Mumbai Corporate Office"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#e5d4d9] text-xs text-[#3d2f38] focus:outline-none focus:border-[#bd7b92]"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#3d2f38] mb-1.5">Registered Office Address</label>
              <textarea
                rows={2}
                value={formData.companyAddress}
                onChange={e => setFormData({ ...formData, companyAddress: e.target.value })}
                placeholder="Full street address, building, city, pin code..."
                className="w-full px-4 py-2.5 rounded-xl border border-[#e5d4d9] text-xs text-[#3d2f38] focus:outline-none focus:border-[#bd7b92]"
              />
            </div>

            <div className="flex justify-end pt-4">
              <button
                type="button"
                onClick={() => setActiveTab('branding')}
                className="px-5 py-2.5 rounded-xl bg-[#59424f] hover:bg-[#46333e] text-white text-xs font-semibold transition-colors"
              >
                Proceed to Branding →
              </button>
            </div>
          </div>
        )}

        {activeTab === 'branding' && (
          <div className="space-y-6 max-w-4xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-[#3d2f38] mb-1.5">Company Display Name</label>
                <input
                  type="text"
                  value={formData.displayName}
                  onChange={e => setFormData({ ...formData, displayName: e.target.value })}
                  placeholder="e.g. Infravision"
                  className="w-full px-4 py-2.5 rounded-xl border border-[#e5d4d9] text-xs text-[#3d2f38] focus:outline-none focus:border-[#bd7b92]"
                />
                <p className="text-[11px] text-[#72616c] mt-1">Used in employee-facing forms and email headers.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#3d2f38] mb-1.5">Brand Primary Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={formData.brandPrimaryColor}
                    onChange={e => setFormData({ ...formData, brandPrimaryColor: e.target.value })}
                    className="w-10 h-10 rounded-xl cursor-pointer border border-[#e5d4d9] p-1 bg-white"
                  />
                  <input
                    type="text"
                    value={formData.brandPrimaryColor}
                    onChange={e => setFormData({ ...formData, brandPrimaryColor: e.target.value })}
                    placeholder="#59424f"
                    className="w-32 px-3 py-2.5 rounded-xl border border-[#e5d4d9] text-xs text-[#3d2f38] font-mono focus:outline-none focus:border-[#bd7b92]"
                  />
                  <div className="flex items-center gap-1.5">
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setFormData({ ...formData, brandPrimaryColor: c })}
                        style={{ backgroundColor: c }}
                        className={`w-6 h-6 rounded-full border transition-transform ${
                          formData.brandPrimaryColor === c ? 'scale-125 border-black/40' : 'border-transparent'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#3d2f38] mb-1.5">Company Logo URL</label>
              <div className="flex items-start gap-4">
                <input
                  type="url"
                  value={formData.logoUrl}
                  onChange={e => setFormData({ ...formData, logoUrl: e.target.value })}
                  placeholder="https://example.com/logo.png"
                  className="flex-1 px-4 py-2.5 rounded-xl border border-[#e5d4d9] text-xs text-[#3d2f38] focus:outline-none focus:border-[#bd7b92]"
                />
                {formData.logoUrl && (
                  <div className="w-12 h-12 rounded-xl border border-[#ebdce1] p-1 bg-white flex items-center justify-center shrink-0 overflow-hidden">
                    <img
                      src={formData.logoUrl}
                      alt="Logo preview"
                      className="max-h-full max-w-full object-contain"
                      onError={e => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </div>
              <p className="text-[11px] text-[#72616c] mt-1">
                Direct image link (PNG, SVG, or JPG). Displayed prominently atop the employee feedback form.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#3d2f38] mb-1.5">Default Email Signature</label>
              <textarea
                rows={3}
                value={formData.defaultEmailSignature}
                onChange={e => setFormData({ ...formData, defaultEmailSignature: e.target.value })}
                placeholder="Warm regards,&#10;Human Resources Team&#10;{{company_name}}"
                className="w-full px-4 py-2.5 rounded-xl border border-[#e5d4d9] text-xs text-[#3d2f38] focus:outline-none focus:border-[#bd7b92]"
              />
            </div>

            <div className="flex justify-between pt-4">
              <button
                type="button"
                onClick={() => setActiveTab('details')}
                className="px-4 py-2 rounded-xl border border-[#e5d4d9] text-xs font-semibold text-[#72616c] hover:bg-stone-50"
              >
                ← Back to Details
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('hr')}
                className="px-5 py-2.5 rounded-xl bg-[#59424f] hover:bg-[#46333e] text-white text-xs font-semibold transition-colors"
              >
                Proceed to HR Contact →
              </button>
            </div>
          </div>
        )}

        {activeTab === 'hr' && (
          <div className="space-y-6 max-w-4xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-[#3d2f38] mb-1.5">
                  HR Contact Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User size={16} className="absolute left-3.5 top-3 text-[#a8959d]" />
                  <input
                    type="text"
                    value={formData.hrContactName}
                    onChange={e => setFormData({ ...formData, hrContactName: e.target.value })}
                    placeholder="e.g. Shruti Patel"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#e5d4d9] text-xs text-[#3d2f38] focus:outline-none focus:border-[#bd7b92]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#3d2f38] mb-1.5">
                  HR Contact Email <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-3 text-[#a8959d]" />
                  <input
                    type="email"
                    value={formData.hrContactEmail}
                    onChange={e => setFormData({ ...formData, hrContactEmail: e.target.value })}
                    placeholder="hr@company.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#e5d4d9] text-xs text-[#3d2f38] focus:outline-none focus:border-[#bd7b92]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#3d2f38] mb-1.5">HR Contact Phone</label>
                <div className="relative">
                  <Phone size={16} className="absolute left-3.5 top-3 text-[#a8959d]" />
                  <input
                    type="tel"
                    value={formData.hrContactPhone}
                    onChange={e => setFormData({ ...formData, hrContactPhone: e.target.value })}
                    placeholder="+91 98765 43210"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#e5d4d9] text-xs text-[#3d2f38] focus:outline-none focus:border-[#bd7b92]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#3d2f38] mb-1.5">HR Department Name</label>
                <input
                  type="text"
                  value={formData.departmentTeam}
                  onChange={e => setFormData({ ...formData, departmentTeam: e.target.value })}
                  placeholder="e.g. Human Resources & Talent Management"
                  className="w-full px-4 py-2.5 rounded-xl border border-[#e5d4d9] text-xs text-[#3d2f38] focus:outline-none focus:border-[#bd7b92]"
                />
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <button
                type="button"
                onClick={() => setActiveTab('branding')}
                className="px-4 py-2 rounded-xl border border-[#e5d4d9] text-xs font-semibold text-[#72616c] hover:bg-stone-50"
              >
                ← Back to Branding
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('exit')}
                className="px-5 py-2.5 rounded-xl bg-[#59424f] hover:bg-[#46333e] text-white text-xs font-semibold transition-colors"
              >
                Proceed to Exit Form →
              </button>
            </div>
          </div>
        )}

        {activeTab === 'exit' && (
          <div className="space-y-6 max-w-4xl">
            <div className="p-6 rounded-2xl bg-gradient-to-br from-[#fffbfa] to-[#fff3f6] border border-[#ebdce1]">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#fae8ee] border border-[#f5d0dc] flex items-center justify-center text-[#8c5369] shrink-0">
                  <ShieldCheck size={24} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#3d2f38]">
                    Your Exit Feedback Form is Active & Ready
                  </h3>
                  <p className="text-xs text-[#72616c] mt-1 leading-relaxed">
                    People Journey has prepared the official 9-section master Exit Interview questionnaire for your company.
                    It covers role satisfaction, management, culture, growth, compensation, and transition formalities.
                  </p>

                  <div className="flex flex-wrap items-center gap-3 mt-5">
                    {onPreviewTemplate && (
                      <button
                        type="button"
                        onClick={onPreviewTemplate}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#ebdce1] bg-white hover:bg-stone-50 text-xs font-semibold text-[#3d2f38] transition-colors shadow-sm"
                      >
                        <ExternalLink size={14} />
                        <span>Preview Default Form</span>
                      </button>
                    )}
                    {onOpenTemplateEditor && (
                      <button
                        type="button"
                        onClick={onOpenTemplateEditor}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#59424f] hover:bg-[#46333e] text-white text-xs font-semibold transition-colors shadow-sm"
                      >
                        <Edit3 size={14} />
                        <span>Customize Form Questions</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <button
                type="button"
                onClick={() => setActiveTab('hr')}
                className="px-4 py-2 rounded-xl border border-[#e5d4d9] text-xs font-semibold text-[#72616c] hover:bg-stone-50"
              >
                ← Back to HR Details
              </button>
              <button
                type="button"
                onClick={() => handleSave()}
                disabled={updateMutation.isPending}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#8c5369] hover:bg-[#784457] text-white text-xs font-bold transition-all shadow-sm"
              >
                {updateMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                <span>Finish & Save Company Profile</span>
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
