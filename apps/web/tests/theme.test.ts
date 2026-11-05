import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyTheme, readSavedTheme, THEME_STORAGE_KEY } from '../app/theme';

test('saved light theme is restored and written to the document root', () => {
  const values = new Map([[THEME_STORAGE_KEY, 'light']]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  const root = { dataset: {} as { theme?: string } };

  const initial = readSavedTheme(storage);
  applyTheme(initial, root, storage);

  assert.equal(initial, 'light');
  assert.equal(root.dataset.theme, 'light');
  assert.equal(values.get(THEME_STORAGE_KEY), 'light');

  applyTheme('dark', root, storage);
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(values.get(THEME_STORAGE_KEY), 'dark');
});

test('theme still changes when browser storage is unavailable', () => {
  const unavailableStorage = {
    getItem: () => {
      throw new Error('storage unavailable');
    },
    setItem: () => {
      throw new Error('storage unavailable');
    },
  };
  const root = { dataset: {} as { theme?: string } };

  assert.equal(readSavedTheme(unavailableStorage), 'dark');
  assert.doesNotThrow(() => applyTheme('light', root, unavailableStorage));
  assert.equal(root.dataset.theme, 'light');
});
