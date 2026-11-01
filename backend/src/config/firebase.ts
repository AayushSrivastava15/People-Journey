import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import fs from 'node:fs';
import path from 'node:path';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let appInstance: App | null = null;
let authInstance: Auth | null = null;

export function getFirebaseAdminApp(): App {
  if (appInstance) return appInstance;

  const existingApps = getApps();
  if (existingApps.length > 0) {
    appInstance = existingApps[0];
    authInstance = getAuth(appInstance);
    return appInstance;
  }

  // 1. Check for explicit JSON string in env
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const parsed = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
      appInstance = initializeApp({
        credential: cert(parsed),
        projectId: env.FIREBASE_PROJECT_ID,
      });
      logger.info('Firebase Admin initialized with inline service account credentials.');
      authInstance = getAuth(appInstance);
      return appInstance;
    } catch (err) {
      logger.error({ message: (err as Error).message }, 'Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON');
    }
  }

  // 2. Check for service account file path
  if (env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const resolvedPath = path.resolve(process.cwd(), env.FIREBASE_SERVICE_ACCOUNT_PATH);
    if (fs.existsSync(resolvedPath)) {
      try {
        const fileContent = fs.readFileSync(resolvedPath, 'utf-8');
        const parsed = JSON.parse(fileContent);
        appInstance = initializeApp({
          credential: cert(parsed),
          projectId: env.FIREBASE_PROJECT_ID,
        });
        logger.info({ path: resolvedPath }, 'Firebase Admin initialized with service account file.');
        authInstance = getAuth(appInstance);
        return appInstance;
      } catch (err) {
        logger.error({ path: resolvedPath, message: (err as Error).message }, 'Failed to load service account file');
      }
    }
  }

  // 3. Fallback: Initialize with project ID (validates tokens against Google's public JWKS)
  logger.info(
    { projectId: env.FIREBASE_PROJECT_ID },
    'Firebase Admin initialized with Project ID (public key verification mode).'
  );
  appInstance = initializeApp({
    projectId: env.FIREBASE_PROJECT_ID,
  });
  authInstance = getAuth(appInstance);
  return appInstance;
}

export function getFirebaseAuth(): Auth {
  if (!authInstance) {
    getFirebaseAdminApp();
  }
  return authInstance!;
}
