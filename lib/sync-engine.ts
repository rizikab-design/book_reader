// Sync engine
// Maps audio playback position to the currently spoken word

import { WordTiming } from '@/types';

// TODO: Phase 4 — this is the core sync algorithm

export function findCurrentWordIndex(
  timings: WordTiming[],
  positionMs: number
): number | null {
  // Binary search through the timings array to find which word
  // is being spoken at the given playback position (in milliseconds)
  if (timings.length === 0) return null;

  let low = 0;
  let high = timings.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const timing = timings[mid];

    if (positionMs < timing.start_ms) {
      high = mid - 1;
    } else if (positionMs > timing.end_ms) {
      low = mid + 1;
    } else {
      return mid; // Found the word being spoken right now
    }
  }

  return null; // Between words or past the end
}
