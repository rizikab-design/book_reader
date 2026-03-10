import { useState, useRef } from 'react';

interface PageBarProps {
  currentPage: number;
  totalPages: number;
  bookProgress: number;
  pagesLeftInChapter?: number;
  activeTheme: string;
  themeColors: { bg: string; text: string };
  barsVisible: boolean;
  onPrev: () => void;
  onNext: () => void;
  onGoToPage?: (page: number) => void;
}

const pageBarStyles: Record<string, React.CSSProperties> = {
  pageBar: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '4px 16px', borderTop: '1px solid #f0f0f0', position: 'relative' },
  pageArrow: { background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', padding: '2px 10px', color: '#999', lineHeight: 1 },
  pageDisplay: { background: 'none', border: 'none', fontSize: '12px', color: '#999', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px', minWidth: '60px', textAlign: 'center' },
  pageInput: { width: '50px', padding: '3px 6px', fontSize: '12px', textAlign: 'center', border: '1px solid #ccc', borderRadius: '4px', outline: 'none' },
  pagesLeftLabel: { position: 'absolute', right: '16px', fontSize: '11px', color: '#999' },
};

export default function PageBar({ currentPage, totalPages, bookProgress, pagesLeftInChapter, activeTheme, themeColors, barsVisible, onPrev, onNext, onGoToPage }: PageBarProps) {
  const [isEditingPage, setIsEditingPage] = useState(false);
  const [pageInput, setPageInput] = useState('');
  const pageInputRef = useRef<HTMLInputElement>(null);

  function handlePageInputSubmit() {
    const target = parseInt(pageInput, 10);
    if (!isNaN(target) && target >= 1 && target <= totalPages && onGoToPage) {
      onGoToPage(target);
    }
    setIsEditingPage(false);
    setPageInput('');
  }

  return (
    <div style={{
      ...pageBarStyles.pageBar,
      backgroundColor: themeColors.bg,
      borderTopColor: activeTheme === 'quiet' ? '#555' : '#f0f0f0',
      opacity: barsVisible ? 1 : 0,
      transition: 'opacity 0.3s',
      pointerEvents: barsVisible ? 'auto' as const : 'none' as const,
    }}>
      <button onClick={onPrev} style={pageBarStyles.pageArrow} title="Previous page">
        {'\u2039'}
      </button>

      {isEditingPage ? (
        <input
          ref={pageInputRef}
          type="text"
          value={pageInput}
          onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handlePageInputSubmit();
            if (e.key === 'Escape') { setIsEditingPage(false); setPageInput(''); }
          }}
          onBlur={handlePageInputSubmit}
          style={pageBarStyles.pageInput}
          placeholder={String(currentPage)}
          autoFocus
        />
      ) : (
        <button
          onClick={() => {
            setIsEditingPage(true);
            setPageInput('');
            setTimeout(() => pageInputRef.current?.focus(), 10);
          }}
          style={pageBarStyles.pageDisplay}
          title="Click to go to a specific page"
        >
          {currentPage} / {totalPages}
        </button>
      )}

      <button onClick={onNext} style={pageBarStyles.pageArrow} title="Next page">
        {'\u203A'}
      </button>

      {pagesLeftInChapter !== undefined && (
        <span style={pageBarStyles.pagesLeftLabel}>
          {pagesLeftInChapter === 0
            ? 'End of chapter'
            : `${pagesLeftInChapter} page${pagesLeftInChapter === 1 ? '' : 's'} left in chapter`}
          {' \u00B7 '}{Math.round(bookProgress * 100)}% of book
        </span>
      )}
      {pagesLeftInChapter === undefined && (
        <span style={pageBarStyles.pagesLeftLabel}>
          {Math.round(bookProgress * 100)}% of book
        </span>
      )}
    </div>
  );
}
