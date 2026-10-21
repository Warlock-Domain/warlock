// Simulador de balanceamento: partidas só de bots (2 a 8, rodadas e às vezes Times), em tempo simulado, o mais rápido possível.
// Soma por rodada quem tinha o quê e quem venceu; grava <out>/summary.json e <out>/report.md a cada --every rodadas e no fim.
// Uso: node scripts/balance-sim.ts --minutes 480 --out balance/noite --seed 1 [--plan random|classic|smart] [--rounds N] [--every 1000] [--difficulty normal|hard] [--arena random|circle|ring|islands|cross] [--effect off|random|lava|gold|slow|regen|clear]
// Juntar vários processos: node scripts/balance-sim.ts --merge --out balance/total balance/p1 balance/p2 ...
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { ARENA_IDS, ARENA_NAMES, type ArenaId } from '../src/shared/arena.ts';
import { CLASSIC_PLAN, botConfig, randomPlan, smartPlan, type BotPlan } from '../src/shared/bots.ts';
import { ITEMS, ITEM_IDS, type ItemId } from '../src/shared/items.ts';
import { OPTION_CHOICES, type Match, type MatchOpts } from '../src/shared/match.ts';
import { SPELLS, SPELL_IDS, type SpellId } from '../src/shared/spells.ts';
import { roundRecord } from '../src/shared/telemetry.ts';
import { addCell, adjusted, f, goldBand, pct, playMatch, seedRandom, simNow, writeAtomic, type Bands } from './sim-lib.ts';

const { values: arg, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    merge: { type: 'boolean' },
    minutes: { type: 'string', default: '2' },
    out: { type: 'string', default: 'balance-out' },
    seed: { type: 'string', default: '1' },
    plan: { type: 'string', default: 'random' },
    rounds: { type: 'string' },
    every: { type: 'string', default: '1000' },
    difficulty: { type: 'string', default: 'normal' }, // easy | normal | hard (grill de 18/10: medir no Normal e no Difícil)
    arena: { type: 'string', default: 'random' }, // arena fixa ou sorteada a cada rodada (padrão do jogo)
    effect: { type: 'string', default: 'off' }, // efeito de rodada (issue #189): um fixo por processo, para comparar com o desligado
  },
});
const seed = Number(arg.seed);
const every = Math.max(1, Number(arg.every));
const maxRounds = arg.rounds ? Number(arg.rounds) : Infinity;
const deadline = Date.now() + Number(arg.minutes) * 60_000;
const outDir = arg.out!;
if (arg.arena !== 'random' && !(ARENA_IDS as readonly string[]).includes(arg.arena!)) throw new Error('arena desconhecida: ' + arg.arena);
const arenaOpt = arg.arena as MatchOpts['arena'];
if (!(OPTION_CHOICES.effect as readonly string[]).includes(arg.effect!)) throw new Error('efeito desconhecido: ' + arg.effect);
if (!['easy', 'normal', 'hard'].includes(arg.difficulty!)) throw new Error('dificuldade desconhecida: ' + arg.difficulty);
mkdirSync(outDir, { recursive: true });

const rng = seedRandom(seed);
// compras sorteadas em qualquer dificuldade (a simulação mede as magias e itens, não o gosto dos bots); classic = o bot antigo,
// smart = as combinações que funcionam (para a escolha por magia dizer algo)
botConfig.planner = arg.plan === 'classic' ? () => CLASSIC_PLAN : arg.plan === 'smart' ? smartPlan : randomPlan;

// por chave ('spell:lightning', 'item:armor@2', 'pair:grip+meteor'...): jogadores-rodada com aquilo, vitórias, vitórias esperadas e médias
// by (só em all, spell:* e item:*): por recorte (all, small 2–4 magos, large 5–8, rounds, teams), as faixas de ouro gasto
type Agg = { n: number; wins: number; exp: number; dmg: number; kills: number; deaths: number; alive: number; gold: number; by?: Record<string, Bands> };
const S = {
  seed: String(seed), plan: arg.plan, difficulty: arg.difficulty, arena: arg.arena, effect: arg.effect, startedAt: new Date().toISOString(), seconds: 0, roundsPerMin: 0,
  matches: 0, rounds: 0, playerRounds: 0, noWinner: 0, stalled: 0,
  modes: {} as Record<string, number>, sizes: {} as Record<string, number>,
  duration: { sum: 0, by10s: {} as Record<string, number> },
  owned: {} as Record<string, Agg>,
  sources: {} as Record<string, { fired: number; landed: number; dmg: number }>,
  deathBy: {} as Record<string, number>,
  arenaDur: {} as Record<string, { rounds: number; sum: number }>, // rodadas e soma da duração por arena
  botMatches: 0, picked: {} as Record<string, number>, // bots-partida e quantos deles compraram cada magia/item na partida
};
const t0 = Date.now();
// runas pegas nesta rodada: 'idDoMago:tipo'
const runes = new Set<string>();
// o que cada bot teve em alguma rodada desta partida: 'idDoMago|spell:x' (a Égide some ao salvar, por isso não basta o fim)
const matchPicks = new Set<string>();
const RUNE_NAMES: Record<string, string> = { haste: 'Runa de pressa', fury: 'Runa de fúria', shield: 'Runa de escudo', recharge: 'Runa de recarga' };

function record(m: Match) {
  const r = roundRecord(m, simNow());
  const n = r.players.length;
  const winners = r.players.filter((p) => p.won).length;
  const dur = m.world!.t;
  S.rounds++;
  S.playerRounds += n;
  if (!winners) S.noWinner++;
  S.modes[m.mode] = (S.modes[m.mode] ?? 0) + 1;
  S.sizes[n] = (S.sizes[n] ?? 0) + 1;
  S.duration.sum += dur;
  const ad = (S.arenaDur[m.world!.arena] ??= { rounds: 0, sum: 0 });
  ad.rounds++;
  ad.sum += dur;
  const b = String(Math.floor(dur / 10) * 10);
  S.duration.by10s[b] = (S.duration.by10s[b] ?? 0) + 1;
  const cuts = ['all', n <= 4 ? 'small' : 'large', m.mode];
  r.players.forEach((p, i) => {
    const gold = m.players[i].gold;
    const band = goldBand(m.players[i]);
    const plan = (m.players[i] as { plan?: BotPlan }).plan;
    const spells = Object.keys(p.spells).filter((k) => p.spells[k] > 0);
    // a Égide quebra ao salvar: quem a usou nesta rodada conta como dono (senão só sobrariam os que nunca precisaram)
    const items = Object.keys(p.items).filter((k) => p.items[k] > 0 || (k === 'aegis' && runes.has(`${m.players[i].id}:aegis`)));
    // arena:<id> = jogadores-rodada naquela arena; arena:<id>/spell:<s> = com a magia, naquela arena
    const arena = m.world!.arena;
    const keys = ['all', `arena:${arena}`, `nspells:${spells.length}`, `nitems:${items.length}`, `upgrade:${plan?.upgrade ?? '?'}`];
    for (const k of spells) keys.push(`spell:${k}`, `spell:${k}@${p.spells[k]}`, `arena:${arena}/spell:${k}`);
    for (const k of items) keys.push(`item:${k}`, `item:${k}@${p.items[k] || 1}`);
    for (const k of keys) if (k.startsWith('spell:') || k.startsWith('item:')) matchPicks.add(`${m.players[i].id}|${k}`);
    for (const k of Object.keys(RUNE_NAMES)) if (runes.has(`${m.players[i].id}:${k}`)) keys.push(`rune:${k}`);
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
      if (k === 'all' || k.startsWith('spell:') || k.startsWith('item:')) for (const c of cuts) addCell(((a.by ??= {})[c] ??= {}), band, p.won, winners / n);
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

const label = (k: string): string => {
  if (k.startsWith('arena:')) {
    const [a, rest] = k.slice(6).split('/');
    return rest ? label(rest) : ARENA_NAMES[a as ArenaId] ?? a;
  }
  const kind = k.slice(0, k.indexOf(':'));
  const [id, lvl] = k.slice(kind.length + 1).split('@');
  const name = (x: string) => SPELLS[x as SpellId]?.name ?? ITEMS[x as ItemId]?.name ?? RUNE_NAMES[x] ?? x;
  if (kind === 'pair') return id.split('+').map(name).join(' + ');
  if (kind === 'rune') return RUNE_NAMES[id];
  return name(id) + (lvl ? ` nv ${lvl}` : '');
};

// vitória ajustada pelo ouro de uma chave num recorte (all, small, large, rounds, teams); ponderada: pequena com peso 2
const adj = (a: Agg, cut = 'all') => adjusted(a.by?.[cut], S.owned.all?.by?.[cut]);
const weighted = (a: Agg) => (2 * adj(a, 'small') + adj(a, 'large')) / 3;

// wide: magias e itens, com a vitória ajustada pelo ouro como coluna principal e os recortes por tamanho e modo
function table(prefix: string, filter: (k: string) => boolean, limit = Infinity, byN = false, wide = false): string {
  let rows = Object.entries(S.owned).filter(([k]) => k.startsWith(prefix) && filter(k));
  if (byN) rows = rows.sort((a, b) => b[1].n - a[1].n).slice(0, limit);
  // sem faixas de ouro (simulação de antes da ajustada): ordena pela bruta
  const score = (a: Agg) => (wide ? adj(a) || a.wins / a.exp : a.wins / a.exp) || 0;
  rows.sort((a, b) => score(b[1]) - score(a[1]));
  const head = wide
    ? '| | n | vitória | esperado | **ajustada** | vit ÷ esp | IC 95% | pequena | grande | ponderada | Rodadas | Times | dano/rod | abates/rod | mortes/rod | vivo (s) | ouro fim |\n|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|'
    : '| | n | vitória | esperado | vit ÷ esp | IC 95% | dano/rod | abates/rod | mortes/rod | vivo (s) | ouro fim |\n|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|';
  const lines = rows.map(([k, a]) => {
    const [lo, hi] = wilson(a.wins, a.n);
    const e = a.exp / a.n;
    const ratio = wide
      ? `**${f(adj(a))}** | ${f(a.wins / a.exp)} | ${f(lo / e)} a ${f(hi / e)} | ${f(adj(a, 'small'))} | ${f(adj(a, 'large'))} | ${f(weighted(a))} | ${f(adj(a, 'rounds'))} | ${f(adj(a, 'teams'))}`
      : `**${f(a.wins / a.exp)}** | ${f(lo / e)} a ${f(hi / e)}`;
    return `| ${label(k)} | ${a.n} | ${pct(a.wins / a.n)} | ${pct(e)} | ${ratio} | ${f(a.dmg / a.n, 1)} | ${f(a.kills / a.n)} | ${f(a.deaths / a.n)} | ${f(a.alive / a.n, 1)} | ${f(a.gold / a.n, 1)} |`;
  });
  return [head, ...lines].join('\n');
}

// metas de diversão (grill de 18/10): duração, mortes por golpe, escolha de cada magia/item, abates
function goals(): string {
  const all = S.owned.all;
  const mean = S.duration.sum / Math.max(1, S.rounds);
  const out = Object.entries(S.duration.by10s).filter(([k]) => Number(k) < 60 || Number(k) >= 120).reduce((x, [, v]) => x + v, 0);
  const deaths = Object.values(S.deathBy).reduce((x, y) => x + y, 0);
  const hit = 1 - (S.deathBy.lava ?? 0) / Math.max(1, deaths);
  // Bola de fogo e Flagelo vêm de graça: ficam fora da escolha
  const picks = [...SPELL_IDS.filter((x) => x !== 'fireball').map((x) => 'spell:' + x), ...ITEM_IDS.filter((x) => x !== 'scourge').map((x) => 'item:' + x)]
    .map((k) => [k, (S.picked?.[k] ?? 0) / Math.max(1, S.botMatches ?? 0)] as const)
    .sort((a, b) => b[1] - a[1]);
  const low = (kind: string) => picks.filter(([k, r]) => k.startsWith(kind) && r < 0.04).map(([k, r]) => `${label(k)} ${pct(r)}`).join(', ');
  const ok = (b: boolean) => (b ? '✔' : '✘');
  const pickRow = (kind: string, what: string, none: string) =>
    !S.botMatches ? `| ${what} | sem dados (simulação de antes da escolha) | |` : `| ${what} | ${low(kind) ? 'abaixo: ' + low(kind) : none} | ${ok(!low(kind))} |`;
  return `| meta | resultado | |
|---|---|:-:|
| rodada entre 60 e 120 s | média ${f(mean, 1)} s · ${pct(out / Math.max(1, S.rounds))} das rodadas fora | ${ok(mean >= 60 && mean <= 120)} |
| ≥ 60% das mortes por golpe (não lava sozinha) | ${pct(hit)} por golpe | ${ok(hit >= 0.6)} |
${pickRow('spell:', 'cada magia comprada por ≥ 4% dos bots', 'todas acima')}
${pickRow('item:', 'itens comprados por ≥ 4% dos bots', 'todos acima')}
| abates por rodada (sem meta) | ${f(all ? all.kills / Math.max(1, S.rounds) : 0)} | |

Escolha = bots que tiveram a magia/item em alguma rodada da partida ÷ ${S.botMatches ?? 0} bots-partida. Com o plano \`random\` ela sai quase igual para todos de propósito; só diz algo com \`--plan smart\` ou no torneio.

| escolha | |
|---|--:|
${picks.map(([k, r]) => `| ${label(k)} | ${pct(r)} |`).join('\n')}`;
}

function report(): string {
  const all = S.owned.all;
  const src = Object.entries(S.sources).sort((a, b) => b[1].dmg / Math.max(1, b[1].fired) - a[1].dmg / Math.max(1, a[1].fired));
  const deaths = Object.values(S.deathBy).reduce((x, y) => x + y, 0);
  const sizes = Object.entries(S.sizes).map(([k, v]) => `${k} magos: ${v}`).join(' · ');
  const modes = Object.entries(S.modes).map(([k, v]) => `${k}: ${v}`).join(' · ');
  const dur = Object.entries(S.duration.by10s).sort((a, b) => Number(a[0]) - Number(b[0]));
  return `# Balanceamento: simulação só com bots

- Dificuldade **${S.difficulty ?? 'normal'}** · semente(s) ${S.seed}, plano de compras \`${S.plan}\`, início ${S.startedAt}
- ${S.rounds} rodadas em ${S.matches} partidas (${S.playerRounds} jogadores-rodada), ${f(S.seconds / 60, 1)} min reais, **${f(S.roundsPerMin, 0)} rodadas/min**
- Modos: ${modes} · Tamanho: ${sizes}
- Rodadas sem vencedor: ${S.noWinner} · partidas cortadas por rodada travada (> 600 s): ${S.stalled}
- Duração média da rodada: ${f(S.duration.sum / Math.max(1, S.rounds), 1)} s · ouro médio ao fim da rodada: ${f(all ? all.gold / all.n : 0, 1)}

## Metas de diversão
${goals()}

Como ler: **ajustada** = vit ÷ esp comparando só quem gastou ouro parecido (faixas de 10 de ouro gasto no que tem; em cada faixa, a razão sobre todos os jogadores da faixa; média das faixas pesada pelo n). pequena = 2 a 4 magos, grande = 5 a 8, ponderada = (2 × pequena + grande) ÷ 3.
**vit ÷ esp** = vitórias ÷ vitórias esperadas (1/jogadores nas rodadas; tamanho do time vencedor/jogadores nos Times).
1,00 é neutro; acima de 1 ganha mais que o esperado. IC 95% = intervalo de Wilson da taxa de vitória dividido pelo esperado.
n = jogadores-rodada que tinham aquilo. Colunas por rodada: médias de quem tinha aquilo.

## Arenas
Duração média da rodada por arena: ${Object.entries(S.arenaDur ?? {}).map(([k, x]) => `${ARENA_NAMES[k as ArenaId] ?? k} ${f(x.sum / Math.max(1, x.rounds), 1)} s (${x.rounds} rodadas)`).join(' · ')}

${table('arena:', (k) => !k.includes('/'))}

${ARENA_IDS.filter((a) => S.owned[`arena:${a}`]).map((a) => `### Magias: ${ARENA_NAMES[a]}\n${table(`arena:${a}/spell:`, () => true)}`).join('\n\n')}

## Uso por magia (compradas e lançadas)
Lançamentos contam cada projétil (Rajada 4, Divisor 8 filhotes). n = jogadores-rodada com a magia.

| magia | n | lançamentos | por jogador-rodada |
|---|--:|--:|--:|
${SPELL_IDS.map((id) => [id, S.owned['spell:' + id]?.n ?? 0, S.sources[id]?.fired ?? 0] as const).sort((a, b) => b[2] / Math.max(1, b[1]) - a[2] / Math.max(1, a[1])).map(([id, n, fired]) => `| ${SPELLS[id].name} | ${n} | ${fired} | ${f(fired / Math.max(1, n))} |`).join('\n')}

## Magias
${table('spell:', (k) => !k.includes('@'), Infinity, false, true)}

## Magias por nível
${table('spell:', (k) => k.includes('@'), Infinity, false, true)}

## Itens
${table('item:', (k) => !k.includes('@'), Infinity, false, true)}

## Itens por nível
${table('item:', (k) => k.includes('@'), Infinity, false, true)}

## Runas (quem pegou na rodada)
Pegar runa exige estar vivo mais tempo, então todas saem acima de 1; compare as runas entre si.

${table('rune:', () => true)}

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

function save() {
  S.seconds = (Date.now() - t0) / 1000;
  S.roundsPerMin = S.rounds / Math.max(1e-9, S.seconds / 60);
  write();
}
function write() {
  writeAtomic(outDir, [['summary.json', JSON.stringify(S, null, 1)], ['report.md', report()]]);
}
process.on('SIGINT', () => {
  save();
  process.exit(130);
});

// --merge: soma os summary.json das pastas dadas (todos os campos são somas) e grava um report.md único em --out
if (arg.merge) {
  const sum = (a: any, b: any): any =>
    typeof b === 'number' ? (a ?? 0) + b
    : b && typeof b === 'object' ? Object.fromEntries([...new Set([...Object.keys(a ?? {}), ...Object.keys(b)])].map((k) => [k, k in b ? sum(a?.[k], b[k]) : a[k]]))
    : a === undefined || a === b ? b : `${a}, ${b}`;
  const parts = positionals.map((d) => JSON.parse(readFileSync(join(d, 'summary.json'), 'utf8')));
  Object.assign(S, parts.reduce(sum, undefined));
  // tempo real: o do processo mais longo; rodadas/min: a soma dos processos (vazão total)
  S.seconds = Math.max(...parts.map((p) => p.seconds));
  S.startedAt = parts.map((p) => p.startedAt).sort()[0];
  write();
  console.log(`juntou ${parts.length} pastas: ${S.rounds} rodadas → ${join(outDir, 'report.md')}`);
  process.exit(0);
}

while (Date.now() < deadline && S.rounds < maxRounds) {
  const opts = { arena: arenaOpt, difficulty: arg.difficulty as MatchOpts['difficulty'], effect: arg.effect as MatchOpts['effect'] };
  const onRound = (m: Match) => {
    record(m);
    runes.clear();
    if (S.rounds % every === 0) {
      save();
      console.log(`${S.rounds} rodadas, ${f(S.roundsPerMin, 0)}/min`);
    }
  };
  const { m, end } = playMatch(rng, opts, onRound, () => S.rounds >= maxRounds, (e) => {
    if (e.k === 'runeTake') runes.add(`${e.id}:${e.kind}`);
    else if (e.k === 'aegis') runes.add(`${e.id}:aegis`);
  });
  S.matches++;
  if (end === 'stalled') S.stalled++;
  // escolha: cada bot conta uma vez por partida
  S.botMatches += m.players.length;
  for (const x of matchPicks) {
    const k = x.slice(x.indexOf('|') + 1);
    if (!k.includes('@')) S.picked[k] = (S.picked[k] ?? 0) + 1;
  }
  matchPicks.clear();
}
save();
console.log(`fim: ${S.rounds} rodadas em ${S.matches} partidas, ${f(S.roundsPerMin, 0)} rodadas/min → ${join(outDir, 'report.md')}`);
