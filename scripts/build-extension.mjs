import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'browser_extension');
const OUTPUT = join(ROOT, '.artifacts', 'browser-extension');
const PORTAL_ORIGIN = 'https://eced.csb.gov.tr';
const EXTENSION_FILES = [
  'service-worker.js', 'content-script.js', 'popup.html', 'popup.css',
  'popup.js', 'options.html', 'options.css', 'README.md',
];

export function normalizeApiBase(value) {
  const raw = String(value ?? '').trim();
  if (!raw) throw new Error('PULSE_API_BASE boş. PULSE API adresini belirtin.');
  let parsed;
  try { parsed = new URL(raw); }
  catch { throw new Error('PULSE_API_BASE geçerli bir URL olmalıdır.'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('PULSE API adresi HTTP(S) olmalıdır.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('PULSE API adresinde kullanıcı adı, parola, query veya hash bulunamaz.');
  }
  if (parsed.hostname.includes('*') || parsed.hostname.includes('?')) {
    throw new Error('Wildcard host adı kullanılamaz.');
  }
  const loopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  if (parsed.protocol !== 'https:' && !loopback) {
    throw new Error('Üretim API adresi HTTPS olmalıdır. HTTP yalnızca 127.0.0.1 veya localhost için kabul edilir.');
  }
  if (parsed.origin === PORTAL_ORIGIN) {
    throw new Error('PULSE API adresi e-ÇED portal origini olamaz.');
  }
  return parsed.href.replace(/\/+$/, '');
}

export function buildManifestForApi(sourceManifest, apiBase) {
  const target = new URL(normalizeApiBase(apiBase));
  const permissions = Array.isArray(sourceManifest.optional_host_permissions)
    ? [...sourceManifest.optional_host_permissions]
    : [];
  const alreadyDeclared = permissions.some((pattern) => {
    if (typeof pattern !== 'string' || !pattern.endsWith('/*')) return false;
    try {
      const parsed = new URL(pattern.slice(0, -2) + '/');
      const exactHost = !parsed.hostname.includes('*') && !parsed.hostname.includes('?');
      return exactHost && parsed.protocol === target.protocol && parsed.hostname === target.hostname;
    } catch { return false; }
  });
  if (!alreadyDeclared) permissions.push(target.protocol + '//' + target.hostname + '/*');
  return { ...sourceManifest, optional_host_permissions: permissions };
}

async function main() {
  const apiBase = process.env.PULSE_API_BASE;
  if (!apiBase) {
    throw new Error('Kullanım: PULSE_API_BASE=https://pulse.example.com/api npm run extension:build');
  }
  const manifestSource = JSON.parse(await readFile(join(SOURCE, 'manifest.json'), 'utf8'));
  const manifest = buildManifestForApi(manifestSource, apiBase);
  await rm(OUTPUT, { recursive: true, force: true });
  await mkdir(OUTPUT, { recursive: true });
  for (const file of EXTENSION_FILES) {
    await copyFile(join(SOURCE, file), join(OUTPUT, file));
  }
  await writeFile( join(OUTPUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log('e-ÇED eklenti paketi oluşturuldu: .artifacts/browser-extension');
  const api = new URL(normalizeApiBase(apiBase));
  console.log('İzin verilen PULSE hostu: ' + api.protocol + '//' + api.hostname);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Eklenti paketi oluşturulamadı.');
    process.exitCode = 1;
  });
}
