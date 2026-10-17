import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";

import {
  auth,
  authPersistenceReady,
  googleProvider,
} from "../lib/firebase";

/**
 * Sign in with Google.
 */
export async function signInWithGoogle(): Promise<User> {
  await authPersistenceReady;
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

/**
 * Register with email and password.
 */
export async function registerWithEmail(
  email: string,
  password: string,
  displayName: string,
): Promise<User> {
  await authPersistenceReady;

  const result = await createUserWithEmailAndPassword(
    auth,
    email.trim(),
    password,
  );

  if (displayName.trim()) {
    await updateProfile(result.user, {
      displayName: displayName.trim(),
    });
  }

  return result.user;
}

/**
 * Sign in with email and password.
 */
export async function signInWithEmail(
  email: string,
  password: string,
): Promise<User> {
  await authPersistenceReady;

  const result = await signInWithEmailAndPassword(
    auth,
    email.trim(),
    password,
  );

  return result.user;
}

/**
 * Send password reset email.
 */
export async function resetPassword(email: string): Promise<void> {
  await authPersistenceReady;
  await sendPasswordResetEmail(auth, email.trim());
}

/**
 * Get the current user's Firebase ID token for authenticated requests.
 */
export async function getCurrentUserToken(forceRefresh = false): Promise<string | null> {
  if (!auth.currentUser) return null;
  return auth.currentUser.getIdToken(forceRefresh);
}

/**
 * Sign out the current user.
 */
export async function logout(): Promise<void> {
  await signOut(auth);
}

/**
 * Map Firebase error codes to friendly, human-centric messages.
 * Never leaks internal stacks, tokens, or raw technical error objects.
 */
export function mapAuthError(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "An unexpected error occurred. Please try again.";
  }

  const err = error as { code?: string; message?: string };
  const code = err.code || "";

  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "The email or password you entered didn’t match our records. Please try again.";

    case "auth/popup-closed-by-user":
      return "The Google sign-in window was closed before finishing. Please try again when ready.";

    case "auth/popup-blocked":
      return "Your browser blocked the Google sign-in popup. Please allow popups for this site and try again.";

    case "auth/cancelled-popup-request":
      return "A new sign-in was started before the previous one completed.";

    case "auth/too-many-requests":
      return "Access to this account is temporarily paused due to multiple unsuccessful attempts. Reset your password or wait a moment to try again.";

    case "auth/user-disabled":
      return "This account has been deactivated. Please contact your People Operations administrator.";

    case "auth/invalid-email":
      return "Please enter a valid work or corporate email address.";

    case "auth/email-already-in-use":
      return "An account with this email address already exists. Try signing in or request a password reset.";

    case "auth/weak-password":
      return "Please choose a stronger password with at least 6 characters.";

    case "auth/network-request-failed":
      return "We could not connect to the authentication service. Please check your internet connection.";

    case "auth/operation-not-allowed":
      return "This authentication provider is not enabled in the Firebase Console. Please verify with your system administrator.";

    case "auth/requires-recent-login":
      return "For security, please sign in again before performing this sensitive action.";

    default:
      if (err.message && err.message.length < 120 && !err.message.includes("Firebase:")) {
        return err.message;
      }
      return "Unable to sign in. Please check your connection and try again.";
  }
}
