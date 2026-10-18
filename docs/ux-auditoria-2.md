# Auditoria de usabilidade 2 (18/10/2026, medida no navegador)

Como foi medido: Playwright sem janela (Chrome, perfil fixo), servidor local próprio (porta 8811), celular 393×852 com toque e PC 1280×720, passando por lista de salas, apelido, sala de espera, regras, volume, loja, placar, contagem, partida, ficha, votação, lava, morte e espectador, fim, sala inexistente, sala cheia (8 conexões de verdade) e queda de conexão (sala e lista); no celular, também uma partida de Deathmatch e uma de treino. Régua: alvo ≥ 44 px no toque (≥ 24 px no mouse), contraste ≥ 4,5:1 (3:1 em texto grande), texto ≥ 11 px, nada fora da tela, nada sobreposto, foco visível no Tab, botão com nome.

Origem dos números de contraste: **calculado** pelas cores do CSS (degradê: a pior parada); quando o cálculo reprova, **medido nos pixels** da tela (texto escondido, pior 10% do fundo). Prints em `prints/2026-10-18-auditoria/` (`antes-*` e `depois-*` com o mesmo nome; `-dm` = Deathmatch, `-treino` = modo treino); medidas em `medidas.json` de cada pasta.

## Achados corrigidos, por impacto

| # | Achado | Antes → depois | Onde · prints |
|---|---|---|---|
| 1 | Texto dos botões de lava (Criar sala, Entrar, Começar, Pronto, Jogar de novo, Ver salas, Continuar, Sim) | **2,3:1** medido nos pixels → **4,75:1** calculado na parte mais clara do novo degradê (#c8400c → --lava-dark), sem reprovar depois; continua laranja de lava com borda acesa | style.css:11, :34 · `01-lista`, `17-sala-cheia` (pc e cel) |
| 2 | **Teclado preso fora da loja** no PC: o Tab abria o placar, então o teclado nunca chegava aos cartões | passeio de Tab: 0 elementos → 12, todos com contorno; o placar segue no botão ao lado do Pronto | ui.ts:561 · `antes-pc/06-loja` |
| 3 | Celular na partida: com o ping, o botão da sala ia a 117 px e **a barra do topo quebrava em 2 linhas**, empurrando rodada, relógio e lista ~50 px; ícones com 40 px | 1 linha (ping embaixo do código); ícones, Votar e código com 44 px | style.css:357-358, :366, :401-402 · `13-lava` (cel) |
| 4 | **"Arena encolhe em N s" em vermelho sobre a lava** justo nos últimos 3 s | **1,8 a 3,1:1** medido nos pixels → pílula de vidro escuro atrás; ≥ 4,5:1 calculado (5,1:1 sobre lava pura), sem reprovar depois | style.css:101 · `13-lava`, `14-morto-feed` (pc e cel) |
| 5 | Celular: faixa **"Sem conexão" cobria o título do cartão** (8.852 px² sobrepostos; na loja cobriria o ouro) | entra na coluna abaixo do topo, sem sobrepor; só ocupa espaço quando aparece (depois de 1,5 s) | style.css:346, :352 · `18-sem-conexao-sala` (cel) |
| 6 | Alvos de toque < 44 px no celular: 6 ícones do topo (40), código da sala (40), Expulsar (40), "Opções da partida" (38), grupos da votação (**19**), volumes (20) | 0 alvos abaixo de 44 px em todas as telas | style.css:400-404 · `03-sala`, `12-votar` (cel) |
| 7 | PC: lista de jogadores **aparecia atrás da loja e do fim** (22.859 px² sobrepostos) | escondida quando o cartão do meio está aberto (ele já lista os jogadores), como já era no celular | style.css:354 · `06-loja`, `15-fim` (pc) |
| 8 | PC: textos de **10,9 px** (ficha na loja, "Como ganho ouro") | mínimo 11 px em todo `small` | style.css:52 · `06-loja` (pc) |
| 9 | Celular: faixa "Você caiu na lava!" / "Rodada 1" **por cima da lista de jogadores** (5.520 px²) | faixa a 38% da altura; no Deathmatch o "Você volta em N s" desceu para 44% para não ficar embaixo dela (conferido numa partida de Deathmatch) | style.css:360-362 · `14-morto-feed`, `08-contagem` (cel, cel-dm) |
| 10 | Treino no celular: **o aviso (baú, runa) cobria a dica do treino** (5.895 px², print `antes-cel-treino/14b-espectador`) | com a dica na tela o aviso sobe; aviso de 3 linhas termina 30 px acima da dica | style.css:544 · `depois-cel-treino/16-dica-e-aviso` |
| 11 | "‹apelido› · trocar" no topo da lista de salas | **4,1:1** medido nos pixels (celular) → **7,1:1** medido nos pixels | style.css:71 · `01-lista` (cel) |
| 12 | "Como jogar" sem foco e sem Esc (o Tab passeava por trás); trocar o apelido não tinha como desistir | diálogo com foco no Entendi e Esc fecha; Esc no apelido mantém o anterior (conferido no navegador) | ui.ts:40-45, :104-105, :119 |
| 13 | Botão do código da sala com nome acessível só "UYTD" | "Sala UYTD: copiar link" | ui.ts:509 |
| 14 | PC: grupos da votação e "Opções da partida" com 19 px de altura (< 24) | 24 px | style.css:394 |

Também: selos dos itens passivos (`tabindex`) entram no contorno de foco padrão (style.css:51).

## Ficou de fora (e por quê)
- **Textos sobre a arena 3D** (números de dano, nomes dos magos, faixa vermelha "Você caiu na lava!"): medidos nos pixels **sem a sombra** dão 1,1 a 3,7:1 conforme o chão atrás; com contorno e sombra são legíveis nos prints. Não dá para garantir 4,5:1 sobre uma cena que se move; mexer mudaria o visual do jogo.
- **Ficha (gaveta) e placar fixado cobrem a barra de magias, o topo e a dica do treino no celular**: painéis abertos pelo jogador, com ✕; intencional.
- **Dica de magia que aparece sozinha na loja do celular**: efeito do teste (o clique emulado deixa um cursor de mouse parado). Testei uma trava só para toque e ela fazia a dica sumir a cada compra dos outros; revertida.
- **Barra de magias continua visível enquanto você assiste morto**: mexe no fluxo da partida; fica para decisão.
- **PC com mouse**: ícones de 40 px, abas de 32 px e Expulsar de 26 px passam no mínimo de 24 px; não aumentei para não mudar o desenho.
- **"Como jogar" não prende o Tab dentro do diálogo** (por isso sem `aria-modal`); o Esc e o foco inicial resolvem o principal.
- **Não medido**: modo Times; faixa de votação aberta (com bots a votação passa na hora, a faixa não chegou a aparecer); linha da rodada longa do Deathmatch com "Próxima rodada: …" ao lado do relógio no PC.
- Detalhe de teste: na primeira entrada com `?as=nome` na URL, o Esc no apelido aceita esse nome (só em URL de teste).
- Nada em `src/shared/*`.

## O que passou sem ajuste
Sem rolagem horizontal e nada fora da tela nas 19 telas × 2 tamanhos; todos os botões com nome; foco visível em todos os elementos alcançados pelo Tab; erros claros com saída: "Sala não encontrada" (Ver salas), "Sala cheia · Já tem 8 magos" (Ver salas), lista sem conexão ("Não deu para carregar as salas… Tentar de novo").
