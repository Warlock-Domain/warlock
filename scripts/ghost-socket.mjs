// Conexão-fantasma: um jogador entra e some sem o fechamento chegar (não manda 'ping' nem fecha).
// No alarme da sala (5 min depois de criada) ela tem que soltar o fantasma, manter quem pinga e, sem ninguém, sair da lista.
// node scripts/ghost-socket.mjs [base=http://localhost:8787]   (leva ~6 min)
const base = process.argv[2] ?? 'http://localhost:8787';
const wsBase = base.replace(/^http/, 'ws');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const room = async () => (await (await fetch(base + '/api/rooms', { method: 'POST' })).json()).id;

function join(id, playerId, pings) {
  const ws = new WebSocket(`${wsBase}/ws/room/${id}`);
  const c = { closed: null };
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', playerId, name: playerId.slice(0, 8) }));
  ws.onclose = (e) => (c.closed = `${e.code} ${e.reason}`);
  if (pings) c.timer = setInterval(() => ws.readyState === 1 && ws.send('ping'), 10_000);
  c.close = () => (clearInterval(c.timer), ws.close());
  return c;
}

// quantas pessoas a lista do lobby mostra em cada sala (undefined = fora da lista)
const lobby = () => new Promise((res, rej) => {
  const l = new WebSocket(`${wsBase}/ws/lobby`);
  l.onmessage = (e) => {
    res(Object.fromEntries((JSON.parse(e.data).rooms ?? []).map((r) => [r.id, r.players])));
    l.close();
  };
  setTimeout(() => rej(new Error('lobby sem resposta')), 8000);
});

const [a, b] = [await room(), await room()];
const ghostA = join(a, 'fantasma-a-000001', false); // sala A: fantasma + alguém que pinga
const alive = join(a, 'vivo-a-000000001', true);
const ghostB = join(b, 'fantasma-b-000001', false); // sala B: só o fantasma
await sleep(3000);
console.log('começo', JSON.stringify(await lobby()), `A=${a} B=${b}`);

let ok = false;
for (const end = Date.now() + 7 * 60_000; Date.now() < end && !ok; ) {
  await sleep(15_000);
  const l = await lobby();
  ok = ghostA.closed !== null && ghostB.closed !== null && alive.closed === null && l[a] === 1 && l[b] === undefined;
  console.log(`${Math.round((Date.now() - (end - 7 * 60_000)) / 1000)} s`, JSON.stringify({ A: l[a], B: l[b] ?? 'fora', ghostA: ghostA.closed, ghostB: ghostB.closed, vivo: alive.closed ?? 'aberto' }));
}
for (const c of [ghostA, alive, ghostB]) c.close();
console.log(ok ? 'PASSOU: fantasmas soltos, quem pinga ficou, sala vazia saiu da lista' : 'FALHOU');
process.exit(ok ? 0 : 1);
