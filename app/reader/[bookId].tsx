/**
 * Reader Screen — the main screen for reading a book
 *
 * This screen renders an ePub using epub.js, which is a JavaScript library
 * that works directly in the browser. This is important because:
 * - Our macOS app uses Tauri (which wraps a web view)
 * - Our laptop version runs in a browser
 * - epub.js handles all the ePub parsing, rendering, and page turning
 *
 * How it works:
 * 1. We fetch the ePub file as binary data (ArrayBuffer)
 * 2. epub.js loads it and renders the book with all images/figures
 * 3. User can click arrows or use keyboard to turn pages
 *
 * Future phases will add:
 * - Audio player (Phase 3)
 * - Word highlighting synced with audio (Phase 4)
 * - Note-taking on selected text (Phase 5)
 */

import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Pressable, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Asset } from 'expo-asset';

import { Text, View } from '@/components/Themed';

export default function ReaderScreen() {
  // Get the bookId from the URL (e.g., /reader/test-book → bookId = "test-book")
  const { bookId } = useLocalSearchParams<{ bookId: string }>();

  // Reference to the div where epub.js will render the book
  const viewerRef = useRef<HTMLDivElement | null>(null);

  // Store the epub.js "rendition" object so we can control page turning
  const renditionRef = useRef<any>(null);

  // Track loading and error states
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Current location info for display
  const [locationInfo, setLocationInfo] = useState('');

  useEffect(() => {
    // Only run in the browser (not on native iOS — we'll handle that separately)
    if (Platform.OS !== 'web') return;

    loadBook();

    // Cleanup: destroy the epub.js book when leaving the screen
    return () => {
      if (renditionRef.current) {
        renditionRef.current.destroy();
      }
    };
  }, []);

  async function loadBook() {
    try {
      // Step 1: Use Expo's Asset system to get a URL for our bundled ePub file
      // require() tells the bundler to include this file with the app
      const asset = Asset.fromModule(
        require('../../assets/test-books/huawei-ai-textbook.epub')
      );
      await asset.downloadAsync();

      // Step 2: Fetch the ePub file as binary data (ArrayBuffer)
      // epub.js can load from an ArrayBuffer, a URL, or a base64 string
      const uri = asset.localUri || asset.uri;
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();

      // Step 3: Import epub.js dynamically (it only works in the browser)
      const ePub = (await import('epubjs')).default;

      // Step 4: Create a book from the binary data
      const book = ePub(arrayBuffer as any);

      // Wait for the viewer div to be available
      if (!viewerRef.current) {
        setError('Reader container not found');
        return;
      }

      // Step 5: Render the book into our div
      // "paginated" shows one page at a time (click/swipe to turn)
      // "spread: none" prevents showing two pages side-by-side
      const rendition = book.renderTo(viewerRef.current, {
        width: '100%',
        height: '100%',
        flow: 'paginated',
        spread: 'none',
      });

      renditionRef.current = rendition;

      // Display the book starting from the beginning
      await rendition.display();

      // Update page info when the user turns pages
      rendition.on('relocated', (location: any) => {
        const current = location.start?.displayed;
        if (current) {
          setLocationInfo(`Page ${current.page} of ${current.total}`);
        }
      });

      setIsLoading(false);
    } catch (e: any) {
      setError(e.message || 'Failed to load book');
      setIsLoading(false);
    }
  }

  // Navigate to the next page
  function nextPage() {
    if (renditionRef.current) {
      renditionRef.current.next();
    }
  }

  // Navigate to the previous page
  function prevPage() {
    if (renditionRef.current) {
      renditionRef.current.prev();
    }
  }

  // Handle keyboard arrow keys for page turning
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        nextPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        prevPage();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // --- Web-only rendering (for browser and Tauri macOS app) ---
  if (Platform.OS === 'web') {
    return (
      <div style={webStyles.container}>
        {/* Top bar with back button and page info */}
        <div style={webStyles.header}>
          <button onClick={() => router.back()} style={webStyles.backButton}>
            ← Back
          </button>
          <span style={webStyles.headerTitle}>Reader</span>
          <span style={webStyles.pageInfo}>{locationInfo}</span>
        </div>

        {/* Loading overlay — shows while the ePub is being parsed */}
        {isLoading && !error && (
          <div style={webStyles.loadingOverlay}>
            <p>Loading book...</p>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div style={webStyles.errorOverlay}>
            <p style={{ color: 'red' }}>Error: {error}</p>
            <button onClick={() => router.back()}>Go Back</button>
          </div>
        )}

        {/* The div where epub.js renders the book content */}
        {/* epub.js injects an iframe here with the book's HTML/CSS/images */}
        <div ref={viewerRef} style={webStyles.reader} />

        {/* Page turning buttons (also works with keyboard arrows) */}
        <div style={webStyles.navButtons}>
          <button onClick={prevPage} style={webStyles.navButton}>
            ← Previous
          </button>
          <button onClick={nextPage} style={webStyles.navButton}>
            Next →
          </button>
        </div>

        {/* Placeholder for audio player — will be built in Phase 3 */}
        <div style={webStyles.playerBar}>
          <span style={{ opacity: 0.5 }}>Audio Player — Phase 3</span>
        </div>
      </div>
    );
  }

  // --- Native iOS fallback (will use @epubjs-react-native/core later) ---
  return (
    <View style={styles.container}>
      <Text>Native ePub reader coming soon. Use the web/Tauri version for now.</Text>
      <Pressable onPress={() => router.back()}>
        <Text style={{ color: '#2f95dc', marginTop: 16 }}>← Back</Text>
      </Pressable>
    </View>
  );
}

// --- Web styles (plain CSS objects for the browser) ---
const webStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: '#fff',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #eee',
    gap: '16px',
  },
  backButton: {
    background: 'none',
    border: 'none',
    color: '#2f95dc',
    fontSize: '16px',
    cursor: 'pointer',
    padding: '4px 8px',
  },
  headerTitle: {
    flex: 1,
    fontSize: '16px',
    fontWeight: 600,
    textAlign: 'center',
  },
  pageInfo: {
    fontSize: '13px',
    opacity: 0.6,
    minWidth: '120px',
    textAlign: 'right',
  },
  reader: {
    flex: 1,
    overflow: 'hidden',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    zIndex: 10,
  },
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    zIndex: 10,
  },
  navButtons: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 16px',
    borderTop: '1px solid #eee',
  },
  navButton: {
    background: 'none',
    border: '1px solid #ddd',
    borderRadius: '6px',
    padding: '8px 20px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  playerBar: {
    height: '60px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderTop: '1px solid #ccc',
    fontSize: '14px',
  },
};

// --- Native styles (for iOS, used later) ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
});
