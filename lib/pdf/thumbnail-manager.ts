/**
 * PDF Thumbnail Manager — rendering and lazy-loading via IntersectionObserver
 */

/**
 * Render a single page thumbnail and cache it.
 * Returns the cached data URL, or '' on error.
 */
export async function renderThumbnail(
  pdf: any,
  pageNum: number,
  cache: Map<number, string>,
  scale: number,
  cacheLimit: number,
): Promise<string> {
  if (cache.has(pageNum)) return cache.get(pageNum)!;
  if (!pdf) return '';
  try {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const url = canvas.toDataURL('image/jpeg', 0.6);
    if (cache.size >= cacheLimit) {
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) cache.delete(firstKey);
    }
    cache.set(pageNum, url);
    return url;
  } catch (e) {
    console.warn('PDF thumbnail render error:', e);
    return '';
  }
}

/**
 * Create an IntersectionObserver that lazy-loads thumbnails as they scroll into view.
 * The caller is responsible for observing elements and disconnecting.
 */
export function createThumbnailObserver(options: {
  container: HTMLElement;
  cache: Map<number, string>;
  renderFn: (pageNum: number) => Promise<string>;
  onLoaded: (pageNum: number) => void;
}): IntersectionObserver {
  const { container, cache, renderFn, onLoaded } = options;
  const generating = new Set<number>();

  return new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const pageNum = Number((entry.target as HTMLElement).dataset.page);
        if (!pageNum || cache.has(pageNum) || generating.has(pageNum)) continue;
        generating.add(pageNum);
        renderFn(pageNum).then(() => {
          onLoaded(pageNum);
        });
      }
    },
    { root: container, rootMargin: '200px' },
  );
}
