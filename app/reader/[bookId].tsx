import { StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { Text, View } from '@/components/Themed';

export default function ReaderScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();

  return (
    <View style={styles.container}>
      {/* Book text will render here */}
      <View style={styles.textArea}>
        <Text style={styles.placeholder}>
          Book content will appear here.{'\n'}
          Book ID: {bookId}
        </Text>
      </View>

      {/* Audio player controls will go here */}
      <View style={styles.playerBar}>
        <Text style={styles.playerText}>Audio Player — Play / Pause / Speed</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  textArea: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholder: {
    fontSize: 16,
    opacity: 0.5,
    textAlign: 'center',
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
