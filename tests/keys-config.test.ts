import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BTN, padAction } from '../src/client/gamepad.ts';
import {
  ACTIONS, PAD_START, UI_ACTIONS, actionFor, isUiKey, keyOf, labelOf, onFreeEsc, padActionAt, padButtonOf, resetKeys, resetPad, setKey, setPadButton, setPadMode, setSlotMode, setSlots, whoUses,
} from '../src/client/keys.ts';
import { RULES } from '../src/client/rules-text.ts';

beforeEach(() => {
  setSlotMode(false);
  setPadMode(false);
  resetKeys();
  resetPad();
});

describe('teclas da interface no mesmo painel das magias', () => {
  it('atalho e magia não repetem tecla: dar o Q às provocações troca com a Bola de fogo, e o atalho nunca lança', () => {
    expect(whoUses('KeyQ')).toBe('fireball');
    expect(setKey('taunt', 'KeyQ')).toBe(true);
    expect([keyOf('taunt'), keyOf('fireball')]).toEqual(['KeyQ', 'KeyY']);
    expect(actionFor('KeyQ')).toBeUndefined();
    expect(actionFor('KeyY')).toBe('fireball');
    expect([isUiKey('KeyQ', 'taunt'), isUiKey('KeyY', 'taunt')]).toEqual([true, false]);
  });

  it('o Votar começa sem tecla e "sem tecla" nunca casa com nada', () => {
    expect(keyOf('vote')).toBe('');
    expect(isUiKey('', 'vote')).toBe(false);
    expect(setKey('vote', 'Digit9')).toBe(true);
    expect(isUiKey('Digit9', 'vote')).toBe(true);
  });

  it('Esc, Enter, Espaço e ← → são fixas para magias e atalhos', () => {
    for (const code of ['Escape', 'Enter', 'Space', 'ArrowLeft', 'ArrowRight']) {
      expect(setKey('fireball', code)).toBe(false);
      expect(setKey('board', code)).toBe(false);
    }
    expect([keyOf('fireball'), keyOf('board')]).toEqual(['KeyQ', 'Tab']);
  });

  it('modo Q W E R D F: as seis letras são das posições da barra; atalho e item não ficam com elas', () => {
    setSlots(['fireball', 'lightning']);
    setSlotMode(true);
    expect(setKey('shop', 'KeyQ')).toBe(false);
    expect(setKey('scourge', 'KeyW')).toBe(false);
    expect(whoUses('KeyQ')).toBe('fireball');
    expect(actionFor('KeyW')).toBe('lightning');
    expect(setKey('stop', 'KeyT')).toBe(true); // letra fora das seis vale
    expect(isUiKey('KeyT', 'stop')).toBe(true);
  });

  it('Rever a queda começa no 5 e é trocável como os outros atalhos', () => {
    expect(isUiKey('Digit5', 'replay')).toBe(true);
    expect(actionFor('Digit5')).toBeUndefined();
    expect(setKey('replay', 'Digit9')).toBe(true);
    expect([isUiKey('Digit9', 'replay'), isUiKey('Digit5', 'replay')]).toEqual([true, false]);
  });

  it('depois de muitas trocas nenhuma tecla aparece em duas ações', () => {
    const all = [...ACTIONS, ...UI_ACTIONS];
    const codes = ['KeyQ', 'KeyS', 'Tab', 'Digit4', 'F1', 'Backquote', 'KeyY', 'Digit1', 'KeyZ', 'F2'];
    for (let i = 0; i < 200; i++) setKey(all[(i * 7) % all.length], codes[(i * 3) % codes.length]);
    const used = all.map(keyOf).filter(Boolean);
    expect(new Set(used).size).toBe(used.length);
  });
});

describe('teclas e botões guardados no navegador', () => {
  const store = new Map<string, string>();
  const fake = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  afterAll(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('a troca sobrevive a recarregar a página; tecla fixa ou botão Start salvos à mão são ignorados', async () => {
    Object.assign(globalThis, { localStorage: fake });
    vi.resetModules();
    const a = await import('../src/client/keys.ts');
    a.setKey('sheet', 'F2');
    a.setKey('rules', 'KeyQ'); // troca com a Bola de fogo
    a.setPadButton('sheet', BTN.LEFT);
    vi.resetModules();
    const b = await import('../src/client/keys.ts');
    expect([b.keyOf('sheet'), b.keyOf('rules'), b.keyOf('fireball'), b.padButtonOf('sheet')]).toEqual(['F2', 'KeyQ', 'F1', BTN.LEFT]);
    store.set('warlock:keys', JSON.stringify({ shop: 'Escape', taunt: 'KeyP' }));
    store.set('warlock:pad', JSON.stringify({ shop: PAD_START, center: BTN.RIGHT }));
    vi.resetModules();
    const c = await import('../src/client/keys.ts');
    expect([c.keyOf('shop'), c.keyOf('taunt'), c.padButtonOf('shop'), c.padButtonOf('center')]).toEqual(['Digit4', 'KeyP', BTN.DOWN, BTN.RIGHT]);
  });

  it('tecla salva de magia que saiu do jogo (os Gêmeos) é ignorada: o J fica com a Ilusão', async () => {
    Object.assign(globalThis, { localStorage: fake });
    store.set('warlock:keys', JSON.stringify({ twin: 'KeyZ', taunt: 'KeyP' }));
    vi.resetModules();
    const k = await import('../src/client/keys.ts');
    expect([k.actionFor('KeyJ'), k.keyOf('rockpillar'), k.keyOf('taunt'), k.whoUses('KeyZ')]).toEqual(['illusion', 'KeyZ', 'KeyP', 'rockpillar']);
  });
});

describe('botões do controle trocáveis', () => {
  it('padrão: A B X Y LB RB magias, LT RT ↑ itens, L3 ficha, View placar, ↓ loja, R3 câmera; Start de ninguém', () => {
    expect([BTN.A, BTN.RB, BTN.LT, BTN.UP, BTN.L3, BTN.VIEW, BTN.DOWN, BTN.R3, BTN.START, BTN.LEFT].map(padActionAt))
      .toEqual(['slot1', 'slot6', 'item1', 'item3', 'sheet', 'board', 'shop', 'center', undefined, undefined]);
  });

  it('trocar um botão troca com quem o usava; Start é recusado', () => {
    expect(setPadButton('sheet', BTN.A)).toBe(true);
    expect([padButtonOf('sheet'), padButtonOf('slot1')]).toEqual([BTN.A, BTN.L3]);
    expect(setPadButton('board', PAD_START)).toBe(false);
    expect(padButtonOf('board')).toBe(BTN.VIEW);
    expect(setPadButton('center', BTN.LEFT)).toBe(true); // botão livre: só muda
    expect([padActionAt(BTN.LEFT), padActionAt(BTN.R3)]).toEqual(['center', undefined]);
  });

  it('o controle lança e a barra mostra os rótulos pelo mapeamento novo', () => {
    setSlots(['fireball', 'homing']);
    setPadButton('slot1', BTN.RT); // o item 2 vai para o A
    expect([padAction(BTN.RT), padAction(BTN.A)]).toEqual(['fireball', 'redirector']);
    setPadMode(true);
    expect([labelOf('fireball'), labelOf('homing'), labelOf('redirector')]).toEqual(['RT', 'B', 'A']);
  });
});

describe('textos de ajuda com as teclas atuais', () => {
  it('o grimório (No PC, Com controle, Loja) lê a tecla e o botão trocados', () => {
    setKey('taunt', 'KeyP');
    setKey('shop', 'Digit7');
    setPadButton('sheet', BTN.LEFT);
    expect(RULES.pc.join(' ')).toContain('P: provocações');
    expect(RULES.loja.join(' ')).toContain('a tecla 7');
    expect(RULES.controle.join(' ')).toContain('←: ficha do mago');
  });
});

describe('Esc que sobra abre as configurações', () => {
  it('só chama quando ninguém consumiu o Esc (preventDefault) e só para o Esc', () => {
    const fns: ((e: { code: string; defaultPrevented: boolean }) => void)[] = [];
    Object.assign(globalThis, { addEventListener: (_t: string, f: (typeof fns)[number]) => fns.push(f) });
    let opened = 0;
    onFreeEsc(() => opened++);
    const fire = (code: string, prevented: boolean) => fns.forEach((f) => f({ code, defaultPrevented: prevented }));
    fire('Escape', true); // fechou um painel antes
    fire('KeyQ', false);
    expect(opened).toBe(0);
    fire('Escape', false);
    expect(opened).toBe(1);
  });
});
