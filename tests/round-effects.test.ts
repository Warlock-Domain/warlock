import { describe, expect, it } from 'vitest';
import { DT, KILL_GOLD, LAVA_DPS, NO_MODS, ROUND_EFFECT_IDS, SWORDS, roundMods, type RoundEffectId } from '../src/shared/constants.ts';
import { inArena } from '../src/shared/arena.ts';
import { v } from '../src/shared/vec.ts';
import { addPlayer, newMatch, sandboxCmd, startMatch, type Match, type MatchOpts } from '../src/shared/match.ts';
import { parseClientMessage, publicRoom } from '../src/shared/protocol.ts';
import { stepWorld } from '../src/shared/sim.ts';
import { noSpells } from '../src/shared/spells.ts';
import { kill, toPlaying, until, world } from './helpers.ts';

// partida só de bots já na rodada 1 (o mundo da rodada existe a partir da contagem), com o efeito sorteado
// rand fixo escolhe o efeito: floor(r × 6) → 0,3 dá Arena de espinhos, 0,9 dá Campo aberto
const firstRound = (bots: number, sandbox = false, r = 0.3, opts: Partial<MatchOpts> = { effect: 'random' }): { m: Match; now: number } => {
  const m = newMatch();
  startMatch(m, 0, bots, 'rounds', true, () => r, opts, [], sandbox);
  return { m, now: toPlaying(m, 0, () => r) };
};

describe('efeitos de rodada', () => {
  it('cada efeito muda só o seu multiplicador; sem efeito tudo fica em 1', () => {
    expect(roundMods(null)).toEqual(NO_MODS);
    expect(roundMods('lava')).toEqual({ ...NO_MODS, lava: 0.5 });
    expect(roundMods('swords')).toEqual({ ...NO_MODS, swords: true, shrink: 0.5 });
    expect(roundMods('gold')).toEqual({ ...NO_MODS, killGold: 1.5 });
    expect(roundMods('speed')).toEqual({ ...NO_MODS, speed: 1.5 });
    expect(roundMods('regen')).toEqual({ ...NO_MODS, heal: 1.5 });
    expect(roundMods('clear')).toEqual(NO_MODS);
  });

  it('Campo aberto: a rodada começa sem obstáculos; com outro efeito eles continuam', () => {
    const clear = firstRound(2, false, 0.9).m.world!;
    expect(clear.effect).toBe('clear');
    expect(clear.pillars).toEqual([]);
    const other = firstRound(2, false, 0.3).m.world!;
    expect(other.effect).toBe('swords');
    expect(other.pillars.length).toBeGreaterThan(0);
  });

  it('Tempo chuvoso: a lava tira metade da vida', () => {
    const burn = (effect: RoundEffectId | null) => {
      const w = world([[30, 0], [0, 0]], noSpells());
      w.mods = roundMods(effect);
      const a = w.wizards[0], before = a.hp;
      stepWorld(w, []);
      return before - a.hp;
    };
    expect(burn(null)).toBeCloseTo(LAVA_DPS * DT);
    expect(burn('lava')).toBeCloseTo((LAVA_DPS * DT) / 2);
  });

  it('Vendaval: todos andam mais rápido', () => {
    const speed = (effect: RoundEffectId | null) => {
      const w = world([[0, 0], [3, 0]], noSpells());
      w.mods = roundMods(effect);
      stepWorld(w, []);
      return w.wizards[0].speed;
    };
    expect(speed('speed')).toBeCloseTo(speed(null) * roundMods('speed').speed);
  });

  it('Arena de espinhos: quem passa da borda volta para dentro e leva mais dano quanto mais rápido bateu', () => {
    const bump = (speed: number) => {
      const w = world([[0, 0], [-3, 0]], noSpells());
      w.mods = roundMods('swords');
      const a = w.wizards[0];
      const edgeX = w.arenaR + 0.01; // círculo: a borda fica no raio; começa um tico para fora
      a.pos = v(edgeX, 0);
      a.vel = v(speed, 0);
      const hp = a.hp;
      stepWorld(w, []);
      return { dmg: hp - a.hp, inside: inArena(w, a.pos), back: a.vel.x < 0 };
    };
    const slow = bump(2), fast = bump(8);
    expect([slow.inside, slow.back, fast.inside, fast.back]).toEqual([true, true, true, true]);
    expect(slow.dmg).toBeCloseTo(SWORDS.base + SWORDS.perSpeed * 2, -1); // o atrito do passo tira um pouco da velocidade
    expect(fast.dmg).toBeGreaterThan(slow.dmg * 2);
  });

  it('Fonte da vida: a vida volta 50% mais rápido (e toda cura, pelo mesmo multiplicador)', () => {
    const heal = (effect: RoundEffectId | null) => {
      const w = world([[0, 0], [3, 0]], noSpells());
      w.mods = roundMods(effect);
      w.wizards[0].hp = 500;
      stepWorld(w, []);
      return w.wizards[0].hp - 500;
    };
    expect(heal('regen')).toBeCloseTo(heal(null) * 1.5);
  });

  it('Caçada: o abate paga 50% a mais, com a parte quebrada guardada', () => {
    const gain = (effect: RoundEffectId | null) => {
      const m = newMatch();
      for (const id of ['a', 'b', 'c']) addPlayer(m, id, id); // 3 magos: o abate não encerra a rodada (sem ouro de vitória no meio)
      startMatch(m, 0, 0);
      const now = toPlaying(m, 0);
      m.world!.mods = { ...NO_MODS, killGold: roundMods(effect).killGold }; // só o ouro: com a parede de espadas o kill() não cai na lava
      const killer = m.players[0], before = killer.gold;
      kill(m, 'b', 'a');
      until(m, now, () => !m.world!.wizards[1].alive, 600);
      return { gold: killer.gold - before, carry: killer.goldCarry ?? 0 };
    };
    expect(gain(null).gold).toBe(KILL_GOLD);
    expect(gain('gold')).toEqual({ gold: Math.floor(KILL_GOLD * 1.5), carry: KILL_GOLD * 1.5 - Math.floor(KILL_GOLD * 1.5) });
  });

  it('a partida sorteia um efeito por rodada e o manda para o navegador; a sandbox fica sem', () => {
    const { m } = firstRound(2);
    expect(ROUND_EFFECT_IDS).toContain(m.world!.effect);
    expect(m.world!.mods).toEqual(roundMods(m.world!.effect));
    expect(publicRoom('x', m, 0).effect).toBe(m.world!.effect);
    const { m: s } = firstRound(1, true);
    expect(s.world!.effect).toBeNull();
    expect(s.world!.mods).toEqual(NO_MODS);
  });

  it('desligado é o padrão: rodada sem efeito', () => {
    const { m } = firstRound(2, false, 0.3, {});
    expect([m.world!.effect, m.nextEffect, m.world!.mods]).toEqual([null, null, NO_MODS]);
  });

  it('efeito fixo vale em toda rodada', () => {
    const { m } = firstRound(2, false, 0.3, { effect: 'lava' });
    expect([m.world!.effect, m.nextEffect]).toEqual(['lava', 'lava']);
  });

  it('a loja já mostra o efeito da próxima rodada, que é o que vale nela', () => {
    const m = newMatch();
    startMatch(m, 0, 2, 'rounds', true, Math.random, { effect: 'random' });
    expect(m.phase).toBe('shop');
    const next = publicRoom('x', m, 0).effect;
    expect(next).not.toBeNull();
    toPlaying(m, 0);
    expect(m.world!.effect).toBe(next);
  });

  it('sorteado nunca repete o efeito da rodada anterior', () => {
    for (let i = 0; i < 50; i++) {
      const { m } = firstRound(2, false, Math.random(), { effect: 'random' });
      expect(m.nextEffect).not.toBe(m.world!.effect);
    }
  });

  it('voto na opção durante a loja: a loja já anuncia o efeito que vai valer', () => {
    const m = newMatch();
    startMatch(m, 0, 2, 'rounds', true, Math.random, { effect: 'random' });
    m.pendingOpts = { effect: 'lava' };
    expect(publicRoom('x', m, 0).effect).toBe('lava');
    m.pendingOpts = { effect: 'off' };
    expect(publicRoom('x', m, 0).effect).toBeNull();
  });

  it('sandbox: o efeito escolhido no painel vale na hora e continua depois de reiniciar', () => {
    const { m, now } = firstRound(1, true);
    sandboxCmd(m, { op: 'effect', effect: 'clear' }, now);
    expect([m.world!.effect, m.world!.pillars]).toEqual(['clear', []]);
    sandboxCmd(m, { op: 'effect', effect: 'lava' }, now);
    expect(m.world!.mods).toEqual(roundMods('lava'));
    sandboxCmd(m, { op: 'restart' }, now);
    toPlaying(m, now);
    expect(m.world!.effect).toBe('lava');
    sandboxCmd(m, { op: 'effect', effect: null }, now);
    expect([m.world!.effect, m.world!.mods]).toEqual([null, NO_MODS]);
  });

  it('protocolo: o efeito da sandbox só aceita os efeitos que existem ou nenhum', () => {
    const msg = (effect: unknown) => parseClientMessage(JSON.stringify({ t: 'sandbox', cmd: { op: 'effect', effect } }));
    expect(msg('lava')).toEqual({ t: 'sandbox', cmd: { op: 'effect', effect: 'lava' } });
    expect(msg(null)).toEqual({ t: 'sandbox', cmd: { op: 'effect', effect: null } });
    expect(msg('fogo')).toBeNull();
    expect(msg(undefined)).toBeNull();
  });
});
