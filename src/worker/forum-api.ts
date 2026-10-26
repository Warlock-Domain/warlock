import { FORUM_ORG, parseTesterName, type ForumLogin, type ForumMe, type ForumUser } from '../shared/forum.ts';
import { SESSION_COOKIE, SESSION_TTL_S, STATE_COOKIE, cookie, isActiveMember, newState, readCookie, signSession, verifySession } from './forum-auth.ts';

// Secrets: `wrangler secret put` on the live Worker, `.dev.vars` on localhost. PR environments get FORUM_TESTER and a per-deploy
// FORUM_SESSION_KEY from pr-env.yml instead of GitHub keys. FORUM_ORIGIN is only for `wrangler dev`, which rewrites the request URL
// (and Origin) to the live route host, so the GitHub callback would otherwise point at the live site.
declare global {
  interface Env {
    GITHUB_CLIENT_ID?: string;
    GITHUB_CLIENT_SECRET?: string;
    FORUM_SESSION_KEY?: string;
    FORUM_TESTER?: string;
    FORUM_ORIGIN?: string;
  }
}
export type ForumEnv = Pick<Env, 'GITHUB_CLIENT_ID' | 'GITHUB_CLIENT_SECRET' | 'FORUM_SESSION_KEY' | 'FORUM_TESTER' | 'FORUM_ORIGIN'>;

export const NO_STORE = { 'cache-control': 'no-store' };
const TESTER_BODY_MAX_BYTES = 1024;

function loginMode(env: ForumEnv): ForumLogin {
  if (!env.FORUM_SESSION_KEY) return 'off';
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) return 'github';
  // tester mode never wins over real GitHub keys, so a stray FORUM_TESTER on the live Worker cannot open it
  return env.FORUM_TESTER === '1' ? 'tester' : 'off';
}

function redirect(to: string, ...cookies: string[]) {
  const headers = new Headers({ location: to, ...NO_STORE });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(null, { status: 302, headers });
}

const github = (url: string, token: string) =>
  fetch(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'warlock-forum' } });

type GithubUser = { id: number; login: string; name: string | null; avatar_url: string };
const isGithubUser = (u: unknown): u is GithubUser =>
  typeof u === 'object' && u !== null && typeof (u as GithubUser).id === 'number' && typeof (u as GithubUser).login === 'string'
  && typeof (u as GithubUser).avatar_url === 'string';

// null: the body is larger than maxBytes (checked on the declared length and again while reading)
export async function readLimited(req: Request, maxBytes: number): Promise<Uint8Array | null> {
  const body = req.body;
  if (!body) return new Uint8Array();
  const length = Number(req.headers.get('content-length'));
  if (Number.isFinite(length) && length > maxBytes) {
    await body.cancel().catch(() => {});
    return null;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readLimitedText(req: Request, maxBytes: number): Promise<string | null> {
  const bytes = await readLimited(req, maxBytes);
  return bytes && new TextDecoder().decode(bytes);
}

// The signed-in member behind a forum data request (the sound lab, src/worker/forum-sounds-api.ts), or the refusal to send back.
// Same Origin rule as forumApi: data routes live in their own module so the Vitest graph of this file stays free of R2 types
export async function forumMember(req: Request, env: ForumEnv, url: URL): Promise<ForumUser | Response> {
  if (req.method === 'POST' && req.headers.get('origin') !== url.origin) return new Response('bad origin', { status: 403, headers: NO_STORE });
  const user = loginMode(env) === 'off' ? null : await verifySession(readCookie(req.headers.get('cookie'), SESSION_COOKIE), env.FORUM_SESSION_KEY ?? '');
  return user ?? new Response('sign in first', { status: 401, headers: NO_STORE });
}

export async function forumApi(req: Request, env: ForumEnv, url: URL): Promise<Response> {
  const mode = loginMode(env);
  const key = env.FORUM_SESSION_KEY ?? '';
  const callback = `${env.FORUM_ORIGIN ?? url.origin}/api/forum/callback`;
  // SameSite=Lax already sends no cookie on a cross-site POST; the Origin check also stops a cross-site tester sign-in
  if (req.method === 'POST' && req.headers.get('origin') !== url.origin) return new Response('bad origin', { status: 403, headers: NO_STORE });

  if (url.pathname === '/api/forum/me' && req.method === 'GET') {
    const user = mode === 'off' ? null : await verifySession(readCookie(req.headers.get('cookie'), SESSION_COOKIE), key);
    return Response.json({ user, login: mode } satisfies ForumMe, { headers: NO_STORE });
  }

  if (url.pathname === '/api/forum/login' && req.method === 'GET' && mode === 'github') {
    const state = newState();
    const auth = new URL('https://github.com/login/oauth/authorize');
    // read:org is the smallest scope that also sees private org memberships
    auth.search = new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID!, redirect_uri: callback, scope: 'read:org', state }).toString();
    return redirect(auth.href, cookie(STATE_COOKIE, state, 600));
  }

  if (url.pathname === '/api/forum/callback' && req.method === 'GET' && mode === 'github') {
    const clear = cookie(STATE_COOKIE, '', 0);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state || state !== readCookie(req.headers.get('cookie'), STATE_COOKIE)) return redirect('/forum?erro=estado', clear);
    try {
      const res = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'warlock-forum' },
        body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: callback }),
      });
      const token = ((await res.json()) as { access_token?: unknown }).access_token;
      if (typeof token !== 'string') return redirect('/forum?erro=github', clear);
      const [me, member] = await Promise.all([github('https://api.github.com/user', token), github(`https://api.github.com/user/memberships/orgs/${FORUM_ORG}`, token)]);
      const u: unknown = me.ok ? await me.json() : null;
      if (!isGithubUser(u)) return redirect('/forum?erro=github', clear);
      if (!isActiveMember(member.status, member.ok ? await member.json() : null)) return redirect('/forum?erro=membro', clear);
      const user: ForumUser = { id: `gh-${u.id}`, login: u.login, name: u.name || u.login, avatar: u.avatar_url };
      return redirect('/forum', clear, cookie(SESSION_COOKIE, await signSession(user, key), SESSION_TTL_S));
    } catch {
      // GitHub down or answering garbage: the person just tries again
      return redirect('/forum?erro=github', clear);
    }
  }

  if (url.pathname === '/api/forum/tester' && req.method === 'POST' && mode === 'tester') {
    const raw = await readLimitedText(req, TESTER_BODY_MAX_BYTES);
    if (raw === null) return new Response('forum request too large', { status: 413, headers: NO_STORE });
    const name = parseTesterName(raw);
    if (name === null) return new Response('bad tester name', { status: 400, headers: NO_STORE });
    const user: ForumUser = { id: `tester-${newState()}`, login: 'tester', name, avatar: '', tester: true };
    return Response.json(user, { headers: { ...NO_STORE, 'set-cookie': cookie(SESSION_COOKIE, await signSession(user, key), SESSION_TTL_S) } });
  }

  if (url.pathname === '/api/forum/logout' && req.method === 'POST') {
    return new Response(null, { status: 204, headers: { ...NO_STORE, 'set-cookie': cookie(SESSION_COOKIE, '', 0) } });
  }

  return new Response('não encontrado', { status: 404, headers: NO_STORE });
}
