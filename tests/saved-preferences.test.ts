import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { savedBotSetup, readBotSetup } from '../src/client/train.ts';
import { readProfile, savedProfile, toSkill, addRound } from '../src/client/mimic.ts';
import { bestOf, saveBest } from '../src/client/challenges.ts';
import { readLoadout, readPresets, readShopSize, readUsed, countBuys } from '../src/client/screen-data.ts';
import { store } from '../src/client/store.ts';
import { SPELL_IDS } from '../src/shared/spells.ts';
import { MAX_PLAYERS } from '../src/shared/constants.ts';
import { parseClientMessage } from '../src/shared/protocol.ts';
import type { Stat } from '../src/shared/match.ts';

const saved = new Map<string, string>();
const round: Stat = { gold: 0, dmg: 0, kills: 0, deaths: 0, alive: 60, dmgBy: {}, deathBy: {}, fired: { fireball: 30 }, landed: { fireball: 10 }, threats: 0, struck: 0, shieldable: 0, shielded: 0, reactSum: 0, reactN: 0, nearSum: 0, nearN: 0 };
beforeEach(() => {
  saved.clear();
  for (const key of ['sandboxbot', 'perfil', 'challenges', 'keys', 'pad', 'poskeys8']) saved.set('warlock:' + key, 'null');
  vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) });
});
afterEach(() => vi.unstubAllGlobals());

describe('preferências vindas de JSON desconhecido', () => {
  it('JSON não promete um tipo e tolera chave ausente ou sintaxe estragada', () => {
    expectTypeOf<ReturnType<typeof store.json>>().toEqualTypeOf<unknown>();
    expect(store.json('missing')).toBeNull();
    saved.set('broken', '{');
    expect(store.json('broken')).toBeNull();
    saved.set('unknown', '{"shape":"unchecked"}');
    expect(store.json('unknown')).toEqual({ shape: 'unchecked' });
  });

  it.each([null, {}, true, 7, 'text'])('sandbox ignora lista no formato errado: %j', (value) => {
    saved.set('warlock:sandboxbot', JSON.stringify(value));
    expect(savedBotSetup()).toEqual([]);
  });

  it('sandbox mantém posições, remove ids obsoletos e níveis inválidos, e entrega configuração aceita pelo servidor', () => {
    const result = readBotSetup([null, [], { difficulty: 'veteran', obsolete: true,
      spells: { fireball: 0, illusion: 7, removed: 3, shield: 8, teleport: 1.5, lightning: '2', homing: Infinity },
      items: { boots: 3, helmet: 2, removed: 1, armor: -1 }, skill: { aim: 0.2, delay: NaN, removed: 1 } }]);
    expect(result).toEqual([{}, {}, { difficulty: 'veteran', spells: { fireball: 0, illusion: 7 }, items: { boots: 3 }, skill: { aim: 0.2 } }]);
    expect(parseClientMessage(JSON.stringify({ t: 'start', bots: result.length, setup: result }))).not.toBeNull();
  });

  it('sandbox preserva configuração válida, limita número de bots e recusa magia demais contando as iniciais', () => {
    const valid = { spells: { fireball: 0, shield: 2 }, items: { aegis: 1 }, difficulty: 'easy', skill: { cast: 0, dodge: 0.2 } };
    expect(readBotSetup([valid])).toEqual([valid]);
    expect(readBotSetup(Array.from({ length: 100 }, () => ({})))).toHaveLength(MAX_PLAYERS - 1);
    expect(readBotSetup([{ spells: Object.fromEntries(SPELL_IDS.map((id) => [id, 1])) }])).toEqual([{}]);
  });

  it('perfil válido sobrevive e campos obsoletos não passam para o estado numérico', () => {
    const profile = addRound(null, round, 0.1);
    expect(readProfile({ ...profile, obsolete: {} })).toEqual(profile);
    saved.set('warlock:perfil', JSON.stringify(profile));
    expect(savedProfile()).toEqual(profile);
    expect(Object.values(addRound(savedProfile(), round, 0.2)).every(Number.isFinite)).toBe(true);
  });

  it('perfil estragado cai para aprendizado novo sem NaN, inclusive com números extremos', () => {
    const profile = addRound(null, round, 0.1);
    for (const value of [null, {}, [], { ...profile, fired: '30' }, { ...profile, rtt: -1 }, { ...profile, alive: Infinity }, { ...profile, fired: Number.MAX_VALUE }, { ...profile, n: 1.5 }]) {
      expect(readProfile(value), JSON.stringify(value)).toBeNull();
    }
    saved.set('warlock:perfil', '{}');
    expect(toSkill(savedProfile())).toBeNull();
    expect(addRound(savedProfile(), round, 0.1)).toEqual(profile);
  });

  it('recordes descartam estrutura e números ruins sem perder os bons ao guardar outro desafio', () => {
    saved.set('warlock:challenges', '{"alvo":"bad","lava":-1,"duelo":1e400,"escudo":12.5}');
    for (const id of ['alvo', 'lava', 'duelo', 'constructor']) expect(bestOf(id), id).toBeNull();
    expect(bestOf('escudo')).toBe(12.5);
    expect(saveBest('alvo', 20, false)).toBe(true);
    expect(bestOf('escudo')).toBe(12.5);
    expect(saveBest('alvo', NaN, false)).toBe(false);
    expect(saveBest('alvo', -1, false)).toBe(false);
    expect(bestOf('alvo')).toBe(20);
    expect(JSON.parse(saved.get('warlock:challenges')!)).toEqual({ escudo: 12.5, alvo: 20 });
  });

  it('contagens da loja só aceitam números seguros e ids conhecidos', () => {
    const result = readUsed({ 'spell:fireball': 1.5, 'item:boots': 2, 'spell:removed': 3, 'item:removed': 4, 'spell:shield': '7', 'spell:lightning': Infinity, 'item:ring': -1 });
    expect(result).toEqual({ 'spell:fireball': 1.5, 'item:boots': 2 });
    expect(Object.values(countBuys(result, ['spell:fireball'])).every(Number.isFinite)).toBe(true);
    for (const value of [null, [], 'bad', 1]) expect(readUsed(value)).toEqual({});
  });

  it('tamanho salvo só aceita o par de dimensões em pixels produzido pela alça', () => {
    expect(readShopSize(['1200.5px', '700px'])).toEqual(['1200.5px', '700px']);
    expect(readShopSize(['900px', ''])).toEqual(['900px', '']);
    for (const value of [{}, 'bad', [1, 2], ['0px', '2px'], ['-1px', '2px'], ['Infinitypx', '2px'], ['1e400px', '2px'], ['999999999999999999999px', '2px'], ['2px'], ['auto', '2px']]) expect(readShopSize(value), JSON.stringify(value)).toBeNull();
  });

  it('ordem antiga migra sem perder vagas vazias e presets só retêm níveis suportados', () => {
    expect(readLoadout({ spells: ['shield', null, 'removed', 'fireball'], items: ['scourge'] })).toEqual({ spells: ['shield', null, null, 'fireball'] });
    for (const value of [null, {}, [], { spells: 'bad' }]) expect(readLoadout(value)).toBeUndefined();
    expect(readPresets(JSON.stringify([{ spells: { fireball: 8, shield: 2 }, items: { boots: 3, helmet: 2 }, order: ['shield', null] }]))[0]).toEqual({ spells: { shield: 2 }, items: { boots: 3 }, order: ['shield', null] });
  });

  it('teclas e controle ignoram estruturas erradas e mantêm entradas válidas ao recarregar', async () => {
    saved.set('warlock:slotkeys', '0');
    saved.set('warlock:keys', '["KeyP"]');
    saved.set('warlock:poskeys8', '{"slot1":{},"slot2":"Digit9"}');
    saved.set('warlock:pad', '{"shop":"13","center":15,"sheet":1.5}');
    vi.resetModules();
    const keys = await import('../src/client/keys.ts');
    expect(keys.keyOf('fireball')).toBe('KeyQ');
    expect(keys.keyOf('slot1')).toBe('Digit1');
    expect(keys.keyOf('slot2')).toBe('Digit9');
    expect(keys.padButtonOf('shop')).toBe(13);
    expect(keys.padButtonOf('sheet')).toBe(10);
    expect(keys.padButtonOf('center')).toBe(15);
  });
});
