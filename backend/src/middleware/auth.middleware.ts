import type { Request, Response, NextFunction } from 'express';
import { getFirebaseAuth } from '../config/firebase';
import { userService } from '../services/user.service';
import { auditService } from '../services/audit.service';
import type { AppUser, AppRole } from '../models/user.model';
import { logger } from '../utils/logger';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: AppUser;
      appUser?: AppUser;
      firebaseUser?: {
        uid: string;
        email?: string;
        name?: string;
        picture?: string;
        [key: string]: unknown;
      };
    }
  }
}

/**
 * Middleware to authenticate requests via Firebase ID Token and synchronize
 * with the PostgreSQL app_users table.
 *
 * Implements automatic registration for first-time Google sign-ins, assigning
 * the default 'user' role with personal-dashboard permissions.
 */
export async function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      authorized: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or malformed Authorization header with Bearer token.',
      },
    });
    return;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    res.status(401).json({
      success: false,
      authorized: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Bearer token is empty.',
      },
    });
    return;
  }

  let decodedToken;
  try {
    const auth = getFirebaseAuth();
    decodedToken = await auth.verifyIdToken(token);
  } catch (err) {
    const error = err as Error;
    logger.warn({ message: error.message }, 'Firebase token verification failed');
    res.status(401).json({
      success: false,
      authorized: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid, expired, or revoked Firebase ID token. Please sign in again.',
      },
    });
    return;
  }

  req.firebaseUser = {
    uid: decodedToken.uid,
    email: decodedToken.email,
    name: decodedToken.name,
    picture: decodedToken.picture,
  };

  const email = (decodedToken.email || '').toLowerCase().trim();
  const displayName = decodedToken.name || (email ? email.split('@')[0] : 'User');
  const photoUrl = decodedToken.picture || null;

  try {
    // 1. Look up or automatically register user in PostgreSQL
    let user = await userService.findByFirebaseUid(decodedToken.uid);

    if (!user) {
      logger.info({ uid: decodedToken.uid, email }, 'Auto-registering first-time Google sign-in user in PostgreSQL');
      user = await userService.syncGoogleUser({
        firebaseUid: decodedToken.uid,
        email: email || `${decodedToken.uid}@anonymous.local`,
        displayName,
        photoUrl: photoUrl || undefined,
      });

      // Audit trail for new account registration
      await auditService.log({
        userId: user.id,
        actionType: 'USER_REGISTERED',
        entityType: 'USER',
        entityId: user.id,
        details: { email: user.email, authProvider: 'google.com' },
      });
    } else {
      // Periodic login sync
      user = await userService.syncGoogleUser({
        firebaseUid: decodedToken.uid,
        email: email || user.email,
        displayName: displayName || user.displayName || undefined,
        photoUrl: photoUrl || user.photoUrl || undefined,
      });
    }

    // 2. Reject deactivated or suspended accounts
    if (user.accountStatus !== 'active') {
      res.status(403).json({
        success: false,
        authorized: false,
        error: {
          code: 'ACCOUNT_DEACTIVATED',
          message: 'Your account has been deactivated or suspended. Please contact your system administrator.',
        },
      });
      return;
    }

    // 3. Attach trusted PostgreSQL user profile to request
    req.user = user;
    req.appUser = user;
    next();
  } catch (err) {
    const error = err as Error;
    logger.error({ message: error.message }, 'Database error resolving application user profile');
    res.status(503).json({
      success: false,
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'A temporary database failure occurred while verifying user authorization. Please try again.',
      },
    });
  }
}

