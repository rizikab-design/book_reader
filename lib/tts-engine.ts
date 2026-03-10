/**
 * Text-to-Speech engine
 *
 * Supports two modes:
 * 1. Browser voices (Web Speech API) — works offline, uses system voices
 * 2. Neural voices (Microsoft Edge TTS via server) — free, high quality, requires server
 *
 * Word tracking uses timer-based estimation in both modes.
 */

import { WordTiming } from '@/types';
import { API_BASE } from '@/lib/config';

export const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2];

// ── TTS Mode ──────────────────────────────────────────────────────────
const TTS_MODE_KEY = 'tts-mode';
export type TTSMode = 'browser' | 'neural';

export function getTTSMode(): TTSMode {
  try { return (localStorage.getItem(TTS_MODE_KEY) as TTSMode) || 'browser'; }
  catch { return 'browser'; }
}

export function setTTSMode(mode: TTSMode) {
  localStorage.setItem(TTS_MODE_KEY, mode);
}

// ── Neural voice selection ────────────────────────────────────────────
const NEURAL_VOICE_KEY = 'tts-neural-voice';

export function getNeuralVoice(): string {
  try { return localStorage.getItem(NEURAL_VOICE_KEY) || 'en-US-AriaNeural'; }
  catch { return 'en-US-AriaNeural'; }
}

export function setNeuralVoice(voiceId: string) {
  localStorage.setItem(NEURAL_VOICE_KEY, voiceId);
}

// ── Neural pitch & volume ─────────────────────────────────────────────
const NEURAL_PITCH_KEY = 'tts-neural-pitch';
const NEURAL_VOLUME_KEY = 'tts-neural-volume';

export function getNeuralPitch(): number {
  try { return parseInt(localStorage.getItem(NEURAL_PITCH_KEY) || '0', 10); }
  catch { return 0; }
}
export function setNeuralPitch(val: number) {
  localStorage.setItem(NEURAL_PITCH_KEY, String(val));
}

export function getNeuralVolume(): number {
  try { return parseInt(localStorage.getItem(NEURAL_VOLUME_KEY) || '100', 10); }
  catch { return 100; }
}
export function setNeuralVolume(val: number) {
  localStorage.setItem(NEURAL_VOLUME_KEY, String(val));
}

export interface NeuralVoiceInfo {
  id: string;
  name: string;
  locale: string;
  gender: string;
}

export async function getNeuralVoices(): Promise<NeuralVoiceInfo[]> {
  const res = await fetch(`${API_BASE}/api/tts/voices`);
  if (!res.ok) throw new Error('Failed to fetch neural voices');
  return res.json();
}

// ── Browser voices (Web Speech API) ───────────────────────────────────
let cachedVoices: SpeechSynthesisVoice[] | null = null;

export function getAvailableVoices(): Promise<SpeechSynthesisVoice[]> {
  if (cachedVoices) return Promise.resolve(cachedVoices);

  return new Promise((resolve) => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      cachedVoices = voices;
      resolve(voices);
      return;
    }
    function onVoicesChanged() {
      window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
      cachedVoices = window.speechSynthesis.getVoices();
      resolve(cachedVoices);
    }
    window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
  });
}

// ── Shared state ──────────────────────────────────────────────────────
let currentUtterance: SpeechSynthesisUtterance | null = null;
let currentAudio: HTMLAudioElement | null = null;
let wordTimer: ReturnType<typeof setInterval> | null = null;
let chromeKeepAlive: ReturnType<typeof setInterval> | null = null;
let currentAudioUrl: string | null = null;
let currentAbort: AbortController | null = null;
let neuralLoading = false;

export interface TTSCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onWord?: (wordIndex: number) => void;
  onError?: (error: string) => void;
}

// ── Speak (routes to browser or neural) ───────────────────────────────
export function speakText(
  text: string,
  rate: number = 1,
  callbacks: TTSCallbacks = {},
  voice?: SpeechSynthesisVoice | null
): void {
  if (getTTSMode() === 'neural') {
    speakNeural(text, rate, callbacks);
  } else {
    speakBrowser(text, rate, callbacks, voice);
  }
}

// ── Browser TTS ───────────────────────────────────────────────────────
function speakBrowser(
  text: string,
  rate: number,
  callbacks: TTSCallbacks,
  voice?: SpeechSynthesisVoice | null
): void {
  stopSpeaking();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate;
  utterance.pitch = 1;

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

  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const totalWords = words.length;
  let boundaryFired = false;
  let timerWordIndex = 0;
  const wordsPerSecond = (150 * rate) / 60;
  const msPerWord = 1000 / wordsPerSecond;

  utterance.onstart = () => {
    callbacks.onStart?.();
    timerWordIndex = 0;
    callbacks.onWord?.(0);
    wordTimer = setInterval(() => {
      if (!boundaryFired && window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        timerWordIndex++;
        if (timerWordIndex < totalWords) callbacks.onWord?.(timerWordIndex);
      }
    }, msPerWord);
  };

  utterance.onend = () => {
    clearWordTimer();
    clearChromeKeepAlive();
    currentUtterance = null;
    callbacks.onEnd?.();
  };

  utterance.onpause = () => callbacks.onPause?.();
  utterance.onresume = () => callbacks.onResume?.();

  utterance.onerror = (e) => {
    clearWordTimer();
    clearChromeKeepAlive();
    currentUtterance = null;
    if (e.error !== 'canceled') callbacks.onError?.(e.error);
  };

  utterance.onboundary = (e) => {
    if (e.name === 'word') {
      boundaryFired = true;
      const textBefore = text.slice(0, e.charIndex);
      const wordIndex = textBefore.split(/\s+/).filter((w) => w.length > 0).length;
      if (wordIndex < totalWords) callbacks.onWord?.(wordIndex);
    }
  };

  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);

  // Chrome bug workaround: speechSynthesis silently stops after ~15s.
  // Periodically pause/resume to keep it alive.
  clearChromeKeepAlive();
  chromeKeepAlive = setInterval(() => {
    if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    }
  }, 10000);
}

// ── Neural TTS (via server) ───────────────────────────────────────────
const MAX_CHUNK_SIZE = 2000;

// Text cleanup for more natural speech
function cleanTextForTts(text: string): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')      // control characters
    .replace(/[\u201C\u201D]/g, '"')                       // smart double quotes
    .replace(/[\u2018\u2019]/g, "'")                       // smart single quotes
    .replace(/[\u2013\u2014]/g, ', ')                      // em/en dashes → pause
    .replace(/\u2026/g, '...')                             // unicode ellipsis
    .replace(/\.{4,}/g, '...')                             // excessive dots
    .replace(/[ \t]+/g, ' ')                               // collapse spaces
    .replace(/ ([,.!?;:])/g, '$1')                         // remove space before punctuation
    .trim();
}

// XML-escape text for safe embedding in SSML
function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Wrap text in SSML <p> and <s> tags for natural prosody
function wrapInSSML(text: string): string {
  // Split into paragraphs if markers exist (from injectWordSpans)
  const paragraphs = text.includes('\n\n')
    ? text.split(/\n\n+/).filter(p => p.trim())
    : [text];

  return paragraphs.map(para => {
    // Split into sentences
    const sentences = para.split(/(?<=[.!?])\s+/).filter(s => s.trim());
    if (sentences.length === 0) return '';
    const inner = sentences.map(s => `<s>${escapeXml(s)}</s>`).join(' ');
    return `<p>${inner}</p>`;
  }).join('\n');
}

// Split text into chunks, preferring paragraph then sentence boundaries
function splitIntoChunks(text: string): string[] {
  if (text.length <= MAX_CHUNK_SIZE) return [text];

  // Try paragraph-level splitting first
  const paragraphs = text.includes('\n\n')
    ? text.split(/\n\n+/).filter(p => p.trim())
    : null;

  if (paragraphs && paragraphs.length > 1) {
    const chunks: string[] = [];
    let current = '';
    for (const para of paragraphs) {
      if (para.length > MAX_CHUNK_SIZE) {
        // Flush current accumulator
        if (current.trim()) { chunks.push(current.trim()); current = ''; }
        // Split oversized paragraph by sentences
        chunks.push(...splitBySentences(para));
      } else if ((current + '\n\n' + para).length > MAX_CHUNK_SIZE) {
        if (current.trim()) chunks.push(current.trim());
        current = para;
      } else {
        current = current ? current + '\n\n' + para : para;
      }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
  }

  // No paragraph markers — fall back to sentence splitting
  return splitBySentences(text);
}

function splitBySentences(text: string): string[] {
  if (text.length <= MAX_CHUNK_SIZE) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= MAX_CHUNK_SIZE) {
      chunks.push(remaining);
      break;
    }
    const slice = remaining.slice(0, MAX_CHUNK_SIZE);
    let splitAt = -1;
    const re = /[.!?]+\s+/g;
    let m;
    while ((m = re.exec(slice)) !== null) {
      splitAt = m.index + m[0].length;
    }
    if (splitAt <= 0) {
      const lastSpace = slice.lastIndexOf(' ');
      splitAt = lastSpace > 0 ? lastSpace + 1 : MAX_CHUNK_SIZE;
    }
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  return chunks;
}

let neuralGeneration = 0;

async function speakNeural(
  text: string,
  rate: number,
  callbacks: TTSCallbacks,
): Promise<void> {
  stopSpeaking();

  const cleaned = cleanTextForTts(text);
  const allWords = cleaned.split(/\s+/).filter((w) => w.length > 0);
  const chunks = splitIntoChunks(cleaned);
  neuralGeneration++;
  const myGeneration = neuralGeneration;

  // Compute the starting word offset for each chunk
  const chunkWordOffsets: number[] = [];
  let offset = 0;
  for (const chunk of chunks) {
    chunkWordOffsets.push(offset);
    offset += chunk.split(/\s+/).filter((w) => w.length > 0).length;
  }

  let isFirstChunk = true;

  for (let i = 0; i < chunks.length; i++) {
    if (neuralGeneration !== myGeneration) return;

    const chunk = chunks[i];
    const chunkWords = chunk.split(/\s+/).filter((w) => w.length > 0);
    const wordOffset = chunkWordOffsets[i];

    const abort = new AbortController();
    currentAbort = abort;
    neuralLoading = true;

    try {
      const voiceId = getNeuralVoice();
      const res = await fetch(`${API_BASE}/api/tts/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: wrapInSSML(chunk),
          voice: voiceId,
          rate,
          pitch: getNeuralPitch(),
          volume: getNeuralVolume(),
        }),
        signal: abort.signal,
      });

      if (abort.signal.aborted || neuralGeneration !== myGeneration) return;

      if (!res.ok) {
        neuralLoading = false;
        const err = await res.json().catch(() => ({ error: 'TTS request failed' }));
        callbacks.onError?.(err.error || 'TTS request failed');
        return;
      }

      const blob = await res.blob();
      if (abort.signal.aborted || neuralGeneration !== myGeneration) return;

      if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
      const url = URL.createObjectURL(blob);
      currentAudioUrl = url;

      const audio = new Audio(url);
      currentAudio = audio;
      neuralLoading = false;

      await new Promise<void>((resolve, reject) => {
        let timerWordIndex = -1;

        audio.onplay = () => {
          if (isFirstChunk) {
            callbacks.onStart?.();
            isFirstChunk = false;
          }
          callbacks.onWord?.(wordOffset);

          wordTimer = setInterval(() => {
            if (audio.paused || audio.ended) return;
            const duration = audio.duration || 1;
            const progress = Math.min(audio.currentTime / duration, 1);
            const newLocalIndex = Math.min(Math.floor(progress * chunkWords.length), chunkWords.length - 1);
            if (newLocalIndex !== timerWordIndex) {
              timerWordIndex = newLocalIndex;
              callbacks.onWord?.(wordOffset + newLocalIndex);
            }
          }, 50);
        };

        audio.onended = () => {
          clearWordTimer();
          currentAudio = null;
          resolve();
        };

        audio.onerror = () => {
          clearWordTimer();
          currentAudio = null;
          reject(new Error('Audio playback failed'));
        };

        audio.play();
      });

    } catch (err: unknown) {
      neuralLoading = false;
      if (neuralGeneration !== myGeneration) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      callbacks.onError?.(err instanceof Error ? err.message : 'Neural TTS failed');
      return;
    }
  }

  // All chunks finished
  callbacks.onEnd?.();
}

// ── Controls ──────────────────────────────────────────────────────────
function clearWordTimer() {
  if (wordTimer) {
    clearInterval(wordTimer);
    wordTimer = null;
  }
}

function clearChromeKeepAlive() {
  if (chromeKeepAlive) {
    clearInterval(chromeKeepAlive);
    chromeKeepAlive = null;
  }
}

export function stopSpeaking(): void {
  clearWordTimer();
  clearChromeKeepAlive();
  // Cancel chunked neural playback
  neuralGeneration++;
  // Abort any pending neural TTS fetch
  if (currentAbort) {
    currentAbort.abort();
    currentAbort = null;
  }
  neuralLoading = false;
  // Stop browser TTS
  window.speechSynthesis.cancel();
  currentUtterance = null;
  // Stop neural TTS
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = null;
  }
}

export function pauseSpeaking(): void {
  if (neuralLoading) {
    // Still fetching audio — abort the fetch entirely
    stopSpeaking();
    return;
  }
  if (currentAudio) {
    currentAudio.pause();
  } else {
    window.speechSynthesis.pause();
  }
}

export function resumeSpeaking(): void {
  if (currentAudio) {
    currentAudio.play();
  } else {
    window.speechSynthesis.resume();
  }
}

export function isSpeaking(): boolean {
  if (neuralLoading) return true;
  if (currentAudio) return !currentAudio.paused && !currentAudio.ended;
  return window.speechSynthesis.speaking;
}

export function isPaused(): boolean {
  if (neuralLoading) return false;
  if (currentAudio) return currentAudio.paused && currentAudio.currentTime > 0;
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
