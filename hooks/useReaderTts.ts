import { useState, useEffect, useRef, useCallback } from 'react';
import { speakText, stopSpeaking, pauseSpeaking, resumeSpeaking, getAvailableVoices } from '@/lib/tts-engine';
import { usePersistedState, bookKey } from '@/hooks/usePersistedState';

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

  // ── Refs (stale closure prevention) ────────────────────────────────────
  const ttsGenRef = useRef(0);
  const resumeWordIndexRef = useRef<number>(-1);
  const currentWordIndexRef = useRef<number>(-1);
  const isPlayingRef = useRef(false);
  const ttsSpeedRef = useRef(ttsSpeed);
  const selectedVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const handlePlayPauseRef = useRef<() => void>(() => {});
  const startTTSFromWordRef = useRef<(fromWordIndex: number, rate: number) => void>(() => {});
  const onTtsEndRef = useRef(onTtsEnd);
  const getWordsRef = useRef(getWords);

  // ── Sync refs with state / props ───────────────────────────────────────
  useEffect(() => { ttsSpeedRef.current = ttsSpeed; }, [ttsSpeed]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { currentWordIndexRef.current = currentWordIndex; }, [currentWordIndex]);
  useEffect(() => { onTtsEndRef.current = onTtsEnd; });
  useEffect(() => { getWordsRef.current = getWords; });

  // ── Load voices on mount ───────────────────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem('tts-favorite-voices');
      if (stored) setFavoriteVoiceNames(JSON.parse(stored));
    } catch {}

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
      } catch {}
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
    setIsPlaying(true);
    speakText(textFromWord, rate, {
      onEnd: () => {
        if (ttsGenRef.current !== gen) return;
        setIsPlaying(false);
        setCurrentWordIndex(-1);
        resumeWordIndexRef.current = -1;
        onTtsEndRef.current?.();
      },
      onWord: (wordIndex: number) => {
        if (ttsGenRef.current !== gen) return;
        setCurrentWordIndex(wordIndex + fromWordIndex);
      },
      onError: (err: string) => {
        if (ttsGenRef.current !== gen) return;
        setIsPlaying(false);
      },
    }, selectedVoiceRef.current);
  }

  // Keep ref in sync so iframe / keyboard handlers can call the latest version
  startTTSFromWordRef.current = startTTSFromWord;

  function handlePlayPause() {
    if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      pauseSpeaking();
      setIsPlaying(false);
    } else if (window.speechSynthesis.paused) {
      resumeSpeaking();
      setIsPlaying(true);
    } else {
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
    setIsPlaying(false);
    setCurrentWordIndex(-1);
  }

  function handleSpeedInputSubmit() {
    const val = parseFloat(speedInput);
    if (!isNaN(val) && val >= 0.5 && val <= 3) {
      setTtsSpeed(val);
      if (isPlayingRef.current) {
        const resumeFrom = currentWordIndexRef.current >= 0 ? currentWordIndexRef.current : 0;
        stopSpeaking();
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
      stopSpeaking();
      startTTSFromWord(resumeFrom, newSpeed);
    }
  }

  // ── Return ─────────────────────────────────────────────────────────────
  return {
    // State
    isPlaying,
    setIsPlaying,
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
