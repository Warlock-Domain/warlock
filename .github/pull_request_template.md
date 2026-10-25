<!--
Title in commit format: `type: what changes, in English` (types: feat, fix, balance, style, refactor, docs, ci, test).
E.g. `feat: ice rune that slows the enemy for 3 s`. The title becomes the commit on `master`.
-->

Closes #<!-- issue number, if any; the keyword must be Closes, Fixes or Resolves for GitHub to close the issue automatically -->

## Why

<!-- The problem or the idea, in one or two sentences. -->

## What changes

<!-- What the player sees differently, or what changes inside. Short list. -->

## Screenshots

<!-- Required if something changed on screen: before and after, on PC. No phone screenshots for now. Drag the images here. -->

| Before | After |
|---|---|
|  |  |

## How I tested

- [ ] `npm run typecheck` (client, server and scripts)
- [ ] `npx vitest run`
- [ ] `npx vite build`
- [ ] Played in the browser (`npx wrangler dev`) on PC
- [ ] New text in Portuguese and English (`t('pt', 'en')`)
- [ ] Non-obvious decision with a 1-line English comment explaining why
- [ ] New decision recorded in `docs/DECISIONS.md` (date, decision, why)
- [ ] New asset: free licence, credit in `public/CREDITS.txt` and a row in `docs/ASSETS.md` (what it is, where the code uses it, where it came from)
- [ ] UI with the existing pieces (`dialog()`, `iconButton()`, `tabs()`, `choice()`, `searchFilter()`, `withTip`) and the `:root` variables; a new piece only if none fits, documented in `src/client/CLAUDE.md`

## Balance

<!-- Only if you changed a spell, item or bot number: simulated rounds per difficulty and the adjusted win rate before → after (band 0.85 to 1.15 on Normal and Hard). Otherwise, delete this section. -->
