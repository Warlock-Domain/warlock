# tests — Vitest

Vale junto com o `CLAUDE.md` da raiz.

- **Um arquivo por assunto** (`deathmatch.test.ts`, `new-spells.test.ts`). `describe` em português; nos `it`, siga o idioma dos vizinhos do arquivo.
- **Helpers em `tests/helpers.ts`:** `until` (avança a partida por passos), `toPlaying` (todos prontos até `playing`), `kill` (morte por lava com crédito), `world(posições, magias, itens?, rand?)` (mundo pronto, sem invulnerabilidade inicial), `run(w, segundos, cmds?)`. Atalhos de um arquivo só ficam no próprio arquivo (`twoPlayers` em `match.test.ts`).
- `tests/setup.ts` fixa o idioma em português: os testes conferem texto em português.
- **Determinismo:** `style.test.ts` roda uma partida de bots com semente 7 por 4000 passos e compara o hash dos eventos. Hash mudou = jogabilidade mudou; regrave só se foi de propósito e explique no PR.
- **Semente:** passe `rand` explícito (`seeded(s)`, `() => 0.5`) ou use `seedRandom`. Posição com `toBeCloseTo`, contagem e fase com `toBe`; em laço, mensagem no segundo argumento do `expect` (`expect(x, id)`).
- Globais (`localStorage`, `navigator`) com `vi.stubGlobal` e `afterEach(() => vi.unstubAllGlobals())`.
- **Não importe `ui.ts`** (não carrega no Node). Teste a função pura extraída (`screen-data.ts` etc.). Visual fica com os scripts headless.
- Testes de completude acusam conteúdo esquecido: `ui-data` (grupo, dica, ícone), `grimoire-demo` (demonstração), `i18n` (`en` vazio). Magia nova: rode esses e o `new-spells` primeiro.
- Bug de lógica: o teste novo tem que falhar sem a correção.
