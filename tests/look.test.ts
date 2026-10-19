import { describe, expect, it } from 'vitest';
import { CHARACTERS, LOOK_PARTS, decodeLook, encodeLook, isLook, lookHead, lookOf, lookPieces, randomLook } from '../src/shared/characters.ts';

// o projeto não tem @types/node: só o tipo do que o teste usa
const { readFileSync } = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };

// nomes dos nós com malha de um GLB (lê só o bloco JSON do arquivo)
function meshNodes(id: string): string[] {
  const b = readFileSync(`public/models/${id}.glb`);
  const len = new DataView(b.buffer, b.byteOffset).getUint32(12, true);
  const j = JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + len))) as { nodes: { name: string; mesh?: number }[] };
  return j.nodes.filter((n) => n.mesh !== undefined).map((n) => n.name);
}

describe('aparência montada', () => {
  it('cada peça existe no GLB de onde vem', () => {
    for (const part of LOOK_PARTS) for (const o of part.opts) if (o) for (const n of o.nodes) expect(meshNodes(o.from)).toContain(n);
  });

  it('os 9 prontos viram a aparência com exatamente as malhas do boneco original', () => {
    for (const c of CHARACTERS) {
      const look = lookOf(c.id);
      expect(isLook(look)).toBe(true);
      expect(lookHead(look)).toBe(c.id);
      expect(lookPieces(look).flatMap((p) => p.nodes).sort()).toEqual(meshNodes(c.id).sort());
    }
    expect(new Set(CHARACTERS.map((c) => lookOf(c.id))).size).toBe(CHARACTERS.length);
    expect(lookOf('mage')).toBe('0100011');
  });

  it('codifica em 7 dígitos e o sorteio sai sempre válido', () => {
    expect(decodeLook(encodeLook([5, 0, 1, 2, 3, 0, 4]))).toEqual([5, 0, 1, 2, 3, 0, 4]);
    let x = 0;
    for (let i = 0; i < 50; i++) expect(isLook(randomLook(() => (x = (x * 7 + 0.37) % 1)))).toBe(true);
    expect(isLook(randomLook(() => 0.9999))).toBe(true);
  });
});
