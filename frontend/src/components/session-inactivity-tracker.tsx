import * as React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { Clock, ShieldAlert, LogOut, Check } from 'lucide-react';
import { useAuth } from '@/context';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

// 20 minutes total session timeout, warning at 18 minutes (120 seconds remaining)
const INACTIVITY_TIMEOUT_MS = 20 * 60 * 1000;
const WARNING_THRESHOLD_MS = 18 * 60 * 1000;

export function SessionInactivityTracker() {
  const { user, signOut } = useAuth();
  const [, setLocation] = useLocation();

  const [showWarning, setShowWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(120);

  const lastActivityRef = useRef<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (showWarning) {
      setShowWarning(false);
      setSecondsRemaining(120);
    }
  }, [showWarning]);

  // Activity listeners to detect user interaction
  useEffect(() => {
    if (!user) return;

    let lastThrottledTime = 0;
    const handleUserActivity = () => {
      const now = Date.now();
      // Throttle event handling to at most once every 2 seconds
      if (now - lastThrottledTime > 2000) {
        lastThrottledTime = now;
        // If modal is not currently open, update activity timestamp
        if (!showWarning) {
          lastActivityRef.current = now;
        }
      }
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel'];
    events.forEach((evt) => window.addEventListener(evt, handleUserActivity, { passive: true }));

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleUserActivity));
    };
  }, [user, showWarning]);

  // Main inactivity checker
  useEffect(() => {
    if (!user) {
      setShowWarning(false);
      return;
    }

    lastActivityRef.current = Date.now();

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;

      if (elapsed >= INACTIVITY_TIMEOUT_MS) {
        // Complete timeout reached
        handleAutoLogout();
      } else if (elapsed >= WARNING_THRESHOLD_MS && !showWarning) {
        const remaining = Math.max(0, Math.ceil((INACTIVITY_TIMEOUT_MS - elapsed) / 1000));
        setSecondsRemaining(remaining);
        setShowWarning(true);
      }
    }, 5000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [user, showWarning]);

  // Countdown timer while warning dialog is visible
  useEffect(() => {
    if (!showWarning) {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      return;
    }

    countdownTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      const remaining = Math.max(0, Math.ceil((INACTIVITY_TIMEOUT_MS - elapsed) / 1000));
      setSecondsRemaining(remaining);

      if (remaining <= 0) {
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        handleAutoLogout();
      }
    }, 1000);

    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [showWarning]);

  const handleAutoLogout = async () => {
    setShowWarning(false);
    try {
      await signOut();
    } catch {
      // Fallback
    }
    setLocation('/login?reason=timeout');
  };

  const handleStaySignedIn = () => {
    resetActivity();
  };

  const handleExplicitSignOut = async () => {
    setShowWarning(false);
    try {
      await signOut();
    } catch {
      // Fallback
    }
    setLocation('/login');
  };

  if (!user || !showWarning) {
    return null;
  }

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const formattedTime = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  return (
    <Dialog open={showWarning} onOpenChange={(open) => { if (!open) handleStaySignedIn(); }}>
      <DialogContent
        style={{
          maxWidth: '460px',
          borderRadius: '20px',
          backgroundColor: '#ffffff',
          padding: '24px',
          boxShadow: '0 24px 60px -12px rgba(44, 27, 34, 0.25)',
        }}
      >
        <DialogHeader>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                backgroundColor: 'rgba(217, 83, 79, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#d9534f',
                flexShrink: 0,
              }}
            >
              <Clock size={20} />
            </div>
            <DialogTitle style={{ fontSize: '1.1rem', color: '#2c1b22' }}>
              Session Inactivity Warning
            </DialogTitle>
          </div>
          <DialogDescription style={{ color: '#685860', fontSize: '0.86rem', lineHeight: 1.5 }}>
            You have been inactive for 18 minutes. To protect your company data and confidential records, you will be automatically signed out in:
          </DialogDescription>
        </DialogHeader>

        <div
          style={{
            margin: '18px 0',
            padding: '16px',
            borderRadius: '14px',
            backgroundColor: 'rgba(247, 243, 245, 0.7)',
            border: '1px solid rgba(181, 121, 142, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <span style={{ fontSize: '2.2rem', fontWeight: 700, color: '#944b63', fontVariantNumeric: 'tabular-nums' }}>
            {formattedTime}
          </span>
          <span style={{ fontSize: '0.78rem', color: '#7a6a72', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <ShieldAlert size={13} /> Automatic session lock active
          </span>
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
            onClick={handleExplicitSignOut}
            className="secondary-action"
            style={{
              padding: '8px 16px',
              fontSize: '0.84rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <LogOut size={14} /> Sign Out Now
          </button>
          <button
            type="button"
            onClick={handleStaySignedIn}
            className="primary-action"
            style={{
              padding: '8px 20px',
              fontSize: '0.84rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Check size={14} /> Stay Signed In
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

