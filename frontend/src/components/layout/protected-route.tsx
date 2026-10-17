import { useEffect, type ComponentType, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { ShieldAlert, ArrowLeft, LogOut, LockKeyhole } from "lucide-react";
import { useAuth } from "@/context";

interface ProtectedRouteProps {
  component?: ComponentType<unknown>;
  children?: ReactNode;
}

/**
 * Calm, branded loading splash during session restoration and authorization checks.
 */
export function AuthLoadingScreen({ message = "Restoring your secure session…" }: { message?: string }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div
      className="login-page"
      role="status"
      aria-live="polite"
      style={{ minHeight: "100dvh" }}
    >
      <div className="login-glow login-glow-one" aria-hidden="true" />
      <div className="login-glow login-glow-two" aria-hidden="true" />

      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="login-card"
        style={{ maxWidth: 440 }}
      >
        <div className="login-icon" style={{ background: "#fbf0f3", color: "#b67c90" }}>
          <motion.div
            animate={shouldReduceMotion ? undefined : { rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          >
            <LockKeyhole size={22} strokeWidth={1.8} />
          </motion.div>
        </div>

        <span className="eyebrow" style={{ color: "#a57385" }}>
          People Journey · Workspace Security
        </span>

        <h1
          className="display-font"
          style={{ fontSize: "28px", marginTop: "12px", marginBottom: "8px" }}
        >
          {message}
        </h1>

        <p style={{ fontSize: "12px", color: "#81747d", marginBottom: "20px" }}>
          Confirming your identity and permissions with Firebase Authentication.
        </p>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            fontSize: "11px",
            color: "#8a7882",
          }}
        >
          <span className="status-dot" style={{ background: "#b67c90" }} />
          Verifying credentials…
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Branded Access Denied screen for users authenticated in Firebase
 * but not authorized to view or manage HR records.
 */
export function AccessDeniedScreen({
  email,
  onSignOut,
}: {
  email: string | null;
  onSignOut: () => void;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <main className="login-page">
      <div className="login-glow login-glow-one" aria-hidden="true" />
      <div className="login-glow login-glow-two" aria-hidden="true" />

      <Link href="/" className="login-brand" aria-label="People Journey home">
        <span className="brand-lockup">
          <span className="brand-symbol" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="brand-name">
            people<span>journey</span>
          </span>
        </span>
      </Link>

      <motion.section
        initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="login-card"
        aria-labelledby="access-denied-title"
        style={{ maxWidth: 510, textAlign: "left", padding: "40px 36px" }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "10px",
            padding: "6px 12px",
            borderRadius: "999px",
            background: "#fdf0f2",
            border: "1px solid #f6d8df",
            color: "#a05a72",
            fontSize: "11px",
            fontWeight: 700,
            marginBottom: "16px",
          }}
        >
          <ShieldAlert size={14} />
          <span>HR Authorization Required</span>
        </div>

        <h1
          className="display-font"
          id="access-denied-title"
          style={{ fontSize: "32px", lineHeight: 1.15, margin: "0 0 10px 0", color: "#443942" }}
        >
          Workspace access <br />
          <em style={{ color: "#be8297", fontWeight: 400 }}>is restricted.</em>
        </h1>

        <p style={{ color: "#786d76", fontSize: "12.5px", lineHeight: 1.6, margin: "0 0 18px 0" }}>
          You are signed in as <strong style={{ color: "#443942" }}>{email || "unknown user"}</strong>,
          but this account does not possess authorized HR staff permissions.
        </p>

        <div
          style={{
            background: "#fff9f5",
            border: "1px solid #f3e5d8",
            borderRadius: "12px",
            padding: "14px 16px",
            marginBottom: "22px",
            fontSize: "11.5px",
            color: "#795f53",
            lineHeight: 1.55,
          }}
        >
          <strong style={{ display: "block", color: "#61483d", marginBottom: "4px" }}>
            Development Environment Note:
          </strong>
          To grant this account access in local development, add this email address to{" "}
          <code
            style={{
              background: "#faede3",
              padding: "2px 5px",
              borderRadius: "4px",
              fontSize: "11px",
              fontFamily: "monospace",
            }}
          >
            VITE_HR_ALLOWED_EMAILS
          </code>{" "}
          in{" "}
          <code
            style={{
              background: "#faede3",
              padding: "2px 5px",
              borderRadius: "4px",
              fontSize: "11px",
              fontFamily: "monospace",
            }}
          >
            frontend/.env.local
          </code>
          , or assign an <code style={{ fontFamily: "monospace" }}>hr_admin</code> custom claim in Firebase.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button
            type="button"
            onClick={onSignOut}
            className="primary-action"
            style={{ width: "100%", justifyContent: "center" }}
          >
            <LogOut size={15} />
            Sign out & switch account
          </button>

          <Link
            href="/"
            className="secondary-action"
            style={{ width: "100%", justifyContent: "center", textDecoration: "none" }}
          >
            <ArrowLeft size={15} />
            Return to People Journey home
          </Link>
        </div>
      </motion.section>

      <footer className="login-footer">A thoughtful workspace for every employee journey.</footer>
    </main>
  );
}

/**
 * ProtectedRoute component for Wouter.
 * Enforces session initialization, authentication, and HR authorization.
 */
export function ProtectedRoute({ component: Component, children }: ProtectedRouteProps) {
  const { user, loading, isAuthorized, authorizationChecking, signOut } = useAuth();
  const [, setLocation] = useLocation();

  // Redirect unauthenticated visitors to login
  useEffect(() => {
    if (!loading && !user) {
      setLocation("/login");
    }
  }, [loading, user, setLocation]);

  // Initial Firebase session restoration
  if (loading) {
    return <AuthLoadingScreen message="Restoring your secure session…" />;
  }

  // Not signed in
  if (!user) {
    return null;
  }

  // Session restored, checking HR authorization
  if (authorizationChecking || isAuthorized === null) {
    return <AuthLoadingScreen message="Verifying HR workspace permissions…" />;
  }

  // Authenticated with Firebase, but NOT authorized for HR operations
  if (isAuthorized === false) {
    return <AccessDeniedScreen email={user.email} onSignOut={signOut} />;
  }

  // Authenticated & Authorized
  if (Component) {
    return <Component />;
  }

  return <>{children}</>;
}
