import { describe, expect, it } from 'vitest';
import { CHARACTERS, LOOK_PARTS, PALETTE, PRESETS, TINTS, decodeLook, encodeLook, fixLook, isLook, isRetired, lookHead, lookOf, lookPieces, lookTint, randomLook, withTint } from '../src/shared/characters.ts';

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

  it('os 8 prontos viram a aparência com exatamente as malhas do boneco original', () => {
    expect(PRESETS.map((c) => c.id)).not.toContain('rogue_hooded');
    for (const c of PRESETS) {
      const look = lookOf(c.id);
      expect(isLook(look)).toBe(true);
      expect(lookHead(look)).toBe(c.id);
      // o capuz (Rogue_Hood) mora no rogue.glb, mas é chapéu: a Ladina pronta vem sem ele
      expect(lookPieces(look).flatMap((p) => p.nodes).sort()).toEqual(meshNodes(c.id).filter((n) => n !== 'Rogue_Hood').sort());
    }
    expect(new Set(CHARACTERS.map((c) => lookOf(c.id))).size).toBe(CHARACTERS.length);
    expect(lookOf('mage')).toBe('0100011');
  });

  it('a Ladina encapuzada vira Ladina + Capuz e nenhum outro código salvo muda (#107)', () => {
    const hood = LOOK_PARTS[1].opts.findIndex((o) => o?.name === 'Capuz');
    expect(lookOf('rogue')).toBe('3033344');
    expect(lookOf('rogue_hooded')).toBe('3' + hood + '33344');
    expect(lookPieces(lookOf('rogue_hooded')).flatMap((p) => p.nodes)).toContain('Rogue_Hood');
    expect(lookHead(lookOf('rogue_hooded'))).toBe('rogue_hooded'); // retrato do placar continua o da encapuzada
    expect(lookHead('1' + hood + '11122')).toBe('knight');
    expect(fixLook('4044444')).toBe(lookOf('rogue_hooded')); // código antigo da encapuzada pronta
    expect(fixLook('4144444')).toBe('3133344'); // já tinha chapéu (o do mago): fica com ele
    expect(fixLook('0040000')).toBe('0030000'); // só o tronco dela
    // posições não mudaram: esqueletos e o resto continuam iguais
    for (const look of ['8500000', '5464736', '0100011', '7020804']) expect(fixLook(look)).toBe(look);
  });

  it('o sorteio nunca cai numa peça aposentada', () => {
    let x = 0;
    for (let i = 0; i < 200; i++) {
      const l = decodeLook(randomLook(() => (x = (x * 7 + 0.37) % 1)))!;
      expect(l.slice(0, LOOK_PARTS.length).some((n, k) => isRetired(LOOK_PARTS[k].opts[n]))).toBe(false);
    }
    expect(randomLook(() => 4.5 / 9)).toBe(fixLook('4444442') + '555555'); // cabeça, tronco, braços e pernas sorteados na encapuzada; cores no meio da paleta
  });

  it('cores: 6 dígitos depois das peças, e sem cor o código continua com 7 (#109)', () => {
    expect(TINTS).toHaveLength(6);
    expect(PALETTE).toHaveLength(10); // um dígito por cor
    expect(decodeLook('0100011')).toEqual([0, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0]);
    expect(encodeLook(decodeLook('0100011')!)).toBe('0100011');
    const azul = PALETTE.findIndex((c) => c.name === 'Azul');
    const tronco = withTint('0100011', TINTS.indexOf(2), azul); // tronco azul
    expect(tronco).toBe('0100011' + '0' + azul + '0000');
    expect(lookTint(tronco, 2)).toBe(PALETTE[azul].hex);
    expect(lookTint(tronco, 3)).toBeNull(); // braços na original
    expect(lookTint(tronco, 6)).toBeNull(); // Nas mãos não tem cor
    expect(lookTint(withTint(tronco, TINTS.indexOf(0), 9), 0)).toBe(PALETTE[9].hex); // cabelo preto
    expect(withTint(tronco, TINTS.indexOf(2), 0)).toBe('0100011'); // voltou à original: 7 dígitos de novo
    expect(lookPieces(tronco)).toEqual(lookPieces('0100011'));
    expect(fixLook('4044444123456')).toBe(lookOf('rogue_hooded') + '123456'); // a encapuzada antiga com cores guarda as cores
    for (const bad of ['01000110', '010001100000', '01000110000000', '0100011a00000']) expect(isLook(bad)).toBe(false);
  });

  it('codifica em 7 dígitos e o sorteio sai sempre válido', () => {
    expect(decodeLook(encodeLook([5, 0, 1, 2, 3, 0, 4]))).toEqual([5, 0, 1, 2, 3, 0, 4, 0, 0, 0, 0, 0, 0]);
    let x = 0;
    for (let i = 0; i < 50; i++) expect(isLook(randomLook(() => (x = (x * 7 + 0.37) % 1)))).toBe(true);
    expect(isLook(randomLook(() => 0.9999))).toBe(true);
  });
});
