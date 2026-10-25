import { parseForumPost } from '../shared/forum.ts';
import { ROOM_MODE_PARAM, type RoomMode } from '../shared/match.ts';
import { styleRows } from '../shared/telemetry.ts';

export { Forum } from './forum-do.ts';
export { Lobby } from './lobby.ts';
export { Room } from './room-do.ts';

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => LETTERS[b % LETTERS.length]).join('');
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const lobby = env.LOBBY.get(env.LOBBY.idFromName('lobby'));

    if (url.pathname === '/api/health') return new Response('ok');
    if (url.pathname === '/api/telemetry') return Response.json(await lobby.telemetry(), { headers: { 'cache-control': 'no-store' } });
    if (url.pathname === '/api/telemetry/resources') return Response.json(await lobby.resourceSamples(), { headers: { 'cache-control': 'no-store' } });
    // jeito de jogar: uma linha por humano e por dificuldade dos bots (telemetry.ts styleRows)
    if (url.pathname === '/api/telemetry/style') return Response.json(styleRows(await lobby.telemetry()), { headers: { 'cache-control': 'no-store' } });

    if (url.pathname === '/api/forum') {
      const forum = env.FORUM.get(env.FORUM.idFromName('forum'));
      const headers = { 'cache-control': 'no-store' };
      if (req.method === 'GET') return Response.json(await forum.list(), { headers });
      if (req.method === 'POST') {
        const text = parseForumPost(await req.text());
        return text === null ? new Response('bad forum post', { status: 400, headers }) : Response.json(await forum.add(text), { headers });
      }
      return new Response('method not allowed', { status: 405, headers: { allow: 'GET, POST' } });
    }

    // a sala nasce no leste dos EUA (Fernando, 21/10: fixar no leste dos EUA): Durable Object não existe na América do Sul, e sem a
    // dica a sala nascia perto de onde entrou o pedido, às vezes Vancouver (medido do Brasil em 21/10: 0,2 s para conectar contra 0,1 s
    // por Jacksonville/Charlotte). A dica só vale na criação; sala já criada fica onde está
    const roomStub = (code: string) => env.ROOM.get(env.ROOM.idFromName(code), { locationHint: 'enam' });

    if (url.pathname === '/api/rooms' && req.method === 'POST') {
      let id = newCode();
      while (await lobby.has(id)) id = newCode();
      // Ascension and Campaign rooms: their own Play menu options, locked to the mode (?modo=ascensao | campanha)
      const modo = url.searchParams.get('modo');
      await roomStub(id).init(id, (Object.keys(ROOM_MODE_PARAM) as RoomMode[]).find((k) => ROOM_MODE_PARAM[k] === modo));
      return Response.json({ id });
    }

    const isUpgrade = req.headers.get('Upgrade') === 'websocket';
    if (url.pathname === '/ws/lobby' && isUpgrade) return lobby.fetch(req);

    const room = url.pathname.match(/^\/ws\/room\/([A-Z]{4})$/);
    if (room && isUpgrade) return roomStub(room[1]).fetch(req);

    return new Response('não encontrado', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
