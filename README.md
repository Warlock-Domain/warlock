# Warlock Wars

Remake web do mod de arena **Warlock** (Warcraft 3 / Warlock Brawl do Dota 2): magos numa arena que encolhe sobre lava, magias de empurrão, loja entre rodadas e quem sobrar vence. Feito para jogar em salas com os amigos, direto no navegador, em português ou inglês.

**Jogar:** https://warlock.fernandorffdev.com

## O que tem

- 29 magias (as do Warlock Brawl, com números do código original do mod de Dota 2 ajustados pelo simulador, mais as novas): 12 de ataque, 5 de mobilidade, 5 de defesa, 5 de controle e 2 de suporte; até 8 por mago nas teclas 1 2 3 4 Q W E R, com a Bola de fogo e o Flagelo de graça; Atacar (A) e Manter base (S) ficam fixos ao lado da barra, com dica e demonstração no mouse
- 16 itens passivos (3 de crítico), loja em grade no estilo do Dota com venda e desfazer, 3 builds salvas no navegador (Usar compra a build sozinho) e selo ★ nos mais comprados; a ordem das magias se troca arrastando na barra de baixo
- Modos Rodadas, Deathmatch e Times; Campanha (1 a 4 jogadores juntos contra os servos do Fumo, em construção) e Ascensão como opções próprias no menu Jogar (Ascensão: 9 rodadas; todo intervalo 1 magia nova e 1 item, e cada nível de XP sobe 1 magia; sem ouro); arenas Círculo, Anel, Ilhas e Cruz, que encolhem até a morte súbita
- Efeito de rodada, opção da sala (desligado por padrão; Sortear ou um fixo): Tempo chuvoso, Arena de espinhos, Febre do ouro, Vendaval, Fonte da vida e Campo aberto
- Bots em 3 dificuldades (escolhida bot a bot), que jogam "como gente": mira com erro, tempo de reação, hesitação
- Aba Jogar: sala online, partida contra bots (dificuldade escolhida bot a bot), treino, desafios, Sombra (bot que joga como você) Assistir (entrar numa sala sem mago, pela lista de salas ou pelo botão na sala, e voltar a jogar se houver vaga) e sandbox com vida e ouro sem fim (com vida infinita, a lava não tira do lugar), arena à escolha (começa redonda e nunca sorteia), pedra que cresce e diminui pelo painel e torreta de treino (Bola de fogo numa direção fixa)
- Criador de personagem de 7 peças com prévia 3D orbitável (arraste para girar, role para aproximar), grimório (F1), consulta de magias e itens (F2), replay da queda (5), placar (Tab)
- Telemetria do jeito de jogar e simulador de balanceamento (`scripts/balance-sim.ts`)
- Ilusão: uma cópia visível segue em frente por 2 s enquanto o jogador fica invisível e pode se mover; outra magia revela o jogador, mas a cópia continua até o prazo. Ambos podem ser atingidos; a cópia pode ser empurrada, mas não destruída.

## Stack

- **Cliente:** TypeScript, Vite, Three.js (WebGL), interface em HTML/CSS puros, Web Audio
- **Servidor:** Cloudflare Workers + Durable Objects (uma sala por objeto, simulação a 60 passos/s, estado a 30/s por WebSocket)
- A mesma lógica do jogo (`src/shared`) roda no servidor e no navegador (previsão do próprio mago, interpolação dos outros)
- **Testes:** Vitest (lógica) e Playwright (navegador)

## Rodar

```bash
npm ci
npx wrangler dev   # servidor + cliente em http://localhost:8787
npm run typecheck  # tipos do cliente, servidor e scripts de balanceamento
npx vitest run     # testes
# instalador para Windows (abre o jogo no ar): cd desktop && npm ci && npm run dist
```

## Contribuir

- Guia de contribuição em inglês: [CONTRIBUTING.md](CONTRIBUTING.md) (máquina, agentes e skills, fluxo, testes, balanceamento e revisão)
- Regras do código para gente e para agentes de IA (Claude Code, Codex, Cursor): [CLAUDE.md](CLAUDE.md), também lido via [AGENTS.md](AGENTS.md); cada pasta principal tem o seu `CLAUDE.md`
- Fluxo de Git (detalhes no guia de contribuição): branch da tarefa no próprio repositório (não fork) a partir do `master` → PR para o `master` com o modelo, CI verde → jogo no ar, publicado sozinho. Todo PR recebe a revisão automática do Claude; comente `@claude` num PR ou issue para pedir ajuda
- Ambiente de cada PR: todo PR (rascunho também) publica em `https://pr-<n>-warlock.fernandorffdev.com`, apagado quando o PR fecha (`CLAUDE.md`, seção "Ambiente por PR")
- O jogo no ar é publicado sozinho quando o PR entra no `master`

## Créditos

Modelos, texturas, efeitos, sons e música de uso livre (KayKit, Kenney, ambientCG, Poly Haven, OpenGameArt); lista completa em `public/CREDITS.txt` e índice de todos os assets em [docs/ASSETS.md](docs/ASSETS.md) (todo asset novo entra lá). Biblioteca com todos os modelos grátis do KayKit para quem contribui: `assets/kaykit/`. Baseado no Warlock de Zymoran e Adynathos e no Warlock Brawl (github.com/warlockbrawl/warlock).
