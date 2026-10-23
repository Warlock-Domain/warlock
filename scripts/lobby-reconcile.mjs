// Exercita o reconciliador real do Lobby com RPCs de sala controladas e storage simulado.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const sourceUrl = new URL('../src/worker/lobby.ts', import.meta.url);
let source = readFileSync(sourceUrl, 'utf8').replace("import { DurableObject } from 'cloudflare:workers';", 'class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }');
source = source.replace(/from '(\.{1,2}\/[^']+)'/g, (_, path) => `from '${new URL(path, sourceUrl).href}'`);
const { Lobby } = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64'));

function fixture(records, inspect) {
  const storage = new Map([['rooms', structuredClone(records)]]), sockets = [];
  let alarmAt = null;
  const ctx = {
    storage: {
      get: async (key) => structuredClone(storage.get(key)),
      put: async (key, value) => storage.set(key, structuredClone(value)),
      getAlarm: async () => alarmAt,
      setAlarm: async (at) => { alarmAt = at; },
    },
    getWebSockets: () => sockets,
  };
  const env = { ROOM: { idFromName: (id) => id, get: (id) => ({ inspect: () => inspect(id) }) } };
  return { lobby: new Lobby(ctx, env), reopen: () => new Lobby(ctx, env), storage, get alarmAt() { return alarmAt; } };
}
const info = (id, players = 0) => ({ id, players, phase: 'lobby', mode: 'rounds', round: 0, bots: 0 });

async function orphanIsRemoved() {
  const f = fixture({ DEAD: info('DEAD') }, async () => null);
  await f.lobby.alarm();
  assert.deepEqual(f.storage.get('rooms'), {});
  assert.ok(f.alarmAt);
}

async function occupiedRoomIsRepaired() {
  const f = fixture({ LIVE: info('LIVE') }, async () => info('LIVE', 2));
  await f.lobby.alarm();
  assert.equal(f.storage.get('rooms').LIVE.players, 2);
}

async function inspectionFailureRetries() {
  const f = fixture({ FAIL: info('FAIL') }, async () => { throw new Error('room RPC failed'); });
  await f.lobby.alarm();
  assert.ok(f.storage.get('rooms').FAIL);
  assert.ok(f.alarmAt > Date.now());
}

async function concurrentUpsertWins() {
  let release, entered;
  const waiting = new Promise((resolve) => { entered = resolve; });
  const f = fixture({ RACE: info('RACE') }, async () => {
    entered();
    await new Promise((resolve) => { release = resolve; });
    return null;
  });
  const reconcile = f.lobby.alarm();
  await waiting;
  await f.lobby.upsert(info('RACE', 1));
  release();
  await reconcile;
  assert.equal(f.storage.get('rooms').RACE.players, 1);
}

async function reconciliationIsBatched() {
  const rooms = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`R${String(i).padStart(3, '0')}`, info(`R${String(i).padStart(3, '0')}`)]));
  const inspected = new Set();
  const f = fixture(rooms, async (id) => { inspected.add(id); return info(id); });
  await f.lobby.alarm();
  assert.equal(inspected.size, 8);
  await f.reopen().alarm(); // a hibernated Durable Object must resume the saved cursor
  await f.lobby.alarm();
  assert.equal(inspected.size, 10);
}

await orphanIsRemoved();
await occupiedRoomIsRepaired();
await inspectionFailureRetries();
await concurrentUpsertWins();
await reconciliationIsBatched();
console.log('Lobby reconciliation: 5 lifecycle regressions passed.');
