import { afterEach, describe, expect, it, vi } from 'vitest';
import { DM_RESPAWN, DM_ROUND_MS, SUDDEN } from '../src/shared/constants.ts';
import { DM_GOALS } from '../src/shared/match.ts';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
describe('Guides in both languages', () => {
  it.each(['pt', 'en'])('description, sheet and preview use actual values in%s', async (lang) => {
    vi.resetModules();
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'warlock:lang' ? lang : null });
    const { MECHANIC_GUIDES, NEGATIVE_GUIDES, RULES_SHORT } = await import('../src/client/rules-text.ts');
    const { spellTip } = await import('../src/client/tips.ts');
    expect(RULES_SHORT.geyser).toContain(lang === 'pt' ? 'Invoca no chão' : 'ground geyser');
    expect(RULES_SHORT.geyser).toContain(lang === 'pt' ? 'invulneráveis' : 'invulnerable');
    expect(spellTip('geyser',1)).toContain('data-demo="geyser"');
    expect(spellTip('geyser',1)).toContain(lang === 'pt' ? '2,5' : '2.5');
    expect(spellTip('geyser',1)).toContain('20');
    expect(RULES_SHORT.heal).toContain('45');
    expect(RULES_SHORT.heal).toContain(lang === 'pt' ? 'você ou um aliado' : 'yourself or an ally');
    expect(spellTip('heal', 1)).toContain(lang === 'pt' ? 'Cura' : 'Healing');
    for (const value of ['45', '51', '20', '19', '10']) expect(spellTip('heal', 1)).toContain(value);
    expect(spellTip('heal', 1)).toContain('data-demo="heal"');
    expect(MECHANIC_GUIDES.map((g) => g.title)).toEqual(lang === 'pt' ? ['Atacar', 'Manter base'] : ['Attack', 'Hold ground']);
    expect(NEGATIVE_GUIDES).toHaveLength(10);
    expect(new Set(NEGATIVE_GUIDES.map((g) => g.id)).size).toBe(10);
    for (const g of NEGATIVE_GUIDES) {
      expect(g.text.length).toBeGreaterThan(80);
      expect(g).not.toHaveProperty('demo');
    }
    const knock = NEGATIVE_GUIDES.find((g) => g.id === 'status-knockback')!;
    expect(knock.title).toBe(lang === 'pt' ? 'Empurrão' : 'Knockback');
    expect(knock.text).toContain('50%');
    expect(knock.text).toContain('100%');
    expect(knock.text).toContain(lang === 'pt' ? '0,2 s' : '0.2 s');
    expect(RULES_SHORT.meteor).toContain(lang === 'pt' ? '1,25' : '1.25');
    expect(spellTip('meteor', 1)).toContain(lang === 'pt' ? '1,15' : '1.15');
    expect(spellTip('meteor', 1)).toContain(lang === 'pt' ? '1,25' : '1.25');
    expect(spellTip('shield', 1)).toContain('60%');
  });
  it.each(['pt', 'en'])('Deathmatch and Teams pages state the rules in the code in %s', async (lang) => {
    vi.resetModules();
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'warlock:lang' ? lang : null });
    const { RULES } = await import('../src/client/rules-text.ts');
    const dm = RULES.deathmatch.join(' ');
    for (const value of [`${DM_ROUND_MS / 1000} s`, `${DM_RESPAWN} s`, ...Object.values(DM_GOALS).map(String)]) expect(dm).toContain(value);
    expect(dm).toContain(lang === 'pt' ? 'no fim da rodada' : 'at the end of the round');
    expect(dm).not.toContain(lang === 'pt' ? 'Não há rodadas' : 'There are no rounds');
    const teams = RULES.times.join(' ');
    expect(teams).toContain(lang === 'pt' ? '2, 3 ou 4' : '2, 3 or 4');
    expect(teams).toContain(lang === 'pt' ? 'fixas' : 'fixed');
    expect(teams).toContain(lang === 'pt' ? 'cada jogador' : 'each player');
    expect(teams).toContain(lang === 'pt' ? 'só empurra' : 'only knock back');
    expect(RULES.sobrevivencia.join(' ')).toContain(`${SUDDEN.every} s`);
  });
});
