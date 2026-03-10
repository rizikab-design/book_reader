/**
 * SearchPanel — Search overlay dropdown
 *
 * Used by both ePub and PDF readers.
 */

import React from 'react';
import type { SearchResult } from '@/hooks/useReaderSearch';

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
      <div style={styles.dropdownHeader}>
        <strong>Search</strong>
        <button onClick={onClose} style={styles.iconButtonSmall}>
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
    position: 'absolute',
    top: '44px',
    right: '100px',
    width: '320px',
    maxHeight: '450px',
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
  iconButtonSmall: {
    background: 'none',
    border: 'none',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '4px 8px',
    color: '#999',
  },
};
