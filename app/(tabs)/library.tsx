import { StyleSheet } from 'react-native';
import { Link } from 'expo-router';

import { Text, View } from '@/components/Themed';

export default function LibraryScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Library</Text>
      <Text style={styles.subtitle}>Your books will appear here.</Text>

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
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.6,
    marginBottom: 32,
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
