# Warlock Wars — instructions for AI agents

Guide for anyone working in this repository with Claude Code, Codex, Cursor or another agent. It applies to humans too. `AGENTS.md` points to this file. This file is an index: it keeps the essentials and links to smaller documents by subject, so read only the ones your task needs.

Live game: https://warlock.fernandorffdev.com · web remake of the **Warlock** mod (Warcraft 3 / Dota 2's Warlock Brawl). The audience is Dota players: when in doubt about the interface, follow the Dota way.

## Code map

```
src/shared/   game logic, runs the same on the server and in the browser
  sim.ts        simulation (60 steps/s): wizards, projectiles, lava, obstacles, islands, runes
  spells.ts     the spells (levels, cooldown, damage, knockback); items.ts the items
  bots.ts       bots (BOT_SKILL per difficulty, decision on every think)
  match.ts      match: phases, shop, gold, rounds, votes, statistics
  ascension.ts  Ascension mode: XP, cards, points per fall, comeback (match.ts calls it behind m.asc)
  protocol.ts   client↔server messages and their validation (trust boundary)
  arena.ts      arena shapes, edge, path inside the rock
  characters.ts characters and the 7-part "look" (character creator)
  campaign.ts   Campaign mode: stages, Smoke servants, seeded night (rng.ts)
  bosses.ts     Campaign bosses: profile and their own brain (Sir Odran)
  levels.ts     Campaign rooms in ASCII (levels/*.ts) and the night map assembly (format in docs/campanha/)
src/worker/   Cloudflare Workers + Durable Objects (one room per object; lobby.ts keeps the telemetry)
src/client/   browser: main.ts (loop), scene.ts (Three.js), ui.ts (HUD, menus, shop), ascension-ui.ts (Ascension cards), i18n.ts, grimoire.ts…
scripts/      balance-sim.ts (balance simulator), build-tournament.ts (purchase tournament), smoke.mjs
tests/        Vitest (logic and pure client functions)
docs/         decision register, subject guides, plans, audits, code reviews and catalogs
assets/       model library for contributors (kaykit/: all the free packs), not part of the live game
```

## Commands

```bash
npm install
npx wrangler dev                    # server + client at http://localhost:8787
npm run typecheck                   # client, server and balance scripts
npx vitest run                      # tests
npx vite build                      # client build (dist/)
```

**Gates before any commit:** the three `tsc` runs, `vitest run` and `vite build`, all clean.

## Code rules

- **English everywhere except the game's text:** instructions, documentation, new code comments, commits, issues and PRs are in English. Existing Portuguese code comments are translated only when their file is changed for another reason (no translation-only churn). The game itself stays bilingual (see below).
- **Short code comments explain why, in English.** Comment only decisions that cannot be understood from the code: chosen timings and values, significant call order, browser or Cloudflare workarounds, and why work belongs on the server or client. Do not state the obvious. Update comments when decisions change. Product decisions go in [docs/DECISIONS.md](docs/DECISIONS.md); area-specific guidance goes in that folder's `CLAUDE.md`. Keep imports at the top.
- **No interaction specific to a pair of spells** (decision of 21/10): no rule like "spell X does Y when it meets spell Z". What a spell does comes from its general stats (damage, knockback, radius, duration, what it blocks), documented in `spells.ts` and the rules text, and applies the same against everything. Changed a stat: simulator measurement in the PR.
- **UI only with the existing pieces** (`dialog()`, `iconButton()`, `tabs()`, `choice()`, `searchFilter()`, `withTip`, details in `src/client/CLAUDE.md`), with colours and sizes from the `:root` variables. Need something no piece does? First extend the piece (one more parameter); only if it does not fit, create a new function next to the others and document it in `src/client/CLAUDE.md`. No repeated HTML/CSS and no loose colours or sizes in the code.
- **Less code wins:** reuse what exists (`el()` in icons.ts, `dialog()`, `iconButton()`, `tabs()`, `choice()`, `searchFilter()`, `withTip`, `store`, `t()`), no abstraction for a single use, no configuration nobody asked for. Surgical changes: do not reformat neighbouring code.
- **All player-facing text in both languages** with `t('português', 'English')` from `src/client/i18n.ts`. Spell/item/arena names through the `spellName`, `itemName`, `arenaName` helpers. Numbers with `LOCALE`.
- **Determinism:** the simulation must not use a bare `Math.random` nor change the order of random draws by accident. `tests/style.test.ts` keeps a hash of the events of a seeded match: if it changes, you changed the game. Only re-record it when the gameplay change is intentional.
- **The protocol is a trust boundary:** every new message is validated in `parseClientMessage` (types, limits, known keys).
- **Phones out of focus for now** (decision of 20/10): no need to check or optimise for phones; just do not delete the existing media queries (≤ 600 px and `pointer: coarse`).

## Product decisions (do not undo without agreeing in an issue)

**Before changing gameplay, controls, balance, modes or the UI layout, or undoing something that looks odd, read [docs/DECISIONS.md](docs/DECISIONS.md)**: it holds every decision with its date and reason, and the newer row wins. Every new decision gets a row there in the same PR as the change.

- Main menu as a bar (issue #83): the W logo from the tab icon (goes Home) · Play · Learn · Wardrobe · Shop (showcase, no prices or purchases) · Profile, with Settings as an icon (the exit button left on 22/10, issue #201). Lean menus.
- Shop as a grid with the name inside the icon and price with a coin; colours per group (Attack red-orange, Mobility gold, Defense blue, Control purple, Support green, Items silver); each group has 5 spells as a base and may have more by Fernando's decision (Attack went past 10 on 21/10, PR #236; Defense and Control with 6 since 24/10, PRs #347 and #348).
- Rooms with no pace option and no sudden-death option (always on); difficulty chosen bot by bot.
- Chests: at most half the wizards + 1 per round, never more than 3; the pile gives 3 to 5 gold. Shield with a 16 s cooldown. Drain only changes after real matches. Strong and rare attacks (do not shorten cooldowns).
- Declined: ranking/profile, items that only help one specific spell, and classes with passives in the core game (they belong to the Campaign).

## Index

| Subject | Where |
|---|---|
| Decision register (every decision, date and reason) | [docs/DECISIONS.md](docs/DECISIONS.md) |
| Contributing: setup, issues, coordination, review, tests | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Agent workflow, PR environments, pipelines, Git, publishing | [docs/WORKFLOW.md](docs/WORKFLOW.md) |
| Balance: simulator, accepted band, measurement rules | [docs/BALANCE.md](docs/BALANCE.md) |
| Testing in the browser: screenshots, smoke and headless scripts | [docs/BROWSER-TESTING.md](docs/BROWSER-TESTING.md) |
| Assets, credits and visual identity | [docs/ASSETS.md](docs/ASSETS.md), `public/CREDITS.txt` |
| Large plans (Ascension, Campaign, the original design) | [docs/plans/](docs/plans/README.md) |
| Area code patterns | [src/shared](src/shared/CLAUDE.md), [src/client](src/client/CLAUDE.md), [src/worker](src/worker/CLAUDE.md), [scripts](scripts/CLAUDE.md), [tests](tests/CLAUDE.md) |

Short version of the flow: task branch from `master` → PR to `master` (drafts publish to `https://pr-<n>-warlock.fernandorffdev.com`) → *squash and merge* → the Production pipeline publishes the live game. Agents never push directly to `master`. After `vite build`, restart `wrangler dev`.

## Credits and licences

Free-to-use assets (KayKit, Kenney, ambientCG, Poly Haven, OpenGameArt) are listed in `public/CREDITS.txt`. A new asset only with a licence that allows use and redistribution, credited in CREDITS.txt, and **indexed, explained and referenced** in [docs/ASSETS.md](docs/ASSETS.md) in the same PR (what it is, where the code uses it, where it came from and the licence). Before looking for or creating a model, check `assets/kaykit/` (all the free KayKit packs, outside `public/`, never shipped; each model's name in `assets/kaykit/INDICE.md`, rebuilt by `node scripts/assets/kaykit-index.mjs`).
