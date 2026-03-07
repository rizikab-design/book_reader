/**
 * Text-to-Speech engine using the Web Speech API
 *
 * The Web Speech API is built into every modern browser (Chrome, Safari, Firefox).
 * It's free, works offline, and uses the system's built-in voices (like Siri on Mac).
 *
 * Word tracking:
 * - Ideally, the browser fires "boundary" events telling us which word is being spoken
 * - But Chrome on Mac often doesn't fire these events reliably
 * - So we also run a timer-based fallback that estimates the current word
 *   based on average speaking speed
 * - If boundary events DO fire, they override the timer estimate (more accurate)
 */

import { WordTiming } from '@/types';

export const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2];

/**
 * Get all available TTS voices from the system.
 * Voices load asynchronously in some browsers, so this returns a promise.
 */
export function getAvailableVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }
    // Chrome loads voices asynchronously
    window.speechSynthesis.onvoiceschanged = () => {
      resolve(window.speechSynthesis.getVoices());
    };
  });
}

let currentUtterance: SpeechSynthesisUtterance | null = null;
let wordTimer: ReturnType<typeof setInterval> | null = null;

export interface TTSCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onWord?: (wordIndex: number) => void;
  onError?: (error: string) => void;
}

/**
 * Speak the given text aloud.
 * Uses boundary events if available, otherwise falls back to timer-based word tracking.
 */
export function speakText(
  text: string,
  rate: number = 1,
  callbacks: TTSCallbacks = {},
  voice?: SpeechSynthesisVoice | null
): void {
  stopSpeaking();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate;
  utterance.pitch = 1;

  // Use the specified voice, or pick a good English default
  if (voice) {
    utterance.voice = voice;
  } else {
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Enhanced'))
    );
    const fallback = voices.find((v) => v.lang.startsWith('en'));
    if (preferred) utterance.voice = preferred;
    else if (fallback) utterance.voice = fallback;
  }

  // Split text into words for tracking
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const totalWords = words.length;

  // Track whether boundary events actually fire
  let boundaryFired = false;
  let timerWordIndex = 0;

  // Estimated words per second at this rate
  // Average English TTS is ~150 words/min at rate=1, scales linearly
  const wordsPerSecond = (150 * rate) / 60;
  const msPerWord = 1000 / wordsPerSecond;

  utterance.onstart = () => {
    callbacks.onStart?.();

    // Start timer-based fallback for word tracking
    timerWordIndex = 0;
    callbacks.onWord?.(0);

    wordTimer = setInterval(() => {
      if (!boundaryFired && window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        timerWordIndex++;
        if (timerWordIndex < totalWords) {
          callbacks.onWord?.(timerWordIndex);
        }
      }
    }, msPerWord);
  };

  utterance.onend = () => {
    clearWordTimer();
    currentUtterance = null;
    callbacks.onEnd?.();
  };

  utterance.onpause = () => callbacks.onPause?.();
  utterance.onresume = () => callbacks.onResume?.();

  utterance.onerror = (e) => {
    clearWordTimer();
    currentUtterance = null;
    if (e.error !== 'canceled') {
      callbacks.onError?.(e.error);
    }
  };

  // Boundary events — more accurate than timer, but not always available
  utterance.onboundary = (e) => {
    if (e.name === 'word') {
      boundaryFired = true;
      // Convert character position to word index
      const textBefore = text.slice(0, e.charIndex);
      const wordIndex = textBefore.split(/\s+/).filter((w) => w.length > 0).length;
      if (wordIndex < totalWords) {
        callbacks.onWord?.(wordIndex);
      }
    }
  };

  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

function clearWordTimer() {
  if (wordTimer) {
    clearInterval(wordTimer);
    wordTimer = null;
  }
}

export function stopSpeaking(): void {
  clearWordTimer();
  window.speechSynthesis.cancel();
  currentUtterance = null;
}

export function pauseSpeaking(): void {
  window.speechSynthesis.pause();
}

export function resumeSpeaking(): void {
  window.speechSynthesis.resume();
}

export function isSpeaking(): boolean {
  return window.speechSynthesis.speaking;
}

export function isPaused(): boolean {
  return window.speechSynthesis.paused;
}

export function generateWordTimings(text: string, wordsPerMinute: number = 180): WordTiming[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const msPerWord = 60000 / wordsPerMinute;

  return words.map((word, index) => ({
    word,
    start_ms: Math.round(index * msPerWord),
    end_ms: Math.round((index + 1) * msPerWord),
  }));
}
