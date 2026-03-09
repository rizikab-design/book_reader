/**
 * PDF Reader Component — Apple Books-style layout
 *
 * Full-featured PDF reader with:
 * - Canvas rendering with text layer
 * - TTS with word highlighting
 * - Themes, bookmarks, highlights/notes, search
 * - Keyboard shortcuts
 *
 * State management delegated to shared hooks in @/hooks/*.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { router } from 'expo-router';
import { stopSpeaking } from '@/lib/tts-engine';
import type { PDFTextItem } from '@/types/pdfjs';
import { HighlightColor, HIGHLIGHT_COLORS, ThemeName, themes, ReaderHighlight } from '@/hooks/reader-types';
import { usePersistedState, bookKey } from '@/hooks/usePersistedState';
import { useToast } from '@/hooks/useToast';
import { useAutoHideBars } from '@/hooks/useAutoHideBars';
import { useReaderTheme } from '@/hooks/useReaderTheme';
import { useReaderSearch, SearchResult } from '@/hooks/useReaderSearch';
import { useReaderTts } from '@/hooks/useReaderTts';
import { useReaderHighlights } from '@/hooks/useReaderHighlights';
import { useReaderBookmarks } from '@/hooks/useReaderBookmarks';

import TocPanel from '@/components/reader/TocPanel';
import BookmarksPanel from '@/components/reader/BookmarksPanel';
import HighlightsPanel from '@/components/reader/HighlightsPanel';
import SearchPanel from '@/components/reader/SearchPanel';
import ThemesPanel from '@/components/reader/ThemesPanel';

const MAX_SEARCH_RESULTS = 50;
const SEARCH_EXCERPT_CONTEXT = 30;
const THUMBNAIL_SCALE = 0.3;
const THUMBNAIL_CACHE_LIMIT = 50;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;
const MIN_SELECTION_LENGTH = 3;

interface PdfReaderProps {
  bookUrl: string;
  bookId: string;
  bookTitle: string;
}

export default function PdfReader({ bookUrl, bookId, bookTitle }: PdfReaderProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdfjs-dist types are incompatible with our interfaces
  const pdfDocRef = useRef<any>(null);

  // ── Core page state ──────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = usePersistedState<number>(bookKey(bookId, 'pdfScale'), 1.5);
  const [pageWords, setPageWords] = useState<string[]>([]);
  const wordsRef = useRef<string[]>([]);

  // ── TOC ──────────────────────────────────────────────────────────────
  const [tocItems, setTocItems] = useState<{ title: string; page: number }[]>([]);
  const [showToc, setShowToc] = useState(false);

  // ── Thumbnails ───────────────────────────────────────────────────────
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [thumbsLoaded, setThumbsLoaded] = useState(new Set<number>());
  const thumbnailsContainerRef = useRef<HTMLDivElement | null>(null);
  const thumbnailCacheRef = useRef<Map<number, string>>(new Map());

  // ── Page input ──────────────────────────────────────────────────────
  const [isEditingPage, setIsEditingPage] = useState(false);
  const [pageInput, setPageInput] = useState('');
  const pageInputRef = useRef<HTMLInputElement | null>(null);

  // ── Panels ───────────────────────────────────────────────────────────
  const [showThemes, setShowThemes] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // ── Shared hooks ─────────────────────────────────────────────────────
  const { toast, showToast } = useToast();
  const { barsVisible } = useAutoHideBars();
  const { activeTheme, setActiveTheme, fontSize, setFontSize, themeColors, panelTheme, panelBorder, changeFontSize } = useReaderTheme();
  const { showSearch, setShowSearch, searchQuery, setSearchQuery, searchResults, setSearchResults, isSearching, setIsSearching, searchInputRef, searchCancelRef, openSearch, closeSearch } = useReaderSearch();

  const tts = useReaderTts({
    bookId,
    getWords: () => wordsRef.current,
  });

  const hlState = useReaderHighlights({
    bookId,
    bookTitle,
    showToast,
  });

  const bmState = useReaderBookmarks({
    bookId,
    currentPage,
    showToast,
  });

  // ── Page / progress persistence ──────────────────────────────────────
  useEffect(() => {
    localStorage.setItem(bookKey(bookId, 'page'), String(currentPage));
    if (totalPages > 0) {
      localStorage.setItem(bookKey(bookId, 'progress'), String(currentPage / totalPages));
    }
    localStorage.setItem('reader-lastReadId', bookId);
    localStorage.setItem('reader-lastReadTime', String(Date.now()));
  }, [currentPage, totalPages]);

  // ── TTS word highlight on text layer spans ──────────────────────────
  const prevTtsSpanRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    // Remove previous highlight
    if (prevTtsSpanRef.current) {
      prevTtsSpanRef.current.classList.remove('tts-active');
      prevTtsSpanRef.current = null;
    }
    if (!textLayerRef.current || tts.currentWordIndex < 0) return;
    const span = textLayerRef.current.querySelector(`[data-tts-idx="${tts.currentWordIndex}"]`) as HTMLElement | null;
    if (span) {
      span.classList.add('tts-active');
      prevTtsSpanRef.current = span;
    }
  }, [tts.currentWordIndex]);

  // ── Load PDF ─────────────────────────────────────────────────────────
  useEffect(() => {
    loadPdf();
    return () => stopSpeaking();
  }, []);

  async function loadPdf() {
    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

      const loadingTask = pdfjsLib.getDocument(bookUrl);
      const pdf = await loadingTask.promise;
      pdfDocRef.current = pdf;
      setTotalPages(pdf.numPages);

      // Extract TOC from PDF outline
      try {
        const outline = await pdf.getOutline();
        if (outline && outline.length > 0) {
          const toc: { title: string; page: number }[] = [];
          for (const item of outline) {
            if (item.dest) {
              try {
                const dest = typeof item.dest === 'string'
                  ? await pdf.getDestination(item.dest)
                  : item.dest;
                if (dest) {
                  const pageIndex = await pdf.getPageIndex(dest[0]);
                  toc.push({ title: item.title, page: pageIndex + 1 });
                }
              } catch (e) { console.warn('Failed to extract TOC entry:', e); }
            }
          }
          setTocItems(toc);
        }

        // Auto-generate TOC if none found
        if (!outline || outline.length === 0) {
          const autoToc: { title: string; page: number }[] = [];
          const scanLimit = Math.min(pdf.numPages, 200);
          for (let p = 1; p <= scanLimit; p++) {
            try {
              const page = await pdf.getPage(p);
              const textContent = await page.getTextContent();
              const items = textContent.items as PDFTextItem[];
              if (items.length === 0) continue;
              const maxFontSize = Math.max(...items.map((it: PDFTextItem) => it.height || 0));
              if (maxFontSize <= 0) continue;
              const heights = items.map((it: PDFTextItem) => it.height || 0).filter((h: number) => h > 0).sort((a: number, b: number) => a - b);
              const medianHeight = heights[Math.floor(heights.length / 2)] || 10;
              const threshold = medianHeight * 1.3;
              const headingItems = items.filter((it: PDFTextItem) => (it.height || 0) >= threshold && it.str?.trim().length > 2);
              if (headingItems.length > 0 && headingItems.length <= 3) {
                const title = headingItems.map((it: PDFTextItem) => it.str.trim()).join(' ');
                if (title.length > 1 && title.length < 120) {
                  autoToc.push({ title, page: p });
                }
              }
            } catch (e) { console.warn('Failed to scan page for auto-TOC:', e); }
          }
          if (autoToc.length > 0) setTocItems(autoToc);
        }
      } catch (e) { console.warn('Failed to extract PDF outline/TOC:', e); }

      // Restore saved page
      let startPage = 1;
      try { const saved = localStorage.getItem(bookKey(bookId, 'page')); if (saved) startPage = parseInt(saved, 10); } catch (e) { console.warn('Failed to read saved page from localStorage:', e); }
      if (startPage > pdf.numPages || startPage < 1) startPage = 1;

      setCurrentPage(startPage);
      setIsLoading(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load PDF');
      setIsLoading(false);
    }
  }

  // ── Thumbnail rendering ──────────────────────────────────────────────
  async function renderThumbnail(pageNum: number): Promise<string> {
    if (thumbnailCacheRef.current.has(pageNum)) return thumbnailCacheRef.current.get(pageNum)!;
    const pdf = pdfDocRef.current;
    if (!pdf) return '';
    try {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: THUMBNAIL_SCALE });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const url = canvas.toDataURL('image/jpeg', 0.6);
      if (thumbnailCacheRef.current.size >= THUMBNAIL_CACHE_LIMIT) {
        const firstKey = thumbnailCacheRef.current.keys().next().value;
        if (firstKey !== undefined) thumbnailCacheRef.current.delete(firstKey);
      }
      thumbnailCacheRef.current.set(pageNum, url);
      return url;
    } catch (e) { console.warn('PDF thumbnail render error:', e); return ''; }
  }

  // ── Apply saved highlights to text layer ─────────────────────────────
  function applyHighlightsToTextLayer(pageNum: number, textLayer: HTMLDivElement | null) {
    if (!textLayer) return;
    const pageHighlights = hlState.highlights.filter((h) => h.page === pageNum);
    if (pageHighlights.length === 0) return;

    const spans = textLayer.querySelectorAll('span');
    if (spans.length === 0) return;

    for (const h of pageHighlights) {
      const hLower = h.selectedText.toLowerCase();
      let accumulated = '';
      let spanTexts: { span: HTMLSpanElement; start: number; text: string }[] = [];
      spans.forEach((span) => {
        const text = span.textContent || '';
        spanTexts.push({ span: span as HTMLSpanElement, start: accumulated.length, text });
        accumulated += text;
      });

      const accLower = accumulated.toLowerCase();
      let searchFrom = 0;
      while (true) {
        const idx = accLower.indexOf(hLower, searchFrom);
        if (idx === -1) break;
        const endIdx = idx + hLower.length;
        for (const st of spanTexts) {
          const spanEnd = st.start + st.text.length;
          if (st.start < endIdx && spanEnd > idx) {
            st.span.classList.add(`pdf-highlight-${h.color}`);
          }
        }
        searchFrom = idx + 1;
      }
    }
  }

  // Lazy-load thumbnails via IntersectionObserver when they scroll into view
  useEffect(() => {
    if (!showThumbnails || !pdfDocRef.current || !thumbnailsContainerRef.current) return;
    const container = thumbnailsContainerRef.current;
    const generating = new Set<number>();

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const pageNum = Number((entry.target as HTMLElement).dataset.page);
        if (!pageNum || thumbnailCacheRef.current.has(pageNum) || generating.has(pageNum)) continue;
        generating.add(pageNum);
        renderThumbnail(pageNum).then(() => {
          setThumbsLoaded((prev) => new Set(prev).add(pageNum));
        });
      }
    }, { root: container, rootMargin: '200px' });

    const slots = container.querySelectorAll('[data-page]');
    slots.forEach((slot) => observer.observe(slot));

    return () => observer.disconnect();
  }, [showThumbnails, totalPages]);

  // ── Render page ──────────────────────────────────────────────────────
  const renderPage = useCallback(async (pageNum: number) => {
    const pdf = pdfDocRef.current;
    if (!pdf || !canvasRef.current) return;

    setIsRendering(true);
    try {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvasContext: context, viewport }).promise;

      const textContent = await page.getTextContent();
      const textLayer = textLayerRef.current;
      if (textLayer) {
        textLayer.innerHTML = '';
        textLayer.style.width = `${viewport.width}px`;
        textLayer.style.height = `${viewport.height}px`;
        textLayer.style.setProperty('--scale-factor', String(scale));

        const pdfjsLib = await import('pdfjs-dist');
        // @ts-ignore — renderTextLayer exists in pdfjs-dist
        const { renderTextLayer } = pdfjsLib;
        if (renderTextLayer) {
          await renderTextLayer({
            textContentSource: textContent,
            container: textLayer,
            viewport,
            textDivs: [],
          }).promise;
        }
      }

      // Tag text layer spans with TTS word indices for click-to-read
      const fullText = textContent.items.map((item: PDFTextItem) => item.str).join(' ').replace(/\s+/g, ' ').trim();
      const words = fullText.split(/\s+/).filter((w: string) => w.length > 0);
      if (textLayer) {
        let wordIndex = 0;
        const spans = Array.from(textLayer.querySelectorAll('span'));
        for (const span of spans) {
          const text = span.textContent || '';
          const spanWords = text.split(/\s+/).filter((w: string) => w.length > 0);
          if (spanWords.length === 0) continue;
          span.setAttribute('data-tts-idx', String(wordIndex));
          span.style.cursor = 'pointer';
          wordIndex += spanWords.length;
        }
      }
      setPageWords(words);
      wordsRef.current = words;
      tts.resumeWordIndexRef.current = -1;
      tts.setCurrentWordIndex(-1);

      // Re-apply saved highlights to text layer spans
      applyHighlightsToTextLayer(pageNum, textLayer);
    } catch (e) {
      console.warn('Page render error:', e);
    }
    setIsRendering(false);
  }, [scale]);

  useEffect(() => {
    if (!isLoading && pdfDocRef.current) {
      stopSpeaking();
      tts.setIsPlaying(false);
      hlState.setSelectionPopup(null);
      renderPage(currentPage);
    }
  }, [currentPage, isLoading, renderPage]);

  // ── Highlights ───────────────────────────────────────────────────────
  function saveHighlight() {
    if (!hlState.selectionPopup) return;
    hlState.addHighlight({
      selectedText: hlState.selectionPopup.selectedText,
      note: hlState.noteText,
      color: hlState.selectedColor,
      pageInfo: `Page ${currentPage}`,
      page: currentPage,
      createdAt: new Date().toLocaleString(),
    });
    hlState.setSelectionPopup(null);
    hlState.setNoteText('');
  }

  // ── Text selection handler ───────────────────────────────────────────
  useEffect(() => {
    function handleMouseUp(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('select') || target.closest('input') || target.closest('textarea') || target.closest('[data-popup]')) return;

      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (text && text.length >= MIN_SELECTION_LENGTH) {
        const popupX = Math.min(e.clientX, window.innerWidth - 160);
        const popupY = Math.min(e.clientY + 10, window.innerHeight - 300);
        hlState.setSelectionPopup({ x: popupX, y: popupY, selectedText: text });
        hlState.setPopupPos(null);
      }
    }
    function handleDblClick(e: MouseEvent) {
      const sel = window.getSelection();
      const word = sel?.toString().trim();
      if (!word || word.includes(' ') || word.length > 30 || word.length < 2) return;
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('[data-popup]')) return;
      const x = Math.min(e.clientX, window.innerWidth - 160);
      const y = Math.min(e.clientY + 10, window.innerHeight - 300);
      hlState.setSelectionPopup({ x, y, selectedText: word });
      hlState.setPopupPos(null);
      hlState.setNoteText('');
      hlState.setSelectedColor('yellow');
      hlState.handleDefine(word);
    }
    function handleWordClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const ttsIdx = target.getAttribute?.('data-tts-idx');
      if (ttsIdx === null || ttsIdx === undefined) return;

      // Don't start TTS if user is selecting text
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && selection.toString().trim().length > 1) return;

      const wordIndex = parseInt(ttsIdx, 10);
      if (isNaN(wordIndex)) return;

      stopSpeaking();
      tts.resumeWordIndexRef.current = wordIndex;
      tts.setCurrentWordIndex(wordIndex);
      tts.startTTSFromWordRef.current(wordIndex, tts.ttsSpeedRef.current);
    }
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('dblclick', handleDblClick);
    window.addEventListener('click', handleWordClick);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('dblclick', handleDblClick);
      window.removeEventListener('click', handleWordClick);
    };
  }, []);

  // ── PDF search ───────────────────────────────────────────────────────
  async function handleSearch(query: string) {
    if (!pdfDocRef.current || !query.trim()) { setSearchResults([]); return; }
    searchCancelRef.current = false;
    setIsSearching(true);
    const results: SearchResult[] = [];
    const pdf = pdfDocRef.current;
    const lowerQuery = query.toLowerCase();
    for (let i = 1; i <= pdf.numPages && results.length < MAX_SEARCH_RESULTS; i++) {
      if (searchCancelRef.current) break;
      try {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: PDFTextItem) => item.str).join(' ');
        if (pageText.toLowerCase().includes(lowerQuery)) {
          const idx = pageText.toLowerCase().indexOf(lowerQuery);
          const start = Math.max(0, idx - SEARCH_EXCERPT_CONTEXT);
          const end = Math.min(pageText.length, idx + query.length + SEARCH_EXCERPT_CONTEXT);
          const excerpt = (start > 0 ? '...' : '') + pageText.slice(start, end) + (end < pageText.length ? '...' : '');
          results.push({ page: i, excerpt });
        }
      } catch (e) { console.warn('PDF search error on page', i, ':', e); }
    }
    if (!searchCancelRef.current) {
      setSearchResults(results);
    }
    setIsSearching(false);
  }

  // ── Page navigation ──────────────────────────────────────────────────
  const totalPagesRef = useRef(totalPages);
  useEffect(() => { totalPagesRef.current = totalPages; }, [totalPages]);

  function nextPage() { setCurrentPage((p) => p < totalPagesRef.current ? p + 1 : p); }
  function prevPage() { setCurrentPage((p) => p > 1 ? p - 1 : p); }

  function handlePageInputSubmit() {
    const page = parseInt(pageInput, 10);
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
    setIsEditingPage(false);
    setPageInput('');
  }

  const nextPageRef = useRef(nextPage);
  const prevPageRef = useRef(prevPage);
  nextPageRef.current = nextPage;
  prevPageRef.current = prevPage;

  // ── Font size + scale sync ───────────────────────────────────────────
  function changeFontSizePdf(delta: number) {
    changeFontSize(delta);
    setScale(1.5 * (Math.max(50, Math.min(200, fontSize + delta)) / 100));
  }

  // ── Ctrl+scroll zoom ────────────────────────────────────────────────
  useEffect(() => {
    function handleWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setScale((prev) => {
          const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)));
          return Math.round(next * 100) / 100;
        });
      }
    }
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

  // ── Keyboard shortcuts ───────────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        if (showSearch) closeSearch(); else openSearch();
      } else if (e.key === ' ') { e.preventDefault(); tts.handlePlayPauseRef.current(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextPageRef.current();
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') prevPageRef.current();
      else if (e.key === '?') setShowShortcuts((v) => !v);
      else if (e.key === 'Escape') { hlState.setSelectionPopup(null); closeSearch(); setShowShortcuts(false); hlState.setShowDict(false); }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── Close all panels helper ──────────────────────────────────────────
  function closeAllPanels() {
    setShowToc(false);
    bmState.setShowBookmarks(false);
    hlState.setShowHighlights(false);
    setShowThemes(false);
    closeSearch();
    setShowThumbnails(false);
  }

  // ── Derived values ───────────────────────────────────────────────────
  const progress = totalPages > 0 ? currentPage / totalPages : 0;

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

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div style={{ ...s.container, backgroundColor: themeColors.bg }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeInOut { 0% { opacity: 0; transform: translateX(-50%) translateY(8px); } 10% { opacity: 1; transform: translateX(-50%) translateY(0); } 80% { opacity: 1; } 100% { opacity: 0; } }
        .textLayer { line-height: 1; }
        .textLayer span { position: absolute; white-space: pre; color: transparent; }
        .textLayer ::selection { background: rgba(47, 149, 220, 0.35); }
        .textLayer .tts-active { background-color: rgba(255, 235, 59, 0.45); border-radius: 3px; }
        .textLayer .pdf-highlight-yellow { background-color: rgba(255, 235, 59, 0.35); border-radius: 2px; }
        .textLayer .pdf-highlight-blue { background-color: rgba(144, 202, 249, 0.35); border-radius: 2px; }
        .textLayer .pdf-highlight-green { background-color: rgba(165, 214, 167, 0.35); border-radius: 2px; }
        .textLayer .pdf-highlight-pink { background-color: rgba(244, 143, 177, 0.35); border-radius: 2px; }
        .pdf-topbar button:hover { background: rgba(0,0,0,0.06) !important; }
        .pdf-pagechevron:hover { opacity: 0.7 !important; }
        .pdf-ttsbar button:hover { opacity: 0.8; }
        button:disabled { cursor: not-allowed !important; }
      `}</style>
      {/* Progress bar */}
      <div style={s.progressTrack}>
        <div style={{ ...s.progressFill, width: `${Math.round(progress * 100)}%` }} />
      </div>

      {/* Top bar — auto-hides */}
      <div className="pdf-topbar" style={{ ...s.topBar, backgroundColor: themeColors.bg, borderBottomColor: panelBorder, opacity: barsVisible ? 1 : 0, transition: 'opacity 0.3s', pointerEvents: barsVisible ? 'auto' as const : 'none' as const }}>
        <div style={s.topBarLeft}>
          <button onClick={() => router.back()} style={s.iconButton}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          {/* TOC */}
          {tocItems.length > 0 && (
            <button onClick={() => { const opening = !showToc; closeAllPanels(); if (opening) setShowToc(true); }}
              style={{ ...s.iconButton, color: showToc ? '#2f95dc' : '#555' }} title="Table of Contents">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
              </svg>
            </button>
          )}
          {/* Thumbnails */}
          <button onClick={() => { const opening = !showThumbnails; closeAllPanels(); if (opening) setShowThumbnails(true); }}
            style={{ ...s.iconButton, color: showThumbnails ? '#2f95dc' : '#555' }} title="Page Thumbnails">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </button>
          {/* Highlights */}
          <button onClick={() => { const opening = !hlState.showHighlights; closeAllPanels(); if (opening) hlState.setShowHighlights(true); }}
            style={{ ...s.iconButton, color: hlState.showHighlights ? '#2f95dc' : '#555' }} title={`Highlights (${hlState.highlights.length})`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="7" y1="8" x2="17" y2="8" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="7" y1="16" x2="13" y2="16" />
            </svg>
          </button>
        </div>

        <span style={{ ...s.bookTitleText, color: themeColors.text }}>{bookTitle}</span>

        <div style={s.topBarRight}>
          {/* Search */}
          <button onClick={() => { const opening = !showSearch; closeAllPanels(); if (opening) openSearch(); }}
            style={{ ...s.iconButton, color: showSearch ? '#2f95dc' : '#555' }} title="Search (Cmd+F)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
          {/* Themes */}
          <button onClick={() => { const opening = !showThemes; closeAllPanels(); if (opening) setShowThemes(true); }}
            style={{ ...s.iconButton, color: showThemes ? '#2f95dc' : '#555', fontSize: '16px', fontWeight: 600 }} title="Themes">
            Aa
          </button>
          {/* Bookmark toggle */}
          <button onClick={() => { const opening = !bmState.showBookmarks; closeAllPanels(); if (opening) bmState.setShowBookmarks(true); }}
            style={{ ...s.iconButton, color: bmState.showBookmarks ? '#2f95dc' : (bmState.bookmarks.some((b) => b.page === currentPage) ? '#2f95dc' : '#555') }} title="Bookmarks">
            <svg width="20" height="20" viewBox="0 0 24 24" fill={bmState.bookmarks.some((b) => b.page === currentPage) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
              <path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-4-6 4V4z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Themes dropdown */}
      {showThemes && (
        <ThemesPanel
          activeTheme={activeTheme}
          fontSize={fontSize}
          themes={themes}
          onThemeChange={setActiveTheme}
          onFontSizeChange={changeFontSizePdf}
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
        onNavigate={(r) => { if (r.page != null) setCurrentPage(r.page); }}
        onClose={closeSearch}
        themeColors={themeColors}
        panelTheme={panelTheme}
        panelBorder={panelBorder}
        searchInputRef={searchInputRef}
      />

      {/* Bookmarks dropdown */}
      {bmState.showBookmarks && (
        <BookmarksPanel
          bmState={bmState}
          currentPage={currentPage}
          themeColors={themeColors}
          panelTheme={panelTheme}
          panelBorder={panelBorder}
          onNavigate={(target) => { setCurrentPage(Number(target)); bmState.setShowBookmarks(false); }}
          variant="pdf"
        />
      )}

      {/* TOC dropdown */}
      {showToc && (
        <TocPanel
          tocItems={tocItems}
          themeColors={themeColors}
          panelTheme={panelTheme}
          panelBorder={panelBorder}
          onNavigate={(target) => { setCurrentPage(Number(target)); setShowToc(false); }}
          onClose={() => setShowToc(false)}
          variant="dropdown"
        />
      )}

      {/* Highlights dropdown */}
      {hlState.showHighlights && (
        <HighlightsPanel
          hlState={hlState}
          themeColors={themeColors}
          panelTheme={panelTheme}
          panelBorder={panelBorder}
          onNavigate={(h) => { if (h.page != null) setCurrentPage(h.page); }}
          HIGHLIGHT_COLORS={HIGHLIGHT_COLORS}
          variant="pdf"
        />
      )}

      {/* Thumbnails sidebar */}
      {showThumbnails && (
        <div style={{ ...s.thumbnailsSidebar, ...panelTheme }}>
          <div style={s.dropdownHeader}>
            <strong>Pages</strong>
            <button onClick={() => setShowThumbnails(false)} style={s.closeBtn}>{'\u2715'}</button>
          </div>
          <div ref={thumbnailsContainerRef} style={s.thumbnailsGrid}>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
              const thumbUrl = thumbnailCacheRef.current.get(pageNum);
              return (
                <button key={pageNum} data-page={pageNum} onClick={() => { setCurrentPage(pageNum); setShowThumbnails(false); }}
                  style={{ ...s.thumbnailItem, border: pageNum === currentPage ? '2px solid #2f95dc' : '2px solid transparent' }}>
                  {thumbUrl ? (
                    <img src={thumbUrl} alt={`Page ${pageNum}`} style={s.thumbnailImg} />
                  ) : (
                    <div style={s.thumbnailPlaceholder}>
                      <span style={{ fontSize: '11px', color: '#999' }}>{pageNum}</span>
                    </div>
                  )}
                  <span style={{ fontSize: '10px', color: pageNum === currentPage ? '#2f95dc' : '#999', marginTop: '2px' }}>{pageNum}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Keyboard shortcuts overlay */}
      {showShortcuts && (
        <div style={s.shortcutsOverlay} onClick={() => setShowShortcuts(false)}>
          <div style={{ ...s.shortcutsPanel, ...panelTheme }} onClick={(e) => e.stopPropagation()}>
            <div style={s.dropdownHeader}>
              <strong>Keyboard Shortcuts</strong>
              <button onClick={() => setShowShortcuts(false)} style={s.closeBtn}>{'\u2715'}</button>
            </div>
            <div style={{ padding: '12px 16px' }}>
              {[['Space', 'Play / Pause TTS'], ['\u2190 \u2192', 'Previous / Next page'], ['Cmd+F', 'Search'], ['?', 'Toggle this help'], ['Esc', 'Close popups']].map(([key, desc]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 0' }}>
                  <kbd style={s.kbd}>{key}</kbd>
                  <span style={{ fontSize: '13px' }}>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div style={s.mainContent}>
        <button className="pdf-pagechevron" onClick={prevPage} disabled={currentPage <= 1} style={{ ...s.pageChevron, opacity: currentPage > 1 ? 0.4 : 0.1 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={themeColors.text} strokeWidth="1.5"><polyline points="15 18 9 12 15 6" /></svg>
        </button>

        <div style={s.pdfContainer}>
          {isLoading && (
            <div style={{ ...s.centerOverlay, flexDirection: 'column', gap: '12px' }}>
              <div style={{ width: '28px', height: '28px', border: '3px solid #e0e0e0', borderTopColor: '#2f95dc', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <span>Loading PDF...</span>
            </div>
          )}
          {error && (
            <div style={{ ...s.centerOverlay, flexDirection: 'column', gap: '12px' }}>
              <p style={{ color: '#e55', fontSize: '14px' }}>{error}</p>
              <button onClick={() => window.history.back()} style={{ padding: '8px 20px', backgroundColor: '#2f95dc', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>Go Back</button>
            </div>
          )}
          {isRendering && (
            <div style={s.renderingOverlay}>
              <div style={s.spinner} />
            </div>
          )}
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <canvas ref={canvasRef} style={{ display: 'block', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', opacity: isRendering ? 0.4 : 1, transition: 'opacity 0.2s' }} />
            <div ref={textLayerRef} className="textLayer" style={{ position: 'absolute', top: 0, left: 0, overflow: 'hidden' }} />
          </div>
        </div>

        <button className="pdf-pagechevron" onClick={nextPage} disabled={currentPage >= totalPages} style={{ ...s.pageChevron, opacity: currentPage < totalPages ? 0.4 : 0.1 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={themeColors.text} strokeWidth="1.5"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>

      {/* Selection popup — draggable */}
      {hlState.selectionPopup && (() => {
        const px = hlState.popupPos ? hlState.popupPos.x : hlState.selectionPopup.x;
        const py = hlState.popupPos ? hlState.popupPos.y : hlState.selectionPopup.y;
        const clampedX = Math.max(8, Math.min(window.innerWidth - 288, px));
        const clampedY = Math.max(8, Math.min(window.innerHeight - 280, py));
        return (
          <div data-popup style={{ ...s.selectionPopup, left: clampedX, top: clampedY, ...panelTheme }}>
            {/* Drag handle */}
            <div
              style={s.dragHandle}
              onMouseDown={(e) => {
                e.preventDefault();
                const currentX = hlState.popupPos ? hlState.popupPos.x : hlState.selectionPopup!.x;
                const currentY = hlState.popupPos ? hlState.popupPos.y : hlState.selectionPopup!.y;
                hlState.popupDragRef.current = { startX: e.clientX, startY: e.clientY, origX: currentX, origY: currentY };
                const onMove = (ev: MouseEvent) => {
                  if (!hlState.popupDragRef.current) return;
                  hlState.setPopupPos({
                    x: hlState.popupDragRef.current.origX + (ev.clientX - hlState.popupDragRef.current.startX),
                    y: hlState.popupDragRef.current.origY + (ev.clientY - hlState.popupDragRef.current.startY),
                  });
                };
                const onUp = () => {
                  hlState.popupDragRef.current = null;
                  window.removeEventListener('mousemove', onMove);
                  window.removeEventListener('mouseup', onUp);
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
              }}
            >
              <div style={s.dragDots} />
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              {(Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).map((color) => (
                <button key={color} onClick={() => hlState.setSelectedColor(color)} style={{
                  width: '24px', height: '24px', borderRadius: '50%', backgroundColor: HIGHLIGHT_COLORS[color],
                  border: hlState.selectedColor === color ? '2px solid #333' : '2px solid transparent', cursor: 'pointer',
                }} />
              ))}
            </div>
            {/* Define & Thesaurus toggle for short selections */}
            {hlState.selectionPopup.selectedText.split(/\s+/).length <= 3 && (
              <button
                onClick={() => { if (hlState.showDict) { hlState.setShowDict(false); } else { hlState.handleDefine(hlState.selectionPopup!.selectedText.split(/\s+/)[0]); } }}
                style={{
                  width: '100%', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  background: hlState.showDict ? '#2f95dc' : 'none', border: '1px solid ' + (hlState.showDict ? '#2f95dc' : '#ddd'),
                  borderRadius: '4px', padding: '5px 12px', fontSize: '12px', cursor: 'pointer', color: hlState.showDict ? '#fff' : '#666',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
                Define &amp; Thesaurus
              </button>
            )}
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px', fontStyle: 'italic', lineHeight: '1.4' }}>
              "{hlState.selectionPopup.selectedText.length > 60 ? hlState.selectionPopup.selectedText.slice(0, 60) + '...' : hlState.selectionPopup.selectedText}"
            </div>
            {/* Dictionary / Thesaurus inline section */}
            {hlState.showDict && (
              <div style={{ borderTop: '1px solid #e0e0e0', marginBottom: '8px', paddingTop: '8px', maxHeight: '250px', overflow: 'auto' }}>
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
            <textarea value={hlState.noteText} onChange={(e) => hlState.setNoteText(e.target.value)} placeholder="Add a note (optional)..."
              style={{ width: '100%', padding: '8px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '4px', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} rows={2} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button onClick={() => { hlState.setSelectionPopup(null); hlState.setShowDict(false); }} style={s.cancelBtn}>Cancel</button>
              <button onClick={saveHighlight} style={s.saveBtn}>Highlight</button>
            </div>
          </div>
        );
      })()}

      {/* Toast notification */}
      {toast && (
        <div style={s.toast}>{toast}</div>
      )}

      {/* Page bar — auto-hides */}
      <div style={{ ...s.pageBar, backgroundColor: themeColors.bg, borderTopColor: panelBorder, opacity: barsVisible ? 1 : 0, transition: 'opacity 0.3s', pointerEvents: barsVisible ? 'auto' as const : 'none' as const }}>
        <button onClick={prevPage} style={s.pageArrow}>{'\u2039'}</button>
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
            style={{ width: '50px', padding: '3px 6px', fontSize: '12px', textAlign: 'center', border: '1px solid #ccc', borderRadius: '4px', outline: 'none' }}
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
            style={{ background: 'none', border: 'none', fontSize: '12px', color: '#999', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px', minWidth: '60px', textAlign: 'center' }}
            title="Click to go to a specific page"
          >
            {currentPage} / {totalPages}
          </button>
        )}
        <button onClick={nextPage} style={s.pageArrow}>{'\u203A'}</button>
        <span style={s.pagesLeftLabel}>{Math.round(progress * 100)}% of book</span>
      </div>

      {/* TTS bar — auto-hides */}
      {pageWords.length > 0 && (
        <div className="pdf-ttsbar" style={{ ...s.ttsBar, backgroundColor: themeColors.bg, borderTopColor: panelBorder, opacity: barsVisible ? 1 : 0, transition: 'opacity 0.3s', pointerEvents: barsVisible ? 'auto' as const : 'none' as const }}>
          <button onClick={tts.handleStop} style={s.ttsButton}>{'\u25A0'}</button>
          <button onClick={tts.handlePlayPause} style={{
            ...s.ttsButton, backgroundColor: tts.isPlaying ? '#333' : '#2f95dc',
            color: '#fff', padding: '6px 20px', borderRadius: '16px',
          }}>
            {tts.isPlaying ? '\u23F8' : '\u25B6'}
          </button>
          {tts.isEditingSpeed ? (
            <input type="text" value={tts.speedInput} onChange={(e) => tts.setSpeedInput(e.target.value.replace(/[^0-9.]/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') tts.handleSpeedInputSubmit(); if (e.key === 'Escape') { tts.setIsEditingSpeed(false); tts.setSpeedInput(''); } }}
              onBlur={tts.handleSpeedInputSubmit} placeholder={String(tts.ttsSpeed)} autoFocus style={s.speedInput} />
          ) : (
            <button onClick={() => { tts.setIsEditingSpeed(true); tts.setSpeedInput(''); }} style={s.speedDisplay}>{tts.ttsSpeed}x</button>
          )}
          <input type="range" min="0.5" max="3" step="0.25" value={tts.ttsSpeed}
            onChange={(e) => {
              const newSpeed = parseFloat(e.target.value);
              tts.handleSpeedChange(newSpeed);
            }}
            style={{ width: '80px', cursor: 'pointer', accentColor: '#2f95dc' }} />
          {tts.availableVoices.length > 0 && (
            <select value={tts.selectedVoice?.name || ''} onChange={(e) => {
              const voice = tts.availableVoices.find((v) => v.name === e.target.value) || null;
              tts.setSelectedVoice(voice); tts.selectedVoiceRef.current = voice;
              if (tts.isPlaying) { const r = tts.currentWordIndex >= 0 ? tts.currentWordIndex : 0; stopSpeaking(); tts.startTTSFromWord(r, tts.ttsSpeed); }
            }} style={s.voiceSelect}>
              <option value="">Default voice</option>
              {tts.favoriteVoiceNames.length > 0 && tts.availableVoices.some((v) => tts.favoriteVoiceNames.includes(v.name)) && (
                <optgroup label="Favorites">
                  {tts.availableVoices.filter((v) => tts.favoriteVoiceNames.includes(v.name)).map((v) => (
                    <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                  ))}
                </optgroup>
              )}
              <optgroup label="All voices">
                {tts.availableVoices.filter((v) => !tts.favoriteVoiceNames.includes(v.name)).map((v) => (
                  <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                ))}
              </optgroup>
            </select>
          )}
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', position: 'relative' },
  progressTrack: { height: '3px', backgroundColor: '#e0e0e0', width: '100%', flexShrink: 0 },
  progressFill: { height: '100%', backgroundColor: '#2f95dc', transition: 'width 0.3s ease', borderRadius: '0 2px 2px 0' },
  topBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid #e8e8e8', minHeight: '44px' },
  topBarLeft: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: '80px' },
  topBarRight: { display: 'flex', alignItems: 'center', gap: '4px', minWidth: '80px', justifyContent: 'flex-end' },
  bookTitleText: { fontSize: '14px', fontWeight: 500, textAlign: 'center', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  iconButton: { background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px', color: '#555', borderRadius: '4px', fontSize: '20px' },
  mainContent: { flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', alignItems: 'center' },
  pageChevron: { background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', flexShrink: 0, transition: 'opacity 0.15s' },
  pdfContainer: { flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', position: 'relative' },
  centerOverlay: { display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: '14px', padding: '40px' },
  pageBar: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '4px 16px', borderTop: '1px solid #f0f0f0', position: 'relative' },
  pageArrow: { background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', padding: '2px 10px', color: '#999', lineHeight: 1 },
  pagesLeftLabel: { position: 'absolute', right: '16px', fontSize: '11px', color: '#999' },
  ttsBar: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '8px 16px', borderTop: '1px solid #eee' },
  ttsButton: { background: 'none', border: 'none', fontSize: '14px', cursor: 'pointer', padding: '6px 12px', color: '#555' },
  speedDisplay: { background: 'none', border: '1px solid transparent', fontSize: '12px', color: '#555', cursor: 'pointer', padding: '3px 6px', borderRadius: '4px', minWidth: '36px', textAlign: 'center' },
  speedInput: { width: '44px', padding: '3px 6px', fontSize: '12px', textAlign: 'center', border: '1px solid #ccc', borderRadius: '4px', outline: 'none' },
  voiceSelect: { padding: '4px 8px', fontSize: '12px', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: '#fff', color: '#555', maxWidth: '200px', cursor: 'pointer' },
  dropdownHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #eee', fontSize: '14px' },
  closeBtn: { background: 'none', border: 'none', fontSize: '14px', cursor: 'pointer', color: '#999', padding: '4px 8px' },
  selectionPopup: { position: 'fixed', backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '12px', padding: '0 12px 12px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', zIndex: 100, width: '280px' },
  cancelBtn: { background: 'none', border: '1px solid #ddd', borderRadius: '4px', padding: '5px 12px', fontSize: '12px', cursor: 'pointer', color: '#666' },
  saveBtn: { background: '#2f95dc', border: 'none', borderRadius: '4px', padding: '5px 12px', fontSize: '12px', cursor: 'pointer', color: '#fff' },
  actionBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', padding: 0 },
  shortcutsOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  shortcutsPanel: { width: '320px', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', overflow: 'hidden' },
  kbd: { display: 'inline-block', padding: '2px 8px', fontSize: '12px', fontFamily: 'monospace', backgroundColor: '#f0f0f0', border: '1px solid #ddd', borderRadius: '4px', minWidth: '40px', textAlign: 'center' },
  thumbnailsSidebar: { position: 'absolute', top: '50px', left: '12px', width: '200px', maxHeight: 'calc(100vh - 140px)', backgroundColor: '#fafafa', border: '1px solid #e8e8e8', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 50, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  thumbnailsGrid: { overflow: 'auto', padding: '8px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' },
  thumbnailItem: { background: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  thumbnailImg: { width: '100%', height: 'auto', borderRadius: '2px', display: 'block' },
  thumbnailPlaceholder: { width: '100%', aspectRatio: '0.7', backgroundColor: '#f0f0f0', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  dragHandle: { cursor: 'grab', padding: '6px 0 4px 0', display: 'flex', justifyContent: 'center', userSelect: 'none' as const },
  dragDots: { width: '32px', height: '4px', borderRadius: '2px', backgroundColor: '#ccc' },
  renderingOverlay: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10 },
  spinner: { width: '32px', height: '32px', border: '3px solid #e0e0e0', borderTopColor: '#2f95dc', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  toast: { position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)', backgroundColor: 'rgba(0,0,0,0.75)', color: '#fff', padding: '8px 20px', borderRadius: '20px', fontSize: '13px', fontWeight: 500, zIndex: 200, pointerEvents: 'none', animation: 'fadeInOut 2s ease' },
};
