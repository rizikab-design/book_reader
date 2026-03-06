import { StyleSheet, ScrollView } from 'react-native';

import { Text, View } from '@/components/Themed';

interface SyncedTextViewProps {
  text: string;
  currentWordIndex: number | null;
}

export default function SyncedTextView({ text, currentWordIndex }: SyncedTextViewProps) {
  const words = text.split(/\s+/);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.textContainer}>
        {words.map((word, index) => (
          <Text
            key={index}
            style={[
              styles.word,
              index === currentWordIndex && styles.highlightedWord,
            ]}>
            {word}{' '}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  textContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  word: {
    fontSize: 18,
    lineHeight: 28,
  },
  highlightedWord: {
    backgroundColor: '#FFEB3B',
    borderRadius: 2,
  },
});
