import pg from 'pg';
import {config} from './config.js';
const { Pool } = pg;
export const pool = new Pool({connectionString:config.databaseUrl, max:10, connectionTimeoutMillis:10000});
export const db = (sql,params=[]) => pool.query(sql,params);
export async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const value=await callback(client);
    await client.query('COMMIT');
    return value;
  } catch(err) {
    try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
    throw err;
  } finally { client.release(); }
}
