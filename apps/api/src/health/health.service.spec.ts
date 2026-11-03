import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DatabaseService } from '../database/database.service.js';
import { HealthService } from './health.service.js';

test('liveness does not depend on the database', () => {
  const health = new HealthService({
    checkConnection: async () => {
      throw new Error('database unavailable');
    },
  } as unknown as DatabaseService);

  assert.deepEqual(health.live(), { status: 'ok' });
});

test('readiness succeeds only when the database check succeeds', async () => {
  const health = new HealthService({ checkConnection: async () => undefined } as unknown as DatabaseService);
  assert.deepEqual(await health.ready(), { status: 'ok', database: 'ok' });
});

test('readiness reports a safe unavailable status when the database check fails', async () => {
  const health = new HealthService({
    checkConnection: async () => {
      throw new Error('sensitive connection details must not escape');
    },
  } as unknown as DatabaseService);

  assert.deepEqual(await health.ready(), {
    status: 'unavailable',
    database: 'unavailable',
  });
});
