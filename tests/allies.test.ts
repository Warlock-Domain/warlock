import { describe, expect, it } from 'vitest';
import { HP_MAX } from '../src/shared/constants.ts';
import { stepWorld, type SimEvent, type World } from '../src/shared/sim.ts';
import { SPELL_IDS, noSpells, type SpellId } from '../src/shared/spells.ts';
import { add, v } from '../src/shared/vec.ts';
import { run, world } from './helpers.ts';

// p0 lança; p1 é aliado dele (time 0) bem no caminho; p2 é inimigo (time 1) logo atrás
const ALL: Record<SpellId, number> = { ...noSpells(), lightning: 1, meteor: 1, drain: 1, swap: 1, rush: 1 };
function line(friendly?: 'none'): World {
  const w = world([[0, 0], [2, 0], [4, 0]], ALL, [], () => 0.5, false, [0, 0, 1]);
  if (friendly) w.friendly = friendly;
  return w;
}
const [me, ally, foe] = [0, 1, 2];

describe('aliados: magia não pega aliado (Campanha)', () => {
  it('a fireball goes through the ally and hits the enemy behind', () => {
    const w = line('none');
    run(w, 2, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(6, 0) }]);
    expect(w.wizards[ally]).toMatchObject({ hp: HP_MAX, pos: v(2, 0) });
    expect(w.wizards[foe].hp).toBeLessThan(HP_MAX);
  });

  it('the lightning goes through the ally too', () => {
    const w = line('none');
    run(w, 1, [{ id: 'p0', kind: 'cast', spell: 'lightning', at: v(6, 0) }]);
    expect(w.wizards[ally]).toMatchObject({ hp: HP_MAX, pos: v(2, 0) });
    expect(w.wizards[foe].hp).toBeLessThan(HP_MAX);
  });

  it('an explosion hurts the enemy and does not touch the ally next to it', () => {
    const w = world([[0, 0], [2.6, 0], [3.4, 0]], ALL, [], () => 0.5, false, [0, 0, 1]);
    w.friendly = 'none';
    run(w, 3, [{ id: 'p0', kind: 'cast', spell: 'meteor', at: v(3, 0) }]);
    expect(w.wizards[ally]).toMatchObject({ hp: HP_MAX, pos: v(2.6, 0) });
    expect(w.wizards[foe].hp).toBeLessThan(HP_MAX);
  });

  it('ground left by an explosion does not burn, slow or pull allies of who caused it (bug found in review)', () => {
    const w = line('none');
    w.zones.push({ pos: v(2, 0), r: 1.5, kind: 'burn', until: 99, by: 'p0' }, { pos: v(2, 0), r: 1.5, kind: 'pull', until: 99, by: 'p0' });
    w.wizards[ally].pos = v(2.8, 0);
    run(w, 2);
    expect(w.wizards[ally].hp).toBe(HP_MAX);
    expect(w.wizards[ally].pos.x).toBeCloseTo(2.8, 5);
    // sem dono (choque entre dois lados) a zona pega todo mundo
    const n = line('none');
    n.zones.push({ pos: v(2, 0), r: 1.5, kind: 'burn', until: 99, by: null });
    run(n, 2);
    expect(n.wizards[ally].hp).toBeLessThan(HP_MAX);
  });

  it('the lightning does not detonate an ally fireball (bug found in review)', () => {
    for (const friendly of ['none', undefined] as const) {
      // p0 e p1 do mesmo time; a Bola de fogo de p1 parada bem no caminho do Raio de p0; p3, aliado, ao lado dela
      const w = world([[0, 0], [0, 3], [6, 0], [3, 0.6]], ALL, [], () => 0.5, false, [1, 1, 0, 1]);
      if (friendly) w.friendly = friendly;
      w.projectiles.push({ id: w.nextId++, born: 0, kind: 'fireball', owner: 'p1', caster: 'p1', pos: v(3, 0), vel: v(0, 0.001), level: 1, until: 99, target: null, dmgMult: 1 });
      const events: SimEvent[] = [];
      stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'lightning', at: v(6, 0) }]);
      for (let i = 0; i < 60; i++) {
        stepWorld(w, []);
        events.push(...w.events);
      }
      expect(events.some((e) => e.k === 'clash' && e.combo === 'detonate'), String(friendly)).toBe(friendly !== 'none');
      if (friendly === 'none') expect(w.wizards[3].hp).toBe(HP_MAX); // o aliado do lado não queima
    }
  });

  it('a charge passes the ally without hitting (not even a zero-damage hit)', () => {
    for (const friendly of ['none', undefined] as const) {
      const w = line(friendly);
      const events: SimEvent[] = [];
      stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'rush', at: v(6, 0) }]);
      for (let i = 0; i < 120; i++) {
        stepWorld(w, []);
        events.push(...w.events);
      }
      expect(events.some((e) => e.k === 'hit' && e.id === 'p1'), String(friendly)).toBe(friendly !== 'none');
    }
  });

  it('help spells still work on the ally: Drenar heals, Troca swaps', () => {
    const w = line('none');
    w.wizards[ally].hp = 500;
    run(w, 2, [{ id: 'p0', kind: 'cast', spell: 'drain', at: v(2, 0) }]);
    expect(w.wizards[ally].hp).toBeGreaterThan(500);
    const s = world([[0, 0], [2, 0]], ALL, [], () => 0.5, false, [0, 0]);
    s.friendly = 'none';
    run(s, 2, [{ id: 'p0', kind: 'cast', spell: 'swap', at: v(2, 0) }]);
    expect(s.wizards[me].pos.x).toBeGreaterThan(1.5);
    expect(s.wizards[1].pos.x).toBeLessThan(0.5);
  });
});

describe('aliados: toda magia do jogo, lançada no inimigo com um aliado no caminho (Campanha)', () => {
  // as de ajuda valem no aliado de propósito; as de movimento e defesa mexem só em quem lança
  const HELP: SpellId[] = ['drain', 'magnetize', 'swap', 'link'];
  for (const spell of SPELL_IDS.filter((s) => !HELP.includes(s))) {
    it(`${spell} never hurts or pushes the ally`, () => {
      const w = line('none');
      w.wizards[me].spells = { ...noSpells(), [spell]: 1 };
      let fastest = 0;
      stepWorld(w, [{ id: 'p0', kind: 'cast', spell, at: v(4, 0) }]);
      for (let i = 0; i < 240; i++) {
        stepWorld(w, []);
        fastest = Math.max(fastest, Math.hypot(w.wizards[ally].vel.x, w.wizards[ally].vel.y));
      }
      expect(w.wizards[ally].hp, spell).toBe(HP_MAX);
      expect(fastest, spell).toBe(0); // nunca deslizou: não cai no abismo por magia de aliado
      expect(w.wizards[ally].pos, spell).toEqual(v(2, 0)); // nem saiu do lugar (Investida e Estocada atravessam o companheiro)
    });
  }
});

describe('aliados: corpos', () => {
  it('an enemy push still carries on through the companion (it is the enemy spell)', () => {
    const w = line('none');
    // p1 (aliado de p0) foi empurrado agora pelo inimigo p2 e vem deslizando para cima de p0
    Object.assign(w.wizards[ally], { vel: v(-6, 0), lastHitBy: 'p2', lastHitAt: w.t });
    w.wizards[ally].pos = v(0.8, 0);
    run(w, 0.3);
    expect(w.wizards[me].pos.x).toBeLessThan(-0.3); // levou o embalo
  });

  it('an enemy push carries down a whole line of companions, with the credit to the enemy', () => {
    const w = world([[0.8, 0], [0, 0], [-0.75, 0], [6, 0]], noSpells(), [], () => 0.5, false, [0, 0, 0, 1]);
    w.friendly = 'none';
    Object.assign(w.wizards[0], { vel: v(-7, 0), lastHitBy: 'p3', lastHitAt: w.t });
    run(w, 0.5);
    expect(w.wizards[2].pos.x).toBeLessThan(-1.2); // o último da fila também foi
    expect(w.wizards[2].lastHitBy).toBe('p3'); // se cair no abismo, o abate é do inimigo
  });

  it('an enemy hit during my own Estocada makes the leftover slide carry on (it is the enemy push now)', () => {
    const w = line('none');
    w.wizards[me].spells = { ...noSpells(), thrust: 1 };
    w.wizards[ally].pos = v(3, 3); // fora do caminho
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'thrust', at: v(6, 0) }]);
    for (let i = 0; i < 30; i++) stepWorld(w, []);
    Object.assign(w.wizards[me], { lastHitBy: 'p2', lastHitAt: w.t, thrustUntil: 0, vel: v(0, 6) });
    w.wizards[ally].pos = add(w.wizards[me].pos, v(0, 0.6));
    for (let i = 0; i < 20; i++) stepWorld(w, []);
    expect(Math.hypot(w.wizards[ally].vel.x, w.wizards[ally].vel.y) + Math.abs(w.wizards[ally].pos.y - w.wizards[me].pos.y)).toBeGreaterThan(0.7);
  });

  it('allies walking into each other still do not overlap', () => {
    const w = world([[0, 0], [1, 0]], noSpells(), [], () => 0.5, false, [0, 0]);
    w.friendly = 'none';
    run(w, 2, [{ id: 'p0', kind: 'move', to: v(1, 0) }]);
    expect(Math.abs(w.wizards[1].pos.x - w.wizards[0].pos.x)).toBeGreaterThan(0.6);
  });
});

describe('aliados: modo Times continua como o Fernando decidiu (magia em aliado só empurra)', () => {
  it('the fireball stops on the ally and pushes it, without damage', () => {
    const w = line();
    run(w, 2, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(6, 0) }]);
    expect(w.wizards[ally].hp).toBe(HP_MAX);
    expect(w.wizards[ally].pos.x).toBeGreaterThan(2.5);
  });
});
