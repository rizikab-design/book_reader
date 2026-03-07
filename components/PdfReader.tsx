/**
 * PDF Reader Component — Apple Books-style layout
 *
 * Full-featured PDF reader with:
 * - Canvas rendering with text layer
 * - TTS with word highlighting
 * - Themes, bookmarks, highlights/notes, search
 * - Keyboard shortcuts
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { router } from 'expo-router';
import {
  speakText,
  stopSpeaking,
  pauseSpeaking,
  resumeSpeaking,
  getAvailableVoices,
} from '@/lib/tts-engine';

type HighlightColor = 'yellow' | 'blue' | 'green' | 'pink';

const HIGHLIGHT_COLORS: Record<HighlightColor, string> = {
  yellow: '#FFEB3B',
  blue: '#90CAF9',
  green: '#A5D6A7',
  pink: '#F48FB1',
};

interface PdfHighlight {
  id: number;
  selectedText: string;
  note: string;
  color: HighlightColor;
  page: number;
  createdAt: string;
}

type ThemeName = 'original' | 'quiet' | 'paper' | 'bold' | 'calm' | 'focus';

const themes: Record<ThemeName, { label: string; bg: string; text: string; fontWeight?: string; fontFamily?: string }> = {
  original: { label: 'Original', bg: '#ffffff', text: '#000000' },
  quiet: { label: 'Quiet', bg: '#3e3e3e', text: '#d4d4d4' },
  paper: { label: 'Paper', bg: '#e8e4dc', text: '#4a4a4a' },
  bold: { label: 'Bold', bg: '#ffffff', text: '#000000', fontWeight: 'bold' },
  calm: { label: 'Calm', bg: '#f0e6c8', text: '#5a4e3a', fontFamily: 'Georgia, serif' },
  focus: { label: 'Focus', bg: '#faf5e4', text: '#3a3a2a', fontFamily: 'Georgia, serif' },
};

interface PdfReaderProps {
  bookUrl: string;
  bookId: string;
  bookTitle: string;
}

export default function PdfReader({ bookUrl, bookId, bookTitle }: PdfReaderProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const pdfDocRef = useRef<any>(null);

  const storageKey = (key: string) => `reader-${bookId}-${key}`;
  function loadStored<T>(key: string, fallback: T): T {
    try { const v = localStorage.getItem(storageKey(key)); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  }

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(() => loadStored<number>('pdfScale', 1.5));

  // TTS
  const [isPlaying, setIsPlaying] = useState(false);
  const [ttsSpeed, setTtsSpeed] = useState(() => loadStored<number>('ttsSpeed', 1));
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [pageWords, setPageWords] = useState<string[]>([]);
  const wordsRef = useRef<string[]>([]);
  const resumeWordIndexRef = useRef(-1);
  const ttsGenRef = useRef(0);
  const isPlayingRef = useRef(false);
  const ttsSpeedRef = useRef(ttsSpeed);
  const currentWordIndexRef = useRef(-1);

  // Voice
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const selectedVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const [favoriteVoiceNames, setFavoriteVoiceNames] = useState<string[]>([]);

  // Speed editing
  const [isEditingSpeed, setIsEditingSpeed] = useState(false);
  const [speedInput, setSpeedInput] = useState('');

  // Theme
  const [activeTheme, setActiveTheme] = useState<ThemeName>(() => {
    try { const v = localStorage.getItem('reader-global-theme'); return v ? JSON.parse(v) : 'original'; } catch { return 'original' as ThemeName; }
  });
  const [fontSize, setFontSize] = useState(() => {
    try { const v = localStorage.getItem('reader-global-fontSize'); return v ? JSON.parse(v) : 100; } catch { return 100; }
  });
  const [showThemes, setShowThemes] = useState(false);

  // Bookmarks
  const [bookmarks, setBookmarks] = useState<{ id: number; page: number; label: string }[]>(() => loadStored('bookmarks', []));
  const [showBookmarks, setShowBookmarks] = useState(false);
  const bookmarkIdRef = useRef(loadStored<number>('bookmarkNextId', 0));
  const [editingBookmarkId, setEditingBookmarkId] = useState<number | null>(null);
  const [bookmarkTitleInput, setBookmarkTitleInput] = useState('');

  // Highlights & Notes
  const [highlights, setHighlights] = useState<PdfHighlight[]>(() => loadStored('highlights', []));
  const [showHighlights, setShowHighlights] = useState(false);
  const highlightIdRef = useRef(loadStored<number>('highlightNextId', 0));
  const [selectionPopup, setSelectionPopup] = useState<{ x: number; y: number; text: string } | null>(null);
  const [noteText, setNoteText] = useState('');
  const [selectedColor, setSelectedColor] = useState<HighlightColor>('yellow');
  const [editingHighlightId, setEditingHighlightId] = useState<number | null>(null);
  const [editNoteText, setEditNoteText] = useState('');

  // Search
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ page: number; text: string }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Keyboard shortcuts
  const [showShortcuts, setShowShortcuts] = useState(false);

  // TOC
  const [tocItems, setTocItems] = useState<{ title: string; page: number }[]>([]);
  const [showToc, setShowToc] = useState(false);

  // Page thumbnails
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [thumbsLoaded, setThumbsLoaded] = useState(0);
  const thumbnailsContainerRef = useRef<HTMLDivElement | null>(null);
  const thumbnailCacheRef = useRef<Map<number, string>>(new Map());

  // Sync refs
  useEffect(() => { ttsSpeedRef.current = ttsSpeed; }, [ttsSpeed]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { currentWordIndexRef.current = currentWordIndex; }, [currentWordIndex]);

  // Persist
  useEffect(() => { localStorage.setItem(storageKey('ttsSpeed'), JSON.stringify(ttsSpeed)); }, [ttsSpeed]);
  useEffect(() => { localStorage.setItem(storageKey('bookmarks'), JSON.stringify(bookmarks)); localStorage.setItem(storageKey('bookmarkNextId'), JSON.stringify(bookmarkIdRef.current)); }, [bookmarks]);
  useEffect(() => { localStorage.setItem(storageKey('highlights'), JSON.stringify(highlights)); localStorage.setItem(storageKey('highlightNextId'), JSON.stringify(highlightIdRef.current)); }, [highlights]);
  useEffect(() => { localStorage.setItem('reader-global-theme', JSON.stringify(activeTheme)); }, [activeTheme]);
  useEffect(() => { localStorage.setItem('reader-global-fontSize', JSON.stringify(fontSize)); }, [fontSize]);
  useEffect(() => { localStorage.setItem(storageKey('page'), String(currentPage)); }, [currentPage]);
  useEffect(() => { localStorage.setItem(storageKey('pdfScale'), JSON.stringify(scale)); }, [scale]);

  // Load voices
  useEffect(() => {
    try { const stored = localStorage.getItem('tts-favorite-voices'); if (stored) setFavoriteVoiceNames(JSON.parse(stored)); } catch {}
    getAvailableVoices().then((voices) => {
      const english = voices.filter((v) => v.lang.startsWith('en'));
      setAvailableVoices(english);
      try {
        const preferredName = localStorage.getItem('tts-preferred-voice');
        if (preferredName) {
          const voice = english.find((v) => v.name === preferredName);
          if (voice) { setSelectedVoice(voice); selectedVoiceRef.current = voice; }
        }
      } catch {}
    });
  }, []);

  // Load PDF
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
              } catch {}
            }
          }
          setTocItems(toc);
        }
      } catch {}

      // Restore saved page
      let startPage = 1;
      try { const saved = localStorage.getItem(storageKey('page')); if (saved) startPage = parseInt(saved, 10); } catch {}
      if (startPage > pdf.numPages || startPage < 1) startPage = 1;

      setCurrentPage(startPage);
      setIsLoading(false);
    } catch (e: any) {
      setError(e.message || 'Failed to load PDF');
      setIsLoading(false);
    }
  }

  // Render a page thumbnail and cache as data URL
  async function renderThumbnail(pageNum: number): Promise<string> {
    if (thumbnailCacheRef.current.has(pageNum)) return thumbnailCacheRef.current.get(pageNum)!;
    const pdf = pdfDocRef.current;
    if (!pdf) return '';
    try {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 0.3 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const url = canvas.toDataURL('image/jpeg', 0.6);
      thumbnailCacheRef.current.set(pageNum, url);
      return url;
    } catch { return ''; }
  }

  // Load visible thumbnails when panel opens
  useEffect(() => {
    if (!showThumbnails || !pdfDocRef.current) return;
    let cancelled = false;
    async function loadThumbnails() {
      for (let i = 1; i <= totalPages; i++) {
        if (cancelled) break;
        await renderThumbnail(i);
        if (i % 5 === 0) setThumbsLoaded(i);
      }
      if (!cancelled) setThumbsLoaded(totalPages);
    }
    loadThumbnails();
    return () => { cancelled = true; };
  }, [showThumbnails, totalPages]);

  // Render page
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

      // Build a selectable text layer on top of the canvas
      const textContent = await page.getTextContent();
      const textLayer = textLayerRef.current;
      if (textLayer) {
        textLayer.innerHTML = '';
        textLayer.style.width = `${viewport.width}px`;
        textLayer.style.height = `${viewport.height}px`;

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

      // Extract text for TTS
      const fullText = textContent.items.map((item: any) => item.str).join(' ').replace(/\s+/g, ' ').trim();
      const words = fullText.split(/\s+/).filter((w: string) => w.length > 0);
      setPageWords(words);
      wordsRef.current = words;
      resumeWordIndexRef.current = -1;
      setCurrentWordIndex(-1);
    } catch (e) {
      console.warn('Page render error:', e);
    }
    setIsRendering(false);
  }, [scale]);

  useEffect(() => {
    if (!isLoading && pdfDocRef.current) {
      stopSpeaking();
      setIsPlaying(false);
      renderPage(currentPage);
    }
  }, [currentPage, isLoading, renderPage]);

  // TTS functions
  function startTTSFromWord(fromWordIndex: number, rate: number) {
    const words = wordsRef.current;
    if (words.length === 0) return;
    const textFromWord = words.slice(fromWordIndex).join(' ');
    if (!textFromWord) return;

    const gen = ++ttsGenRef.current;
    setIsPlaying(true);
    speakText(textFromWord, rate, {
      onEnd: () => {
        if (ttsGenRef.current !== gen) return;
        setIsPlaying(false);
        setCurrentWordIndex(-1);
        resumeWordIndexRef.current = -1;
      },
      onWord: (wordIndex: number) => {
        if (ttsGenRef.current !== gen) return;
        setCurrentWordIndex(wordIndex + fromWordIndex);
      },
      onError: () => {
        if (ttsGenRef.current !== gen) return;
        setIsPlaying(false);
      },
    }, selectedVoiceRef.current);
  }

  function handlePlayPause() {
    if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      pauseSpeaking();
      setIsPlaying(false);
    } else if (window.speechSynthesis.paused) {
      resumeSpeaking();
      setIsPlaying(true);
    } else {
      const startFrom = resumeWordIndexRef.current >= 0 ? resumeWordIndexRef.current : 0;
      setCurrentWordIndex(startFrom);
      startTTSFromWord(startFrom, ttsSpeed);
    }
  }

  const handlePlayPauseRef = useRef(handlePlayPause);
  handlePlayPauseRef.current = handlePlayPause;

  function handleStop() {
    const idx = currentWordIndexRef.current;
    resumeWordIndexRef.current = idx >= 0 ? idx : -1;
    stopSpeaking();
    setIsPlaying(false);
    setCurrentWordIndex(-1);
  }

  function handleSpeedInputSubmit() {
    const val = parseFloat(speedInput);
    if (!isNaN(val) && val >= 0.5 && val <= 3) {
      setTtsSpeed(val);
      if (isPlaying) {
        const resumeFrom = currentWordIndex >= 0 ? currentWordIndex : 0;
        stopSpeaking();
        startTTSFromWord(resumeFrom, val);
      }
    }
    setIsEditingSpeed(false);
    setSpeedInput('');
  }

  // TTS word highlighting via a floating overlay
  const [wordHighlightPos, setWordHighlightPos] = useState<{ text: string } | null>(null);
  useEffect(() => {
    if (currentWordIndex >= 0 && currentWordIndex < pageWords.length) {
      setWordHighlightPos({ text: pageWords[currentWordIndex] });
    } else {
      setWordHighlightPos(null);
    }
  }, [currentWordIndex, pageWords]);

  // Bookmarks
  function toggleBookmark() {
    const existing = bookmarks.find((b) => b.page === currentPage);
    if (existing) {
      setBookmarks((prev) => prev.filter((b) => b.page !== currentPage));
    } else {
      const newId = ++bookmarkIdRef.current;
      setBookmarks((prev) => [...prev, { id: newId, page: currentPage, label: `Page ${currentPage}` }]);
      setShowBookmarks(true);
      setEditingBookmarkId(newId);
      setBookmarkTitleInput('');
    }
  }

  function saveBookmarkTitle(id: number) {
    if (bookmarkTitleInput.trim()) {
      setBookmarks((prev) => prev.map((b) => b.id === id ? { ...b, label: bookmarkTitleInput.trim() } : b));
    }
    setEditingBookmarkId(null);
    setBookmarkTitleInput('');
  }

  // Highlights
  function saveHighlight() {
    if (!selectionPopup) return;
    const newId = ++highlightIdRef.current;
    const h: PdfHighlight = {
      id: newId,
      selectedText: selectionPopup.text,
      note: noteText,
      color: selectedColor,
      page: currentPage,
      createdAt: new Date().toLocaleString(),
    };
    setHighlights((prev) => [...prev, h]);
    setSelectionPopup(null);
    setNoteText('');
  }

  function exportHighlights() {
    if (highlights.length === 0) return;
    const lines = highlights.map((h, i) => {
      let line = `${i + 1}. "${h.selectedText}"`;
      if (h.note) line += `\n   Note: ${h.note}`;
      line += `\n   Color: ${h.color} | Page: ${h.page} | ${h.createdAt}`;
      return line;
    });
    const text = `Highlights & Notes\n${'='.repeat(40)}\n\n${lines.join('\n\n')}`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `highlights-${bookId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Text selection handler — only trigger on actual text selection, not button clicks
  useEffect(() => {
    function handleMouseUp(e: MouseEvent) {
      // Ignore clicks on buttons, inputs, dropdowns, popups
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('select') || target.closest('input') || target.closest('textarea') || target.closest('[data-popup]')) return;

      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (text && text.length > 2) {
        const popupX = Math.min(e.clientX, window.innerWidth - 160);
        const popupY = Math.min(e.clientY + 10, window.innerHeight - 300);
        setSelectionPopup({ x: popupX, y: popupY, text });
      }
    }
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  // Search
  async function handleSearch(query: string) {
    if (!pdfDocRef.current || !query.trim()) { setSearchResults([]); return; }
    setIsSearching(true);
    const results: { page: number; text: string }[] = [];
    const pdf = pdfDocRef.current;
    const lowerQuery = query.toLowerCase();
    for (let i = 1; i <= pdf.numPages && results.length < 50; i++) {
      try {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        if (pageText.toLowerCase().includes(lowerQuery)) {
          const idx = pageText.toLowerCase().indexOf(lowerQuery);
          const start = Math.max(0, idx - 30);
          const end = Math.min(pageText.length, idx + query.length + 30);
          const excerpt = (start > 0 ? '...' : '') + pageText.slice(start, end) + (end < pageText.length ? '...' : '');
          results.push({ page: i, text: excerpt });
        }
      } catch {}
    }
    setSearchResults(results);
    setIsSearching(false);
  }

  // Page nav — use refs to avoid stale closures in keyboard handler
  const totalPagesRef = useRef(totalPages);
  useEffect(() => { totalPagesRef.current = totalPages; }, [totalPages]);

  function nextPage() { setCurrentPage((p) => p < totalPagesRef.current ? p + 1 : p); }
  function prevPage() { setCurrentPage((p) => p > 1 ? p - 1 : p); }

  const nextPageRef = useRef(nextPage);
  const prevPageRef = useRef(prevPage);
  nextPageRef.current = nextPage;
  prevPageRef.current = prevPage;

  // Theme
  function setTheme(name: ThemeName) { setActiveTheme(name); }
  function changeFontSize(delta: number) {
    const newSize = Math.max(50, Math.min(200, fontSize + delta));
    setFontSize(newSize);
    setScale(1.5 * (newSize / 100));
  }

  // Ctrl+scroll zoom
  useEffect(() => {
    function handleWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setScale((prev) => {
          const next = Math.max(0.5, Math.min(4, prev + (e.deltaY < 0 ? 0.1 : -0.1)));
          return Math.round(next * 100) / 100;
        });
      }
    }
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch((v) => { if (!v) setTimeout(() => searchInputRef.current?.focus(), 50); return !v; });
      } else if (e.key === ' ') { e.preventDefault(); handlePlayPauseRef.current(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextPageRef.current();
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') prevPageRef.current();
      else if (e.key === '?') setShowShortcuts((v) => !v);
      else if (e.key === 'Escape') { setSelectionPopup(null); setShowSearch(false); setShowShortcuts(false); }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Cleanup TTS
  useEffect(() => { return () => stopSpeaking(); }, []);

  const themeColors = themes[activeTheme];
  const panelTheme: React.CSSProperties = {
    backgroundColor: themeColors.bg, color: themeColors.text,
    borderColor: activeTheme === 'quiet' ? '#555' : '#e8e8e8',
  };
  const panelBorder = activeTheme === 'quiet' ? '#555' : '#f0f0f0';
  const progress = totalPages > 0 ? currentPage / totalPages : 0;

  // Close all other panels helper
  function closeAllPanels() { setShowToc(false); setShowBookmarks(false); setShowHighlights(false); setShowThemes(false); setShowSearch(false); setShowThumbnails(false); }

  return (
    <div style={{ ...s.container, backgroundColor: themeColors.bg }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .textLayer { opacity: 0.25; line-height: 1; }
        .textLayer span { position: absolute; white-space: pre; color: transparent; }
        .textLayer ::selection { background: rgba(0, 100, 200, 0.3); }
      `}</style>
      {/* Progress bar */}
      <div style={s.progressTrack}>
        <div style={{ ...s.progressFill, width: `${Math.round(progress * 100)}%` }} />
      </div>

      {/* Top bar */}
      <div style={{ ...s.topBar, backgroundColor: themeColors.bg, borderBottomColor: panelBorder }}>
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
          <button onClick={() => { const opening = !showHighlights; closeAllPanels(); if (opening) setShowHighlights(true); }}
            style={{ ...s.iconButton, color: showHighlights ? '#2f95dc' : '#555' }} title={`Highlights (${highlights.length})`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="7" y1="8" x2="17" y2="8" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="7" y1="16" x2="13" y2="16" />
            </svg>
          </button>
        </div>

        <span style={{ ...s.bookTitleText, color: themeColors.text }}>{bookTitle}</span>

        <div style={s.topBarRight}>
          {/* Search */}
          <button onClick={() => { const opening = !showSearch; closeAllPanels(); if (opening) { setShowSearch(true); setTimeout(() => searchInputRef.current?.focus(), 50); } }}
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
          <button onClick={() => { const opening = !showBookmarks; closeAllPanels(); if (opening) setShowBookmarks(true); }}
            style={{ ...s.iconButton, color: showBookmarks ? '#2f95dc' : (bookmarks.some((b) => b.page === currentPage) ? '#2f95dc' : '#555') }} title="Bookmarks">
            <svg width="20" height="20" viewBox="0 0 24 24" fill={bookmarks.some((b) => b.page === currentPage) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
              <path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-4-6 4V4z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Themes dropdown */}
      {showThemes && (
        <div style={{ ...s.dropdown, right: '50px', ...panelTheme }} data-popup>
          <div style={s.dropdownHeader}>
            <strong>Themes & Settings</strong>
            <button onClick={() => setShowThemes(false)} style={s.closeBtn}>{'\u2715'}</button>
          </div>
          <div style={s.fontSizeRow}>
            <button onClick={() => changeFontSize(-10)} style={s.fontSizeButton}><span style={{ fontSize: '14px' }}>A</span></button>
            <span style={{ fontSize: '13px', color: '#666', minWidth: '40px', textAlign: 'center' }}>{fontSize}%</span>
            <button onClick={() => changeFontSize(10)} style={s.fontSizeButton}><span style={{ fontSize: '20px' }}>A</span></button>
          </div>
          <div style={s.themeGrid}>
            {(Object.keys(themes) as ThemeName[]).map((key) => {
              const t = themes[key];
              return (
                <button key={key} onClick={() => setTheme(key)} style={{
                  ...s.themeCard, backgroundColor: t.bg, color: t.text,
                  border: activeTheme === key ? '2px solid #2f95dc' : '2px solid #e0e0e0',
                  fontWeight: t.fontWeight === 'bold' ? 700 : 400, fontFamily: t.fontFamily || 'inherit',
                }}>
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
        <div style={{ ...s.dropdown, right: '100px', ...panelTheme }}>
          <div style={s.dropdownHeader}>
            <strong>Search</strong>
            <button onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }} style={s.closeBtn}>{'\u2715'}</button>
          </div>
          <div style={{ padding: '8px 12px' }}>
            <input ref={searchInputRef} type="text" value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(searchQuery); if (e.key === 'Escape') { setShowSearch(false); } }}
              placeholder="Search in book..." style={s.searchInput} />
          </div>
          {isSearching && <div style={{ padding: '12px', fontSize: '13px', color: '#999', textAlign: 'center' }}>Searching...</div>}
          {!isSearching && searchResults.length > 0 && (
            <div style={{ overflow: 'auto', maxHeight: '350px' }}>
              {searchResults.map((r, i) => (
                <button key={i} onClick={() => setCurrentPage(r.page)} style={s.tocItem}>
                  <div style={{ fontSize: '12px' }}>{r.text}</div>
                  <div style={{ fontSize: '10px', color: '#999', marginTop: '2px' }}>Page {r.page}</div>
                </button>
              ))}
            </div>
          )}
          {!isSearching && searchQuery && searchResults.length === 0 && (
            <div style={{ padding: '12px', fontSize: '13px', color: '#999', textAlign: 'center' }}>No results found</div>
          )}
        </div>
      )}

      {/* Bookmarks dropdown */}
      {showBookmarks && (
        <div style={{ ...s.dropdown, right: '12px', width: '260px', ...panelTheme }}>
          <div style={s.dropdownHeader}>
            <strong>Bookmarks</strong>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <button onClick={toggleBookmark} style={{ ...s.closeBtn, color: bookmarks.some((b) => b.page === currentPage) ? '#2f95dc' : undefined }} title="Bookmark this page">
                <svg width="14" height="14" viewBox="0 0 24 24" fill={bookmarks.some((b) => b.page === currentPage) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
                  <path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-4-6 4V4z" />
                </svg>
              </button>
              <button onClick={() => setShowBookmarks(false)} style={s.closeBtn}>{'\u2715'}</button>
            </div>
          </div>
          {bookmarks.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#999', fontSize: '13px' }}>
              <div style={{ fontWeight: 500, marginBottom: '4px' }}>No Bookmarks</div>
              <div style={{ fontSize: '12px', opacity: 0.6 }}>Click the bookmark icon above to add one.</div>
            </div>
          ) : (
            <div style={{ overflow: 'auto', maxHeight: '300px' }}>
              {bookmarks.sort((a, b) => a.page - b.page).map((b) => (
                <div key={b.id} style={{ display: 'flex', borderBottom: `1px solid ${panelBorder}`, alignItems: 'center' }}>
                  {editingBookmarkId === b.id ? (
                    <div style={{ flex: 1, padding: '8px 12px' }}>
                      <input type="text" value={bookmarkTitleInput} onChange={(e) => setBookmarkTitleInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveBookmarkTitle(b.id); if (e.key === 'Escape') setEditingBookmarkId(null); }}
                        onBlur={() => saveBookmarkTitle(b.id)} placeholder="Bookmark title..." autoFocus
                        style={{ width: '100%', padding: '4px 8px', fontSize: '13px', border: '1px solid #ccc', borderRadius: '4px', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                  ) : (
                    <button onClick={() => { setCurrentPage(b.page); setShowBookmarks(false); }}
                      style={{ flex: 1, background: 'none', border: 'none', textAlign: 'left', padding: '10px 16px', fontSize: '13px', color: themeColors.text, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{b.label}</span>
                      <span style={{ fontSize: '11px', color: '#999' }}>p. {b.page}</span>
                    </button>
                  )}
                  <button onClick={() => { setEditingBookmarkId(b.id); setBookmarkTitleInput(b.label); }} style={s.closeBtn} title="Edit">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  </button>
                  <button onClick={() => setBookmarks((prev) => prev.filter((bk) => bk.id !== b.id))} style={s.closeBtn} title="Delete">{'\u2715'}</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TOC dropdown */}
      {showToc && (
        <div style={{ ...s.dropdown, left: '12px', ...panelTheme }}>
          <div style={s.dropdownHeader}>
            <strong>Contents</strong>
            <button onClick={() => setShowToc(false)} style={s.closeBtn}>{'\u2715'}</button>
          </div>
          <div style={{ overflow: 'auto', maxHeight: '400px' }}>
            {tocItems.map((item, i) => (
              <button key={i} onClick={() => { setCurrentPage(item.page); setShowToc(false); }} style={s.tocItem}>
                <span>{item.title}</span>
                <span style={{ fontSize: '11px', color: '#999' }}>p. {item.page}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Highlights dropdown */}
      {showHighlights && (
        <div style={{ ...s.dropdown, left: '12px', width: '300px', maxHeight: '500px', ...panelTheme }}>
          <div style={s.dropdownHeader}>
            <strong>Highlights & Notes</strong>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              {highlights.length > 0 && (
                <button onClick={exportHighlights} style={s.closeBtn} title="Export highlights">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </button>
              )}
              <button onClick={() => setShowHighlights(false)} style={s.closeBtn}>{'\u2715'}</button>
            </div>
          </div>
          {highlights.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#999', fontSize: '13px' }}>
              <div style={{ fontWeight: 500, marginBottom: '4px' }}>No Highlights or Notes</div>
              <div style={{ fontSize: '12px', opacity: 0.6 }}>Select text to highlight or add notes.</div>
            </div>
          ) : (
            <div style={{ overflow: 'auto', maxHeight: '400px' }}>
              {highlights.map((h) => (
                <div key={h.id} style={{ borderBottom: `1px solid ${panelBorder}` }}>
                  <button onClick={() => setCurrentPage(h.page)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '10px 12px 4px 12px', fontSize: '13px', color: themeColors.text, cursor: 'pointer', lineHeight: '1.4' }}>
                    <span style={{ borderLeft: `3px solid ${HIGHLIGHT_COLORS[h.color]}`, paddingLeft: '8px', display: 'block' }}>
                      "{h.selectedText.length > 80 ? h.selectedText.slice(0, 80) + '...' : h.selectedText}"
                    </span>
                  </button>
                  {h.note && <div style={{ padding: '2px 12px 2px 23px', fontSize: '12px', color: '#666', fontStyle: 'italic' }}>{h.note}</div>}
                  <div style={{ display: 'flex', gap: '8px', padding: '4px 12px 8px 23px', fontSize: '11px', color: '#999' }}>
                    <span>Page {h.page}</span>
                    <span>{h.createdAt}</span>
                    {editingHighlightId === h.id ? (
                      <span style={{ display: 'flex', gap: '4px' }}>
                        <input type="text" value={editNoteText} onChange={(e) => setEditNoteText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { setHighlights((prev) => prev.map((hl) => hl.id === h.id ? { ...hl, note: editNoteText } : hl)); setEditingHighlightId(null); } }}
                          style={{ width: '120px', fontSize: '11px', padding: '2px 4px', border: '1px solid #ccc', borderRadius: '3px' }} autoFocus />
                      </span>
                    ) : (
                      <>
                        <button onClick={() => { setEditingHighlightId(h.id); setEditNoteText(h.note); }} style={{ ...s.actionBtn, color: '#2f95dc' }}>Edit</button>
                        <button onClick={() => setHighlights((prev) => prev.filter((hl) => hl.id !== h.id))} style={{ ...s.actionBtn, color: '#e55' }}>Delete</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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
                <button key={pageNum} onClick={() => { setCurrentPage(pageNum); setShowThumbnails(false); }}
                  style={{ ...s.thumbnailItem, border: pageNum === currentPage ? '2px solid #2f95dc' : '2px solid transparent' }}>
                  {thumbUrl ? (
                    <img src={thumbUrl} alt={`Page ${pageNum}`} style={s.thumbnailImg} />
                  ) : (
                    <div style={s.thumbnailPlaceholder}>
                      <span style={{ fontSize: '11px', color: '#999' }}>...</span>
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
        <button onClick={prevPage} style={{ ...s.pageChevron, opacity: currentPage > 1 ? 0.3 : 0.1 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={themeColors.text} strokeWidth="1.5"><polyline points="15 18 9 12 15 6" /></svg>
        </button>

        <div style={s.pdfContainer}>
          {isLoading && <div style={s.centerOverlay}>Loading PDF...</div>}
          {error && <div style={s.centerOverlay}><p style={{ color: 'red' }}>{error}</p></div>}
          {isRendering && (
            <div style={s.renderingOverlay}>
              <div style={s.spinner} />
            </div>
          )}
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <canvas ref={canvasRef} style={{ display: 'block', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', opacity: isRendering ? 0.4 : 1, transition: 'opacity 0.2s' }} />
            <div ref={textLayerRef} className="textLayer" style={{ position: 'absolute', top: 0, left: 0, overflow: 'hidden' }} />
          </div>
          {/* Current TTS word indicator */}
          {wordHighlightPos && (
            <div style={s.ttsWordBanner}>
              {wordHighlightPos.text}
            </div>
          )}
        </div>

        <button onClick={nextPage} style={{ ...s.pageChevron, opacity: currentPage < totalPages ? 0.3 : 0.1 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={themeColors.text} strokeWidth="1.5"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>

      {/* Selection popup */}
      {selectionPopup && (
        <div data-popup style={{ ...s.selectionPopup, left: selectionPopup.x, top: selectionPopup.y, ...panelTheme }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', marginTop: '12px' }}>
            {(Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).map((color) => (
              <button key={color} onClick={() => setSelectedColor(color)} style={{
                width: '24px', height: '24px', borderRadius: '50%', backgroundColor: HIGHLIGHT_COLORS[color],
                border: selectedColor === color ? '2px solid #333' : '2px solid transparent', cursor: 'pointer',
              }} />
            ))}
          </div>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px', fontStyle: 'italic', lineHeight: '1.4' }}>
            "{selectionPopup.text.length > 60 ? selectionPopup.text.slice(0, 60) + '...' : selectionPopup.text}"
          </div>
          <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add a note (optional)..."
            style={{ width: '100%', padding: '8px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '4px', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} rows={2} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <button onClick={() => setSelectionPopup(null)} style={s.cancelBtn}>Cancel</button>
            <button onClick={saveHighlight} style={s.saveBtn}>Highlight</button>
          </div>
        </div>
      )}

      {/* Page bar */}
      <div style={{ ...s.pageBar, backgroundColor: themeColors.bg, borderTopColor: panelBorder }}>
        <button onClick={prevPage} style={s.pageArrow}>{'\u2039'}</button>
        <button onClick={() => {
          const input = prompt(`Go to page (1-${totalPages}):`, String(currentPage));
          if (input) { const p = parseInt(input, 10); if (p >= 1 && p <= totalPages) setCurrentPage(p); }
        }} style={{ background: 'none', border: 'none', fontSize: '12px', color: '#999', cursor: 'pointer', padding: '4px 8px' }}
          title="Click to go to a specific page">
          {currentPage} / {totalPages}
        </button>
        <button onClick={nextPage} style={s.pageArrow}>{'\u203A'}</button>
        <span style={s.pagesLeftLabel}>{Math.round(progress * 100)}% of book</span>
      </div>

      {/* TTS bar */}
      {pageWords.length > 0 && (
        <div style={{ ...s.ttsBar, backgroundColor: themeColors.bg, borderTopColor: panelBorder }}>
          <button onClick={handleStop} style={s.ttsButton}>{'\u25A0'}</button>
          <button onClick={handlePlayPause} style={{
            ...s.ttsButton, backgroundColor: isPlaying ? '#333' : '#2f95dc',
            color: '#fff', padding: '6px 20px', borderRadius: '16px',
          }}>
            {isPlaying ? '\u23F8' : '\u25B6'}
          </button>
          {isEditingSpeed ? (
            <input type="text" value={speedInput} onChange={(e) => setSpeedInput(e.target.value.replace(/[^0-9.]/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSpeedInputSubmit(); if (e.key === 'Escape') { setIsEditingSpeed(false); setSpeedInput(''); } }}
              onBlur={handleSpeedInputSubmit} placeholder={String(ttsSpeed)} autoFocus style={s.speedInput} />
          ) : (
            <button onClick={() => { setIsEditingSpeed(true); setSpeedInput(''); }} style={s.speedDisplay}>{ttsSpeed}x</button>
          )}
          <input type="range" min="0.5" max="3" step="0.25" value={ttsSpeed}
            onChange={(e) => {
              const newSpeed = parseFloat(e.target.value);
              setTtsSpeed(newSpeed);
              if (isPlaying) { const r = currentWordIndex >= 0 ? currentWordIndex : 0; stopSpeaking(); startTTSFromWord(r, newSpeed); }
            }}
            style={{ width: '80px', cursor: 'pointer', accentColor: '#2f95dc' }} />
          {availableVoices.length > 0 && (
            <select value={selectedVoice?.name || ''} onChange={(e) => {
              const voice = availableVoices.find((v) => v.name === e.target.value) || null;
              setSelectedVoice(voice); selectedVoiceRef.current = voice;
              if (isPlaying) { const r = currentWordIndex >= 0 ? currentWordIndex : 0; stopSpeaking(); startTTSFromWord(r, ttsSpeed); }
            }} style={s.voiceSelect}>
              <option value="">Default voice</option>
              {favoriteVoiceNames.length > 0 && availableVoices.some((v) => favoriteVoiceNames.includes(v.name)) && (
                <optgroup label="Favorites">
                  {availableVoices.filter((v) => favoriteVoiceNames.includes(v.name)).map((v) => (
                    <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                  ))}
                </optgroup>
              )}
              <optgroup label="All voices">
                {availableVoices.filter((v) => !favoriteVoiceNames.includes(v.name)).map((v) => (
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
  ttsWordBanner: { position: 'fixed', bottom: '120px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#FFEB3B', color: '#000', padding: '6px 16px', borderRadius: '20px', fontSize: '16px', fontWeight: 600, boxShadow: '0 2px 8px rgba(0,0,0,0.2)', zIndex: 60, pointerEvents: 'none' },
  pageBar: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '4px 16px', borderTop: '1px solid #f0f0f0', position: 'relative' },
  pageArrow: { background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', padding: '2px 10px', color: '#999', lineHeight: 1 },
  pagesLeftLabel: { position: 'absolute', right: '16px', fontSize: '11px', color: '#999' },
  ttsBar: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '8px 16px', borderTop: '1px solid #eee' },
  ttsButton: { background: 'none', border: 'none', fontSize: '14px', cursor: 'pointer', padding: '6px 12px', color: '#555' },
  speedDisplay: { background: 'none', border: '1px solid transparent', fontSize: '12px', color: '#555', cursor: 'pointer', padding: '3px 6px', borderRadius: '4px', minWidth: '36px', textAlign: 'center' },
  speedInput: { width: '44px', padding: '3px 6px', fontSize: '12px', textAlign: 'center', border: '1px solid #ccc', borderRadius: '4px', outline: 'none' },
  voiceSelect: { padding: '4px 8px', fontSize: '12px', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: '#fff', color: '#555', maxWidth: '200px', cursor: 'pointer' },
  dropdown: { position: 'absolute', top: '50px', width: '280px', maxHeight: '450px', backgroundColor: '#fafafa', border: '1px solid #e8e8e8', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 50, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  dropdownHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #eee', fontSize: '14px' },
  closeBtn: { background: 'none', border: 'none', fontSize: '14px', cursor: 'pointer', color: '#999', padding: '4px 8px' },
  tocItem: { display: 'flex', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', borderBottom: '1px solid #f0f0f0', padding: '10px 16px', fontSize: '13px', color: '#333', cursor: 'pointer', textAlign: 'left', lineHeight: '1.4' },
  fontSizeRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '12px 16px', borderBottom: '1px solid #eee' },
  fontSizeButton: { background: 'none', border: '1px solid #ddd', borderRadius: '8px', width: '44px', height: '36px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333' },
  themeGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', padding: '16px' },
  themeCard: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '14px 8px', borderRadius: '12px', cursor: 'pointer', minHeight: '70px', transition: 'border-color 0.15s' },
  searchInput: { width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '6px', outline: 'none', boxSizing: 'border-box' },
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
  renderingOverlay: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10 },
  spinner: { width: '32px', height: '32px', border: '3px solid #e0e0e0', borderTopColor: '#2f95dc', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
};
