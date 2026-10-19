import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHALLENGES, bestOf, endRun, saveBest, scoreOf, stepRun, type Run } from '../src/client/challenges.ts';
import { addPlayer, newMatch, startMatch, tickMatch } from '../src/shared/match.ts';
import { parseClientMessage } from '../src/shared/protocol.ts';
import type { Cmd, SimEvent, Wizard } from '../src/shared/sim.ts';
import { SPELLS } from '../src/shared/spells.ts';
import { roundRecord } from '../src/shared/telemetry.ts';
import { add, dist, norm, scale, sub } from '../src/shared/vec.ts';
import { STEP_MS, kill, toPlaying, until } from './helpers.ts';

const C = (id: string) => CHALLENGES.find((c) => c.id === id)!;
const start = (id: string): Run => ({ c: C(id), n: 0, t: 0, state: 'on' });
const land: SimEvent = { k: 'land', id: 'eu', src: 'fireball' };

describe('desafios curtos', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('Alvo: 5 Bolas de fogo acertadas vencem; outra magia e tiro dos outros não contam', () => {
    let r = start('alvo');
    r = stepRun(r, 1, [land, land, { k: 'land', id: 'eu', src: 'lightning' }, { k: 'land', id: 'bot-1', src: 'fireball' }], 'eu', true);
    expect(r).toMatchObject({ n: 2, state: 'on' });
    r = stepRun(r, 1, [land, land, land], 'eu', true);
    expect(r).toMatchObject({ n: 5, t: 2, state: 'won' });
    expect(stepRun(r, 1, [land], 'eu', true)).toBe(r); // acabou, não mexe mais
  });

  it('a minha queda perde, mesmo com a meta no mesmo lote', () => {
    expect(stepRun(start('duelo'), 0, [{ k: 'death', id: 'eu', by: 'bot-1', src: 'fireball' }, { k: 'death', id: 'bot-1', by: 'eu', src: 'fireball' }], 'eu', true).state).toBe('lost');
    expect(stepRun(start('alvo'), 0.1, [], 'eu', false).state).toBe('lost');
  });

  it('passar do tempo perde (o Escudo tem 90 s)', () => {
    expect(C('escudo').secs).toBe(90);
    expect(stepRun({ ...start('escudo'), n: 2, t: 60 }, 1, [], 'eu', true).state).toBe('on');
    const r = stepRun({ ...start('escudo'), n: 2, t: 89.9 }, 0.2, [], 'eu', true);
    expect(r.state).toBe('lost');
    expect(scoreOf(r)).toBeNull(); // derrota não vira recorde
  });

  it('Sobreviva conta o tempo vivo: vence nos 30 s, e a queda antes guarda quanto durou', () => {
    let r = start('sobreviva');
    for (let i = 0; i < 29; i++) r = stepRun(r, 1, [], 'eu', true);
    expect(r).toMatchObject({ t: 29, state: 'on' });
    expect(scoreOf(stepRun(r, 0.5, [{ k: 'death', id: 'eu', by: null, src: 'lava' }], 'eu', true))).toBe(29.5);
    r = stepRun(r, 1.02, [], 'eu', true);
    expect(r.state).toBe('won');
    expect(scoreOf(r)).toBe(30);
  });

  it('fim de rodada antes da meta perde; vencer a rodada só cumpre o Duelo e o Sobreviva', () => {
    expect(endRun(start('duelo'), true).state).toBe('won'); // a queda do bot pode chegar depois do fim da rodada
    expect(endRun(start('sobreviva'), true).state).toBe('won');
    expect(endRun(start('lava'), true).state).toBe('lost');
    expect(endRun(start('duelo'), false).state).toBe('lost');
  });

  it('recorde: o melhor substitui, o pior não (mais tempo no Sobreviva, menos nos outros)', () => {
    expect(saveBest('t-mais', 20, true)).toBe(true);
    expect(saveBest('t-mais', 18, true)).toBe(false);
    expect(saveBest('t-mais', 25, true)).toBe(true);
    expect(bestOf('t-mais')).toBe(25);
    expect(saveBest('t-menos', 40, false)).toBe(true);
    expect(saveBest('t-menos', 45, false)).toBe(false);
    expect(saveBest('t-menos', 31, false)).toBe(true);
    expect(bestOf('t-menos')).toBe(31);
    expect(bestOf('t-mais')).toBe(25); // um não apaga o outro
  });

  it('navegador que recusa guardar não quebra o recorde (vale na aba)', () => {
    const fail = () => {
      throw new Error('bloqueado');
    };
    vi.stubGlobal('localStorage', { getItem: fail, setItem: fail });
    expect(saveBest('t-erro', 12, false)).toBe(true);
    expect(bestOf('t-erro')).toBe(12);
  });

  it('com o skill passivo os bots não atiram em 20 s, mesmo com a Bola de fogo', () => {
    const m = newMatch();
    addPlayer(m, 'a', 'Ana');
    const alvo = C('alvo');
    startMatch(m, 0, alvo.bots, 'rounds', true, Math.random, alvo.opts, alvo.setup!.map((b) => ({ ...b, spells: { fireball: 1 } })));
    let now = toPlaying(m, 0);
    expect(m.world!.wizards.filter((z) => z.id.startsWith('bot-') && z.spells.fireball === 1)).toHaveLength(3);
    const N = Math.round(20_000 / STEP_MS);
    let fires = 0;
    let steps = 0;
    for (; steps < N && m.phase === 'playing'; steps++) {
      now += STEP_MS;
      fires += tickMatch(m, now, []).filter((e) => e.k === 'fire').length;
    }
    expect(steps).toBe(N);
    expect(fires).toBe(0);
  });

  // mago que acerta: mira onde o alvo vai estar, sempre no mais machucado, do lado de dentro (empurra para a lava)
  it('Alvo: com a Égide os alvos duram até os 5 acertos', () => {
    const real = Math.random;
    const alvo = C('alvo');
    const fly = SPELLS.fireball.levels[0].speed;
    let saves = 0;
    try {
      for (let seed = 1; seed <= 20; seed++) {
        let x = seed;
        Math.random = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
        const m = newMatch();
        addPlayer(m, 'a', 'Ana');
        startMatch(m, 0, alvo.bots, 'rounds', true, Math.random, alvo.opts, alvo.setup);
        let now = toPlaying(m, 0, Math.random);
        expect(m.world!.wizards.filter((z) => z.id !== 'a').every((z) => z.aegis)).toBe(true);
        let n = 0;
        for (let i = 0; i < alvo.secs * 1000 / STEP_MS && m.phase === 'playing' && n < alvo.goal; i++) {
          const w = m.world!;
          const me = w.wizards.find((z) => z.id === 'a')!;
          const t = w.wizards.filter((z) => z.alive && z.id !== 'a').reduce<Wizard | null>((a, b) => (a && a.dmgTaken >= b.dmgTaken ? a : b), null);
          const cmds: Cmd[] = [];
          if (t && !me.casting) {
            const walk = t.target && dist(t.target, t.pos) > 0.05 ? scale(norm(sub(t.target, t.pos)), t.speed) : t.vel;
            const spot = sub(t.pos, scale(norm(t.pos), 3));
            if (dist(me.pos, t.pos) < 4 && w.t >= me.cd.fireball) cmds.push({ id: 'a', kind: 'cast', spell: 'fireball', at: add(t.pos, scale(walk, dist(me.pos, t.pos) / fly + 0.1)) });
            else if (dist(spot, me.pos) > 0.5) cmds.push({ id: 'a', kind: 'move', to: spot });
          }
          now += STEP_MS;
          const ev = tickMatch(m, now, cmds, Math.random);
          n += ev.filter((e) => alvo.counts!(e, 'a')).length;
          saves += ev.filter((e) => e.k === 'aegis').length;
        }
        expect(n, `semente ${seed}`).toBe(alvo.goal);
      }
    } finally {
      Math.random = real;
    }
    expect(saves).toBeGreaterThan(0); // é a Égide que segura os alvos
  });

  it('toda rodada de desafio sai marcada na telemetria, até sem magias escolhidas (Duelo)', () => {
    expect(CHALLENGES.every((c) => c.setup?.length === c.bots)).toBe(true);
    // o servidor aceita o 'start' de cada desafio como o navegador manda
    for (const c of CHALLENGES) expect(parseClientMessage(JSON.stringify({ t: 'start', bots: c.bots, mode: 'rounds', shuffle: true, opts: c.opts, setup: c.setup }))).not.toBeNull();
    const m = newMatch();
    addPlayer(m, 'a', 'Ana');
    const duelo = C('duelo');
    startMatch(m, 0, duelo.bots, 'rounds', true, Math.random, duelo.opts, duelo.setup);
    const now = toPlaying(m, 0);
    kill(m, 'bot-1', 'a');
    expect(roundRecord(m, until(m, now, () => m.phase === 'roundEnd')).setup).toBe(true);
  });
});
