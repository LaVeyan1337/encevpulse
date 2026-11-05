import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('web istemcisi same-origin kimlik ve görev API yollarını kullanır', async () => {
  const home = await readFile(new URL('../app/routes/home.tsx', import.meta.url), 'utf8');
  const workspace = await readFile(new URL('../app/components/workspace.tsx', import.meta.url), 'utf8');

  assert.match(home, /fetch\('\/api\/auth\/session'/);
  assert.match(home, /fetch\('\/api\/auth\/login'/);
  assert.match(workspace, /fetch\(`\/api\/\$\{path\}`/);
  assert.match(workspace, /tasks\/summary/);
  assert.doesNotMatch(home + workspace, /fetch\(['"`]https?:\/\//);
});
