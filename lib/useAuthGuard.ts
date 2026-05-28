'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { can, type Capability } from '@/lib/permissions';
import type { UserProfile } from '@/types';

export interface UseAuthGuardOptions {
  /** Where to redirect when not allowed. Default: '/dashboard'. */
  redirectTo?: string;
  /** Skip redirect — caller renders fallback (e.g. <NoPermissionCard />). */
  noRedirect?: boolean;
}

export interface UseAuthGuardResult {
  /** True once auth has loaded AND user has the capability. */
  allowed: boolean;
  /** True while auth context is still loading. */
  loading: boolean;
  /** Current user profile (null until loaded). */
  userProfile: UserProfile | null;
}

/**
 * Client hook that gates a page on a capability.
 *
 * Default behavior:
 *   - while loading → returns { loading: true, allowed: false }
 *   - if not logged in → redirects to /login
 *   - if logged in but lacking capability → redirects to /dashboard
 *
 * Pass `noRedirect: true` to render a fallback (e.g. <NoPermissionCard />) instead.
 *
 * @example
 *   // Page that redirects on no access (most common)
 *   const { allowed, loading } = useAuthGuard('customer.edit');
 *   if (loading) return <LoadingCard />;
 *   if (!allowed) return null;  // already redirecting
 *
 * @example
 *   // Settings-style page that renders NoPermissionCard
 *   const { allowed, loading } = useAuthGuard('settings.access', { noRedirect: true });
 *   if (loading) return <LoadingCard />;
 *   if (!allowed) return <NoPermissionCard />;
 */
export function useAuthGuard(
  capability: Capability,
  options: UseAuthGuardOptions = {},
): UseAuthGuardResult {
  const { userProfile, loading } = useAuth();
  const router = useRouter();
  const { redirectTo = '/dashboard', noRedirect = false } = options;

  const allowed = !loading && !!userProfile && can(userProfile.roles, capability);

  useEffect(() => {
    if (loading) return;
    if (!userProfile) {
      router.push('/login');
      return;
    }
    if (!can(userProfile.roles, capability) && !noRedirect) {
      router.push(redirectTo);
    }
  }, [userProfile, loading, capability, redirectTo, noRedirect, router]);

  return { allowed, loading, userProfile };
}
