import { describe, expect, it } from 'vitest';
import settings from '../src/client/settings.ts?raw';
const { readFileSync } = await import('node:fs' as string) as { readFileSync(path: URL, encoding: 'utf8'): string };
const css = readFileSync(new URL('../src/client/style.css', import.meta.url), 'utf8');

describe('quatro controles no menu de som', () => {
  it('mostra Geral, Efeitos, Música e Provocações nessa ordem e nas duas línguas', () => {
    const kinds = [...settings.matchAll(/slider\('(master|sfx|music|taunts)'/g)].map((m) => m[1]);
    expect(kinds).toEqual(['master', 'sfx', 'music', 'taunts']);
    for (const text of ['Volume geral', 'Master volume', 'Efeitos sonoros', 'Sound effects', 'Música', 'Music', 'Provocações', 'Taunts']) expect(settings.includes(text), text).toBe(true);
    expect(settings.includes('step: 1')).toBe(true);
  });
  it('coloca o controle em uma linha larga abaixo do rótulo e da porcentagem', () => {
    expect(css).toMatch(/\.vol-row input[^}]*grid-column: 1 \/ -1;[^}]*grid-row: 2/);
    expect(css).toMatch(/\.vol-row \.vol-value[^}]*grid-row: 1/);
  });
});
