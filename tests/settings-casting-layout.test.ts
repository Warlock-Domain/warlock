import { describe, expect, it } from 'vitest';
import source from '../src/client/settings.ts?raw';

const casting = source.slice(source.indexOf('function castSection()'), source.indexOf('let beforeMute'));

describe('Casting settings layout', () => {
  it('keeps the HUD editor and two expandable individual preference lists', () => {
    expect(casting).toContain('ctx.castingHud.mount(host)');
    expect(casting).toContain("el('details', { class: 'spell-keys' }, el('summary', {}, t('Uso por magia individual'");
    expect(casting).toContain("el('details', { class: 'spell-keys' }, el('summary', {}, t('Uso por item individual'");
    expect(casting).toContain("castOverride('spell:'");
    expect(casting).toContain("castOverride('item:'");
  });
  it('removes duplicate global/shortcut controls without resetting stored preferences or removing key bindings', () => {
    expect(casting).toContain("ACTIONS.filter((spell) => spell !== 'scourge')");
    expect(casting).not.toContain('Lançar pela tecla');
    expect(casting).not.toContain('Casting with the key');
    expect(casting).not.toContain('Uso por atalho do teclado');
    expect(casting).not.toContain('setCastMode(');
    expect(casting).not.toContain('setCastPreference(');
    expect(casting).toContain('POS_ACTIONS.map');
    for (const mode of ['click', 'quick', 'release']) expect(source).toContain(mode);
  });
});
