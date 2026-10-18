import { describe, expect, it } from 'vitest';
import { BOT_SKILL, botCmds, skillAt, type BotSkill } from '../src/shared/bots.ts';
import { addPlayer, botSkill, newMatch, parseOpt, startMatch } from '../src/shared/match.ts';
import { newWorld, type Cmd, type World } from '../src/shared/sim.ts';
import { noSpells, type SpellId } from '../src/shared/spells.ts';
import { dist, v } from '../src/shared/vec.ts';

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// bot em (0,0), inimigo em (4,0), a Bola de fogo do bot em recarga
function duel(own: Partial<Record<SpellId, number>>): World {
  const w = newWorld(['bot', 'x'], { bot: { ...noSpells(), ...own }, x: noSpells() });
  w.wizards[0].pos = v(0, 0);
  w.wizards[1].pos = v(4, 0);
  w.wizards[0].cd.fireball = 99;
  return w;
}
// Bola de fogo inimiga chegando em ~0,23 s
const threatened = (own: Partial<Record<SpellId, number>>) => {
  const w = duel(own);
  w.projectiles.push({ id: 1, kind: 'fireball', owner: 'x', caster: 'x', pos: v(1.5, 0), vel: v(-6.47, 0), level: 1, until: 9, target: null, dmgMult: 1 });
  return w;
};
// quantas vezes, em 400 pensamentos com sorteios diferentes, o bot fez algo
function count(make: () => World, skill: BotSkill, did: (c: Cmd[]) => boolean) {
  let n = 0;
  for (let i = 0; i < 400; i++) if (did(botCmds(make(), 'bot', seeded(i), skill))) n++;
  return n;
}

describe('dificuldade dos bots', () => {
  it('Normal é o bot de sempre: mesmos comandos e mesmos sorteios que sem dificuldade', () => {
    const scenes = [() => threatened({ shield: 1, teleport: 1 }), () => duel({ lightning: 1, meteor: 1, grip: 1 }), () => threatened({ rush: 1, windwalk: 1, alteration: 1 })];
    for (const make of scenes) for (let i = 0; i < 50; i++) {
      const a = seeded(i), b = seeded(i);
      expect(botCmds(make(), 'bot', b, BOT_SKILL.normal)).toEqual(botCmds(make(), 'bot', a));
      expect(a()).toBe(b()); // gastou os mesmos sorteios
    }
  });

  it('Fácil reage menos que Normal, e Normal menos que Difícil, no mesmo projétil chegando', () => {
    const shield = (c: Cmd[]) => c.some((x) => x.kind === 'cast' && x.spell === 'shield');
    const dodge = (c: Cmd[]) => c.some((x) => x.kind === 'move' || (x.kind === 'cast' && x.spell === 'teleport'));
    const make = () => threatened({ shield: 1, teleport: 1 });
    const [e, n, h] = (['easy', 'normal', 'hard'] as const).map((k) => count(make, BOT_SKILL[k], (c) => shield(c) || dodge(c)));
    expect(e).toBeLessThan(n);
    expect(n).toBeLessThan(h);
    expect(count(make, BOT_SKILL.easy, shield)).toBeLessThan(count(make, BOT_SKILL.hard, shield));
  });

  it('tempo de reação: projétil que acabou de surgir não é visto; depois do tempo de cada nível, é', () => {
    const shield = (c: Cmd[]) => c.some((x) => x.kind === 'cast' && x.spell === 'shield');
    for (const [k, delay] of [['easy', 0.4], ['normal', 0.25], ['hard', 0.15]] as const) {
      const w = threatened({ shield: 1 });
      w.projectiles[0].born = w.t - delay + 0.05; // surgiu há pouco
      expect(shield(botCmds(w, 'bot', () => 0.01, BOT_SKILL[k]))).toBe(false);
      w.projectiles[0].born = w.t - delay; // agora deu tempo
      expect(shield(botCmds(w, 'bot', () => 0.01, BOT_SKILL[k]))).toBe(true);
    }
  });

  it('Fácil lança menos vezes e mira pior que Difícil', () => {
    const make = () => duel({ lightning: 1 });
    const cast = (c: Cmd[]) => c.some((x) => x.kind === 'cast');
    expect(count(make, BOT_SKILL.easy, cast)).toBeLessThan(count(make, BOT_SKILL.hard, cast));
    // erro médio da mira no alvo parado
    const miss = (skill: BotSkill) => {
      let sum = 0, n = 0;
      for (let i = 0; i < 400; i++) for (const c of botCmds(make(), 'bot', seeded(i), skill)) if (c.kind === 'cast') (sum += dist(c.at, v(4, 0))), n++;
      return sum / n;
    };
    expect(miss(BOT_SKILL.easy)).toBeGreaterThan(miss(BOT_SKILL.normal));
    expect(miss(BOT_SKILL.normal)).toBeGreaterThan(miss(BOT_SKILL.hard));
  });

  it('Fácil não emenda dano no alvo preso; Difícil emenda sempre', () => {
    // preso há 0,5 s (o bot já viu na pensada anterior): a hora do combo
    const make = () => {
      const w = duel({ lightning: 1 });
      w.wizards[1].gripUntil = 5;
      botCmds(w, 'bot', () => 0.99);
      w.t += 0.5;
      return w;
    };
    const cast = (c: Cmd[]) => c.some((x) => x.kind === 'cast');
    expect(count(make, BOT_SKILL.hard, cast)).toBe(400);
    expect(count(make, BOT_SKILL.easy, cast)).toBeLessThan(250);
  });

  it('Automático: humano perdendo deixa os bots mais fracos, ganhando mais fortes, sem salto', () => {
    const m = newMatch();
    addPlayer(m, 'h1', 'Ana');
    startMatch(m, 0, 2, 'rounds', true, Math.random, { difficulty: 'auto' });
    const [h, b1, b2] = m.players;
    expect(botSkill(m, b1)).toEqual(BOT_SKILL.normal); // 0 a 0
    b1.score = 4; // humano perdendo feio para o bot 1
    expect(botSkill(m, b1).react).toBeLessThan(BOT_SKILL.normal.react);
    expect(botSkill(m, b1).aim).toBeGreaterThan(BOT_SKILL.normal.aim);
    h.score = 3; // humano à frente do bot 2
    expect(botSkill(m, b2).react).toBeGreaterThan(BOT_SKILL.normal.react);
    expect(botSkill(m, b2).aim).toBeLessThan(BOT_SKILL.normal.aim);
    // suave: 1 ponto de diferença fica no meio do caminho
    h.score = 1;
    b2.score = 0;
    const s = botSkill(m, b2);
    expect(s.react).toBeGreaterThan(BOT_SKILL.normal.react);
    expect(s.react).toBeLessThan(BOT_SKILL.hard.react);
    expect(skillAt(-1)).toEqual(BOT_SKILL.easy);
    expect(skillAt(1)).toEqual(BOT_SKILL.hard);
  });

  it('a dificuldade é uma opção da partida votável', () => {
    expect(parseOpt('difficulty:hard')).toEqual(['difficulty', 'hard']);
    expect(parseOpt('difficulty:insane')).toBeNull();
  });
});
