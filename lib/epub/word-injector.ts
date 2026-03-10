/**
 * Walks the DOM of an ePub page, wrapping every visible word in a
 * <span data-tts-idx="N"> so TTS and highlights can reference words by index.
 * Also injects the shared TTS / highlight stylesheet if it doesn't exist yet.
 */
export function injectWordSpans(doc: Document): string[] {
  const body = doc.body;
  if (!body) return [];

  let styleEl = doc.getElementById('tts-styles');
  if (!styleEl) {
    styleEl = doc.createElement('style');
    styleEl.id = 'tts-styles';
    styleEl.textContent = `
      [data-tts-idx] { cursor: pointer; }
      [data-tts-idx]:hover { background-color: rgba(0,0,0,0.04); border-radius: 2px; }
      .tts-active {
        background-color: #FFEB3B !important;
        border-radius: 3px;
        transition: background-color 0.1s;
      }
      .user-highlight-yellow { background-color: rgba(255, 235, 59, 0.4) !important; }
      .user-highlight-blue { background-color: rgba(144, 202, 249, 0.4) !important; }
      .user-highlight-green { background-color: rgba(165, 214, 167, 0.4) !important; }
      .user-highlight-pink { background-color: rgba(244, 143, 177, 0.4) !important; }
    `;
    doc.head.appendChild(styleEl);
  }

  const SKIP_TAGS = new Set(['svg', 'math', 'script', 'style']);
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let el = node.parentElement;
      while (el) {
        if (SKIP_TAGS.has(el.tagName.toLowerCase())) return NodeFilter.FILTER_REJECT;
        el = el.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const textNodes: globalThis.Text[] = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as globalThis.Text);
  }

  // Detect block-level parent for paragraph boundary markers
  const BLOCK_TAGS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'section', 'article']);
  function getBlockParent(node: Node): Element | null {
    let el = node.parentElement;
    while (el && el !== body) {
      if (BLOCK_TAGS.has(el.tagName.toLowerCase())) return el;
      el = el.parentElement;
    }
    return body;
  }

  let wordIndex = 0;
  const allWords: string[] = [];
  let lastBlockParent: Element | null = null;

  for (const textNode of textNodes) {
    const text = textNode.textContent || '';
    if (!text.trim()) continue;

    const parent = textNode.parentNode as Element;
    if (!parent) continue;

    // Insert paragraph break marker when block parent changes
    const blockParent = getBlockParent(textNode);
    if (lastBlockParent && blockParent !== lastBlockParent && allWords.length > 0) {
      allWords.push('\n\n');
    }
    lastBlockParent = blockParent;

    const parts = text.split(/(\s+)/);
    const fragment = doc.createDocumentFragment();
    for (const part of parts) {
      if (/^\s+$/.test(part) || part === '') {
        fragment.appendChild(doc.createTextNode(part));
      } else {
        const span = doc.createElement('span');
        span.setAttribute('data-tts-idx', String(wordIndex));
        span.textContent = part;
        fragment.appendChild(span);
        allWords.push(part);
        wordIndex++;
      }
    }
    parent.replaceChild(fragment, textNode);
  }

  return allWords;
}
