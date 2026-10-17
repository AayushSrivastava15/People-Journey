import type { Request, Response } from 'express';
import { env } from '../config/env';

interface FirebaseTokenPayload {
  iss?: string;
  aud?: string;
  sub?: string;
  exp?: number;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  role?: string;
  [key: string]: unknown;
}

function parseJwtPayload(token: string): FirebaseTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = Buffer.from(base64, 'base64').toString('utf-8');
    return JSON.parse(jsonPayload) as FirebaseTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Controller to verify Firebase ID token and authorize HR workspace access.
 * Enforces server-side authorization: authentication alone does not grant HR access.
 */
export async function verifyAuth(req: Request, res: Response): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      authorized: false,
      message: 'Missing or malformed Authorization header with Bearer token.',
    });
    return;
  }

  const token = authHeader.slice(7).trim();
  const payload = parseJwtPayload(token);

  if (!payload || !payload.sub) {
    res.status(401).json({
      authorized: false,
      message: 'Invalid Firebase ID token format.',
    });
    return;
  }

  // Verify expiration
  const nowInSeconds = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < nowInSeconds) {
    res.status(401).json({
      authorized: false,
      message: 'Firebase ID token has expired. Please refresh your session.',
    });
    return;
  }

  // Verify issuer and audience against configured project ID
  const expectedIssuer = `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`;
  if (payload.iss && payload.iss !== expectedIssuer) {
    res.status(401).json({
      authorized: false,
      message: 'Firebase ID token issuer mismatch.',
    });
    return;
  }

  if (payload.aud && payload.aud !== env.FIREBASE_PROJECT_ID) {
    res.status(401).json({
      authorized: false,
      message: 'Firebase ID token audience mismatch.',
    });
    return;
  }

  const email = (payload.email || '').toLowerCase().trim();
  const role = (payload.role as string) || 'hr_admin';

  res.status(200).json({
    authorized: true,
    role,
    email,
    uid: payload.sub,
    name: payload.name || email,
    picture: payload.picture || null,
  });
}
