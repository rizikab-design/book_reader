/**
 * ThemesPanel — Theme picker + font size controls
 *
 * Used by both ePub and PDF readers.
 */

import React from 'react';
import type { ThemeName, ThemeConfig } from '@/hooks/reader-types';
import { PANEL_STYLES } from '@/lib/styles';

interface ThemesPanelProps {
  activeTheme: ThemeName;
  fontSize: number;
  themes: Record<ThemeName, ThemeConfig>;
  onThemeChange: (theme: ThemeName) => void;
  onFontSizeChange: (delta: number) => void;
  panelTheme: React.CSSProperties;
  panelBorder: string;
  onClose: () => void;
}

export default function ThemesPanel({
  activeTheme,
  fontSize,
  themes,
  onThemeChange,
  onFontSizeChange,
  panelTheme,
  onClose,
}: ThemesPanelProps) {
  return (
    <div className="reader-panel-dropdown" style={{ ...styles.themesDropdown, ...panelTheme }} data-popup>
      <div style={PANEL_STYLES.dropdownHeader}>
        <strong>Themes & Settings</strong>
        <button onClick={onClose} style={PANEL_STYLES.iconButtonSmall}>
          {'\u2715'}
        </button>
      </div>

      {/* Font size controls */}
      <div style={styles.fontSizeRow}>
        <button
          onClick={() => onFontSizeChange(-10)}
          style={styles.fontSizeButton}
          title="Decrease font size"
        >
          <span style={{ fontSize: '14px' }}>A</span>
        </button>
        <span style={{ fontSize: '13px', color: '#666', minWidth: '40px', textAlign: 'center' }}>
          {fontSize}%
        </span>
        <button
          onClick={() => onFontSizeChange(10)}
          style={styles.fontSizeButton}
          title="Increase font size"
        >
          <span style={{ fontSize: '20px' }}>A</span>
        </button>
      </div>

      {/* Theme grid */}
      <div style={styles.themeGrid}>
        {(Object.keys(themes) as ThemeName[]).map((key) => {
          const t = themes[key];
          return (
            <button
              key={key}
              onClick={() => onThemeChange(key)}
              style={{
                ...styles.themeCard,
                backgroundColor: t.bg,
                color: t.text,
                border: activeTheme === key ? '2px solid #2f95dc' : '2px solid #e0e0e0',
                fontWeight: t.fontWeight === 'bold' ? 700 : 400,
                fontFamily: t.fontFamily || 'inherit',
              }}
            >
              <span style={{ fontSize: '22px', lineHeight: 1 }}>Aa</span>
              <span style={{ fontSize: '11px', marginTop: '4px' }}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  themesDropdown: {
    position: 'absolute',
    top: '44px',
    right: '50px',
    width: '280px',
    backgroundColor: '#fafafa',
    border: '1px solid #e8e8e8',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
    zIndex: 50,
    overflow: 'hidden',
  },
  fontSizeRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    padding: '12px 16px',
    borderBottom: '1px solid #eee',
  },
  fontSizeButton: {
    background: 'none',
    border: '1px solid #ddd',
    borderRadius: '8px',
    width: '44px',
    height: '36px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#333',
  },
  themeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '10px',
    padding: '16px',
  },
  themeCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '14px 8px',
    borderRadius: '12px',
    cursor: 'pointer',
    minHeight: '70px',
    transition: 'border-color 0.15s',
  },
};
