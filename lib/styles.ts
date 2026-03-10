import type { CSSProperties } from 'react';

export const COLORS = {
  primary: '#2f95dc',
  error: '#c00',
  text: '#333',
  textMuted: '#999',
  border: '#e8e8e8',
  borderLight: '#f0f0f0',
  panelBg: '#fafafa',
} as const;

export const PANEL_STYLES: Record<string, CSSProperties> = {
  dropdown: {
    backgroundColor: '#fafafa',
    border: '1px solid #e8e8e8',
    borderRadius: '8px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    zIndex: 50,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  dropdownHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #eee',
    fontSize: '14px',
  },
  iconButtonSmall: {
    background: 'none',
    border: 'none',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '4px 8px',
    color: '#999',
  },
  emptyState: {
    padding: '30px 20px',
    textAlign: 'center' as const,
    color: '#999',
    fontSize: '13px',
  },
};
