import { StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { Text, View } from '@/components/Themed';

export default function NotesScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Notes & Highlights</Text>
      <Text style={styles.subtitle}>
        Your notes for this book will appear here.{'\n'}
        Book ID: {bookId}
      </Text>
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
    textAlign: 'center',
  },
});
