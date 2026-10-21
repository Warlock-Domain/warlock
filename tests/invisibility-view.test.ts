import { describe, expect, it } from 'vitest';
import { sandboxVisibility } from '../src/client/screen-data.ts';
import { encodeSnap, decodeSnap } from '../src/shared/snapshot.ts';
import { stepWorld } from '../src/shared/sim.ts';
import { noSpells } from '../src/shared/spells.ts';
import { world } from './helpers.ts';
import { v } from '../src/shared/vec.ts';

describe('invisibilidade da Ilusão vista por outro jogador', () => {
  it('esconde o marcador de véu do Sandbox quando Ver invisíveis está desligado', () => {
    const status = sandboxVisibility(1 | 8388608, false, true, false);
    expect(status & 2048).toBe(2048);
    expect(status & (1024 | 8388608)).toBe(0);
  });
  it('começa sem visão de teste e mantém o dono translúcido', () => {
    expect(sandboxVisibility(1 | 8388608, false, true) & 2048).toBe(2048);
    expect(sandboxVisibility(1 | 1024, true, true)).toBe(1 | 1024);
    expect(sandboxVisibility(1 | 8388608, false, true, true) & 8388608).toBe(8388608);
    expect(sandboxVisibility(1, false, true)).toBe(1);
  });
  it.each([false, true])('snapshot e cliente ocultam o dono para outro humano (Sandbox=%s)', (sandbox) => {
    const w = world([[0, 0], [4, 0]], { ...noSpells(), illusion: 1 });
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'illusion', at: v(0, 5) }]);
    const mine = decodeSnap(encodeSnap(w, 'p0', 0, [], sandbox), ['p0', 'p1']);
    const other = decodeSnap(encodeSnap(w, 'p1', 0, [], sandbox), ['p0', 'p1']);
    expect(sandboxVisibility(mine.wizards[0].status, true, sandbox) & 1024).toBe(1024);
    expect(sandboxVisibility(other.wizards[0].status, false, sandbox) & 2048).toBe(2048);
    expect(other.projectiles.some((p) => p.kind === 'illusion')).toBe(true);
  });
});
