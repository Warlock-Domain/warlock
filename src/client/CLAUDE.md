# src/client — navegador (Three.js + interface em DOM)

Vale junto com o `CLAUDE.md` da raiz.

## Interface

- **DOM sempre com `el(tag, props, ...filhos)`** de `icons.ts` (`on*` vira listener, `class` vira `className`, filho `null`/`false` some). Não crie outro helper de DOM. Ícones: `icon(id)` com `ICON`, `ITEM_ICON`, `UI_ICON`.
- Reuse `choice(...)` (fileira de botões com `aria-pressed`), `tabs(...)` (`role=tab`) e `withTip(elemento, () => html)` (dica no hover e no foco).
- **Preferência do jogador só por `store`** (`store.ts`): `store.get`/`set`/`json` já têm try/catch e caem para memória. Nunca `localStorage` direto. Chaves com prefixo `warlock:`.
- **Menus enxutos** (decisão do Fernando): antes de pôr opção nova numa tela, pergunte se ela precisa existir.
- **Logo do jogo em imagem:** `public/warlock-wars.svg` (o W com moldura dourada da foto do grupo, vetorial, sem depender da fonte) → `el('img', { src: '/warlock-wars.svg', alt: 'Warlock Wars' })` ou `<img src="/warlock-wars.svg">`. Também é o ícone da aba. Gerado por `scripts/assets/favicon.py` (com `favicon.ico` e `apple-touch-icon.png`); não edite à mão.
- Aba nova do menu inicial: tupla em `HOME_TABS` + chave em `HomeTab` + painel em `panels` com `panel(...)`. Conteúdo pesado carrega sob demanda (`void import('./grimoire.ts')`).

## Idioma

- Todo texto visível com `t('português', 'English')` (`i18n.ts`). Nomes por `spellName`, `itemName`, `arenaName`; textos de item por `itemText`; números com `LOCALE` (helpers `n1`/`pct`).
- O idioma é lido uma vez ao carregar (`setLang` grava e recarrega), então listas de texto podem ficar em constantes de módulo.
- Textos longos de regras ficam em pares `_PT`/`_EN` em `rules-text.ts`. Erros do servidor chegam em português e são traduzidos por `SERVER_EN` (`main.ts`).

## CSS (`style.css`, arquivo único)

- Cores e medidas pelas variáveis de `:root` (`--lava`, `--gold`, `--bronze`, `--panel`, `--fg`, `--r-md`…). Nada de hex solto, exceto a cor de grupo.
- Cor de grupo: `.g-ataque`, `.g-mobilidade`, `.g-defesa`, `.g-controle` (variável `--g`); itens prateados (`--item`). A classe vem de `spellClass(s)` pela posição em `SPELL_GROUPS`: magia nova ganha cor entrando num grupo, sem classe nova.
- Celular (fora de foco desde 20/10: não conferir a cada mudança, só não apagar estas regras): `(max-width: 600px)`, `(max-height: 500px)` (deitado), `(pointer: coarse)` com alvos de 44 px, `(max-width: 860px)` / `(min-width: 861px)`. Hover só dentro de `(hover: hover)`. Animação nova com `(prefers-reduced-motion: reduce)`. Em JS, `TOUCH` (`ui.ts`).

## Teclas (`keys.ts`)

`DEFAULTS` usa `event.code` (`'KeyQ'`, `'Digit1'`, `'F1'`), nunca `event.key`. Ação de interface nova entra em `UI_ACTIONS` e `UI_NAMES` (`''` = sem tecla). Esc, Enter, Espaço e ← → são reservadas. As 26 letras já têm dono.

Modo Q W E R D F (padrão): magias e itens ativos usam a tecla da **posição** na barra (`POS_ACTIONS`: Magia 1 a 6 e Item 1 a 3, guardadas em `warlock:poskeys`); `keyOf`/`actionFor`/`whoUses` já resolvem o modo. A ordem das posições vem de `loadoutSlots`/`moveLoadout` (`screen-data.ts`, guardada em `warlock:loadout-order`) e chega às teclas e ao controle por `setSlots`; vaga vazia é `null`. Posições e atalhos da interface nunca repetem tecla (`setKey` troca). Trocar qualquer tecla fixa o modo em uso no navegador.

## Configurações (`settings.ts`)

Uma página só, de seções empilhadas com sumário (`stackedPage`), usada na aba Configurações do menu inicial (`settingsPage`) e no diálogo da partida (`openSettings`). Seção nova = item em `SECTIONS`; o `render` devolve `null` quando a tela não oferece aquilo (som e vídeo só existem na sala, via `setSettingsCtx`). No menu inicial, Esc e Start abrem a aba em vez do diálogo: duas cópias da página repetiriam os ids dos campos. `draw()` refaz a página inteira a cada mudança e devolve o foco pelo id, então campo novo leva `id` fixo. A prévia do Personagem é uma só (`avatarPanel`, um contexto WebGL): no menu inicial a seção vira atalho para a aba Personagem.

## Cena (`scene.ts`)

- **Pixel art** (`setPixel`, issue #79): troca o `RenderPass` pelo `RenderPixelatedPass` (blocos de `pixelSize` px: 2 ou 3, 0 desliga). Nesse modo a câmera fica mais longe com ângulo menor (`camK`) e é presa à grade; a sobra desliza o canvas e os nomes (`pixelShift`). Quem mexer no posicionamento da câmera mantém os dois, senão o chão volta a tremer. Só existe no PC (precisa do `EffectComposer`, que o celular não cria); a escolha fica em `warlock:pixel` (`savedPixel`).

## O que não vai para `ui.ts`

`ui.ts` usa `document`/`matchMedia` ao carregar e não roda no Vitest. Decisão de tela que precisa de teste vai para função pura em `screen-data.ts` (ou `rules-text.ts`, `tips.ts`, `icons.ts`, `keys.ts`, `sheet.ts`, `reach.ts`, que não mexem no DOM ao carregar).
