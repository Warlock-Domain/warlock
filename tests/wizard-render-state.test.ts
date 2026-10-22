import { describe, expect, it } from 'vitest';
import { renderWizardState } from '../src/client/screen-data.ts';
import type { WizView } from '../src/shared/snapshot.ts';
import { v } from '../src/shared/vec.ts';

const old: WizView = { id: 'me', pos: v(0, 0), vel: v(2, 0), hp: 1000, facing: 0, alive: true, shield: false, status: 1 | 16 };
describe('pose na retomada após empurrão', () => {
  it('alinha estado de arremessado e direção ao mesmo instante da posição própria', () => {
    const latest = { ...old, pos: v(1, 1), vel: v(1, 0), facing: Math.PI / 2, status: 1 };
    const rendered = renderWizardState(old, latest);
    expect(rendered.status & 16).toBe(0);
    expect(rendered.facing).toBe(Math.PI / 2);
    expect(rendered.vel).toEqual(latest.vel);
  });
  it('preserva a interpolação dos outros jogadores e do replay', () => {
    expect(renderWizardState(old, { ...old, id: 'other' })).toBe(old);
    expect(renderWizardState(old, null)).toBe(old);
  });
  it('mantém os bits recentes da invisibilidade e o retorno à vida', () => {
    const latest = { ...old, alive: true, status: 1 | 1024 };
    expect(renderWizardState({ ...old, alive: false }, latest)).toBe(latest);
  });
});
