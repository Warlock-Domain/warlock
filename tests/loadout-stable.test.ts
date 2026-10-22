import { describe, expect, it } from 'vitest';
import { myLoadout } from '../src/client/screen-data.ts';
import { noSpells } from '../src/shared/spells.ts';
import { store } from '../src/client/store.ts';

// #226: comprar magia nova não troca a tecla das que você já tem
describe('ordem da barra ao comprar', () => {
  it('a magia nova entra na primeira vaga livre e as outras ficam onde estavam', () => {
    store.set('warlock:loadout-order', 'null');
    const before = myLoadout({ ...noSpells(), scourge: 0, homing: 1 });
    expect(before.spells.slice(0, 2)).toEqual(['fireball', 'homing']);
    // o Raio vem antes do Míssil na lista de magias: antes ele empurrava o Míssil do W para o E
    const after = myLoadout({ ...noSpells(), scourge: 0, homing: 1, lightning: 1 });
    expect(after.spells.slice(0, 3)).toEqual(['fireball', 'homing', 'lightning']);
  });
});
