/**
 * Highlight rendering utilities for the ePub reader.
 *
 * Extracted from app/reader/[bookId].tsx to reduce file size.
 */

import type { HighlightColor, ReaderHighlight } from '@/hooks/reader-types';

/**
 * Apply a highlight color to a DOM Range inside the iframe document.
 * Tries `surroundContents` first; falls back to marking individual word spans.
 */
export function applyHighlightToRange(
  iframeDoc: Document | null,
  range: Range,
  color: HighlightColor,
): void {
  if (!iframeDoc || !range) return;

  try {
    const span = iframeDoc.createElement('span');
    span.className = `user-highlight-${color}`;
    range.surroundContents(span);
  } catch (e) {
    const container = range.commonAncestorContainer;
    const parent = container.nodeType === 3 ? container.parentElement : container as Element;
    if (parent && iframeDoc) {
      const wordSpans = parent.querySelectorAll('[data-tts-idx]');
      wordSpans.forEach((span) => {
        try {
          const spanRange = iframeDoc.createRange();
          spanRange.selectNodeContents(span);
          const intersects =
            range.compareBoundaryPoints(Range.START_TO_END, spanRange) > 0 &&
            range.compareBoundaryPoints(Range.END_TO_START, spanRange) < 0;
          if (intersects) {
            (span as HTMLElement).classList.add(`user-highlight-${color}`);
          }
        } catch (e) { console.warn('Failed to apply highlight to span:', e); }
      });
    }
  }
}

/**
 * Re-apply saved highlights to word spans already rendered in `doc`.
 *
 * Uses a first-word map for O(n) scanning rather than O(n*m) brute force.
 */
export function reapplyHighlights(
  doc: Document,
  highlights: ReaderHighlight[],
  words: string[],
): void {
  if (highlights.length === 0 || words.length === 0) return;

  // Build a map keyed by lowercase first word → list of highlights
  const firstWordMap = new Map<string, ReaderHighlight[]>();
  for (const h of highlights) {
    const hWords = h.selectedText.split(/\s+/);
    if (hWords.length === 0) continue;
    const key = hWords[0].toLowerCase();
    const list = firstWordMap.get(key);
    if (list) list.push(h);
    else firstWordMap.set(key, [h]);
  }

  // Scan words once, checking first-word matches from the map
  for (let i = 0; i < words.length; i++) {
    const candidates = firstWordMap.get(words[i].toLowerCase());
    if (!candidates) continue;
    for (const h of candidates) {
      const hWords = h.selectedText.split(/\s+/);
      if (i + hWords.length > words.length) continue;
      const match = hWords.every((hw, j) =>
        words[i + j].toLowerCase() === hw.toLowerCase()
      );
      if (match) {
        for (let j = 0; j < hWords.length; j++) {
          const span = doc.querySelector(`[data-tts-idx="${i + j}"]`);
          if (span) (span as HTMLElement).classList.add(`user-highlight-${h.color}`);
        }
      }
    }
  }
}
