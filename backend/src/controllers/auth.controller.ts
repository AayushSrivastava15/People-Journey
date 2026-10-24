import type { Request, Response } from 'express';
import { userService } from '../services/user.service';
import { UpdateUserProfileSchema } from '../models/user.model';
import { getFirebaseAuth } from '../config/firebase';
import { logger } from '../utils/logger';

/**
 * Retrieve current authenticated session and PostgreSQL user profile.
 */
export async function getSession(req: Request, res: Response): Promise<void> {
  const user = req.user;

  if (!user) {
    res.status(401).json({
      success: false,
      authorized: false,
      error: {
        code: 'UNAUTHENTICATED',
        message: 'No active session found.',
      },
    });
    return;
  }

  res.status(200).json({
    success: true,
    authorized: true,
    user: {
      id: user.id,
      uid: user.firebaseUid,
      email: user.email,
      name: user.displayName || user.email.split('@')[0],
      displayName: user.displayName,
      picture: user.photoUrl || req.firebaseUser?.picture || null,
      photoUrl: user.photoUrl,
      role: user.role,
      accountStatus: user.accountStatus,
      isActive: user.accountStatus === 'active',
      preferences: user.preferences,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    },
  });
}

/**
 * Endpoint for explicit Google Sign-In exchange.
 * Accepts ID token in Authorization header or request body,
 * verifies with Firebase Admin, synchronizes with PostgreSQL,
 * and returns user profile.
 */
export async function googleLogin(req: Request, res: Response): Promise<void> {
  let token = req.body?.idToken;
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }
  }

  if (!token) {
    res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'Firebase ID token is required.',
      },
    });
    return;
  }

  try {
    const auth = getFirebaseAuth();
    const decodedToken = await auth.verifyIdToken(token);

    const email = (decodedToken.email || '').toLowerCase().trim();
    const displayName = decodedToken.name || (email ? email.split('@')[0] : 'User');
    const photoUrl = decodedToken.picture || undefined;

    const user = await userService.syncGoogleUser({
      firebaseUid: decodedToken.uid,
      email: email || `${decodedToken.uid}@anonymous.local`,
      displayName,
      photoUrl,
    });

    if (user.accountStatus !== 'active') {
      res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_DEACTIVATED',
          message: 'Your account has been deactivated. Please contact your system administrator.',
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      authorized: true,
      user: {
        id: user.id,
        uid: user.firebaseUid,
        email: user.email,
        name: user.displayName,
        displayName: user.displayName,
        picture: user.photoUrl,
        photoUrl: user.photoUrl,
        role: user.role,
        accountStatus: user.accountStatus,
        preferences: user.preferences,
      },
    });
  } catch (err) {
    const error = err as Error;
    logger.warn({ message: error.message }, 'Failed Google authentication exchange');
    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired Firebase ID token.',
      },
    });
  }
}

/**
 * Retrieve the current user's profile.
 */
export async function getCurrentUserProfile(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required.',
      },
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: req.user,
  });
}

/**
 * Update the current user's explicitly permitted profile fields.
 */
export async function updateCurrentUserProfile(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required.',
      },
    });
    return;
  }

  const parseResult = UpdateUserProfileSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid profile update values.',
        issues: parseResult.error.format(),
      },
    });
    return;
  }

  try {
    const updated = await userService.updateProfile(req.user.id, parseResult.data);
    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (err) {
    const error = err as Error;
    logger.error({ message: error.message }, 'Failed to update profile');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message,
      },
    });
  }
}

/**
 * Handle application logout.
 */
export async function logout(_req: Request, res: Response): Promise<void> {
  res.status(200).json({
    success: true,
    message: 'Signed out successfully.',
  });
}

// Compatibility alias for verifyAuth
export const verifyAuth = getSession;

