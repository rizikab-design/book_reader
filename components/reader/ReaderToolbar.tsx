import React from 'react';

interface ReaderToolbarProps {
  bookTitle: string;
  activeTheme: string;
  themeColors: { bg: string; text: string };
  barsVisible: boolean;
  showToc: boolean;
  showHighlights: boolean;
  showSearch: boolean;
  showThemes: boolean;
  showBookmarks: boolean;
  highlightCount: number;
  bookmarkCount: number;
  isCurrentPageBookmarked: boolean;
  onBack: () => void;
  onToggleToc: () => void;
  onToggleHighlights: () => void;
  onToggleSearch: () => void;
  onToggleThemes: () => void;
  onToggleBookmarks: () => void;
}

const toolbarStyles: Record<string, React.CSSProperties> = {
  topBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid #e8e8e8', minHeight: '44px' },
  topBarLeft: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: '80px' },
  topBarRight: { display: 'flex', alignItems: 'center', gap: '4px', minWidth: '80px', justifyContent: 'flex-end' },
  bookTitle: { fontSize: '14px', fontWeight: 500, color: '#333', textAlign: 'center', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  iconButton: { background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', padding: '6px 10px', color: '#555', borderRadius: '4px' },
};

export default function ReaderToolbar({
  bookTitle,
  activeTheme,
  themeColors,
  barsVisible,
  showToc,
  showHighlights,
  showSearch,
  showThemes,
  showBookmarks,
  highlightCount,
  bookmarkCount,
  isCurrentPageBookmarked,
  onBack,
  onToggleToc,
  onToggleHighlights,
  onToggleSearch,
  onToggleThemes,
  onToggleBookmarks,
}: ReaderToolbarProps) {
  return (
    <div className="reader-topbar" style={{
      ...toolbarStyles.topBar,
      backgroundColor: themeColors.bg,
      borderBottomColor: activeTheme === 'quiet' ? '#555' : '#e8e8e8',
      opacity: barsVisible ? 1 : 0,
      transition: 'opacity 0.3s',
      pointerEvents: barsVisible ? 'auto' as const : 'none' as const,
    }}>
      <div style={toolbarStyles.topBarLeft}>
        <button onClick={onBack} className="reader-icon-btn" style={toolbarStyles.iconButton} title="Back" aria-label="Go back to library">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <button
          onClick={onToggleToc}
          style={{ ...toolbarStyles.iconButton, color: showToc ? '#2f95dc' : '#555' }}
          title="Table of Contents"
          aria-label="Table of contents"
          aria-expanded={showToc}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
          </svg>
        </button>
        <button
          onClick={onToggleHighlights}
          style={{ ...toolbarStyles.iconButton, color: showHighlights ? '#2f95dc' : '#555' }}
          title={`Highlights & Notes (${highlightCount})`}
          aria-label="Highlights and notes"
          aria-expanded={showHighlights}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="7" y1="8" x2="17" y2="8" />
            <line x1="7" y1="12" x2="17" y2="12" />
            <line x1="7" y1="16" x2="13" y2="16" />
          </svg>
        </button>
      </div>

      <span className="reader-book-title" style={{ ...toolbarStyles.bookTitle, color: themeColors.text }}>{bookTitle || 'Loading...'}</span>

      <div style={toolbarStyles.topBarRight}>
        <button
          onClick={onToggleSearch}
          style={{ ...toolbarStyles.iconButton, color: showSearch ? '#2f95dc' : '#555' }}
          title="Search (Cmd+F)"
          aria-label="Search in book"
          aria-expanded={showSearch}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
        <button
          onClick={onToggleThemes}
          style={{ ...toolbarStyles.iconButton, color: showThemes ? '#2f95dc' : '#555', fontSize: '16px', fontWeight: 600 }}
          title="Themes & Settings"
          aria-label="Themes and font settings"
          aria-expanded={showThemes}
        >
          Aa
        </button>
        <button
          onClick={onToggleBookmarks}
          style={{ ...toolbarStyles.iconButton, color: showBookmarks ? '#2f95dc' : (isCurrentPageBookmarked ? '#2f95dc' : '#555') }}
          title={`Bookmarks (${bookmarkCount})`}
          aria-label="Bookmarks"
          aria-expanded={showBookmarks}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill={isCurrentPageBookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
            <path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-4-6 4V4z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
