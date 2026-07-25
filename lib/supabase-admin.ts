import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
// Circular with verify-token (it imports supabaseAdmin for the network
// fallback) — safe because both sides only touch the import inside functions.
import { verifyAccessToken } from '@/lib/auth/verify-token';
import { extractRequestToken } from '@/lib/auth/cookie-token';

// Re-export capability checker so existing imports can migrate one helper at a time.
// New code should prefer `import { can } from '@/lib/permissions'` directly.
export { can } from '@/lib/permissions';
export type { Capability } from '@/lib/permissions';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// Prefer the new secret key (sb_secret_...). Falls back to the legacy
// service_role key during the migration window. Both work simultaneously.
// Docs: https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
const supabaseSecretKey =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
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
  /** Authenticator Assurance Level — 'aal2' means the session passed 2FA. Only set when verified locally. */
  aal?: string;
}

/**
 * Process-level cache for resolved auth results, keyed by `${token}|${companyId}`.
 *
 * Why: every API route calls `checkAuthWithCompany`, which fires TWO network
 * round-trips to Supabase (JWT verify + company_members lookup) — ~400-600ms
 * of baseline latency per request. Caching at the module level lets warm
 * serverless invocations skip both calls when the same client makes several
 * requests within the TTL window.
 *
 * Trade-off: stale role changes / forced logout take up to TTL to take
 * effect. 30s is short enough for that to be acceptable and long enough to
 * cover a typical page load that fires multiple parallel API calls.
 */
const AUTH_CACHE_TTL_MS = 30_000;
type CachedAuth = { expiresAt: number; result: AuthResult };
const authCache = new Map<string, CachedAuth>();

/**
 * Check authentication and extract company context.
 * Company ID comes from X-Company-Id header or falls back to user's first company.
 */
export async function checkAuthWithCompany(request: NextRequest): Promise<AuthResult> {
  try {
    // Dual-mode: Bearer header (apiFetch) or Supabase auth cookie (SSR/browser)
    const token = extractRequestToken(request);
    if (!token) {
      return { isAuth: false };
    }
    const companyId = request.headers.get('x-company-id') || '';
    const cacheKey = `${token}|${companyId}`;

    const cached = authCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    const verified = await verifyAccessToken(token);
    if (!verified) {
      return { isAuth: false };
    }

    let result: AuthResult;
    if (companyId) {
      const { data: membership } = await supabaseAdmin
        .from('company_members')
        .select('roles, can_view_cost')
        .eq('user_id', verified.userId)
        .eq('company_id', companyId)
        .eq('is_active', true)
        .single();

      if (!membership) {
        result = { isAuth: true, userId: verified.userId, aal: verified.aal };
      } else {
        result = {
          isAuth: true,
          userId: verified.userId,
          companyId,
          companyRoles: membership.roles,
          canViewCost: membership.can_view_cost === true,
          aal: verified.aal,
        };
      }
    } else {
      // No company header — get user's default (first) company
      const { data: membership } = await supabaseAdmin
        .from('company_members')
        .select('company_id, roles, can_view_cost')
        .eq('user_id', verified.userId)
        .eq('is_active', true)
        .order('joined_at', { ascending: true })
        .limit(1)
        .single();

      result = {
        isAuth: true,
        userId: verified.userId,
        companyId: membership?.company_id || undefined,
        companyRoles: membership?.roles || undefined,
        canViewCost: membership?.can_view_cost === true,
        aal: verified.aal,
      };
    }

    // Cache only authenticated results — invalid tokens are cheap to re-check
    // and we don't want to lock out a user whose token just refreshed.
    if (result.isAuth) {
      authCache.set(cacheKey, { expiresAt: Date.now() + AUTH_CACHE_TTL_MS, result });
      // Best-effort cleanup of expired entries on each cache miss
      if (authCache.size > 256) {
        const now = Date.now();
        for (const [k, v] of authCache.entries()) {
          if (v.expiresAt <= now) authCache.delete(k);
        }
      }
    }

    return result;
  } catch {
    return { isAuth: false };
  }
}

/**
 * Admin-level access: owner, admin, or manager.
 * Manager has the same operational access as admin EXCEPT cannot invite/remove
 * owner or admin members — that is enforced separately in the members API.
 *
 * @deprecated Prefer `can(roles, '<specific.capability>')` from `lib/permissions`.
 *             Centralizes permissions in one matrix; see todo.md migration plan.
 */
export function isAdminRole(roles?: string[]): boolean {
  if (!roles) return false;
  return roles.includes('admin') || roles.includes('owner') || roles.includes('manager');
}

/**
 * Strict admin: owner or admin only (excludes manager).
 * Use for operations that grant/revoke admin-level access (member management).
 *
 * @deprecated Prefer `can(roles, 'members.grant_admin')` from `lib/permissions`.
 */
export function isStrictAdmin(roles?: string[]): boolean {
  if (!roles) return false;
  return roles.includes('admin') || roles.includes('owner');
}

/**
 * Check if user roles include any of the required roles.
 *
 * @deprecated Prefer a named capability via `can(roles, '<capability>')` from
 *             `lib/permissions`. Inline role arrays are hard to audit and easy to
 *             drift apart from intent.
 */
export function hasAnyRole(userRoles: string[] | undefined, requiredRoles: string[]): boolean {
  if (!userRoles) return false;
  return requiredRoles.some(r => userRoles.includes(r));
}

/**
 * Can access bulk edit (Excel template import/update).
 * owner + admin + manager + warehouse.
 *
 * @deprecated Prefer `can(roles, 'product.bulk_edit')` from `lib/permissions`.
 */
export function canBulkEdit(roles?: string[]): boolean {
  if (!roles) return false;
  return roles.includes('owner') || roles.includes('admin') || roles.includes('manager') || roles.includes('warehouse');
}

/**
 * Can manage inventory operations (transfer, receive, issue, adjust stock).
 * owner + admin + manager + warehouse.
 *
 * @deprecated Prefer `can(roles, 'inventory.manage')` from `lib/permissions`.
 */
export function canManageInventory(roles?: string[]): boolean {
  if (!roles) return false;
  return roles.includes('owner') || roles.includes('admin') || roles.includes('manager') || roles.includes('warehouse');
}

const VALID_ROLES = ['owner', 'admin', 'manager', 'account', 'warehouse', 'sales', 'cashier', 'pc'];
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
    const token = extractRequestToken(request);
    if (!token) {
      return { isAuth: false, isSuperAdmin: false };
    }
    const verified = await verifyAccessToken(token);
    if (!verified) {
      return { isAuth: false, isSuperAdmin: false };
    }

    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('is_super_admin')
      .eq('id', verified.userId)
      .single();

    return {
      isAuth: true,
      isSuperAdmin: profile?.is_super_admin === true,
      userId: verified.userId,
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
    const token = extractRequestToken(request);
    if (!token) {
      return { isAuth: false };
    }
    const verified = await verifyAccessToken(token);
    if (!verified) {
      return { isAuth: false };
    }

    return { isAuth: true, userId: verified.userId };
  } catch {
    return { isAuth: false };
  }
}
