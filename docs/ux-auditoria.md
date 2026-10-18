# Auditoria de usabilidade (18/10/2026, leitura de código, sem prints)

Direção visual escolhida: fantasia sombria (pedra, lava, ouro, serifa mágica, ícones desenhados no lugar dos emojis). Pedido do Fernando: boa usabilidade e informação suficiente para decisões bem informadas.

## Top 10 por impacto
1. Na loja, o Tab abre o placar e impede navegar pelo teclado (ui.ts, keydown do Tab na fase shop). Interceptar só fora da loja ou com foco no canvas; botão "Placar" ao lado do Pronto.
2. "Como jogar" desatualizado (rules-text.ts: só 10 das 25 magias, sem Times, sem 📊/taunts) e nenhuma dica na primeira loja. Gerar controles a partir de keys.ts; cartão de 3 linhas na loja da rodada 0.
3. Loja pesada: 25 magias + 10 itens numa grade única; Pronto escondido depois de "Como ganho ouro" (13 linhas); relógio longe do Pronto. Agrupar (Ataque, Mobilidade, Defesa, Controle); "Pronto · 22 s" logo abaixo do ouro; "Como ganho ouro" recolhível; destacar "dá para comprar" e "já tenho".
4. Nas Rodadas o HUD não avisa o encolhimento (shrinkIn calculado e ignorado fora do Deathmatch). Linha "Arena encolhe em 4 s" pulsando nos últimos 3 s.
5. Queda de conexão quase invisível (só o ponto de 10 px); compras durante a queda somem; lobby fica "Carregando salas…" para sempre se o WebSocket falhar. Faixa "Sem conexão, tentando de novo…" e botões desabilitados offline; erro com "Tentar de novo" no lobby.
6. Celular: sem instrução "toque no chão para lançar · ✕" ao escolher a magia; ícones sem nome na partida.
7. Emojis repetidos e ambíguos (⛓️ Agarrar/Armadura/preso; 🧛 Drenar/Roubo de vida; ✨ Teleporte/invulnerável; 💨; 🧲 atrai e afasta) e diferentes entre Windows e Android. Conjunto próprio de ícones SVG num estilo só (game-icons.net, CC BY 3.0).
8. Placar do Tab não aceita clique no PC (pointer-events: none no overlay). Liberar as abas ou trocar com ←/→.
9. Botões desabilitados com opacidade .45 ficam abaixo de 4,5:1 de contraste; textos de 10 a 11 px no HUD. Cor própria para desabilitado; "faltam 3" em vermelho; mínimo 11-12 px.
10. Barra do topo só com ícones (sem aria-label; title não aparece no toque); "Votar" destoa; cabeçalhos ☠ 💥 🏆 sem legenda.

Menores: @keyframes pop duplicado (balão do taunt pode pular); caixinha de tecla vazia na Zona de dobra; apelido vazio sem mensagem; "8 magos" escrito à mão; "Copiar link da sala" no fim do cartão (subir e usar navigator.share no celular).

## Manter
Telas de erro claras; banners a favor/contra; números de dano e "+N 🪙"; toast do baú; dica de magia com nível atual → próximo e preço (ótima para decidir); loja preserva o foco; ouro e Pronto grudados no celular; 44 px no toque, safe-area, reduced-motion, focus-visible; volume separado; teclas trocáveis e modo Q W E R D F; painéis do topo com o mesmo componente; passivos como selos.

## Identidade visual: inconsistências
- Paleta com hex soltos: 4 dourados (#ffd666, #ffd23f, #ffd84a, #ffcc33), 3-4 vermelhos/laranjas, bordas soltas, 6 opacidades de fundo de painel, cores de time (estilo Tailwind) diferentes das cores dos jogadores (estilo Radix).
- Tipografia boa (Grenze + Alegreya Sans), mas dois estilos de h2 e h3 em tamanhos variados.
- Ícones: tudo emoji, choca com a serifa de fantasia.
- Raios de borda sem escala (14/12/10/8/5/4/999); três jeitos de mostrar "selecionado"; classe stats-tabs reaproveitada em seletores; time = quadradinho, jogador = bolinha.

## Falta conferir ao vivo
Prints de todas as telas (PC e celular), erros (sala inexistente, outra aba, cheia, offline, espectador), contraste medido, clique no Tab, aviso de encolhimento, balão do taunt, Zona de dobra sem tecla, publicado igual ao código.
