import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';

function loadEnvironment(): void {
  const envPath = resolve(process.cwd(), '../../.env');
  process.loadEnvFile(envPath);
}

async function main(): Promise<void> {
  loadEnvironment();
  const password = process.env.POSTGRES_PASSWORD;
  if (!password) throw new Error('Required local database configuration is missing.');

  const port = Number(process.env.DB_PORT ?? '5432');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Local database port configuration is invalid.');
  }

  const pool = new Pool({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port,
    database: process.env.DB_NAME ?? 'encev_pulse_dev',
    user: process.env.DB_USER ?? 'encev_dev',
    password,
    connectionTimeoutMillis: 3000,
    application_name: 'encev-pulse-local-migrations',
  });

  try {
    const client = await pool.connect();
    const files = (await readdir(resolve(process.cwd(), '../../drizzle')))
      .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name))
      .sort();

    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('encev-pulse-migrations'))");
      await client.query(`
        CREATE TABLE IF NOT EXISTS app_schema_migrations (
          version text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      for (const file of files) {
        const existing = await client.query('SELECT 1 FROM app_schema_migrations WHERE version = $1', [file]);
        if (existing.rowCount) continue;
        const migration = await readFile(resolve(process.cwd(), '../../drizzle', file), 'utf8');
        await client.query(migration);
        await client.query('INSERT INTO app_schema_migrations (version) VALUES ($1)', [file]);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }

  process.stdout.write('Yerel veritabanı migration kontrolü tamamlandı.\n');
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Migration başarısız.'}\n`);
  process.exitCode = 1;
});
