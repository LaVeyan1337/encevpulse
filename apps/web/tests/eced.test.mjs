import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { Script } from 'node:vm';
import { buildManifestForApi, normalizeApiBase } from '../../../scripts/build-extension.mjs';

test('e-ÇED screen and API use scoped pairing, conservative account states and a portal origin allowlist', async () => {
  const [component, workspace, controller, service, migration, manifestText, worker, popup, options, contentScript, styles] = await Promise.all([
    readFile(new URL('../app/components/eced-workspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/components/workspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../api/src/eced/eced.controller.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../api/src/eced/eced.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../../drizzle/0013_eced_browser_tracking.sql', import.meta.url), 'utf8'),
    readFile(new URL('../../../browser_extension/manifest.json', import.meta.url), 'utf8'),
    readFile(new URL('../../../browser_extension/service-worker.js', import.meta.url), 'utf8'),
    readFile(new URL('../../../browser_extension/popup.js', import.meta.url), 'utf8'),
    readFile(new URL('../../../browser_extension/options.js', import.meta.url), 'utf8'),
    readFile(new URL('../../../browser_extension/content-script.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/eced.css', import.meta.url), 'utf8'),
  ]);
  const manifest = JSON.parse(manifestText);
  const packagedManifest = buildManifestForApi(manifest,'https://pulse.example.test/api');
  assert.ok(packagedManifest.optional_host_permissions.includes('https://pulse.example.test/*'));
  assert.ok(packagedManifest.optional_host_permissions.includes('https://eced.csb.gov.tr/*'));
  assert.equal(packagedManifest.version,'1.0.2');
  assert.equal(buildManifestForApi(manifest,'https://pulse.example.test/api').optional_host_permissions
    .filter((permission)=>permission==='https://pulse.example.test/*').length,1);
  assert.equal(normalizeApiBase('http://127.0.0.1:3000/api'),'http://127.0.0.1:3000/api');
  assert.equal(normalizeApiBase('http://localhost:3000/api'),'http://localhost:3000/api');
  for (const invalidApiBase of [
    'http://pulse.example.test/api',
    'https://*.example.test/api',
    'https://user:password@pulse.example.test/api',
    'https://pulse.example.test/api?token=secret',
    'https://eced.csb.gov.tr/api',
    'javascript:alert(1)',
  ]) assert.throws(()=>normalizeApiBase(invalidApiBase),invalidApiBase);

  for (const [name, source] of Object.entries({
    'service-worker.js':worker,
    'popup.js':popup,
    'options.js':options,
    'content-script.js':contentScript,
  })) {
    assert.doesNotThrow(() => new Script(source, {filename:name}), name + ' must parse');
  }

  assert.ok(workspace.includes('<EcedWorkspace'));
  assert.ok(workspace.includes("hasModulePermission('eced')"));
  assert.ok(workspace.includes('<EcedAccountOverview'));
  assert.ok(component.includes('export function EcedAccountOverview'));
  assert.ok(component.includes('data.claims.some'));
  assert.ok(component.includes("report.sessionState==='active'"));
  assert.ok(component.includes("fresh.every(report=>report.sessionState==='logged_out')"));
  assert.ok(component.includes("tone='busy';label=reserved?'Kullanımda · rezerve':'Açık'"));
  assert.ok(component.includes("tone='ready';label='Girişe hazır'"));
  assert.ok(component.includes("Sinyal eski · durum belirsiz"));
  assert.ok(!component.includes('Girişe hazır · aktif sinyal yok'));
  assert.ok(component.includes('Bağlantı doğrulanamadı'));

  assert.ok(component.includes('eced-pairing-panel'));
  assert.ok(component.indexOf('eced-pairing-panel') > component.indexOf('eced-seen-panel'));
  assert.ok(styles.includes('.eced-overview-panel'));
  assert.ok(styles.includes('.eced-overview-account.tone-busy'));
  assert.ok(styles.includes('.eced-overview-account.tone-ready'));
  assert.ok(component.includes("request('eced/monitor')"));
  assert.ok(component.includes('Sinyal eski'));
  assert.ok(component.includes('Oturum kapalı olarak işaretlendi'));
  assert.ok(component.includes('Bu gözlem, e-ÇED sunucusundan doğrulanmış kimlik kanıtı değildir'));

  assert.ok(controller.includes("@Post('reports')"));
  assert.ok(controller.includes("@Post('pairings')"));
  assert.ok(controller.includes("@Delete('pairings/:deviceId')"));
  assert.ok(service.includes('randomBytes(32)'));
  assert.ok(service.includes("createHash('sha256')"));
  assert.ok(service.includes('ECED_ACCOUNT_OBSERVED_ELSEWHERE'));
  assert.ok(service.includes('ECED_ACCOUNT_NOT_OBSERVED'));
  assert.ok(service.includes("const PORTAL_ORIGIN = 'https://eced.csb.gov.tr'"));
  assert.ok(service.includes('page.origin !== PORTAL_ORIGIN'));
  assert.ok(service.includes('const REPORT_WINDOW_MS = 90_000'));
  assert.ok(service.includes("interval '90 seconds'"));
  assert.ok(migration.includes('CREATE TABLE eced_browser_devices'));
  assert.ok(migration.includes('CREATE TABLE eced_browser_reports'));
  assert.ok(migration.includes('CREATE TABLE eced_account_claims'));

  assert.deepEqual(manifest.optional_host_permissions, ['https://eced.csb.gov.tr/*','http://127.0.0.1/*','http://localhost/*']);
  assert.ok(!manifest.optional_host_permissions.includes('http://*/*'));
  assert.ok(!manifest.optional_host_permissions.includes('https://*/*'));
  assert.ok(manifest.permissions.includes('scripting'));
  assert.ok(!Object.hasOwn(manifest, 'content_scripts'));

  assert.ok(popup.includes("const PORTAL_ORIGIN = 'https://eced.csb.gov.tr'"));
  assert.ok(popup.includes('parsed.origin !== PORTAL_ORIGIN'));
  assert.ok(popup.includes('chrome.scripting.executeScript'));
  assert.ok(popup.includes("files:['content-script.js']"));
  assert.ok(!popup.includes('chrome.tabs.reload'));
  assert.ok(popup.includes('currentTabKey'));
  assert.ok(popup.includes("accountSources[currentTabKey]='manual'"));
  assert.ok(popup.includes('detectedByPortal'));
  assert.ok(popup.includes('showReportResult'));
  assert.ok(popup.includes('Sinyal kontrol ediliyor…'));
  assert.ok(popup.includes("const result = await chrome.runtime.sendMessage({type:'report-active-tab'})"));
  assert.ok(popup.includes("await chrome.runtime.sendMessage({type:'report-active-tab'})"));
  assert.ok(options.includes('chrome.runtime.getManifest().optional_host_permissions'));
  assert.ok(options.includes('testConnection(apiBase,pairingToken)'));
  assert.ok(options.includes('izin listesinde yok'));

  assert.ok(worker.includes("parsed.origin !== 'https://eced.csb.gov.tr'"));
  assert.ok(worker.includes("X-Pulse-Token"));
  assert.ok(worker.includes("credentials: 'omit'"));
  assert.ok(worker.includes("origin + '::' + String(tab.id)"));
  assert.ok(worker.includes('clearTabLabels'));
  assert.ok(worker.includes('chrome.tabs.onRemoved'));
  assert.ok(worker.includes("cfg.accountSources[tabKey] === 'portal'"));
  assert.ok(worker.includes('portal-account-observed'));
  assert.ok(worker.includes('attachObserversToAllowedTabs'));
  assert.ok(worker.includes("chrome.runtime.onStartup.addListener"));
  assert.ok(worker.includes("chrome.runtime.onInstalled.addListener(() => { void initializeBrowserState(); })"));
  assert.ok(worker.includes("await attachPortalObserver(tab)"));
  assert.ok(worker.includes("await attachPortalObserver(tabs[0])"));
  assert.ok(worker.includes("chrome.tabs.onUpdated.addListener"));
  assert.ok(worker.includes('_sender?.tab'));
  assert.ok(worker.includes("accountSources[tabKey]==='manual'"));
  assert.ok(worker.includes('if (!response.ok)'));
  assert.ok(worker.includes("'http_error'"));
  assert.ok(worker.includes("'network_error'"));
  assert.ok(worker.includes('sendResponse(await sendTabReport(tabs[0]))'));
  assert.ok(worker.includes('const REQUEST_TIMEOUT_MS = 10_000'));
  assert.ok(worker.includes('new AbortController()'));
  assert.ok(worker.includes("'request_timeout'"));
  assert.ok(worker.includes("acknowledgement?.queued !== true"));
  assert.ok(worker.includes('const MAX_PARALLEL_REPORTS = 6'));
  assert.ok(worker.includes('Promise.all(batch.map(tab => sendTabReport(tab)))'));
  assert.ok(worker.includes("periodInMinutes:1"),'Older Chromium alarm fallback must be present.');

  assert.ok(contentScript.includes("location.origin !== 'https://eced.csb.gov.tr'"));
  assert.ok(contentScript.includes('__encevPulseAccountObserver'));
  assert.ok(contentScript.includes("const SCRIPT_VERSION = '1.0.2'"));
  assert.ok(contentScript.includes('window.__encevPulseAccountObserver === SCRIPT_VERSION'));
  assert.ok(contentScript.includes('PROFILE_SELECTORS'));
  assert.ok(contentScript.includes('findVisibleAccountName'));
  assert.ok(contentScript.includes('candidates.size === 1'));
  assert.ok(contentScript.includes("closest('input,textarea,select,form"));
  for (const forbidden of ['document.cookie','localStorage','sessionStorage','innerHTML','outerHTML','document.body.innerText','input[type="password"']) {
    assert.ok(!contentScript.includes(forbidden), 'content script must not inspect ' + forbidden);
  }
  for (const forbidden of ['document.cookie','localStorage','sessionStorage','innerHTML','outerHTML']) {
    assert.ok(!worker.includes(forbidden), 'service worker must not inspect ' + forbidden);
    assert.ok(!popup.includes(forbidden), 'popup must not inspect ' + forbidden);
  }
});
