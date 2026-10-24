import { describe, expect, it } from 'vitest';
import { NEGATIVE_GUIDES } from '../src/client/rules-text.ts';

describe('escopo dos capítulos do Grimório', () => {
  it('status são descrições independentes, sem magia ou roteiro anexado', () => {
    for (const g of NEGATIVE_GUIDES) {
      expect(g).not.toHaveProperty('demo');
      expect(g.text).not.toMatch(/Meteoro|Meteor|Drenar|Drain|Bola de neve|Snowball|Eletrocutar|Electrocute|Magnetizar|Magnetize|Investida|Rush|Gravidade|Gravity|demonstração|demonstration/);
    }
  });
});
