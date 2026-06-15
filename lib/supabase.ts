// Path: lib/supabase.ts

import { createClient } from '@supabase/supabase-js';

// Supabase configuration
//
// Prefer the new publishable key (sb_publishable_...). Falls back to the
// legacy anon key during the migration window so existing deploys keep
// working until Vercel/local envs are updated.
// Docs: https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Create Supabase client with proper auth configuration
export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    storageKey: 'joolzjuice-auth',
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Helper function to handle Supabase errors
export const handleSupabaseError = (error: Error | null): string => {
  if (error) {
    console.error('Supabase error:', error);
    return error.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
  }
  return '';
};

// Check if user is authenticated
export const checkAuth = async () => {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Auth error:', error);
    return null;
  }
  return session;
};

// Get current user
export const getCurrentUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    console.error('Get user error:', error);
    return null;
  }
  return user;
};