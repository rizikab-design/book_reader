import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Initialize Supabase client from env vars.
// Returns null if not configured — callers should fall back to localStorage.
let supabase: SupabaseClient | null = null;

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (url && key) {
  supabase = createClient(url, key);
}

export function getSupabase(): SupabaseClient | null {
  return supabase;
}
