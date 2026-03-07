import { useState, useRef } from 'react';
import { usePersistedState, bookKey } from '@/hooks/usePersistedState';
import { ReaderBookmark } from '@/hooks/reader-types';

interface UseReaderBookmarksOptions {
  bookId: string;
  currentPage: number;
  showToast: (msg: string) => void;
  getCurrentCfi?: () => string; // ePub-only: returns current CFI for navigation
}

export function useReaderBookmarks({ bookId, currentPage, showToast, getCurrentCfi }: UseReaderBookmarksOptions) {
  const [bookmarks, setBookmarks] = usePersistedState<ReaderBookmark[]>(
    bookKey(bookId, 'bookmarks'), []
  );
  const bookmarkIdRef = useRef<number>(
    (() => { try { return JSON.parse(localStorage.getItem(bookKey(bookId, 'bookmarkNextId')) || '0'); } catch { return 0; } })()
  );
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [editingBookmarkId, setEditingBookmarkId] = useState<number | null>(null);
  const [bookmarkTitleInput, setBookmarkTitleInput] = useState('');

  function toggleBookmark() {
    const existing = bookmarks.find(b => b.page === currentPage);
    if (existing) {
      setBookmarks(prev => prev.filter(b => b.id !== existing.id));
      showToast('Bookmark removed');
    } else {
      const newId = ++bookmarkIdRef.current;
      localStorage.setItem(bookKey(bookId, 'bookmarkNextId'), JSON.stringify(bookmarkIdRef.current));
      const bookmark: ReaderBookmark = {
        id: newId,
        page: currentPage,
        label: '',
        cfi: getCurrentCfi?.(),
      };
      setBookmarks(prev => [...prev, bookmark]);
      setShowBookmarks(true);
      setEditingBookmarkId(newId);
      setBookmarkTitleInput('');
    }
  }

  function saveBookmarkTitle(id: number) {
    if (bookmarkTitleInput.trim()) {
      setBookmarks(prev => prev.map(b => b.id === id ? { ...b, label: bookmarkTitleInput.trim() } : b));
    }
    setEditingBookmarkId(null);
    setBookmarkTitleInput('');
  }

  function removeBookmark(id: number) {
    setBookmarks(prev => prev.filter(b => b.id !== id));
    if (editingBookmarkId === id) setEditingBookmarkId(null);
  }

  return {
    bookmarks, setBookmarks,
    showBookmarks, setShowBookmarks,
    editingBookmarkId, setEditingBookmarkId,
    bookmarkTitleInput, setBookmarkTitleInput,
    toggleBookmark, saveBookmarkTitle, removeBookmark,
  };
}
