import { useState, useEffect, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  HeartHandshake,
  Loader2,
  LockKeyhole,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/context";
import {
  signInWithGoogle,
  signInWithEmail,
  registerWithEmail,
  resetPassword,
  mapAuthError,
} from "@/services/authService";
import { AuthLoadingScreen } from "@/components/layout/protected-route";

type AuthMode = "signin" | "register" | "forgot";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.35 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.17 0 9.99 0 12s.45 3.83 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

export function LoginPage() {
  const [, setLocation] = useLocation();
  const { user, loading, isAuthorized, authorizationChecking, verifyAuthorization } = useAuth();
  const shouldReduceMotion = useReducedMotion();

  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    document.title = "HR Workspace Sign In | People Journey";
  }, []);

  // If already authenticated and authorized, automatically navigate to dashboard
  useEffect(() => {
    if (!loading && !authorizationChecking && user && isAuthorized === true) {
      setLocation("/dashboard");
    }
  }, [user, isAuthorized, loading, authorizationChecking, setLocation]);

  // While restoring session or checking auth, show the calm loading screen
  if (loading || (user && authorizationChecking)) {
    return <AuthLoadingScreen message="Checking your workspace access…" />;
  }

  // Handle Google Sign In
  const handleGoogleSignIn = async () => {
    setIsGoogleSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const signedInUser = await signInWithGoogle();
      const authorized = await verifyAuthorization(signedInUser);

      if (authorized) {
        setLocation("/dashboard");
      }
      // If unauthorized, the ProtectedRoute or App router will present the Access Denied screen
    } catch (err: unknown) {
      setErrorMessage(mapAuthError(err));
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  // Handle Email & Password Sign In
  const handleEmailSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage("Please enter both your email address and password.");
      return;
    }

    setIsSubmitting(true);
    try {
      const signedInUser = await signInWithEmail(email, password);
      const authorized = await verifyAuthorization(signedInUser);

      if (authorized) {
        setLocation("/dashboard");
      }
    } catch (err: unknown) {
      setErrorMessage(mapAuthError(err));
      // Preserves entered email so user doesn't have to re-type it
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Account Registration
  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!displayName.trim()) {
      setErrorMessage("Please provide your full name.");
      return;
    }

    if (!email.trim() || !password) {
      setErrorMessage("Please enter both email and password.");
      return;
    }

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match. Please verify.");
      return;
    }

    setIsSubmitting(true);
    try {
      const registeredUser = await registerWithEmail(email, password, displayName);
      const authorized = await verifyAuthorization(registeredUser);

      if (authorized) {
        setLocation("/dashboard");
      } else {
        setSuccessMessage(
          "Account created! Your registration is pending approval by your People Operations team."
        );
      }
    } catch (err: unknown) {
      setErrorMessage(mapAuthError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Forgot Password
  const handleForgotPassword = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!email.trim()) {
      setErrorMessage("Please enter your registered email address.");
      return;
    }

    setIsSubmitting(true);
    try {
      await resetPassword(email);
      setSuccessMessage(
        "If an account exists with this email address, we’ve sent instructions to reset your password. Please check your inbox and spam folder."
      );
    } catch (err: unknown) {
      // Avoid revealing account presence; show friendly message unless connection failed
      const mapped = mapAuthError(err);
      if (mapped.includes("connect") || mapped.includes("Internet")) {
        setErrorMessage(mapped);
      } else {
        setSuccessMessage(
          "If an account exists with this email address, we’ve sent instructions to reset your password."
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <div className="login-glow login-glow-one" aria-hidden="true" />
      <div className="login-glow login-glow-two" aria-hidden="true" />

      {/* Brand logo linked to landing page */}
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
        initial={shouldReduceMotion ? false : { opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="login-card"
        aria-labelledby="login-title"
      >
        <div className="login-icon">
          <LockKeyhole size={21} strokeWidth={1.6} />
        </div>

        <span className="eyebrow">A little more human, by design</span>

        <h1 className="display-font" id="login-title">
          {mode === "signin" && (
            <>
              Welcome back<br />
              <em>to People Journey.</em>
            </>
          )}
          {mode === "register" && (
            <>
              Request workspace access<br />
              <em>for your HR team.</em>
            </>
          )}
          {mode === "forgot" && (
            <>
              Reset your password<br />
              <em>with ease.</em>
            </>
          )}
        </h1>

        <p>
          {mode === "signin" && "Sign in with your authorized credentials to access employee journeys, onboarding, and workspace records."}
          {mode === "register" && "Create an HR account. All new accounts must be authorized by your People Operations administrator."}
          {mode === "forgot" && "Enter your work email address below and we’ll send you password recovery instructions."}
        </p>

        {/* Error message banner */}
        {errorMessage && (
          <div className="login-alert login-alert-error" role="alert">
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "1px" }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Success message banner */}
        {successMessage && (
          <div className="login-alert login-alert-success" role="status">
            <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: "1px" }} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* SIGN IN VIEW */}
        {mode === "signin" && (
          <div className="login-form-container">
            {/* Google Sign In Button */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isGoogleSubmitting || isSubmitting}
              className="login-google-btn"
              aria-label="Sign in with Google"
            >
              {isGoogleSubmitting ? (
                <>
                  <Loader2 size={17} className="animate-spin" />
                  <span>Connecting to Google…</span>
                </>
              ) : (
                <>
                  <GoogleIcon />
                  <span>Sign in with Google</span>
                </>
              )}
            </button>

            <div className="login-divider">or continue with email</div>

            {/* Email / Password Form */}
            <form onSubmit={handleEmailSignIn} noValidate>
              <div className="login-field-group">
                <label htmlFor="login-email">Work Email</label>
                <div className="login-input-wrap">
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    autoComplete="email"
                    required
                    disabled={isSubmitting || isGoogleSubmitting}
                    className="login-input"
                  />
                </div>
              </div>

              <div className="login-field-group">
                <label htmlFor="login-password">
                  <span>Password</span>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMessage(null);
                      setSuccessMessage(null);
                      setMode("forgot");
                    }}
                    className="login-text-btn"
                    tabIndex={0}
                  >
                    Forgot password?
                  </button>
                </label>
                <div className="login-input-wrap">
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    disabled={isSubmitting || isGoogleSubmitting}
                    className="login-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="login-input-toggle"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || isGoogleSubmitting}
                className="primary-action login-submit-btn"
                style={{ marginTop: "6px" }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Signing in…</span>
                  </>
                ) : (
                  <span>Sign in to HR Portal</span>
                )}
              </button>
            </form>

            {/* Switch to Register */}
            <div
              style={{
                marginTop: "18px",
                paddingTop: "14px",
                borderTop: "1px solid #f2e7e9",
                fontSize: "11px",
                color: "#8a7b83",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>Need an HR account?</span>
              <button
                type="button"
                onClick={() => {
                  setErrorMessage(null);
                  setSuccessMessage(null);
                  setMode("register");
                }}
                className="login-text-btn"
              >
                Register new account
              </button>
            </div>
          </div>
        )}

        {/* FORGOT PASSWORD VIEW */}
        {mode === "forgot" && (
          <div className="login-form-container">
            <form onSubmit={handleForgotPassword} noValidate>
              <div className="login-field-group">
                <label htmlFor="reset-email">Work Email</label>
                <div className="login-input-wrap">
                  <input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    autoComplete="email"
                    required
                    disabled={isSubmitting}
                    className="login-input"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="primary-action login-submit-btn"
                style={{ marginTop: "8px" }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Sending reset instructions…</span>
                  </>
                ) : (
                  <span>Send password reset link</span>
                )}
              </button>
            </form>

            <div style={{ marginTop: "16px", textAlign: "center" }}>
              <button
                type="button"
                onClick={() => {
                  setErrorMessage(null);
                  setSuccessMessage(null);
                  setMode("signin");
                }}
                className="login-text-btn"
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <ArrowLeft size={13} />
                <span>Return to sign in</span>
              </button>
            </div>
          </div>
        )}

        {/* REGISTRATION VIEW */}
        {mode === "register" && (
          <div className="login-form-container">
            <div className="login-alert login-alert-info" style={{ marginBottom: "14px" }}>
              <Sparkles size={16} style={{ flexShrink: 0, marginTop: "1px" }} />
              <span>
                HR workspace accounts require provisioning and authorization by your People Operations
                administrator before access is granted.
              </span>
            </div>

            <form onSubmit={handleRegister} noValidate>
              <div className="login-field-group">
                <label htmlFor="reg-name">Full Name</label>
                <div className="login-input-wrap">
                  <input
                    id="reg-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Morgan Vance"
                    required
                    disabled={isSubmitting}
                    className="login-input"
                  />
                </div>
              </div>

              <div className="login-field-group">
                <label htmlFor="reg-email">Work Email</label>
                <div className="login-input-wrap">
                  <input
                    id="reg-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    autoComplete="email"
                    required
                    disabled={isSubmitting}
                    className="login-input"
                  />
                </div>
              </div>

              <div className="login-field-group">
                <label htmlFor="reg-password">Password (min. 6 characters)</label>
                <div className="login-input-wrap">
                  <input
                    id="reg-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    required
                    disabled={isSubmitting}
                    className="login-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="login-input-toggle"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="login-field-group">
                <label htmlFor="reg-confirm">Confirm Password</label>
                <div className="login-input-wrap">
                  <input
                    id="reg-confirm"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    required
                    disabled={isSubmitting}
                    className="login-input"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="primary-action login-submit-btn"
                style={{ marginTop: "8px" }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Registering account…</span>
                  </>
                ) : (
                  <span>Submit HR Account Request</span>
                )}
              </button>
            </form>

            <div style={{ marginTop: "16px", textAlign: "center" }}>
              <button
                type="button"
                onClick={() => {
                  setErrorMessage(null);
                  setSuccessMessage(null);
                  setMode("signin");
                }}
                className="login-text-btn"
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <ArrowLeft size={13} />
                <span>Already have an account? Sign in</span>
              </button>
            </div>
          </div>
        )}

        <div className="login-help" style={{ marginTop: "24px" }}>
          <HeartHandshake size={15} />
          <span>Need a hand? Reach out to your people operations team.</span>
        </div>
      </motion.section>

      <footer className="login-footer">A thoughtful workspace for every employee journey.</footer>
    </main>
  );
}
