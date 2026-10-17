import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  onAuthStateChanged,
  type User,
} from "firebase/auth";

import { auth, authPersistenceReady } from "../lib/firebase";
import { logout } from "../services/authService";

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAuthorized: boolean | null;
  authorizationChecking: boolean;
  authRole: string | null;
  authError: string | null;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
  verifyAuthorization: (targetUser?: User | null) => Promise<boolean>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [authorizationChecking, setAuthorizationChecking] = useState(false);
  const [authRole, setAuthRole] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const verifyAuthorization = useCallback(async (targetUser?: User | null): Promise<boolean> => {
    const currentUser = targetUser !== undefined ? targetUser : auth.currentUser;

    if (!currentUser) {
      setIsAuthorized(null);
      setAuthRole(null);
      setAuthorizationChecking(false);
      return false;
    }

    setAuthorizationChecking(true);
    setAuthError(null);

    try {
      const token = await currentUser.getIdToken();
      const tokenResult = await currentUser.getIdTokenResult();

      // 1. Firebase Custom Claims (Production & Admin SDK provisioned role)
      if (tokenResult.claims.role === "hr_admin" || tokenResult.claims.role === "hr_staff") {
        const role = String(tokenResult.claims.role);
        setIsAuthorized(true);
        setAuthRole(role);
        setAuthorizationChecking(false);
        return true;
      }

      // 2. Backend verification endpoint (Node/Express or Spring Boot REST API)
      const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";
      try {
        const response = await fetch(`${apiBase.replace(/\/$/, "")}/auth/verify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.authorized) {
            setIsAuthorized(true);
            setAuthRole(data.role || "hr_admin");
            setAuthorizationChecking(false);
            return true;
          }
        } else if (response.status === 403) {
          // Explicit server-side rejection for non-HR accounts
          setIsAuthorized(false);
          setAuthRole(null);
          setAuthorizationChecking(false);
          return false;
        }
      } catch {
        // Backend offline or unreachable: fall back to configured development allowlist
      }

      // 3. Development HR allowlist from environment
      const allowedEmails = (import.meta.env.VITE_HR_ALLOWED_EMAILS || "")
        .split(",")
        .map((e: string) => e.trim().toLowerCase())
        .filter(Boolean);

      const userEmail = (currentUser.email || "").toLowerCase().trim();

      if (userEmail && allowedEmails.includes(userEmail)) {
        setIsAuthorized(true);
        setAuthRole("hr_admin");
        setAuthorizationChecking(false);
        return true;
      }

      // Explicit deny if no rule matches
      setIsAuthorized(false);
      setAuthRole(null);
      setAuthorizationChecking(false);
      return false;
    } catch (error) {
      console.error("Authorization check failed:", error);
      setIsAuthorized(false);
      setAuthRole(null);
      setAuthError("Failed to verify HR workspace permissions.");
      setAuthorizationChecking(false);
      return false;
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      await logout();
    } finally {
      setUser(null);
      setIsAuthorized(null);
      setAuthRole(null);
      setAuthorizationChecking(false);
    }
  }, []);

  const getIdToken = useCallback(async (forceRefresh = false): Promise<string | null> => {
    if (!auth.currentUser) return null;
    return auth.currentUser.getIdToken(forceRefresh);
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let active = true;

    authPersistenceReady
      .then(() => {
        if (!active) return;

        unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
          if (!active) return;
          setUser(currentUser);
          setLoading(false);

          if (currentUser) {
            await verifyAuthorization(currentUser);
          } else {
            setIsAuthorized(null);
            setAuthRole(null);
            setAuthorizationChecking(false);
          }
        });
      })
      .catch((error) => {
        console.error("Firebase session initialization failed:", error);
        if (active) {
          setUser(null);
          setIsAuthorized(null);
          setLoading(false);
          setAuthorizationChecking(false);
        }
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [verifyAuthorization]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthorized,
        authorizationChecking,
        authRole,
        authError,
        getIdToken,
        verifyAuthorization,
        signOut: handleSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
