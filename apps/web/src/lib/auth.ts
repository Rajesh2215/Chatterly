/**
 * Auth State — In-Memory Token Store
 *
 * Access token is intentionally kept in memory only (NOT localStorage).
 * - localStorage is XSS-readable. A malicious script could steal it.
 * - Memory is not accessible to injected scripts.
 * - Refresh token is in httpOnly cookie (browser manages it, JS cannot read it).
 */

interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  statusText?: string;
}

// In-memory state — cleared on page refresh (intentional; refresh token cookie restores it)
let _accessToken: string | null = null;
let _currentUser: AuthUser | null = null;

export function setAccessToken(token: string | null) {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

export function setCurrentUser(user: AuthUser | null) {
  _currentUser = user;
}

export function getCurrentUser(): AuthUser | null {
  return _currentUser;
}

export function clearAuth() {
  _accessToken = null;
  _currentUser = null;
}

export function isAuthenticated(): boolean {
  return _accessToken !== null;
}

export type { AuthUser };
