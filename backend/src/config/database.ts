import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from './env';

const { Pool } = pg;

export const pool = env.DATABASE_URL ? new Pool({ connectionString: env.DATABASE_URL }) : null;
export const db = pool ? drizzle(pool) : null;
