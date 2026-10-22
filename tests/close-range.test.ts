// Colados no fim da rodada (pedido do Fernando, 18/10: bots se prendiam e não se batiam)
import { describe, expect, it } from 'vitest';
import { newWorld, stepWorld } from '../src/shared/sim.ts';
import { noSpells } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';

describe('de perto', () => {
  it('a fireball cast point-blank (wizards touching) still hits', () => {
    const w = newWorld(['p0', 'p1'], { p0: noSpells(), p1: noSpells() });
    [w.wizards[0].pos, w.wizards[1].pos] = [v(0, 0), v(0.72, 0)];
    for (const z of w.wizards) z.invulnUntil = 0;
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(0.72, 0) }]);
    let hit = false;
    for (let i = 0; i < 60 && !hit; i++) {
      stepWorld(w, []);
      hit = w.events.some((e) => e.k === 'hit' && e.id === 'p1' && e.src === 'fireball');
    }
    expect(hit).toBe(true);
  });
});

describe('bots colados no fim da rodada', () => {
  it('three Normal bots squeezed on a tiny arena hit each other with fireballs within 4 s', async () => {
    const { BOT_SKILL, botCmds, botThinks, botWatch } = await import('../src/shared/bots.ts');
    const { DT } = await import('../src/shared/constants.ts');
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const ids = ['a', 'b', 'c'];
    const w = newWorld(ids, Object.fromEntries(ids.map((id) => [id, noSpells()])), {}, 0, rand, false, {}, { runes: false, sudden: false, chests: false }, 'cross');
    w.arenaR = 1.4;
    w.shrinkAt = Infinity;
    w.pillars = [];
    [w.wizards[0].pos, w.wizards[1].pos, w.wizards[2].pos] = [v(-0.4, 0), v(0.4, 0), v(0, 0.6)];
    // sem Flagelo e sem ter para onde ir (presos como entre a pedra e o pilar do print): tem de sair Bola de fogo de perto
    for (const z of w.wizards) [z.invulnUntil, z.cd.scourge, z.gripUntil] = [0, 1e9, 1e9];
    let hits = 0;
    for (let s = 0; s < 4 / DT; s++) {
      botWatch(w);
      stepWorld(w, w.wizards.flatMap((z, i) => (z.alive && botThinks(s, i, BOT_SKILL.normal) ? botCmds(w, z.id, rand, BOT_SKILL.normal) : [])), rand);
      hits += w.events.filter((e) => e.k === 'hit' && e.dmg > 0 && e.src === 'fireball').length;
    }
    expect(hits).toBeGreaterThan(0);
  });
});
