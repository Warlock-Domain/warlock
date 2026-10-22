import { describe, expect, it } from 'vitest';
import { noItems } from '../src/shared/items.ts';
import { noSpells, priceOf } from '../src/shared/spells.ts';
import { boughtKeys, countBuys, presetQueue, readPresets, topUsed, type Preset } from '../src/client/screen-data.ts';

const preset: Preset = { spells: { fireball: 2, lightning: 1 }, items: { boots: 2 }, order: ['lightning', null, 'fireball'] };

describe('presets de build', () => {
  it('Usar: compra o que falta, magias pela ordem da barra e depois itens, um nível por vez', () => {
    const q = presetQueue(preset, { ...noSpells(), fireball: 1 }, noItems(), 999);
    expect(q).toEqual([{ kind: 'spell', id: 'lightning' }, { kind: 'spell', id: 'fireball' }, { kind: 'item', id: 'boots' }, { kind: 'item', id: 'boots' }]);
  });

  it('Usar: para na primeira compra que o ouro não paga, sem pular para uma mais barata', () => {
    const gold = priceOf('lightning', 0)!;
    expect(presetQueue(preset, { ...noSpells(), fireball: 1 }, noItems(), gold)).toEqual([{ kind: 'spell', id: 'lightning' }]);
    expect(presetQueue(preset, { ...noSpells(), fireball: 1 }, noItems(), gold - 1)).toEqual([]);
  });

  it('Usar: o que já tem no nível do preset (ou acima) não compra de novo', () => {
    expect(presetQueue(preset, { ...noSpells(), fireball: 3, lightning: 1 }, { ...noItems(), boots: 2 }, 999)).toEqual([]);
  });

  it('lê o salvo velho ou estragado sem quebrar: posição inválida vira vazia', () => {
    expect(readPresets('lixo')).toEqual([null, null, null]);
    const saved = JSON.stringify([preset, { spells: { nada: 3 }, items: 7, order: 'x' }]);
    expect(readPresets(saved)).toEqual([preset, { spells: {}, items: {}, order: [] }, null]);
    // a vaga vazia no meio da barra continua no lugar, para as magias não mudarem de tecla
    expect(readPresets(saved)[0]!.order).toEqual(['lightning', null, 'fireball']);
  });

  it('compra contada: cada nível novo conta; o nível 1 grátis e a venda não', () => {
    const was = { spells: { ...noSpells(), fireball: 1 }, items: { ...noItems(), boots: 1 } };
    expect(boughtKeys({ spells: noSpells(), items: noItems() }, { spells: { ...noSpells(), fireball: 1, scourge: 1 }, items: noItems() })).toEqual([]);
    expect(boughtKeys(was, { spells: { ...noSpells(), fireball: 3, lightning: 1 }, items: noItems() })).toEqual(['spell:fireball', 'spell:fireball', 'spell:lightning']);
  });

  it('mais usados: as compras recentes pesam mais e só os 3 primeiros de cada tipo', () => {
    let u: Record<string, number> = {};
    for (let i = 0; i < 5; i++) u = countBuys(u, ['spell:fireball']);
    for (let i = 0; i < 6; i++) u = countBuys(u, []);
    u = countBuys(u, ['spell:lightning', 'spell:lightning', 'spell:lightning', 'spell:lightning', 'spell:lightning', 'item:boots']);
    expect(topUsed(u, 'spell')).toEqual(['lightning', 'fireball']);
    expect(topUsed(u, 'item')).toEqual(['boots']);
    for (const s of ['meteor', 'homing', 'rush']) u = countBuys(u, ['spell:' + s]);
    expect(topUsed(u, 'spell')).toHaveLength(3);
  });
});
