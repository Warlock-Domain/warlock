import { DurableObject } from 'cloudflare:workers';
import { DT, SEND_EVERY } from '../shared/constants.ts';
import { addPlayer, buy, buyItem, buyMastery, endIdle, kick, newMatch, removePlayer, resume, setCharacter, setReady, shouldRun, startMatch, tickMatch, type Match } from '../shared/match.ts';
import { parseClientMessage, publicId, publicRoom, type ServerMsg } from '../shared/protocol.ts';
import type { Cmd, SimEvent } from '../shared/sim.ts';
import { encodeSnap, publicEvents } from '../shared/snapshot.ts';
import { v } from '../shared/vec.ts';

const STEP_MS = DT * 1000;
const MAX_CATCHUP = 5; // passos por chamada do laço; atraso maior que isso é descartado
const EMPTY_MS = 5 * 60_000;
const IDLE_MS = 3 * 60_000; // partida sem nenhum comando de gente por 3 min é encerrada

type Saved = { id: string; match: Match };
type Attachment = { playerId: string | null };

// Uma sala: guarda a partida na memória e roda a simulação enquanto houver alguém conectado.
// Só grava no disco quando muda a fase ou a lista de jogadores (o mundo da rodada não é gravado).
export class Room extends DurableObject<Env> {
  private saved: Saved | null | undefined; // undefined = ainda não leu do disco
  private loop: ReturnType<typeof setInterval> | null = null;
  private last = 0;
  private acc = 0;
  private steps = 0;
  private cmds: Cmd[] = [];
  private acks = new Map<string, number>();
  private events: SimEvent[] = [];
  private lastCmdAt = Date.now();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  private async load(): Promise<Saved | null> {
    if (this.saved === undefined) {
      this.saved = (await this.ctx.storage.get<Saved>('room')) ?? null;
      if (this.saved) {
        resume(this.saved.match, Date.now());
        // depois de reiniciar, conectado é só quem tem socket vivo agora
        const liveIds = new Set(this.live().map((ws) => this.playerOf(ws)));
        for (const p of this.saved.match.players) if (!p.bot) p.connected = liveIds.has(p.id);
        // a sala reiniciou (ex.: publicação nova) com gente conectada: avisa a fase nova e religa o laço.
        // Sem ninguém (ex.: o alarme de limpeza acordou a sala), não mexe no lobby nem no alarme.
        if (this.live().length) void this.changed();
      }
    }
    return this.saved;
  }

  private lobby() {
    return this.env.LOBBY.get(this.env.LOBBY.idFromName('lobby'));
  }

  private playerOf(ws: WebSocket): string | null {
    return (ws.deserializeAttachment() as Attachment | null)?.playerId ?? null;
  }

  private live(except?: WebSocket): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => ws !== except && this.playerOf(ws) !== null);
  }

  private humans(except?: WebSocket): number {
    return new Set(this.live(except).map((ws) => this.playerOf(ws))).size;
  }

  async init(id: string) {
    if (await this.load()) return;
    this.saved = { id, match: newMatch() };
    await this.persist();
    // sala criada e nunca aberta também é limpa
    await this.ctx.storage.setAlarm(Date.now() + EMPTY_MS);
  }

  async fetch(): Promise<Response> {
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ playerId: null } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const msg = typeof raw === 'string' ? parseClientMessage(raw) : null;
    if (!msg) return send(ws, { t: 'error', code: 'bad_msg', msg: 'Mensagem inválida.' });
    const s = await this.load();
    if (!s) return send(ws, { t: 'error', code: 'not_found', msg: 'Sala não encontrada.' });
    const m = s.match;
    const now = Date.now();

    if (msg.t === 'hello') {
      // um socket é uma pessoa: não deixa o mesmo socket registrar vários jogadores
      const current = this.playerOf(ws);
      if (current && current !== msg.playerId) return send(ws, { t: 'error', code: 'bad_msg', msg: 'Esta conexão já é de outro jogador.' });
      for (const other of this.live(ws)) {
        if (this.playerOf(other) !== msg.playerId) continue;
        send(other, { t: 'error', code: 'other_tab', msg: 'Sala aberta em outra aba.' });
        forget(other);
      }
      if (!addPlayer(m, msg.playerId, msg.name)) return send(ws, { t: 'error', code: 'full', msg: 'Sala cheia.' });
      ws.serializeAttachment({ playerId: msg.playerId } satisfies Attachment);
      return this.changed();
    }

    const id = this.playerOf(ws);
    if (!id) return send(ws, { t: 'error', code: 'bad_msg', msg: 'Envie hello primeiro.' });
    if (msg.t !== 'alive') this.lastCmdAt = now;
    // comandos de jogo só valem com a rodada rolando (fora dela a fila cresceria sem limite)
    const playing = m.phase === 'playing';
    switch (msg.t) {
      case 'alive':
        return;
      case 'move':
        if (!playing) return;
        this.cmds.push({ id, kind: 'move', to: v(msg.x, msg.y) });
        this.acks.set(id, msg.seq);
        return;
      case 'stop':
        if (!playing) return;
        this.cmds.push({ id, kind: 'stop' });
        this.acks.set(id, msg.seq);
        return;
      case 'cast':
        if (!playing) return;
        this.cmds.push({ id, kind: 'cast', spell: msg.spell, at: v(msg.x, msg.y) });
        this.acks.set(id, msg.seq);
        return;
      case 'start':
        if (startMatch(m, now, msg.bots)) await this.changed();
        return;
      case 'buy':
        if (buy(m, id, msg.spell)) await this.changed();
        return;
      case 'item':
        if (!playing) return;
        this.cmds.push({ id, kind: 'item', item: msg.item, at: v(msg.x, msg.y) });
        this.acks.set(id, msg.seq);
        return;
      case 'kick': {
        // o cliente só conhece o id público: acha o jogador correspondente
        const target = m.players.find((p) => publicId(s.id, p.id) === msg.target);
        if (target && kick(m, target.id)) await this.changed();
        return;
      }
      case 'buyMastery':
        if (buyMastery(m, id, msg.mastery)) await this.changed();
        return;
      case 'buyItem':
        if (buyItem(m, id, msg.item)) await this.changed();
        return;
      case 'pick':
        if (setCharacter(m, id, msg.character)) await this.changed();
        return;
      case 'ready':
        if (setReady(m, id)) await this.changed();
        return;
    }
  }

  async webSocketClose(ws: WebSocket) {
    await this.dropped(ws);
  }

  async webSocketError(ws: WebSocket) {
    await this.dropped(ws);
  }

  private async dropped(ws: WebSocket) {
    const id = this.playerOf(ws);
    if (!id || this.live(ws).some((o) => this.playerOf(o) === id)) return;
    const s = await this.load();
    if (!s) return;
    removePlayer(s.match, id);
    await this.changed(ws);
  }

  async alarm() {
    const s = await this.load();
    if (!s) return;
    if (this.humans() > 0) return void (await this.ctx.storage.setAlarm(Date.now() + EMPTY_MS));
    this.stopLoop();
    // tira do lobby primeiro; se falhar, tenta de novo daqui a 1 minuto (antes a sala sumia do disco e ficava na lista)
    try {
      await this.lobby().remove(s.id);
    } catch {
      return void (await this.ctx.storage.setAlarm(Date.now() + 60_000));
    }
    this.saved = null;
    await this.ctx.storage.deleteAll();
  }

  // fase ou jogadores mudaram: avisa todos, grava, atualiza o lobby e liga/desliga o laço
  private async changed(closing?: WebSocket) {
    const s = this.saved;
    if (!s) return;
    this.broadcastRoom(closing);
    // laço e alarme antes do disco e do lobby: se o lobby falhar, a sala não congela
    const humans = this.humans(closing);
    if (shouldRun(s.match, humans)) this.startLoop();
    else this.stopLoop();
    if (humans === 0) await this.ctx.storage.setAlarm(Date.now() + EMPTY_MS);
    await this.persist();
  }

  private lobbyKey = '';

  private async persist() {
    const s = this.saved;
    if (!s) return;
    await this.ctx.storage.put('room', { id: s.id, match: { ...s.match, world: null } });
    // o lobby é um objeto só para o site todo: só avisa quando muda o que a lista mostra
    const info = { id: s.id, players: s.match.players.filter((p) => !p.bot && p.connected).length, phase: s.match.phase };
    const key = `${info.players}:${info.phase}`;
    if (key === this.lobbyKey) return;
    try {
      await this.lobby().upsert(info);
      this.lobbyKey = key;
    } catch {
      // tenta de novo na próxima mudança
    }
  }

  private broadcastRoom(closing?: WebSocket) {
    const s = this.saved;
    if (!s) return;
    const room = publicRoom(s.id, s.match, Date.now());
    for (const ws of this.live(closing)) send(ws, { t: 'room', room, you: publicId(s.id, this.playerOf(ws)!) });
  }

  private startLoop() {
    if (this.loop) return;
    this.last = Date.now();
    this.acc = 0;
    this.lastCmdAt = Date.now();
    this.loop = setInterval(() => this.tick(), 16);
  }

  private stopLoop() {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
  }

  private tick() {
    const s = this.saved;
    if (!s) return this.stopLoop();
    const m = s.match;
    const now = Date.now();
    this.acc = Math.min(this.acc + now - this.last, STEP_MS * MAX_CATCHUP);
    this.last = now;
    const before = `${m.phase}:${m.round}:${m.players.length}`;
    while (this.acc >= STEP_MS) {
      this.acc -= STEP_MS;
      const cmds = this.cmds;
      this.cmds = [];
      this.events.push(...tickMatch(m, now, cmds));
      if (++this.steps % SEND_EVERY === 0) this.sendSnaps();
    }
    if (now - this.lastCmdAt > IDLE_MS) endIdle(m);
    if (`${m.phase}:${m.round}:${m.players.length}` !== before) void this.changed();
  }

  private sendSnaps() {
    const s = this.saved;
    const w = s?.match.world;
    const pub = (x: string) => publicId(s!.id, x);
    const events = publicEvents(this.events, pub);
    this.events = [];
    if (!w) return;
    for (const ws of this.live()) {
      const id = this.playerOf(ws)!;
      send(ws, encodeSnap(w, id, this.acks.get(id) ?? 0, events));
    }
  }
}

// solta o socket da sala antes de fechar, para o fechamento não contar como desconexão
function forget(ws: WebSocket) {
  ws.serializeAttachment({ playerId: null } satisfies Attachment);
  try {
    ws.close(4000, 'other_tab');
  } catch {
    // já fechado
  }
}

function send(ws: WebSocket, msg: ServerMsg) {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    // socket já fechado
  }
}
