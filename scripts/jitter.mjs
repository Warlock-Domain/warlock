// Mede o ritmo dos envios do servidor numa sala com bots: node scripts/jitter.mjs [base] [segundos] [bots]
const base = process.argv[2] ?? 'https://warlock.fernandorffdev.com';
const secs = Number(process.argv[3] ?? 15);
const bots = Number(process.argv[4] ?? 7);
const { id } = await (await fetch(base + '/api/rooms', { method: 'POST' })).json();
const ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws/room/' + id);
const gaps = [];
let last = 0;
let bytes = 0;
let phase = '';
let pingSent = 0;
const rtts = [];
ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', playerId: 'jitter-probe-0001', name: 'Sonda' }));
ws.onmessage = (e) => {
  if (e.data === 'pong') return void rtts.push(performance.now() - pingSent);
  const m = JSON.parse(e.data);
  if (m.t === 'room') {
    if (m.room.phase === 'lobby' && !phase) ws.send(JSON.stringify({ t: 'start', bots }));
    if (m.room.phase === 'shop') ws.send(JSON.stringify({ t: 'ready' }));
    phase = m.room.phase;
    return;
  }
  if (m.t !== 'snap' || phase !== 'playing') return;
  const now = performance.now();
  if (last) gaps.push(now - last);
  last = now;
  bytes += e.data.length;
};
setInterval(() => {
  if (ws.readyState === 1) {
    pingSent = performance.now();
    ws.send('ping');
  }
}, 1000);
setTimeout(() => {
  gaps.sort((a, b) => a - b);
  const q = (p) => gaps[Math.floor(gaps.length * p)]?.toFixed(1);
  rtts.sort((a, b) => a - b);
  console.log(`sala ${id} · ${gaps.length} envios em jogo · intervalo ms: mediana ${q(0.5)} · p90 ${q(0.9)} · p99 ${q(0.99)} · máx ${gaps.at(-1)?.toFixed(1)}`);
  console.log(`acima de 66 ms (a folga da suavização): ${gaps.filter((g) => g > 66).length} · bytes por envio ~${Math.round(bytes / Math.max(1, gaps.length))}`);
  console.log(`ida e volta (ping): mediana ${rtts[Math.floor(rtts.length / 2)]?.toFixed(0)} ms · máx ${rtts.at(-1)?.toFixed(0)} ms`);
  process.exit(0);
}, secs * 1000 + 6000);
