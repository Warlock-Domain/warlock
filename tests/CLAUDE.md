# tests — Vitest

Vale junto com o `CLAUDE.md` da raiz.

- **One file per subject** (`deathmatch.test.ts`, `new-spells.test.ts`). Whenever a test file is edited, translate all suite/test names (`describe`, `it`, `test`) and explanatory comments in that file to English, including legacy names and comments outside the edited tests.
- **Helpers em `tests/helpers.ts`:** `until` (avança a partida por passos), `toPlaying` (todos prontos até `playing`), `kill` (morte por lava com crédito), `world(posições, magias, itens?, rand?)` (mundo pronto, sem invulnerabilidade inicial), `run(w, segundos, cmds?)`. Atalhos de um arquivo só ficam no próprio arquivo (`twoPlayers` em `match.test.ts`).
- `tests/setup.ts` defaults to Portuguese. Keep localized fixtures and expected UI strings in the language required by each test; English test names do not change those assertions.
- **Determinismo:** `style.test.ts` roda uma partida de bots com semente 7 por 4000 passos e compara o hash dos eventos. Hash mudou = jogabilidade mudou; regrave só se foi de propósito e explique no PR.
- **`balance-summary.test.ts`:** cobre a validação de resumos JSON e a junção das medições pelo simulador; a lógica pura fica em `scripts/balance-summary.ts`.
- **Semente:** passe `rand` explícito (`seeded(s)`, `() => 0.5`) ou use `seedRandom`. Posição com `toBeCloseTo`, contagem e fase com `toBe`; em laço, mensagem no segundo argumento do `expect` (`expect(x, id)`).
- Globais (`localStorage`, `navigator`) com `vi.stubGlobal` e `afterEach(() => vi.unstubAllGlobals())`.
- **Não importe `ui.ts`** (não carrega no Node). Teste a função pura extraída (`screen-data.ts` etc.). Visual fica com os scripts headless.
- Testes de completude acusam conteúdo esquecido: `ui-data` (grupo, dica, ícone), `grimoire-demo` (demonstração), `i18n` (`en` vazio). Magia nova: rode esses e o `new-spells` primeiro.
- Bug de lógica: o teste novo tem que falhar sem a correção.
