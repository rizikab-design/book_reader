import { StyleSheet, Pressable } from 'react-native';
import { Link } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { Book } from '@/types';

interface BookCardProps {
  book: Book;
}

export default function BookCard({ book }: BookCardProps) {
  return (
    <Link href={`/reader/${book.id}`} asChild>
      <Pressable style={styles.card}>
        <View style={styles.cover}>
          <Text style={styles.coverText}>{book.title[0]}</Text>
        </View>
        <Text style={styles.title} numberOfLines={2}>{book.title}</Text>
        {book.author && (
          <Text style={styles.author} numberOfLines={1}>{book.author}</Text>
        )}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 140,
    marginRight: 16,
    marginBottom: 16,
  },
  cover: {
    width: 140,
    height: 200,
    backgroundColor: '#e8e8e8',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  coverText: {
    fontSize: 48,
    fontWeight: 'bold',
    opacity: 0.3,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  author: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 2,
  },
});
