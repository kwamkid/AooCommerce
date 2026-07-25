// Path: lib/supabase.ts

import { createBrowserClient } from '@supabase/ssr';

// Supabase browser client — COOKIE-BASED session storage via @supabase/ssr
// (migrated from localStorage 2026-07-24) so proxy.ts middleware and future
// SSR pages can see the session. Cookie name: sb-<projectRef>-auth-token.
// Legacy localStorage sessions ('joolzjuice-auth') are adopted once on boot
// by migrateLegacyLocalStorageSession() in lib/auth/session-manager.ts.
//
// Prefer the new publishable key (sb_publishable_...). Falls back to the
// legacy anon key during the migration window so existing deploys keep
// working until Vercel/local envs are updated.
// Docs: https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createBrowserClient(supabaseUrl, supabasePublishableKey);

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
