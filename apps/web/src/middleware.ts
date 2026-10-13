/**
 * Next.js Middleware — Route Protection
 *
 * The access token lives in memory only (JS), so the middleware cannot read it.
 * Instead we check for the `refreshToken` httpOnly cookie as a proxy signal.
 *
 * Strategy:
 * - If no `refreshToken` cookie → user is not logged in → redirect to /login
 * - If on /login or /register with a valid cookie → redirect to / (already logged in)
 *
 * NOTE: The access token itself is validated server-side on each API call.
 * If the refresh token is expired/invalid the /auth/refresh call will fail
 * and the client-side interceptor in client.ts will redirect to /login.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/register'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasRefreshToken = request.cookies.has('chatterly_refresh_token');

  const isPublicPath = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );

  // Unauthenticated user hitting a protected route → /login
  if (!hasRefreshToken && !isPublicPath) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user hitting /login or /register → /
  if (hasRefreshToken && isPublicPath) {
    const homeUrl = new URL('/', request.url);
    return NextResponse.redirect(homeUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Run on all routes except Next.js internals and static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
