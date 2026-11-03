import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';

const ARGON2ID_MEMORY_KIB = 19_456;
const ARGON2ID_PASSES = 2;
const ARGON2ID_PARALLELISM = 1;
const ARGON2ID_TAG_BYTES = 32;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2('argon2id', {
      message: Buffer.from(password, 'utf8'),
      nonce: salt,
      memory: ARGON2ID_MEMORY_KIB,
      passes: ARGON2ID_PASSES,
      parallelism: ARGON2ID_PARALLELISM,
      tagLength: ARGON2ID_TAG_BYTES,
    }, (error, key) => error ? reject(error) : resolve(key));
  });
}

export class PasswordHasher {
  async hash(password: string): Promise<string> {
    validatePasswordInput(password);
    const salt = randomBytes(16);
    const key = await derive(password, salt);
    return `$argon2id$v=19$m=${ARGON2ID_MEMORY_KIB},t=${ARGON2ID_PASSES},p=${ARGON2ID_PARALLELISM}$${toPhcBase64(salt)}$${toPhcBase64(key)}`;
  }

  async verify(password: string, encoded: string): Promise<boolean> {
    validatePasswordInput(password);
    const match = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/.exec(encoded);
    if (!match) return false;

    const [, memoryRaw, passesRaw, parallelismRaw, saltRaw, keyRaw] = match;
    const memory = Number(memoryRaw);
    const passes = Number(passesRaw);
    const parallelism = Number(parallelismRaw);
    const salt = Buffer.from(saltRaw, 'base64');
    const expected = Buffer.from(keyRaw, 'base64');
    if (memory < ARGON2ID_MEMORY_KIB || memory > 262_144
      || passes < 1 || passes > 10
      || parallelism < 1 || parallelism > 8
      || salt.length < 16 || expected.length !== ARGON2ID_TAG_BYTES) {
      return false;
    }

    try {
      const actual = await new Promise<Buffer>((resolve, reject) => {
        argon2('argon2id', {
          message: Buffer.from(password, 'utf8'),
          nonce: salt,
          memory,
          passes,
          parallelism,
          tagLength: expected.length,
        }, (error, key) => error ? reject(error) : resolve(key));
      });
      return timingSafeEqual(actual, expected);
    } catch {
      return false;
    }
  }
}

export function validatePasswordInput(password: string): void {
  if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 1024) {
    throw new Error('Parola biçimi geçersiz.');
  }
}

export function validateNewPassword(password: string): void {
  validatePasswordInput(password);
  if (Array.from(password).length < 12) {
    throw new Error('Parola en az 12 karakter olmalıdır.');
  }
}

function toPhcBase64(value: Buffer): string {
  return value.toString('base64').replace(/=+$/, '');
}
