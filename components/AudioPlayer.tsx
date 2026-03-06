import { StyleSheet, Pressable } from 'react-native';

import { Text, View } from '@/components/Themed';

interface AudioPlayerProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onSpeedChange: () => void;
  speed: number;
  currentTime: string;
  duration: string;
}

export default function AudioPlayer({
  isPlaying,
  onPlayPause,
  onSpeedChange,
  speed,
  currentTime,
  duration,
}: AudioPlayerProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.time}>{currentTime}</Text>

      <Pressable style={styles.playButton} onPress={onPlayPause}>
        <Text style={styles.playButtonText}>{isPlaying ? 'Pause' : 'Play'}</Text>
      </Pressable>

      <Pressable style={styles.speedButton} onPress={onSpeedChange}>
        <Text style={styles.speedText}>{speed}x</Text>
      </Pressable>

      <Text style={styles.time}>{duration}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 80,
    borderTopWidth: 1,
    borderTopColor: '#ccc',
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 16,
  },
  playButton: {
    backgroundColor: '#2f95dc',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  playButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  speedButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  speedText: {
    fontSize: 14,
  },
  time: {
    fontSize: 12,
    opacity: 0.5,
  },
});
