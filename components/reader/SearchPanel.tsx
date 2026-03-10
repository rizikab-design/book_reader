/**
 * SearchPanel — Search overlay dropdown
 *
 * Used by both ePub and PDF readers.
 */

import React from 'react';
import type { SearchResult } from '@/hooks/useReaderSearch';
import { PANEL_STYLES } from '@/lib/styles';

interface SearchPanelProps {
  showSearch: boolean;
  searchQuery: string;
  searchResults: SearchResult[];
  isSearching: boolean;
  onQueryChange: (query: string) => void;
  onSearch: (query: string) => void;
  /** Called when user clicks a search result to navigate */
  onNavigate: (result: SearchResult) => void;
  onClose: () => void;
  themeColors: { bg: string; text: string };
  panelTheme: React.CSSProperties;
  panelBorder: string;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}

function highlightSearchMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} style={{ background: '#FFEB3B', padding: '0 1px', borderRadius: '2px' }}>{part}</mark>
      : part
  );
}

export default function SearchPanel({
  showSearch,
  searchQuery,
  searchResults,
  isSearching,
  onQueryChange,
  onSearch,
  onNavigate,
  onClose,
  panelTheme,
  searchInputRef,
}: SearchPanelProps) {
  if (!showSearch) return null;

  return (
    <div className="reader-panel-dropdown" style={{ ...styles.searchPanel, ...panelTheme }} data-popup>
      <div style={PANEL_STYLES.dropdownHeader}>
        <strong>Search</strong>
        <button onClick={onClose} style={PANEL_STYLES.iconButtonSmall}>
          {'\u2715'}
        </button>
      </div>
      <div style={{ padding: '8px 12px' }}>
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSearch(searchQuery);
            if (e.key === 'Escape') onClose();
          }}
          placeholder="Search in book..."
          style={styles.searchInput}
        />
      </div>
      {isSearching && (
        <div style={{ padding: '12px', fontSize: '13px', color: '#999', textAlign: 'center' }}>Searching...</div>
      )}
      {!isSearching && searchResults.length > 0 && (
        <div style={styles.resultsList}>
          {searchResults.map((r, i) => (
            <button
              key={i}
              onClick={() => onNavigate(r)}
              style={styles.resultItem}
            >
              <div style={{ fontSize: '12px' }}>
                {highlightSearchMatch(r.excerpt.replace(/<[^>]*>/g, ''), searchQuery)}
              </div>
              {r.page != null && (
                <div style={{ fontSize: '10px', color: '#999', marginTop: '2px' }}>Page {r.page}</div>
              )}
            </button>
          ))}
        </div>
      )}
      {!isSearching && searchQuery && searchResults.length === 0 && (
        <div style={{ padding: '12px', fontSize: '13px', color: '#999', textAlign: 'center' }}>No results found</div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  searchPanel: {
    ...PANEL_STYLES.dropdown,
    position: 'absolute',
    top: '44px',
    right: '100px',
    width: '320px',
    maxHeight: '450px',
  },
  searchInput: {
    width: '100%',
    padding: '8px 10px',
    fontSize: '13px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  resultsList: {
    overflow: 'auto',
    maxHeight: '350px',
  },
  resultItem: {
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
};
