/**
 * PDF Text Layer — highlight application for rendered text layers
 */

import type { ReaderHighlight } from '@/hooks/reader-types';

/**
 * Apply saved highlights to text layer spans by matching text content.
 */
export function applyHighlightsToTextLayer(
  pageNum: number,
  textLayer: HTMLDivElement | null,
  highlights: ReaderHighlight[],
): void {
  if (!textLayer) return;
  const pageHighlights = highlights.filter((h) => h.page === pageNum);
  if (pageHighlights.length === 0) return;

  const spans = textLayer.querySelectorAll('span');
  if (spans.length === 0) return;

  for (const h of pageHighlights) {
    const hLower = h.selectedText.toLowerCase();
    let accumulated = '';
    const spanTexts: { span: HTMLSpanElement; start: number; text: string }[] = [];
    spans.forEach((span) => {
      const text = span.textContent || '';
      spanTexts.push({ span: span as HTMLSpanElement, start: accumulated.length, text });
      accumulated += text;
    });

    const accLower = accumulated.toLowerCase();
    let searchFrom = 0;
    while (true) {
      const idx = accLower.indexOf(hLower, searchFrom);
      if (idx === -1) break;
      const endIdx = idx + hLower.length;
      for (const st of spanTexts) {
        const spanEnd = st.start + st.text.length;
        if (st.start < endIdx && spanEnd > idx) {
          st.span.classList.add(`pdf-highlight-${h.color}`);
        }
      }
      searchFrom = idx + 1;
    }
  }
}
