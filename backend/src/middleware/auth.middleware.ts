import type { Request, Response, NextFunction } from 'express';
import { getFirebaseAuth } from '../config/firebase';
import { userService } from '../services/user.service';
import type { HrUser, HrRole } from '../models/user.model';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: HrUser;
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
 * Middleware to authenticate requests via Firebase ID Token and authorize
 * against the trusted Oracle HR_USERS table.
 */
export async function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      authorized: false,
      error: 'Unauthorized',
      message: 'Missing or malformed Authorization header with Bearer token.',
    });
    return;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    res.status(401).json({
      authorized: false,
      error: 'Unauthorized',
      message: 'Bearer token is empty.',
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
      authorized: false,
      error: 'Unauthorized',
      message: 'Invalid, expired, or revoked Firebase ID token. Please re-authenticate.',
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

  try {
    // 1. Look up user by verified Firebase UID in Oracle
    let user = await userService.findByFirebaseUid(decodedToken.uid);

    // 2. If not found by UID, check if pre-provisioned by email
    if (!user && email) {
      user = await userService.findByEmail(email);
      if (user) {
        logger.info({ email, hrUserId: user.hrUserId }, 'Linking existing HR user to verified Firebase UID');
        await userService.linkFirebaseUid(user.hrUserId, decodedToken.uid);
        user = await userService.findById(user.hrUserId);
      }
    }

    // 3. Initial bootstrapping check:
    // If HR_USERS table is empty and user email is allowed, securely provision initial hr_admin
    if (!user && email) {
      const totalUsers = await userService.count();
      if (totalUsers === 0 && env.HR_ALLOWED_EMAILS.includes(email)) {
        logger.info({ email }, 'Bootstrapping initial HR Administrator account in Oracle');
        user = await userService.create({
          firebaseUid: decodedToken.uid,
          email,
          fullName: decodedToken.name || email.split('@')[0],
          role: 'hr_admin',
        });
      }
    }

    // 4. Reject unregistered accounts
    if (!user) {
      res.status(403).json({
        authorized: false,
        error: 'Forbidden',
        message: 'Your account is authenticated with Firebase but has not been authorized in the HR Portal user registry.',
      });
      return;
    }

    // 5. Reject deactivated accounts
    if (!user.isActive) {
      res.status(403).json({
        authorized: false,
        error: 'Forbidden',
        message: 'Your HR workspace account has been deactivated. Please contact your system administrator.',
      });
      return;
    }

    // 6. Attach trusted Oracle user record to request
    req.user = user;
    next();
  } catch (err) {
    const error = err as Error;
    logger.error({ message: error.message }, 'Error resolving HR user in database during authentication');
    res.status(500).json({
      error: 'InternalServerError',
      message: 'A database error occurred while verifying user authorization.',
    });
  }
}

/**
 * Middleware factory to enforce specific HR roles.
 */
export function requireRole(allowedRoles: HrRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        authorized: false,
        error: 'Unauthorized',
        message: 'Authentication required.',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        authorized: false,
        error: 'Forbidden',
        message: `Action requires one of the following roles: ${allowedRoles.join(', ')}. Current role: ${req.user.role}.`,
      });
      return;
    }

    next();
  };
}

/**
 * Convenience middleware to require hr_admin role.
 */
export const requireAdmin = requireRole(['hr_admin']);
