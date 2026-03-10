import { ThemeConfig, ThemeName, themes } from '@/hooks/reader-types';

/**
 * Build the CSS string for the current reader theme + font size.
 */
export function buildThemeCSS(theme: ThemeConfig, size: number): string {
  return `
    body { background-color: ${theme.bg} !important; color: ${theme.text} !important; font-size: ${size}% !important; ${theme.fontWeight ? `font-weight: ${theme.fontWeight} !important;` : ''} ${theme.fontFamily ? `font-family: ${theme.fontFamily} !important;` : ''} }
    p, span, div, li, td, th, h1, h2, h3, h4, h5, h6, a, blockquote { color: ${theme.text} !important; ${theme.fontWeight ? `font-weight: ${theme.fontWeight} !important;` : ''} ${theme.fontFamily ? `font-family: ${theme.fontFamily} !important;` : ''} }
    img, svg, figure, table { border-radius: 4px; }
    figure, table, .figure, [class*="figure"] { background-color: ${theme.bg} !important; }
    td, th { background-color: ${theme.bg} !important; border-color: ${theme.text}33 !important; }
  `;
}

/**
 * Apply the named theme to an iframe document. Accepts the Document directly
 * so callers can pass whatever document reference they have.
 */
export function applyThemeToIframe(doc: Document | null, themeName: ThemeName, size: number) {
  if (!doc) return;
  const theme = themes[themeName];
  let styleEl = doc.getElementById('reader-theme');
  if (!styleEl) {
    styleEl = doc.createElement('style');
    styleEl.id = 'reader-theme';
    doc.head.appendChild(styleEl);
  }
  styleEl.textContent = buildThemeCSS(theme, size);
}
