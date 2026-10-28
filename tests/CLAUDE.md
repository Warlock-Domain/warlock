# tests — Vitest

Applies together with the root `CLAUDE.md`.

- **One file per subject** (`deathmatch.test.ts`, `new-spells.test.ts`). Whenever a test file is edited, translate all suite/test names (`describe`, `it`, `test`) and explanatory comments in that file to English, including legacy names and comments outside the edited tests.
- **Helpers in `tests/helpers.ts`:** `until` (advances the match by steps), `toPlaying` (everyone ready until `playing`), `kill` (death by lava with credit), `world(posições, magias, itens?, rand?)` (ready world, no initial invulnerability), `run(w, segundos, cmds?)`. Single-file shortcuts stay in their own file (`twoPlayers` in `match.test.ts`).
- `tests/setup.ts` defaults to Portuguese. Keep localized fixtures and expected UI strings in the language required by each test; English test names do not change those assertions.
- **Determinism:** `style.test.ts` runs a bot match with seed 7 for 4000 steps and compares the events hash. Hash changed = gameplay changed; re-record only if it was on purpose and explain it in the PR.
- **`balance-summary.test.ts`:** covers validation of JSON summaries and the merging of simulator measurements; the pure logic stays in `scripts/balance-summary.ts`.
- **Seed:** pass an explicit `rand` (`seeded(s)`, `() => 0.5`) or use `seedRandom`. Position with `toBeCloseTo`, count and phase with `toBe`; in a loop, message in the second argument of `expect` (`expect(x, id)`).
- Globals (`localStorage`, `navigator`) with `vi.stubGlobal` and `afterEach(() => vi.unstubAllGlobals())`.
- **Do not import `ui.ts`** (it does not load in Node). Test the extracted pure function (`screen-data.ts` etc.). Visuals stay with the headless scripts.
- Completeness tests flag forgotten content: `ui-data` (group, tip, icon), `grimoire-demo` (demonstration), `i18n` (empty `en`). New spell: run these and `new-spells` first.
- Logic bug: the new test must fail without the fix.
