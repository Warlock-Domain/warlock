import { afterEach, describe, expect, it, vi } from 'vitest';
import { FORUM_NAME_MAX, parseTesterName, type ForumUser } from '../src/shared/forum.ts';
import { SESSION_COOKIE, SESSION_TTL_S, STATE_COOKIE, cookie, isActiveMember, newState, readCookie, signSession, verifySession } from '../src/worker/forum-auth.ts';
import { forumApi } from '../src/worker/forum-api.ts';

const USER: ForumUser = { id: 'gh-1', login: 'fernandorff', name: 'Fernando', avatar: 'https://avatars.githubusercontent.com/u/1' };
const KEY = 'test-key';

afterEach(() => vi.unstubAllGlobals());

describe('forum session', () => {
  it('round-trips a signed user', async () => {
    expect(await verifySession(await signSession(USER, KEY), KEY)).toEqual(USER);
  });

  it('rejects a tampered body, a wrong key, an expired token and garbage', async () => {
    const token = await signSession(USER, KEY);
    const [, sig] = token.split('.');
    const forged = `${btoa(JSON.stringify({ ...USER, login: 'admin', exp: Date.now() + 1e9 }))}.${sig}`;
    expect(await verifySession(forged, KEY)).toBeNull();
    expect(await verifySession(token, 'other-key')).toBeNull();
    expect(await verifySession(token, KEY, Date.now() + SESSION_TTL_S * 1000 + 1)).toBeNull();
    for (const bad of [undefined, '', 'abc', 'a.b', 'a.b.c', `${token}.x`]) expect(await verifySession(bad, KEY)).toBeNull();
  });

  it('makes a different state every time', () => {
    expect(newState()).not.toBe(newState());
    expect(newState()).toMatch(/^[\w-]{22}$/);
  });
});

describe('forum cookies', () => {
  it('reads one cookie among many and keeps = inside the value', () => {
    expect(readCookie('a=1; __Host-forum_session=x.y=; b=2', SESSION_COOKIE)).toBe('x.y=');
    expect(readCookie(null, SESSION_COOKIE)).toBeUndefined();
    expect(readCookie('__Host-forum_sessionX=1', SESSION_COOKIE)).toBeUndefined();
  });

  it('is a __Host- cookie: HttpOnly, Secure, Lax and Path=/', () => {
    expect(STATE_COOKIE.startsWith('__Host-')).toBe(true);
    expect(cookie(STATE_COOKIE, 'v', 600)).toBe('__Host-forum_state=v; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600');
  });
});

describe('forum membership', () => {
  it('lets in only an active member', () => {
    expect(isActiveMember(200, { state: 'active' })).toBe(true);
    expect(isActiveMember(200, { state: 'pending' })).toBe(false);
    expect(isActiveMember(404, { state: 'active' })).toBe(false);
    expect(isActiveMember(200, null)).toBe(false);
  });

  it('rejects a GitHub profile with a non-string name before signing a session', async () => {
    const state = newState();
    const responses = [
      new Response(JSON.stringify({ access_token: 'token' })),
      new Response(JSON.stringify({ id: 1, login: 'user', name: { invalid: true }, avatar_url: 'https://example.test/avatar' })),
      new Response(JSON.stringify({ state: 'active' })),
    ];
    vi.stubGlobal('fetch', vi.fn(async () => responses.shift()!));
    const url = new URL(`https://example.test/api/forum/callback?code=code&state=${state}`);
    const request = new Request(url, { headers: { cookie: `${STATE_COOKIE}=${state}` } });

    const response = await forumApi(request, {
      GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'secret', FORUM_SESSION_KEY: KEY,
    }, url);

    expect(response.headers.get('location')).toBe('/forum?erro=github');
    expect(response.headers.get('set-cookie')).not.toContain(`${SESSION_COOKIE}=`);
  });
});

describe('forum tester name', () => {
  it('accepts a trimmed name and rejects everything else', () => {
    expect(parseTesterName('{"name":"  Leo "}')).toBe('Leo');
    expect(parseTesterName(JSON.stringify({ name: 'x'.repeat(FORUM_NAME_MAX) }))).not.toBeNull();
    expect(parseTesterName(JSON.stringify({ name: 'x'.repeat(FORUM_NAME_MAX + 1) }))).toBeNull();
    for (const bad of ['not json', 'null', '[]', '{}', '{"name":5}', '{"name":"  "}']) expect(parseTesterName(bad)).toBeNull();
  });

  it('rejects an oversized request before parsing the nickname', async () => {
    const url = new URL('https://example.test/api/forum/tester');
    const req = new Request(url, {
      method: 'POST',
      headers: { origin: url.origin },
      body: JSON.stringify({ name: 'x'.repeat(2048) }),
    });
    const response = await forumApi(req, { FORUM_SESSION_KEY: KEY, FORUM_TESTER: '1' }, url);

    expect(response.status).toBe(413);
    expect(response.headers.has('set-cookie')).toBe(false);
  });
});
