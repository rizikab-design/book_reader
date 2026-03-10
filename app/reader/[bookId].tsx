/**
 * Reader Screen — Apple Books-style layout (ePub)
 *
 * State management delegated to shared hooks in @/hooks/*.
 * ePub-specific logic (iframe, epub.js, word spans) stays here.
 */

import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Pressable, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { READER_STYLES as webStyles } from '@/lib/styles';
import { getBookUrl, fetchBooks, BookEntry } from '@/lib/api';
import PdfReader from '@/components/PdfReader';
import type { EpubContents, EpubLocation, EpubNavItem, EpubSpineItem } from '@/types/epub';

import { HighlightColor, HIGHLIGHT_COLORS, ThemeName, ThemeConfig, themes } from '@/hooks/reader-types';
import { useToast } from '@/hooks/useToast';
import { useAutoHideBars } from '@/hooks/useAutoHideBars';
import { useReaderTheme } from '@/hooks/useReaderTheme';
import { useReaderSearch } from '@/hooks/useReaderSearch';
import { useReaderTts } from '@/hooks/useReaderTts';
import { useReaderHighlights } from '@/hooks/useReaderHighlights';
import { useReaderBookmarks } from '@/hooks/useReaderBookmarks';
import { saveProgress, loadProgress } from '@/hooks/useSupabaseSync';

import TocPanel from '@/components/reader/TocPanel';
import BookmarksPanel from '@/components/reader/BookmarksPanel';
import HighlightsPanel from '@/components/reader/HighlightsPanel';
import SearchPanel from '@/components/reader/SearchPanel';
import ThemesPanel from '@/components/reader/ThemesPanel';
import ReaderToolbar from '@/components/reader/ReaderToolbar';
import TtsBar from '@/components/reader/TtsBar';
import PageBar from '@/components/reader/PageBar';
import { injectWordSpans } from '@/lib/epub/word-injector';
import { applyThemeToIframe } from '@/lib/epub/theme-injector';
import {
  cleanupIframeListeners,
  setupWordClickListener,
  setupSelectionListener,
  setupDblClickListener,
} from '@/lib/epub/iframe-events';
import { applyHighlightToRange, reapplyHighlights } from '@/lib/epub/highlight-renderer';

export default function ReaderScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();

  const viewerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- epub.js types are incompatible with strict interfaces
  const renditionRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bookRef = useRef<any>(null);

  // ── Core state ──────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locationInfo, setLocationInfo] = useState('');
  const [bookTitle, setBookTitle] = useState('');
  const [bookMeta, setBookMeta] = useState<BookEntry | null>(null);

  // Page tracking
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pagesLeftInChapter, setPagesLeftInChapter] = useState(0);
  const [pageInput, setPageInput] = useState('');
  const [isEditingPage, setIsEditingPage] = useState(false);
  const pageInputRef = useRef<HTMLInputElement | null>(null);

  // Word injection for TTS (ePub-specific)
  const iframeWordsRef = useRef<string>('');
  const iframeWordsArrayRef = useRef<string[]>([]);
  const [wordsReady, setWordsReady] = useState(false);
  const prevHighlightRef = useRef<Element | null>(null);

  // Track iframe listeners for cleanup on page turn
  const iframeListenersRef = useRef<{ doc: Document; type: string; handler: EventListener }[]>([]);

  // Table of contents
  const [tocItems, setTocItems] = useState<{ label: string; href: string; level: number }[]>([]);
  const [showToc, setShowToc] = useState(false);

  // ePub CFI for bookmarks
  const currentCfiRef = useRef<string>('');
  const savePositionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Overall book progress (0-1)
  const [bookProgress, setBookProgress] = useState(0);

  // Panels
  const [showThemes, setShowThemes] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Popup drag — ePub-only (iframe overlay needed)
  const [isDraggingPopup, setIsDraggingPopup] = useState(false);

  // ── Shared hooks ────────────────────────────────────────────────────
  const { toast, showToast } = useToast();
  const { barsVisible } = useAutoHideBars();
  const { activeTheme, setActiveTheme, fontSize, setFontSize, themeColors, panelTheme, panelBorder, changeFontSize: changeFontSizeBase } = useReaderTheme();
  const { showSearch, setShowSearch, searchQuery, setSearchQuery, searchResults, setSearchResults, isSearching, setIsSearching, searchInputRef, searchCancelRef, openSearch, closeSearch } = useReaderSearch();

  const tts = useReaderTts({
    bookId: bookId!,
    getWords: () => iframeWordsArrayRef.current,
    onTtsEnd: () => {
      if (prevHighlightRef.current) {
        prevHighlightRef.current.classList.remove('tts-active');
        prevHighlightRef.current = null;
      }
    },
  });

  const hlState = useReaderHighlights({
    bookId: bookId!,
    bookTitle,
    showToast,
  });

  const bmState = useReaderBookmarks({
    bookId: bookId!,
    currentPage,
    showToast,
    getCurrentCfi: () => currentCfiRef.current,
  });

  // ── Theme refs for iframe content hook (stale closure prevention) ──
  const activeThemeRef = useRef(activeTheme);
  const fontSizeRef = useRef(fontSize);
  useEffect(() => { activeThemeRef.current = activeTheme; }, [activeTheme]);
  useEffect(() => { fontSizeRef.current = fontSize; }, [fontSize]);

  // ── TTS word highlight effect ─────────────────────────────────────
  useEffect(() => {
    if (tts.currentWordIndex < 0) return;
    const iframeDoc = getIframeDocument();
    if (!iframeDoc) return;
    if (prevHighlightRef.current) prevHighlightRef.current.classList.remove('tts-active');
    const span = iframeDoc.querySelector(`[data-tts-idx="${tts.currentWordIndex}"]`);
    if (span) {
      span.classList.add('tts-active');
      prevHighlightRef.current = span;
      const rect = span.getBoundingClientRect();
      const containerWidth = iframeDoc.documentElement.clientWidth;
      if (rect.left > containerWidth || rect.right < 0) {
        if (renditionRef.current) renditionRef.current.next();
      }
    }
  }, [tts.currentWordIndex]);

  // ── Close popup on outside click ──────────────────────────────────
  useEffect(() => {
    if (!hlState.selectionPopup) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.closest('[data-popup]')) return;
      hlState.setSelectionPopup(null);
      hlState.setShowDict(false);
    }
    const timer = setTimeout(() => window.addEventListener('click', handleClick), 100);
    return () => { clearTimeout(timer); window.removeEventListener('click', handleClick); };
  }, [hlState.selectionPopup]);

  // ── Load book on mount ────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!bookId) {
      setError('No book ID provided');
      setIsLoading(false);
      return;
    }
    loadBook();
    return () => {
      cleanupIframeListeners(iframeListenersRef);
      if (renditionRef.current) {
        try { renditionRef.current.destroy(); } catch (e) { console.warn('Failed to destroy rendition:', e); }
      }
    };
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch((v) => { if (!v) setTimeout(() => searchInputRef.current?.focus(), 50); return !v; });
      } else if (e.key === ' ') {
        e.preventDefault();
        tts.handlePlayPauseRef.current();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextPage();
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') prevPage();
      else if (e.key === '?') setShowShortcuts((v) => !v);
      else if (e.key === 'Escape') { hlState.setSelectionPopup(null); setShowSearch(false); setShowShortcuts(false); hlState.setShowDict(false); }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── ePub-specific helpers ─────────────────────────────────────────

  function getIframeDocument(): Document | null {
    const rendition = renditionRef.current;
    if (!rendition) return null;
    try {
      const contents = rendition.getContents();
      if (contents && contents.length > 0) return contents[0].document;
    } catch (e) {}
    return null;
  }

  // Iframe event deps — passed to extracted iframe-events module
  const iframeEventDeps = {
    tts: {
      resumeWordIndexRef: tts.resumeWordIndexRef,
      setCurrentWordIndex: tts.setCurrentWordIndex,
      startTTSFromWordRef: tts.startTTSFromWordRef,
      ttsSpeedRef: tts.ttsSpeedRef,
    },
    hlState: {
      setSelectionPopup: hlState.setSelectionPopup,
      setPopupPos: hlState.setPopupPos,
      setNoteText: hlState.setNoteText,
      setSelectedColor: hlState.setSelectedColor,
      handleDefine: hlState.handleDefine,
    },
    viewerRef,
  };

  function saveHighlight() {
    if (!hlState.selectionPopup) return;
    hlState.addHighlight({
      selectedText: hlState.selectionPopup.selectedText,
      note: hlState.noteText,
      color: hlState.selectedColor,
      pageInfo: locationInfo,
      cfiRange: currentCfiRef.current,
      createdAt: new Date().toLocaleTimeString(),
    });
    if (hlState.selectionPopup.range) {
      applyHighlightToRange(getIframeDocument(), hlState.selectionPopup.range, hlState.selectedColor);
    }
    const iframeDoc = getIframeDocument();
    if (iframeDoc) iframeDoc.getSelection()?.removeAllRanges();
    hlState.setSelectionPopup(null);
    hlState.setNoteText('');
  }

  function setTheme(themeName: ThemeName) {
    setActiveTheme(themeName);
    activeThemeRef.current = themeName;
    applyThemeToIframe(getIframeDocument(), themeName, fontSize);
  }

  function changeFontSize(delta: number) {
    const newSize = Math.max(50, Math.min(200, fontSize + delta));
    setFontSize(newSize);
    fontSizeRef.current = newSize;
    applyThemeToIframe(getIframeDocument(), activeTheme, newSize);
  }

  function navigateToBookmark(cfi: string) {
    if (renditionRef.current && cfi) {
      renditionRef.current.display(cfi);
      bmState.setShowBookmarks(false);
    }
  }

  function navigateToChapter(href: string) {
    if (renditionRef.current) {
      renditionRef.current.display(href);
      setShowToc(false);
    }
  }

  // Search within book (ePub-specific spine search)
  async function handleSearch(query: string) {
    if (!bookRef.current || !query.trim()) {
      setSearchResults([]);
      return;
    }
    searchCancelRef.current = false;
    setIsSearching(true);
    try {
      const book = bookRef.current;
      await book.ready;
      const results: { cfi?: string; excerpt: string }[] = [];
      const spineItems: EpubSpineItem[] = [];
      book.spine.each((item: EpubSpineItem) => spineItems.push(item));

      for (const item of spineItems) {
        if (searchCancelRef.current) break;
        await item.load(book.load.bind(book));
        const found = await item.find(query.trim());
        for (const r of found) {
          results.push({ cfi: r.cfi, excerpt: r.excerpt });
        }
        item.unload();
        if (results.length >= 50) break;
      }
      if (!searchCancelRef.current) {
        setSearchResults(results);
      }
    } catch (e) {
      console.warn('Search failed:', e);
      if (!searchCancelRef.current) setSearchResults([]);
    }
    setIsSearching(false);
  }

  function nextPage() {
    if (renditionRef.current) renditionRef.current.next();
  }

  function prevPage() {
    if (renditionRef.current) renditionRef.current.prev();
  }

  function goToPage(page: number) {
    const rendition = renditionRef.current;
    const book = bookRef.current;
    if (!rendition || !book) return;
    const clamped = Math.max(1, Math.min(page, totalPages));
    const percentage = (clamped - 1) / totalPages;
    const spine = book.spine;
    if (spine && spine.items && spine.items.length > 0) {
      rendition.display(percentage);
    }
  }

  function handlePageInputSubmit() {
    const page = parseInt(pageInput, 10);
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      goToPage(page);
    }
    setIsEditingPage(false);
    setPageInput('');
  }

  // ── Load ePub book ────────────────────────────────────────────────
  async function loadBook() {
    if (!bookId) {
      setError('No book ID provided');
      setIsLoading(false);
      return;
    }
    try {
      const allBooks = await fetchBooks();
      const meta = allBooks.find((b) => b.id === bookId);
      if (!meta) {
        setError('Book not found');
        setIsLoading(false);
        return;
      }
      setBookTitle(meta.title);
      setBookMeta(meta);

      // PDF books use a separate reader component
      if (meta.format === 'pdf') {
        setIsLoading(false);
        return;
      }

      const bookUrl = getBookUrl(meta.filename);
      const response = await fetch(bookUrl);
      const arrayBuffer = await response.arrayBuffer();

      const ePub = (await import('epubjs')).default;
      const book = ePub(arrayBuffer as any);
      bookRef.current = book;

      if (!viewerRef.current) {
        setError('Reader container not found');
        return;
      }

      const rendition = book.renderTo(viewerRef.current, {
        width: '100%',
        height: '100%',
        flow: 'paginated',
        spread: 'none',
      });

      renditionRef.current = rendition;

      rendition.hooks.content.register((contents: EpubContents) => {
        try {
          const doc = contents.document;
          if (doc) {
            cleanupIframeListeners(iframeListenersRef);

            const words = injectWordSpans(doc);
            iframeWordsArrayRef.current = words;
            iframeWordsRef.current = words.join(' ');
            setWordsReady(words.length > 0);
            tts.resumeWordIndexRef.current = -1;
            prevHighlightRef.current = null;

            // Apply current theme to new page content
            applyThemeToIframe(doc, activeThemeRef.current, fontSizeRef.current);

            // Listen for text selection and word clicks in the iframe
            setupSelectionListener(iframeListenersRef, doc, iframeEventDeps);
            setupWordClickListener(iframeListenersRef, doc, iframeEventDeps);
            setupDblClickListener(iframeListenersRef, doc, iframeEventDeps);

            // Re-apply saved highlights to this page's word spans
            reapplyHighlights(doc, hlState.highlightsRef.current, words);

            // Auto-continue TTS on new page if it was playing
            if (tts.isPlayingRef.current) {
              setTimeout(() => {
                tts.startTTSFromWordRef.current(0, tts.ttsSpeedRef.current);
              }, 100);
            }
          }
        } catch (e) {
          console.warn('Failed to inject word spans:', e);
        }
      });

      // Restore saved reading position, or start from beginning
      const synced = await loadProgress(bookId).catch(() => null);
      const savedPosition = synced?.cfi || localStorage.getItem(`reader-${bookId}-position`);
      await rendition.display(savedPosition || undefined);

      // Extract table of contents
      const navigation = await book.loaded.navigation;
      if (navigation?.toc) {
        const items: { label: string; href: string; level: number }[] = [];
        function flattenToc(tocList: EpubNavItem[], level: number) {
          for (const item of tocList) {
            items.push({
              label: item.label?.trim() || 'Untitled',
              href: item.href,
              level,
            });
            if (item.subitems?.length) flattenToc(item.subitems, level + 1);
          }
        }
        flattenToc(navigation.toc, 0);
        setTocItems(items);
      }

      // Auto-generate TOC if none found by scanning spine for headings
      if (!navigation?.toc?.length) {
        const autoToc: { label: string; href: string; level: number }[] = [];
        const spineItems: EpubSpineItem[] = [];
        book.spine.each((item: EpubSpineItem) => spineItems.push(item));
        for (const item of spineItems) {
          try {
            await item.load(book.load.bind(book));
            const doc = item.document || (typeof DOMParser !== 'undefined' && new DOMParser().parseFromString(item.contents || '', 'text/html'));
            if (doc) {
              const headings = doc.querySelectorAll('h1, h2, h3, h4');
              headings.forEach((h: Element) => {
                const text = h.textContent?.trim();
                if (text && text.length > 1) {
                  const tag = h.tagName.toLowerCase();
                  const level = tag === 'h1' ? 0 : tag === 'h2' ? 1 : tag === 'h3' ? 2 : 3;
                  autoToc.push({ label: text, href: item.href, level });
                }
              });
            }
            item.unload();
          } catch (e) { console.warn('Failed to load spine item for TOC scan:', e); }
        }
        if (autoToc.length > 0) setTocItems(autoToc);
      }

      rendition.on('relocated', (location: EpubLocation) => {
        hlState.setSelectionPopup(null);
        // State updates fire immediately
        const current = location.start?.displayed;
        if (current) {
          setCurrentPage(current.page);
          setTotalPages(current.total);
          setLocationInfo(`${current.page} / ${current.total}`);
          setPagesLeftInChapter(current.total - current.page);
        }
        if (location.start?.cfi) {
          currentCfiRef.current = location.start.cfi;
        }
        if (location.start?.percentage != null) {
          setBookProgress(location.start.percentage);
        }
        // Debounce progress writes (500ms)
        if (savePositionTimerRef.current) clearTimeout(savePositionTimerRef.current);
        savePositionTimerRef.current = setTimeout(() => {
          localStorage.setItem('reader-lastReadId', bookId!);
          localStorage.setItem('reader-lastReadTime', String(Date.now()));
          const cfi = location.start?.cfi || null;
          const pct = location.start?.percentage ?? 0;
          const page = location.start?.displayed?.page ?? null;
          saveProgress(bookId!, pct, cfi, page);
        }, 500);
      });

      // Generate locations for overall book progress percentage
      book.locations.generate(1024);

      setIsLoading(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load book');
      setIsLoading(false);
    }
  }

  // --- Web rendering ---
  // PDF books use a dedicated reader component
  if (Platform.OS === 'web' && bookMeta?.format === 'pdf') {
    return (
      <PdfReader
        bookUrl={getBookUrl(bookMeta.filename)}
        bookId={bookId!}
        bookTitle={bookTitle}
      />
    );
  }

  if (Platform.OS === 'web') {
    return (
      <div style={{ ...webStyles.container, backgroundColor: themes[activeTheme].bg }}>
        {/* Overall book progress bar */}
        <div style={webStyles.progressBarTrack}>
          <div style={{ ...webStyles.progressBarFill, width: `${Math.round(bookProgress * 100)}%` }} />
        </div>

        <style>{`
          @keyframes fadeInOut { 0% { opacity: 0; transform: translateX(-50%) translateY(8px); } 10% { opacity: 1; transform: translateX(-50%) translateY(0); } 80% { opacity: 1; } 100% { opacity: 0; } }
          @keyframes spin { to { transform: rotate(360deg); } }
          .reader-topbar button:hover { background: rgba(0,0,0,0.06) !important; }
          .reader-pagechevron:hover { opacity: 0.7 !important; }
          .reader-ttsbar button:hover { opacity: 0.8; }
          button:disabled { cursor: not-allowed !important; }
          .reader-highlight-color:hover { transform: scale(1.15); }
          *:focus-visible { outline: 2px solid #2f95dc; outline-offset: 2px; }
          @media (max-width: 640px) {
            .reader-topbar { padding: 4px 8px !important; }
            .reader-topbar .reader-book-title { display: none; }
            .reader-ttsbar { flex-wrap: wrap !important; gap: 6px !important; }
            .reader-ttsbar select { max-width: 140px !important; }
            .reader-panel-dropdown { position: fixed !important; top: 50px !important; left: 0 !important; right: 0 !important; width: 100% !important; max-width: 100% !important; border-radius: 0 !important; }
          }
        `}</style>

        {/* Top bar — auto-hides */}
        <ReaderToolbar
          bookTitle={bookTitle || 'Loading...'}
          activeTheme={activeTheme}
          themeColors={themes[activeTheme]}
          barsVisible={barsVisible}
          showToc={showToc}
          showHighlights={hlState.showHighlights}
          showSearch={showSearch}
          showThemes={showThemes}
          showBookmarks={bmState.showBookmarks}
          highlightCount={hlState.highlights.length}
          bookmarkCount={bmState.bookmarks.length}
          isCurrentPageBookmarked={bmState.bookmarks.some((b) => b.page === currentPage)}
          onBack={() => router.back()}
          onToggleToc={() => { setShowToc(!showToc); if (!showToc) { hlState.setShowHighlights(false); bmState.setShowBookmarks(false); } }}
          onToggleHighlights={() => { hlState.setShowHighlights(!hlState.showHighlights); if (!hlState.showHighlights) { setShowToc(false); bmState.setShowBookmarks(false); } }}
          onToggleSearch={() => { setShowSearch(!showSearch); if (!showSearch) setTimeout(() => searchInputRef.current?.focus(), 50); }}
          onToggleThemes={() => { setShowThemes(!showThemes); if (!showThemes) { setShowToc(false); hlState.setShowHighlights(false); bmState.setShowBookmarks(false); } }}
          onToggleBookmarks={() => { bmState.setShowBookmarks(!bmState.showBookmarks); if (!bmState.showBookmarks) { setShowToc(false); hlState.setShowHighlights(false); } }}
        />

        {/* Themes & Settings dropdown */}
        {showThemes && (
          <ThemesPanel
            activeTheme={activeTheme}
            fontSize={fontSize}
            themes={themes}
            onThemeChange={setTheme}
            onFontSizeChange={changeFontSize}
            panelTheme={panelTheme}
            panelBorder={panelBorder}
            onClose={() => setShowThemes(false)}
          />
        )}

        {/* Search panel */}
        <SearchPanel
          showSearch={showSearch}
          searchQuery={searchQuery}
          searchResults={searchResults}
          isSearching={isSearching}
          onQueryChange={setSearchQuery}
          onSearch={handleSearch}
          onNavigate={(r) => { if (renditionRef.current && r.cfi) renditionRef.current.display(r.cfi); }}
          onClose={() => { searchCancelRef.current = true; setShowSearch(false); setSearchQuery(''); setSearchResults([]); }}
          themeColors={themeColors}
          panelTheme={panelTheme}
          panelBorder={panelBorder}
          searchInputRef={searchInputRef}
        />

        {/* Keyboard shortcuts overlay */}
        {showShortcuts && (
          <div
            style={webStyles.shortcutsOverlay}
            onClick={() => setShowShortcuts(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
          >
            <div style={{ ...webStyles.shortcutsPanel, ...panelTheme }} onClick={(e) => e.stopPropagation()}>
              <div style={webStyles.tocHeader}>
                <strong>Keyboard Shortcuts</strong>
                <button onClick={() => setShowShortcuts(false)} style={webStyles.iconButtonSmall}>{'\u2715'}</button>
              </div>
              <div style={{ padding: '12px 16px' }}>
                {[
                  ['Space', 'Play / Pause TTS'],
                  ['\u2190 \u2192', 'Previous / Next page'],
                  ['\u2191 \u2193', 'Previous / Next page'],
                  ['Cmd+F', 'Search in book'],
                  ['?', 'Toggle this help'],
                  ['Esc', 'Close popups'],
                ].map(([key, desc]) => (
                  <div key={key} style={webStyles.shortcutRow}>
                    <kbd style={webStyles.shortcutKey}>{key}</kbd>
                    <span style={{ fontSize: '13px' }}>{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Bookmarks dropdown */}
        {bmState.showBookmarks && (
          <BookmarksPanel
            bmState={bmState}
            currentPage={currentPage}
            themeColors={themeColors}
            panelTheme={panelTheme}
            panelBorder={panelBorder}
            onNavigate={(target) => navigateToBookmark(String(target))}
            variant="epub"
          />
        )}

        {/* Highlights & Notes dropdown */}
        {hlState.showHighlights && (
          <HighlightsPanel
            hlState={hlState}
            themeColors={themeColors}
            panelTheme={panelTheme}
            panelBorder={panelBorder}
            onNavigate={(h) => {
              if (h.cfiRange && renditionRef.current) {
                renditionRef.current.display(h.cfiRange);
              }
            }}
            HIGHLIGHT_COLORS={HIGHLIGHT_COLORS}
            variant="epub"
          />
        )}

        {/* Main content */}
        <div style={webStyles.mainContent}>
          {/* Table of Contents panel */}
          {showToc && (
            <TocPanel
              tocItems={tocItems}
              themeColors={themeColors}
              panelTheme={panelTheme}
              panelBorder={panelBorder}
              onNavigate={(target) => navigateToChapter(String(target))}
              onClose={() => setShowToc(false)}
              variant="sidebar"
            />
          )}

          {/* Page turn arrow — left */}
          <button className="reader-pagechevron" onClick={prevPage} style={{ ...webStyles.pageChevron, ...webStyles.pageChevronLeft, color: themes[activeTheme].text }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          {/* epub.js viewer */}
          <div style={webStyles.readerPanel}>
            {isLoading && !error && (
              <div style={webStyles.overlay}>
                <div style={{ width: '28px', height: '28px', border: '3px solid #e0e0e0', borderTopColor: '#2f95dc', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '12px' }} />
                <p style={{ color: '#999', fontSize: '14px' }}>Loading book...</p>
              </div>
            )}
            {error && (
              <div style={webStyles.overlay}>
                <p style={{ color: '#e55', fontSize: '14px', marginBottom: '12px' }}>Error: {error}</p>
                <button onClick={() => router.back()} style={{ padding: '8px 20px', backgroundColor: '#2f95dc', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>Go Back</button>
              </div>
            )}
            <div ref={viewerRef} style={webStyles.reader} />
          </div>

          {/* Page turn arrow — right */}
          <button className="reader-pagechevron" onClick={nextPage} style={{ ...webStyles.pageChevron, ...webStyles.pageChevronRight, color: themes[activeTheme].text }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>

          {/* Selection popup — appears when user highlights text */}
          {/* Drag overlay — covers iframe so mouse events aren't swallowed */}
          {isDraggingPopup && (
            <div style={webStyles.dragOverlay} />
          )}

          {hlState.selectionPopup && (
            <div
              data-popup
              style={{
                ...webStyles.selectionPopup,
                left: hlState.popupPos ? hlState.popupPos.x : hlState.selectionPopup.x,
                top: hlState.popupPos ? hlState.popupPos.y : hlState.selectionPopup.y,
                ...panelTheme,
              }}
            >
              {/* Drag handle */}
              <div
                style={webStyles.popupDragHandle}
                onMouseDown={(e) => {
                  e.preventDefault();
                  const currentX = hlState.popupPos ? hlState.popupPos.x : hlState.selectionPopup!.x;
                  const currentY = hlState.popupPos ? hlState.popupPos.y : hlState.selectionPopup!.y;
                  hlState.popupDragRef.current = { startX: e.clientX, startY: e.clientY, origX: currentX, origY: currentY };
                  setIsDraggingPopup(true);

                  const onMove = (ev: MouseEvent) => {
                    if (!hlState.popupDragRef.current) return;
                    const dx = ev.clientX - hlState.popupDragRef.current.startX;
                    const dy = ev.clientY - hlState.popupDragRef.current.startY;
                    const newX = Math.max(8, Math.min(window.innerWidth - 288, hlState.popupDragRef.current.origX + dx));
                    const newY = Math.max(8, Math.min(window.innerHeight - 280, hlState.popupDragRef.current.origY + dy));
                    hlState.setPopupPos({ x: newX, y: newY });
                  };
                  const onUp = () => {
                    hlState.popupDragRef.current = null;
                    setIsDraggingPopup(false);
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                  };
                  window.addEventListener('mousemove', onMove);
                  window.addEventListener('mouseup', onUp);
                }}
              >
                <div style={webStyles.dragDots} />
              </div>
              {/* Color picker */}
              <div style={webStyles.colorPicker}>
                {(Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).map((color) => (
                  <button
                    key={color}
                    onClick={() => hlState.setSelectedColor(color)}
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: HIGHLIGHT_COLORS[color],
                      border: hlState.selectedColor === color ? '2px solid #333' : '2px solid transparent',
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>

              {/* Define & Thesaurus toggle for short selections */}
              {hlState.selectionPopup.selectedText.split(/\s+/).length <= 3 && (
                <button
                  onClick={() => {
                    if (hlState.showDict) { hlState.setShowDict(false); }
                    else { hlState.handleDefine(hlState.selectionPopup!.selectedText.split(/\s+/)[0]); }
                  }}
                  style={{
                    ...webStyles.popupButtonCancel,
                    width: '100%', marginBottom: '8px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    backgroundColor: hlState.showDict ? '#2f95dc' : undefined,
                    color: hlState.showDict ? '#fff' : undefined,
                    borderColor: hlState.showDict ? '#2f95dc' : undefined,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                  Define &amp; Thesaurus
                </button>
              )}

              {/* Selected text preview */}
              <div style={webStyles.popupPreview}>
                "{hlState.selectionPopup.selectedText.length > 60
                  ? hlState.selectionPopup.selectedText.slice(0, 60) + '...'
                  : hlState.selectionPopup.selectedText}"
              </div>

              {/* Note input */}
              <textarea
                value={hlState.noteText}
                onChange={(e) => hlState.setNoteText(e.target.value)}
                placeholder="Add a note (optional)..."
                style={webStyles.noteInput}
                rows={2}
              />

              {/* Dictionary / Thesaurus inline section */}
              {hlState.showDict && (
                <div style={{ borderTop: '1px solid #e0e0e0', marginTop: '8px', paddingTop: '8px', maxHeight: '250px', overflow: 'auto' }}>
                  {hlState.dictLoading && <div style={{ padding: '12px', textAlign: 'center', color: '#999', fontSize: '13px' }}>Looking up...</div>}
                  {hlState.dictError && <div style={{ padding: '8px', color: '#c00', fontSize: '12px' }}>{hlState.dictError}</div>}
                  {hlState.dictResult && (
                    <>
                      <div style={{ marginBottom: '8px' }}>
                        <span style={{ fontSize: '16px', fontWeight: 700 }}>{hlState.dictResult.word}</span>
                        {hlState.dictResult.phonetic && <span style={{ marginLeft: '6px', color: '#888', fontSize: '12px' }}>{hlState.dictResult.phonetic}</span>}
                        {hlState.dictResult.audio && (
                          <button onClick={() => hlState.playDictAudio(hlState.dictResult!.audio!)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: '4px', fontSize: '14px' }} title="Listen">{'\uD83D\uDD0A'}</button>
                        )}
                      </div>
                      {hlState.dictResult.meanings.map((m, mi) => (
                        <div key={mi} style={{ marginBottom: '8px' }}>
                          <div style={{ fontStyle: 'italic', color: '#2f95dc', fontSize: '11px', fontWeight: 600, marginBottom: '2px' }}>{m.partOfSpeech}</div>
                          {m.definitions.map((d, di) => (
                            <div key={di} style={{ marginBottom: '4px', paddingLeft: '6px', fontSize: '12px' }}>
                              <div>{di + 1}. {d.definition}</div>
                              {d.example && <div style={{ color: '#888', fontStyle: 'italic', fontSize: '11px', marginTop: '1px' }}>"{d.example}"</div>}
                            </div>
                          ))}
                        </div>
                      ))}
                      {hlState.dictResult.synonyms.length > 0 && (
                        <div style={{ marginBottom: '6px', fontSize: '12px' }}>
                          <strong style={{ color: '#2f95dc' }}>Synonyms: </strong>
                          {hlState.dictResult.synonyms.map((syn, i) => (
                            <span key={i}>
                              <button onClick={() => hlState.handleDefine(syn)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2f95dc', fontSize: '12px', padding: 0, textDecoration: 'underline' }}>{syn}</button>
                              {i < hlState.dictResult!.synonyms.length - 1 ? ', ' : ''}
                            </span>
                          ))}
                        </div>
                      )}
                      {hlState.dictResult.antonyms.length > 0 && (
                        <div style={{ marginBottom: '4px', fontSize: '12px' }}>
                          <strong style={{ color: '#e57373' }}>Antonyms: </strong>
                          {hlState.dictResult.antonyms.map((ant, i) => (
                            <span key={i}>
                              <button onClick={() => hlState.handleDefine(ant)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e57373', fontSize: '12px', padding: 0, textDecoration: 'underline' }}>{ant}</button>
                              {i < hlState.dictResult!.antonyms.length - 1 ? ', ' : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Actions */}
              <div style={webStyles.popupActions}>
                <button
                  onClick={() => { hlState.setSelectionPopup(null); hlState.setShowDict(false); }}
                  style={webStyles.popupButtonCancel}
                >
                  Cancel
                </button>
                <button
                  onClick={saveHighlight}
                  style={webStyles.popupButtonSave}
                >
                  Highlight
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Toast notification */}
        {toast && (
          <div role="status" aria-live="polite" style={{ position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)', backgroundColor: 'rgba(0,0,0,0.75)', color: '#fff', padding: '8px 20px', borderRadius: '20px', fontSize: '13px', fontWeight: 500, zIndex: 200, pointerEvents: 'none', animation: 'fadeInOut 2s ease' }}>{toast}</div>
        )}

        {/* Page navigation bar — auto-hides */}
        <PageBar
          currentPage={currentPage}
          totalPages={totalPages}
          bookProgress={bookProgress}
          pagesLeftInChapter={pagesLeftInChapter}
          activeTheme={activeTheme}
          themeColors={themes[activeTheme]}
          barsVisible={barsVisible}
          onPrev={prevPage}
          onNext={nextPage}
          onGoToPage={goToPage}
        />

        {/* TTS Player */}
        {wordsReady && (
          <TtsBar tts={tts} activeTheme={activeTheme} themeColors={themes[activeTheme]} barsVisible={barsVisible} />
        )}
      </div>
    );
  }

  // --- Native iOS fallback ---
  return (
    <View style={styles.container}>
      <Text>Native ePub reader coming soon. Use the web/Tauri version for now.</Text>
      <Pressable onPress={() => router.back()}>
        <Text style={{ color: '#2f95dc', marginTop: 16 }}>{'\u2190'} Back</Text>
      </Pressable>
    </View>
  );
}

// webStyles imported from @/lib/styles as READER_STYLES

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
});
