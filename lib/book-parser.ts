// Book parsing utilities
// Extracts text content from PDF and ePub files

/**
 * Extract text from all chapters of an ePub book using epub.js.
 *
 * How it works:
 * 1. epub.js has a "spine" — the ordered list of chapters/sections in the book
 * 2. Each spine item has an href pointing to an HTML file inside the ePub
 * 3. We use book.load() to fetch each chapter's HTML content
 * 4. We parse the HTML and strip tags to get plain text
 * 5. We return an array of { title, text } objects, one per chapter
 *
 * @param book - An epub.js Book object (already loaded)
 * @returns Array of chapters with title and text content
 */
export async function extractChaptersFromEpub(
  book: any
): Promise<{ title: string; text: string }[]> {
  // Wait for the book to finish loading its internal structure
  await book.ready;

  // Load the navigation (table of contents) to get chapter titles
  const navigation = await book.loaded.navigation;
  const tocItems = navigation?.toc || [];

  // Build a map from href -> chapter title for easy lookup
  const titleMap = new Map<string, string>();
  function flattenToc(items: any[]) {
    for (const item of items) {
      const href = item.href?.split('#')[0];
      if (href) {
        titleMap.set(href, item.label?.trim() || '');
      }
      if (item.subitems) {
        flattenToc(item.subitems);
      }
    }
  }
  flattenToc(tocItems);

  const chapters: { title: string; text: string }[] = [];

  // Get spine items — each one represents a chapter/section
  const spineItems: any[] = [];
  book.spine.each((item: any) => {
    spineItems.push(item);
  });

  // Use a DOMParser to extract text from HTML strings
  const parser = new DOMParser();

  for (let i = 0; i < spineItems.length; i++) {
    const item = spineItems[i];

    try {
      // Load the chapter's HTML content via the book's resource loader
      const doc = await book.load(item.href);

      // doc might be a Document or an HTML string depending on epub.js version
      let text = '';
      if (doc && typeof doc === 'object' && doc.body) {
        // It's a Document object
        text = doc.body.innerText || doc.body.textContent || '';
      } else if (typeof doc === 'string') {
        // It's an HTML string — parse it
        const parsed = parser.parseFromString(doc, 'text/html');
        text = parsed.body.innerText || parsed.body.textContent || '';
      }

      // Clean up: collapse extra whitespace, trim
      const cleanedText = text.replace(/\s+/g, ' ').trim();

      // Skip empty chapters (cover pages, blank separators, etc.)
      if (cleanedText.length < 10) continue;

      // Try to find a title from the table of contents
      const href = item.href?.split('#')[0];
      const tocTitle = titleMap.get(href) || '';

      // If no TOC title, try to find a heading in the HTML
      let headingTitle = '';
      if (doc && typeof doc === 'object' && doc.querySelector) {
        const heading = doc.querySelector('h1, h2, h3');
        headingTitle = heading?.textContent?.trim() || '';
      }

      const title = tocTitle || headingTitle || `Section ${chapters.length + 1}`;

      chapters.push({ title, text: cleanedText });
    } catch (e) {
      // Skip chapters that fail to load (e.g., images-only pages)
      console.warn(`Skipped spine item ${i} (${item.href}):`, e);
    }
  }

  return chapters;
}

export function detectFormat(filename: string): 'pdf' | 'epub' | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.epub')) return 'epub';
  return null;
}
