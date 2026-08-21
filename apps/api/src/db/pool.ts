import pg from 'pg';
import { readEnv, type EnvRecord } from '@kpn/config';
import { ApiError } from '../lib/errors.js';

export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (db: Db) => Promise<T>): Promise<T>;
}

class PgDb implements Db {
  constructor(
    private readonly pool: pg.Pool,
    private readonly client?: pg.PoolClient,
  ) {}

  async query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
    const runner = this.client ?? this.pool;
    const result = await runner.query(text, params);
    return result.rows as T[];
  }

  async transaction<T>(fn: (db: Db) => Promise<T>): Promise<T> {
    if (this.client) {
      // Already inside a transaction on a checked-out client; nesting reuses it.
      return fn(this);
    }
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await fn(new PgDb(this.pool, client));
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

let pool: pg.Pool | undefined;

/** Returns a query interface, or throws a 503 setup_required ApiError when DATABASE_URL is absent. */
export function getDb(env: EnvRecord = process.env): Db {
  const connectionString = readEnv(env, 'DATABASE_URL');
  if (!connectionString) {
    throw ApiError.setupRequired('The PostgreSQL database');
  }
  pool ??= new pg.Pool({ connectionString });
  return new PgDb(pool);
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

/** Unwraps a single-row `insert/update ... returning` result, or throws if none came back. */
export function requireRow<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) {
    throw new Error('Expected exactly one row from the database but got none.');
  }
  return row;
}
