# Forum sound lab — design

Steps 4 to 6 of the forum plan (issue #366): the page where members try each spell's sound effects in a local mini arena and vote for the best one. Builds on GitHub sign-in (PR #404). Decisions are Fernando's from the 25/10 grill unless marked **(builder's call)**.

## Intent

The 30 spells reuse a handful of sound effects (`SPELL_SOUND` in `src/client/main.ts`). The group picks a better cast and impact sound per spell by trying candidates while playing, not by reading file names.

## Decided by Fernando

- **Complete, with votes** (25/10): votes, tally and comments stored on the server, members only (the PR #404 login; testers on PR environments).
- **R2 bucket now** (25/10): the 532-sound pack (`assets/sons-rpg`, converted to mp3) and member uploads live in R2. Two buckets: live and PR environments.
- **New local mini arena, no server** (25/10, chosen over reusing the sandbox): the game's simulation (`newWorld`/`stepWorld`) and 3D scene (`createScene`) run in the browser; the player's wizard and a dummy that takes hits and knockback and comes back from the lava; game controls; no cooldown.
- **Two moments per spell**: cast (today `SPELL_SOUND`) and impact (today one generic hit sound by damage; per spell from the `src` of the `hit` event, no simulation change). Impact only for spells that hit.
- **Candidates**: the current sound is always an option; members add any file from the pack or upload their own (mp3/ogg/wav, up to 1 MB and 5 s). The AI's 3–5 suggestions per spell wait for the AI API (step 3, Fernando 25/10).
- **Voting**: one vote per person per spell and moment, changeable; the tally appears after you vote; open until Fernando confirms a winner.
- Portuguese and English via `t()`; light forum theme (`--fm-*`).

## Builder's calls

- **Data** in the `Forum` Durable Object (SQLite):
  - `sound_candidates(spell, moment, src, by_id, by_name, at)`, primary key `(spell, moment, src)`. `src` is `pack:<path>` or `up:<id>.<ext>`; the current sound is the implicit `game` and has no row.
  - `sound_votes(spell, moment, user_id, src, at)`, primary key `(spell, moment, user_id)`: one vote per person, an upsert changes it.
  - `sound_comments(id, spell, user_id, name, avatar, text, at)`.
  - `sound_winners(spell, moment, src, by_name, at)`, primary key `(spell, moment)`: a row closes the vote for that pair.
  - No AI column yet: step 3 adds the AI tally with the AI API.
- **Routes** under `/api/forum/sons`, all members only, POSTs with the Origin check of PR #404:
  - `GET /api/forum/sons` → candidates, my votes, tallies only for spell+moment pairs I voted on, comments.
  - `POST /api/forum/sons/candidato` `{spell, moment, src: 'pack:…'}` (the pack file must exist in R2).
  - `POST /api/forum/sons/envio?spell=&moment=` raw audio body (`audio/mpeg|ogg|wav`, ≤ 1 MB) → R2 `up/<random>.<ext>` + candidate row. The server checks size and type; **the 5 s limit is checked in the browser** (`decodeAudioData`) before sending, which a hand-made request can skip. Caps of 30 uploads per person and 300 in all (on PR environments every tester sign-in is a new person), checked in the Durable Object with the insert; a refused upload is deleted from R2 again. Uploads to a closed vote are refused.
  - `POST /api/forum/sons/voto` `{spell, moment, src}` (src must be `game` or an existing candidate).
  - `POST /api/forum/sons/comentario` `{spell, text ≤ 1000}`.
  - `POST /api/forum/sons/vencedor` `{spell, moment, src | null}`, admins only: confirms a winner (closes the vote) or reopens it.
  - `GET /api/forum/sons/arquivo/<key>` streams from R2 (pack and uploads), members only, cached privately.
- **Pack**: `scripts/assets/sound-pack.mjs` converts the 532 wav files to mono mp3 with ffmpeg, measures duration with ffprobe, writes `pack/index.json` (path, category, seconds) and uploads everything with `wrangler r2 object put`. Run by hand once per bucket; nothing enters `public/` or git.
- **R2 binding** `SOUNDS` in `wrangler.jsonc` (bucket `warlock-sons`); `pr-env.yml` swaps it for `warlock-sons-pr`, as it swaps the Worker name.
- **Game hook**: `sound.ts` gains `playUrl(url, volume)` (same decode cache and volume chain). The arena calls it for the chosen candidate; the live game does not change.
- **Arena**: a module on the forum page (`src/client/sound-lab.ts`), loaded only when the person opens the lab (dynamic import keeps Three.js out of the forum's first load). Circle arena, the player with their saved look, one dummy; right click moves, left click or Q casts the spell being tested at the cursor, S stops and holding S is Hold ground (Closed Body needs it); every spell at level 1, cooldowns cleared each step; dead dummy or player respawns.
- **Winner panel** (Fernando, 25/10: in this PR): an admin sees a Confirm button next to each candidate and a Reopen button on a closed pair. Admin = the org role `admin` from the same membership call at sign-in (today only Fernando, the org's single Owner), kept in the signed session. On PR environments every tester is an admin, so the panel can be tested there (the data there is throwaway).
- **Out of this PR**: AI suggestions and AI tally (step 3), shipping winners into `public/sfx/`.

## Fernando's part

Create the two R2 buckets (`warlock-sons`, `warlock-sons-pr`) in the Cloudflare account, then run the pack script for each. The code ships before that; without the pack, the page shows only the current sound and uploads.
