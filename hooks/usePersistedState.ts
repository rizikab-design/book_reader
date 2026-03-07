import { useState, useEffect, useRef } from 'react';

/**
 * useState that auto-persists to localStorage.
 * Replaces the storageKey/loadStored pattern + individual useEffect persisters.
 */
export function usePersistedState<T>(
  key: string,
  fallback: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : fallback;
    } catch {
      return fallback;
    }
  });

  const isFirstRender = useRef(true);
  useEffect(() => {
    // Don't write on first render (we just read from localStorage)
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}

/**
 * Helper to build per-book storage keys.
 */
export function bookKey(bookId: string, key: string): string {
  return `reader-${bookId}-${key}`;
}
