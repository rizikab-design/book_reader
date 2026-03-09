import { getSupabase } from '@/lib/supabase';

// NOTE: RLS is disabled — using a fixed anonymous user_id.
// Enable RLS and implement auth before production use.
const ANON_USER_ID = '00000000-0000-0000-0000-000000000000';

export interface ReadingProgress {
  progress: number;
  cfi: string | null;
  page: number | null;
}

export async function saveProgress(
  bookId: string,
  progress: number,
  cfi: string | null,
  page: number | null,
): Promise<void> {
  // Always write to localStorage as the primary/fallback store
  try {
    localStorage.setItem(`reader-${bookId}-progress`, String(progress));
    if (cfi) localStorage.setItem(`reader-${bookId}-position`, cfi);
  } catch (e) {
    console.warn('Failed to save progress to localStorage:', e);
  }

  // Sync to Supabase if configured
  const supabase = getSupabase();
  if (!supabase) return;

  try {
    await supabase.from('reading_progress').upsert(
      {
        user_id: ANON_USER_ID,
        book_id: bookId,
        progress,
        cfi,
        page,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,book_id' },
    );
  } catch (e) {
    console.warn('Failed to save progress to Supabase:', e);
  }
}

export async function loadProgress(bookId: string): Promise<ReadingProgress | null> {
  // Try Supabase first if configured
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('reading_progress')
        .select('progress, cfi, page')
        .eq('user_id', ANON_USER_ID)
        .eq('book_id', bookId)
        .single();

      if (!error && data) {
        return { progress: data.progress, cfi: data.cfi, page: data.page };
      }
    } catch (e) {
      console.warn('Failed to load progress from Supabase:', e);
    }
  }

  // Fall back to localStorage
  try {
    const progress = parseFloat(localStorage.getItem(`reader-${bookId}-progress`) || '');
    const cfi = localStorage.getItem(`reader-${bookId}-position`);
    if (!isNaN(progress)) {
      return { progress, cfi, page: null };
    }
  } catch (e) {
    console.warn('Failed to load progress from localStorage:', e);
  }

  return null;
}
