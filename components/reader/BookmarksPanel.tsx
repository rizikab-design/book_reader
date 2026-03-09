/**
 * BookmarksPanel — Bookmarks dropdown panel
 *
 * Used by both ePub and PDF readers.
 */

import React from 'react';
import type { ReaderBookmark } from '@/hooks/reader-types';

export interface BookmarksPanelBmState {
  bookmarks: ReaderBookmark[];
  showBookmarks: boolean;
  setShowBookmarks: (v: boolean) => void;
  editingBookmarkId: number | null;
  setEditingBookmarkId: (id: number | null) => void;
  bookmarkTitleInput: string;
  setBookmarkTitleInput: (v: string) => void;
  toggleBookmark: () => void;
  saveBookmarkTitle: (id: number) => void;
  removeBookmark: (id: number) => void;
}

interface BookmarksPanelProps {
  bmState: BookmarksPanelBmState;
  currentPage: number;
  themeColors: { bg: string; text: string };
  panelTheme: React.CSSProperties;
  panelBorder: string;
  /** ePub passes cfi string; PDF passes page number */
  onNavigate: (target: string | number) => void;
  /** 'epub' uses cfi navigation; 'pdf' uses page navigation */
  variant?: 'epub' | 'pdf';
}

export default function BookmarksPanel({
  bmState,
  currentPage,
  themeColors,
  panelTheme,
  panelBorder,
  onNavigate,
  variant = 'epub',
}: BookmarksPanelProps) {
  const isCurrentPageBookmarked = bmState.bookmarks.some((b) => b.page === currentPage);

  return (
    <div style={{ ...styles.bookmarksDropdown, ...panelTheme }}>
      <div style={styles.dropdownHeader}>
        <strong>Bookmarks</strong>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button
            onClick={bmState.toggleBookmark}
            style={{
              ...styles.iconButtonSmall,
              color: isCurrentPageBookmarked ? '#2f95dc' : undefined,
            }}
            title={isCurrentPageBookmarked ? 'Remove bookmark' : 'Bookmark this page'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={isCurrentPageBookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
              <path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-4-6 4V4z" />
            </svg>
          </button>
          <button
            onClick={() => bmState.setShowBookmarks(false)}
            style={styles.iconButtonSmall}
          >
            {'\u2715'}
          </button>
        </div>
      </div>
      {bmState.bookmarks.length === 0 ? (
        <div style={styles.bookmarksEmpty}>
          <div style={{ fontWeight: 500, marginBottom: '4px' }}>No Bookmarks</div>
          <div style={{ fontSize: '12px', opacity: 0.6 }}>
            {variant === 'pdf'
              ? 'Click the bookmark icon above to add one.'
              : 'Click the bookmark icon above to bookmark the current page.'}
          </div>
        </div>
      ) : (
        <div style={styles.bookmarksList}>
          {bmState.bookmarks
            .sort((a, b) => a.page - b.page)
            .map((b) => (
              <div key={b.id} style={{ ...styles.bookmarkItem, borderBottomColor: panelBorder }}>
                {bmState.editingBookmarkId === b.id ? (
                  <div style={{ flex: 1, padding: '8px 12px' }}>
                    <input
                      type="text"
                      value={bmState.bookmarkTitleInput}
                      onChange={(e) => bmState.setBookmarkTitleInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') bmState.saveBookmarkTitle(b.id);
                        if (e.key === 'Escape') { bmState.setEditingBookmarkId(null); bmState.setBookmarkTitleInput(''); }
                      }}
                      onBlur={() => bmState.saveBookmarkTitle(b.id)}
                      placeholder="Bookmark title..."
                      autoFocus
                      style={styles.bookmarkTitleInput}
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      if (variant === 'epub') {
                        onNavigate(b.cfi || '');
                      } else {
                        onNavigate(b.page);
                      }
                    }}
                    style={{ ...styles.bookmarkLink, color: themeColors.text }}
                  >
                    <span>{b.label || 'Untitled'}</span>
                    <span style={styles.bookmarkPage}>p. {b.page}</span>
                  </button>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px', paddingRight: '4px' }}>
                  <button
                    onClick={() => { bmState.setEditingBookmarkId(b.id); bmState.setBookmarkTitleInput(b.label); }}
                    style={styles.iconButtonSmall}
                    title="Rename"
                  >
                    {variant === 'epub' ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={() => bmState.removeBookmark(b.id)}
                    style={styles.iconButtonSmall}
                    title="Remove bookmark"
                  >
                    {'\u2715'}
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bookmarksDropdown: {
    position: 'absolute',
    top: '44px',
    right: '12px',
    width: '260px',
    maxHeight: '400px',
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
  bookmarksEmpty: {
    padding: '30px 20px',
    textAlign: 'center',
    color: '#999',
    fontSize: '13px',
  },
  bookmarksList: {
    overflow: 'auto',
    maxHeight: '300px',
  },
  bookmarkItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid #f0f0f0',
    padding: '0 4px 0 0',
  },
  bookmarkLink: {
    flex: 1,
    background: 'none',
    border: 'none',
    textAlign: 'left',
    padding: '10px 16px',
    fontSize: '13px',
    color: '#333',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
  },
  bookmarkPage: {
    fontSize: '11px',
    color: '#999',
    flexShrink: 0,
  },
  bookmarkTitleInput: {
    width: '100%',
    padding: '4px 8px',
    fontSize: '13px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    outline: 'none',
    boxSizing: 'border-box' as const,
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
