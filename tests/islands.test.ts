import { describe, expect, it } from 'vitest';
import { botCmds } from '../src/shared/bots.ts';
import { HP_MAX, ISLAND } from '../src/shared/constants.ts';
import { edge } from '../src/shared/arena.ts';
import { inLava, newWorld, stepWorld, type World } from '../src/shared/sim.ts';
import { decodeSnap, encodeSnap } from '../src/shared/snapshot.ts';
import { noSpells } from '../src/shared/spells.ts';
import { dist, v } from '../src/shared/vec.ts';
import { run } from './helpers.ts';

const NO_RULES = { runes: false, sudden: false, chests: false };
function world(arena: 'circle' | 'ring' | 'islands' | 'cross' = 'circle', seed = 3): World {
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const w = newWorld(['a', 'b'], { a: noSpells(), b: noSpells() }, {}, 0, rand, false, {}, NO_RULES, arena);
  for (const z of w.wizards) z.invulnUntil = 0;
  w.shrinkAt = 1e9;
  return w;
}

describe('Ilhas de refúgio', () => {
  it('4 por arena, raio 1,4 m, centro a 2–4 m da borda, em todas as formas', () => {
    for (const arena of ['circle', 'ring', 'islands', 'cross'] as const) {
      const w = world(arena);
      expect(w.isles).toHaveLength(ISLAND.n);
      for (const i of w.isles) {
        expect(i.r).toBe(ISLAND.r);
        expect(-edge(w, i.pos)).toBeGreaterThanOrEqual(ISLAND.near - 0.06);
        expect(-edge(w, i.pos)).toBeLessThanOrEqual(ISLAND.far + 0.06);
      }
    }
  });

  it('em cima da ilha a lava não queima; fora dela, sim', () => {
    const w = world();
    const i = w.isles[0];
    w.wizards[0].pos = v(i.pos.x, i.pos.y);
    w.wizards[1].pos = v(w.arenaR + 1, 0);
    expect(inLava(w, w.wizards[0].pos)).toBe(false);
    run(w, 2);
    expect(w.wizards[0].hp).toBe(HP_MAX);
    expect(w.wizards[1].hp).toBeLessThan(HP_MAX - 150);
  });

  it('com alguém em cima afunda em ~8 s; vazia volta a crescer e fica cheia em ~30 s', () => {
    const w = world();
    const i = w.isles[0];
    w.wizards[0].pos = v(i.pos.x, i.pos.y);
    run(w, 7);
    expect(i.r).toBeGreaterThan(0);
    run(w, 1);
    expect(i.r).toBe(0);
    expect(inLava(w, w.wizards[0].pos)).toBe(true);
    // afundou: o mago queima, sai da ilha (morto ou levado para a pedra) e ela volta a crescer
    w.wizards[0].pos = v(0, 0);
    run(w, 15);
    expect(i.r).toBeCloseTo(ISLAND.r / 2, 1);
    run(w, 15.2);
    expect(i.r).toBe(ISLAND.r);
  });

  it('acompanha o encolhimento: continua a 2–4 m da borda nova e leva quem está em cima', () => {
    const w = world();
    const i = w.isles[0];
    const d0 = -edge(w, i.pos);
    const before = v(i.pos.x, i.pos.y);
    w.wizards[0].pos = v(i.pos.x, i.pos.y);
    w.shrinkAt = w.t;
    stepWorld(w, []);
    expect(dist(i.pos, before)).toBeGreaterThan(0.5); // chegou mais perto do centro
    expect(-edge(w, i.pos)).toBeCloseTo(d0, 1);
    expect(dist(w.wizards[0].pos, i.pos)).toBeLessThan(0.05);
  });

  it('vai no snapshot (posição e raio)', () => {
    const w = world();
    const view = decodeSnap(encodeSnap(w, 'a', 0, []), ['a', 'b']);
    expect(view.isles).toHaveLength(4);
    expect(dist(view.isles![0].pos, w.isles[0].pos)).toBeLessThan(0.01);
    expect(view.isles![0].r).toBe(ISLAND.r);
  });

  it('bot na lava sem magia de fuga pronta vai para a ilha mais perto e espera nela; com a magia pronta, volta', () => {
    const w = newWorld(['bot', 'x'], { bot: { ...noSpells(), teleport: 1 }, x: noSpells() }, {}, 0, () => 0.5, false, {}, NO_RULES);
    const bot = w.wizards[0];
    const i = w.isles[0];
    // na lava, mais perto da ilha que da pedra
    const out = v(i.pos.x - (i.pos.x / Math.hypot(i.pos.x, i.pos.y)) * 0.2, i.pos.y - (i.pos.y / Math.hypot(i.pos.x, i.pos.y)) * 0.2);
    bot.pos = v(out.x * 1.2, out.y * 1.2);
    bot.cd.teleport = w.t + 3;
    expect(edge(w, bot.pos)).toBeLessThan(0);
    const go = botCmds(w, 'bot', () => 0.99);
    expect(go.at(-1)).toMatchObject({ kind: 'move', to: i.pos });
    // em cima: fica (anda para o meio da ilha), não volta andando pela lava
    bot.pos = v(i.pos.x + 0.3, i.pos.y);
    expect(botCmds(w, 'bot', () => 0.99).at(-1)).toMatchObject({ kind: 'move', to: i.pos });
    // magia pronta: Teleporte para dentro da pedra
    bot.cd.teleport = 0;
    const back = botCmds(w, 'bot', () => 0.99).find((c) => c.kind === 'cast');
    expect(back).toMatchObject({ kind: 'cast', spell: 'teleport' });
    expect(edge(w, back!.kind === 'cast' ? back!.at : v(0, 0))).toBeGreaterThan(0);
  });

  it('bot sem magia de fuga nenhuma volta andando para a pedra (não espera a ilha afundar)', () => {
    const w = newWorld(['bot', 'x'], { bot: noSpells(), x: noSpells() }, {}, 0, () => 0.5, false, {}, NO_RULES);
    const i = w.isles[0];
    w.wizards[0].pos = v(i.pos.x, i.pos.y);
    const mv = botCmds(w, 'bot', () => 0.99).filter((c) => c.kind === 'move').at(-1);
    expect(mv && mv.kind === 'move' && edge(w, mv.to)).toBeGreaterThan(0);
  });
});
