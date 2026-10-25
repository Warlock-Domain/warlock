# src/client — navegador (Three.js + interface em DOM)

Vale junto com o `CLAUDE.md` da raiz.

## Interface

- Closed Body keeps its local effect aligned with the current stance, without a cursor aim line. PT/EN descriptions and the off-axis demo explain the preserved facing.

- Cegueira: vinheta ancorada no chão pelo raio3m do jogador afetado, não pela câmera; oculta entidades e rótulos além do limite. Capítulo de status somente texto no Grimório; Rajada de areia tem ficha e demo próprias PT/EN em Controle.
- Corpo fechado escurece materiais clonados e restaura ao terminar; sons próprios no começo/fim confirmados. Gravações fornecidas pelo Leonard, declaradas CC0, respeitam mixer/distância.

- Gêiser em Suporte: mira no chão como Agarrar; jato azul eleva o alvo e bloqueia previsão/comandos durante a suspensão. Ficha e demonstração PT/EN seguem os stats compartilhados.
- Curar: a tecla ou a barra seleciona e o clique no modelo confirma, em qualquer modo de lançamento (Rápido ou Ao soltar). Clique no chão não cura; alvo inválido mantém a seleção, e Esc, S ou o botão direito cancelam. No controle, com o analógico direito solto, cura você mesmo (`padTarget`). A aura verde de 1,5 s e o coral sintetizado tocam no evento confirmado, com o mixer e a distância. Textos PT/EN, ficha, demo e ícone próprio seguem os números.

- **DOM sempre com `el(tag, props, ...filhos)`** de `icons.ts` (`on*` vira listener, `class` vira `className`, filho `null`/`false` some). Não crie outro helper de DOM. Ícones: `icon(id)` com `ICON`, `ITEM_ICON`, `UI_ICON`.
- **Grupos de magia** (`SPELL_GROUPS` em `rules-text.ts`, cor em `.g-<grupo>` no `style.css`): Suporte (verde) aparece mesmo vazio e Mobilidade é dourada (decisão de 24/10, PR #343); `searchFilter(..., keepEmpty)` mantém o grupo vazio visível sem busca, para o jogador ver que a categoria existe antes das magias dela.
- Reuse `choice(...)` (fileira de botões com `aria-pressed`), `tabs(...)` (`role=tab`) e `withTip(elemento, () => html)` (dica no hover e no foco).
- **Botão só de ícone (✕, ⋯, ‹ ›, engrenagem) só com `iconButton(filho, nome, onclick, props?)`** (`icons.ts`): o nome vira `title` e `aria-label`; `props` sobrescreve (`class: 'icon wide-only'`, `title` com a tecla, `aria-expanded`, `hidden`). Visual diferente do ✕ só pela classe: `kick` (pequeno e vermelho) e `info-close` (canto do ⓘ).
- **Diálogo por cima da tela só com `dialog(cls, título, corpo, { ico, onKey, onClose })`** (`ui.ts`, issue #110): fundo `<cls>-overlay` (camada e celular no CSS), cabeçalho `.dialog-head` com título e ✕; ✕, clique fora, Esc e o B do controle fecham. Segura todas as teclas na captura (nada chega ao jogo); `onKey` vê cada tecla antes e, com `preventDefault`, o Esc não fecha. Devolve `{ overlay, close }`; foco inicial no ✕ (quem chama pode mudar). Padronização da interface com funções no DOM puro, uma por PR (decisão de 20/10, issue #91).
- **Busca pelo nome só com `searchFilter(grupos, seletor do item, texto, off?)`** (`ui.ts`): esconde os itens cujo `data-name` (gravado com `norm`) não tem o texto e os grupos vazios; `off` esconde grupos inteiros (filtro). Usada na Biblioteca (a loja ficou sem busca, pedido do Fernando de 21/10).
- **Arrastar para trocar de vaga só com `draggableSlot(nó, índice, ocupada)`** (`ui.ts`): até 6 px conta como clique; passou disso, um `.drag-ghost` com o ícone da vaga segue o mouse e a vaga embaixo dele ganha `.drop-target`; ao soltar, `moveLoadout` troca as posições. Usada na barra de baixo, a única que troca a ordem das magias: no PC ela fica à vista também na loja (`SHOP_BAR`, o mesmo corte do `.compact-shop`), e a loja termina acima dela (`--bar-space`); outra lista que se reordena por arraste reusa as duas classes em vez de criar outro visual (PR #197).
- **Builds salvas na loja** (`buildsBox` em `shopPanel`, issue #185): caixa recolhível que reusa `details.sheet-box` e `.keys-row`; o selo ★ dos mais comprados é a bolinha `.key` com a variante `.fav`. A lógica (fila do Usar, salvo estragado, contagem) fica em `screen-data.ts`, com teste.
- **Mensagens recebidas só após decodificar**: `net.ts` recebe `unknown`, trata JSON inválido e chama o decodificador do canal (`net-message.ts`) antes de despachar. Mensagem de sala usa `parseServerMessage`; lobby usa `parseLobbyMessage`. Preserve os vetores compactos de `snap` sem cópia e valide seus comprimentos numa passada.
- O estado da sala segue o contrato estrito de `PublicRoom`: rejeite mensagens malformadas em vez de entregar estado parcialmente validado e registre um aviso por tipo de mensagem e conexão. Teste exemplos de `publicRoom` em todos os modos quando alterar essa fronteira; não reconecte automaticamente em erro de esquema, pois a mesma versão do servidor repetiria a rejeição.
- **Preferência do jogador só por `store`** (`store.ts`): `store.get`/`set`/`json` já têm try/catch e caem para memória. `json()` devolve `unknown`: decodifique uma vez ao carregar cada formato (`train.ts`, `mimic.ts`, `screen-data.ts`, `challenges.ts`, `keys.ts`); peças comuns de validação ficam em `saved-data.ts`. Nunca `localStorage` direto. Chaves com prefixo `warlock:`.
- **Menus enxutos** (decisão do Fernando): antes de pôr opção nova numa tela, pergunte se ela precisa existir.
- **Logo do jogo em imagem:** `public/warlock-wars.svg` (o W com moldura dourada da foto do grupo, vetorial, sem depender da fonte) → `el('img', { src: '/warlock-wars.svg', alt: 'Warlock Wars' })` ou `<img src="/warlock-wars.svg">`. Também é o ícone da aba. Gerado por `scripts/assets/favicon.py` (com `favicon.ico` e `apple-touch-icon.png`); não edite à mão.
- Aba nova do menu inicial: tupla em `HOME_TABS` + chave em `HomeTab` + painel em `panels` com `panel(...)`. Conteúdo pesado carrega sob demanda (`void import('./grimoire.ts')`).
- **Roda de provocações** (`radialPicker`, `radial-picker.ts`, PRs #239/#238/#240): botões em volta de um centro que cancela, feitos com `el`/`iconButton`; mouse, setas, números e analógico escolhem pelo mesmo índice (`radialIndex`). A matemática e a tecla segurada (`radialHold`) ficam em `taunt-wheel.ts`, sem DOM, com teste. Tem oito posições (`TAUNT_WHEEL_SIZE`, PR #261), iguais nas Configurações e na partida; todas as falas de `TAUNTS` (23 hoje, 8 só de texto com emoji, sem áudio) ficam no catálogo para preencher essas posições, e fala nova entra no catálogo, não na roda. A preferência (`warlock:taunt-wheel`, `tauntWheelSlots`/`assignTauntSlot`, editada em Configurações → Comunicação) migra a roda antiga preservando as primeiras oito escolhas válidas; escolher uma fala já equipada troca as posições, escolher outra substitui só a vaga. A roda relê a preferência ao abrir e o servidor sempre recebe o índice do catálogo. Os números 1 a 8 escolhem as posições; 9 e 0 são consumidos com a roda aberta para não lançar magia por baixo. `{ inline: true, hint }` embute a mesma roda nas Configurações (sem abrir sobre a partida e sem escolher só por foco); `setLabels` troca os rótulos.
- Auditoria de guias: fichas usam `n2` (centésimos) só no atraso e no atordoamento do Meteoro, o resto `n1`; `knockDistance` usa amortecimento/soft-cap/corte de `moveWizard`, sem amplificação por dano histórico. Roteiros demonstram bloqueios de stun/Agarrar, Escudo contra área/reflexão, colisões da Rajada e trajetórias da Ilusão. `demoStatus` lê estados reais. Canvas instrumentado não substitui inspeção visual no navegador.
- Grimório: `MECHANIC_GUIDES` contém Atacar/Manter base com prévias; `NEGATIVE_GUIDES` contém nove status independentes, somente texto e sem magia/demo anexada. Ambos aparecem apenas no livro, fora de Aprender/loja. Abertura normal começa no sumário, sem persistir página; links explícitos de habilidade permanecem diretos. Recuperação50→100% fica em Empurrão.
- **Grimório mora na aba Aprender** (pedidos do Fernando, 24/10): `grimoire({ side, onShow })` devolve o livro solto (`root`, `contents`, `goTo`, `onKey`, `dispose`); a partida o põe num diálogo (`openGrimoire`, com as páginas de sumário) e a aba Aprender monta `.learn-grid` com três áreas: o sumário lateral (`contents`, reusa `.settings-toc`, capítulo à vista com `.on`), o livro sem as 2 páginas de sumário (`side`: começa na página 3, Home e ‹ param ali) e a biblioteca, onde `onShow` marca com `aria-current` a magia ou item aberto. A aba alarga até 2400 px (`.lobby:has(...)`); a partir de 1800 px as colunas ficam lado a lado na altura da tela, abaixo disso a biblioteca desce para baixo do livro. `showRules` e o F2 decidem pelo menu na tela: com ele, trocam para a aba (F1 na primeira página, F2 na busca da biblioteca); sem ele, abrem o diálogo. A demonstração só pausa com a aba escondida (`[hidden]`) e para quando o livro sai do DOM.

## Connection lifecycle (`net.ts`)

- `Connection<T>` owns its socket, reconnect timer, heartbeat, visibility listener, and parser warning state. Keep that state private and specific to the instance.
- `connect()` remains the entry point for lobby and room callers. Its `send` and `stop` callbacks stay bound to the instance; `stop()` is terminal and idempotent, including when browser events are already queued.
- Preserve socket identity guards when replacing a connection. Lifecycle regressions live in `tests/net-lifecycle.test.ts`.

## Character preview (`avatar.ts`)

- `AvatarPreview` owns the renderer, camera, current appearance and visibility-aware frame loop. `avatarPanel()` lazily creates one instance and reuses its panel across Wardrobe and Settings, keeping one WebGL context for the browser session.
- Its observer and visibility listener live as long as that shared panel. Hiding or detaching the panel pauses animation and rendering; remounting must not create a second frame loop. Keep the visibility-aware RAF scheduler so hidden previews do no work.
- Replacing the appearance calls `disposeAppearance` for its owned materials, skeletons and mixer. Cached source geometry and textures remain shared with the match. Ignore asynchronous loads for a look that is no longer selected.

## Controller input (`gamepad.ts`)

- `Pad` owns button edges, aiming, menu focus, capture and rumble preferences. The exported functions delegate to one browser-session instance; `main.ts` calls `startPad()` once to install its input listeners and frame loop.
- Room input registers its current callbacks through `setPadGame()`. Preserve button-release handling during remapping and taunt selection so the scoreboard cannot stay held and menu actions cannot cast or move.

## Movement prediction (`predict.ts`)

- `MovementPredictor` owns predicted movement, snapshot identity, queued input, cast holds, dash/stun/death transitions, RTT smoothing, and Campaign terrain/room-lock configuration.
- Keep `createPredict()` and its bound public callbacks compatible. `reset()` clears transient movement and input state while preserving RTT and map configuration.
- Use the shared movement/collision helpers and preserve transition order. Read authoritative residual velocity once per new snapshot; repeated render frames must not renew an impulse. Prediction/reset, obstacle, dash, suspension, and recovery regressions cover this boundary.

## Idioma

- Todo texto visível com `t('português', 'English')` (`i18n.ts`). Nomes por `spellName`, `itemName`, `arenaName`; textos de item por `itemText`; números com `LOCALE` (helpers `n1`/`pct`).
- O idioma é lido uma vez ao carregar (`setLang` grava e recarrega), então listas de texto podem ficar em constantes de módulo.
- Textos longos de regras ficam em pares `_PT`/`_EN` em `rules-text.ts`. Erros do servidor chegam em português e são traduzidos por `SERVER_EN` (`main.ts`).

## CSS (`style.css`, arquivo único)

- Cores e medidas pelas variáveis de `:root` (`--lava`, `--gold`, `--bronze`, `--panel`, `--fg`, `--r-md`…). Nada de hex solto, exceto a cor de grupo.
- Cor de grupo: `.g-ataque`, `.g-mobilidade`, `.g-defesa`, `.g-controle` (variável `--g`); itens prateados (`--item`). A classe vem de `spellClass(s)` pela posição em `SPELL_GROUPS`: magia nova ganha cor entrando num grupo, sem classe nova. Na loja, os itens passivos ficam em seções por `ITEM_GROUPS` (`rules-text.ts`, mesmo formato, todos prateados): item passivo novo entra num grupo, senão some da loja (teste em `ui-data.test.ts`).
- Celular (fora de foco desde 20/10: não conferir a cada mudança, só não apagar estas regras): `(max-width: 600px)`, `(max-height: 500px)` (deitado), `(pointer: coarse)` com alvos de 44 px, `(max-width: 860px)` / `(min-width: 861px)`. Hover só dentro de `(hover: hover)`. Animação nova com `(prefers-reduced-motion: reduce)`. Em JS, `TOUCH` (`ui.ts`).

## Teclas (`keys.ts`)

Provocações no controle: ← por padrão, remapeável; se uma preferência antiga já ocupa ←, escolhe botão livre sem sobrescrever. O roteamento em `gamepad.ts` abre a roda (o botão da interface), o analógico aponta pela `radialIndex`, o direcional anda ±1 por toque, A/✕ confirma, B/○ ou Start cancela. Enquanto aberta não envia movimento nem magia; reutiliza o botão e o envio da interface atual.

`DEFAULTS` usa `event.code` (`'KeyQ'`, `'Digit1'`, `'F1'`), nunca `event.key`. Ação de interface nova entra em `UI_ACTIONS` e `UI_NAMES` (`''` = sem tecla). Esc, Enter, Espaço e ← → são reservadas. As 26 letras já têm dono.

Teclas por posição (padrão): as magias usam a tecla da **posição** na barra (`POS_ACTIONS`: Magia 1 a 8 em 1 2 3 4 Q W E R, guardadas em `warlock:poskeys8`; sem itens ativos desde 21/10, #217); `keyOf`/`actionFor`/`whoUses` já resolvem o modo. A ordem das posições vem de `loadoutSlots`/`moveLoadout` (`screen-data.ts`, guardada em `warlock:loadout-order`) e chega às teclas e ao controle por `setSlots`; vaga vazia é `null`. Posições e atalhos da interface nunca repetem tecla (`setKey` troca). Trocar qualquer tecla fixa o modo em uso no navegador.

## Settings page (`settings.ts`)

- `SettingsPage` owns the sections/body, table of contents, responsive media listener, `IntersectionObserver`, highlight hold, and `fill`/`jump`/`dispose` lifecycle. `settingsPage()` and `openSettings()` keep the home-versus-dialog coordinator outside the page and retain their existing entry points.
- `dispose()` is idempotent, disconnects observed section nodes, removes the media listener, and makes queued observer callbacks inert. Dispose the old home page before replacing it and the modal page when the dialog closes. Field redraw restores focus by stable ID; keep IDs unique because home settings and the dialog are never shown together.
- A page receives whether it is the home page: in the lobby, the Character section links to the single `avatarPanel` WebGL preview; in the match, it renders that section directly. Section content stays in `SECTIONS` and its existing builders; `null` continues to hide match-only effects in the lobby.
- Sound has four persisted volumes: master multiplies SFX, music and taunts. `channelVolume` and `isAudioMuted` centralize mixing and mute state. Master starts neutral in the migration; taunts inherit SFX once, and private previews respect master × taunts. The same sliders work in home settings and the match dialog.
- Sound sliders use required `volumes`/`setVolume` callbacks from `SettingsCtx`, supplied by the current lobby or room `createSound()` instance. Persisted preferences intentionally survive page replacement.
- `TauntPreviewSession` owns the private preview element, Web Audio context cleanup, current request identity, and fallback/Web Audio volume mode. Keep `previewTaunt()` and `stopTauntPreview()` as compatibility adapters; route live master/taunt volume changes through the session. A stale download or decode must not play, stop, or close a replacement preview. This session does not own in-match playback or the `createSound()` cache.

## Cena (`scene.ts`)

- `proj-models.ts` contains stateless projectile and vine factories. Each call creates resources owned by the requesting scene; keep disposal in the scene's existing teardown paths rather than disposing shared appearance assets or adding module-level mesh caches.

- `resourceStats()` exposes Three.js geometry and texture counts for low-frequency telemetry. These are resource counts, not GPU memory in bytes; keep collection outside the render loop and do not add listeners or timers that outlive the room.

- Destruição simples (`clash/pulse`) amplia só explosão/onda no ponto do projétil, sem mudar feixe do Raio, alcance, dano ou colisão.

- `cloneAppearance` mantém cores/texturas da montagem do Guarda-roupas na partida; cor da vaga fica no anel/barra/nome, sem tingir roupa. Clona materiais/esqueleto, compartilha geometrias/texturas. Ao trocar a prévia, descarte só seus materiais próprios.

- Números de dano não aparecem sobre alvos ocultos ao observador. O impacto público da magia permanece. `main.ts` passa os alvos ocultos pelo snapshot do evento/replay e pela opção de visão da Sandbox, sem depender da pose interpolada anterior.

- **Pixel art** (`setPixel`, issue #79): troca o `RenderPass` pelo `RenderPixelatedPass` (blocos de `pixelSize` px: 2 ou 3, 0 desliga). Nesse modo a câmera fica mais longe com ângulo menor (`camK`) e é presa à grade; a sobra desliza o canvas e os nomes (`pixelShift`). Quem mexer no posicionamento da câmera mantém os dois, senão o chão volta a tremer. Só existe no PC (precisa do `EffectComposer`, que o celular não cria); a escolha fica em `warlock:pixel` (`savedPixel`).

## O que não vai para `ui.ts`

- **Distância sonora:** `sound-distance.ts` calcula a atenuação pela posição do próprio mago, não pela câmera (intensidade inteira até 2 m, queda quadrática até silêncio em 24 m). `main.ts` aplica a eventos de mundo e provocações manuais; música, menu e avisos globais não dependem de distância. A provocação reconsulta a posição após carregar o áudio. Espectador sem mago usa nível neutro 0,6; fonte ausente não produz som.

- **Nivelamento de áudio:** `audio-level.ts` mede RMS em janelas ativas de 50 ms, mirando 0,12 com pico até 0,8. `sound.ts` mede arquivos e síntese pré-renderizada, compensa camadas de impacto e mantém prévia de provocações no mesmo nível da partida. Síntese imediata continua como reserva até o cache ficar pronto; a conferência auditiva humana continua necessária.

`ui.ts` usa `document`/`matchMedia` ao carregar e não roda no Vitest. Decisão de tela que precisa de teste vai para função pura em `screen-data.ts` (ou `rules-text.ts`, `tips.ts`, `icons.ts`, `keys.ts`, `sheet.ts`, `reach.ts`, que não mexem no DOM ao carregar).

## Snapshot interpolation (`interp.ts`)

- `SnapshotInterpolator` owns a bounded snapshot buffer, its capacity, and the smoothed server/local clock offset. Live rendering and replay use independent instances through `createInterp(max)`.
- Preserve bound `push`, `latest`, `sample`, and `reset` callbacks. Reset clears history and clock offset; simulation clock rollback also starts new history. Keep interpolation math and `keepLast()` as module helpers.
- Preserve snapshot references, interpolation delay/smoothing, and replay limits. Compatibility, round-reset, capacity, and instance-isolation coverage lives in `tests/client.test.ts`.
