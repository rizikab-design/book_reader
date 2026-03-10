/**
 * TocPanel — Table of Contents panel
 *
 * Used by both ePub and PDF readers.
 * ePub: tocItems have { label, href, level }
 * PDF:  tocItems have { title, page }
 */

import React from 'react';
import { PANEL_STYLES } from '@/lib/styles';

/** ePub TOC item shape */
export interface EpubTocItem {
  label: string;
  href: string;
  level: number;
}

/** PDF TOC item shape */
export interface PdfTocItem {
  title: string;
  page: number;
}

interface TocPanelProps {
  tocItems: EpubTocItem[] | PdfTocItem[];
  themeColors: { bg: string; text: string };
  panelTheme: React.CSSProperties;
  panelBorder: string;
  /** ePub calls with href string; PDF calls with page number */
  onNavigate: (target: string | number) => void;
  onClose: () => void;
  /** 'sidebar' renders as side panel (ePub), 'dropdown' renders as overlay dropdown (PDF) */
  variant?: 'sidebar' | 'dropdown';
}

function isEpubItem(item: EpubTocItem | PdfTocItem): item is EpubTocItem {
  return 'href' in item;
}

export default function TocPanel({
  tocItems,
  themeColors,
  panelTheme,
  panelBorder,
  onNavigate,
  onClose,
  variant = 'sidebar',
}: TocPanelProps) {
  const isSidebar = variant === 'sidebar';

  return (
    <div className="reader-panel-dropdown" style={{ ...(isSidebar ? styles.tocPanelSidebar : styles.tocPanelDropdown), ...panelTheme }}>
      <div style={PANEL_STYLES.dropdownHeader}>
        <strong>Contents</strong>
        <button onClick={onClose} style={PANEL_STYLES.iconButtonSmall}>
          {'\u2715'}
        </button>
      </div>
      <div style={isSidebar ? styles.tocListSidebar : styles.tocListDropdown}>
        {tocItems.map((item, i) => {
          if (isEpubItem(item)) {
            return (
              <button
                key={i}
                onClick={() => onNavigate(item.href)}
                style={{
                  ...styles.tocItem,
                  paddingLeft: `${16 + item.level * 16}px`,
                  color: themeColors.text,
                  borderBottomColor: panelBorder,
                }}
              >
                {item.label}
              </button>
            );
          } else {
            return (
              <button
                key={i}
                onClick={() => onNavigate(item.page)}
                style={styles.tocItemPdf}
              >
                <span>{item.title}</span>
                <span style={{ fontSize: '11px', color: '#999' }}>p. {item.page}</span>
              </button>
            );
          }
        })}
        {tocItems.length === 0 && (
          <div style={{ padding: '20px 16px', opacity: 0.4, fontSize: '13px' }}>
            No table of contents available.
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  tocPanelSidebar: {
    width: '280px',
    borderRight: '1px solid #e8e8e8',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#fafafa',
    zIndex: 10,
    flexShrink: 0,
  },
  tocPanelDropdown: {
    ...PANEL_STYLES.dropdown,
    position: 'absolute',
    top: '50px',
    left: '12px',
    width: '280px',
    maxHeight: '450px',
  },
  tocListSidebar: {
    flex: 1,
    overflow: 'auto',
  },
  tocListDropdown: {
    overflow: 'auto',
    maxHeight: '400px',
  },
  tocItem: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    background: 'none',
    border: 'none',
    borderBottom: '1px solid #f0f0f0',
    padding: '10px 16px',
    fontSize: '13px',
    color: '#333',
    cursor: 'pointer',
    lineHeight: '1.4',
  },
  tocItemPdf: {
    display: 'flex',
    justifyContent: 'space-between',
    width: '100%',
    background: 'none',
    border: 'none',
    borderBottom: '1px solid #f0f0f0',
    padding: '10px 16px',
    fontSize: '13px',
    color: '#333',
    cursor: 'pointer',
    textAlign: 'left',
    lineHeight: '1.4',
  },
};
