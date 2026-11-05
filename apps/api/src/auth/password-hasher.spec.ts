import assert from 'node:assert/strict';
import test from 'node:test';
import { PasswordHasher } from './password-hasher.js';

test('Argon2id parola hashleri doğru parolayı doğrular, yanlış parolayı reddeder ve her hesap için farklı salt kullanır', async () => {
  const hasher = new PasswordHasher();
  const first = await hasher.hash('Yerel-Test-Parolasi-2026!');
  const second = await hasher.hash('Yerel-Test-Parolasi-2026!');

  assert.match(first, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  assert.notEqual(first, second);
  assert.equal(await hasher.verify('Yerel-Test-Parolasi-2026!', first), true);
  assert.equal(await hasher.verify('yanlis-parola', first), false);
  assert.equal(await hasher.verify('Yerel-Test-Parolasi-2026!', '$not-a-hash'), false);
});
