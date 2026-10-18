import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Look for .env in current working directory and in backend folder
const candidateEnvPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'backend/.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../backend/.env'),
];

for (const candidate of candidateEnvPaths) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

export const env = {
  PORT: Number(process.env.PORT) || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // Oracle Database configuration
  ORACLE_USER: process.env.ORACLE_USER || 'PEOPLE_JOURNEY',
  ORACLE_PASSWORD: process.env.ORACLE_PASSWORD || '',
  ORACLE_CONNECT_STRING: process.env.ORACLE_CONNECT_STRING || 'localhost:1521/FREEPDB1',
  ORACLE_POOL_MIN: Number(process.env.ORACLE_POOL_MIN) || 1,
  ORACLE_POOL_MAX: Number(process.env.ORACLE_POOL_MAX) || 10,
  ORACLE_POOL_INCREMENT: Number(process.env.ORACLE_POOL_INCREMENT) || 1,

  // Firebase Admin configuration
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || 'peoplejourney-4d586',
  FIREBASE_SERVICE_ACCOUNT_PATH: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '',
  FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '',

  // Fallback HR emails for dev bootstrapping
  HR_ALLOWED_EMAILS: (process.env.HR_ALLOWED_EMAILS || 'hr@peoplejourney.com,admin@peoplejourney.com')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean),
};
