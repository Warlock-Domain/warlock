import { describe, expect, it } from 'vitest';
import { elementalBonuses, elementalLevel, elementalPenalty, type Element } from '../src/shared/elemental-spheres.ts';
import { addPlayer, buy, newMatch, startMatch, tickMatch, sandboxCmd } from '../src/shared/match.ts';
import { parseClientMessage } from '../src/shared/protocol.ts';
import { encodeSnap, decodeSnap } from '../src/shared/snapshot.ts';
import { parseServerMessage } from '../src/client/net-message.ts';
import { demoWorld, demoStep } from '../src/client/demo.ts';
import { createPredict } from '../src/client/predict.ts';
import { damageFactor, isSuspended, stepWorld } from '../src/shared/sim.ts';
import { noSpells, SPELLS, spellLevel } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { run, world, toPlaying } from './helpers.ts';

function setup() {
  const w = world([[0, 0], [4, 0]], { ...noSpells(), elemental: 1, transcend: 1, fireball: 1 }, [], () => .5);
  w.pillars = []; w.runes = []; w.rules.runes = false; w.rules.chests = false; w.shrinkAt = 1000;
  w.wizards.forEach(z => z.regen = 0);
  return w;
}
const cast = (w: ReturnType<typeof setup>, spell: 'transcend' | 'elemental', rand = () => 0) => {
  w.wizards[0].cd[spell] = w.t;
  stepWorld(w, [{ id: 'p0', kind: 'cast', spell, at: v(0, 0) }], rand);
};
describe('Transcend resource and ritual', () => {
  it('requires Elemental Spheres to buy and uses the approved provisional price', () => {
    const m = newMatch(); addPlayer(m, 'p', 'Player', false, false, () => .5); m.phase = 'shop'; m.players[0].gold = 100;
    expect(buy(m, 'p', 'transcend')).toBe(false);
    expect(m.players[0].gold).toBe(100);
    expect(buy(m, 'p', 'elemental')).toBe(true);
    expect(buy(m, 'p', 'transcend')).toBe(true);
    expect(SPELLS.transcend).toMatchObject({ cost: 25, up: [] });
  });
  it('locks the last color while retaining ordinary colors and saving matches without expiry or consumption', () => {
    const w = setup(), z = w.wizards[0];
    cast(w, 'elemental', () => .01); cast(w, 'elemental', () => .25); // fire then water
    cast(w, 'transcend');
    expect(z.transcendence).toEqual({ element: 'water', saved: 1, complete: false });
    expect(z.spheres).toHaveLength(1);
    cast(w, 'elemental', () => .01); expect(z.transcendence!.saved).toBe(1);
    cast(w, 'elemental', () => .25); expect(z.transcendence!.saved).toBe(2);
    run(w, 31); expect(z.transcendence!.saved).toBe(2);
    run(w, .5, [{ id: z.id, kind: 'basic', at: v(6, 2) }]);
    expect(z.transcendence!.saved).toBe(2);
    expect(w.projectiles.find(p => p.kind === 'basic')?.element).toBeUndefined();
    for (let i = 0; i < 3; i++) cast(w, 'elemental', () => .25);
    let draws = 0; cast(w, 'elemental', () => { draws++; return .25; });
    expect(draws).toBe(0); expect(z.transcendence!.saved).toBe(5);
  });
  it('does not interrupt movement or spend resources on invalid Transcend requests', () => {
    const w = setup(), z = w.wizards[0]; z.target = v(-4, 0);
    cast(w, 'transcend'); expect(z.target).not.toBeNull(); expect(z.transcendence).toBeUndefined();
    z.transcendence = { element: 'earth', saved: 4, complete: false };
    cast(w, 'transcend'); expect(z.transcendLeft ?? 0).toBe(0); expect(z.target).not.toBeNull();
  });
  it('summons other colors normally, keeps their bonuses and fires them without spending the saved color', () => {
    const w = setup(), z = w.wizards[0];
    cast(w, 'elemental', () => .01); cast(w, 'elemental', () => .25); cast(w, 'transcend');
    cast(w, 'elemental', () => .99);
    expect(z.transcendence).toEqual({ element: 'water', saved: 1, complete: false });
    expect(z.spheres?.map(s => s.element)).toEqual(['fire', 'void']);
    const bonus = elementalBonuses(z.spheres, w.t, z.transcendence);
    expect([bonus.fire, bonus.water, bonus.void]).toEqual([.05, .05, .05]);
    const view = decodeSnap(encodeSnap(w, z.id, 0, []), ['p0', 'p1']).wizards[0];
    expect(view.spheres?.map(s => s.element)).toEqual(['fire', 'void']);
    expect(elementalBonuses(view.spheres, 0, view.transcendence)).toEqual(bonus);
    run(w, .5, [{ id: z.id, kind: 'basic', at: v(6, 2) }]);
    const shot = w.projectiles.find(p => p.kind === 'basic');
    expect(shot?.element).toBe('fire'); expect(shot?.stats?.dmg).toBeCloseTo(29.1);
    expect(z.spheres?.map(s => s.element)).toEqual(['void']); expect(z.transcendence!.saved).toBe(1);
    run(w, 31); expect(z.spheres).toHaveLength(0); expect(z.transcendence!.saved).toBe(1);
  });
  it('shares the five-sphere cap between saved and ordinary colors', () => {
    const w = setup(), z = w.wizards[0];
    z.transcendence = { element: 'ki', saved: 3, complete: false };
    z.spheres = [{ element: 'fire', until: 30 }, { element: 'water', until: 30 }];
    let draws = 0; cast(w, 'elemental', () => { draws++; return .65; });
    expect(draws).toBe(0); expect(z.spheres).toHaveLength(2); expect(z.transcendence.saved).toBe(3);
  });
  it('locks movement/actions, makes the caster untargetable/invulnerable for2.5s, then heals300', () => {
    const w = setup(), z = w.wizards[0]; z.hp = 500;
    z.transcendence = { element: 'fire', saved: 5, complete: false };
    cast(w, 'transcend');
    expect(isSuspended(z)).toBe(true); expect(z.blindUntil).toBeCloseTo(2.5); expect(z.incapacitateUntil).toBeCloseTo(2.5);
    run(w, 2.3, [{ id: z.id, kind: 'move', to: v(-5, 0) }, { id: z.id, kind: 'cast', spell: 'fireball', at: v(4, 0) }, { id: 'p1', kind: 'cast', spell: 'fireball', at: v(0, 0) }]);
    expect(z.pos).toEqual(v(0, 0)); expect(z.hp).toBe(500); expect(z.cd.fireball).toBe(0);
    run(w, .3);
    expect(z.transcendence.complete).toBe(true); expect(isSuspended(z)).toBe(false); expect(z.hp).toBe(800);
    expect(z.spheres).toBeUndefined();
    let draws = 0; cast(w, 'elemental', () => { draws++; return 0; }); expect(draws).toBe(0);
    run(w, .5, [{ id: z.id, kind: 'basic', at: v(6, 2) }]);
    expect(w.projectiles.find(p => p.kind === 'basic')).toMatchObject({ element: 'fire', stats: { dmg: 37.5 } });
    cast(w, 'transcend'); expect(z.transcendLeft).toBe(0); expect(z.hp).toBe(800);
  });
  it.each(['fire', 'water', 'earth', 'ki', 'void'] as Element[])('retains all five %s benefits without any drawbacks', element => {
    const w = setup(), z = w.wizards[0]; z.transcendence = { element, saved: 5, complete: true };
    const b = elementalBonuses(z.spheres, w.t, z.transcendence), l = elementalLevel(spellLevel('fireball', 1), b);
    expect(b[element]).toBeCloseTo(.25); expect(b.pure).toBe(true);
    expect(elementalPenalty(.25, b.pure)).toBe(0);
    if (element === 'fire') expect(l.knock).toBe(spellLevel('fireball', 1).knock);
    if (element === 'water') expect(l.dmg).toBe(spellLevel('fireball', 1).dmg);
    if (element === 'earth') expect(l.range).toBe(spellLevel('fireball', 1).range);
    if (element === 'ki') { run(w, .1); expect(z.speed).toBe(z.baseSpeed); }
    if (element === 'void') { expect(damageFactor(w, z)).toBe(.75); z.cd.fireball = 20; run(w, 1); expect(z.cd.fireball - w.t).toBeCloseTo(19); }
  });
  it('keeps the earned state for this match and clears it when starting a new match', () => {
    const m = newMatch(); addPlayer(m, 'p', 'Player', false, false, () => .5);
    m.players[0].transcendence = { element: 'earth', saved: 5, complete: true };
    expect(startMatch(m, 0, 1, 'rounds', true, () => .5)).toBe(true);
    expect(m.players[0].transcendence).toBeUndefined();
  });
  it('synchronizes saved spheres, the ritual and the owned spell choice without revealing hidden wizards', () => {
    const w = setup(), z = w.wizards[0];
    z.transcendence = { element: 'water', saved: 5, complete: false };
    cast(w, 'transcend');
    const snap = encodeSnap(w, z.id, 0, []);
    expect(parseServerMessage(snap)).not.toBeNull();
    const view = decodeSnap(snap, ['p0', 'p1']).wizards[0];
    expect(view.transcendence).toEqual(z.transcendence); expect(view.transcendLeft).toBeGreaterThan(2.4);
    const prediction = createPredict(); prediction.move(v(-4, 0));
    expect(prediction.frame(view, .1)).toEqual(view.pos);
    run(w, 2.6);
    stepWorld(w, [{ id: z.id, kind: 'transcendSpell', spell: 'fireball' }], () => .5);
    expect(z.transcendence.spell).toBe('fireball');
    stepWorld(w, [{ id: z.id, kind: 'transcendSpell', spell: 'meteor' }], () => .5);
    expect(z.transcendence.spell).toBe('fireball');
    expect(parseServerMessage(encodeSnap(w, z.id, 0, []))).not.toBeNull();
    z.veilUntil = w.t + 10;
    expect(encodeSnap(w, 'p1', 0, []).tc?.slice(0, 5)).toEqual([-1, 0, 0, 0, -1]);
  });
  it('rejects forged choices and malformed state payloads', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'transcendSpell', spell: 'fireball', seq: 1 }))).not.toBeNull();
    for (const extra of [{ element: 'fire' }, { complete: true }, { playerId: 'other' }]) expect(parseClientMessage(JSON.stringify({ t: 'transcendSpell', spell: 'fireball', seq: 1, ...extra }))).toBeNull();
    const w = setup(), snap = encodeSnap(w, 'p0', 0, []);
    for (const tc of [[0, 5, 3, 0], [0, 6, 1, 0, -1, -1, 0, 0, 0, -1], [0, 5, 3, 1, -1, -1, 0, 0, 0, -1], [0, 5, 2, Infinity, -1, -1, 0, 0, 0, -1]]) expect(parseServerMessage({ ...snap, tc })).toBeNull();
  });
  it('keeps earned bonuses through Sandbox restarts and serializable match state', () => {
    const m = newMatch(); addPlayer(m, 'p', 'Player', false, false, () => .5);
    startMatch(m, 0, 0, 'rounds', true, () => .5, {}, [], true);
    let now = toPlaying(m, 0, () => .5);
    const z = m.world!.wizards.find(z => z.id === 'p')!;
    z.transcendence = { element: 'ki', saved: 5, complete: true, spell: 'fireball' };
    tickMatch(m, now += 17, [], () => .5);
    expect(m.players[0].transcendence).toEqual(z.transcendence);
    expect(JSON.parse(JSON.stringify(m.players[0])).transcendence).toEqual(z.transcendence);
    expect(sandboxCmd(m, { op: 'restart' }, now, 'p', () => .5)).toBe(true);
    expect(m.world!.wizards.find(z => z.id === 'p')!.transcendence).toEqual(z.transcendence);
  });
  it('demonstrates the ritual and permanent colored ranged attack using the real simulation', () => {
    const state = demoWorld('transcend'); let ritual = false, shot = false;
    while (state.w.t < state.script.end) {
      demoStep(state); ritual ||= (state.w.wizards[0].transcendLeft ?? 0) > 0;
      shot ||= state.w.projectiles.some(p => p.kind === 'basic' && p.element === 'fire');
    }
    expect(ritual && shot).toBe(true);
    expect(state.w.wizards[0].transcendence?.complete).toBe(true);
  });
});
