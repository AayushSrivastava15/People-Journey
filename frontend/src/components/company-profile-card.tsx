import { useState, useEffect } from 'react';
import { Building2, Mail, Phone, Globe, MapPin, User, Check, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { useCompanyProfile, useUpdateCompanyProfile } from '@/api/queries';
import { useToast } from '@/hooks/use-toast';

export function CompanyProfileCard() {
  const { data: profile, isLoading } = useCompanyProfile();
  const updateMutation = useUpdateCompanyProfile();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    companyName: '',
    hrContactName: '',
    hrContactEmail: '',
    officeLocation: '',
    hrContactPhone: '',
    companyWebsite: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (profile) {
      setFormData({
        companyName: profile.companyName || '',
        hrContactName: profile.hrContactName || '',
        hrContactEmail: profile.hrContactEmail || '',
        officeLocation: profile.officeLocation || profile.companyAddress || '',
        hrContactPhone: profile.hrContactPhone || '',
        companyWebsite: profile.companyWebsite || '',
      });
    }
  }, [profile]);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.companyName.trim()) {
      newErrors.companyName = 'Company name is required';
    }
    if (!formData.hrContactName.trim()) {
      newErrors.hrContactName = 'HR contact name is required';
    }
    if (!formData.hrContactEmail.trim()) {
      newErrors.hrContactEmail = 'HR contact email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.hrContactEmail)) {
      newErrors.hrContactEmail = 'Please enter a valid email address';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      await updateMutation.mutateAsync({
        companyName: formData.companyName.trim(),
        hrContactName: formData.hrContactName.trim(),
        hrContactEmail: formData.hrContactEmail.trim(),
        officeLocation: formData.officeLocation.trim() || undefined,
        companyAddress: formData.officeLocation.trim() || undefined,
        hrContactPhone: formData.hrContactPhone.trim() || undefined,
        companyWebsite: formData.companyWebsite.trim() || undefined,
        defaultSenderName: formData.hrContactName.trim() || undefined,
      });

      toast({
        title: 'Company Profile Saved',
        description: 'Your company details will now automatically personalize lifecycle emails.',
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
        <span>Loading your company profile…</span>
      </section>
    );
  }

  const isConfigured = !!profile?.companyName;

  return (
    <section className="panel" style={{ padding: '24px' }}>
      <div className="panel-heading" style={{ marginBottom: '18px' }}>
        <div>
          <span className="panel-kicker">COMPANY & HR DETAILS</span>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            Company & HR Details
          </h2>
          <p>
            Your saved company name, HR contact details, and office location automatically personalize lifecycle emails.
          </p>
        </div>
        <Building2 size={20} className="heading-icon" style={{ color: '#bd7b92' }} />
      </div>

      {!isConfigured && (
        <div
          style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'flex-start',
            padding: '14px 16px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #fff7ed 0%, #fef3c7 100%)',
            border: '1px solid #fde68a',
            color: '#92400e',
            marginBottom: '20px',
            fontSize: '12px',
            lineHeight: 1.5,
          }}
        >
          <Sparkles size={18} style={{ flexShrink: 0, marginTop: '2px', color: '#d97706' }} />
          <div>
            <b style={{ display: 'block', fontSize: '13px', marginBottom: '2px', color: '#78350f' }}>
              Complete Your Company Profile
            </b>
            Save your company details below once so templates like <i>New Joiner Welcome</i>, <i>First-Day Instructions</i>, and <i>Last Working Day</i> will automatically personalize with your company name, office address, and HR contact information.
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '16px' }}>
          {/* Company Name */}
          <div className="form-field">
            <div className="field-label-row">
              <label htmlFor="companyName" style={{ fontWeight: 600, fontSize: '12px' }}>
                Company Name <span style={{ color: '#e11d48' }}>*</span>
              </label>
            </div>
            <div style={{ position: 'relative' }}>
              <input
                id="companyName"
                value={formData.companyName}
                onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                placeholder="e.g. Acme Corporation"
                style={{
                  borderColor: errors.companyName ? '#e11d48' : undefined,
                  width: '100%',
                }}
              />
            </div>
            {errors.companyName && (
              <small style={{ color: '#e11d48', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                <AlertCircle size={12} /> {errors.companyName}
              </small>
            )}
            <small style={{ color: '#8d7d87', fontSize: '10px' }}>Populates <code>{'{{company_name}}'}</code></small>
          </div>

          {/* HR Contact Name */}
          <div className="form-field">
            <div className="field-label-row">
              <label htmlFor="hrContactName" style={{ fontWeight: 600, fontSize: '12px' }}>
                HR Contact Name <span style={{ color: '#e11d48' }}>*</span>
              </label>
            </div>
            <input
              id="hrContactName"
              value={formData.hrContactName}
              onChange={e => setFormData({ ...formData, hrContactName: e.target.value })}
              placeholder="e.g. Sarah Jenkins"
              style={{
                borderColor: errors.hrContactName ? '#e11d48' : undefined,
                width: '100%',
              }}
            />
            {errors.hrContactName && (
              <small style={{ color: '#e11d48', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                <AlertCircle size={12} /> {errors.hrContactName}
              </small>
            )}
            <small style={{ color: '#8d7d87', fontSize: '10px' }}>Populates <code>{'{{hr_contact_name}}'}</code></small>
          </div>

          {/* HR Contact Email */}
          <div className="form-field">
            <div className="field-label-row">
              <label htmlFor="hrContactEmail" style={{ fontWeight: 600, fontSize: '12px' }}>
                HR Contact Email <span style={{ color: '#e11d48' }}>*</span>
              </label>
            </div>
            <input
              id="hrContactEmail"
              type="email"
              value={formData.hrContactEmail}
              onChange={e => setFormData({ ...formData, hrContactEmail: e.target.value })}
              placeholder="e.g. hr@acme.com"
              style={{
                borderColor: errors.hrContactEmail ? '#e11d48' : undefined,
                width: '100%',
              }}
            />
            {errors.hrContactEmail && (
              <small style={{ color: '#e11d48', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                <AlertCircle size={12} /> {errors.hrContactEmail}
              </small>
            )}
            <small style={{ color: '#8d7d87', fontSize: '10px' }}>Populates <code>{'{{hr_contact_email}}'}</code></small>
          </div>

          {/* Office Location */}
          <div className="form-field">
            <div className="field-label-row">
              <label htmlFor="officeLocation" style={{ fontWeight: 600, fontSize: '12px' }}>Office Location</label>
            </div>
            <input
              id="officeLocation"
              value={formData.officeLocation}
              onChange={e => setFormData({ ...formData, officeLocation: e.target.value })}
              placeholder="e.g. Building 4, 3rd Floor or Remote"
              style={{ width: '100%' }}
            />
            <small style={{ color: '#8d7d87', fontSize: '10px' }}>Populates <code>{'{{office_location}}'}</code></small>
          </div>

          {/* HR Contact Phone */}
          <div className="form-field">
            <div className="field-label-row">
              <label htmlFor="hrContactPhone" style={{ fontWeight: 600, fontSize: '12px' }}>HR Contact Phone</label>
            </div>
            <input
              id="hrContactPhone"
              value={formData.hrContactPhone}
              onChange={e => setFormData({ ...formData, hrContactPhone: e.target.value })}
              placeholder="e.g. +1 (555) 234-5678"
              style={{ width: '100%' }}
            />
            <small style={{ color: '#8d7d87', fontSize: '10px' }}>Populates <code>{'{{hr_contact_phone}}'}</code></small>
          </div>

          {/* Company Website */}
          <div className="form-field">
            <div className="field-label-row">
              <label htmlFor="companyWebsite" style={{ fontWeight: 600, fontSize: '12px' }}>Company Website</label>
            </div>
            <input
              id="companyWebsite"
              value={formData.companyWebsite}
              onChange={e => setFormData({ ...formData, companyWebsite: e.target.value })}
              placeholder="e.g. https://acme.com"
              style={{ width: '100%' }}
            />
            <small style={{ color: '#8d7d87', fontSize: '10px' }}>Populates <code>{'{{company_website}}'}</code></small>
          </div>

        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <button
            type="submit"
            className="primary-action"
            disabled={updateMutation.isPending}
            style={{ minWidth: '160px' }}
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Check size={16} /> Save Company Profile
              </>
            )}
          </button>
        </div>
      </form>
    </section>
  );
}
