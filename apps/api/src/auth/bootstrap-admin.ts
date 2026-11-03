import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { PasswordHasher, validateNewPassword } from './password-hasher.js';

async function readHidden(prompt: string): Promise<string> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') throw new Error('Gizli parola girişi için etkileşimli terminal gerekiyor.');
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise((resolvePromise, reject) => {
    let value = '';
    const onData = (chunk: Buffer) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003') {
          cleanup();
          reject(new Error('Kurulum iptal edildi.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          cleanup();
          stdout.write('\n');
          resolvePromise(value);
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = Array.from(value).slice(0, -1).join('');
          continue;
        }
        if (character >= ' ' && Buffer.byteLength(value, 'utf8') < 1024) value += character;
      }
    };
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on('data', onData);
  });
}

async function main(): Promise<void> {
  process.loadEnvFile(resolve(process.cwd(), '../../.env'));
  const password = process.env.POSTGRES_PASSWORD;
  if (!password) throw new Error('Yerel veritabanı ayarı bulunamadı.');
  const port = Number(process.env.DB_PORT ?? '5432');
  const pool = new Pool({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port,
    database: process.env.DB_NAME ?? 'encev_pulse_dev',
    user: process.env.DB_USER ?? 'encev_dev',
    password,
    connectionTimeoutMillis: 3000,
    application_name: 'encev-pulse-admin-bootstrap',
  });

  const prompt = createInterface({ input: stdin, output: stdout });
  let username = '';
  let email = '';
  let displayName = '';
  try {
    username = (await prompt.question('Kullanıcı adı: ')).trim().toLowerCase();
    email = (await prompt.question('Kurumsal e-posta: ')).trim().toLowerCase();
    displayName = (await prompt.question('Ad soyad: ')).trim();
  } finally {
    prompt.close();
  }
  if (!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(username)) throw new Error('Kullanıcı adı 2-32 karakter olmalı; harf, sayı, nokta, tire ve alt çizgi kullanın.');
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@encev\.com\.tr$/.test(email)) throw new Error('Kurumsal e-posta @encev.com.tr alan adında olmalıdır.');
  if (!displayName || displayName.length > 120) throw new Error('Ad soyad alanı geçersiz.');

  const firstPassword = await readHidden('İlk yönetici parolası: ');
  const secondPassword = await readHidden('Parolayı tekrar girin: ');
  if (firstPassword !== secondPassword) throw new Error('Girilen parolalar eşleşmiyor.');
  validateNewPassword(firstPassword);
  const passwordHash = await new PasswordHasher().hash(firstPassword);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('encev-pulse-initial-admin'))");
    const bootstrap = await client.query("SELECT 1 FROM auth_bootstrap_state WHERE singleton_key = 'initial_admin'");
    const existingAdmin = await client.query(
      `SELECT 1 FROM user_role_assignments ura JOIN roles r ON r.id = ura.role_id WHERE r.code = 'system_admin' LIMIT 1`,
    );
    if (bootstrap.rowCount || existingAdmin.rowCount) throw new Error('İlk yönetici kurulumu daha önce tamamlanmış.');

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO users (username, email, display_name, password_hash)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [username, email, displayName, passwordHash],
    );
    const userId = inserted.rows[0].id;
    await client.query(
      `INSERT INTO user_role_assignments (user_id, role_id, assigned_by)
       SELECT $1, id, $1 FROM roles WHERE code IN ('employee', 'system_admin')`,
      [userId],
    );
    await client.query(
      `INSERT INTO auth_bootstrap_state (singleton_key, completed_by) VALUES ('initial_admin', $1)`,
      [userId],
    );
    await client.query(
      `INSERT INTO auth_audit_events (actor_user_id, target_user_id, action)
       VALUES ($1, $1, 'initial_admin.created')`,
      [userId],
    );
    await client.query('COMMIT');
    stdout.write('İlk sistem yöneticisi oluşturuldu.\n');
  } catch (error) {
    await client.query('ROLLBACK');
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      throw new Error('Kullanıcı adı veya e-posta başka bir hesapta kullanılıyor.');
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
    firstPassword.replace(/./g, '\0');
    secondPassword.replace(/./g, '\0');
  }
}

main().catch((error: unknown) => {
  stdout.write(`${error instanceof Error ? error.message : 'İlk yönetici kurulamadı.'}\n`);
  process.exitCode = 1;
});
