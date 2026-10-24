import { useEffect, type ComponentType, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { ShieldAlert, ArrowLeft, LogOut, LockKeyhole, LayoutDashboard } from "lucide-react";
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
          Confirming your identity and preparing your personal workspace.
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
          Verifying authorization…
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Branded Access Denied screen for users whose account is deactivated or unavailable.
 */
export function AccessDeniedScreen({
  email,
  reason,
  onSignOut,
}: {
  email: string | null;
  reason?: string | null;
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
          <span>Workspace Access Notice</span>
        </div>

        <h1
          className="display-font"
          id="access-denied-title"
          style={{ fontSize: "30px", lineHeight: 1.15, margin: "0 0 10px 0", color: "#443942" }}
        >
          Access Unavailable
        </h1>

        <p style={{ color: "#786d76", fontSize: "13px", lineHeight: 1.6, margin: "0 0 18px 0" }}>
          You are signed in as <strong style={{ color: "#443942" }}>{email || "unknown user"}</strong>.
          {reason ? ` ${reason}` : " Your personal workspace could not be loaded at this time. Please check your network or try again."}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button
            type="button"
            onClick={onSignOut}
            className="secondary-action"
            style={{ width: "100%", justifyContent: "center" }}
          >
            <LogOut size={15} />
            Sign out & switch Google account
          </button>
        </div>
      </motion.section>

      <footer className="login-footer">A thoughtful workspace for every employee journey.</footer>
    </main>
  );
}

/**
 * ProtectedRoute component for Wouter.
 * Enforces session initialization, authentication, and workspace profile availability.
 */
export function ProtectedRoute({
  component: Component,
  children,
}: ProtectedRouteProps) {
  const { user, loading, authorizationChecking, isAuthorized, authError, signOut } = useAuth();
  const [, setLocation] = useLocation();

  // Redirect unauthenticated visitors to login
  useEffect(() => {
    if (!loading && !user) {
      setLocation("/login");
    }
  }, [loading, user, setLocation]);

  // Initial Firebase session restoration or token verification
  if (loading || (user && authorizationChecking && isAuthorized === null)) {
    return <AuthLoadingScreen message="Restoring your secure session…" />;
  }

  // Not signed in
  if (!user) {
    return null;
  }

  // Account deactivated or server rejected authorization
  if (isAuthorized === false) {
    return (
      <AccessDeniedScreen
        email={user.email}
        reason={authError || "Your account has not been authorized or has been deactivated."}
        onSignOut={signOut}
      />
    );
  }

  // Authenticated and authorized
  if (Component) {
    return <Component />;
  }

  return <>{children}</>;
}
