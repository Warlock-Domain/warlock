import { describe, expect, it } from 'vitest';
import { CAMPAIGN, SERVOS, generateStage } from '../src/shared/campaign.ts';
import { addPlayer, endIdle, kick, newMatch, removePlayer, resume, startMatch, startVote, tickMatch, type Match } from '../src/shared/match.ts';
import { parseClientMessage, publicRoom } from '../src/shared/protocol.ts';
import { mulberry32 } from '../src/shared/rng.ts';
import { endResult, maxHp, nightLine, playerName } from '../src/client/screen-data.ts';
import { STEP_MS, kill, toPlaying, until } from './helpers.ts';

// noite de Campanha com os humanos dados e semente fixa
function night(humans = ['a'], seed = 1): Match {
  const m = newMatch();
  for (const id of humans) addPlayer(m, id, id);
  startMatch(m, 0, 0, 'campaign', true, mulberry32(seed));
  return m;
}

const foes = (m: Match) => m.world!.wizards.filter((z) => z.team === 1);
const plan = (m: Match) => generateStage(m.night!.seed, m.night!.stage);
const step = (m: Match, now: number, n = 1) => {
  for (let i = 0; i < n; i++) tickMatch(m, (now += STEP_MS), [], () => 0.5);
  return now;
};
// derruba todos os servos vivos (crédito para o primeiro humano; sem os 2 s de invulnerabilidade de quem acabou de entrar)
function clearWave(m: Match, now: number): number {
  for (const z of foes(m)) if (z.alive) {
    z.invulnUntil = 0;
    kill(m, z.id, 'a');
  }
  return step(m, now);
}
// derruba ondas até a clareira acabar
function clearClearing(m: Match, now: number): number {
  for (let i = 0; i < 10 && m.phase === 'playing'; i++) now = clearWave(m, now);
  return now;
}
// humanos ficam parados no meio e invulneráveis enquanto o teste avança (os servos atiram)
const shelter = (m: Match) => {
  for (const z of m.world!.wizards) if (z.team === 0) z.invulnUntil = 1e9;
};

describe('Campanha: geração da noite', () => {
  it('same seed same night, other seeds vary', () => {
    expect(generateStage(42, 0)).toEqual(generateStage(42, 0));
    const others = [1, 2, 3, 4, 5, 6].map((s) => JSON.stringify(generateStage(s, 0)));
    expect(new Set(others).size).toBeGreaterThan(1);
  });

  it('stage has 2 to 3 clearings with 2 to 3 waves that fit the slots', () => {
    for (let s = 0; s < 50; s++) {
      const st = generateStage(s, 0);
      expect(st.length, String(s)).toBeGreaterThanOrEqual(2);
      expect(st.length, String(s)).toBeLessThanOrEqual(3);
      for (const c of st) {
        expect(c.waves.length).toBeGreaterThanOrEqual(2);
        expect(c.waves.length).toBeLessThanOrEqual(3);
        for (const w of c.waves) expect(w.length).toBeLessThanOrEqual(CAMPAIGN.slots);
      }
    }
  });
});

describe('Campanha: partida', () => {
  it('starts with one human and the Smoke slots on team 1, without gold', () => {
    const m = night();
    expect(m.mode).toBe('campaign');
    expect(m.phase).toBe('shop');
    expect(m.night).toMatchObject({ stage: 0, clearing: 0, result: null });
    const slots = m.players.filter((p) => p.servo);
    expect(slots.length).toBe(CAMPAIGN.slots);
    expect(slots.every((p) => p.bot && p.team === 1)).toBe(true);
    expect(m.players.find((p) => p.id === 'a')).toMatchObject({ team: 0, gold: 0 });
  });

  it('ignores ordinary bots and refuses more than 4 humans', () => {
    const m = newMatch();
    addPlayer(m, 'a', 'a');
    startMatch(m, 0, 3, 'campaign', true, mulberry32(1));
    expect(m.players.filter((p) => p.bot && !p.servo).length).toBe(0);
    const crowd = newMatch();
    for (const id of ['a', 'b', 'c', 'd', 'e']) addPlayer(crowd, id, id);
    expect(startMatch(crowd, 0, 0, 'campaign', true, mulberry32(1))).toBe(false);
  });

  it('first wave alive with its kind, the other slots wait', () => {
    const m = night();
    toPlaying(m, 0);
    const wave = plan(m)[0].waves[0];
    const alive = foes(m).filter((z) => z.alive);
    expect(alive.length).toBe(wave.length);
    alive.forEach((z, i) => {
      const p = m.players.find((q) => q.id === z.id)!;
      expect(p.servo).toBe(wave[i]);
      expect(z.hpMax).toBe(SERVOS[wave[i]].hp);
      expect(p.hpMax).toBe(SERVOS[wave[i]].hp);
    });
    expect(m.world!.arena).toBe(plan(m)[0].arena);
  });

  it('next wave enters when the wave is cleared, and gives no gold', () => {
    const m = night();
    let now = toPlaying(m, 0);
    shelter(m);
    now = clearWave(m, now);
    expect(m.night!.wave).toBe(1);
    expect(foes(m).filter((z) => z.alive).length).toBe(plan(m)[0].waves[1].length);
    expect(m.players.find((p) => p.id === 'a')!.gold).toBe(0);
    expect(m.players.find((p) => p.id === 'a')!.stats.round.kills).toBeGreaterThan(0);
  });

  it('clearing ends when the last wave is cleared and the next opens after the interval', () => {
    const m = night();
    let now = toPlaying(m, 0);
    shelter(m);
    now = clearClearing(m, now);
    expect(m.phase).toBe('roundEnd');
    now = until(m, now, () => m.phase !== 'roundEnd');
    expect(m.phase).toBe('shop');
    expect(m.night!.clearing).toBe(1);
    toPlaying(m, now);
    expect(m.world!.arena).toBe(plan(m)[1].arena);
  });

  it('clearing every clearing wins the night and drops the slots', () => {
    const m = night();
    let now = 0;
    for (let c = 0; c < plan(m).length; c++) {
      now = toPlaying(m, now);
      shelter(m);
      now = clearClearing(m, now);
      now = until(m, now, () => m.phase !== 'roundEnd');
    }
    expect(m.phase).toBe('end');
    expect(m.night!.result).toBe('won');
    expect(m.players.some((p) => p.servo)).toBe(false);
  });

  it('all humans down loses the night', () => {
    const m = night(['a', 'b']);
    let now = toPlaying(m, 0);
    for (const z of m.world!.wizards) z.invulnUntil = 0;
    kill(m, 'a', null);
    kill(m, 'b', null);
    now = step(m, now);
    expect(m.phase).toBe('roundEnd');
    expect(m.night!.result).toBe('lost');
    until(m, now, () => m.phase !== 'roundEnd');
    expect(m.phase).toBe('end');
  });

  it('ending the night by vote or idleness counts as lost and drops the slots', () => {
    const voted = night(['a']);
    startVote(voted, 'a', 'end', '', 0);
    expect(voted.phase).toBe('end');
    expect(voted.night!.result).toBe('lost');
    expect(voted.players.some((p) => p.servo)).toBe(false);
    const idle = night(['a']);
    endIdle(idle);
    expect(idle.night!.result).toBe('lost');
    expect(idle.players.some((p) => p.servo)).toBe(false);
  });

  it('a match after the night starts with the usual gold', () => {
    const m = night(['a', 'b']);
    endIdle(m);
    expect(m.phase).toBe('end');
    startMatch(m, 0, 1, 'rounds');
    expect(m.players.filter((p) => !p.bot).map((p) => p.gold)).toEqual([30, 30]);
  });

  it('someone who joins mid-night fights on the Acesos side, without gold', () => {
    const m = night(['a']);
    let now = toPlaying(m, 0);
    addPlayer(m, 'late', 'late');
    expect(m.players.find((p) => p.id === 'late')!.gold).toBe(0);
    shelter(m);
    now = clearClearing(m, now);
    now = until(m, now, () => m.phase === 'shop');
    toPlaying(m, now);
    expect(m.players.find((p) => p.id === 'late')!.team).toBe(0);
    expect(m.world!.wizards.find((z) => z.id === 'late')!.team).toBe(0);
  });

  it('resume mid-night goes back to the interval of the same clearing', () => {
    const m = night();
    toPlaying(m, 0);
    const round = m.round;
    resume(m, 1000);
    expect(m.phase).toBe('shop');
    expect(m.round).toBe(round - 1);
    expect(m.night!.clearing).toBe(0);
  });

  it('a human who drops stays on the Acesos side', () => {
    const m = night(['a', 'b']);
    toPlaying(m, 0);
    removePlayer(m, 'b');
    const b = m.players.find((p) => p.id === 'b')!;
    expect(b.connected).toBe(false);
    expect(b.servo).toBeUndefined();
    expect(m.world!.wizards.find((z) => z.id === 'b')!.team).toBe(0);
  });

  it('no mode, bot or kick votes against the Smoke; switching into the campaign is not voted', () => {
    const m = night(['a', 'b']);
    expect(startVote(m, 'a', 'mode', 'rounds', 0)).toBe(false);
    expect(startVote(m, 'a', 'addBot', '', 0)).toBe(false);
    expect(kick(m, 'fumo-1')).toBe(false);
    const r = newMatch();
    for (const id of ['a', 'b']) addPlayer(r, id, id);
    startMatch(r, 0, 0, 'rounds');
    expect(startVote(r, 'a', 'mode', 'campaign', 0)).toBe(false);
  });

  it('room shows the night and the max health of each wizard', () => {
    const m = night();
    toPlaying(m, 0);
    const room = publicRoom('ABCD', m, 0);
    expect(room.night).toEqual({ stage: 0, clearing: 0, clearings: plan(m).length, wave: 0, waves: plan(m)[0].waves.length, result: null });
    expect(room.players.filter((p) => p.servo).every((p) => p.hpMax !== undefined)).toBe(true);
  });

  it('start message accepts the campaign, not in the sandbox', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'start', bots: 0, mode: 'campaign' }))).toMatchObject({ mode: 'campaign' });
    const m = newMatch();
    addPlayer(m, 'a', 'a');
    expect(startMatch(m, 0, 0, 'campaign', true, Math.random, {}, [], true)).toBe(false);
  });
});

describe('Campanha: tela', () => {
  it('servants are named in the player language, people keep their nickname', () => {
    expect(playerName({ name: 'Cinzento', servo: 'ash' })).toBe('Cinzento');
    expect(playerName({ name: 'Arqueiro oco', servo: 'archer' })).toBe('Arqueiro oco');
    expect(playerName({ name: 'Lucas' })).toBe('Lucas');
  });

  it('health bar uses the servant max health', () => {
    const m = night();
    toPlaying(m, 0);
    const room = publicRoom('ABCD', m, 0);
    const servo = room.players.find((p) => p.servo)!;
    expect(maxHp(servo)).toBe(SERVOS[servo.servo!].hp);
    expect(maxHp(room.players.find((p) => !p.servo))).toBe(1000);
  });

  it('night line says stage, clearing and, during the clearing, the wave', () => {
    const n = { stage: 0, clearing: 1, clearings: 3, wave: 0, waves: 2, result: null };
    expect(nightLine(n, false)).toBe('Campanha · Charneca Cinzenta · clareira 2 de 3');
    expect(nightLine(n, true)).toBe('Campanha · Charneca Cinzenta · clareira 2 de 3 · onda 1 de 2');
  });

  it('the Acesos win or lose together', () => {
    const m = night(['a', 'b']);
    m.night!.result = 'won';
    m.phase = 'end';
    const room = publicRoom('ABCD', m, 0);
    const a = room.players.find((p) => p.name === 'a')!.id;
    expect(endResult(room, a)).toBe('win');
    m.night!.result = 'lost';
    expect(endResult(publicRoom('ABCD', m, 0), a)).toBe('loss');
  });
});
