import { describe, expect, it } from 'vitest';
import { elementalBonuses, elementalLevel, ELEMENT_COLORS, type Element } from '../src/shared/elemental-spheres.ts';
import { noSpells, spellLevel } from '../src/shared/spells.ts';
import { run, world } from './helpers.ts';
import { v } from '../src/shared/vec.ts';

const bonus = (element: Element, n = 1) => elementalBonuses(Array.from({ length: n }, () => ({ element, left: 30 })));
function setup(element?: Element) {
  const w = world([[0, 0], [2, 0]], { ...noSpells(), grip: 1, cluster: 1, shield: 1 }, [], () => .5);
  w.pillars = []; w.runes = []; w.rules.chests = false; w.rules.runes = false; w.shrinkAt = 1000;
  if (element) w.wizards[0].spheres = [{ element, until: 30 }];
  return w;
}
describe('elemental five-percent benefits and three-percent drawbacks', () => {
  const base = spellLevel('fireball', 1);
  it.each([1, 5])('red stacks damage up and knockback down for %s spheres', n => {
    const l = elementalLevel(base, bonus('fire', n));
    expect(l.dmg).toBeCloseTo(base.dmg * (1 + n * .05));
    expect(l.knock).toBeCloseTo(base.knock * (1 - n * .03));
  });
  it('blue increases projectile speed and range, reducing damage', () => {
    const l = elementalLevel(base, bonus('water'));
    expect(l.speed).toBeCloseTo(base.speed * 1.05); expect(l.range).toBeCloseTo(base.range * 1.05);
    expect(l.dmg).toBeCloseTo(base.dmg * .97); expect(l.knock).toBe(base.knock);
  });
  it('brown reduces area and range while extending outgoing negative statuses', () => {
    const l = elementalLevel(spellLevel('cluster', 1), bonus('earth'));
    expect(l.incapacitate).toBeCloseTo(spellLevel('cluster', 1).incapacitate * 1.05);
    expect(l.blind).toBeCloseTo(spellLevel('cluster', 1).blind * 1.05);
    const meteor = spellLevel('meteor', 1), changed = elementalLevel(meteor, bonus('earth', 5));
    expect(changed.radius ** 2 / meteor.radius ** 2).toBeCloseTo(.85);
    expect(changed.range / meteor.range).toBeCloseTo(.85);
    const w = setup('earth'); run(w, .2, [{ id: 'p0', kind: 'cast', spell: 'grip', at: v(2, 0) }]);
    w.wizards[0].spheres = [];
    while (!w.wizards[1].gripUntil && w.t < 3) run(w, 1 / 60);
    expect(w.wizards[1].gripUntil - w.t).toBeCloseTo(spellLevel('grip', 1).duration * 1.05, 1);
  });
  it('ki keeps its current color, boosts healing/positive duration and slows only walking', () => {
    expect(ELEMENT_COLORS.ki).toBe('#ffffff');
    const heal = spellLevel('heal', 1);
    expect(elementalLevel(heal, bonus('ki')).heal).toBeCloseTo(heal.heal * 1.05);
    const w = setup('ki'), plain = setup();
    for (const a of [w, plain]) run(a, .1, [{ id: 'p0', kind: 'move', to: v(-4, 0) }]);
    expect(w.wizards[0].speed / plain.wizards[0].speed).toBeCloseTo(.97);
    run(w, .1, [{ id: 'p0', kind: 'cast', spell: 'shield', at: v(0, 0) }]);
    expect(w.wizards[0].shieldUntil).toBeCloseTo(.1 + spellLevel('shield', 1).duration * 1.05);
  });
  it('black increases effective cooldown duration by three percent without a range penalty', () => {
    const w = setup('void'), z = w.wizards[0]; z.cd.fireball = 20;
    run(w, 1);
    expect(z.cd.fireball - w.t).toBeCloseTo(20 - 1 / 1.03, 2);
    expect(elementalLevel(base, bonus('void')).range).toBe(base.range);
  });
  it('brown also extends Lightning status independently of its smaller hit area', () => {
    const plain = setup(), changed = setup('earth');
    for (const w of [plain, changed]) { w.wizards[0].spells.lightning = 1; run(w, .2, [{ id: 'p0', kind: 'cast', spell: 'lightning', at: v(2, 0) }]); }
    expect(changed.wizards[1].electroUntil).toBeCloseTo(plain.wizards[1].electroUntil! + .1);
  });
  it('black reduces continuous ground pulls without suppressing walking', () => {
    const plain = setup(), changed = setup('void');
    for (const w of [plain, changed]) { w.zones.push({ kind: 'pull', pos: v(1, 0), r: 3, until: 2 }); run(w, 1 / 60); }
    expect(changed.wizards[0].pos.x / plain.wizards[0].pos.x).toBeCloseTo(.95);
  });
});
