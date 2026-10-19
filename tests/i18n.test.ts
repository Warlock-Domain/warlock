/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ARENA_EN, ARENA_NAMES } from '../src/shared/arena.ts';
import { CHARACTERS } from '../src/shared/characters.ts';
import { ITEMS, ITEM_IDS } from '../src/shared/items.ts';
import { SPELLS, SPELL_IDS } from '../src/shared/spells.ts';
import { TAUNTS } from '../src/shared/taunts.ts';
import { LANG, LANG_KEY, LOCALE, pickLang, setLang, t } from '../src/client/i18n.ts';
import { n1 } from '../src/client/rules-text.ts';
import { store } from '../src/client/store.ts';

afterEach(() => vi.unstubAllGlobals());

describe('idioma', () => {
  it('sem escolha salva, segue o idioma do navegador', () => {
    expect(pickLang(null, 'pt-BR')).toBe('pt');
    expect(pickLang(null, 'pt-PT')).toBe('pt');
    expect(pickLang(null, 'pt')).toBe('pt');
    expect(pickLang(null, 'en-US')).toBe('en');
    expect(pickLang(null, 'es-ES')).toBe('en');
    expect(pickLang(null, undefined)).toBe('en');
  });

  it('a escolha salva vence o navegador; valor estranho é ignorado', () => {
    expect(pickLang('en', 'pt-BR')).toBe('en');
    expect(pickLang('pt', 'en-US')).toBe('pt');
    expect(pickLang('xx', 'pt-BR')).toBe('pt');
  });

  it('os testes rodam em português, com vírgula decimal', () => {
    expect(LANG).toBe('pt');
    expect(LOCALE).toBe('pt-BR');
    expect(t('Loja', 'Shop')).toBe('Loja');
    expect(n1(1.5)).toBe('1,5');
  });

  it('trocar o idioma grava no navegador e recarrega', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    setLang('en');
    expect(store.get(LANG_KEY)).toBe('en');
    expect(reload).toHaveBeenCalledOnce();
    store.set(LANG_KEY, 'pt');
  });

  it('todo nome de magia, item, personagem, provocação e arena tem inglês', () => {
    for (const id of SPELL_IDS) expect(SPELLS[id].en.trim(), id).not.toBe('');
    for (const id of ITEM_IDS) {
      expect(ITEMS[id].en.trim(), id).not.toBe('');
      expect(ITEMS[id].textEn.trim(), id).not.toBe('');
    }
    for (const c of CHARACTERS) expect(c.en.trim(), c.id).not.toBe('');
    for (const x of TAUNTS) expect(x.en.trim(), x.id).not.toBe('');
    for (const k of Object.keys(ARENA_NAMES) as (keyof typeof ARENA_NAMES)[]) expect(ARENA_EN[k]?.trim(), k).toBeTruthy();
  });

  it("nenhum t('pt', 'en') do cliente com um dos lados vazio", () => {
    const empty = /\bt\(\s*(''|""|``)\s*,|\bt\(\s*('[^']*'|"[^"]*"|`[^`]*`)\s*,\s*(''|""|``)\s*\)/;
    const files = import.meta.glob<string>('../src/client/*.ts', { query: '?raw', import: 'default', eager: true });
    expect(Object.keys(files).length).toBeGreaterThan(20);
    for (const [f, src] of Object.entries(files)) expect(src.split('\n').filter((l) => empty.test(l)), f).toEqual([]);
  });
});
