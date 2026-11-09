import * as React from 'react';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, Cookie, Settings, Check, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  getCookieConsent,
  setCookieConsent,
  hasUserConsented,
  type CookiePreferences,
} from '@/utils/cookie-consent';

export function CookieConsentBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [preferencesEnabled, setPreferencesEnabled] = useState(true);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);

  useEffect(() => {
    // Check if user has already given consent
    if (!hasUserConsented()) {
      const timer = setTimeout(() => {
        setShowBanner(true);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, []);

  // Listen for external requests to reopen preferences (e.g. from Settings page)
  useEffect(() => {
    const handleReopen = () => {
      const current = getCookieConsent();
      if (current) {
        setPreferencesEnabled(current.preferences);
        setAnalyticsEnabled(current.analytics);
      }
      setShowCustomizeModal(true);
    };

    window.addEventListener('open_cookie_preferences', handleReopen);
    return () => window.removeEventListener('open_cookie_preferences', handleReopen);
  }, []);

  const handleAcceptAll = () => {
    setCookieConsent({ preferences: true, analytics: true });
    setShowBanner(false);
  };

  const handleRejectOptional = () => {
    setCookieConsent({ preferences: false, analytics: false });
    setShowBanner(false);
  };

  const handleSaveCustomPreferences = () => {
    setCookieConsent({
      preferences: preferencesEnabled,
      analytics: analyticsEnabled,
    });
    setShowCustomizeModal(false);
    setShowBanner(false);
  };

  return (
    <>
      <AnimatePresence>
        {showBanner && (
          <motion.aside
            initial={{ opacity: 0, y: 50, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.98 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            role="region"
            aria-label="Cookie and Privacy Consent"
            style={{
              position: 'fixed',
              bottom: '24px',
              left: '24px',
              right: '24px',
              maxWidth: '840px',
              margin: '0 auto',
              zIndex: 9999,
              backgroundColor: 'rgba(255, 255, 255, 0.96)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(181, 121, 142, 0.22)',
              boxShadow: '0 20px 45px -10px rgba(44, 27, 34, 0.16), 0 0 0 1px rgba(255, 255, 255, 0.8) inset',
              borderRadius: '20px',
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(181, 121, 142, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#944b63',
                  flexShrink: 0,
                }}
              >
                <Cookie size={22} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 600, color: '#2c1b22' }}>
                    Cookie & Workspace Storage Preferences
                  </h4>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      backgroundColor: 'rgba(40, 167, 69, 0.1)',
                      color: '#28a745',
                      padding: '2px 8px',
                      borderRadius: '999px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <ShieldCheck size={12} /> Privacy Protected
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '0.84rem', color: '#685860', lineHeight: 1.5 }}>
                  People Journey uses strictly necessary cookies and local storage tokens to keep you authenticated and secure. We also use optional preferences to remember your localized settings, default landing view, and workspace display choices.
                </p>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                flexWrap: 'wrap',
                gap: '10px',
                borderTop: '1px solid rgba(181, 121, 142, 0.12)',
                paddingTop: '14px',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  const current = getCookieConsent();
                  if (current) {
                    setPreferencesEnabled(current.preferences);
                    setAnalyticsEnabled(current.analytics);
                  }
                  setShowCustomizeModal(true);
                }}
                className="secondary-action"
                style={{
                  padding: '7px 14px',
                  fontSize: '0.82rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Settings size={14} /> Customize
              </button>

              <button
                type="button"
                onClick={handleRejectOptional}
                className="secondary-action"
                style={{
                  padding: '7px 14px',
                  fontSize: '0.82rem',
                }}
              >
                Reject Optional
              </button>

              <button
                type="button"
                onClick={handleAcceptAll}
                className="primary-action"
                style={{
                  padding: '7px 18px',
                  fontSize: '0.82rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Check size={14} /> Accept All
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Customize Preferences Dialog */}
      <Dialog open={showCustomizeModal} onOpenChange={setShowCustomizeModal}>
        <DialogContent
          style={{
            maxWidth: '560px',
            borderRadius: '20px',
            backgroundColor: '#ffffff',
            padding: '24px',
          }}
        >
          <DialogHeader>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(181, 121, 142, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#944b63',
                }}
              >
                <Cookie size={18} />
              </div>
              <DialogTitle style={{ fontSize: '1.15rem', color: '#2c1b22' }}>
                Privacy & Cookie Settings
              </DialogTitle>
            </div>
            <DialogDescription style={{ color: '#685860', fontSize: '0.85rem', lineHeight: 1.5 }}>
              Choose which types of storage and cookies you allow while using People Journey. Strictly essential cookies are required for portal login and security.
            </DialogDescription>
          </DialogHeader>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', margin: '16px 0' }}>
            {/* Essential */}
            <div
              style={{
                padding: '14px 16px',
                borderRadius: '12px',
                backgroundColor: 'rgba(247, 243, 245, 0.7)',
                border: '1px solid rgba(181, 121, 142, 0.15)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#2c1b22' }}>Strictly Essential</span>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      backgroundColor: 'rgba(44, 27, 34, 0.08)',
                      color: '#49373f',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      textTransform: 'uppercase',
                    }}
                  >
                    Required
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#685860', lineHeight: 1.4 }}>
                  Authentication tokens, CSRF protection, and secure tenant workspace isolation. These cannot be disabled.
                </p>
              </div>
              <input
                type="checkbox"
                checked={true}
                disabled={true}
                style={{ width: '18px', height: '18px', accentColor: '#944b63', marginTop: '3px' }}
              />
            </div>

            {/* Preferences */}
            <div
              style={{
                padding: '14px 16px',
                borderRadius: '12px',
                backgroundColor: preferencesEnabled ? 'rgba(181, 121, 142, 0.06)' : 'rgba(247, 243, 245, 0.4)',
                border: `1px solid ${preferencesEnabled ? 'rgba(181, 121, 142, 0.3)' : 'rgba(181, 121, 142, 0.15)'}`,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '12px',
                transition: 'all 0.2s ease',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#2c1b22' }}>Workspace Preferences</span>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      backgroundColor: 'rgba(181, 121, 142, 0.12)',
                      color: '#944b63',
                      padding: '2px 6px',
                      borderRadius: '4px',
                    }}
                  >
                    Recommended
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#685860', lineHeight: 1.4 }}>
                  Remembers your selected default view, timezone formatting, sidebar collapse state, and active filters across browser sessions.
                </p>
              </div>
              <input
                type="checkbox"
                checked={preferencesEnabled}
                onChange={(e) => setPreferencesEnabled(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: '#944b63', marginTop: '3px', cursor: 'pointer' }}
              />
            </div>

            {/* Diagnostics & Analytics */}
            <div
              style={{
                padding: '14px 16px',
                borderRadius: '12px',
                backgroundColor: analyticsEnabled ? 'rgba(181, 121, 142, 0.06)' : 'rgba(247, 243, 245, 0.4)',
                border: `1px solid ${analyticsEnabled ? 'rgba(181, 121, 142, 0.3)' : 'rgba(181, 121, 142, 0.15)'}`,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '12px',
                transition: 'all 0.2s ease',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#2c1b22' }}>Diagnostics & Performance</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#685860', lineHeight: 1.4 }}>
                  Helps us diagnose client-side rendering bottlenecks and unhandled exceptions to improve portal reliability.
                </p>
              </div>
              <input
                type="checkbox"
                checked={analyticsEnabled}
                onChange={(e) => setAnalyticsEnabled(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: '#944b63', marginTop: '3px', cursor: 'pointer' }}
              />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px',
              borderTop: '1px solid rgba(181, 121, 142, 0.12)',
              paddingTop: '16px',
            }}
          >
            <button
              type="button"
              onClick={() => setShowCustomizeModal(false)}
              className="secondary-action"
              style={{ padding: '7px 16px', fontSize: '0.84rem' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveCustomPreferences}
              className="primary-action"
              style={{ padding: '7px 20px', fontSize: '0.84rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Check size={14} /> Save Preferences
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function triggerCookiePreferencesModal() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('open_cookie_preferences'));
  }
}

