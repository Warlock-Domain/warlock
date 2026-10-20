# src/client — navegador (Three.js + interface em DOM)

Vale junto com o `CLAUDE.md` da raiz.

## Interface

- **DOM sempre com `el(tag, props, ...filhos)`** de `icons.ts` (`on*` vira listener, `class` vira `className`, filho `null`/`false` some). Não crie outro helper de DOM. Ícones: `icon(id)` com `ICON`, `ITEM_ICON`, `UI_ICON`.
- Reuse `choice(...)` (fileira de botões com `aria-pressed`), `tabs(...)` (`role=tab`) e `withTip(elemento, () => html)` (dica no hover e no foco).
- **Preferência do jogador só por `store`** (`store.ts`): `store.get`/`set`/`json` já têm try/catch e caem para memória. Nunca `localStorage` direto. Chaves com prefixo `warlock:`.
- **Menus enxutos** (decisão do Fernando): antes de pôr opção nova numa tela, pergunte se ela precisa existir.
- Aba nova do menu inicial: tupla em `HOME_TABS` + chave em `HomeTab` + painel em `panels` com `panel(...)`. Conteúdo pesado carrega sob demanda (`void import('./grimoire.ts')`).

## Idioma

- Todo texto visível com `t('português', 'English')` (`i18n.ts`). Nomes por `spellName`, `itemName`, `arenaName`; textos de item por `itemText`; números com `LOCALE` (helpers `n1`/`pct`).
- O idioma é lido uma vez ao carregar (`setLang` grava e recarrega), então listas de texto podem ficar em constantes de módulo.
- Textos longos de regras ficam em pares `_PT`/`_EN` em `rules-text.ts`. Erros do servidor chegam em português e são traduzidos por `SERVER_EN` (`main.ts`).

## CSS (`style.css`, arquivo único)

- Cores e medidas pelas variáveis de `:root` (`--lava`, `--gold`, `--bronze`, `--panel`, `--fg`, `--r-md`…). Nada de hex solto, exceto a cor de grupo.
- Cor de grupo: `.g-ataque`, `.g-mobilidade`, `.g-defesa`, `.g-controle` (variável `--g`); itens prateados (`--item`). A classe vem de `spellClass(s)` pela posição em `SPELL_GROUPS`: magia nova ganha cor entrando num grupo, sem classe nova.
- Celular a cada mudança: `(max-width: 600px)`, `(max-height: 500px)` (deitado), `(pointer: coarse)` com alvos de 44 px, `(max-width: 860px)` / `(min-width: 861px)`. Hover só dentro de `(hover: hover)`. Animação nova com `(prefers-reduced-motion: reduce)`. Em JS, `TOUCH` (`ui.ts`).

## Teclas (`keys.ts`)

`DEFAULTS` usa `event.code` (`'KeyQ'`, `'Digit1'`, `'F1'`), nunca `event.key`. Ação de interface nova entra em `UI_ACTIONS` e `UI_NAMES` (`''` = sem tecla). Esc, Enter, Espaço e ← → são reservadas. As 26 letras já têm dono.

Modo Q W E R D F (padrão): magias e itens ativos usam a tecla da **posição** na barra (`POS_ACTIONS`: Magia 1 a 6 e Item 1 a 3, guardadas em `warlock:poskeys`); `keyOf`/`actionFor`/`whoUses` já resolvem o modo. Posições e atalhos da interface nunca repetem tecla (`setKey` troca). Trocar qualquer tecla fixa o modo em uso no navegador.

## O que não vai para `ui.ts`

`ui.ts` usa `document`/`matchMedia` ao carregar e não roda no Vitest. Decisão de tela que precisa de teste vai para função pura em `screen-data.ts` (ou `rules-text.ts`, `tips.ts`, `icons.ts`, `keys.ts`, `sheet.ts`, `reach.ts`, que não mexem no DOM ao carregar).
