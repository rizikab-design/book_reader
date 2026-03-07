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
import { stopSpeaking } from '@/lib/tts-engine';
import { getBookUrl, fetchBooks, BookEntry } from '@/lib/api';
import PdfReader from '@/components/PdfReader';

import { HighlightColor, HIGHLIGHT_COLORS, ThemeName, themes } from '@/hooks/reader-types';
import { useToast } from '@/hooks/useToast';
import { useAutoHideBars } from '@/hooks/useAutoHideBars';
import { useReaderTheme } from '@/hooks/useReaderTheme';
import { useReaderSearch } from '@/hooks/useReaderSearch';
import { useReaderTts } from '@/hooks/useReaderTts';
import { useReaderHighlights } from '@/hooks/useReaderHighlights';
import { useReaderBookmarks } from '@/hooks/useReaderBookmarks';

export default function ReaderScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();

  const viewerRef = useRef<HTMLDivElement | null>(null);
  const renditionRef = useRef<any>(null);
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
  const iframeListenersRef = useRef<{ doc: Document; type: string; handler: any }[]>([]);

  // Table of contents
  const [tocItems, setTocItems] = useState<{ label: string; href: string; level: number }[]>([]);
  const [showToc, setShowToc] = useState(false);

  // ePub CFI for bookmarks
  const currentCfiRef = useRef<string>('');

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
    loadBook();
    return () => {
      cleanupIframeListeners();
      if (renditionRef.current) {
        try { renditionRef.current.destroy(); } catch {}
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

  function injectWordSpans(doc: Document): string[] {
    const body = doc.body;
    if (!body) return [];

    let styleEl = doc.getElementById('tts-styles');
    if (!styleEl) {
      styleEl = doc.createElement('style');
      styleEl.id = 'tts-styles';
      styleEl.textContent = `
        [data-tts-idx] { cursor: pointer; }
        [data-tts-idx]:hover { background-color: rgba(0,0,0,0.04); border-radius: 2px; }
        .tts-active {
          background-color: #FFEB3B !important;
          border-radius: 3px;
          transition: background-color 0.1s;
        }
        .user-highlight-yellow { background-color: rgba(255, 235, 59, 0.4) !important; }
        .user-highlight-blue { background-color: rgba(144, 202, 249, 0.4) !important; }
        .user-highlight-green { background-color: rgba(165, 214, 167, 0.4) !important; }
        .user-highlight-pink { background-color: rgba(244, 143, 177, 0.4) !important; }
      `;
      doc.head.appendChild(styleEl);
    }

    const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const textNodes: globalThis.Text[] = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode as globalThis.Text);
    }

    let wordIndex = 0;
    const allWords: string[] = [];

    for (const textNode of textNodes) {
      const text = textNode.textContent || '';
      if (!text.trim()) continue;

      const parent = textNode.parentNode as Element;
      if (!parent) continue;
      const tagName = parent.tagName?.toLowerCase();
      if (tagName === 'script' || tagName === 'style') continue;

      const parts = text.split(/(\s+)/);
      const fragment = doc.createDocumentFragment();
      for (const part of parts) {
        if (/^\s+$/.test(part) || part === '') {
          fragment.appendChild(doc.createTextNode(part));
        } else {
          const span = doc.createElement('span');
          span.setAttribute('data-tts-idx', String(wordIndex));
          span.textContent = part;
          fragment.appendChild(span);
          allWords.push(part);
          wordIndex++;
        }
      }
      parent.replaceChild(fragment, textNode);
    }

    return allWords;
  }

  function cleanupIframeListeners() {
    for (const entry of iframeListenersRef.current) {
      try { entry.doc.removeEventListener(entry.type, entry.handler); } catch {}
    }
    iframeListenersRef.current = [];
  }

  function addIframeListener(doc: Document, type: string, handler: any) {
    doc.addEventListener(type, handler);
    iframeListenersRef.current.push({ doc, type, handler });
  }

  function setupWordClickListener(doc: Document) {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const ttsIdx = target.getAttribute?.('data-tts-idx');
      if (ttsIdx === null || ttsIdx === undefined) return;

      const selection = doc.getSelection();
      if (selection && !selection.isCollapsed && selection.toString().trim().length > 1) {
        return;
      }

      const wordIndex = parseInt(ttsIdx, 10);
      if (isNaN(wordIndex)) return;

      stopSpeaking();
      tts.resumeWordIndexRef.current = wordIndex;
      tts.setCurrentWordIndex(wordIndex);
      tts.startTTSFromWordRef.current(wordIndex, tts.ttsSpeedRef.current);
    };
    addIframeListener(doc, 'click', handler);
  }

  function setupSelectionListener(doc: Document) {
    const handler = () => {
      setTimeout(() => {
        const selection = doc.getSelection();
        if (!selection || selection.isCollapsed || !selection.toString().trim()) {
          return;
        }

        const text = selection.toString().trim();
        if (text.length < 2) return;

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        const iframe = viewerRef.current?.querySelector('iframe');
        const iframeRect = iframe?.getBoundingClientRect() || { left: 0, top: 0 };

        const popupWidth = 280;
        const popupHeight = 220;
        const rawX = iframeRect.left + rect.left + rect.width / 2;
        const rawY = iframeRect.top + rect.bottom + 8;
        const clampedX = Math.max(popupWidth / 2 + 8, Math.min(window.innerWidth - popupWidth / 2 - 8, rawX));
        const clampedY = Math.max(8, Math.min(window.innerHeight - popupHeight - 8, rawY));

        hlState.setSelectionPopup({
          x: clampedX,
          y: clampedY,
          selectedText: text,
          range: range.cloneRange(),
        });
        hlState.setPopupPos(null);
        hlState.setNoteText('');
        hlState.setSelectedColor('yellow');
      }, 10);
    };
    addIframeListener(doc, 'mouseup', handler);
  }

  function setupDblClickListener(doc: Document) {
    const handler = (e: MouseEvent) => {
      const selection = doc.getSelection();
      if (!selection || selection.isCollapsed) return;
      const word = selection.toString().trim();
      if (!word || word.includes(' ') || word.length > 30) return;

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const iframe = viewerRef.current?.querySelector('iframe');
      const iframeRect = iframe?.getBoundingClientRect() || { left: 0, top: 0 };

      const popupWidth = 280;
      const rawX = iframeRect.left + rect.left + rect.width / 2;
      const rawY = iframeRect.top + rect.bottom + 8;
      const clampedX = Math.max(popupWidth / 2 + 8, Math.min(window.innerWidth - popupWidth / 2 - 8, rawX));
      const clampedY = Math.max(8, Math.min(window.innerHeight - 300, rawY));

      hlState.setSelectionPopup({ x: clampedX, y: clampedY, selectedText: word, range: range.cloneRange() });
      hlState.setPopupPos(null);
      hlState.setNoteText('');
      hlState.setSelectedColor('yellow');
      hlState.handleDefine(word);
      e.preventDefault();
      e.stopPropagation();
    };
    addIframeListener(doc, 'dblclick', handler);
  }

  function applyHighlightToRange(range: Range, color: HighlightColor) {
    const iframeDoc = getIframeDocument();
    if (!iframeDoc || !range) return;

    try {
      const span = iframeDoc.createElement('span');
      span.className = `user-highlight-${color}`;
      range.surroundContents(span);
    } catch (e) {
      const container = range.commonAncestorContainer;
      const parent = container.nodeType === 3 ? container.parentElement : container as Element;
      if (parent && iframeDoc) {
        const wordSpans = parent.querySelectorAll('[data-tts-idx]');
        wordSpans.forEach((span) => {
          try {
            const spanRange = iframeDoc.createRange();
            spanRange.selectNodeContents(span);
            const intersects =
              range.compareBoundaryPoints(Range.START_TO_END, spanRange) > 0 &&
              range.compareBoundaryPoints(Range.END_TO_START, spanRange) < 0;
            if (intersects) {
              (span as HTMLElement).classList.add(`user-highlight-${color}`);
            }
          } catch {}
        });
      }
    }
  }

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
      applyHighlightToRange(hlState.selectionPopup.range, hlState.selectedColor);
    }
    const iframeDoc = getIframeDocument();
    if (iframeDoc) iframeDoc.getSelection()?.removeAllRanges();
    hlState.setSelectionPopup(null);
    hlState.setNoteText('');
  }

  function applyThemeToIframe(themeName: ThemeName, size: number) {
    const iframeDoc = getIframeDocument();
    if (!iframeDoc) return;
    const theme = themes[themeName];
    let styleEl = iframeDoc.getElementById('reader-theme');
    if (!styleEl) {
      styleEl = iframeDoc.createElement('style');
      styleEl.id = 'reader-theme';
      iframeDoc.head.appendChild(styleEl);
    }
    styleEl.textContent = `
      body {
        background-color: ${theme.bg} !important;
        color: ${theme.text} !important;
        font-size: ${size}% !important;
        ${theme.fontWeight ? `font-weight: ${theme.fontWeight} !important;` : ''}
        ${theme.fontFamily ? `font-family: ${theme.fontFamily} !important;` : ''}
      }
      p, span, div, li, td, th, h1, h2, h3, h4, h5, h6, a, blockquote {
        color: ${theme.text} !important;
        ${theme.fontWeight ? `font-weight: ${theme.fontWeight} !important;` : ''}
        ${theme.fontFamily ? `font-family: ${theme.fontFamily} !important;` : ''}
      }
      img, svg, figure, table {
        border-radius: 4px;
      }
      figure, table, .figure, [class*="figure"] {
        background-color: ${theme.bg} !important;
      }
      td, th {
        background-color: ${theme.bg} !important;
        border-color: ${theme.text}33 !important;
      }
    `;
  }

  function setTheme(themeName: ThemeName) {
    setActiveTheme(themeName);
    activeThemeRef.current = themeName;
    applyThemeToIframe(themeName, fontSize);
  }

  function changeFontSize(delta: number) {
    const newSize = Math.max(50, Math.min(200, fontSize + delta));
    setFontSize(newSize);
    fontSizeRef.current = newSize;
    applyThemeToIframe(activeTheme, newSize);
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
      const spineItems: any[] = [];
      book.spine.each((item: any) => spineItems.push(item));

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

      rendition.hooks.content.register((contents: any) => {
        try {
          const doc = contents.document;
          if (doc) {
            cleanupIframeListeners();

            const words = injectWordSpans(doc);
            iframeWordsArrayRef.current = words;
            iframeWordsRef.current = words.join(' ');
            setWordsReady(words.length > 0);
            tts.resumeWordIndexRef.current = -1;
            prevHighlightRef.current = null;

            // Apply current theme to new page content
            const t = themes[activeThemeRef.current];
            const sz = fontSizeRef.current;
            let themeStyle = doc.getElementById('reader-theme');
            if (!themeStyle) {
              themeStyle = doc.createElement('style');
              themeStyle.id = 'reader-theme';
              doc.head.appendChild(themeStyle);
            }
            themeStyle.textContent = `
              body { background-color: ${t.bg} !important; color: ${t.text} !important; font-size: ${sz}% !important; ${t.fontWeight ? `font-weight: ${t.fontWeight} !important;` : ''} ${t.fontFamily ? `font-family: ${t.fontFamily} !important;` : ''} }
              p, span, div, li, td, th, h1, h2, h3, h4, h5, h6, a, blockquote { color: ${t.text} !important; ${t.fontWeight ? `font-weight: ${t.fontWeight} !important;` : ''} ${t.fontFamily ? `font-family: ${t.fontFamily} !important;` : ''} }
              img, svg, figure, table { border-radius: 4px; }
              figure, table, .figure, [class*="figure"] { background-color: ${t.bg} !important; }
              td, th { background-color: ${t.bg} !important; border-color: ${t.text}33 !important; }
            `;

            // Listen for text selection and word clicks in the iframe
            setupSelectionListener(doc);
            setupWordClickListener(doc);
            setupDblClickListener(doc);

            // Re-apply saved highlights to this page's word spans
            const currentHighlights = hlState.highlightsRef.current;
            if (currentHighlights.length > 0 && words.length > 0) {
              const pageText = words.join(' ').toLowerCase();
              for (const h of currentHighlights) {
                const hLower = h.selectedText.toLowerCase();
                if (pageText.includes(hLower)) {
                  const hWords = h.selectedText.split(/\s+/);
                  for (let i = 0; i <= words.length - hWords.length; i++) {
                    const match = hWords.every((hw, j) =>
                      words[i + j].toLowerCase() === hw.toLowerCase()
                    );
                    if (match) {
                      for (let j = 0; j < hWords.length; j++) {
                        const span = doc.querySelector(`[data-tts-idx="${i + j}"]`);
                        if (span) (span as HTMLElement).classList.add(`user-highlight-${h.color}`);
                      }
                      break;
                    }
                  }
                }
              }
            }

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
      const savedPosition = localStorage.getItem(`reader-${bookId}-position`);
      await rendition.display(savedPosition || undefined);

      // Extract table of contents
      const navigation = await book.loaded.navigation;
      if (navigation?.toc) {
        const items: { label: string; href: string; level: number }[] = [];
        function flattenToc(tocList: any[], level: number) {
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
        const spineItems: any[] = [];
        book.spine.each((item: any) => spineItems.push(item));
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
          } catch {}
        }
        if (autoToc.length > 0) setTocItems(autoToc);
      }

      rendition.on('relocated', (location: any) => {
        hlState.setSelectionPopup(null);
        // Track last-read book and progress for library UI
        localStorage.setItem('reader-lastReadId', bookId!);
        localStorage.setItem('reader-lastReadTime', String(Date.now()));
        const current = location.start?.displayed;
        if (current) {
          setCurrentPage(current.page);
          setTotalPages(current.total);
          setLocationInfo(`${current.page} / ${current.total}`);
          setPagesLeftInChapter(current.total - current.page);
        }
        if (location.start?.cfi) {
          currentCfiRef.current = location.start.cfi;
          localStorage.setItem(`reader-${bookId}-position`, location.start.cfi);
        }
        if (location.start?.percentage != null) {
          setBookProgress(location.start.percentage);
          localStorage.setItem(`reader-${bookId}-progress`, String(location.start.percentage));
        }
      });

      // Generate locations for overall book progress percentage
      book.locations.generate(1024);

      setIsLoading(false);
    } catch (e: any) {
      setError(e.message || 'Failed to load book');
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

        <style>{`@keyframes fadeInOut { 0% { opacity: 0; transform: translateX(-50%) translateY(8px); } 10% { opacity: 1; transform: translateX(-50%) translateY(0); } 80% { opacity: 1; } 100% { opacity: 0; } }`}</style>

        {/* Top bar — auto-hides */}
        <div style={{
          ...webStyles.topBar,
          backgroundColor: themes[activeTheme].bg,
          borderBottomColor: activeTheme === 'quiet' ? '#555' : '#e8e8e8',
          opacity: barsVisible ? 1 : 0,
          transition: 'opacity 0.3s',
          pointerEvents: barsVisible ? 'auto' as const : 'none' as const,
        }}>
          <div style={webStyles.topBarLeft}>
            <button onClick={() => router.back()} style={webStyles.iconButton} title="Back">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            {/* TOC — list icon */}
            <button
              onClick={() => { setShowToc(!showToc); if (!showToc) { hlState.setShowHighlights(false); bmState.setShowBookmarks(false); } }}
              style={{
                ...webStyles.iconButton,
                color: showToc ? '#2f95dc' : '#555',
              }}
              title="Table of Contents"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="18" x2="20" y2="18" />
              </svg>
            </button>
            {/* Highlights & Notes — notes icon */}
            <button
              onClick={() => { hlState.setShowHighlights(!hlState.showHighlights); if (!hlState.showHighlights) { setShowToc(false); bmState.setShowBookmarks(false); } }}
              style={{
                ...webStyles.iconButton,
                color: hlState.showHighlights ? '#2f95dc' : '#555',
              }}
              title={`Highlights & Notes (${hlState.highlights.length})`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="7" y1="8" x2="17" y2="8" />
                <line x1="7" y1="12" x2="17" y2="12" />
                <line x1="7" y1="16" x2="13" y2="16" />
              </svg>
            </button>
          </div>

          <span style={{ ...webStyles.bookTitle, color: themes[activeTheme].text }}>{bookTitle || 'Loading...'}</span>

          <div style={webStyles.topBarRight}>
            {/* Search */}
            <button
              onClick={() => { setShowSearch(!showSearch); if (!showSearch) setTimeout(() => searchInputRef.current?.focus(), 50); }}
              style={{
                ...webStyles.iconButton,
                color: showSearch ? '#2f95dc' : '#555',
              }}
              title="Search (Cmd+F)"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
            {/* Themes & Settings */}
            <button
              onClick={() => { setShowThemes(!showThemes); if (!showThemes) { setShowToc(false); hlState.setShowHighlights(false); bmState.setShowBookmarks(false); } }}
              style={{
                ...webStyles.iconButton,
                color: showThemes ? '#2f95dc' : '#555',
                fontSize: '16px',
                fontWeight: 600,
              }}
              title="Themes & Settings"
            >
              Aa
            </button>
            {/* Bookmark current page (click) / Open bookmarks list (long press area) */}
            <button
              onClick={() => { bmState.setShowBookmarks(!bmState.showBookmarks); if (!bmState.showBookmarks) { setShowToc(false); hlState.setShowHighlights(false); } }}
              style={{
                ...webStyles.iconButton,
                color: bmState.showBookmarks ? '#2f95dc' : (bmState.bookmarks.some((b) => b.page === currentPage) ? '#2f95dc' : '#555'),
              }}
              title={`Bookmarks (${bmState.bookmarks.length})`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill={bmState.bookmarks.some((b) => b.page === currentPage) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
                <path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-4-6 4V4z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Themes & Settings dropdown */}
        {showThemes && (
          <div style={{ ...webStyles.themesDropdown, ...panelTheme }} data-popup>
            <div style={webStyles.tocHeader}>
              <strong>Themes & Settings</strong>
              <button onClick={() => setShowThemes(false)} style={webStyles.iconButtonSmall}>
                {'\u2715'}
              </button>
            </div>

            {/* Font size controls */}
            <div style={webStyles.fontSizeRow}>
              <button
                onClick={() => changeFontSize(-10)}
                style={webStyles.fontSizeButton}
                title="Decrease font size"
              >
                <span style={{ fontSize: '14px' }}>A</span>
              </button>
              <span style={{ fontSize: '13px', color: '#666', minWidth: '40px', textAlign: 'center' }}>
                {fontSize}%
              </span>
              <button
                onClick={() => changeFontSize(10)}
                style={webStyles.fontSizeButton}
                title="Increase font size"
              >
                <span style={{ fontSize: '20px' }}>A</span>
              </button>
            </div>

            {/* Theme grid */}
            <div style={webStyles.themeGrid}>
              {(Object.keys(themes) as ThemeName[]).map((key) => {
                const t = themes[key];
                return (
                  <button
                    key={key}
                    onClick={() => setTheme(key)}
                    style={{
                      ...webStyles.themeCard,
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
        )}

        {/* Search panel */}
        {showSearch && (
          <div style={{ ...webStyles.searchPanel, ...panelTheme }} data-popup>
            <div style={webStyles.tocHeader}>
              <strong>Search</strong>
              <button onClick={() => { searchCancelRef.current = true; setShowSearch(false); setSearchQuery(''); setSearchResults([]); }} style={webStyles.iconButtonSmall}>
                {'\u2715'}
              </button>
            </div>
            <div style={{ padding: '8px 12px' }}>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearch(searchQuery);
                  if (e.key === 'Escape') { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }
                }}
                placeholder="Search in book..."
                style={webStyles.searchInput}
              />
            </div>
            {isSearching && (
              <div style={{ padding: '12px', fontSize: '13px', color: '#999', textAlign: 'center' }}>Searching...</div>
            )}
            {!isSearching && searchResults.length > 0 && (
              <div style={webStyles.tocList}>
                {searchResults.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (renditionRef.current && r.cfi) renditionRef.current.display(r.cfi);
                    }}
                    style={webStyles.tocItem}
                  >
                    <span dangerouslySetInnerHTML={{
                      __html: r.excerpt.replace(/<[^>]*>/g, '').replace(
                        new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
                        '<mark style="background:#FFEB3B;padding:0 1px;border-radius:2px">$1</mark>'
                      )
                    }} />
                  </button>
                ))}
              </div>
            )}
            {!isSearching && searchQuery && searchResults.length === 0 && (
              <div style={{ padding: '12px', fontSize: '13px', color: '#999', textAlign: 'center' }}>No results found</div>
            )}
          </div>
        )}

        {/* Keyboard shortcuts overlay */}
        {showShortcuts && (
          <div
            style={webStyles.shortcutsOverlay}
            onClick={() => setShowShortcuts(false)}
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
          <div style={{ ...webStyles.bookmarksDropdown, ...panelTheme }}>
            <div style={webStyles.tocHeader}>
              <strong>Bookmarks</strong>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <button
                  onClick={bmState.toggleBookmark}
                  style={{
                    ...webStyles.iconButtonSmall,
                    color: bmState.bookmarks.some((b) => b.page === currentPage) ? '#2f95dc' : undefined,
                  }}
                  title={bmState.bookmarks.some((b) => b.page === currentPage) ? 'Remove bookmark' : 'Bookmark this page'}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill={bmState.bookmarks.some((b) => b.page === currentPage) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
                    <path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-4-6 4V4z" />
                  </svg>
                </button>
                <button
                  onClick={() => bmState.setShowBookmarks(false)}
                  style={webStyles.iconButtonSmall}
                >
                  {'\u2715'}
                </button>
              </div>
            </div>
            {bmState.bookmarks.length === 0 ? (
              <div style={webStyles.bookmarksEmpty}>
                <div style={{ fontWeight: 500, marginBottom: '4px' }}>No Bookmarks</div>
                <div style={{ fontSize: '12px', opacity: 0.6 }}>
                  Click the bookmark icon above to bookmark the current page.
                </div>
              </div>
            ) : (
              <div style={webStyles.tocList}>
                {bmState.bookmarks
                  .sort((a, b) => a.page - b.page)
                  .map((b) => (
                    <div key={b.id} style={webStyles.bookmarkItem}>
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
                            style={webStyles.bookmarkTitleInput}
                          />
                        </div>
                      ) : (
                        <button
                          onClick={() => navigateToBookmark(b.cfi || '')}
                          style={webStyles.bookmarkLink}
                        >
                          <span>{b.label || 'Untitled'}</span>
                          <span style={webStyles.bookmarkPage}>p. {b.page}</span>
                        </button>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', paddingRight: '4px' }}>
                        <button
                          onClick={() => { bmState.setEditingBookmarkId(b.id); bmState.setBookmarkTitleInput(b.label); }}
                          style={webStyles.iconButtonSmall}
                          title="Rename"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => bmState.removeBookmark(b.id)}
                          style={webStyles.iconButtonSmall}
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
        )}

        {/* Highlights & Notes dropdown */}
        {hlState.showHighlights && (
          <div style={{ ...webStyles.highlightsDropdown, ...panelTheme }}>
            <div style={webStyles.tocHeader}>
              <strong>Highlights & Notes</strong>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                {hlState.highlights.length > 0 && (
                  <>
                    <button
                      onClick={hlState.handleDriveExport}
                      disabled={hlState.isExportingDrive}
                      style={{ ...webStyles.iconButtonSmall, opacity: hlState.isExportingDrive ? 0.4 : 1 }}
                      title="Export Cornell Notes to Google Drive"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                      </svg>
                    </button>
                    <button
                      onClick={hlState.exportHighlightsAsText}
                      style={webStyles.iconButtonSmall}
                      title="Export highlights as text file"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </button>
                  </>
                )}
                <button
                  onClick={() => hlState.setShowHighlights(false)}
                  style={webStyles.iconButtonSmall}
                >
                  {'\u2715'}
                </button>
              </div>
            </div>
            {hlState.highlights.length === 0 ? (
              <div style={webStyles.bookmarksEmpty}>
                <div style={{ fontWeight: 500, marginBottom: '4px' }}>No Highlights or Notes</div>
                <div style={{ fontSize: '12px', opacity: 0.6 }}>
                  Select text, then choose a color or click Add Note.
                </div>
              </div>
            ) : (
              <div style={webStyles.tocList}>
                {hlState.highlights.map((h) => (
                  <div key={h.id} style={webStyles.highlightDropdownItem}>
                    {/* Color bar */}
                    <div
                      style={{
                        width: '4px',
                        alignSelf: 'stretch',
                        backgroundColor: HIGHLIGHT_COLORS[h.color],
                        borderRadius: '2px',
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Clickable text to navigate */}
                      <button
                        onClick={() => {
                          if (h.cfiRange && renditionRef.current) {
                            renditionRef.current.display(h.cfiRange);
                          }
                        }}
                        style={webStyles.highlightTextButton}
                      >
                        "{h.selectedText.length > 80
                          ? h.selectedText.slice(0, 80) + '...'
                          : h.selectedText}"
                      </button>

                      {/* Note editing */}
                      {hlState.editingHighlightId === h.id ? (
                        <div style={{ padding: '0 12px 8px 12px' }}>
                          <textarea
                            value={hlState.editNoteText}
                            onChange={(e) => hlState.setEditNoteText(e.target.value)}
                            style={webStyles.noteInput}
                            rows={2}
                            autoFocus
                          />
                          <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                            <button
                              onClick={() => hlState.setEditingHighlightId(null)}
                              style={webStyles.popupButtonCancel}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={hlState.saveEditNote}
                              style={webStyles.popupButtonSave}
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ padding: '0 12px 8px 12px' }}>
                          {h.note && (
                            <div style={{
                              fontSize: '12px',
                              color: '#555',
                              fontStyle: 'italic',
                              marginBottom: '4px',
                            }}>
                              {h.note}
                            </div>
                          )}
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '11px',
                            opacity: 0.4,
                          }}>
                            <span>{h.pageInfo}</span>
                            <span>{'\u00B7'}</span>
                            <button
                              onClick={() => hlState.startEditNote(h)}
                              style={webStyles.sidebarAction}
                            >
                              {h.note ? 'Edit note' : 'Add note'}
                            </button>
                            <button
                              onClick={() => hlState.removeHighlight(h.id)}
                              style={webStyles.sidebarAction}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Main content */}
        <div style={webStyles.mainContent}>
          {/* Table of Contents panel */}
          {showToc && (
            <div style={{ ...webStyles.tocPanel, ...panelTheme }}>
              <div style={webStyles.tocHeader}>
                <strong>Contents</strong>
                <button
                  onClick={() => setShowToc(false)}
                  style={webStyles.iconButtonSmall}
                >
                  {'\u2715'}
                </button>
              </div>
              <div style={webStyles.tocList}>
                {tocItems.map((item, i) => (
                  <button
                    key={i}
                    onClick={() => navigateToChapter(item.href)}
                    style={{
                      ...webStyles.tocItem,
                      paddingLeft: `${16 + item.level * 16}px`,
                      color: themeColors.text,
                      borderBottomColor: panelBorder,
                    }}
                  >
                    {item.label}
                  </button>
                ))}
                {tocItems.length === 0 && (
                  <div style={{ padding: '20px 16px', opacity: 0.4, fontSize: '13px' }}>
                    No table of contents available.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Page turn arrow — left */}
          <button onClick={prevPage} style={{ ...webStyles.pageChevron, ...webStyles.pageChevronLeft, color: themes[activeTheme].text }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          {/* epub.js viewer */}
          <div style={webStyles.readerPanel}>
            {isLoading && !error && (
              <div style={webStyles.overlay}>
                <p style={{ color: '#999' }}>Loading book...</p>
              </div>
            )}
            {error && (
              <div style={webStyles.overlay}>
                <p style={{ color: 'red' }}>Error: {error}</p>
                <button onClick={() => router.back()}>Go Back</button>
              </div>
            )}
            <div ref={viewerRef} style={webStyles.reader} />
          </div>

          {/* Page turn arrow — right */}
          <button onClick={nextPage} style={{ ...webStyles.pageChevron, ...webStyles.pageChevronRight, color: themes[activeTheme].text }}>
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
          <div style={{ position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)', backgroundColor: 'rgba(0,0,0,0.75)', color: '#fff', padding: '8px 20px', borderRadius: '20px', fontSize: '13px', fontWeight: 500, zIndex: 200, pointerEvents: 'none', animation: 'fadeInOut 2s ease' }}>{toast}</div>
        )}

        {/* Page navigation bar — auto-hides */}
        <div style={{ ...webStyles.pageBar, backgroundColor: themes[activeTheme].bg, borderTopColor: activeTheme === 'quiet' ? '#555' : '#f0f0f0', opacity: barsVisible ? 1 : 0, transition: 'opacity 0.3s', pointerEvents: barsVisible ? 'auto' as const : 'none' as const }}>
          <button onClick={prevPage} style={webStyles.pageArrow} title="Previous page">
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
              style={webStyles.pageInput}
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
              style={webStyles.pageDisplay}
              title="Click to go to a specific page"
            >
              {currentPage} / {totalPages}
            </button>
          )}

          <button onClick={nextPage} style={webStyles.pageArrow} title="Next page">
            {'\u203A'}
          </button>

          <span style={webStyles.pagesLeftLabel}>
            {pagesLeftInChapter === 0
              ? 'End of chapter'
              : `${pagesLeftInChapter} page${pagesLeftInChapter === 1 ? '' : 's'} left in chapter`}
            {' · '}{Math.round(bookProgress * 100)}% of book
          </span>
        </div>

        {/* TTS Player */}
        {wordsReady && (
          <div style={{ ...webStyles.ttsBar, backgroundColor: themes[activeTheme].bg, borderTopColor: activeTheme === 'quiet' ? '#555' : '#eee', opacity: barsVisible ? 1 : 0, transition: 'opacity 0.3s', pointerEvents: barsVisible ? 'auto' as const : 'none' as const }}>
            <button onClick={tts.handleStop} style={webStyles.ttsButton}>
              {'\u25A0'}
            </button>
            <button
              onClick={tts.handlePlayPause}
              style={{
                ...webStyles.ttsButton,
                backgroundColor: tts.isPlaying ? '#333' : '#2f95dc',
                color: '#fff',
                padding: '6px 20px',
                borderRadius: '16px',
              }}
            >
              {tts.isPlaying ? '\u23F8' : '\u25B6'}
            </button>
            {tts.isEditingSpeed ? (
              <input
                type="text"
                value={tts.speedInput}
                onChange={(e) => tts.setSpeedInput(e.target.value.replace(/[^0-9.]/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') tts.handleSpeedInputSubmit();
                  if (e.key === 'Escape') { tts.setIsEditingSpeed(false); tts.setSpeedInput(''); }
                }}
                onBlur={tts.handleSpeedInputSubmit}
                placeholder={String(tts.ttsSpeed)}
                autoFocus
                style={webStyles.speedInput}
              />
            ) : (
              <button
                onClick={() => { tts.setIsEditingSpeed(true); tts.setSpeedInput(''); }}
                style={webStyles.speedDisplay}
                title="Click to type a speed (0.5-3)"
              >
                {tts.ttsSpeed}x
              </button>
            )}
            <input
              type="range"
              min="0.5"
              max="3"
              step="0.25"
              value={tts.ttsSpeed}
              onChange={(e) => {
                const newSpeed = parseFloat(e.target.value);
                tts.handleSpeedChange(newSpeed);
              }}
              style={webStyles.speedSlider}
            />
            {tts.availableVoices.length > 0 && (
              <select
                value={tts.selectedVoice?.name || ''}
                onChange={(e) => {
                  const voice = tts.availableVoices.find((v) => v.name === e.target.value) || null;
                  tts.setSelectedVoice(voice);
                  tts.selectedVoiceRef.current = voice;
                  if (tts.isPlaying) {
                    const resumeFrom = tts.currentWordIndex >= 0 ? tts.currentWordIndex : 0;
                    stopSpeaking();
                    tts.startTTSFromWord(resumeFrom, tts.ttsSpeed);
                  }
                }}
                style={webStyles.voiceSelect}
              >
                <option value="">Default voice</option>
                {tts.favoriteVoiceNames.length > 0 && tts.availableVoices.some((v) => tts.favoriteVoiceNames.includes(v.name)) && (
                  <optgroup label="Favorites">
                    {tts.availableVoices
                      .filter((v) => tts.favoriteVoiceNames.includes(v.name))
                      .map((v) => (
                        <option key={v.name} value={v.name}>
                          {v.name} ({v.lang})
                        </option>
                      ))}
                  </optgroup>
                )}
                <optgroup label="All voices">
                  {tts.availableVoices
                    .filter((v) => !tts.favoriteVoiceNames.includes(v.name))
                    .map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                </optgroup>
              </select>
            )}
          </div>
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

const webStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: '#fff',
    position: 'relative',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderBottom: '1px solid #e8e8e8',
    minHeight: '44px',
  },
  topBarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: '80px',
  },
  topBarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    minWidth: '80px',
    justifyContent: 'flex-end',
  },
  bookTitle: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#333',
    textAlign: 'center',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  iconButton: {
    background: 'none',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer',
    padding: '6px 10px',
    color: '#555',
    borderRadius: '4px',
  },
  iconButtonSmall: {
    background: 'none',
    border: 'none',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '4px 8px',
    color: '#999',
  },
  mainContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'row',
    overflow: 'hidden',
    position: 'relative',
  },
  pageChevron: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    flexShrink: 0,
    opacity: 0.3,
    transition: 'opacity 0.15s',
  },
  pageChevronLeft: {
    paddingLeft: '4px',
  },
  pageChevronRight: {
    paddingRight: '4px',
  },
  readerPanel: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  reader: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    zIndex: 10,
  },
  pageBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '4px 16px',
    borderTop: '1px solid #f0f0f0',
    position: 'relative' as const,
  },
  pagesLeftLabel: {
    position: 'absolute' as const,
    right: '16px',
    fontSize: '11px',
    color: '#999',
  },
  pageArrow: {
    background: 'none',
    border: 'none',
    fontSize: '22px',
    cursor: 'pointer',
    padding: '2px 10px',
    color: '#999',
    lineHeight: 1,
  },
  pageDisplay: {
    background: 'none',
    border: 'none',
    fontSize: '12px',
    color: '#999',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '4px',
    minWidth: '60px',
    textAlign: 'center',
  },
  pageInput: {
    width: '50px',
    padding: '3px 6px',
    fontSize: '12px',
    textAlign: 'center',
    border: '1px solid #ccc',
    borderRadius: '4px',
    outline: 'none',
  },
  ttsBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '8px 16px',
    borderTop: '1px solid #eee',
  },
  ttsButton: {
    background: 'none',
    border: 'none',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '6px 12px',
    color: '#555',
  },
  // Selection popup
  selectionPopup: {
    position: 'fixed',
    transform: 'translateX(-50%)',
    backgroundColor: '#fff',
    border: '1px solid #ddd',
    borderRadius: '12px',
    padding: '0 12px 12px 12px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    zIndex: 100,
    width: '280px',
  },
  dragOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 99,
    cursor: 'grabbing',
  },
  popupDragHandle: {
    cursor: 'grab',
    padding: '8px 0 4px 0',
    display: 'flex',
    justifyContent: 'center',
    userSelect: 'none' as const,
  },
  dragDots: {
    width: '36px',
    height: '4px',
    borderRadius: '2px',
    backgroundColor: '#ccc',
  },
  colorPicker: {
    display: 'flex',
    gap: '8px',
    marginBottom: '8px',
  },
  popupPreview: {
    fontSize: '12px',
    color: '#666',
    marginBottom: '8px',
    lineHeight: '1.4',
    fontStyle: 'italic',
  },
  noteInput: {
    width: '100%',
    padding: '8px',
    fontSize: '13px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    resize: 'vertical' as const,
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
  },
  popupActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '8px',
  },
  popupButtonCancel: {
    background: 'none',
    border: '1px solid #ddd',
    borderRadius: '4px',
    padding: '5px 12px',
    fontSize: '12px',
    cursor: 'pointer',
    color: '#666',
  },
  popupButtonSave: {
    background: '#2f95dc',
    border: 'none',
    borderRadius: '4px',
    padding: '5px 12px',
    fontSize: '12px',
    cursor: 'pointer',
    color: '#fff',
  },
  // Themes dropdown
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
  // Highlights & Notes dropdown
  highlightsDropdown: {
    position: 'absolute',
    top: '44px',
    left: '12px',
    width: '300px',
    maxHeight: '500px',
    backgroundColor: '#fafafa',
    border: '1px solid #e8e8e8',
    borderRadius: '8px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    zIndex: 50,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  highlightDropdownItem: {
    display: 'flex',
    gap: '8px',
    borderBottom: '1px solid #f0f0f0',
  },
  highlightTextButton: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    background: 'none',
    border: 'none',
    padding: '10px 12px 4px 12px',
    fontSize: '13px',
    color: '#333',
    cursor: 'pointer',
    lineHeight: '1.4',
  },
  sidebarAction: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '11px',
    color: '#2f95dc',
    padding: 0,
  },
  tocPanel: {
    width: '280px',
    borderRight: '1px solid #e8e8e8',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#fafafa',
    zIndex: 10,
    flexShrink: 0,
  },
  tocHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #eee',
    fontSize: '14px',
  },
  tocList: {
    flex: 1,
    overflow: 'auto',
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
  bookmarksEmpty: {
    padding: '30px 20px',
    textAlign: 'center',
    color: '#999',
    fontSize: '13px',
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
  speedDisplay: {
    background: 'none',
    border: '1px solid transparent',
    fontSize: '12px',
    color: '#555',
    cursor: 'pointer',
    padding: '3px 6px',
    borderRadius: '4px',
    minWidth: '36px',
    textAlign: 'center',
  },
  speedInput: {
    width: '44px',
    padding: '3px 6px',
    fontSize: '12px',
    textAlign: 'center',
    border: '1px solid #ccc',
    borderRadius: '4px',
    outline: 'none',
  },
  voiceSelect: {
    padding: '4px 8px',
    fontSize: '12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    backgroundColor: '#fff',
    color: '#555',
    maxWidth: '200px',
    cursor: 'pointer',
  },
  speedSlider: {
    width: '80px',
    cursor: 'pointer',
    accentColor: '#2f95dc',
  },
  // Progress bar
  progressBarTrack: {
    height: '3px',
    backgroundColor: '#e0e0e0',
    width: '100%',
    flexShrink: 0,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#2f95dc',
    transition: 'width 0.3s ease',
    borderRadius: '0 2px 2px 0',
  },
  // Search panel
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
  searchInput: {
    width: '100%',
    padding: '8px 10px',
    fontSize: '13px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  // Keyboard shortcuts
  shortcutsOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
  },
  shortcutsPanel: {
    width: '320px',
    backgroundColor: '#fff',
    borderRadius: '12px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
    overflow: 'hidden',
  },
  shortcutRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '6px 0',
  },
  shortcutKey: {
    display: 'inline-block',
    padding: '2px 8px',
    fontSize: '12px',
    fontFamily: 'monospace',
    backgroundColor: '#f0f0f0',
    border: '1px solid #ddd',
    borderRadius: '4px',
    minWidth: '40px',
    textAlign: 'center' as const,
  },
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
});
