# Warlock Wars

Teams rounds spawn allies in compact formations on opposite sides of every arena; other modes keep their existing spawn layout.

Web remake of the **Warlock** arena mod (Warcraft 3 / Dota 2's Warlock Brawl): wizards on an arena that shrinks over lava, knockback spells, a shop between rounds, and the last one standing wins. Made to play in rooms with friends, right in the browser, in Portuguese or English.

**Play:** https://warlock.fernandorffdev.com

## What it has

- 29 spells (the Warlock Brawl ones, with numbers from the original Dota 2 mod code tuned by the simulator, plus new ones): 12 attack, 5 mobility, 5 defense, 5 control and 2 support; up to 6 per wizard on the Q W E R D F keys, with Fireball for free; the bar has Q W E R on top and A S D F below, with Attack (A) and Hold ground (S) fixed, with a tip and demo on hover
- 17 items with 3 levels each: 16 passive (3 critical) and the Scourge, the free active item on key 1; a Dota-style grid shop with sell and undo, 3 builds saved in the browser (Use buys the build by itself) and a ★ badge on the most bought; the spell order is changed by dragging on the bottom bar
- Rounds, Deathmatch and Teams modes; Campaign (1 to 4 players together against the Smoke's servants, in progress) and Ascension as their own options in the Play menu (Ascension: 9 rounds; every intermission 1 new spell and 1 item, and each XP level upgrades 1 spell; no gold); Circle, Ring, Islands and Cross arenas, which shrink until sudden death
- Round effect, a room option (off by default; Random or a fixed one): Rainy Weather, Thorn Arena, Gold Fever, Gale, Fountain of Life and Open Field
- Bots in 3 difficulties (chosen bot by bot) that play "like people": aim with error, reaction time, hesitation
- Play tab: online room, match against bots (difficulty chosen bot by bot), training, challenges, Shadow (a bot that plays like you), Watch (join a room without a wizard, from the room list or the button in the room, and play again if there is a free slot) and a sandbox with endless health and gold (with infinite health, the lava does not move you), arena of your choice (starts round and is never random), rock that grows and shrinks from the panel, and a training turret (Fireball in a fixed direction)
- 7-part character creator with an orbitable 3D preview (drag to rotate, scroll to zoom), grimoire (F1), spell and item reference (F2), fall replay (5), scoreboard (Tab)
- Play-style telemetry and a balance simulator (`scripts/balance-sim.ts`)
- Illusion: a visible copy keeps walking forward for 2 s while the player turns invisible and can move; another spell reveals the player, but the copy goes on until its time runs out. Both can be hit; the copy can be pushed but not destroyed.

## Stack

- **Client:** TypeScript, Vite, Three.js (WebGL), plain HTML/CSS interface, Web Audio
- **Server:** Cloudflare Workers + Durable Objects (one room per object, simulation at 60 steps/s, state at 30/s over WebSocket)
- The same game logic (`src/shared`) runs on the server and in the browser (prediction of your own wizard, interpolation of the others)
- **Tests:** Vitest (logic) and Playwright (browser)

## Run

```bash
npm ci
npx wrangler dev   # server + client at http://localhost:8787
npm run typecheck  # client, server and balance script types
npx vitest run     # tests
# Windows installer (opens the live game): cd desktop && npm ci && npm run dist
```

## Contribute

- Contributor guide: [CONTRIBUTING.md](CONTRIBUTING.md) (machine, agents and skills, flow, tests, balance and review)
- Code rules for people and AI agents (Claude Code, Codex, Cursor): [CLAUDE.md](CLAUDE.md), also read through [AGENTS.md](AGENTS.md); it is an index of smaller documents, and each main folder has its own `CLAUDE.md`
- Every product decision, with its date and reason: [docs/DECISIONS.md](docs/DECISIONS.md)
- Git flow (details in the contributor guide): task branch in this repository (not a fork) from `master` → PR to `master` with the template, green CI → live game, published automatically. Every PR gets the automatic Claude review
- Each PR's environment: every PR (drafts too) publishes to `https://pr-<n>-warlock.fernandorffdev.com`, deleted when the PR closes ([docs/WORKFLOW.md](docs/WORKFLOW.md#pr-environment))
- The live game is published automatically when the PR lands in `master`

## Plans

Large plans live in [docs/plans/](docs/plans/README.md) (no wiki). These are long and written in Portuguese; new plans are written in English.

| Plan | Status | Owner |
|---|---|---|
| [Warlock online — design](docs/plans/2026-10-17-warlock-design.md) and [build plan](docs/plans/2026-10-17-warlock.md) | done; historical | Fernando |
| [Ascension mode](docs/plans/2026-10-19-ascensao-design.md) | live; numbers change in balance PRs | Fernando |
| [Campaign mode — "Last Candle"](docs/plans/2026-10-19-campanha-design.md) | in progress (classes on standby) | Lucas |
| [Campaign — slice 1](docs/plans/2026-10-19-campanha-fatia1.md) | in progress; partly replaced | Lucas |

## Credits

Free-to-use models, textures, effects, sounds and music (KayKit, Kenney, ambientCG, Poly Haven, OpenGameArt); full list in `public/CREDITS.txt` and an index of every asset in [docs/ASSETS.md](docs/ASSETS.md) (every new asset goes there). Library with all the free KayKit models for contributors: `assets/kaykit/`. Based on Warlock by Zymoran and Adynathos and on Warlock Brawl (github.com/warlockbrawl/warlock).
