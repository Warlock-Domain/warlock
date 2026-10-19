// Jeito de jogar dos bots por dificuldade, a referência da sombra (src/client/mimic.ts): precisão da Bola de fogo, reação (s),
// desvio, Escudo, Bolas de fogo por minuto vivo e distância do inimigo (m). Só rodadas do modo Rodadas (2 a 8 magos). Mede metade dos
// magos na dificuldade contra a outra metade no Normal (o humano joga contra bots Normal; um contra o outro, mira e desvio se anulam)
// Uso: node scripts/style-ref.ts [rodadas por dificuldade, padrão 400]
import { BOT_SKILL } from '../src/shared/bots.ts';
import { playMatch, seedRandom } from './sim-lib.ts';

const want = Number(process.argv[2] ?? 400);
const keys = ['fired', 'landed', 'alive', 'threats', 'struck', 'shieldable', 'shielded', 'reactSum', 'reactN', 'nearSum', 'nearN'] as const;
const r2 = (x: number) => Math.round(x * 100) / 100;
const rows: Record<string, Record<string, number>> = {};
for (const difficulty of ['easy', 'normal', 'hard'] as const) {
  const rng = seedRandom(1);
  const t = Object.fromEntries(keys.map((k) => [k, 0])) as Record<(typeof keys)[number], number>;
  let rounds = 0;
  while (rounds < want) playMatch(rng, { difficulty: 'normal' }, (m) => {
    // 1ª rodada da partida (todos no Normal): só marca os ímpares com a dificuldade (botSkill lê o setup a cada passo)
    if (!m.players.some((p) => p.setup)) return m.players.forEach((p, i) => i % 2 && (p.setup = { skill: BOT_SKILL[difficulty] }));
    if (m.mode !== 'rounds') return;
    rounds++;
    for (const { stats: { round: s } } of m.players.filter((p) => p.setup)) {
      t.fired += s.fired.fireball ?? 0;
      t.landed += s.landed.fireball ?? 0;
      for (const k of keys.slice(2) as Exclude<(typeof keys)[number], 'fired' | 'landed'>[]) t[k] += s[k];
    }
  }, () => rounds >= want);
  rows[difficulty] = { aim: r2(t.landed / t.fired), react: r2(t.reactSum / t.reactN), dodge: r2(1 - t.struck / t.threats), shield: r2(t.shielded / t.shieldable), rate: r2((t.fired / t.alive) * 60), near: r2(t.nearSum / t.nearN) };
}
for (const k of Object.keys(rows.easy)) console.log(`  ${k}: [${rows.easy[k]}, ${rows.normal[k]}, ${rows.hard[k]}],`);
