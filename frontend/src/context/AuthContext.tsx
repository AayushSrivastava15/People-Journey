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
import {
  logout,
  signInWithGoogle as authSignInWithGoogle,
  handleRedirectResult,
  syncUserWithBackend,
} from "../services/authService";
import { broadcastLogout, broadcastLogin, subscribeToAuthEvents } from "../services/auth-sync";
import { queryClient } from "../api/query-client";
import { navigate } from "wouter/use-browser-location";
import { buildApiUrl } from "../api/client";
import type { AppUser, AppRole } from "../types/api";

export interface AuthContextValue {
  user: User | null;
  appUser: AppUser | null;
  loading: boolean;
  isAuthorized: boolean | null;
  authorizationChecking: boolean;
  authRole: AppRole | null;
  authError: string | null;
  isHr: boolean;
  isAdmin: boolean;
  signInWithGoogle: (remember?: boolean) => Promise<User>;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
  verifyAuthorization: (targetUser?: User | null, remember?: boolean) => Promise<boolean>;
  refreshSession: () => Promise<boolean>;
  updateLocalPreferences: (prefs: Record<string, unknown>) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [authorizationChecking, setAuthorizationChecking] = useState(false);
  const [authRole, setAuthRole] = useState<AppRole | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const verifyAuthorization = useCallback(async (targetUser?: User | null, remember = true): Promise<boolean> => {
    const currentUser = targetUser !== undefined ? targetUser : auth.currentUser;

    if (!currentUser) {
      // Check if a valid HttpOnly session cookie exists on the backend
      try {
        const url = buildApiUrl('/auth/session');
        const res = await fetch(url, { credentials: 'include' });
        if (res.ok) {
          const sessionData = await res.json();
          if (sessionData?.authorized && sessionData?.user) {
            setAppUser(sessionData.user);
            setIsAuthorized(true);
            setAuthRole(sessionData.user.role);
            setAuthorizationChecking(false);
            return true;
          }
        }
      } catch {
        // No active session cookie
      }
      setAppUser(null);
      setIsAuthorized(null);
      setAuthRole(null);
      setAuthorizationChecking(false);
      return false;
    }

    setAuthorizationChecking(true);
    setAuthError(null);

    try {
      const token = await currentUser.getIdToken();
      // Synchronize with PostgreSQL via Express backend & establish session cookie
      const profile = await syncUserWithBackend(token, remember);

      setAppUser(profile);
      setIsAuthorized(true);
      setAuthRole(profile.role);
      setAuthorizationChecking(false);
      return true;
    } catch (error) {
      const message = (error as Error).message || "Session verification with server failed.";
      console.error("Authorization check failed:", message);
      setAuthError(message);

      // Do NOT grant fake HR admin privileges. Mark as unauthorized or report temporary outage.
      if (message.includes("deactivated")) {
        setIsAuthorized(false);
      } else {
        // Backend temporarily unavailable: allow user to remain logged into Firebase but mark profile pending
        setIsAuthorized(false);
      }
      setAuthorizationChecking(false);
      return false;
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      await logout();
      broadcastLogout();
    } finally {
      queryClient.clear();
      setUser(null);
      setAppUser(null);
      setIsAuthorized(null);
      setAuthRole(null);
      setAuthError(null);
      setAuthorizationChecking(false);
      if (typeof window !== "undefined") {
        navigate("/", { replace: true });
      }
    }
  }, []);


  const handleSignInWithGoogle = useCallback(async (remember = true) => {
    setAuthorizationChecking(true);
    setAuthError(null);
    try {
      const signedInUser = await authSignInWithGoogle();
      setUser(signedInUser);
      await verifyAuthorization(signedInUser, remember);
      broadcastLogin();
      return signedInUser;
    } catch (error) {
      setAuthorizationChecking(false);
      throw error;
    }
  }, [verifyAuthorization]);

  const getIdToken = useCallback(async (forceRefresh = false): Promise<string | null> => {
    if (!auth.currentUser) return null;
    return auth.currentUser.getIdToken(forceRefresh);
  }, []);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    return verifyAuthorization(auth.currentUser);
  }, [verifyAuthorization]);

  const updateLocalPreferences = useCallback((newPrefs: Record<string, unknown>) => {
    setAppUser(prev => prev ? {
      ...prev,
      preferences: {
        ...(prev.preferences || {}),
        ...newPrefs,
      },
    } : null);
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let active = true;

    authPersistenceReady
      .then(async () => {
        if (!active) return;

        // Check for redirect return result first
        await handleRedirectResult();

        unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
          if (!active) return;
          setUser(currentUser);

          if (currentUser) {
            await verifyAuthorization(currentUser);
          } else {
            // Check if active backend HttpOnly session cookie exists (e.g. after computer restart)
            const hasSession = await verifyAuthorization(null);
            if (!hasSession) {
              setAppUser(null);
              setIsAuthorized(null);
              setAuthRole(null);
              setAuthorizationChecking(false);
            }
          }
          setLoading(false);
        });
      })
      .catch((error) => {
        console.error("Firebase session initialization failed:", error);
        if (active) {
          setUser(null);
          setAppUser(null);
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

  // Cross-tab sync listener: coordinates login & logout events across tabs in same browser profile
  useEffect(() => {
    const unsubscribeSync = subscribeToAuthEvents({
      onLogout: () => {
        queryClient.clear();
        setUser(null);
        setAppUser(null);
        setIsAuthorized(null);
        setAuthRole(null);
        setAuthError(null);
        setAuthorizationChecking(false);
        logout().catch(() => {});
        if (typeof window !== "undefined") {
          navigate("/", { replace: true });
        }
      },
      onLogin: () => {
        // Another tab logged in: re-evaluate session and restore state
        verifyAuthorization(auth.currentUser);
      },
    });
    return unsubscribeSync;
  }, [verifyAuthorization]);


  const isHr = false;
  const isAdmin = false;

  return (
    <AuthContext.Provider
      value={{
        user,
        appUser,
        loading,
        isAuthorized,
        authorizationChecking,
        authRole,
        authError,
        isHr,
        isAdmin,
        signInWithGoogle: handleSignInWithGoogle,
        getIdToken,
        verifyAuthorization,
        refreshSession,
        updateLocalPreferences,
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
