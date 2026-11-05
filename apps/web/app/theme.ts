export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'pulse-theme';

type ThemeStorage = Pick<Storage, 'getItem' | 'setItem'>;
type ThemeRoot = { dataset: { theme?: string } };

export function readSavedTheme(storage: Pick<ThemeStorage, 'getItem'>): Theme {
  try {
    return storage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme: Theme, root: ThemeRoot, storage: Pick<ThemeStorage, 'setItem'>): void {
  root.dataset.theme = theme;
  try {
    storage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Theme remains active for this page even when browser storage is unavailable.
  }
}
