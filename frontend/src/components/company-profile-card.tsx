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
  AlertCircle,
  Palette,
  FileText,
  Clock,
  ShieldCheck,
  ExternalLink,
  Edit3,
  Upload,
  Image as ImageIcon,
  Trash2,
  Link2,
  X,
  Sparkles,
} from 'lucide-react';
import { useCompanyProfile, useUpdateCompanyProfile, useCompanyOnboardingStatus } from '@/api/queries';
import { useToast } from '@/hooks/use-toast';
import { CompanyProfileOverview } from '@/components/company-profile-overview';
import { TimezoneSelect, getBrowserTimezone } from '@/components/ui/timezone-select';

interface CompanyProfileCardProps {
  onOpenTemplateEditor?: () => void;
  onPreviewTemplate?: () => void;
}

const PRESET_COLORS = ['#59424f', '#2563eb', '#0d9488', '#4f46e5', '#7c3aed', '#b91c1c', '#ea580c', '#334155'];

export type TabKey = 'details' | 'branding' | 'hr' | 'exit';

const FIELD_TO_TAB: Record<string, { tab: TabKey; tabLabel: string; fieldLabel: string }> = {
  companyName: { tab: 'details', tabLabel: '1. Company Details', fieldLabel: 'Company Legal Name' },
  companyEmail: { tab: 'details', tabLabel: '1. Company Details', fieldLabel: 'Company Email' },
  companyWebsite: { tab: 'details', tabLabel: '1. Company Details', fieldLabel: 'Company Website' },
  brandPrimaryColor: { tab: 'branding', tabLabel: '2. Branding', fieldLabel: 'Brand Primary Color' },
  hrContactName: { tab: 'hr', tabLabel: '3. HR Contact', fieldLabel: 'HR Contact Name' },
  hrContactEmail: { tab: 'hr', tabLabel: '3. HR Contact', fieldLabel: 'HR Contact Email' },
};

export function CompanyProfileCard({
  onOpenTemplateEditor,
  onPreviewTemplate,
}: CompanyProfileCardProps) {
  const { data: profile, isLoading } = useCompanyProfile();
  const { data: onboarding } = useCompanyOnboardingStatus();
  const updateMutation = useUpdateCompanyProfile();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<'details' | 'branding' | 'hr' | 'exit'>('details');
  const [isEditing, setIsEditing] = useState(false);

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
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  // Sync profile when loaded
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
        timezone: profile.timezone || getBrowserTimezone(),
        hrContactName: profile.hrContactName || '',
        hrContactEmail: profile.hrContactEmail || '',
        hrContactPhone: profile.hrContactPhone || '',
        departmentTeam: profile.departmentTeam || '',
        defaultSenderName: profile.defaultSenderName || profile.hrContactName || '',
        defaultEmailSignature: profile.defaultEmailSignature || '',
      });
    } else {
      // For a brand new workspace, initialize timezone with browser timezone
      setFormData(prev => ({ ...prev, timezone: getBrowserTimezone() }));
    }
  }, [profile]);

  // Determine if setup is complete
  const isConfigured = Boolean(
    profile && (profile.setupCompleted || (profile.companyName && profile.hrContactEmail))
  );

  const processAndSetImage = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({
        variant: 'destructive',
        title: 'Invalid File',
        description: 'Please upload an image file (PNG, JPG, SVG, WebP).',
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'File Too Large',
        description: 'Please select an image smaller than 5MB.',
      });
      return;
    }

    setIsProcessingImage(true);

    const reader = new FileReader();
    reader.onload = e => {
      const dataUri = e.target?.result as string;
      if (!dataUri) {
        setIsProcessingImage(false);
        return;
      }

      // If SVG, save directly
      if (file.type.includes('svg')) {
        setFormData(prev => ({ ...prev, logoUrl: dataUri }));
        setIsProcessingImage(false);
        toast({ title: 'Company logo uploaded' });
        return;
      }

      // Resize and optimize raster images using canvas
      const img = new Image();
      img.onload = () => {
        const maxDim = 512;
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const optimizedDataUri = canvas.toDataURL('image/png', 0.9);
          setFormData(prev => ({ ...prev, logoUrl: optimizedDataUri }));
          toast({ title: 'Company logo uploaded & optimized' });
        } else {
          setFormData(prev => ({ ...prev, logoUrl: dataUri }));
        }
        setIsProcessingImage(false);
      };
      img.onerror = () => {
        setIsProcessingImage(false);
        toast({ variant: 'destructive', title: 'Could not load image' });
      };
      img.src = dataUri;
    };
    reader.onerror = () => {
      setIsProcessingImage(false);
      toast({ variant: 'destructive', title: 'Could not read image file' });
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processAndSetImage(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processAndSetImage(file);
    }
  };

  const runValidation = (dataToValidate = formData) => {
    const newErrors: Record<string, string> = {};

    // 1. Company Legal Name is required
    if (!dataToValidate.companyName.trim()) {
      newErrors.companyName = 'Company legal name is required.';
    }

    // 2. Company Email (optional, but must be valid format if entered)
    const compEmail = dataToValidate.companyEmail.trim();
    if (compEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(compEmail)) {
      newErrors.companyEmail = 'Enter a valid company email address (e.g. contact@company.com).';
    }

    // 3. Company Website (optional, but must be valid URL if entered)
    const website = dataToValidate.companyWebsite.trim();
    if (website) {
      try {
        const urlToTest = /^https?:\/\//i.test(website) ? website : `https://${website}`;
        new URL(urlToTest);
      } catch {
        newErrors.companyWebsite = 'Enter a valid website URL (e.g. https://company.com).';
      }
    }

    // 4. Brand Primary Color (must be a valid hex code)
    let color = dataToValidate.brandPrimaryColor.trim();
    if (color && !color.startsWith('#') && /^[A-Fa-f0-9]{3,8}$/.test(color)) {
      color = '#' + color;
    }
    if (color && !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3}|[A-Fa-f0-9]{8})$/.test(color)) {
      newErrors.brandPrimaryColor = 'Enter a valid hex color code (e.g. #59424f).';
    }

    // 5. HR Contact Email (optional, but must be valid format if entered)
    const hrEmail = dataToValidate.hrContactEmail.trim();
    if (hrEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(hrEmail)) {
      newErrors.hrContactEmail = 'Enter a valid HR contact email (e.g. hr@company.com).';
    }

    setErrors(newErrors);

    const firstErrorField = Object.keys(newErrors)[0];
    const firstErrorTab = firstErrorField ? FIELD_TO_TAB[firstErrorField]?.tab : undefined;

    return {
      isValid: Object.keys(newErrors).length === 0,
      errors: newErrors,
      firstErrorField,
      firstErrorTab,
    };
  };

  const validate = () => {
    return runValidation().isValid;
  };

  const validateStep = (tab: TabKey): boolean => {
    const result = runValidation();
    const stepErrors = Object.keys(result.errors).filter(k => FIELD_TO_TAB[k]?.tab === tab);
    if (stepErrors.length > 0) {
      const msgs = stepErrors.map(k => `${FIELD_TO_TAB[k]?.fieldLabel}: ${result.errors[k]}`);
      toast({
        variant: 'destructive',
        title: `Validation Error on ${FIELD_TO_TAB[stepErrors[0]]?.tabLabel || 'this step'}`,
        description: msgs.join(' · '),
      });
      return false;
    }
    return true;
  };

  const tabErrors = {
    details: Object.keys(errors).filter(k => FIELD_TO_TAB[k]?.tab === 'details').length,
    branding: Object.keys(errors).filter(k => FIELD_TO_TAB[k]?.tab === 'branding').length,
    hr: Object.keys(errors).filter(k => FIELD_TO_TAB[k]?.tab === 'hr').length,
    exit: 0,
  };

  const handleCancelEdit = () => {
    if (profile) {
      // Revert to saved profile
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
    setErrors({});
    setIsEditing(false);
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // Auto-normalize website URL protocol if missing
    let normalizedWebsite = formData.companyWebsite.trim();
    if (normalizedWebsite && !/^https?:\/\//i.test(normalizedWebsite) && !normalizedWebsite.includes('://')) {
      normalizedWebsite = 'https://' + normalizedWebsite;
    }

    // Auto-normalize brandPrimaryColor '#' prefix if missing
    let normalizedColor = formData.brandPrimaryColor.trim();
    if (normalizedColor && !normalizedColor.startsWith('#') && /^[A-Fa-f0-9]{3,8}$/.test(normalizedColor)) {
      normalizedColor = '#' + normalizedColor;
    }

    const payload = {
      ...formData,
      companyWebsite: normalizedWebsite,
      brandPrimaryColor: normalizedColor,
    };

    setFormData(payload);

    const result = runValidation(payload);
    if (!result.isValid) {
      // Automatically switch to the tab that has the first error so user sees the problem!
      if (result.firstErrorTab) {
        setActiveTab(result.firstErrorTab);
      }

      const errorItems = Object.entries(result.errors).map(([field, msg]) => {
        const info = FIELD_TO_TAB[field];
        return `${info ? info.fieldLabel : field}: ${msg}`;
      });

      toast({
        variant: 'destructive',
        title: `Validation Error (${errorItems.length} ${errorItems.length === 1 ? 'issue' : 'issues'})`,
        description: errorItems.join(' · '),
      });
      return;
    }

    try {
      await updateMutation.mutateAsync({
        companyName: payload.companyName.trim(),
        displayName: payload.displayName.trim() || undefined,
        logoUrl: payload.logoUrl.trim() || undefined,
        brandPrimaryColor: payload.brandPrimaryColor.trim() || '#59424f',
        industry: payload.industry.trim() || undefined,
        companyWebsite: payload.companyWebsite.trim() || undefined,
        companyAddress: payload.companyAddress.trim() || undefined,
        officeLocation: payload.officeLocation.trim() || undefined,
        companyEmail: payload.companyEmail.trim() || undefined,
        companyPhone: payload.companyPhone.trim() || undefined,
        country: payload.country.trim() || undefined,
        timezone: payload.timezone || 'UTC',
        hrContactName: payload.hrContactName.trim() || undefined,
        hrContactEmail: payload.hrContactEmail.trim() || undefined,
        hrContactPhone: payload.hrContactPhone.trim() || undefined,
        departmentTeam: payload.departmentTeam.trim() || undefined,
        defaultSenderName: payload.defaultSenderName.trim() || payload.hrContactName.trim() || undefined,
        defaultEmailSignature: payload.defaultEmailSignature.trim() || undefined,
        setupCompleted: true,
      });

      setErrors({});
      toast({
        title: 'Company Workspace Saved',
        description: 'Your company details and branding will now dynamically personalize employee exit forms.',
      });

      setIsEditing(false);
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

  // STATE B: If setup completed and not currently in edit mode -> Render compact overview card!
  if (isConfigured && !isEditing && profile) {
    return (
      <CompanyProfileOverview
        profile={profile}
        onEdit={() => setIsEditing(true)}
        onOpenTemplateEditor={onOpenTemplateEditor}
        onPreviewTemplate={onPreviewTemplate}
      />
    );
  }

  // STATE A or EDIT MODE: Render full 4-step configuration editor with responsive navigation
  return (
    <div className="bg-white rounded-3xl border border-[#eadfe0] shadow-xs overflow-hidden mb-8 transition-all">
      {/* Header Bar */}
      <div className="p-6 md:p-8 bg-[#faf4f6] border-b border-[#f0e4e7] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#935269]">
              Company Configuration
            </span>
            {isConfigured && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#ebdada] text-[#59424f]">
                Editing Mode
              </span>
            )}
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-[#3d2f38] mt-0.5">
            {formData.displayName || formData.companyName || 'Company Workspace Settings'}
          </h2>
          <p className="text-xs md:text-sm text-[#72616c] mt-1">
            Configure your company profile, brand appearance, HR contacts, and hosted feedback questionnaires.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
          {isConfigured && (
            <button
              type="button"
              onClick={handleCancelEdit}
              disabled={updateMutation.isPending}
              className="px-4 py-2.5 rounded-xl border border-[#ebdce1] bg-white hover:bg-stone-50 text-[#3d2f38] text-xs font-semibold shadow-2xs transition-all"
            >
              Cancel
            </button>
          )}

          <button
            type="button"
            onClick={() => handleSave()}
            disabled={updateMutation.isPending}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#59424f] hover:bg-[#46333e] text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
          >
            {updateMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            <span>Save Changes</span>
          </button>
        </div>
      </div>

      {/* Responsive Stepper Navigation */}
      <div className="border-b border-[#f0e4e7] bg-[#fffafb] px-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-1 sm:gap-2 py-2">
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className={`py-2 px-3 sm:px-4 text-xs font-semibold rounded-xl flex items-center gap-2 transition-all ${
              activeTab === 'details'
                ? 'bg-[#f4e6ec] text-[#8c5369] shadow-2xs font-bold'
                : 'text-[#72616c] hover:text-[#3d2f38] hover:bg-stone-50'
            } ${tabErrors.details > 0 ? 'ring-1 ring-rose-300 bg-rose-50/50 text-rose-800' : ''}`}
          >
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              tabErrors.details > 0
                ? 'bg-rose-500 text-white'
                : activeTab === 'details'
                ? 'bg-[#8c5369] text-white'
                : 'bg-stone-200 text-stone-600'
            }`}>
              {tabErrors.details > 0 ? '!' : '1'}
            </div>
            <span>Company Details</span>
            {tabErrors.details > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" title={`${tabErrors.details} field requires attention`} />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('branding')}
            className={`py-2 px-3 sm:px-4 text-xs font-semibold rounded-xl flex items-center gap-2 transition-all ${
              activeTab === 'branding'
                ? 'bg-[#f4e6ec] text-[#8c5369] shadow-2xs font-bold'
                : 'text-[#72616c] hover:text-[#3d2f38] hover:bg-stone-50'
            } ${tabErrors.branding > 0 ? 'ring-1 ring-rose-300 bg-rose-50/50 text-rose-800' : ''}`}
          >
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              tabErrors.branding > 0
                ? 'bg-rose-500 text-white'
                : activeTab === 'branding'
                ? 'bg-[#8c5369] text-white'
                : 'bg-stone-200 text-stone-600'
            }`}>
              {tabErrors.branding > 0 ? '!' : '2'}
            </div>
            <span>Branding</span>
            {tabErrors.branding > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" title={`${tabErrors.branding} field requires attention`} />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('hr')}
            className={`py-2 px-3 sm:px-4 text-xs font-semibold rounded-xl flex items-center gap-2 transition-all ${
              activeTab === 'hr'
                ? 'bg-[#f4e6ec] text-[#8c5369] shadow-2xs font-bold'
                : 'text-[#72616c] hover:text-[#3d2f38] hover:bg-stone-50'
            } ${tabErrors.hr > 0 ? 'ring-1 ring-rose-300 bg-rose-50/50 text-rose-800' : ''}`}
          >
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              tabErrors.hr > 0
                ? 'bg-rose-500 text-white'
                : activeTab === 'hr'
                ? 'bg-[#8c5369] text-white'
                : 'bg-stone-200 text-stone-600'
            }`}>
              {tabErrors.hr > 0 ? '!' : '3'}
            </div>
            <span>HR Contact</span>
            {tabErrors.hr > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" title={`${tabErrors.hr} field requires attention`} />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('exit')}
            className={`py-2 px-3 sm:px-4 text-xs font-semibold rounded-xl flex items-center gap-2 transition-all ${
              activeTab === 'exit'
                ? 'bg-[#f4e6ec] text-[#8c5369] shadow-2xs font-bold'
                : 'text-[#72616c] hover:text-[#3d2f38] hover:bg-stone-50'
            }`}
          >
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              activeTab === 'exit' ? 'bg-[#8c5369] text-white' : 'bg-stone-200 text-stone-600'
            }`}>
              4
            </div>
            <span>Exit Feedback Form</span>
          </button>
        </div>
      </div>

      {/* Tab Panels */}
      <form onSubmit={handleSave} className="p-6 md:p-8">
        {/* Step 1: Company Details */}
        {activeTab === 'details' && (
          <div className="space-y-6 max-w-4xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
              <div>
                <label className="block text-xs font-bold text-[#3d2f38] mb-1.5">
                  Company Legal Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Building2 size={16} className="absolute left-3.5 top-3 text-[#a8959d]" />
                  <input
                    type="text"
                    value={formData.companyName}
                    onChange={e => {
                      setFormData({ ...formData, companyName: e.target.value });
                      if (errors.companyName) setErrors(prev => ({ ...prev, companyName: '' }));
                    }}
                    placeholder="e.g. Infravision Transmission Solutions Pvt. Ltd."
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-xs text-[#3d2f38] focus:outline-none transition-colors ${
                      errors.companyName ? 'border-rose-400 bg-rose-50/30' : 'border-[#e5d4d9] focus:border-[#bd7b92]'
                    }`}
                  />
                </div>
                {errors.companyName && (
                  <p className="text-[11px] text-rose-500 mt-1 flex items-center gap-1">
                    <AlertCircle size={12} />
                    {errors.companyName}
                  </p>
                )}
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
                    type="text"
                    value={formData.companyWebsite}
                    onChange={e => {
                      setFormData({ ...formData, companyWebsite: e.target.value });
                      if (errors.companyWebsite) setErrors(prev => ({ ...prev, companyWebsite: '' }));
                    }}
                    onBlur={() => {
                      const site = formData.companyWebsite.trim();
                      if (site && !/^https?:\/\//i.test(site) && !site.includes('://')) {
                        setFormData(prev => ({ ...prev, companyWebsite: `https://${site}` }));
                      }
                    }}
                    placeholder="https://example.com"
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-xs text-[#3d2f38] focus:outline-none transition-colors ${
                      errors.companyWebsite ? 'border-rose-400 bg-rose-50/30' : 'border-[#e5d4d9] focus:border-[#bd7b92]'
                    }`}
                  />
                </div>
                {errors.companyWebsite && (
                  <p className="text-[11px] text-rose-500 mt-1 flex items-center gap-1">
                    <AlertCircle size={12} />
                    {errors.companyWebsite}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#3d2f38] mb-1.5">Company Email</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-3 text-[#a8959d]" />
                  <input
                    type="email"
                    value={formData.companyEmail}
                    onChange={e => {
                      setFormData({ ...formData, companyEmail: e.target.value });
                      if (errors.companyEmail) setErrors(prev => ({ ...prev, companyEmail: '' }));
                    }}
                    placeholder="contact@company.com"
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-xs text-[#3d2f38] focus:outline-none transition-colors ${
                      errors.companyEmail ? 'border-rose-400 bg-rose-50/30' : 'border-[#e5d4d9] focus:border-[#bd7b92]'
                    }`}
                  />
                </div>
                {errors.companyEmail && (
                  <p className="text-[11px] text-rose-500 mt-1 flex items-center gap-1">
                    <AlertCircle size={12} />
                    {errors.companyEmail}
                  </p>
                )}
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

              {/* Styled Timezone Select */}
              <div>
                <label className="block text-xs font-bold text-[#3d2f38] mb-1.5">Time Zone</label>
                <TimezoneSelect
                  value={formData.timezone}
                  onChange={tz => setFormData({ ...formData, timezone: tz })}
                />
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
                onClick={() => {
                  if (validateStep('details')) setActiveTab('branding');
                }}
                className="px-5 py-2.5 rounded-xl bg-[#59424f] hover:bg-[#46333e] text-white text-xs font-semibold transition-colors shadow-xs"
              >
                Proceed to Branding →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Company Branding */}
        {activeTab === 'branding' && (
          <div className="space-y-6 max-w-4xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
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
                    value={formData.brandPrimaryColor.startsWith('#') && formData.brandPrimaryColor.length === 7 ? formData.brandPrimaryColor : '#59424f'}
                    onChange={e => {
                      setFormData({ ...formData, brandPrimaryColor: e.target.value });
                      if (errors.brandPrimaryColor) setErrors(prev => ({ ...prev, brandPrimaryColor: '' }));
                    }}
                    className="w-10 h-10 rounded-xl cursor-pointer border border-[#e5d4d9] p-1 bg-white shrink-0"
                  />
                  <input
                    type="text"
                    value={formData.brandPrimaryColor}
                    onChange={e => {
                      setFormData({ ...formData, brandPrimaryColor: e.target.value });
                      if (errors.brandPrimaryColor) setErrors(prev => ({ ...prev, brandPrimaryColor: '' }));
                    }}
                    onBlur={() => {
                      let c = formData.brandPrimaryColor.trim();
                      if (c && !c.startsWith('#') && /^[A-Fa-f0-9]{3,8}$/.test(c)) {
                        setFormData(prev => ({ ...prev, brandPrimaryColor: '#' + c }));
                      }
                    }}
                    placeholder="#59424f"
                    className={`w-28 sm:w-32 px-3 py-2.5 rounded-xl border text-xs text-[#3d2f38] font-mono focus:outline-none transition-colors ${
                      errors.brandPrimaryColor ? 'border-rose-400 bg-rose-50/30' : 'border-[#e5d4d9] focus:border-[#bd7b92]'
                    }`}
                  />
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setFormData({ ...formData, brandPrimaryColor: c });
                          if (errors.brandPrimaryColor) setErrors(prev => ({ ...prev, brandPrimaryColor: '' }));
                        }}
                        style={{ backgroundColor: c }}
                        className={`w-6 h-6 rounded-full border transition-transform ${
                          formData.brandPrimaryColor.toLowerCase() === c.toLowerCase() ? 'scale-125 border-black/40 ring-2 ring-[#bd7b92]/30' : 'border-transparent'
                        }`}
                      />
                    ))}
                  </div>
                </div>
                {errors.brandPrimaryColor && (
                  <p className="text-[11px] text-rose-500 mt-1 flex items-center gap-1">
                    <AlertCircle size={12} />
                    {errors.brandPrimaryColor}
                  </p>
                )}
              </div>
            </div>

            {/* Company Logo Picture Upload & Preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-[#3d2f38]">Company Logo</label>
                <button
                  type="button"
                  onClick={() => setShowUrlInput(!showUrlInput)}
                  className="text-[11px] text-[#8c5369] hover:underline inline-flex items-center gap-1 font-medium"
                >
                  <Link2 size={12} />
                  {showUrlInput ? 'Hide URL input' : 'Enter logo URL instead'}
                </button>
              </div>

              {formData.logoUrl ? (
                /* Active Logo Preview Card */
                <div className="p-4 rounded-2xl border border-[#e5d4d9] bg-white flex flex-wrap items-center justify-between gap-4 shadow-2xs">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-xl border border-[#ebdce1] p-1.5 bg-[#faf7f5] flex items-center justify-center shrink-0 overflow-hidden">
                      <img
                        src={formData.logoUrl}
                        alt="Company Logo Preview"
                        className="max-h-full max-w-full object-contain"
                        onError={e => {
                          (e.target as HTMLImageElement).style.opacity = '0.3';
                        }}
                      />
                    </div>
                    <div>
                      <b className="text-xs text-[#3d2f38] block">Active Company Logo</b>
                      <span className="text-[11px] text-[#72616c] block">
                        Will appear on employee exit forms, portal header, and exported reports.
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="secondary-action text-xs px-3 py-1.5 cursor-pointer inline-flex items-center gap-1.5">
                      <Upload size={13} />
                      <span>{isProcessingImage ? 'Processing…' : 'Change Picture'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        className="hidden"
                        onChange={handleFileChange}
                        disabled={isProcessingImage}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, logoUrl: '' }))}
                      className="p-1.5 text-stone-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                      title="Remove logo"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                /* Drag & Drop Upload Box */
                <div
                  onDragOver={e => e.preventDefault()}
                  onDrop={handleDrop}
                  className="p-6 rounded-2xl border-2 border-dashed border-[#e5d4d9] bg-[#fffdfb] hover:bg-[#fff7f9] hover:border-[#bd7b92] transition-colors text-center space-y-3"
                >
                  <div className="w-12 h-12 rounded-xl bg-[#fdf2f4] text-[#8c5369] mx-auto flex items-center justify-center">
                    <ImageIcon size={24} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#3d2f38]">
                      Upload your company logo
                    </p>
                    <p className="text-[11px] text-[#72616c] mt-0.5">
                      Drag and drop image here, or select from your computer (PNG, JPG, SVG, WebP up to 5MB)
                    </p>
                  </div>
                  <div>
                    <label className="primary-action text-xs px-4 py-2 cursor-pointer inline-flex items-center gap-2">
                      <Upload size={14} />
                      <span>{isProcessingImage ? 'Optimizing image…' : 'Select Picture from Computer'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        className="hidden"
                        onChange={handleFileChange}
                        disabled={isProcessingImage}
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* Collapsible Direct URL Input */}
              {showUrlInput && (
                <div className="pt-2">
                  <input
                    type="url"
                    value={formData.logoUrl}
                    onChange={e => setFormData({ ...formData, logoUrl: e.target.value })}
                    placeholder="https://example.com/logo.png"
                    className="w-full px-4 py-2.5 rounded-xl border border-[#e5d4d9] text-xs text-[#3d2f38] focus:outline-none focus:border-[#bd7b92]"
                  />
                  <p className="text-[11px] text-[#72616c] mt-1">
                    Direct image link. If pasted, it will be loaded directly from the web.
                  </p>
                </div>
              )}
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
                onClick={() => {
                  if (validateStep('branding')) setActiveTab('hr');
                }}
                className="px-5 py-2.5 rounded-xl bg-[#59424f] hover:bg-[#46333e] text-white text-xs font-semibold transition-colors shadow-xs"
              >
                Proceed to HR Contact →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: HR Contact Details */}
        {activeTab === 'hr' && (
          <div className="space-y-6 max-w-4xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
              <div>
                <label className="block text-xs font-bold text-[#3d2f38] mb-1.5">
                  HR Contact Name <span className="text-[11px] font-normal text-stone-500">(Recommended)</span>
                </label>
                <div className="relative">
                  <User size={16} className="absolute left-3.5 top-3 text-[#a8959d]" />
                  <input
                    type="text"
                    value={formData.hrContactName}
                    onChange={e => {
                      setFormData({ ...formData, hrContactName: e.target.value });
                      if (errors.hrContactName) setErrors(prev => ({ ...prev, hrContactName: '' }));
                    }}
                    placeholder="e.g. Shruti Patel"
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-xs text-[#3d2f38] focus:outline-none transition-colors ${
                      errors.hrContactName ? 'border-rose-400 bg-rose-50/30' : 'border-[#e5d4d9] focus:border-[#bd7b92]'
                    }`}
                  />
                </div>
                {errors.hrContactName && (
                  <p className="text-[11px] text-rose-500 mt-1 flex items-center gap-1">
                    <AlertCircle size={12} />
                    {errors.hrContactName}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#3d2f38] mb-1.5">
                  HR Contact Email <span className="text-[11px] font-normal text-stone-500">(Recommended)</span>
                </label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-3 text-[#a8959d]" />
                  <input
                    type="email"
                    value={formData.hrContactEmail}
                    onChange={e => {
                      setFormData({ ...formData, hrContactEmail: e.target.value });
                      if (errors.hrContactEmail) setErrors(prev => ({ ...prev, hrContactEmail: '' }));
                    }}
                    placeholder="hr@company.com"
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-xs text-[#3d2f38] focus:outline-none transition-colors ${
                      errors.hrContactEmail ? 'border-rose-400 bg-rose-50/30' : 'border-[#e5d4d9] focus:border-[#bd7b92]'
                    }`}
                  />
                </div>
                {errors.hrContactEmail && (
                  <p className="text-[11px] text-rose-500 mt-1 flex items-center gap-1">
                    <AlertCircle size={12} />
                    {errors.hrContactEmail}
                  </p>
                )}
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
                onClick={() => {
                  if (validateStep('hr')) setActiveTab('exit');
                }}
                className="px-5 py-2.5 rounded-xl bg-[#59424f] hover:bg-[#46333e] text-white text-xs font-semibold transition-colors shadow-xs"
              >
                Proceed to Exit Form →
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Exit Feedback Setup */}
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
                    It covers reasons for leaving, role satisfaction, manager feedback, culture, compensation, and exit formalities.
                  </p>

                  <div className="flex flex-wrap items-center gap-3 mt-5">
                    {onPreviewTemplate && (
                      <button
                        type="button"
                        onClick={onPreviewTemplate}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#ebdce1] bg-white hover:bg-stone-50 text-xs font-semibold text-[#3d2f38] transition-colors shadow-xs"
                      >
                        <ExternalLink size={14} />
                        <span>Preview Default Form</span>
                      </button>
                    )}
                    {onOpenTemplateEditor && (
                      <button
                        type="button"
                        onClick={onOpenTemplateEditor}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#59424f] hover:bg-[#46333e] text-white text-xs font-semibold transition-colors shadow-xs"
                      >
                        <Edit3 size={14} />
                        <span>Customize Form Questions</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Validation Attention Banner on Step 4 if earlier steps have invalid fields */}
            {Object.keys(errors).length > 0 && (
              <div className="p-4 rounded-2xl border border-rose-200 bg-rose-50/90 text-xs text-rose-900 space-y-2.5 shadow-xs">
                <div className="flex items-center gap-2 font-bold text-rose-950">
                  <AlertCircle size={17} className="text-rose-600 shrink-0" />
                  <span>Please correct {Object.keys(errors).length} {Object.keys(errors).length === 1 ? 'issue' : 'issues'} before saving:</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-rose-800">
                  {Object.entries(errors).map(([field, msg]) => {
                    const info = FIELD_TO_TAB[field];
                    return (
                      <div
                        key={field}
                        onClick={() => {
                          if (info?.tab) setActiveTab(info.tab);
                        }}
                        className="p-2.5 rounded-xl bg-white/90 border border-rose-200 hover:bg-white cursor-pointer transition-colors flex items-center justify-between gap-2 shadow-2xs"
                      >
                        <div>
                          <span className="font-semibold text-rose-950 block">{info?.fieldLabel || field}</span>
                          <span className="text-stone-600">{msg}</span>
                        </div>
                        <span className="text-[10px] text-rose-600 font-semibold underline shrink-0">
                          Fix on {info?.tabLabel.replace(/^\d+\.\s*/, '') || 'step'} →
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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
