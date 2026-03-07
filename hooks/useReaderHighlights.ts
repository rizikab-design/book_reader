import { useState, useRef, useEffect } from 'react';
import { usePersistedState, bookKey } from '@/hooks/usePersistedState';
import { ReaderHighlight, HighlightColor, SelectionPopupState } from '@/hooks/reader-types';
import { lookupWord, DictionaryEntry } from '@/lib/dictionary';
import { getAccessToken, exportCornellNotes } from '@/lib/google-drive';

interface UseReaderHighlightsOptions {
  bookId: string;
  bookTitle: string;
  showToast: (msg: string) => void;
}

export function useReaderHighlights({ bookId, bookTitle, showToast }: UseReaderHighlightsOptions) {
  // Highlights state - persisted per book
  const [highlights, setHighlights] = usePersistedState<ReaderHighlight[]>(
    bookKey(bookId, 'highlights'), []
  );
  const highlightIdRef = useRef<number>(
    (() => { try { return JSON.parse(localStorage.getItem(bookKey(bookId, 'highlightNextId')) || '0'); } catch { return 0; } })()
  );

  // Keep a ref to latest highlights for iframe handlers (stale closure prevention)
  const highlightsRef = useRef<ReaderHighlight[]>(highlights);
  useEffect(() => { highlightsRef.current = highlights; }, [highlights]);

  // Selection popup state
  const [selectionPopup, setSelectionPopup] = useState<SelectionPopupState | null>(null);
  const [noteText, setNoteText] = useState('');
  const [selectedColor, setSelectedColor] = useState<HighlightColor>('yellow');

  // Editing existing highlight's note
  const [editingHighlightId, setEditingHighlightId] = useState<number | null>(null);
  const [editNoteText, setEditNoteText] = useState('');

  // Popup drag state
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);
  const popupDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  // Sidebar/panel visibility
  const [showHighlights, setShowHighlights] = useState(false);

  // Dictionary state
  const [showDict, setShowDict] = useState(false);
  const [dictResult, setDictResult] = useState<DictionaryEntry | null>(null);
  const [dictLoading, setDictLoading] = useState(false);
  const [dictError, setDictError] = useState<string | null>(null);
  const [dictAudioEl] = useState(() => typeof Audio !== 'undefined' ? new Audio() : null);

  // Google Drive export
  const [isExportingDrive, setIsExportingDrive] = useState(false);

  function addHighlight(highlight: Omit<ReaderHighlight, 'id'>) {
    const id = ++highlightIdRef.current;
    localStorage.setItem(bookKey(bookId, 'highlightNextId'), JSON.stringify(highlightIdRef.current));
    const full: ReaderHighlight = { ...highlight, id };
    setHighlights(prev => [...prev, full]);
    showToast('Highlight saved');
    return full;
  }

  function removeHighlight(id: number) {
    setHighlights(prev => prev.filter(h => h.id !== id));
  }

  function startEditNote(highlight: ReaderHighlight) {
    setEditingHighlightId(highlight.id);
    setEditNoteText(highlight.note);
  }

  function saveEditNote() {
    if (editingHighlightId === null) return;
    setHighlights(prev =>
      prev.map(h => h.id === editingHighlightId ? { ...h, note: editNoteText } : h)
    );
    setEditingHighlightId(null);
    setEditNoteText('');
  }

  async function handleDefine(word: string) {
    setShowDict(true);
    setDictResult(null);
    setDictError(null);
    setDictLoading(true);
    try {
      const result = await lookupWord(word);
      if (result) setDictResult(result);
      else setDictError('No definition found for "' + word + '"');
    } catch (e: any) {
      setDictError(e.message || 'Lookup failed');
    }
    setDictLoading(false);
  }

  function playDictAudio(url: string) {
    if (dictAudioEl && url) { dictAudioEl.src = url; dictAudioEl.play().catch(() => {}); }
  }

  async function handleDriveExport() {
    if (highlights.length === 0) return;
    setIsExportingDrive(true);
    try {
      const token = await getAccessToken();
      const exportData = highlights.map(h => ({
        selectedText: h.selectedText,
        note: h.note,
        color: h.color,
        pageInfo: h.pageInfo,
        createdAt: h.createdAt,
      }));
      const url = await exportCornellNotes(token, bookTitle, exportData);
      window.open(url, '_blank');
      showToast('Notes exported to Google Drive!');
    } catch (e: any) {
      showToast(e.message || 'Export failed');
    }
    setIsExportingDrive(false);
  }

  function exportHighlightsAsText() {
    if (highlights.length === 0) return;
    const lines = highlights.map((h, i) => {
      let line = `${i + 1}. "${h.selectedText}"`;
      if (h.note) line += `\n   Note: ${h.note}`;
      line += `\n   Color: ${h.color} | Page: ${h.pageInfo} | ${h.createdAt}`;
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

  return {
    highlights, setHighlights, highlightsRef, highlightIdRef,
    selectionPopup, setSelectionPopup,
    noteText, setNoteText,
    selectedColor, setSelectedColor,
    editingHighlightId, setEditingHighlightId,
    editNoteText, setEditNoteText,
    popupPos, setPopupPos, popupDragRef,
    showHighlights, setShowHighlights,
    showDict, setShowDict, dictResult, dictLoading, dictError,
    isExportingDrive,
    addHighlight, removeHighlight,
    startEditNote, saveEditNote,
    handleDefine, playDictAudio,
    handleDriveExport, exportHighlightsAsText,
  };
}
