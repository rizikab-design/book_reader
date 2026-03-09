import { useState, useEffect, useRef } from 'react';
import { speakText, stopSpeaking, pauseSpeaking, resumeSpeaking, cancelAndSpeak, getAvailableVoices, isPaused } from '@/lib/tts-engine';
import { usePersistedState, bookKey } from '@/hooks/usePersistedState';

/** Keeps a ref always in sync with the latest value (no stale closures). */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export interface UseReaderTtsOptions {
  bookId: string;
  getWords: () => string[];
  onTtsEnd?: () => void;
}

export function useReaderTts({ bookId, getWords, onTtsEnd }: UseReaderTtsOptions) {
  // ── State ──────────────────────────────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false);
  const [ttsSpeed, setTtsSpeed] = usePersistedState<number>(bookKey(bookId, 'ttsSpeed'), 1);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [favoriteVoiceNames, setFavoriteVoiceNames] = useState<string[]>([]);
  const [isEditingSpeed, setIsEditingSpeed] = useState(false);
  const [speedInput, setSpeedInput] = useState('');

  // ── Refs (stale closure prevention via useLatest) ─────────────────────
  const ttsGenRef = useRef(0);
  const resumeWordIndexRef = useRef<number>(-1);
  const isPlayingRef = useRef(false);
  const currentWordIndexRef = useLatest(currentWordIndex);
  const ttsSpeedRef = useLatest(ttsSpeed);
  const selectedVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const onTtsEndRef = useLatest(onTtsEnd);
  const getWordsRef = useLatest(getWords);

  // Synchronously update isPlayingRef alongside state to avoid desync
  function setPlayingState(playing: boolean) {
    isPlayingRef.current = playing;
    setIsPlaying(playing);
  }

  // Function refs — assigned directly each render (useLatest pattern)
  const handlePlayPauseRef = useRef<() => void>(() => {});
  const startTTSFromWordRef = useRef<(fromWordIndex: number, rate: number) => void>(() => {});

  // ── Load voices on mount ───────────────────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem('tts-favorite-voices');
      if (stored) setFavoriteVoiceNames(JSON.parse(stored));
    } catch (e) { console.warn('Failed to load favorite voices:', e); }

    getAvailableVoices().then((voices) => {
      const englishVoices = voices.filter((v) => v.lang.startsWith('en'));
      setAvailableVoices(englishVoices);
      try {
        const preferredName = localStorage.getItem('tts-preferred-voice');
        if (preferredName) {
          const voice = englishVoices.find((v) => v.name === preferredName);
          if (voice) {
            setSelectedVoice(voice);
            selectedVoiceRef.current = voice;
          }
        }
      } catch (e) { console.warn('Failed to load preferred voice:', e); }
    });
  }, []);

  // ── Clean up TTS on unmount ────────────────────────────────────────────
  useEffect(() => {
    return () => stopSpeaking();
  }, []);

  // ── TTS functions ──────────────────────────────────────────────────────

  function startTTSFromWord(fromWordIndex: number, rate: number) {
    const allWords = getWordsRef.current();
    if (allWords.length === 0) return;
    const textFromWord = allWords.slice(fromWordIndex).join(' ');
    if (!textFromWord) return;

    const gen = ++ttsGenRef.current;
    setPlayingState(true);
    speakText(textFromWord, rate, {
      onEnd: () => {
        if (ttsGenRef.current !== gen) return;
        setPlayingState(false);
        setCurrentWordIndex(-1);
        resumeWordIndexRef.current = -1;
        onTtsEndRef.current?.();
      },
      onWord: (wordIndex: number) => {
        if (ttsGenRef.current !== gen) return;
        setCurrentWordIndex(wordIndex + fromWordIndex);
      },
      onError: () => {
        if (ttsGenRef.current !== gen) return;
        setPlayingState(false);
      },
    }, selectedVoiceRef.current);
  }

  startTTSFromWordRef.current = startTTSFromWord;

  /**
   * Three-state toggle: stopped → playing → paused → playing (or → stopped via handleStop).
   * Uses isPlayingRef (synchronously updated) to avoid rapid-tap desync.
   */
  function handlePlayPause() {
    if (isPlayingRef.current) {
      // Currently playing — pause
      pauseSpeaking();
      setPlayingState(false);
    } else if (isPaused()) {
      // Was paused — resume
      resumeSpeaking();
      setPlayingState(true);
    } else {
      // Fully stopped — start from resume point or beginning
      const startFrom = resumeWordIndexRef.current >= 0 ? resumeWordIndexRef.current : 0;
      setCurrentWordIndex(startFrom);
      startTTSFromWord(startFrom, ttsSpeedRef.current);
    }
  }

  handlePlayPauseRef.current = handlePlayPause;

  function handleStop() {
    const idx = currentWordIndexRef.current;
    resumeWordIndexRef.current = idx >= 0 ? idx : -1;
    stopSpeaking();
    setPlayingState(false);
    setCurrentWordIndex(-1);
  }

  function handleSpeedInputSubmit() {
    const val = parseFloat(speedInput);
    if (!isNaN(val) && val >= 0.5 && val <= 3) {
      setTtsSpeed(val);
      if (isPlayingRef.current) {
        const resumeFrom = currentWordIndexRef.current >= 0 ? currentWordIndexRef.current : 0;
        cancelAndSpeak();
        startTTSFromWord(resumeFrom, val);
      }
    }
    setIsEditingSpeed(false);
    setSpeedInput('');
  }

  function handleSpeedChange(newSpeed: number) {
    setTtsSpeed(newSpeed);
    if (isPlayingRef.current) {
      const resumeFrom = currentWordIndexRef.current >= 0 ? currentWordIndexRef.current : 0;
      cancelAndSpeak();
      startTTSFromWord(resumeFrom, newSpeed);
    }
  }

  // ── Return ─────────────────────────────────────────────────────────────
  return {
    // State
    isPlaying,
    setIsPlaying: setPlayingState,
    ttsSpeed,
    setTtsSpeed,
    currentWordIndex,
    setCurrentWordIndex,
    isEditingSpeed,
    setIsEditingSpeed,
    speedInput,
    setSpeedInput,
    availableVoices,
    selectedVoice,
    setSelectedVoice,
    favoriteVoiceNames,

    // Refs
    ttsGenRef,
    resumeWordIndexRef,
    currentWordIndexRef,
    isPlayingRef,
    ttsSpeedRef,
    selectedVoiceRef,
    handlePlayPauseRef,
    startTTSFromWordRef,
    onTtsEndRef,

    // Functions
    startTTSFromWord,
    handlePlayPause,
    handleStop,
    handleSpeedInputSubmit,
    handleSpeedChange,
  };
}
