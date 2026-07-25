// Path: proxy.ts (Next.js 16 middleware — renamed from middleware.ts)
// Edge route protection, same architecture as aoosocial/aoobooking:
// unauthenticated visitors never receive a protected page shell.
//
// Deliberately conservative:
// - Protected route gate = auth cookie PRESENCE only. An expired access
//   token with a live refresh token must pass so the client can refresh —
//   verifying here would bounce legitimately logged-in users.
// - /login|/register redirect for logged-in users = locally VERIFIED token
//   only (jwt-local, ES256). A stale/dead cookie must not cause a
//   login→onboarding→login loop.
// - /api is excluded entirely (matcher): routes self-guard via
//   checkAuthWithCompany, and webhooks/crons use their own secrets.

import { NextRequest, NextResponse } from 'next/server';
import { hasAuthCookie, getAccessTokenFromCookies } from '@/lib/auth/cookie-token';
import { verifyJwtLocally } from '@/lib/auth/jwt-local';

// Mirrors PUBLIC_ROUTES in lib/auth-context.tsx (prefix match) + pages with
// their own guard (/invite, /superadmin). Keep the two lists in sync.
const PUBLIC_PREFIXES = [
  '/login',
  '/register',
  '/auth/callback',
  '/line-callback',
  '/onboarding',
  '/bills',
  '/transfers/receive',
  '/replenishments/receive',
  '/portal/consignment',
  '/supplier-portal',
  '/invite/',
  '/superadmin',
];

function isPublicPath(pathname: string): boolean {
  if (pathname === '/') return true;
  return PUBLIC_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Server actions must never be redirected by middleware (AUTH.md §3.3) —
  // a mid-work auth hiccup would yank the user out of the page. aoocommerce
  // has no server actions today; kept for template parity + future safety.
  const isServerAction = request.method === 'POST' && request.headers.has('next-action');

  if (!isPublicPath(pathname)) {
    // No auth cookie at all → straight to login (with return path).
    if (!hasAuthCookie(request) && !isServerAction) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.search = '';
      url.searchParams.set('redirect', pathname + request.nextUrl.search);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Logged-in users landing on /login or /register → back to where they were
  // headed (?redirect= must always be forwarded — AUTH.md §3.5), else
  // onboarding. Requires a locally verified (non-expired) token so dead
  // cookies can't loop.
  if (pathname === '/login' || pathname === '/register') {
    const token = getAccessTokenFromCookies(request.cookies.getAll());
    if (token) {
      const result = await verifyJwtLocally(token);
      if (result.ok) {
        const url = request.nextUrl.clone();
        const back = request.nextUrl.searchParams.get('redirect');
        if (back && back.startsWith('/') && !back.startsWith('//')) {
          const target = new URL(back, request.url);
          url.pathname = target.pathname;
          url.search = target.search;
        } else {
          url.pathname = '/onboarding';
          url.search = '';
        }
        return NextResponse.redirect(url);
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  // Everything except /api, Next internals, and static files (any path with a dot).
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
