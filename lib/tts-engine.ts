// Text-to-Speech engine
// Wraps expo-speech to provide word-level timing for sync

import { WordTiming } from '@/types';

// TODO: Phase 3 — implement these functions

export async function speakText(_text: string): Promise<void> {
  // Will use expo-speech to read text aloud
  // Speech.speak(text, { rate, onStart, onDone, onStopped })
}

export function stopSpeaking(): void {
  // Will call Speech.stop()
}

export function generateWordTimings(text: string, _wordsPerMinute: number): WordTiming[] {
  // Estimates word-level timing based on speech rate
  // Used as a fallback when the TTS engine doesn't provide exact timestamps
  const words = text.split(/\s+/);
  const msPerWord = 60000 / _wordsPerMinute;

  return words.map((word, index) => ({
    word,
    start_ms: Math.round(index * msPerWord),
    end_ms: Math.round((index + 1) * msPerWord),
  }));
}
