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
  companyRoles?: string[];
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
        .select('roles')
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
        companyRoles: membership.roles,
      };
    }

    // No company header — get user's default (first) company
    const { data: membership } = await supabaseAdmin
      .from('company_members')
      .select('company_id, roles')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('joined_at', { ascending: true })
      .limit(1)
      .single();

    return {
      isAuth: true,
      userId: user.id,
      companyId: membership?.company_id || undefined,
      companyRoles: membership?.roles || undefined,
    };
  } catch {
    return { isAuth: false };
  }
}

/**
 * Check if roles include admin-level access (owner or admin).
 */
export function isAdminRole(roles?: string[]): boolean {
  if (!roles) return false;
  return roles.includes('admin') || roles.includes('owner');
}

/**
 * Check if user roles include any of the required roles.
 */
export function hasAnyRole(userRoles: string[] | undefined, requiredRoles: string[]): boolean {
  if (!userRoles) return false;
  return requiredRoles.some(r => userRoles.includes(r));
}

const VALID_ROLES = ['owner', 'admin', 'account', 'warehouse', 'sales', 'cashier'];
const EXCLUSIVE_ROLES = ['owner', 'admin'];

/**
 * Validate roles array: must be non-empty, contain valid values,
 * and owner/admin must be exclusive (cannot combine with other roles).
 * Returns error message or null if valid.
 */
export function validateRoles(roles: unknown): string | null {
  if (!Array.isArray(roles) || roles.length === 0) {
    return 'ต้องระบุตำแหน่งอย่างน้อย 1 ตำแหน่ง';
  }
  for (const r of roles) {
    if (typeof r !== 'string' || !VALID_ROLES.includes(r)) {
      return `ตำแหน่ง "${r}" ไม่ถูกต้อง`;
    }
  }
  if (roles.some((r: string) => EXCLUSIVE_ROLES.includes(r)) && roles.length > 1) {
    return 'ตำแหน่ง owner/admin ไม่สามารถรวมกับตำแหน่งอื่นได้';
  }
  return null;
}

/**
 * Check if request is from a super admin user.
 */
export async function checkSuperAdmin(request: NextRequest): Promise<{ isAuth: boolean; isSuperAdmin: boolean; userId?: string }> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return { isAuth: false, isSuperAdmin: false };
    }

    const token = authHeader.substring(7);
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      return { isAuth: false, isSuperAdmin: false };
    }

    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('is_super_admin')
      .eq('id', user.id)
      .single();

    return {
      isAuth: true,
      isSuperAdmin: profile?.is_super_admin === true,
      userId: user.id,
    };
  } catch {
    return { isAuth: false, isSuperAdmin: false };
  }
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
