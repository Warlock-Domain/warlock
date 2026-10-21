import { describe, expect, it } from 'vitest';
import { ARENA_MIN, ARENA_STEP, HP_MAX, arenaRadius } from '../src/shared/constants.ts';
import { addPlayer, buy, buyItem, kick, newMatch, sandboxCmd, sell, startMatch, tickMatch, type Match } from '../src/shared/match.ts';
import { parseClientMessage } from '../src/shared/protocol.ts';
import { inLava, type Cmd, type SimEvent } from '../src/shared/sim.ts';
import { kill, STEP_MS, toPlaying, until } from './helpers.ts';
import { dist, v } from '../src/shared/vec.ts';

// sala sandbox com uma pessoa ('a') já na rodada, mais os bots pedidos pelo painel
function sandbox(bots: Parameters<typeof sandboxCmd>[1][] = []): { m: Match; now: number } {
  const m = newMatch();
  addPlayer(m, 'a', 'Ana');
  expect(startMatch(m, 0, 0, 'rounds', true, Math.random, {}, [], true)).toBe(true);
  for (const b of bots) expect(sandboxCmd(m, b, 0)).toBe(true);
  return { m, now: toPlaying(m, 0) };
}
const wiz = (m: Match, id: string) => m.world!.wizards.find((z) => z.id === id)!;
// avança n passos e devolve os eventos
function steps(m: Match, now: number, n: number, cmds: Cmd[] = []): { now: number; events: SimEvent[] } {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...tickMatch(m, (now += STEP_MS), i ? [] : cmds));
  return { now, events };
}

describe('sandbox', () => {
  it('Sandbox começa redonda e nunca sorteia a arena', () => {
    for (const arena of ['random', 'cross', 'islands', 'ring'] as const) {
      const m = newMatch();
      addPlayer(m, 'a', 'Ana');
      startMatch(m, 0, 0, 'rounds', true, () => 0.75, { arena }, [], true); // 0.75 sortearia a cruz
      toPlaying(m, 0);
      expect(m.opts.arena, arena).toBe('circle');
      expect(m.world!.arena, arena).toBe('circle');
    }
  });

  it('a arena escolhida no painel reinicia a rodada e fica nos reinícios seguintes', () => {
    const { m, now: t0 } = sandbox();
    expect(sandboxCmd(m, { op: 'arena', arena: 'cross' }, t0)).toBe(true);
    let now = toPlaying(m, t0);
    expect([m.world!.arena, m.opts.arena]).toEqual(['cross', 'cross']);
    for (let i = 0; i < 3; i++) {
      expect(sandboxCmd(m, { op: 'restart' }, now)).toBe(true);
      now = toPlaying(m, now);
      expect(m.world!.arena, `reinício ${i + 1}`).toBe('cross');
    }
    ({ now } = steps(m, now, 60 * 30));
    expect(m.world!.arena).toBe('cross');
  });

  it('pedra cresce e diminui uma faixa por clique, entre o mínimo e o teto; as ilhas acompanham a borda', () => {
    const { m, now } = sandbox();
    const w = m.world!, r0 = w.arenaR, isle = { ...w.isles[0].pos };
    // só o mundo muda (vai no snapshot): devolve false para a sala não gravar
    expect(sandboxCmd(m, { op: 'radius', step: 1 }, now)).toBe(false);
    expect(w.arenaR).toBeCloseTo(r0 + ARENA_STEP, 9);
    expect(dist(w.isles[0].pos, v(0, 0))).toBeGreaterThan(dist(isle, v(0, 0)));
    sandboxCmd(m, { op: 'radius', step: -1 }, now);
    expect(w.arenaR).toBeCloseTo(r0, 9);
    for (let i = 0; i < 40; i++) sandboxCmd(m, { op: 'radius', step: 1 }, now);
    expect(w.arenaR).toBeCloseTo(arenaRadius(10), 9);
    for (let i = 0; i < 40; i++) sandboxCmd(m, { op: 'radius', step: -1 }, now);
    expect(w.arenaR).toBeCloseTo(ARENA_MIN, 9);
    // o tamanho fica até o fim da rodada (a arena não encolhe sozinha na sandbox)
    steps(m, now, 60 * 15);
    expect(w.arenaR).toBeCloseTo(ARENA_MIN, 9);
  });
  it('torreta fica fixa, não recebe dano e dispara só para a direção escolhida', () => {
    const { m, now: t0 } = sandbox([{ op: 'turret', direction: 'east' }]);
    const { now } = steps(m, t0, 2); // a unidade entra e fixa a posição nos primeiros passos
    const z = wiz(m, 'bot-1');
    const at = { ...z.pos };
    m.world!.wizards.find((q) => q.id === 'a')!.pos = v(-5, -5);
    z.invulnUntil = 0;
    m.world!.projectiles.push({ id: m.world!.nextId++, kind: 'fireball', owner: 'a', caster: 'a', pos: v(at.x, at.y - 0.4), vel: v(0, 20), level: 7, until: m.world!.t + 2, target: null, dmgMult: 1 });
    const result = steps(m, now, 60 * 8);
    expect(z.pos).toEqual(at);
    expect(z.vel).toEqual(v(0, 0));
    expect(z.hp).toBe(z.hpMax);
    expect(z.dmgTaken).toBe(0);
    const shots = result.events.filter((e) => e.k === 'fire' && e.id === z.id);
    expect(shots.length).toBeGreaterThanOrEqual(2);
    expect(m.world!.projectiles.filter((p) => p.owner === z.id).every((p) => p.kind === 'fireball' && p.vel.x > 0 && p.vel.y === 0)).toBe(true);
    expect(kick(m, z.id)).toBe(true);
  });

  it('duas torretas ficam em lugares diferentes e o tiro de uma não bate na outra', () => {
    const { m, now: t0 } = sandbox([{ op: 'turret', direction: 'east' }, { op: 'turret', direction: 'west' }]);
    const { now } = steps(m, t0, 2);
    expect(dist(wiz(m, 'bot-1').pos, wiz(m, 'bot-2').pos)).toBeGreaterThan(1);
    m.world!.wizards.find((q) => q.id === 'a')!.pos = v(-5, -5);
    const { events } = steps(m, now, 60 * 4);
    for (const id of ['bot-1', 'bot-2']) expect(events.some((e) => e.k === 'hit' && e.id === id)).toBe(false);
  });

  it('tirar a torreta do meio e criar outra não põe duas no mesmo lugar', () => {
    const { m, now: t0 } = sandbox([{ op: 'turret', direction: 'east' }, { op: 'turret', direction: 'east' }, { op: 'turret', direction: 'east' }]);
    let { now } = steps(m, t0, 2);
    expect(kick(m, 'bot-2')).toBe(true);
    expect(sandboxCmd(m, { op: 'turret', direction: 'west' }, now)).toBe(true);
    ({ now } = steps(m, now, 2));
    const pos = m.world!.wizards.filter((z) => z.id !== 'a').map((z) => `${z.pos.x},${z.pos.y}`);
    expect(pos.length).toBe(3);
    expect(new Set(pos).size).toBe(3);
  });

  it('protocolo aceita só as quatro direções da torreta', () => {
    for (const direction of ['north', 'east', 'south', 'west']) expect(parseClientMessage(JSON.stringify({ t: 'sandbox', cmd: { op: 'turret', direction } }))).toEqual({ t: 'sandbox', cmd: { op: 'turret', direction } });
    for (const direction of [null, 'diagonal', 1, {}, undefined]) expect(parseClientMessage(JSON.stringify({ t: 'sandbox', cmd: { op: 'turret', direction } }))).toBeNull();
    const m = newMatch();
    expect(sandboxCmd(m, { op: 'turret', direction: 'east' }, 0)).toBe(false);
  });
  it('começa sozinho, pula a loja e a rodada não acaba nem com um mago só', () => {
    const { m, now } = sandbox();
    expect([m.phase, m.world!.wizards.length, m.world!.dm]).toEqual(['playing', 1, true]);
    steps(m, now, 60 * 30);
    expect(m.phase).toBe('playing');
  });

  it('vida infinita: golpe e lava não matam; quem entra na lava fica nela, com a vida cheia', () => {
    const { m, now } = sandbox();
    kill(m, 'a', null); // quase sem vida e no meio da lava
    const at = { ...wiz(m, 'a').pos };
    const { events } = steps(m, now, 5);
    const a = wiz(m, 'a');
    expect([a.alive, a.hp, inLava(m.world!, a.pos)]).toEqual([true, a.hpMax, true]);
    expect(dist(a.pos, at)).toBeLessThan(0.5);
    expect(events.some((e) => e.k === 'death')).toBe(false);
    expect(events.some((e) => e.k === 'teleport' && e.id === 'a')).toBe(false);
  });

  it('desligada a vida infinita, o humano morre e volta como no deathmatch; o bot também', () => {
    const { m, now: t0 } = sandbox([{ op: 'bot' }]);
    expect(sandboxCmd(m, { op: 'set', key: 'god', on: false }, t0)).toBe(true);
    let { now } = steps(m, t0, 60 * 3); // passa a invulnerabilidade do começo
    kill(m, 'a', null);
    kill(m, 'bot-1', null);
    ({ now } = steps(m, now, 5));
    expect([wiz(m, 'a').alive, wiz(m, 'bot-1').alive]).toEqual([false, false]);
    now = until(m, now, () => wiz(m, 'a').alive && wiz(m, 'bot-1').alive, 60 * 10);
    expect([m.phase, wiz(m, 'a').alive, wiz(m, 'bot-1').alive]).toEqual(['playing', true, true]);
  });

  it('ouro não acaba e a compra no meio da rodada vale na hora (magia e item no mago)', () => {
    const { m, now } = sandbox();
    expect(m.players[0].gold).toBe(9999);
    expect(buy(m, 'a', 'lightning')).toBe(true);
    expect(buyItem(m, 'a', 'ring')).toBe(true);
    expect([wiz(m, 'a').spells.lightning, wiz(m, 'a').hpMax]).toEqual([1, HP_MAX + 100]);
    steps(m, now, 1);
    expect(m.players[0].gold).toBe(9999);
    expect(sell(m, 'a', 'spell:lightning')).toBe(true);
    expect(wiz(m, 'a').spells.lightning).toBe(0);
  });

  it('sem recarga: as magias do humano ficam prontas na hora', () => {
    const fire = (noCd: boolean) => {
      const { m, now } = sandbox();
      if (noCd) sandboxCmd(m, { op: 'set', key: 'noCd', on: true }, now);
      const { events } = steps(m, now, 60, [{ id: 'a', kind: 'cast', spell: 'fireball', at: v(3, 0) }]);
      expect(events.some((e) => e.k === 'fire' && e.id === 'a')).toBe(true);
      return wiz(m, 'a').cd.fireball - m.world!.t;
    };
    expect(fire(false)).toBeGreaterThan(0);
    expect(fire(true)).toBeLessThanOrEqual(0);
  });

  it('pôr bot com dificuldade e magias, tirar bot e boneco parado', () => {
    const { m, now: t0 } = sandbox([{ op: 'bot', bot: { difficulty: 'hard', spells: { fireball: 1, homing: 3 } } }, { op: 'bot', dummy: true }]);
    expect(m.players.map((p) => [p.id, p.difficulty, p.dummy])).toEqual([['a', undefined, undefined], ['bot-1', 'hard', undefined], ['bot-2', 'normal', true]]);
    expect(wiz(m, 'bot-1').spells.homing).toBe(3);
    // no meio da rodada: entra no mundo e nasce no passo seguinte
    expect(sandboxCmd(m, { op: 'bot', bot: { difficulty: 'easy' } }, t0)).toBe(true);
    let { now } = steps(m, t0, 2);
    expect(wiz(m, 'bot-3').alive).toBe(true);
    // boneco (sozinho com a pessoa, sem bot para empurrá-lo): não anda nem atira
    const d = sandbox([{ op: 'bot', dummy: true }]);
    const at = { ...wiz(d.m, 'bot-1').pos };
    const { events } = steps(d.m, d.now, 60 * 4);
    expect(dist(wiz(d.m, 'bot-1').pos, at)).toBeLessThan(1e-9);
    expect(events.some((e) => (e.k === 'fire' || e.k === 'cast') && e.id === 'bot-1')).toBe(false);
    expect([d.m.players[1].items, d.m.players[1].spells]).toEqual([d.m.players[0].items, d.m.players[0].spells]); // sem compras: só o que todo mundo começa
    // tirar: sai da sala e do mundo; o próximo bot reaproveita o id
    expect(kick(m, 'bot-2')).toBe(true);
    expect(m.world!.wizards.some((z) => z.id === 'bot-2')).toBe(false);
    expect(sandboxCmd(m, { op: 'bot' }, now)).toBe(true);
    ({ now } = steps(m, now, 2));
    expect(m.world!.wizards.filter((z) => z.id === 'bot-2').length).toBe(1);
  });

  it('reiniciar mantém o círculo; encolher liga e desliga', () => {
    const { m, now: t0 } = sandbox();
    wiz(m, 'a').hp = 1;
    expect(sandboxCmd(m, { op: 'restart' }, t0)).toBe(true);
    const now = toPlaying(m, t0);
    expect([m.world!.arena, wiz(m, 'a').hp]).toEqual(['circle', wiz(m, 'a').hpMax]);
    const r = m.world!.arenaR;
    steps(m, now, 60 * 30);
    expect(m.world!.arenaR).toBe(r);
    sandboxCmd(m, { op: 'set', key: 'shrink', on: true }, now);
    steps(m, now, 60 * 2);
    expect(m.world!.arenaR).toBeLessThan(r);
  });

  it('pôr runa: a escolhida nasce ao lado de quem pediu, troca a que estava e dá o efeito ao encostar', () => {
    const { m, now } = sandbox();
    const me = wiz(m, 'a');
    // não grava a sala (devolve false): a runa vai no snapshot
    expect(sandboxCmd(m, { op: 'rune', kind: 'fury' }, now, 'a')).toBe(false);
    expect(m.world!.runes.map((r) => r.kind)).toEqual(['fury']);
    expect(dist(m.world!.runes[0].pos, me.pos)).toBeCloseTo(1.5, 5);
    sandboxCmd(m, { op: 'rune', kind: 'shield' }, now, 'a');
    expect(m.world!.runes.map((r) => r.kind)).toEqual(['shield']);
    const { events } = steps(m, now, 60 * 2, [{ kind: 'move', id: 'a', to: m.world!.runes[0].pos }]);
    expect(events).toContainEqual({ k: 'runeTake', id: 'a', kind: 'shield' });
    expect(me.rune).toBe('shield');
    // sem quem pediu (ou morto), vai para um lugar livre da arena
    sandboxCmd(m, { op: 'rune', kind: 'haste' }, now, '?');
    expect(m.world!.runes.map((r) => r.kind)).toEqual(['haste']);
  });

  it('numa sala normal os comandos da sandbox não fazem nada e o resto continua como era', () => {
    const m = newMatch();
    addPlayer(m, 'a', 'Ana');
    startMatch(m, 0, 1);
    toPlaying(m, 0);
    const before = JSON.stringify(m.players);
    for (const c of [{ op: 'bot' }, { op: 'set', key: 'god', on: false }, { op: 'restart' }, { op: 'rune', kind: 'fury' }, { op: 'arena', arena: 'cross' }, { op: 'radius', step: 1 }] as const) expect(sandboxCmd(m, c, 0, 'a')).toBe(false);
    expect(JSON.stringify(m.players)).toBe(before);
    expect(m.world!.runes).toEqual([]);
    expect([m.sandbox, m.world!.dm, buy(m, 'a', 'lightning')]).toEqual([undefined, false, false]);
    // sozinho, sem bots, uma partida normal não começa
    const solo = newMatch();
    addPlayer(solo, 'a', 'Ana');
    expect(startMatch(solo, 0, 0)).toBe(false);
  });

  it('a mensagem é validada: operações, chaves e valores conhecidos', () => {
    const p = (o: unknown) => parseClientMessage(JSON.stringify(o));
    expect(p({ t: 'sandbox', cmd: { op: 'set', key: 'noCd', on: true } })).toEqual({ t: 'sandbox', cmd: { op: 'set', key: 'noCd', on: true } });
    expect(p({ t: 'sandbox', cmd: { op: 'bot', bot: { difficulty: 'hard', spells: { homing: 2 } }, dummy: true } })).toEqual({ t: 'sandbox', cmd: { op: 'bot', bot: { difficulty: 'hard', spells: { homing: 2 } }, dummy: true } });
    expect(p({ t: 'sandbox', cmd: { op: 'rune', kind: 'recharge', x: 9 } })).toEqual({ t: 'sandbox', cmd: { op: 'rune', kind: 'recharge' } });
    expect(p({ t: 'sandbox', cmd: { op: 'arena', arena: 'cross', x: 9 } })).toEqual({ t: 'sandbox', cmd: { op: 'arena', arena: 'cross' } });
    for (const step of [1, -1]) expect(p({ t: 'sandbox', cmd: { op: 'radius', step, x: 9 } })).toEqual({ t: 'sandbox', cmd: { op: 'radius', step } });
    expect(p({ t: 'start', bots: 0, sandbox: true })).toMatchObject({ t: 'start', bots: 0, sandbox: true });
    for (const bad of [{ op: 'set', key: 'gold', on: true }, { op: 'set', key: 'god', on: 1 }, { op: 'arena', arena: 'random' }, { op: 'arena', arena: 'hex' }, { op: 'arena' },
      { op: 'radius', step: 2 }, { op: 'radius', step: 0 }, { op: 'radius', step: '1' }, { op: 'radius', step: 0.5 }, { op: 'radius' }, { op: 'bot', bot: { spells: { homing: 99 } } }, { op: 'bot', dummy: 'sim' }, { op: 'nuke' }, { op: 'rune', kind: 'gold' }, { op: 'rune' }, null])
      expect(p({ t: 'sandbox', cmd: bad })).toBeNull();
    expect(p({ t: 'start', bots: 0, sandbox: 'sim' })).toBeNull();
  });

  it('nada de telemetria: a rodada nunca chega ao fim (é no fim dela que a sala grava) e uma partida normal depois limpa a marca', () => {
    const { m, now } = sandbox([{ op: 'bot', bot: { difficulty: 'hard' } }, { op: 'bot', bot: { difficulty: 'hard' } }]);
    sandboxCmd(m, { op: 'set', key: 'shrink', on: true }, now);
    let t = now;
    for (let i = 0; i < 60 * 240; i++) {
      tickMatch(m, (t += STEP_MS), []);
      expect(m.phase).toBe('playing');
    }
    m.phase = 'end';
    expect(startMatch(m, t, 1)).toBe(true);
    expect(m.sandbox).toBeUndefined();
  });
});
