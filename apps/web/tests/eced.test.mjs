import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('e-ÇED screen and API use explicit browser pairing and distinguish stale from logged-out signals', async () => {
  const [component, workspace, controller, service, migration, manifest, worker, popup, contentScript, styles] = await Promise.all([
    readFile(new URL('../app/components/eced-workspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/components/workspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../api/src/eced/eced.controller.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../api/src/eced/eced.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../../drizzle/0013_eced_browser_tracking.sql', import.meta.url), 'utf8'),
    readFile(new URL('../../../browser_extension/manifest.json', import.meta.url), 'utf8'),
    readFile(new URL('../../../browser_extension/service-worker.js', import.meta.url), 'utf8'),
    readFile(new URL('../../../browser_extension/popup.js', import.meta.url), 'utf8'),
    readFile(new URL('../../../browser_extension/content-script.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/eced.css', import.meta.url), 'utf8'),
  ]);
  assert.match(workspace, /<EcedWorkspace/);
  assert.match(workspace, /hasModulePermission\('eced'\)/);
  assert.match(workspace, /<EcedAccountOverview/);
  assert.match(component, /export function EcedAccountOverview/);
  assert.match(component, /eced-pairing-panel/);
  assert.ok(component.indexOf('eced-pairing-panel') > component.indexOf('eced-seen-panel'), 'browser pairing must be at the bottom of the e-ÇED page');
  assert.match(styles, /\.eced-overview-panel/);
  assert.match(styles, /\.eced-overview-account\.tone-busy/);
  assert.match(styles, /\.eced-overview-account\.tone-ready/);
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
  assert.match(worker, /const accountSource = accountName \? \(cfg\.accountSources\[tabKey\] === 'portal' \? 'portal' : 'manual'\) : 'unknown'/);
  assert.match(worker, /portal-account-observed/);
  assert.match(worker, /_sender\?\.tab/);
  assert.match(worker, /accountSources\[tabKey\]==='manual'/);
  assert.match(popup, /accountSources\[currentTabKey\]='manual'/);
  assert.match(popup, /detectedByPortal/);
  assert.match(manifest, /"scripting"/);
  assert.doesNotMatch(manifest, /"content_scripts"/);
  assert.match(popup, /chrome\.scripting\.executeScript/);
  assert.match(popup, /files:\['content-script\.js'\]/);
  assert.doesNotMatch(popup, /chrome\.tabs\.reload/);
  assert.match(contentScript, /__encevPulseAccountObserver/);
  assert.match(contentScript, /PROFILE_SELECTORS/);
  assert.match(contentScript, /findVisibleAccountName/);
  assert.match(contentScript, /candidates\.size === 1/);
  assert.match(contentScript, /closest\('input,textarea,select,form/);
  assert.doesNotMatch(contentScript, /document\.cookie|localStorage|sessionStorage|innerHTML|outerHTML|document\.body\.innerText/);
  assert.doesNotMatch(contentScript, /input\[type=["']password/);
  assert.match(worker, /credentials: 'omit'/);
  assert.match(worker, /accountSource,/);
  assert.doesNotMatch(worker, /document\.cookie|localStorage|sessionStorage|innerHTML|outerHTML/);
  assert.doesNotMatch(popup, /document\.cookie|localStorage|sessionStorage|innerHTML|outerHTML/);
});
