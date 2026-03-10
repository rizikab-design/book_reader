/**
 * Iframe event listener management for the ePub reader.
 *
 * Extracted from app/reader/[bookId].tsx to reduce file size.
 * Each function accepts its dependencies as parameters so it
 * remains decoupled from React component state.
 */

import React from 'react';
import { stopSpeaking } from '@/lib/tts-engine';

// ---- Types ----------------------------------------------------------------

export interface IframeListenerEntry {
  doc: Document;
  type: string;
  handler: EventListener;
}

/** Subset of the TTS hook needed by iframe click handler. */
export interface IframeEventTtsDeps {
  resumeWordIndexRef: React.MutableRefObject<number>;
  setCurrentWordIndex: (i: number) => void;
  startTTSFromWordRef: React.MutableRefObject<(idx: number, speed: number) => void>;
  ttsSpeedRef: React.MutableRefObject<number>;
}

/** Subset of the highlight-state hook needed by selection / dblclick handlers. */
export interface IframeEventHlDeps {
  setSelectionPopup: (popup: { x: number; y: number; selectedText: string; range: Range } | null) => void;
  setPopupPos: (pos: null) => void;
  setNoteText: (t: string) => void;
  setSelectedColor: (c: 'yellow') => void;
  handleDefine: (word: string) => void;
}

export interface IframeEventDeps {
  tts: IframeEventTtsDeps;
  hlState: IframeEventHlDeps;
  viewerRef: React.RefObject<HTMLDivElement | null>;
}

// ---- Standalone functions --------------------------------------------------

export function cleanupIframeListeners(
  listenersRef: React.MutableRefObject<IframeListenerEntry[]>,
) {
  for (const entry of listenersRef.current) {
    try { entry.doc.removeEventListener(entry.type, entry.handler); } catch (e) { console.warn('Failed to remove iframe listener:', e); }
  }
  listenersRef.current = [];
}

export function addIframeListener(
  listenersRef: React.MutableRefObject<IframeListenerEntry[]>,
  doc: Document,
  type: string,
  handler: EventListener,
) {
  doc.addEventListener(type, handler);
  listenersRef.current.push({ doc, type, handler });
}

export function setupWordClickListener(
  listenersRef: React.MutableRefObject<IframeListenerEntry[]>,
  doc: Document,
  deps: IframeEventDeps,
) {
  const handler = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const ttsIdx = target.getAttribute?.('data-tts-idx');
    if (ttsIdx === null || ttsIdx === undefined) return;

    const selection = doc.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim().length > 1) {
      return;
    }

    const wordIndex = parseInt(ttsIdx, 10);
    if (isNaN(wordIndex)) return;

    stopSpeaking();
    deps.tts.resumeWordIndexRef.current = wordIndex;
    deps.tts.setCurrentWordIndex(wordIndex);
    deps.tts.startTTSFromWordRef.current(wordIndex, deps.tts.ttsSpeedRef.current);
  };
  addIframeListener(listenersRef, doc, 'click', handler as EventListener);
}

export function setupSelectionListener(
  listenersRef: React.MutableRefObject<IframeListenerEntry[]>,
  doc: Document,
  deps: IframeEventDeps,
) {
  const handler = () => {
    setTimeout(() => {
      const selection = doc.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        return;
      }

      const text = selection.toString().trim();
      if (text.length < 2) return;

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      const iframe = deps.viewerRef.current?.querySelector('iframe');
      const iframeRect = iframe?.getBoundingClientRect() || { left: 0, top: 0 };

      const popupWidth = 280;
      const popupHeight = 220;
      const rawX = iframeRect.left + rect.left + rect.width / 2;
      const rawY = iframeRect.top + rect.bottom + 8;
      const clampedX = Math.max(popupWidth / 2 + 8, Math.min(window.innerWidth - popupWidth / 2 - 8, rawX));
      const clampedY = Math.max(8, Math.min(window.innerHeight - popupHeight - 8, rawY));

      deps.hlState.setSelectionPopup({
        x: clampedX,
        y: clampedY,
        selectedText: text,
        range: range.cloneRange(),
      });
      deps.hlState.setPopupPos(null);
      deps.hlState.setNoteText('');
      deps.hlState.setSelectedColor('yellow');
    }, 10);
  };
  addIframeListener(listenersRef, doc, 'mouseup', handler);
}

export function setupDblClickListener(
  listenersRef: React.MutableRefObject<IframeListenerEntry[]>,
  doc: Document,
  deps: IframeEventDeps,
) {
  const handler = (e: MouseEvent) => {
    const selection = doc.getSelection();
    if (!selection || selection.isCollapsed) return;
    const word = selection.toString().trim();
    if (!word || word.includes(' ') || word.length > 30) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const iframe = deps.viewerRef.current?.querySelector('iframe');
    const iframeRect = iframe?.getBoundingClientRect() || { left: 0, top: 0 };

    const popupWidth = 280;
    const rawX = iframeRect.left + rect.left + rect.width / 2;
    const rawY = iframeRect.top + rect.bottom + 8;
    const clampedX = Math.max(popupWidth / 2 + 8, Math.min(window.innerWidth - popupWidth / 2 - 8, rawX));
    const clampedY = Math.max(8, Math.min(window.innerHeight - 300, rawY));

    deps.hlState.setSelectionPopup({ x: clampedX, y: clampedY, selectedText: word, range: range.cloneRange() });
    deps.hlState.setPopupPos(null);
    deps.hlState.setNoteText('');
    deps.hlState.setSelectedColor('yellow');
    deps.hlState.handleDefine(word);
    e.preventDefault();
    e.stopPropagation();
  };
  addIframeListener(listenersRef, doc, 'dblclick', handler as EventListener);
}
