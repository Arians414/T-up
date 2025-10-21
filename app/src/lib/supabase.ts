import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL as string | undefined;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anon) {
  console.warn('[supabase] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY');
}

export const supabase = createClient(url ?? '', anon ?? '');




