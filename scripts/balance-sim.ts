// Simulador de balanceamento: partidas só de bots (4 a 8, rodadas e às vezes Times), em tempo simulado, o mais rápido possível.
// Soma por rodada quem tinha o quê e quem venceu; grava <out>/summary.json e <out>/report.md a cada --every rodadas e no fim.
// Uso: node scripts/balance-sim.ts --minutes 480 --out balance/noite --seed 1 [--plan random|classic] [--rounds N] [--every 1000]
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { CLASSIC_PLAN, botConfig, type BotPlan } from '../src/shared/bots.ts';
import { DT } from '../src/shared/constants.ts';
import { ITEMS, type ItemId } from '../src/shared/items.ts';
import { newMatch, startMatch, tickMatch, type Match } from '../src/shared/match.ts';
import { SPELLS, type SpellId } from '../src/shared/spells.ts';
import { roundRecord } from '../src/shared/telemetry.ts';

const { values: arg } = parseArgs({
  options: {
    minutes: { type: 'string', default: '2' },
    out: { type: 'string', default: 'balance-out' },
    seed: { type: 'string', default: '1' },
    plan: { type: 'string', default: 'random' },
    rounds: { type: 'string' },
    every: { type: 'string', default: '1000' },
  },
});
const seed = Number(arg.seed);
const every = Math.max(1, Number(arg.every));
const maxRounds = arg.rounds ? Number(arg.rounds) : Infinity;
const deadline = Date.now() + Number(arg.minutes) * 60_000;
const outDir = arg.out!;
mkdirSync(outDir, { recursive: true });

// mulberry32; a partida usa Math.random direto (pilares, mundo, plano dos bots), então ele também vira o sorteio com semente
let s = seed | 0;
const rng = () => {
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
Math.random = rng;
if (arg.plan === 'classic') botConfig.planner = () => CLASSIC_PLAN;

// por chave ('spell:lightning', 'item:armor@2', 'pair:grip+meteor'...): jogadores-rodada com aquilo, vitórias, vitórias esperadas e médias
type Agg = { n: number; wins: number; exp: number; dmg: number; kills: number; deaths: number; alive: number; gold: number };
const S = {
  seed, plan: arg.plan, startedAt: new Date().toISOString(), seconds: 0, roundsPerMin: 0,
  matches: 0, rounds: 0, playerRounds: 0, noWinner: 0, stalled: 0,
  modes: {} as Record<string, number>, sizes: {} as Record<string, number>,
  duration: { sum: 0, by10s: {} as Record<string, number> },
  owned: {} as Record<string, Agg>,
  sources: {} as Record<string, { fired: number; landed: number; dmg: number }>,
  deathBy: {} as Record<string, number>,
};
const t0 = Date.now();

function record(m: Match, now: number) {
  const r = roundRecord(m, now);
  const n = r.players.length;
  const winners = r.players.filter((p) => p.won).length;
  const dur = m.world!.t;
  S.rounds++;
  S.playerRounds += n;
  if (!winners) S.noWinner++;
  S.modes[m.mode] = (S.modes[m.mode] ?? 0) + 1;
  S.sizes[n] = (S.sizes[n] ?? 0) + 1;
  S.duration.sum += dur;
  const b = String(Math.floor(dur / 10) * 10);
  S.duration.by10s[b] = (S.duration.by10s[b] ?? 0) + 1;
  r.players.forEach((p, i) => {
    const gold = m.players[i].gold;
    const plan = (m.players[i] as { plan?: BotPlan }).plan;
    const spells = Object.keys(p.spells).filter((k) => p.spells[k] > 0);
    const items = Object.keys(p.items).filter((k) => p.items[k] > 0);
    const keys = ['all', `nspells:${spells.length}`, `nitems:${items.length}`, `upgrade:${plan?.upgrade ?? '?'}`];
    for (const k of spells) keys.push(`spell:${k}`, `spell:${k}@${p.spells[k]}`);
    for (const k of items) keys.push(`item:${k}`, `item:${k}@${p.items[k]}`);
    const extra = spells.filter((k) => k !== 'fireball').sort();
    for (let x = 0; x < extra.length; x++) for (let y = x + 1; y < extra.length; y++) keys.push(`pair:${extra[x]}+${extra[y]}`);
    for (const k of keys) {
      const a = (S.owned[k] ??= { n: 0, wins: 0, exp: 0, dmg: 0, kills: 0, deaths: 0, alive: 0, gold: 0 });
      a.n++;
      if (p.won) a.wins++;
      a.exp += winners / n; // rodadas: 1/n; Times: tamanho do time vencedor / n
      a.dmg += p.dmg;
      a.kills += p.kills;
      a.deaths += p.deaths ?? 0;
      a.alive += p.alive ?? 0;
      a.gold += gold;
    }
    const src = (k: string) => (S.sources[k] ??= { fired: 0, landed: 0, dmg: 0 });
    for (const [k, v] of Object.entries(p.fired)) src(k).fired += v;
    for (const [k, v] of Object.entries(p.landed)) src(k).landed += v;
    for (const [k, v] of Object.entries(p.dmgBy)) src(k).dmg += v;
    for (const [k, v] of Object.entries(p.deathBy ?? {})) S.deathBy[k] = (S.deathBy[k] ?? 0) + v;
  });
}

// intervalo de Wilson 95% para k sucessos em n
function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (!n) return [0, 0];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [c - h, c + h];
}

const f = (x: number, dec = 2) => (Number.isFinite(x) ? x.toFixed(dec).replace('.', ',') : '–');
const pct = (x: number) => f(100 * x, 1) + '%';
const label = (k: string) => {
  const kind = k.slice(0, k.indexOf(':'));
  const [id, lvl] = k.slice(kind.length + 1).split('@');
  const name = (x: string) => SPELLS[x as SpellId]?.name ?? ITEMS[x as ItemId]?.name ?? x;
  if (kind === 'pair') return id.split('+').map(name).join(' + ');
  return name(id) + (lvl ? ` nv ${lvl}` : '');
};

function table(prefix: string, filter: (k: string) => boolean, limit = Infinity, byN = false): string {
  let rows = Object.entries(S.owned).filter(([k]) => k.startsWith(prefix) && filter(k));
  if (byN) rows = rows.sort((a, b) => b[1].n - a[1].n).slice(0, limit);
  rows.sort((a, b) => b[1].wins / b[1].exp - a[1].wins / a[1].exp);
  const head = '| | n | vitória | esperado | vit ÷ esp | IC 95% | dano/rod | abates/rod | mortes/rod | vivo (s) | ouro fim |\n|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|';
  const lines = rows.map(([k, a]) => {
    const [lo, hi] = wilson(a.wins, a.n);
    const e = a.exp / a.n;
    return `| ${label(k)} | ${a.n} | ${pct(a.wins / a.n)} | ${pct(e)} | **${f(a.wins / a.exp)}** | ${f(lo / e)} a ${f(hi / e)} | ${f(a.dmg / a.n, 1)} | ${f(a.kills / a.n)} | ${f(a.deaths / a.n)} | ${f(a.alive / a.n, 1)} | ${f(a.gold / a.n, 1)} |`;
  });
  return [head, ...lines].join('\n');
}

function report(): string {
  const all = S.owned.all;
  const src = Object.entries(S.sources).sort((a, b) => b[1].dmg / Math.max(1, b[1].fired) - a[1].dmg / Math.max(1, a[1].fired));
  const deaths = Object.values(S.deathBy).reduce((x, y) => x + y, 0);
  const sizes = Object.entries(S.sizes).map(([k, v]) => `${k} magos: ${v}`).join(' · ');
  const modes = Object.entries(S.modes).map(([k, v]) => `${k}: ${v}`).join(' · ');
  const dur = Object.entries(S.duration.by10s).sort((a, b) => Number(a[0]) - Number(b[0]));
  return `# Balanceamento: simulação só com bots

- Semente ${S.seed}, plano de compras \`${S.plan}\`, início ${S.startedAt}
- ${S.rounds} rodadas em ${S.matches} partidas (${S.playerRounds} jogadores-rodada), ${f(S.seconds / 60, 1)} min reais, **${f(S.roundsPerMin, 0)} rodadas/min**
- Modos: ${modes} · Tamanho: ${sizes}
- Rodadas sem vencedor: ${S.noWinner} · partidas cortadas por rodada travada (> 600 s): ${S.stalled}
- Duração média da rodada: ${f(S.duration.sum / Math.max(1, S.rounds), 1)} s · ouro médio ao fim da rodada: ${f(all ? all.gold / all.n : 0, 1)}

Como ler: **vit ÷ esp** = vitórias ÷ vitórias esperadas (1/jogadores nas rodadas; tamanho do time vencedor/jogadores nos Times).
1,00 é neutro; acima de 1 ganha mais que o esperado. IC 95% = intervalo de Wilson da taxa de vitória dividido pelo esperado.
n = jogadores-rodada que tinham aquilo. Colunas por rodada: médias de quem tinha aquilo.

## Magias
${table('spell:', (k) => !k.includes('@'))}

## Magias por nível
${table('spell:', (k) => k.includes('@'))}

## Itens
${table('item:', (k) => !k.includes('@'))}

## Itens por nível
${table('item:', (k) => k.includes('@'))}

## Pares de magias (os 40 mais comuns, sem a Bola de fogo)
${table('pair:', () => true, 40, true)}

## Plano de compras
### Número de magias (com a Bola de fogo)
${table('nspells:', () => true)}

### Número de itens (com o Flagelo)
${table('nitems:', () => true)}

### Prioridade de melhoria depois da lista (lowest: menor nível; first: ordem do plano; random: sorteio)
${table('upgrade:', () => true)}

## Fontes de dano: precisão e dano por lançamento
| fonte | lançadas | acertos | precisão | dano total | dano/lançamento |
|---|--:|--:|--:|--:|--:|
${src.map(([k, x]) => `| ${label('src:' + k)} | ${x.fired} | ${x.landed} | ${x.fired ? pct(x.landed / x.fired) : '–'} | ${f(x.dmg, 0)} | ${x.fired ? f(x.dmg / x.fired) : '–'} |`).join('\n')}

## Mortes por causa (último golpe nos 5 s antes; senão lava)
| causa | mortes | % |
|---|--:|--:|
${Object.entries(S.deathBy).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k === 'lava' ? 'lava' : label('src:' + k)} | ${v} | ${pct(v / Math.max(1, deaths))} |`).join('\n')}

## Duração das rodadas
| segundos | rodadas | % |
|---|--:|--:|
${dur.map(([k, v]) => `| ${k} a ${Number(k) + 10} | ${v} | ${pct(v / S.rounds)} |`).join('\n')}
`;
}

// grava por cima de forma atômica (arquivo temporário e troca), para não deixar arquivo pela metade se o processo cair
function save() {
  S.seconds = (Date.now() - t0) / 1000;
  S.roundsPerMin = S.rounds / Math.max(1e-9, S.seconds / 60);
  for (const [name, body] of [['summary.json', JSON.stringify(S, null, 1)], ['report.md', report()]]) {
    writeFileSync(join(outDir, name + '.tmp'), body);
    renameSync(join(outDir, name + '.tmp'), join(outDir, name));
  }
}
process.on('SIGINT', () => {
  save();
  process.exit(130);
});

let now = 0;
while (Date.now() < deadline && S.rounds < maxRounds) {
  const m = newMatch();
  const bots = 4 + Math.floor(rng() * 5);
  const mode = rng() < 0.25 ? 'teams' : 'rounds';
  startMatch(m, now, bots, mode, rng() < 0.5, rng);
  S.matches++;
  while (m.phase !== 'end' && S.rounds < maxRounds) {
    const was = m.phase;
    // sem humanos a loja fecha no primeiro passo; contagem e fim de rodada pulam direto para o fim da espera
    now = was === 'playing' || was === 'shop' ? now + DT * 1000 : Math.max(now + DT * 1000, m.phaseEnds);
    tickMatch(m, now, [], rng);
    if (was === 'playing' && m.phase === 'roundEnd') {
      record(m, now);
      if (S.rounds % every === 0) {
        save();
        console.log(`${S.rounds} rodadas, ${f(S.roundsPerMin, 0)}/min`);
      }
    } else if (m.phase === 'playing' && m.world!.t > 600) {
      S.stalled++;
      break;
    }
  }
}
save();
console.log(`fim: ${S.rounds} rodadas em ${S.matches} partidas, ${f(S.roundsPerMin, 0)} rodadas/min → ${join(outDir, 'report.md')}`);
