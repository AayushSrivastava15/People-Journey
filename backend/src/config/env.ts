export const env = {
  PORT: Number(process.env.PORT) || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL || '',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || 'peoplejourney-4d586',
  HR_ALLOWED_EMAILS: (process.env.HR_ALLOWED_EMAILS || 'hr@peoplejourney.com,admin@peoplejourney.com')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean),
};
