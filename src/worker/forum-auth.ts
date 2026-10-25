import type { ForumUser } from '../shared/forum.ts';

// Pure session helpers (WebCrypto only, no Workers imports) so Vitest can run them in Node.
// __Host- cookies cannot be set by another subdomain: a pr-<n>-warlock page could otherwise plant its own forum_state for the
// live site (both live under fernandorffdev.com) and sign a victim into the attacker's account. The prefix requires Path=/
export const SESSION_COOKIE = '__Host-forum_session';
export const STATE_COOKIE = '__Host-forum_state';
// a week: someone removed from the org keeps a session at most this long (no session table to revoke it)
export const SESSION_TTL_S = 7 * 24 * 3600;

const enc = new TextEncoder();
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const hmacKey = (secret: string) => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

export const newState = () => b64url(crypto.getRandomValues(new Uint8Array(16)));

// The session is the user itself, signed: no session table, and the GitHub token is never kept.
export async function signSession(user: ForumUser, secret: string, now = Date.now()): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify({ ...user, exp: now + SESSION_TTL_S * 1000 })));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifySession(token: string | undefined, secret: string, now = Date.now()): Promise<ForumUser | null> {
  const [body, sig, extra] = token?.split('.') ?? [];
  if (!body || !sig || extra !== undefined) return null;
  try {
    // subtle.verify compares in constant time, unlike comparing two signature strings
    if (!(await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64url(sig), enc.encode(body)))) return null;
    const { exp, ...user } = JSON.parse(new TextDecoder().decode(unb64url(body)));
    return typeof exp === 'number' && exp > now ? (user as ForumUser) : null;
  } catch {
    return null;
  }
}

export function readCookie(header: string | null, name: string): string | undefined {
  for (const part of header?.split(';') ?? []) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
}

// Only the forum API reads these cookies; scripts on the page never do.
export const cookie = (name: string, value: string, maxAge: number) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

// GET /user/memberships/orgs/{org} answers 404 for non-members and state 'pending' for an unaccepted invite.
export const isActiveMember = (status: number, body: unknown) =>
  status === 200 && typeof body === 'object' && body !== null && (body as { state?: unknown }).state === 'active';

export const isOrgAdmin = (body: unknown) => typeof body === 'object' && body !== null && (body as { role?: unknown }).role === 'admin';
