import { useMemo } from 'react';
import { usePersistedState } from './usePersistedState';
import { ThemeName, themes } from './reader-types';

function getDefaultTheme(): ThemeName {
  try {
    // If user has explicitly set a theme, usePersistedState will use it.
    // This only determines the fallback for first-time use.
    if (localStorage.getItem('reader-global-theme')) return 'original';
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'quiet';
  } catch { /* SSR or no matchMedia */ }
  return 'original';
}

export function useReaderTheme() {
  const [activeTheme, setActiveTheme] = usePersistedState<ThemeName>('reader-global-theme', getDefaultTheme());
  const [fontSize, setFontSize] = usePersistedState<number>('reader-global-fontSize', 100);

  const themeColors = themes[activeTheme];

  const panelTheme: React.CSSProperties = useMemo(() => ({
    backgroundColor: themeColors.bg,
    color: themeColors.text,
    borderColor: activeTheme === 'quiet' ? '#555' : '#e8e8e8',
  }), [activeTheme, themeColors]);

  const panelBorder = activeTheme === 'quiet' ? '#555' : '#f0f0f0';

  function changeFontSize(delta: number) {
    setFontSize(prev => Math.max(50, Math.min(200, prev + delta)));
  }

  return {
    activeTheme, setActiveTheme,
    fontSize, setFontSize,
    themeColors, panelTheme, panelBorder,
    changeFontSize,
  };
}
