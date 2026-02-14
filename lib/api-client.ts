import { supabase } from '@/lib/supabase';

const STORAGE_KEY = 'aoo-current-company-id';

export async function apiFetch(url: string, options: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const companyId = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  if (companyId) {
    headers['X-Company-Id'] = companyId;
  }

  return fetch(url, { ...options, headers });
}
