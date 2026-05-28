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
  canViewCost?: boolean;
}

const TRANSIENT_ERROR_CODES = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_SOCKET'];

function isTransientFetchError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; message?: string; code?: string; cause?: { code?: string; errno?: number } };
  if (e.name === 'TypeError' && e.message?.includes('fetch failed')) return true;
  if (e.code && TRANSIENT_ERROR_CODES.includes(e.code)) return true;
  if (e.cause?.code && TRANSIENT_ERROR_CODES.includes(e.cause.code)) return true;
  return false;
}

/**
 * Verify a Supabase auth token with retry on transient network errors
 * (ECONNRESET, fetch failed, etc.). Returns null if invalid/expired (no retry).
 */
async function verifyAuthToken(token: string): Promise<{ id: string } | null> {
  const delays = [0, 100, 300];
  let lastErr: unknown;
  for (const delay of delays) {
    if (delay > 0) await new Promise(r => setTimeout(r, delay));
    try {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !user) return null;
      return user;
    } catch (err) {
      lastErr = err;
      if (!isTransientFetchError(err)) throw err;
    }
  }
  console.error('[verifyAuthToken] All retries exhausted:', lastErr);
  return null;
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
    const user = await verifyAuthToken(token);
    if (!user) {
      return { isAuth: false };
    }

    const companyId = request.headers.get('x-company-id');

    if (companyId) {
      const { data: membership } = await supabaseAdmin
        .from('company_members')
        .select('roles, can_view_cost')
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
        canViewCost: membership.can_view_cost === true,
      };
    }

    // No company header — get user's default (first) company
    const { data: membership } = await supabaseAdmin
      .from('company_members')
      .select('company_id, roles, can_view_cost')
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
      canViewCost: membership?.can_view_cost === true,
    };
  } catch {
    return { isAuth: false };
  }
}

/**
 * Check if roles include admin-level access (owner or admin).
 */
/**
 * Admin-level access: owner, admin, or manager.
 * Manager has the same operational access as admin EXCEPT cannot invite/remove
 * owner or admin members — that is enforced separately in the members API.
 */
export function isAdminRole(roles?: string[]): boolean {
  if (!roles) return false;
  return roles.includes('admin') || roles.includes('owner') || roles.includes('manager');
}

/**
 * Strict admin: owner or admin only (excludes manager).
 * Use for operations that grant/revoke admin-level access (member management).
 */
export function isStrictAdmin(roles?: string[]): boolean {
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

/**
 * Can access bulk edit (Excel template import/update).
 * owner + admin + manager + warehouse.
 */
export function canBulkEdit(roles?: string[]): boolean {
  if (!roles) return false;
  return roles.includes('owner') || roles.includes('admin') || roles.includes('manager') || roles.includes('warehouse');
}

/**
 * Can manage inventory operations (transfer, receive, issue, adjust stock).
 * owner + admin + manager + warehouse.
 */
export function canManageInventory(roles?: string[]): boolean {
  if (!roles) return false;
  return roles.includes('owner') || roles.includes('admin') || roles.includes('manager') || roles.includes('warehouse');
}

const VALID_ROLES = ['owner', 'admin', 'manager', 'account', 'warehouse', 'sales', 'cashier'];
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
    const user = await verifyAuthToken(token);
    if (!user) {
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
    const user = await verifyAuthToken(token);
    if (!user) {
      return { isAuth: false };
    }

    return { isAuth: true, userId: user.id };
  } catch {
    return { isAuth: false };
  }
}
