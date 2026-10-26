import { SOUND_COMMENT_MAX, SOUND_UPLOAD_MAX_BYTES, UPLOAD_TYPES, isSoundKey, parsePair, parseSoundComment, parseSoundPick, soundKey } from '../shared/forum-sounds.ts';
import { newState } from './forum-auth.ts';
import { NO_STORE, forumMember, readLimited, readLimitedText } from './forum-api.ts';

// Sound lab routes (issue #366), members only; forumMember applies the forum's session and Origin rules.
const PICK_MAX_BYTES = 512;
const FILE_PREFIX = '/api/forum/sons/arquivo/';

const bad = (why: string, status = 400) => new Response(why, { status, headers: NO_STORE });

export async function soundsApi(req: Request, env: Env, url: URL): Promise<Response> {
  const user = await forumMember(req, env, url);
  if (user instanceof Response) return user;
  const forum = env.FORUM.get(env.FORUM.idFromName('forum'));
  const path = url.pathname;

  if (path === '/api/forum/sons' && req.method === 'GET') return Response.json(await forum.soundState(user.id), { headers: NO_STORE });

  if (path.startsWith(FILE_PREFIX) && req.method === 'GET') {
    // valid keys never need percent-decoding, so the raw path is matched as is
    const key = path.slice(FILE_PREFIX.length);
    if (!isSoundKey(key)) return bad('not found', 404);
    const obj = await env.SOUNDS.get(key);
    if (!obj) return bad('not found', 404);
    // keys never change content (uploads get a fresh random name), so the browser may keep them; private: members only
    // the pack index changes when the pack script runs again, so it is always revalidated
    const headers = new Headers({ 'cache-control': key === 'pack/index.json' ? 'private, no-cache' : 'private, max-age=86400', 'x-content-type-options': 'nosniff' });
    obj.writeHttpMetadata(headers);
    return new Response(obj.body, { headers });
  }

  if (req.method !== 'POST') return bad('not found', 404);

  if (path === '/api/forum/sons/candidato') {
    const pick = parseSoundPick((await readLimitedText(req, PICK_MAX_BYTES)) ?? '');
    if (!pick?.src?.startsWith('pack:')) return bad('bad candidate');
    if (!(await env.SOUNDS.head(soundKey(pick.src)))) return bad('no such pack file', 404);
    await forum.addCandidate(pick.spell, pick.moment, pick.src, user);
    return Response.json(await forum.soundState(user.id), { headers: NO_STORE });
  }

  if (path === '/api/forum/sons/envio') {
    const pair = parsePair(url.searchParams.get('spell'), url.searchParams.get('moment'));
    const type = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const ext = Object.hasOwn(UPLOAD_TYPES, type) ? UPLOAD_TYPES[type as keyof typeof UPLOAD_TYPES] : null;
    if (!pair || !ext) return bad('bad upload');
    // only size and type are checked here: the 5 s limit is checked by the page (decodeAudioData) before sending
    const bytes = await readLimited(req, SOUND_UPLOAD_MAX_BYTES);
    if (bytes === null) return bad('file too large', 413);
    if (!bytes.byteLength) return bad('empty file');
    const src = `up:${newState()}.${ext}`;
    await env.SOUNDS.put(soundKey(src), bytes, { httpMetadata: { contentType: ext === 'wav' ? 'audio/wav' : type } });
    if (await forum.addCandidate(pair.spell, pair.moment, src, user)) return Response.json(await forum.soundState(user.id), { headers: NO_STORE });
    // refused after the put (the caps are checked with the insert): the file goes away again
    await env.SOUNDS.delete(soundKey(src));
    return bad('upload limit reached', 429);
  }

  if (path === '/api/forum/sons/voto') {
    const pick = parseSoundPick((await readLimitedText(req, PICK_MAX_BYTES)) ?? '');
    if (!pick) return bad('bad vote');
    return (await forum.vote(pick.spell, pick.moment, pick.src, user.id)) ? Response.json(await forum.soundState(user.id), { headers: NO_STORE }) : bad('unknown option', 409);
  }

  if (path === '/api/forum/sons/comentario') {
    // JSON escaping can triple the characters: the byte cap is generous, the parser enforces SOUND_COMMENT_MAX
    const c = parseSoundComment((await readLimitedText(req, SOUND_COMMENT_MAX * 8)) ?? '');
    if (!c) return bad('bad comment');
    await forum.comment(c.spell, c.text, user);
    return Response.json(await forum.soundState(user.id), { headers: NO_STORE });
  }

  return bad('not found', 404);
}
