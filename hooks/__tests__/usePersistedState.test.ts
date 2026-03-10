/**
 * Tests for usePersistedState hook (pure logic, no React rendering).
 *
 * We test the localStorage integration logic directly since the hook
 * is a thin wrapper around useState + useEffect.
 */

const mockStorage: Record<string, string> = {};

const localStorageMock = {
  getItem: jest.fn((key: string) => mockStorage[key] ?? null),
  setItem: jest.fn((key: string, value: string) => {
    mockStorage[key] = value;
  }),
  removeItem: jest.fn((key: string) => {
    delete mockStorage[key];
  }),
  clear: jest.fn(() => {
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
  }),
};

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// Minimal React mock — we only need useState and useEffect/useRef
let stateValue: unknown;
let stateSetter: (v: unknown) => void;
const effectCallbacks: Array<() => void> = [];
let refObj = { current: true };

jest.mock('react', () => ({
  useState: (init: unknown) => {
    const val = typeof init === 'function' ? (init as () => unknown)() : init;
    stateValue = val;
    stateSetter = (v: unknown) => {
      stateValue = v;
    };
    return [stateValue, stateSetter];
  },
  useEffect: (cb: () => void) => {
    effectCallbacks.push(cb);
  },
  useRef: (init: unknown) => {
    refObj = { current: init as boolean };
    return refObj;
  },
}));

import { usePersistedState, bookKey } from '../usePersistedState';

beforeEach(() => {
  jest.clearAllMocks();
  localStorageMock.clear();
  for (const key of Object.keys(mockStorage)) delete mockStorage[key];
  effectCallbacks.length = 0;
  refObj.current = true;
});

describe('usePersistedState', () => {
  test('returns fallback when localStorage is empty', () => {
    const [value] = usePersistedState('theme', 'dark');
    expect(value).toBe('dark');
    expect(localStorageMock.getItem).toHaveBeenCalledWith('theme');
  });

  test('reads and parses stored JSON value', () => {
    mockStorage['fontSize'] = JSON.stringify(18);
    const [value] = usePersistedState('fontSize', 14);
    expect(value).toBe(18);
  });

  test('setValue triggers localStorage.setItem on next effect', () => {
    usePersistedState('color', 'red');

    // First effect — skip first render (isFirstRender = true)
    expect(effectCallbacks).toHaveLength(1);
    effectCallbacks[0]();
    expect(localStorageMock.setItem).not.toHaveBeenCalled();

    // After first render, isFirstRender is now false — next effect should persist
    // The effect captures the current `value` from the closure, which is 'red'
    effectCallbacks[0]();
    expect(localStorageMock.setItem).toHaveBeenCalledWith('color', JSON.stringify('red'));
  });

  test('handles JSON.parse errors gracefully (returns fallback)', () => {
    mockStorage['broken'] = '{invalid json!!!';
    const [value] = usePersistedState('broken', 'default');
    expect(value).toBe('default');
  });
});

describe('bookKey', () => {
  test('builds per-book storage key', () => {
    expect(bookKey('abc-123', 'highlights')).toBe('reader-abc-123-highlights');
  });
});
