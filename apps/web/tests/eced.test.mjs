import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('e-ÇED screen and API use explicit browser pairing and distinguish stale from logged-out signals', async () => {
  const [component, workspace, controller, service, migration, manifest, worker, popup] = await Promise.all([
    readFile(new URL('../app/components/eced-workspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/components/workspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../api/src/eced/eced.controller.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../api/src/eced/eced.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../../drizzle/0013_eced_browser_tracking.sql', import.meta.url), 'utf8'),
    readFile(new URL('../../../browser_extension/manifest.json', import.meta.url), 'utf8'),
    readFile(new URL('../../../browser_extension/service-worker.js', import.meta.url), 'utf8'),
    readFile(new URL('../../../browser_extension/popup.js', import.meta.url), 'utf8'),
  ]);
  assert.match(workspace, /<EcedWorkspace/);
  assert.match(workspace, /hasModulePermission\('eced'\)/);
  assert.match(component, /request\('eced\/monitor'\)/);
  assert.match(component, /Sinyal eski/);
  assert.match(component, /Oturum kapalı olarak işaretlendi/);
  assert.match(component, /Bu gözlem, e-ÇED sunucusundan doğrulanmış kimlik kanıtı değildir/);
  assert.match(controller, /@Post\('reports'\)/);
  assert.match(controller, /@Post\('pairings'\)/);
  assert.match(controller, /@Delete\('pairings\/:deviceId'\)/);
  assert.match(service, /randomBytes\(32\)/);
  assert.match(service, /createHash\('sha256'\)/);
  assert.match(service, /ECED_ACCOUNT_OBSERVED_ELSEWHERE/);
  assert.match(service, /ECED_ACCOUNT_NOT_OBSERVED/);
  assert.match(migration, /CREATE TABLE eced_browser_devices/);
  assert.match(migration, /CREATE TABLE eced_browser_reports/);
  assert.match(migration, /CREATE TABLE eced_account_claims/);
  assert.match(manifest, /optional_host_permissions/);
  assert.match(worker, /X-Pulse-Token/);
  assert.match(worker, /origin \+ '::' \+ String\(tab\.id\)/);
  assert.match(worker, /clearTabLabels/);
  assert.match(worker, /chrome\.tabs\.onRemoved/);
  assert.match(popup, /currentTabKey/);
  assert.match(component, /window\.setInterval/);
  assert.match(component, /20_000/);
  assert.match(worker, /accountSource: accountName \? 'manual' : 'unknown'/);
  assert.match(worker, /credentials: 'omit'/);
  assert.doesNotMatch(worker, /document\.cookie|localStorage|sessionStorage|innerHTML|outerHTML/);
  assert.doesNotMatch(popup, /document\.cookie|localStorage|sessionStorage|innerHTML|outerHTML/);
});
