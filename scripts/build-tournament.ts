// Torneio de compras: uma população de planos de compra (lista ordenada de magias/itens + regra de melhoria) joga em partidas
// só de bots; cada bot sorteia um plano da população. Aptidão = vitória ajustada pelo ouro de cada plano. A cada geração ficam
// os melhores e o resto vira filho deles (cruzamento e mutação). Grava <out>/tournament.json e <out>/tournament.md a cada geração.
// Uso: node scripts/build-tournament.ts --minutes 480 --out balance/torneio [--seed 1] [--difficulty normal|hard] [--pop 200] [--keep 50] [--gen 2000]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { constants, setPriority } from 'node:os';
import { parseArgs } from 'node:util';
import { botConfig, randomPlan, type BotPick, type BotPlan } from '../src/shared/bots.ts';
import { ITEMS, ITEM_IDS } from '../src/shared/items.ts';
import { type MatchOpts } from '../src/shared/match.ts';
import { FREE_SPELLS, SPELLS } from '../src/shared/spells.ts';
import { roundRecord } from '../src/shared/telemetry.ts';
import { addCell, adjusted, f, goldBand, pct, playMatch, seedRandom, writeAtomic, type Bands } from './sim-lib.ts';
import { SPELL_POOL, crossPlans, mutatePlan } from './tournament-plan.ts';

const { values: arg } = parseArgs({
  options: {
    minutes: { type: 'string', default: '2' },
    out: { type: 'string', default: 'balance/torneio' },
    seed: { type: 'string', default: '1' },
    difficulty: { type: 'string', default: 'normal' },
    pop: { type: 'string', default: '200' }, // planos na população
    keep: { type: 'string', default: '50' }, // melhores que passam para a geração seguinte
    gen: { type: 'string', default: '2000' }, // rodadas por geração (~50 jogadores-rodada por plano com 200 planos)
  },
});
if (!['easy', 'normal', 'hard'].includes(arg.difficulty!)) throw new Error('dificuldade desconhecida: ' + arg.difficulty);
const POP = Number(arg.pop);
const KEEP = Math.min(POP - 1, Number(arg.keep));
const GEN = Number(arg.gen);
const deadline = Date.now() + Number(arg.minutes) * 60_000;
const outDir = arg.out!;
mkdirSync(outDir, { recursive: true });
// prioridade ociosa: no Windows vira IDLE_PRIORITY_CLASS
setPriority(constants.priority.PRIORITY_LOW);

const rng = seedRandom(Number(arg.seed));
const pick = <T>(a: readonly T[]) => a[Math.floor(rng() * a.length)];
const key = (b: BotPick) => b.kind + ':' + b.id;
const sig = (p: BotPlan) => p.buys.map(key).join(',') + '/' + p.upgrade;

// estatística de cada plano por faixa de ouro gasto; os que sobrevivem acumulam de uma geração para a outra
type Entry = { plan: BotPlan; bands: Bands; gens: number };
let pop: Entry[] = Array.from({ length: POP }, () => ({ plan: randomPlan(rng), bands: {}, gens: 0 }));
const base: Bands = {}; // todos os jogadores de todas as gerações, por faixa
// soma das faixas: jogadores-rodada, vitórias e vitórias esperadas
const raw = (b: Bands) => Object.values(b).reduce((x, y) => ({ n: x.n + y.n, w: x.w + y.w, e: x.e + y.e }), { n: 0, w: 0, e: 0 });
// aptidão: vitória ajustada puxada para 1 conforme o n (20 jogadores-rodada valem meio a meio), para um 2 em 2 não dominar
const SHRINK = 20;
const fit = (b: Bands) => {
  const a = adjusted(b, base);
  const k = raw(b).n;
  return Number.isFinite(a) ? (a * k + SHRINK) / (k + SHRINK) : 1;
};

const name = (b: BotPick) => (b.kind === 'spell' ? SPELLS[b.id].name : ITEMS[b.id].name);
const history: { gen: number; rounds: number; best: number; keepMean: number; top: string }[] = [];
const t0 = Date.now();
let generation = 0;
let rounds = 0;

function report(sorted: Entry[]): string {
  // combinação = conjunto de magias e de itens (a ordem e a regra de melhoria não contam); planos iguais somam
  const combos = new Map<string, { spells: string; items: string; bands: Bands; plans: number }>();
  for (const e of sorted) {
    const spells = e.plan.buys.filter((b) => b.kind === 'spell').map(name).sort().join(', ');
    const items = e.plan.buys.filter((b) => b.kind === 'item').map(name).sort().join(', ') || '–';
    const c = combos.get(spells + '|' + items) ?? { spells, items, bands: {}, plans: 0 };
    for (const [band, x] of Object.entries(e.bands)) {
      const y = (c.bands[band] ??= { n: 0, w: 0, e: 0 });
      y.n += x.n;
      y.w += x.w;
      y.e += x.e;
    }
    c.plans++;
    combos.set(spells + '|' + items, c);
  }
  const top = [...combos.values()].sort((a, b) => fit(b.bands) - fit(a.bands)).slice(0, 10);
  const winners = sorted.slice(0, KEEP);
  const freq = (ids: readonly string[], kind: 'spell' | 'item') =>
    ids
      .map((id) => {
        const has = (e: Entry) => e.plan.buys.some((b) => b.kind === kind && b.id === id);
        return [id, winners.filter(has).length / winners.length, sorted.filter(has).length / sorted.length] as const;
      })
      .sort((a, b) => b[1] - a[1]);
  const nm = (kind: 'spell' | 'item', id: string) => (kind === 'spell' ? SPELLS[id as keyof typeof SPELLS].name : ITEMS[id as keyof typeof ITEMS].name);
  const freqTable = (kind: 'spell' | 'item', ids: readonly string[]) =>
    `| | nos ${KEEP} melhores | na população |\n|---|--:|--:|\n` + freq(ids, kind).map(([id, w, all]) => `| ${nm(kind, id)} | ${pct(w)} | ${pct(all)} |`).join('\n');
  const secs = (Date.now() - t0) / 1000;
  return `# Torneio de compras

- Dificuldade **${arg.difficulty}** · semente ${arg.seed} · geração **${generation}** · ${rounds} rodadas em ${f(secs / 60, 1)} min (${f(rounds / Math.max(1e-9, secs / 60), 0)} rodadas/min)
- População ${POP} planos, ${KEEP} passam para a geração seguinte, ${GEN} rodadas por geração; 2 a 8 magos, Times em 25%

Como ler: **aptidão** = vitória ajustada pelo ouro (vit ÷ esp comparando só quem gastou ouro parecido, faixas de 10) puxada para 1 com pouco n (${SHRINK} jogadores-rodada valem meio a meio); 1,00 é neutro.
Os planos que sobrevivem acumulam partidas de gerações anteriores, contra adversários que iam ficando melhores.

## As 10 combinações mais vencedoras (população atual)
| # | magias (além de ${FREE_SPELLS.map((id) => SPELLS[id].name).join(' e ')}) | itens | aptidão | ajustada | vit ÷ esp | vitória | n | planos |
|--:|---|---|--:|--:|--:|--:|--:|--:|
${top.map((c, i) => { const r = raw(c.bands); return `| ${i + 1} | ${c.spells} | ${c.items} | **${f(fit(c.bands))}** | ${f(adjusted(c.bands, base))} | ${f(r.w / r.e)} | ${pct(r.w / Math.max(1, r.n))} | ${r.n} | ${c.plans} |`; }).join('\n')}

## Os 10 melhores planos (com a ordem de compra)
| # | compras, na ordem | melhoria | aptidão | n | gerações |
|--:|---|---|--:|--:|--:|
${sorted.slice(0, 10).map((e, i) => `| ${i + 1} | ${e.plan.buys.map(name).join(' → ')} | ${e.plan.upgrade} | **${f(fit(e.bands))}** | ${raw(e.bands).n} | ${e.gens} |`).join('\n')}

## Magias que mais aparecem nos vencedores
${freqTable('spell', SPELL_POOL)}

## Itens que mais aparecem nos vencedores
${freqTable('item', [...ITEM_IDS])}

## Gerações (últimas 20)
| geração | rodadas | melhor aptidão | média dos ${KEEP} melhores | melhor plano |
|--:|--:|--:|--:|---|
${history.slice(-20).map((h) => `| ${h.gen} | ${h.rounds} | ${f(h.best)} | ${f(h.keepMean)} | ${h.top} |`).join('\n')}
`;
}

function save(sorted: Entry[]) {
  const json = { args: arg, generation, rounds, seconds: (Date.now() - t0) / 1000, base, history, population: sorted.map((e) => ({ ...e.plan, gens: e.gens, n: raw(e.bands).n, fit: fit(e.bands), bands: e.bands })) };
  writeAtomic(outDir, [['tournament.json', JSON.stringify(json, null, 1)], ['tournament.md', report(sorted)]]);
}

const opts: Partial<MatchOpts> = { difficulty: arg.difficulty as MatchOpts['difficulty'] };
while (Date.now() < deadline) {
  const byPlan = new Map(pop.map((e) => [e.plan, e]));
  botConfig.planner = () => pick(pop).plan;
  let genRounds = 0;
  while (genRounds < GEN && Date.now() < deadline) {
    playMatch(rng, opts, (m) => {
      genRounds++;
      rounds++;
      const won = roundRecord(m, 0).players.map((p) => p.won);
      const exp = won.filter(Boolean).length / won.length; // rodadas: 1/n; Times: tamanho do time vencedor / n
      m.players.forEach((p, i) => {
        const band = goldBand(p);
        addCell(base, band, won[i], exp);
        // bot que nunca passou pela loja não tem plano
        const e = byPlan.get((p as { plan?: BotPlan }).plan!);
        if (e) addCell(e.bands, band, won[i], exp);
      });
    }, () => Date.now() >= deadline);
  }
  generation++;
  for (const e of pop) e.gens++;
  const sorted = [...pop].sort((a, b) => fit(b.bands) - fit(a.bands));
  history.push({ gen: generation, rounds: genRounds, best: fit(sorted[0].bands), keepMean: sorted.slice(0, KEEP).reduce((x, e) => x + fit(e.bands), 0) / KEEP, top: sorted[0].plan.buys.map(name).join(' → ') });
  save(sorted);
  console.log(`geração ${generation}: ${rounds} rodadas, melhor ${f(fit(sorted[0].bands))} (${sorted[0].plan.buys.map(name).join(' → ')})`);
  // próxima geração: os KEEP melhores ficam (com o que já jogaram); o resto são filhos deles, sem repetir plano
  const elite = sorted.slice(0, KEEP);
  const next = [...elite];
  const seen = new Set(next.map((e) => sig(e.plan)));
  while (next.length < POP) {
    const a = pick(elite).plan;
    let child = mutatePlan(rng() < 0.5 ? crossPlans(a, pick(elite).plan, rng) : a, rng);
    for (let i = 0; i < 5 && (seen.has(sig(child)) || !child.buys.length); i++) child = mutatePlan(child, rng);
    if (!child.buys.length) continue;
    seen.add(sig(child));
    next.push({ plan: child, bands: {}, gens: 0 });
  }
  pop = next;
}
console.log(`fim: ${generation} gerações, ${rounds} rodadas → ${join(outDir, 'tournament.md')}`);
