/**
 * Reader Screen — the main screen for reading a book
 *
 * This screen loads an ePub file and renders it using the epubjs-react-native
 * library, which displays the book inside a WebView (mini web browser).
 * Images, figures, and formatting from the ePub are all preserved.
 *
 * How it works:
 * 1. The ePub file is copied from app assets to the device's document directory
 *    (the ePub reader needs a file path it can access directly)
 * 2. The Reader component from epubjs-react-native renders the book
 * 3. User can swipe left/right to turn pages
 *
 * Future phases will add:
 * - Audio player (Phase 3)
 * - Word highlighting synced with audio (Phase 4)
 * - Note-taking on selected text (Phase 5)
 */

import { useState, useEffect } from 'react';
import { StyleSheet, Pressable, SafeAreaView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Reader } from '@epubjs-react-native/core';
import { useFileSystem } from '@epubjs-react-native/expo-file-system';
import * as FileSystem from 'expo-file-system';

import { Text, View } from '@/components/Themed';

export default function ReaderScreen() {
  // Get the bookId from the URL (e.g., /reader/test-book → bookId = "test-book")
  const { bookId } = useLocalSearchParams<{ bookId: string }>();

  // State: the local file path to the ePub once it's ready to read
  const [bookUri, setBookUri] = useState<string | null>(null);

  // State: error message if something goes wrong loading the book
  const [error, setError] = useState<string | null>(null);

  // When the screen loads, copy the test book to a readable location
  useEffect(() => {
    loadTestBook();
  }, []);

  /**
   * Loads the test ePub book for development.
   *
   * Why we need to copy it:
   * The ePub reader needs a file:// URI to open the book, but assets bundled
   * with the app aren't directly accessible as files. So we:
   * 1. Use Expo's Asset system to get a local URI for the bundled file
   * 2. Copy it to the app's document directory (a writable location)
   * 3. Pass that path to the Reader component
   *
   * In Phase 6, this will be replaced with downloading from Supabase Storage.
   */
  async function loadTestBook() {
    try {
      // Where we'll store the book on the device
      const destPath = FileSystem.documentDirectory + 'huawei-ai-textbook.epub';

      // Check if we already copied it (avoid copying again on re-renders)
      const fileInfo = await FileSystem.getInfoAsync(destPath);

      if (!fileInfo.exists) {
        // require() tells the bundler to include this file with the app
        const asset = require('../../assets/test-books/huawei-ai-textbook.epub');

        // Download the asset to a local URI we can copy from
        const { Asset } = await import('expo-asset');
        const resolved = Asset.fromModule(asset);
        await resolved.downloadAsync();

        if (resolved.localUri) {
          // Copy from the temporary asset location to our document directory
          await FileSystem.copyAsync({ from: resolved.localUri, to: destPath });
        }
      }

      // Tell the component we're ready — this triggers a re-render with the Reader
      setBookUri(destPath);
    } catch (e: any) {
      setError(e.message || 'Failed to load book');
    }
  }

  // --- Error state: show message and a way to go back ---
  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Error: {error}</Text>
          <Pressable onPress={() => router.back()} style={styles.backButtonAlt}>
            <Text style={styles.backTextAlt}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // --- Loading state: show spinner while the book file is being prepared ---
  if (!bookUri) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2f95dc" />
          <Text style={styles.loadingText}>Loading book...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // --- Main reader view ---
  return (
    <SafeAreaView style={styles.container}>
      {/* Top bar with back button */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>Reader</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* The actual ePub reader — renders the book with images/figures intact */}
      {/* enableSwipe lets users swipe left/right to turn pages */}
      <View style={styles.readerContainer}>
        <Reader
          src={bookUri}
          fileSystem={useFileSystem}
          enableSwipe={true}
        />
      </View>

      {/* Placeholder for the audio player — will be built in Phase 3 */}
      <View style={styles.playerBar}>
        <Text style={styles.playerText}>Audio Player — Phase 3</Text>
      </View>
    </SafeAreaView>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    opacity: 0.6,
  },
  errorText: {
    fontSize: 16,
    color: 'red',
    marginBottom: 16,
    textAlign: 'center',
  },
  backButtonAlt: {
    backgroundColor: '#2f95dc',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backTextAlt: {
    color: '#fff',
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    paddingRight: 16,
  },
  backText: {
    fontSize: 16,
    color: '#2f95dc',
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 60, // Balances the back button so the title stays centered
  },
  readerContainer: {
    flex: 1, // Takes up all available space between header and player bar
  },
  playerBar: {
    height: 80,
    borderTopWidth: 1,
    borderTopColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 16,
  },
  playerText: {
    fontSize: 14,
    opacity: 0.5,
  },
});
