import { describe, expect, it } from 'vitest';
import { DT, HP_MAX, WIZ_SPEED } from '../src/shared/constants.ts';
import { ITEMS, MAX_ITEMS, PACT, SCOURGE, itemPrice, noItems, type ItemId } from '../src/shared/items.ts';
import { addPlayer, buy, buyItem, buyMastery, newMatch, startMatch, undoBuy } from '../src/shared/match.ts';
import { newWorld, stepWorld, type World } from '../src/shared/sim.ts';
import { SPELLS, noSpells, type SpellId } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';

const allSpells = (): Record<SpellId, number> => ({ ...noSpells(), lightning: 1, homing: 1, shield: 1, teleport: 1 });
const with_ = (it: Partial<Record<ItemId, number>>) => ({ ...noItems(), ...it });

function world(spots: [number, number][], items: Partial<Record<ItemId, number>>[] = []): World {
  const ids = spots.map((_, i) => 'p' + i);
  const w = newWorld(ids, Object.fromEntries(ids.map((id) => [id, allSpells()])), Object.fromEntries(ids.map((id, i) => [id, with_(items[i] ?? {})])));
  spots.forEach(([x, y], i) => (w.wizards[i].pos = v(x, y)));
  for (const z of w.wizards) z.invulnUntil = 0;
  return w;
}
const steps = (w: World, n: number) => {
  for (let i = 0; i < n; i++) stepWorld(w, []);
};

describe('itens passivos', () => {
  it('ring raises max hp', () => {
    const w = world([[0, 0]], [{ ring: 2 }]);
    expect(w.wizards[0].hpMax).toBe(HP_MAX + 19);
    expect(w.wizards[0].hp).toBe(HP_MAX + 19);
  });

  it('armor reduces knockback', () => {
    const plain = world([[0, 0], [3, 0]]);
    const armored = world([[0, 0], [3, 0]], [{}, { armor: 3 }]);
    for (const w of [plain, armored]) {
      stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(3, 0) }]);
      steps(w, 30);
    }
    const ratio = armored.wizards[1].vel.x / plain.wizards[1].vel.x;
    expect(ratio).toBeCloseTo(1 - 0.22, 2);
  });

  it('boots make you walk faster', () => {
    const w = world([[0, 0]], [{ boots: 3 }]);
    stepWorld(w, [{ id: 'p0', kind: 'move', to: v(5, 0) }]);
    steps(w, 59);
    expect(w.wizards[0].pos.x).toBeCloseTo(WIZ_SPEED + ITEMS.boots.levels[2].speed!, 1);
  });
});

describe('itens ativos', () => {
  it('scourge explodes after the windup and pushes nearby, without hurting the caster', () => {
    const w = world([[0, 0], [1, 0], [5, 0]], [{ scourge: 1 }]);
    stepWorld(w, [{ id: 'p0', kind: 'item', item: 'scourge', at: v(0, 0) }]);
    steps(w, Math.round(SCOURGE.windup / DT) - 5);
    expect(w.wizards[1].hp).toBe(HP_MAX);
    steps(w, 10);
    expect(w.wizards[1].hp).toBeLessThan(HP_MAX);
    expect(w.wizards[1].vel.x).toBeGreaterThan(0);
    expect(w.wizards[2].hp).toBe(HP_MAX);
    expect(w.wizards[0].hp).toBe(HP_MAX);
  });

  it('scourge never kills its caster', () => {
    const w = world([[0, 0]], [{ scourge: 3 }]);
    w.wizards[0].hp = 3;
    stepWorld(w, [{ id: 'p0', kind: 'item', item: 'scourge', at: v(0, 0) }]);
    steps(w, 70);
    expect(w.wizards[0].alive).toBe(true);
    expect(w.wizards[0].hp).toBeGreaterThanOrEqual(1);
  });

  it('pact makes the next damaging spell stronger and does not slow', () => {
    const w = world([[0, 0], [2, 0]], [{ pact: 1 }]);
    stepWorld(w, [{ id: 'p0', kind: 'item', item: 'pact', at: v(0, 0) }]);
    steps(w, 15);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'lightning', at: v(2, 0) }]);
    steps(w, 15);
    // a vida volta um pouco (regeneração) entre o acerto e a conferência
    expect(HP_MAX - w.wizards[1].hp).toBeGreaterThan(SPELLS.lightning.levels[0].dmg * PACT.mult - 0.2);
    steps(w, 2);
    expect(w.wizards[0].speed).toBe(WIZ_SPEED);
  });

  it('no spell goes out while the scourge is winding up', () => {
    const w = world([[0, 0], [1, 0]], [{ scourge: 1 }]);
    stepWorld(w, [{ id: 'p0', kind: 'item', item: 'scourge', at: v(0, 0) }]);
    steps(w, 5);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'lightning', at: v(2, 0) }]);
    expect(w.wizards[0].casting?.item).toBe('scourge');
    expect(w.wizards[0].cd.lightning).toBe(0);
    steps(w, 40);
    expect(w.wizards[1].hp).toBeLessThan(HP_MAX); // o Flagelo saiu mesmo assim
  });

  it('redirector turns your nearest projectile toward the cursor', () => {
    const w = world([[0, 0], [0, 5]], [{ redirector: 1 }]);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(5, 0) }]);
    steps(w, 20);
    stepWorld(w, [{ id: 'p0', kind: 'item', item: 'redirector', at: v(0, 5) }]);
    steps(w, 13);
    const p = w.projectiles[0];
    expect(p.vel.y).toBeGreaterThan(Math.abs(p.vel.x));
    steps(w, 80);
    expect(w.wizards[1].hp).toBeLessThan(HP_MAX);
  });

  it('scourge destroys enemy projectiles in the blast', () => {
    // a bola de fogo chega na área no meio do preparo de 0,5 s
    const w = world([[0, 0], [5.5, 0]], [{ scourge: 1 }]);
    stepWorld(w, [{ id: 'p1', kind: 'cast', spell: 'fireball', at: v(0, 0) }]);
    steps(w, 6);
    stepWorld(w, [{ id: 'p0', kind: 'item', item: 'scourge', at: v(0, 0) }]);
    steps(w, 32);
    expect(w.projectiles.length).toBe(0);
    expect(w.wizards[0].hp).toBe(HP_MAX);
  });

  it('item not owned does nothing', () => {
    const w = world([[0, 0], [1, 0]]);
    stepWorld(w, [{ id: 'p0', kind: 'item', item: 'scourge', at: v(0, 0) }]);
    steps(w, 70);
    expect(w.wizards[1].hp).toBe(HP_MAX);
  });
});

describe('loja de itens', () => {
  it('buys, upgrades to the max level and respects 6 items', () => {
    const m = newMatch();
    addPlayer(m, 'a', 'Ana');
    addPlayer(m, 'b', 'Bia');
    startMatch(m, 0, 0);
    const p = m.players[0];
    p.gold = 200;
    expect(buyItem(m, 'a', 'cape')).toBe(true);
    expect(buyItem(m, 'a', 'cape')).toBe(true);
    expect(buyItem(m, 'a', 'cape')).toBe(true);
    expect(buyItem(m, 'a', 'cape')).toBe(false);
    expect(p.gold).toBe(200 - 3 * ITEMS.cape.cost);
    // o Flagelo já vem de graça e ocupa um espaço
    expect(p.items.scourge).toBe(1);
    for (const i of ['ring', 'armor', 'boots', 'watch'] as ItemId[]) expect(buyItem(m, 'a', i)).toBe(true);
    expect(itemPrice(p.items, 'pact')).toBeNull();
    expect(buyItem(m, 'a', 'pact')).toBe(false);
    expect(Object.values(p.items).filter(Boolean).length).toBe(MAX_ITEMS);
  });
});

describe('desfazer compra', () => {
  it('undo refunds the latest purchase of that kind in this shop', () => {
    const m = newMatch();
    addPlayer(m, 'a', 'Ana');
    addPlayer(m, 'b', 'Bia');
    startMatch(m, 0, 0);
    const p = m.players[0];
    p.gold = 50;
    buy(m, 'a', 'lightning');
    buyItem(m, 'a', 'armor');
    buyMastery(m, 'a', 'all');
    expect(p.gold).toBe(50 - 11 - 6 - 13);
    expect(undoBuy(m, 'a', 'spell:lightning')).toBe(true);
    expect(undoBuy(m, 'a', 'mastery:all')).toBe(true);
    expect(p.spells.lightning).toBe(0);
    expect(p.masteries).toEqual({ duration: 0, range: 0, lifesteal: 0 });
    expect(p.gold).toBe(50 - 6);
    expect(undoBuy(m, 'a', 'spell:lightning')).toBe(false);
    // o Flagelo grátis do começo não pode ser "desfeito" para ganhar ouro
    expect(undoBuy(m, 'a', 'item:scourge')).toBe(false);
  });
});

describe('maestrias', () => {
  it('cost 5 each or 13 for all three, max 6 levels', () => {
    const m = newMatch();
    addPlayer(m, 'a', 'Ana');
    addPlayer(m, 'b', 'Bia');
    startMatch(m, 0, 0);
    const p = m.players[0];
    p.gold = 100;
    expect(buyMastery(m, 'a', 'range')).toBe(true);
    expect(p.gold).toBe(95);
    expect(buyMastery(m, 'a', 'all')).toBe(true);
    expect(p.gold).toBe(82);
    expect(p.masteries).toEqual({ duration: 1, range: 2, lifesteal: 1 });
    for (let i = 0; i < 4; i++) buyMastery(m, 'a', 'range');
    expect(p.masteries.range).toBe(6);
    expect(buyMastery(m, 'a', 'range')).toBe(false);
    expect(buyMastery(m, 'a', 'all')).toBe(false);
  });

  it('range mastery makes the fireball fly farther', () => {
    const base = newWorld(['a', 'b'], { a: allSpells(), b: allSpells() });
    const far = newWorld(['a', 'b'], { a: allSpells(), b: allSpells() }, {}, { a: { duration: 0, range: 6, lifesteal: 0 } });
    for (const w of [base, far]) {
      w.wizards[0].pos = v(0, 0);
      w.wizards[1].pos = v(0, 9);
      stepWorld(w, [{ id: 'a', kind: 'cast', spell: 'fireball', at: v(5, 0) }]);
      steps(w, 12);
    }
    // alcance nível 6 = +52%: a bola vive ~0,5 s a mais
    expect(far.projectiles[0].until - base.projectiles[0].until).toBeCloseTo(0.52, 1);
  });

  it('lifesteal heals the attacker', () => {
    const w = newWorld(['a', 'b'], { a: allSpells(), b: allSpells() }, {}, { a: { duration: 0, range: 0, lifesteal: 6 } });
    w.wizards[0].pos = v(0, 0);
    w.wizards[1].pos = v(2, 0);
    for (const z of w.wizards) z.invulnUntil = 0;
    w.wizards[0].hp = 50;
    stepWorld(w, [{ id: 'a', kind: 'cast', spell: 'lightning', at: v(2, 0) }]);
    steps(w, 10);
    expect(w.wizards[0].hp).toBeGreaterThan(52);
  });
});
