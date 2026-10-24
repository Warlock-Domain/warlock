// Harness determinístico da classe real: não substitui a prova de hibernação/alarme no runtime da Cloudflare.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const sourceUrl = new URL('../src/worker/room-do.ts', import.meta.url);
let source = readFileSync(sourceUrl, 'utf8').replace("import { DurableObject } from 'cloudflare:workers';", 'class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }');
source = source.replace(/from '(\.{1,2}\/[^']+)'/g, (_, path) => `from '${new URL(path, sourceUrl).href}'`);
globalThis.WebSocketRequestResponsePair = class {};
const { Room } = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
const EMPTY_MS = 5 * 60_000;

function fixture() {
  const records = new Map(), sockets = [], rooms = new Map();
  let alarmAt = null, deletes = 0;
  const lobby = {
    upsert: async (info) => rooms.set(info.id, structuredClone(info)),
    remove: async (id) => rooms.delete(id),
  };
  const ctx = {
    setWebSocketAutoResponse() {}, getWebSockets: () => sockets,
    getWebSocketAutoResponseTimestamp: () => new Date(),
    storage: {
      get: async (key) => structuredClone(records.get(key)),
      put: async (key, value) => records.set(key, structuredClone(value)),
      setAlarm: async (at) => { alarmAt = at; },
      deleteAll: async () => { records.clear(); deletes++; },
    },
  };
  const env = { LOBBY: { idFromName: (id) => id, get: () => lobby } };
  return { room: new Room(ctx, env), records, rooms, sockets, lobby, get alarmAt() { return alarmAt; }, get deletes() { return deletes; } };
}

function socket(f) {
  let attachment = { playerId: null };
  const ws = {
    deserializeAttachment: () => attachment,
    serializeAttachment: (value) => { attachment = value; },
    send() {}, close() {},
  };
  f.sockets.push(ws);
  return ws;
}
const hello = (f, ws) => f.room.webSocketMessage(ws, JSON.stringify({ t: 'hello', playerId: 'audit-person-0001', name: 'Audit' }));

async function normal() {
  const f = fixture();
  await f.room.init('NORM');
  await f.room.alarm();
  assert.equal(f.records.has('room'), false);
  assert.equal(f.rooms.has('NORM'), false);
  assert.equal(f.deletes, 1);
}

async function retry() {
  const f = fixture();
  await f.room.init('RETR');
  const remove = f.lobby.remove;
  f.lobby.remove = async () => { throw new Error('Lobby unavailable'); };
  const before = Date.now();
  await f.room.alarm();
  assert.equal(f.records.has('room'), true);
  assert.equal(f.rooms.has('RETR'), true);
  assert.equal(f.deletes, 0);
  assert.ok(f.alarmAt >= before + 60_000 && f.alarmAt <= Date.now() + 60_000);
  f.lobby.remove = remove;
  await f.room.alarm();
  assert.equal(f.deletes, 1);
}

async function joinDuringRemoval(leaveAgain) {
  const f = fixture();
  await f.room.init('RACE');
  let release, entered;
  const ready = new Promise((resolve) => { entered = resolve; });
  f.lobby.remove = async (id) => {
    entered();
    await new Promise((resolve) => { release = resolve; });
    f.rooms.delete(id);
  };
  const cleanup = f.room.alarm();
  await ready;
  const ws = socket(f);
  await hello(f, ws);
  if (leaveAgain) {
    await f.room.webSocketClose(ws);
    f.sockets.splice(f.sockets.indexOf(ws), 1);
  }
  release();
  await cleanup;
  assert.equal(f.deletes, 0, 'cleanup must preserve a new occupancy generation');
  assert.equal(f.records.has('room'), true);
  assert.equal(f.rooms.get('RACE').players, leaveAgain ? 0 : 1, 'restore the listing removed after hello');
  assert.ok(f.alarmAt > Date.now() + EMPTY_MS - 1000);
  if (!leaveAgain) {
    await hello(f, ws);
    assert.equal(f.records.get('room').match.players.length, 1, 'room still accepts the player after cleanup');
  }
}

await normal();
await retry();
await joinDuringRemoval(false);
await joinDuringRemoval(true);
console.log('Room cleanup: 4 lifecycle regressions passed.');
