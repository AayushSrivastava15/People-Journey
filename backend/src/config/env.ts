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
  FRONTEND_URL: (
    process.env.FRONTEND_URL ||
    (process.env.CORS_ORIGIN || '').split(',')[0].trim() ||
    (process.env.NODE_ENV === 'production' ? 'https://people-journey-frontend.onrender.com' : 'http://localhost:3000')
  ).replace(/\/$/, ''),
  PUBLIC_APP_URL: process.env.PUBLIC_APP_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : ''),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // Google Forms Integration & Webhook Security
  GOOGLE_FORMS_URL: process.env.GOOGLE_FORMS_URL || 'https://docs.google.com/forms/d/e/1FAIpQLScU6NpuggNgHkybtyD7PYDyZhabK1V3L8MbKoCrcCIFiyb4uw/viewform',
  GOOGLE_FORMS_WEBHOOK_SECRET: process.env.GOOGLE_FORMS_WEBHOOK_SECRET || 'pj_gforms_sec_9f7a2d48b1c5',
  APP_BASE_URL: process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : ''),

  // PostgreSQL Database configuration (Supabase)
  DATABASE_URL: process.env.DATABASE_URL || '',
  DIRECT_URL: process.env.DIRECT_URL || '',
  DATABASE_POOL_MIN: Number(process.env.DATABASE_POOL_MIN) || 1,
  DATABASE_POOL_MAX: Number(process.env.DATABASE_POOL_MAX) || 10,

  // Firebase Admin configuration
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || 'peoplejourney-4d586',
  FIREBASE_SERVICE_ACCOUNT_PATH: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '',
  FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '',
};
