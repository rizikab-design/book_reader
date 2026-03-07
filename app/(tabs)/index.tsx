import { useEffect, useState, useRef, useCallback } from 'react';
import { StyleSheet, Platform } from 'react-native';
import { router } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { fetchBooks, uploadBook, deleteBook, getCoverUrl, BookEntry } from '@/lib/api';

interface BookWithProgress extends BookEntry {
  progress: number; // 0-1
}

export default function LibraryScreen() {
  const [books, setBooks] = useState<BookWithProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [lastReadId, setLastReadId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadBooks = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchBooks();
      // Attach reading progress from localStorage
      const withProgress: BookWithProgress[] = data.map((book) => {
        let progress = 0;
        try {
          const stored = localStorage.getItem(`reader-${book.id}-progress`);
          if (stored) progress = parseFloat(stored) || 0;
        } catch {}
        return { ...book, progress };
      });
      setBooks(withProgress);
      // Load last-read book ID
      try {
        const lrId = localStorage.getItem('reader-lastReadId');
        setLastReadId(lrId);
      } catch {}
    } catch (e: any) {
      setError('Could not connect to server. Make sure the server is running (cd server && npm start).');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    loadBooks();
  }, [loadBooks]);

  async function handleUpload(file: File) {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.epub') && !lower.endsWith('.pdf')) {
      setError('Only .epub and .pdf files are supported');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await uploadBook(file);
      await loadBooks();
    } catch (e: any) {
      setError(e.message || 'Upload failed');
    }
    setUploading(false);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = '';
  }

  async function handleDelete(id: string, title: string) {
    if (!window.confirm(`Delete "${title}" from your library?`)) return;
    setDeletingId(id);
    try {
      await deleteBook(id);
      await loadBooks();
    } catch (e: any) {
      setError(e.message);
    }
    setDeletingId(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  }

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>My Library</Text>
        <Text>Library available on web version.</Text>
      </View>
    );
  }

  const lastReadBook = lastReadId ? books.find((b) => b.id === lastReadId) : null;

  return (
    <div
      style={{
        ...webStyles.container,
        ...(dragOver ? webStyles.dragOver : {}),
      }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <style>{`
        .book-cover-btn:hover { transform: scale(1.04); box-shadow: 0 4px 16px rgba(0,0,0,0.22) !important; }
        .book-cover-btn { transition: transform 0.15s ease, box-shadow 0.15s ease; }
        .delete-btn { opacity: 0; transition: opacity 0.15s ease; }
        .book-card:hover .delete-btn { opacity: 0.7; }
        .delete-btn:hover { opacity: 1 !important; }
      `}</style>

      <div style={webStyles.header}>
        <h1 style={webStyles.title}>My Library</h1>
        <button
          onClick={() => fileInputRef.current?.click()}
          style={webStyles.uploadButton}
          disabled={uploading}
          aria-label="Upload a book"
        >
          {uploading ? 'Uploading...' : '+ Add Book'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".epub,.pdf"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
      </div>

      {error && (
        <div style={webStyles.errorBanner}>
          {error}
          <button onClick={() => setError(null)} style={webStyles.errorClose}>{'\u2715'}</button>
        </div>
      )}

      {/* Continue Reading banner */}
      {lastReadBook && lastReadBook.progress > 0 && lastReadBook.progress < 0.99 && (
        <button
          onClick={() => router.push(`/reader/${lastReadBook.id}`)}
          style={webStyles.continueReading}
        >
          <div style={webStyles.continueLeft}>
            {lastReadBook.coverFile ? (
              <img
                src={getCoverUrl(lastReadBook.coverFile)}
                alt={lastReadBook.title}
                style={webStyles.continueCover}
              />
            ) : (
              <div style={webStyles.continueCoverPlaceholder}>
                <span style={{ fontSize: '20px', fontWeight: 700, color: '#fff', opacity: 0.7 }}>
                  {lastReadBook.title.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div style={webStyles.continueInfo}>
              <div style={{ fontSize: '11px', color: '#999', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Continue Reading</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#333', marginTop: '2px' }}>{lastReadBook.title}</div>
              <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>{lastReadBook.author}</div>
            </div>
          </div>
          <div style={webStyles.continueRight}>
            <div style={webStyles.continueProgress}>
              <div style={{ ...webStyles.continueProgressFill, width: `${Math.round(lastReadBook.progress * 100)}%` }} />
            </div>
            <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>{Math.round(lastReadBook.progress * 100)}% complete</div>
          </div>
        </button>
      )}

      {isLoading ? (
        <div style={webStyles.emptyState}>Loading...</div>
      ) : books.length === 0 ? (
        <div style={webStyles.emptyState}>
          <div style={webStyles.emptyIcon}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </div>
          <div style={webStyles.emptyTitle}>No books yet</div>
          <div style={webStyles.emptyDesc}>
            Drag and drop an ePub or PDF file here, or click "Add Book" to get started.
          </div>
        </div>
      ) : (
        <div style={webStyles.grid}>
          {books.map((book) => (
            <div key={book.id} className="book-card" style={webStyles.bookCard}>
              <button
                className="book-cover-btn"
                onClick={() => router.push(`/reader/${book.id}`)}
                style={webStyles.coverButton}
              >
                {book.coverFile ? (
                  <img
                    src={getCoverUrl(book.coverFile)}
                    alt={book.title}
                    style={webStyles.coverImage}
                  />
                ) : (
                  <div style={webStyles.coverPlaceholder}>
                    <span style={webStyles.coverInitial}>
                      {book.title.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <span style={webStyles.formatBadge}>
                  {book.format?.toUpperCase() || 'EPUB'}
                </span>
              </button>
              {/* Reading progress bar on cover */}
              {book.progress > 0 && (
                <div style={webStyles.coverProgressTrack}>
                  <div style={{ ...webStyles.coverProgressFill, width: `${Math.round(book.progress * 100)}%` }} />
                </div>
              )}
              <div style={webStyles.bookInfo}>
                <div style={webStyles.bookTitle} title={book.title}>
                  {book.title}
                </div>
                <div style={webStyles.bookAuthor}>{book.author}</div>
              </div>
              <button
                className="delete-btn"
                onClick={() => handleDelete(book.id, book.title)}
                style={webStyles.deleteButton}
                title="Remove from library"
                aria-label={`Delete ${book.title}`}
                disabled={deletingId === book.id}
              >
                {deletingId === book.id ? '...' : '\u2715'}
              </button>
            </div>
          ))}
        </div>
      )}

      {dragOver && (
        <div style={webStyles.dropOverlay}>
          <div style={webStyles.dropMessage}>Drop file here</div>
        </div>
      )}
    </div>
  );
}

const webStyles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    padding: '24px 32px',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    position: 'relative',
  },
  dragOver: {
    backgroundColor: '#f0f8ff',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '24px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    color: '#333',
    margin: 0,
  },
  uploadButton: {
    backgroundColor: '#2f95dc',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  errorBanner: {
    backgroundColor: '#fee',
    color: '#c00',
    padding: '10px 16px',
    borderRadius: '8px',
    marginBottom: '16px',
    fontSize: '13px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorClose: {
    background: 'none',
    border: 'none',
    color: '#c00',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '4px',
  },
  // Continue Reading banner
  continueReading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '16px 20px',
    marginBottom: '28px',
    background: 'linear-gradient(135deg, #f8f9fa, #eef2f7)',
    border: '1px solid #e4e8ec',
    borderRadius: '12px',
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: 'box-shadow 0.15s',
  },
  continueLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flex: 1,
    minWidth: 0,
  },
  continueCover: {
    width: '44px',
    height: '62px',
    objectFit: 'cover' as const,
    borderRadius: '4px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
    flexShrink: 0,
  },
  continueCoverPlaceholder: {
    width: '44px',
    height: '62px',
    backgroundColor: '#667',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  continueInfo: {
    flex: 1,
    minWidth: 0,
  },
  continueRight: {
    textAlign: 'right' as const,
    flexShrink: 0,
    marginLeft: '20px',
  },
  continueProgress: {
    width: '80px',
    height: '4px',
    backgroundColor: '#ddd',
    borderRadius: '2px',
    overflow: 'hidden',
    marginLeft: 'auto',
  },
  continueProgressFill: {
    height: '100%',
    backgroundColor: '#2f95dc',
    borderRadius: '2px',
    transition: 'width 0.3s',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '80px 20px',
    color: '#999',
  },
  emptyIcon: {
    marginBottom: '16px',
  },
  emptyTitle: {
    fontSize: '20px',
    fontWeight: 600,
    color: '#666',
    marginBottom: '8px',
  },
  emptyDesc: {
    fontSize: '14px',
    color: '#999',
    textAlign: 'center',
    maxWidth: '300px',
    lineHeight: '1.5',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: '28px',
  },
  bookCard: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  coverButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    borderRadius: '8px',
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    width: '140px',
    height: '200px',
    position: 'relative',
  },
  coverImage: {
    width: '140px',
    height: '200px',
    objectFit: 'cover',
    display: 'block',
  },
  coverPlaceholder: {
    width: '140px',
    height: '200px',
    backgroundColor: '#667',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverInitial: {
    fontSize: '48px',
    fontWeight: 700,
    color: '#fff',
    opacity: 0.7,
  },
  coverProgressTrack: {
    width: '140px',
    height: '3px',
    backgroundColor: '#e0e0e0',
    borderRadius: '0 0 4px 4px',
    overflow: 'hidden',
    marginTop: '-1px',
  },
  coverProgressFill: {
    height: '100%',
    backgroundColor: '#2f95dc',
    borderRadius: '0 2px 2px 0',
  },
  bookInfo: {
    marginTop: '8px',
    textAlign: 'center',
    width: '140px',
  },
  bookTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#333',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  bookAuthor: {
    fontSize: '11px',
    color: '#999',
    marginTop: '2px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  deleteButton: {
    position: 'absolute',
    top: '-6px',
    right: '2px',
    background: 'rgba(0,0,0,0.5)',
    color: '#fff',
    border: 'none',
    borderRadius: '50%',
    width: '22px',
    height: '22px',
    fontSize: '11px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(47, 149, 220, 0.1)',
    border: '3px dashed #2f95dc',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    pointerEvents: 'none',
  },
  formatBadge: {
    position: 'absolute',
    bottom: '6px',
    right: '6px',
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: '#fff',
    fontSize: '9px',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '3px',
    letterSpacing: '0.5px',
  },
  dropMessage: {
    fontSize: '24px',
    fontWeight: 600,
    color: '#2f95dc',
    backgroundColor: '#fff',
    padding: '20px 40px',
    borderRadius: '12px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
  },
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
  },
});
