// Teste de fumaça contra um servidor rodando: node scripts/smoke.mjs [http://localhost:8797]
const base = process.argv[2] ?? 'http://localhost:8797';
const wsBase = base.replace(/^http/, 'ws');

function fail(msg) {
  console.error('SMOKE FAIL:', msg);
  process.exit(1);
}

function client(path, playerId, name) {
  const ws = new WebSocket(wsBase + path);
  const msgs = [];
  const waiters = [];
  ws.onmessage = (e) => {
    if (e.data === 'pong') return;
    const m = JSON.parse(e.data);
    m.at = Date.now();
    msgs.push(m);
    for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }
  };
  const opened = new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error ' + path)); });
  return {
    ws, msgs,
    async hello() { await opened; if (playerId) this.send({ t: 'hello', playerId, name }); },
    send: (m) => ws.send(JSON.stringify(m)),
    last: (t) => msgs.findLast((m) => m.t === t),
    waitFor(pred, label, ms = 10000) {
      const seen = msgs.find(pred);
      if (seen) return Promise.resolve(seen);
      return new Promise((resolve) => {
        const timer = setTimeout(() => fail('timeout waiting for ' + label), ms);
        waiters.push({ pred, resolve: (v) => { clearTimeout(timer); resolve(v); } });
      });
    },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const health = await fetch(base + '/api/health').catch(() => null);
if (!health?.ok) fail('/api/health not ok');

const ghost = client('/ws/room/ZZZZ', 'smoke-ghost-0001', 'x');
await ghost.hello();
await ghost.waitFor((m) => m.t === 'error' && m.code === 'not_found', 'not_found');
ghost.ws.close();

const { id } = await (await fetch(base + '/api/rooms', { method: 'POST' })).json();
if (!/^[A-Z]{4}$/.test(id ?? '')) fail('bad room id ' + id);

const lobby = client('/ws/lobby');
const a = client('/ws/room/' + id, 'smoke-a-00000001', 'Ana');
const b = client('/ws/room/' + id, 'smoke-b-00000001', 'Bia');
await a.hello();
await b.hello();
const ra = await a.waitFor((m) => m.t === 'room' && m.room.players.length === 2, 'two players');
const pubA = ra.you;
const pubB = (await b.waitFor((m) => m.t === 'room', 'room b')).you;
if (pubA === 'smoke-a-00000001') fail('secret id leaked as public id');
await lobby.waitFor((m) => m.t === 'rooms' && m.rooms.some((r) => r.id === id && r.players === 2), 'room in lobby');

a.send({ t: 'start', bots: 2 });
await b.waitFor((m) => m.t === 'room' && m.room.phase === 'shop', 'shop');
a.send({ t: 'buy', spell: 'teleport' });
await a.waitFor((m) => m.t === 'room' && m.room.players.find((p) => p.id === pubA).spells.teleport === 1, 'bought teleport');
a.send({ t: 'ready' });
b.send({ t: 'ready' });
const cd = await a.waitFor((m) => m.t === 'room' && m.room.phase === 'countdown', 'countdown');
if (cd.room.ids.length !== 4) fail('expected 4 wizards, got ' + cd.room.ids.length);
// a contagem dura 3 s (medido: 2,98 a 3,00 s); 6 s de espera falhava com um soluço da rede do runner (#245), 10 s ainda pega sala travada
await a.waitFor((m) => m.t === 'room' && m.room.phase === 'playing', 'playing', 10000);

// taxa de envio: conta os snaps em 2 s
const n0 = a.msgs.filter((m) => m.t === 'snap').length;
await sleep(2000);
const rate = (a.msgs.filter((m) => m.t === 'snap').length - n0) / 2;
console.log('snaps por segundo:', rate);
if (rate < 25) fail('snap rate too low: ' + rate);

// anda e confere que a posição mudou e o ack voltou
const ia = cd.room.ids.indexOf(pubA);
const pos = () => { const w = a.last('snap').w; return [w[ia * 7], w[ia * 7 + 1]]; };
const [x0, y0] = pos();
const tSent = Date.now();
a.send({ t: 'move', x: 0, y: 0, seq: 7 });
const acked = await a.waitFor((m) => m.t === 'snap' && m.ack === 7, 'ack 7');
console.log('ida e volta do comando (ms):', acked.at - tSent);
// espera o mago andar 0,5 m em até 2 s: em 0,5 s fixos ele anda ~0,70 m (25 medições, mínimo 0,51), e um obstáculo
// ou um bot no caminho derrubava abaixo de 0,5 sem nada quebrado (#245); mago que não anda nunca continua reprovando
let moved = 0;
for (let t = 0; t < 2000 && moved < 0.5; t += 100) {
  await sleep(100);
  const [x1, y1] = pos();
  moved = Math.hypot(x1 - x0, y1 - y0);
}
if (moved < 0.5) fail('wizard did not move: ' + moved.toFixed(2) + ' m in 2 s');

// cai e volta: continua o mesmo mago, com o ouro
b.ws.close();
await a.waitFor((m) => m.t === 'room' && m.room.players.find((p) => p.id === pubB)?.connected === false, 'b disconnected');
const b2 = client('/ws/room/' + id, 'smoke-b-00000001', 'Bia');
await b2.hello();
const back = await b2.waitFor((m) => m.t === 'room', 'b back');
if (!back.room.ids.includes(pubB)) fail('b lost the wizard');
await b2.waitFor((m) => m.t === 'snap', 'b snaps');

// a mesma pessoa em outra aba: a antiga é avisada
const a2 = client('/ws/room/' + id, 'smoke-a-00000001', 'Ana');
await a2.hello();
await a.waitFor((m) => m.t === 'error' && m.code === 'other_tab', 'other_tab');

for (const c of [a2, b2, lobby]) c.ws.close();
console.log('SMOKE OK', id);
process.exit(0);
