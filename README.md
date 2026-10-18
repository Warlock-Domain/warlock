# Warlock Wars

Remake web do mod de arena **Warlock** (Warcraft 3 / Warlock Brawl do Dota 2): magos numa arena que encolhe sobre lava, magias de empurrão, loja entre rodadas e quem sobrar vence. Feito para jogar em salas com os amigos, direto no navegador.

**Jogar:** https://warlock.fernandorffdev.com

## O que tem

- 15 magias do Warlock Brawl (números tirados do código original do mod de Dota 2; as outras 10 estão a caminho) e 10 itens, loja entre rodadas com venda e desfazer
- Modos Rodadas, Deathmatch e Times (fogo amigo só empurra), troca de modo por votação
- Baús de ouro no meio da rodada, chão com efeito quando magias se chocam, obstáculos quebráveis
- Bots, taunts com voz, placar completo ao vivo (Tab), telemetria de balanceamento

## Stack

- **Cliente:** TypeScript, Vite, Three.js (WebGL), interface em HTML/CSS puros, Web Audio
- **Servidor:** Cloudflare Workers + Durable Objects (uma sala por objeto, simulação a 60 passos/s, estado a 30/s por WebSocket)
- A mesma lógica do jogo (`src/shared`) roda no servidor e no navegador (previsão do próprio mago, interpolação dos outros)
- **Testes:** Vitest (lógica) e Playwright (navegador)

## Rodar

```bash
npm install
npx wrangler dev   # servidor + cliente em http://localhost:8787
npx vitest run     # testes
```

Publicar: `npx vite build && npx wrangler deploy`.

## Créditos

Modelos, texturas, efeitos, sons e música de uso livre (KayKit, Kenney, ambientCG, Poly Haven, OpenGameArt); lista completa em `public/CREDITS.txt`. Baseado no Warlock de Zymoran e Adynathos e no Warlock Brawl (github.com/warlockbrawl/warlock).
