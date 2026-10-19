import { describe, expect, it } from 'vitest';
import { edge } from '../src/shared/arena.ts';
import { BOT_SKILL, botBuy, botCmds, botConfig, botThinks, botWatch, skillAt, smartPlan, type BotPlan, type BotSkill } from '../src/shared/bots.ts';
import { DT } from '../src/shared/constants.ts';
import { noItems } from '../src/shared/items.ts';
import { addPlayer, botSkill, newMatch, parseOpt, startMatch } from '../src/shared/match.ts';
import { newWorld, stepWorld, type Cmd, type World } from '../src/shared/sim.ts';
import { noSpells, type SpellId } from '../src/shared/spells.ts';
import { dist, v, type Vec } from '../src/shared/vec.ts';

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// o primeiro sorteio (o do erro humano) não erra; os outros saem todos `r`
const noSlip = (r: number) => {
  let n = 0;
  return () => (n++ ? r : 0.99);
};
const KINDS = ['easy', 'normal', 'hard'] as const;
type Kind = (typeof KINDS)[number];
// sem erro humano e lançando sempre que tem jogada: para medir uma coisa só
const exact = (k: Kind): BotSkill => ({ ...BOT_SKILL[k], slip: 0, cast: 1 });

// bot em (0,0), inimigo em (4,0), a Bola de fogo do bot em recarga
function duel(own: Partial<Record<SpellId, number>>, enemyAt = v(4, 0)): World {
  const w = newWorld(['bot', 'x'], { bot: { ...noSpells(), ...own }, x: noSpells() });
  w.wizards[0].pos = v(0, 0);
  w.wizards[1].pos = enemyAt;
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
// onde saiu o lançamento (ou o destino do primeiro passo)
const castAt = (c: Cmd[]): Vec | undefined => c.flatMap((x) => (x.kind === 'cast' ? [x.at] : []))[0];
const moveTo = (c: Cmd[]): Vec | undefined => c.flatMap((x) => (x.kind === 'move' ? [x.to] : []))[0];

describe('dificuldade dos bots', () => {
  it('os números de cada nível são os decididos (18/10)', () => {
    const pick = (k: keyof BotSkill) => KINDS.map((d) => BOT_SKILL[d][k]);
    expect(pick('aim')).toEqual([1.5, 1, 0.6]);
    expect(pick('delay')).toEqual([0.6, 0.4, 0.25]);
    expect([pick('waitMin'), pick('waitMax')]).toEqual([[2, 1, 0.5], [4, 2, 1]]);
    expect(pick('rate')).toEqual([1.5, 2.5, 4]);
    expect(pick('dodge')).toEqual([0.3, 0.55, 0.8]);
    expect(pick('shield')).toEqual([0.12, 0.35, 0.52]);
    expect(pick('combo')).toEqual([0.3, 0.6, 0.9]);
    expect(pick('range')).toEqual([6, 4.5, 3]);
    expect(pick('edge')).toEqual([1, 1.5, 2]);
    expect(pick('slip')).toEqual([0.2, 0.08, 0.02]);
    expect(pick('vision')).toEqual([10, 12, 15]);
  });

  it('Fácil reage menos que Normal, e Normal menos que Difícil, no mesmo projétil chegando', () => {
    const shield = (c: Cmd[]) => c.some((x) => x.kind === 'cast' && x.spell === 'shield');
    const dodge = (c: Cmd[]) => c.some((x) => x.kind === 'move' || (x.kind === 'cast' && x.spell === 'teleport'));
    const make = () => threatened({ shield: 1, teleport: 1 });
    const [e, n, h] = KINDS.map((k) => count(make, BOT_SKILL[k], (c) => shield(c) || dodge(c)));
    expect(e).toBeLessThan(n);
    expect(n).toBeLessThan(h);
    expect(count(make, BOT_SKILL.easy, shield)).toBeLessThan(count(make, BOT_SKILL.hard, shield));
  });

  it('desvia andando e sobe o Escudo nas chances de cada nível', () => {
    const moves = (c: Cmd[]) => c.some((x) => x.kind === 'move');
    const shield = (c: Cmd[]) => c.some((x) => x.kind === 'cast' && x.spell === 'shield');
    for (const k of KINDS) {
      const D = exact(k);
      expect(Math.abs(count(() => threatened({}), D, moves) / 400 - D.dodge)).toBeLessThan(0.07);
      expect(Math.abs(count(() => threatened({ shield: 1 }), D, shield) / 400 - D.shield)).toBeLessThan(0.07);
    }
  });

  it('tempo de reação: projétil que acabou de surgir não é visto; depois do tempo de cada nível, é', () => {
    const shield = (c: Cmd[]) => c.some((x) => x.kind === 'cast' && x.spell === 'shield');
    for (const k of KINDS) {
      const w = threatened({ shield: 1 });
      w.projectiles[0].born = w.t - BOT_SKILL[k].delay + 0.05; // surgiu há pouco
      expect(shield(botCmds(w, 'bot', noSlip(0.01), BOT_SKILL[k]))).toBe(false);
      w.projectiles[0].born = w.t - BOT_SKILL[k].delay; // agora deu tempo
      expect(shield(botCmds(w, 'bot', noSlip(0.01), BOT_SKILL[k]))).toBe(true);
    }
  });

  it('mira não usa o destino do clique do alvo: só o que viu (posição e velocidade de 0,3 s atrás)', () => {
    for (let i = 0; i < 100; i++) {
      const at = castAt(botCmds(duel({ lightning: 1 }), 'bot', seeded(i), exact('normal')));
      expect(at && Math.abs(at.x - 4) < 1e-9 && Math.abs(at.y) <= BOT_SKILL.normal.aim + 1e-9).toBe(true);
    }
    // parado, acabou de clicar para andar para cima: o bot ainda não sabe
    const w = duel({ lightning: 1 });
    w.wizards[1].target = v(4, 10);
    expect(Math.abs(castAt(botCmds(w, 'bot', noSlip(0.5), exact('normal')))!.y)).toBeLessThan(1e-9);
    // andando para cima a 1,4 m/s: o bot viu (há 0,3 s) e mira à frente, mesmo com o clique agora para baixo
    const m = duel({ lightning: 1 });
    for (let i = 0; i < 40; i++) {
      m.wizards[1].pos = v(4, i * DT * 1.4);
      botWatch(m);
      m.t += DT;
    }
    m.wizards[1].target = v(4, -10);
    expect(castAt(botCmds(m, 'bot', noSlip(0.5), exact('normal')))!.y).toBeGreaterThan(m.wizards[1].pos.y);
  });

  it('erro de mira: de lado, até ±1,5 / ±1 / ±0,6 m', () => {
    for (const k of KINDS) {
      let max = 0;
      for (let i = 0; i < 400; i++) {
        const at = castAt(botCmds(duel({ lightning: 1 }), 'bot', seeded(i), exact(k)))!;
        expect(Math.abs(at.x - 4)).toBeLessThan(1e-9); // só de lado
        max = Math.max(max, Math.abs(at.y));
      }
      expect(max).toBeLessThanOrEqual(BOT_SKILL[k].aim);
      expect(max).toBeGreaterThan(BOT_SKILL[k].aim * 0.95);
    }
  });

  it('a magia só volta a valer um tempo depois da recarga: 2–4 / 1–2 / 0,5–1 s', () => {
    for (const k of KINDS) {
      const D = exact(k);
      const at = (t: number) => count(() => {
        const w = duel({ lightning: 1 });
        w.wizards[0].cd.lightning = 1; // a recarga acaba em 1 s
        w.t = t;
        return w;
      }, D, (c) => !!castAt(c));
      expect(at(1 + D.waitMin - 0.01)).toBe(0);
      const mid = at(1 + (D.waitMin + D.waitMax) / 2);
      expect(mid).toBeGreaterThan(120);
      expect(mid).toBeLessThan(280);
      expect(at(1 + D.waitMax + 0.01)).toBe(400);
    }
    // a que ainda não foi lançada na rodada já vale
    expect(count(() => duel({ lightning: 1 }), exact('easy'), (c) => !!castAt(c))).toBe(400);
  });

  it('pensa 1,5 / 2,5 / 4 vezes por segundo, cada bot num passo diferente', () => {
    for (const k of KINDS) {
      let n = 0;
      for (let s = 1; s <= 600; s++) if (botThinks(s, 0, BOT_SKILL[k])) n++;
      expect(n).toBe(BOT_SKILL[k].rate * 10);
      const first = Array.from({ length: 8 }, (_, i) => Array.from({ length: 60 }, (_, s) => s).find((s) => botThinks(s, i, BOT_SKILL[k])));
      expect(new Set(first).size).toBe(8);
    }
  });

  it('visão: só vê inimigo a até 10 / 12 / 15 m', () => {
    const homing = (k: Kind) => {
      const w = duel({ homing: 1 }, v(5.5, 0));
      w.wizards[0].pos = v(-5.5, 0); // 11 m
      return castAt(botCmds(w, 'bot', noSlip(0.5), exact(k)));
    };
    expect(homing('easy')).toBeUndefined();
    expect(homing('normal')).toBeDefined();
    expect(homing('hard')).toBeDefined();
  });

  it('medo da borda: volta para o meio a 1 / 1,5 / 2 m da lava', () => {
    const back = (k: Kind, e: number) => {
      const w = newWorld(['bot'], { bot: noSpells() });
      w.wizards[0].pos = v(w.arenaR - e, 0);
      return !!moveTo(botCmds(w, 'bot', () => 0.9, BOT_SKILL[k]));
    };
    for (const k of KINDS) {
      expect(back(k, BOT_SKILL[k].edge - 0.1)).toBe(true);
      expect(back(k, BOT_SKILL[k].edge + 0.1)).toBe(false);
    }
    // arena quase sumindo (não há folga em lugar nenhum): na lava, ainda volta
    for (const arena of ['circle', 'islands'] as const) {
      const w = newWorld(['bot'], { bot: noSpells() }, {}, 0, Math.random, false, {}, undefined, arena);
      w.arenaR = 1;
      w.wizards[0].pos = v(arena === 'circle' ? 1.1 : 1.7, 0);
      const to = moveTo(botCmds(w, 'bot', () => 0.9, BOT_SKILL.normal));
      expect(to && edge(w, to) > edge(w, w.wizards[0].pos)).toBe(true);
    }
  });

  it('alvo: Fácil e Normal o mais perto; Difícil quem está fraco, perto da lava ou na frente do placar', () => {
    const scene = (hp = 1) => {
      const w = newWorld(['bot', 'near', 'weak'], { bot: noSpells(), near: noSpells(), weak: noSpells() });
      w.wizards[0].pos = v(0, 0);
      w.wizards[1].pos = v(3, 0);
      w.wizards[2].pos = v(-4.5, 0);
      w.wizards[2].hp = w.wizards[2].hpMax * hp;
      return w;
    };
    const aim = (k: Kind, w: World, scores = {}) => castAt(botCmds(w, 'bot', noSlip(0.5), exact(k), scores))!.x;
    expect(aim('easy', scene(0.3))).toBeGreaterThan(0);
    expect(aim('normal', scene(0.3))).toBeGreaterThan(0);
    expect(aim('hard', scene(0.3))).toBeLessThan(0); // 30% de vida
    expect(aim('hard', scene())).toBeGreaterThan(0); // ninguém fraco: o mais perto
    expect(aim('hard', scene(), { bot: 1, near: 1, weak: 3 })).toBeLessThan(0); // o líder do placar, a 4,5 m
  });

  it('distância preferida: Fácil foge de quem acabou de acertá-lo; Normal chega a ~4,5 m', () => {
    const w = duel({}, v(6, 0));
    w.wizards[0].lastHitBy = 'x';
    w.wizards[0].lastHitAt = w.t;
    expect(moveTo(botCmds(w, 'bot', noSlip(0.9), BOT_SKILL.easy))).toEqual(v(-3, 0));
    expect(moveTo(botCmds(w, 'bot', noSlip(0.9), BOT_SKILL.normal))).toEqual(v(1.5, 0));
  });

  it('ouro: Fácil ignora; Normal vai sem inimigo a < 4 m; Difícil vai mesmo com inimigo perto; no duelo final, ninguém', () => {
    const goes = (k: Kind, enemyAt: number, last = false) => {
      const w = duel({}, v(enemyAt, 0));
      // um terceiro mago vivo, longe: ainda não é o duelo final
      if (!last) w.wizards.push({ ...w.wizards[1], id: 'y', pos: v(-30, -30) });
      w.loots.push({ pos: v(0, 3), left: 10, until: 99 });
      return botCmds(w, 'bot', noSlip(0.9), BOT_SKILL[k]).some((c) => c.kind === 'move' && c.to.x === 0 && c.to.y === 3);
    };
    expect(goes('easy', 9)).toBe(false);
    expect(goes('normal', 9)).toBe(true);
    expect(goes('normal', 3)).toBe(false);
    expect(goes('hard', 3)).toBe(true);
    expect(goes('normal', 9, true)).toBe(false);
    expect(goes('hard', 3, true)).toBe(false);
  });

  it('erro humano: o Fácil fica parado bem mais vezes que o Difícil, e parado não decide por 0,5 s', () => {
    const stops = (k: Kind) => count(() => duel({}), BOT_SKILL[k], (c) => c.some((x) => x.kind === 'stop'));
    expect(stops('easy')).toBeGreaterThan(20); // ~10% (metade dos erros de 20%)
    expect(stops('hard')).toBeLessThan(15); // ~1%
    const w = duel({ lightning: 1 });
    expect(botCmds(w, 'bot', () => 0.01, BOT_SKILL.easy)).toEqual([{ id: 'bot', kind: 'stop' }]);
    w.t += 0.4;
    expect(botCmds(w, 'bot', noSlip(0.5), BOT_SKILL.easy)).toEqual([]);
    w.t += 0.2;
    expect(castAt(botCmds(w, 'bot', noSlip(0.5), exact('easy')))).toBeDefined();
    // o outro erro: lançamento torto até 45°
    let bent = 0;
    for (let i = 0; i < 400; i++) {
      const at = castAt(botCmds(duel({ lightning: 1 }), 'bot', seeded(i), { ...BOT_SKILL.easy, cast: 1, aim: 0 }));
      if (at) {
        expect(Math.abs(Math.atan2(at.y, at.x))).toBeLessThanOrEqual(Math.PI / 4 + 1e-9);
        if (Math.abs(at.y) > 1e-6) bent++;
      }
    }
    expect(bent).toBeGreaterThan(20);
  });

  it('compras: Normal e Difícil montam combinação com dano e fuga; o simulador pode fixar o plano', () => {
    const escape: string[] = ['shield', 'teleport', 'rush', 'windwalk', 'alteration', 'warpzone', 'rockpillar', 'illusion'];
    const rand = seeded(5);
    const plans = Array.from({ length: 50 }, () => smartPlan(rand));
    for (const p of plans) {
      const s = p.buys.flatMap((b) => (b.kind === 'spell' ? [b.id] : []));
      expect(s.filter((id) => escape.includes(id))).toHaveLength(1);
      expect(s.length).toBeGreaterThanOrEqual(2);
      expect(p.buys.some((b) => b.kind === 'item')).toBe(true);
    }
    expect(new Set(plans.map((p) => JSON.stringify(p.buys))).size).toBeGreaterThan(40); // variam entre bots
    const first = (D: BotSkill): BotPlan => {
      const p: { gold: number; spells: Record<SpellId, number>; items: ReturnType<typeof noItems>; plan?: BotPlan } = { gold: 99, spells: noSpells(), items: noItems() };
      botBuy(p, seeded(1), D);
      return p.plan!;
    };
    expect(escape).toContain(first(BOT_SKILL.hard).buys[1].id);
    botConfig.planner = () => ({ buys: [], upgrade: 'lowest' });
    expect(first(BOT_SKILL.hard).buys).toEqual([]);
    botConfig.planner = null;
  });

  it('procura: em ilhas opostas, os dois se encontram em até 25 s, pela ponte e desviando dos obstáculos, sem pisar na lava nem ficar parado > 2 s', () => {
    for (const k of KINDS) {
      const D = BOT_SKILL[k];
      const w = newWorld(['a', 'b'], { a: noSpells(), b: noSpells() }, {}, 0, seeded(1), false, {}, { runes: false, sudden: false, chests: false }, 'islands');
      for (const z of w.wizards) z.cd.fireball = 1e9; // ninguém atira: só andam
      // uma rocha no centro de cada ilha, bem no caminho reto até a ponte
      for (const x of [1, -1]) w.pillars.push({ pos: v(x * 0.95 * w.arenaR, 0), hp: Infinity, alive: true, kind: 'rock' });
      expect(dist(w.wizards[0].pos, w.wizards[1].pos)).toBeGreaterThan(24);
      const rand = seeded(2);
      const still = [0, 0];
      let s = 0;
      for (; s < 25 / DT && dist(w.wizards[0].pos, w.wizards[1].pos) > D.range + 1.5; s++) {
        botWatch(w);
        const cmds = w.wizards.flatMap((z, i) => (botThinks(s, i, D) ? botCmds(w, z.id, rand, D) : []));
        stepWorld(w, cmds, rand);
        w.wizards.forEach((z, i) => {
          expect(edge(w, z.pos)).toBeGreaterThan(0);
          still[i] = z.target ? 0 : still[i] + DT;
          expect(still[i]).toBeLessThan(2);
        });
      }
      expect([k, s * DT < 25]).toEqual([k, true]);
    }
  });

  it('Automático: humano perdendo deixa os bots mais fracos, ganhando mais fortes, sem salto', () => {
    const m = newMatch();
    addPlayer(m, 'h1', 'Ana');
    startMatch(m, 0, 2, 'rounds', true, Math.random, { difficulty: 'auto' });
    const [h, b1, b2] = m.players;
    expect(botSkill(m, b1)).toEqual(BOT_SKILL.normal); // 0 a 0
    b1.score = 4; // humano perdendo feio para o bot 1
    expect(botSkill(m, b1).dodge).toBeLessThan(BOT_SKILL.normal.dodge);
    expect(botSkill(m, b1).aim).toBeGreaterThan(BOT_SKILL.normal.aim);
    h.score = 3; // humano à frente do bot 2
    expect(botSkill(m, b2).dodge).toBeGreaterThan(BOT_SKILL.normal.dodge);
    expect(botSkill(m, b2).aim).toBeLessThan(BOT_SKILL.normal.aim);
    // suave: 1 ponto de diferença fica no meio do caminho
    h.score = 1;
    b2.score = 0;
    const s = botSkill(m, b2);
    expect(s.rate).toBeGreaterThan(BOT_SKILL.normal.rate);
    expect(s.rate).toBeLessThan(BOT_SKILL.hard.rate);
    expect(skillAt(-1)).toEqual(BOT_SKILL.easy);
    expect(skillAt(1)).toEqual(BOT_SKILL.hard);
  });

  it('a dificuldade é uma opção da partida votável', () => {
    expect(parseOpt('difficulty:hard')).toEqual(['difficulty', 'hard']);
    expect(parseOpt('difficulty:insane')).toBeNull();
  });
});
