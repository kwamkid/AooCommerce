import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export interface AuthResult {
  isAuth: boolean;
  userId?: string;
  companyId?: string;
  companyRole?: string;
}

/**
 * Check authentication and extract company context.
 * Company ID comes from X-Company-Id header or falls back to user's first company.
 */
export async function checkAuthWithCompany(request: NextRequest): Promise<AuthResult> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return { isAuth: false };
    }

    const token = authHeader.substring(7);
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      return { isAuth: false };
    }

    const companyId = request.headers.get('x-company-id');

    if (companyId) {
      const { data: membership } = await supabaseAdmin
        .from('company_members')
        .select('role')
        .eq('user_id', user.id)
        .eq('company_id', companyId)
        .eq('is_active', true)
        .single();

      if (!membership) {
        return { isAuth: true, userId: user.id };
      }

      return {
        isAuth: true,
        userId: user.id,
        companyId,
        companyRole: membership.role,
      };
    }

    // No company header — get user's default (first) company
    const { data: membership } = await supabaseAdmin
      .from('company_members')
      .select('company_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('joined_at', { ascending: true })
      .limit(1)
      .single();

    return {
      isAuth: true,
      userId: user.id,
      companyId: membership?.company_id || undefined,
      companyRole: membership?.role || undefined,
    };
  } catch {
    return { isAuth: false };
  }
}

/**
 * Check if company role has admin-level access (owner or admin).
 */
export function isAdminRole(role?: string): boolean {
  return role === 'admin' || role === 'owner';
}

/**
 * Simple auth check without company context (for auth-only routes like /api/auth/me)
 */
export async function checkAuth(request: NextRequest): Promise<{ isAuth: boolean; userId?: string }> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return { isAuth: false };
    }

    const token = authHeader.substring(7);
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      return { isAuth: false };
    }

    return { isAuth: true, userId: user.id };
  } catch {
    return { isAuth: false };
  }
}
