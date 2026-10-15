import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required; copy .env.example to .env');
const pool = new Pool({ connectionString: databaseUrl });
try {
  const sql = await readFile(new URL('./migrations/001_initial.sql', import.meta.url), 'utf8');
  await pool.query(sql);
  console.log('Database migration completed (001_initial.sql).');
} finally {
  await pool.end();
}
