import 'dotenv/config';
import { readFile, readdir } from 'node:fs/promises';
import { Pool } from 'pg';
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required; copy .env.example to .env');
const pool = new Pool({ connectionString: databaseUrl });
try {
  const directory = new URL('./migrations/', import.meta.url);
  const files = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort();
  for (const file of files) {
    await pool.query(await readFile(new URL(file, directory), 'utf8'));
    console.log(`Database migration completed (${file}).`);
  }
} finally {
  await pool.end();
}
