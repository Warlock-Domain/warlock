// Requer Node 24 e aceita apenas Wrangler local. A execução completa leva cerca de 12 min com a retenção.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
  base: { type: 'string', default: 'http://127.0.0.1:8787' }, rooms: { type: 'string', default: '3' },
  clients: { type: 'string', default: '2' }, 'duration-seconds': { type: 'string', default: '360' },
  'command-ms': { type: 'string', default: '500' }, 'cleanup-grace-seconds': { type: 'string', default: '45' },
  'skip-ghost': { type: 'boolean', default: false }, out: { type: 'string', default: `balance/room-soak-${new Date().toISOString().replaceAll(':', '-')}` },
} });
const positive = (key, minimum) => { const n = Number(values[key]); assert(Number.isSafeInteger(n) && n >= minimum, `Valor inválido para --${key}`); return n; };
// Cinco minutos cobrem o alarme da sala vazia; depois do tráfego, a janela de retenção é observada novamente.
const roomsN = positive('rooms', 1), clientsN = positive('clients', 1), duration = positive('duration-seconds', 300);
const commandMs = positive('command-ms', 100), cleanupGrace = positive('cleanup-grace-seconds', 5) * 1000;
const baseUrl = new URL(values.base);
assert(['localhost', '127.0.0.1', '[::1]'].includes(baseUrl.hostname), 'O teste de carga aceita apenas uma URL local do Wrangler');
const base = baseUrl.origin, wsBase = base.replace(/^http/, 'ws');
await mkdir(values.out, { recursive: true });
const report = {
  workload: { base, rooms: roomsN, clientsPerRoom: clientsN, durationSeconds: duration, commandIntervalMs: commandMs, ghost: !values['skip-ghost'],
    targets: { simulationHz: 60, snapshotHz: 30 }, cleanupGraceMs: cleanupGrace },
  startedAt: new Date().toISOString(), roomIds: [], errors: [],
  lifecycle: [],
  runtimeMetrics: { worker: null, note: 'Wrangler dev does not expose Durable Object CPU or memory counters through this app.' },
};
const started = Date.now(), cpuStart = process.cpuUsage(), memoryStart = process.memoryUsage();
const EMPTY_ROOM_ALARM_MS = 5 * 60_000; // O alarme do servidor remove a sala vazia após cinco minutos.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const percentile = (values, p) => values.length ? values.slice().sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)] : null;
const roomSnapshot = () => Object.fromEntries([...lobby.rooms].map(([id, info]) => [id, info.players]));

class LobbyWatch {
  rooms = new Map();
  errors = [];
  received = false;
  constructor() { this.ws = new WebSocket(`${wsBase}/ws/lobby`); }
  async open() {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('O lobby não abriu')), 10_000);
      this.ws.onopen = () => { clearTimeout(timer); resolve(); };
      this.ws.onerror = () => { clearTimeout(timer); reject(new Error('Falha no WebSocket do lobby')); };
    });
    this.ws.onmessage = (e) => {
      try {
        const message = JSON.parse(String(e.data));
        if (message.t === 'rooms' && Array.isArray(message.rooms)) { this.rooms = new Map(message.rooms.map((r) => [r.id, r])); this.received = true; }
      } catch (error) { this.errors.push(String(error)); }
    };
    assert(await this.until(() => this.received), 'O lobby não enviou a lista inicial de salas');
    // Mantém a conexão do observador viva no mesmo intervalo de heartbeat dos clientes.
    this.ping = setInterval(() => { if (this.ws.readyState === WebSocket.OPEN) this.ws.send('ping'); }, 10_000);
  }
  async until(test, timeout = 10_000) {
    const end = Date.now() + timeout;
    while (!test() && Date.now() < end) await sleep(100);
    return test();
  }
  close() { clearInterval(this.ping); this.ws.close(); }
}

class PlayerClient {
  constructor(roomId, playerId, onRoom = () => {}) {
    this.roomId = roomId; this.playerId = playerId; this.onRoom = onRoom;
    this.snapshots = 0; this.commands = 0; this.acks = []; this.pending = new Map(); this.errors = [];
    this.closes = 0; this.reconnects = 0; this.seq = 0; this.room = null; this.joinedAt = 0; this.activeMs = 0; this.ping = null;
    this.ghost = false;
  }
  async connect({ heartbeat = true } = {}) {
    const ws = new WebSocket(`${wsBase}/ws/room/${this.roomId}`);
    this.ws = ws;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Tempo esgotado ao abrir o socket de ${this.playerId}`)), 10_000);
      ws.onopen = () => { clearTimeout(timer); resolve(); };
      ws.onerror = () => { clearTimeout(timer); reject(new Error(`Falha no socket de ${this.playerId}`)); };
    });
    this.joinedAt = Date.now();
    ws.onmessage = (e) => this.message(String(e.data));
    ws.onclose = () => { this.closes++; this.activeMs += Math.max(0, Date.now() - this.joinedAt); };
    ws.send(JSON.stringify({ t: 'hello', playerId: this.playerId, name: this.playerId }));
    if (heartbeat) this.ping = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send('ping'); }, 10_000);
    const joined = await this.until(() => !!this.room, 10_000);
    if (!joined) throw new Error(`A sala não enviou estado após o hello de ${this.playerId}`);
  }
  message(raw) {
    if (raw === 'pong') return;
    let m;
    try { m = JSON.parse(raw); } catch { this.errors.push('JSON inválido'); return; }
    if (m.t === 'room') {
      this.room = m.room;
      this.onRoom(m.room);
    } else if (m.t === 'snap') {
      this.snapshots++;
      const now = performance.now();
      for (const [seq, sent] of this.pending) if (seq <= m.ack) { this.acks.push(now - sent); this.pending.delete(seq); }
    } else if (m.t === 'error') this.errors.push(`${m.code}: ${m.msg}`);
  }
  async until(test, timeout) {
    const end = Date.now() + timeout;
    while (!test() && Date.now() < end) await sleep(50);
    return test();
  }
  send(message) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message)); }
  command() {
    if (this.ghost || this.room?.phase !== 'playing' || this.ws?.readyState !== WebSocket.OPEN) return;
    const seq = ++this.seq;
    const a = seq * 37 % 1600, b = seq * 71 % 1600;
    const message = seq % 4 === 0
      ? { t: 'cast', spell: 'fireball', x: a / 100 - 8, y: b / 100 - 8, seq }
      : { t: 'move', x: a / 100 - 8, y: b / 100 - 8, seq };
    this.pending.set(seq, performance.now()); this.commands++; this.send(message);
  }
  async reconnect() {
    clearInterval(this.ping); this.ping = null;
    const old = this.ws;
    const closed = new Promise((resolve) => { old.addEventListener('close', resolve, { once: true }); });
    old.close();
    await Promise.race([closed, sleep(3000)]);
    this.room = null;
    await this.connect();
    this.reconnects++;
  }
  close() { clearInterval(this.ping); this.ping = null; this.ws?.close(); }
}

let lobby;
const clients = [];
let orphanId;
let lateJoin;
let actionTimer;
try {
  lobby = new LobbyWatch();
  await lobby.open();
  const createRoom = async () => {
    const response = await fetch(`${base}/api/rooms`, { method: 'POST' });
    assert(response.ok, `Falha ao criar sala: ${response.status}`);
    const data = await response.json();
    assert(/^[A-Z]{4}$/.test(data.id), 'O Worker retornou um código de sala inválido');
    report.roomIds.push(data.id);
    return data.id;
  };

  // Sala sem nenhum jogador: mede a limpeza da sala criada e nunca aberta.
  orphanId = await createRoom();
  report.lifecycle.push({ at: new Date().toISOString(), event: 'empty-room-created', roomId: orphanId });
  const activeIds = await Promise.all(Array.from({ length: roomsN }, createRoom));
  const allRoomIds = [...activeIds, orphanId];
  const startRoom = async (roomId, roomIndex) => {
    const group = [];
    for (let i = 0; i < clientsN; i++) {
      const id = `soak${String(roomIndex).padStart(2, '0')}c${String(i).padStart(2, '0')}`;
      const c = new PlayerClient(roomId, id);
      group.push(c); clients.push(c);
    }
    await Promise.all(group.map((c) => c.connect()));
    const ghost = roomIndex === 0 && !values['skip-ghost'] ? new PlayerClient(roomId, `soakghost${String(roomIndex).padStart(2, '0')}`) : null;
    if (ghost) { ghost.ghost = true; await ghost.connect({ heartbeat: false }); group.push(ghost); clients.push(ghost); report.ghostPlayer = ghost.playerId; }
    group.forEach((c) => c.onRoom = (room) => {
      if (room.phase === 'shop' && !c.readySent) { c.readySent = true; c.send({ t: 'ready' }); }
    });
    group[0].send({ t: 'start', bots: Math.max(0, 2 - clientsN), mode: 'rounds' });
    return group;
  };
  await Promise.all(activeIds.map(startRoom));
  const trafficStarted = Date.now();
  report.initialLobby = roomSnapshot();
  assert(await lobby.until(() => activeIds.every((id) => lobby.rooms.get(id)?.players === clientsN + (id === activeIds[0] && !values['skip-ghost'] ? 1 : 0))), 'O lobby não convergiu à ocupação inicial das salas');
  actionTimer = setInterval(() => { for (const c of clients) c.command(); }, commandMs);

  if (clients.length) {
    await sleep(1500);
    const reconnect = clients[0];
    await reconnect.reconnect();
  }

  // Dez segundos antes do prazo exercita a corrida entre entrada e alarme de sala vazia.
  const lateJoinAt = started + EMPTY_ROOM_ALARM_MS - 10_000;
  let didLateJoin = false;
  while (Date.now() - started < duration * 1000) {
    if (!didLateJoin && Date.now() >= lateJoinAt) {
      lateJoin = new PlayerClient(orphanId, 'soak-late-join-001');
      clients.push(lateJoin);
      await lateJoin.connect();
      report.lifecycle.push({ at: new Date().toISOString(), event: 'late-join-connected', roomId: orphanId, roomPhase: lateJoin.room?.phase, socketState: lateJoin.ws.readyState });
      didLateJoin = true;
    }
    await sleep(1000);
  }
  clearInterval(actionTimer); actionTimer = null;
  const trafficStopped = Date.now();
  for (const c of clients) await c.until(() => c.pending.size === 0, 10_000);
  // A reconciliação roda a cada 60 s; dez segundos extras cobrem a entrega do snapshot do lobby.
  const occupancyConverged = await lobby.until(() => lobby.rooms.get(orphanId)?.players === 1 && activeIds.every((id) => lobby.rooms.get(id)?.players === clientsN), 70_000);
  const ghost = clients.find((c) => c.playerId.startsWith('soakghost'));
  if (ghost && !values['skip-ghost']) await ghost.until(() => ghost.closes > 0, 10_000);
  report.lifecycle.push({ at: new Date().toISOString(), event: 'post-soak-occupancy', roomId: orphanId, lobby: roomSnapshot(), lateJoinSocketState: lateJoin?.ws?.readyState, lateJoinCloses: lateJoin?.closes, lateJoinRoomPhase: lateJoin?.room?.phase, lateJoinErrors: lateJoin?.errors, ghostSocketState: ghost?.ws?.readyState, ghostCloses: ghost?.closes, ghostErrors: ghost?.errors });
  assert(occupancyConverged, 'O lobby não convergiu após limpar o fantasma e aceitar a entrada perto do prazo');
  assert.equal(lobby.rooms.get(orphanId)?.players, 1, 'A sala que recebeu alguém perto do prazo foi removida');
  assert.ok(values['skip-ghost'] || ghost?.closes, 'O alarme não fechou o socket fantasma sem heartbeat');
  report.soakLobby = roomSnapshot();

  for (const c of clients) c.close();
  const cleanupAt = Date.now() + EMPTY_ROOM_ALARM_MS + cleanupGrace;
  while (Date.now() < cleanupAt) await sleep(Math.min(1000, cleanupAt - Date.now()));
  report.finalLobby = roomSnapshot();
  for (const id of allRoomIds) assert.equal(lobby.rooms.has(id), false, `A sala vazia ${id} continua no lobby após a retenção`);

  const elapsed = (Date.now() - started) / 1000;
  const trafficElapsed = (trafficStopped - trafficStarted) / 1000;
  const commandLatencies = clients.flatMap((c) => c.acks);
  report.results = {
    elapsedSeconds: elapsed,
    trafficSeconds: trafficElapsed,
    concurrentRooms: roomsN,
    clientsPerRoom: clientsN,
    clients: clients.length,
    snapshots: clients.reduce((n, c) => n + c.snapshots, 0),
    snapshotRateByClient: clients.map((c) => ({ playerId: c.playerId, snapshots: c.snapshots, activeMs: c.activeMs, hz: Number((c.snapshots / Math.max(1, c.activeMs / 1000)).toFixed(2)) })),
    snapshotHzMean: Number((clients.reduce((n, c) => n + c.snapshots, 0) / Math.max(1, clients.reduce((n, c) => n + c.activeMs, 0) / 1000)).toFixed(2)),
    commandsSent: clients.reduce((n, c) => n + c.commands, 0),
    commandsAcknowledged: commandLatencies.length,
    commandsUnacknowledged: clients.reduce((n, c) => n + c.pending.size, 0),
    commandAcknowledgementRate: Number((commandLatencies.length / Math.max(1, clients.reduce((n, c) => n + c.commands, 0)) * 100).toFixed(2)),
    ackLatencyMs: { p50: percentile(commandLatencies, .5), p95: percentile(commandLatencies, .95), p99: percentile(commandLatencies, .99) },
    reconnects: clients.reduce((n, c) => n + c.reconnects, 0),
    disconnectEvents: clients.reduce((n, c) => n + c.closes, 0),
    errors: clients.flatMap((c) => c.errors),
    lobbyErrors: lobby.errors,
    driverProcess: { cpu: process.cpuUsage(cpuStart), memoryBefore: memoryStart, memoryAfter: process.memoryUsage() },
  };
  assert.equal(report.results.errors.length, 0, 'Ocorreram erros de WebSocket');
  assert.equal(report.results.reconnects, 1, 'O cenário de reconexão não terminou');
  report.finishedAt = new Date().toISOString();
  await writeFile(`${values.out}/report.json`, JSON.stringify(report, null, 2));
  console.log(`PASS room lifecycle soak; ${elapsed.toFixed(0)} s; report ${values.out}/report.json`);
} catch (error) {
  report.failure = error.stack;
  report.finishedAt = new Date().toISOString();
  await writeFile(`${values.out}/report.json`, JSON.stringify(report, null, 2));
  throw error;
} finally {
  clearInterval(actionTimer);
  for (const c of clients) c.close();
  lobby?.close();
}
