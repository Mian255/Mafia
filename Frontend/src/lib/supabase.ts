import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/database';

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://cfutaueuomfqkmqystkk.supabase.co';
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmdXRhdWV1b21mcWttcXlzdGtrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4OTk0MzEsImV4cCI6MjEwNTQ3NTQzMX0.KzvfC5dnEDe3II-5O3PMmEWDII83T-dEJ6nbpNX2Qo0';

if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
  console.warn(
    '[Supabase] EXPO_PUBLIC_SUPABASE_URL not found in process.env, using project default.'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
