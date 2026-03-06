import { StyleSheet, Pressable } from 'react-native';
import { Link } from 'expo-router';

import { Text, View } from '@/components/Themed';

export default function LibraryScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Library</Text>

      {/* Test book card — hardcoded for Phase 1 */}
      <Link href="/reader/test-book" asChild>
        <Pressable style={styles.bookCard}>
          <View style={styles.bookCover}>
            <Text style={styles.coverText}>AI</Text>
          </View>
          <Text style={styles.bookTitle} numberOfLines={2}>
            Artificial Intelligence Technology
          </Text>
          <Text style={styles.bookAuthor} numberOfLines={1}>
            Huawei / Springer
          </Text>
        </Pressable>
      </Link>

      <Link href="/upload" style={styles.uploadButton}>
        <Text style={styles.uploadButtonText}>+ Upload a Book</Text>
      </Link>
    </View>
  );
}

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
  bookCard: {
    width: 140,
    marginBottom: 32,
    alignItems: 'center',
  },
  bookCover: {
    width: 140,
    height: 200,
    backgroundColor: '#1a73e8',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  coverText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
    opacity: 0.8,
  },
  bookTitle: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  bookAuthor: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 2,
  },
  uploadButton: {
    backgroundColor: '#2f95dc',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
