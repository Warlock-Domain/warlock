# src/shared — game rules (run on the server and in the browser)

Applies together with the root `CLAUDE.md`.

## Simulation

- Sandbox allied bots are opt-in: validate `ally`, derive their team from the authenticated requester and preserve Player/Wizard teams through respawn, restart and Watch/Play. Default bots stay enemies.
- Campaign reading is a transient authoritative pause until every connected human participant finishes, capped at `READ_CAP_MS` (20 s) per pause. Disconnect, spectating, restart and resume clear reader state; other modes do not pause.

- **Obstacles take every attack** (Fernando, 25/10): a new blast calls `blastPillars` (falloff by closeness, a wall hit once); a projectile that hits or bounces off an obstacle calls `damagePillar` in `hitPillar`; burning in the lava uses `damagePillar(..., quiet)`. The Campaign rock is unbreakable through `obstaclesOf`, not through a mode check in `sim.ts`.

- Closed Body preserves the current stance facing when cast; the cursor does not turn the wizard. Other spells retain their normal aiming behavior. No stat or resistance changes.

- Sand Blast (cluster) in Control: cone 3×2 m, damage 20+8/level, Incapacitate 1+0.25 s/level and Blindness 2+0.5 s/level. Independent statuses respect general resistances; no projectiles or knockback. Blindness limits vision to 3 m from the target (6 m diameter), AI included.

- Closed Body in Defense: requires Hold ground active, ends when S is released or at the limit 3.5+0.75 s/level. Reduces damage, new negative durations and new impulses by 90%; never immunity nor retroactive cleansing. Expiring while holding S preserves Hold ground.

- Geyser: target on the ground up to 10 m, area 25% smaller (radius 1.5×√0.75), lasts 2.5 s and suspends any living unit hit; invulnerable, immobile and without actions. Projectiles pass under suspended bodies, with no exception between spells.
- Heal: Support spell with a target on yourself or a living ally (of a defined team). Heals 45 at level 1 and +6 per level, range 10 m, cooldown 20 s and −1 s per level, with the general heal cap and modifiers. An invalid target does not spend the cooldown, does not cancel another action and does not reveal the wizard. Instant cast; cost 12, upgrades 6 to 11.

- AI under the Illusion veil: ready/free refuse any cast until veilUntil; movement stays allowed. Humans keep the rule of revealing themselves when using another spell. This does not declare the residual Illusion×Scourge risk on revive as resolved.
- Bot names: a catalog of seven names chosen by the user, same order in the room and in the match; it changes neither AI nor balance.
- **Draw only through the `rand: () => number` received.** Public signatures have `rand = Math.random` as default (`newWorld`, `stepWorld`, `tickMatch`); internal functions pass `rand` along. Never a loose `Math.random`. Changing the order of draws changes the hash in `tests/style.test.ts`.
- **The `World` is mutated in place** (`stepWorld` zeroes `w.events` and writes to `wz.hp`, `wz.cd`, `w.projectiles`). Do not clone. The bot is the exception: `botCmds` only reads the world and returns `Cmd[]`.
- Phase, gold and purchases live in `Match` (`match.ts`). The `World` is not written to disk (the room stores `world: null`).
- **Units:** distance in meters, time in seconds, health on the 1000 scale. Numbers from the original Warlock come in multiplied by `UNIT` (`speed: 1000 * UNIT`). `DT = 1/60`. Cooldown stored as an instant (`w.t + cd`). Milliseconds (`*_MS`, `Date.now()`) only in the match and server layer.
- **Events:** `w.events.push({ k: '...', ... })` during the step; a new type enters the `SimEvent` union and the client consumes it in `main.ts`. Secret ids become public in `publicEvents` (`snapshot.ts`).
- Illusion receives forces through the same moveWizard as the real body; copy.walk and pushVel are separate. Gravity uses body pull, Magnetize does not turn the walk, Snowball uses drag on contact and explosion only when it explodes. Moves copies before impacts so they do not gain an extra step from list order. It neither kills nor hides the copy when it takes damage.

- **Lula Pix / Squid Pix** (issue #416): the `pix` projectile is a fixed coin rain that keeps `soak` (seconds inside per wizard) until `PIX.soak`; `puppetBy`/`puppetUntil` on the target; `puppeteer` gives the living controller. `applyCmds` drops the target's own commands and repeats move, moveHold, stop and basic with the same offset; spells repeat only in `cast()` at the controller's target point (after a cast that started its cooldown, `copy` = the controller's level, no cooldown check or write). Credit goes through `actor` in `hit` and `mark`, `firstOnSegment` skips the owner's controller and `allies(body, controller)` is true (one way only), so no spell needs its own rule. One level only: a controlled wizard's own targets do not repeat copies.

- **Test versions of Attack and Hold ground** (issue #402): `Wizard.arc` and `Wizard.guard` come only from `setAlt` (shop, `alt` message) and the round start in `match.ts`; bots never set them, so the style hash stays the same. Every change of behaviour sits behind these flags (`finishArc`, `braceResistance`, the extra freeze of `basicReadyAt`); the arc restores the target's `casting` after `hit` on purpose.

## Spell and item numbers (`spells.ts`, `items.ts`, `constants.ts`)

- Meteor proposal under review: preserves damage/area and replaces knockback with duration=1.25 s at all levels. Uses the general stun block and the target's resistances; does not trigger post-knockback recovery without an impulse. Measurement/owner decision pending before integrating.

- **Items have 3 levels each** (Fernando, 26/10, issue #227) and every level costs the item price (`itemPrice`); a new item gets 3 levels. Level-based constants of an item are arrays indexed by `level - 1` (`SHOCK_BOOTS.secs`, `WIND_BOOTS.calm/speed`).
- **The Scourge is an item that fires through the spell path** (26/10, #227): its level lives only in `items.scourge` (free level 1 from `startItems`), `newWorld` and `refit` copy it into `wizard.spells.scourge`, and `priceOf('scourge')` is always `null`. Lists of spells a player can own use `BAR_SPELLS`; cast, cooldown and snapshot code keep `SPELL_IDS`. Do not "fix" the copied level back into `player.spells`.
- 7 levels via `L({...})`; irregular series with `zip([...], [...])`, linear ones with `steps(de, passo)`.
- A balance adjustment stays **inline over the original number**, with a date and measurement comment: `cd: cd * 0.7 /* 18/10: … (0,86 → 0,97) */`.
- An extra mechanic constant becomes an object `NOME = { … * UNIT }` below the table, with the source `.lua` file in the comment. No magic numbers loose in `sim.ts`.
- A number only changes with simulator measurement (see root).
- **Body radius:** `Wizard.r` (read through `bodyR`) is the body when it is not `WIZ_R`; only the Campaign boss sets it (`ODRAN.size`). Collisions, projectile hits and blasts against a wizard use `bodyR` of that wizard; a new check of "touching a wizard" uses it too, so the PvP hash stays the same.
- **The Campaign uses the core numbers** (Fernando, 24/10): no spell table, constant or friendly-fire rule of its own; spell numbers come from `SPELLS` via `spellLevel`, in every mode. A Campaign need is met by a core rule or discussed in an issue first.

## New spell: where to touch

`spells.ts` (`SPELL_IDS`, `SPELLS` with `name`/`en`, `CAST_POINT`) · `sim.ts` (`PROJ_KINDS` **at the end of the list**, branch in `cast()` and projectile behavior) · `snapshot.ts` (only if new state is needed, such as a bit in `bits`) · `bots.ts` (group `DAMAGE`/`ESCAPE`/`CONTROL`/`SITUATIONAL` and specific use; the purchase test in `difficulty.test.ts` flags a spell outside the groups) · `match.ts` (`DEFENSE` if it is a defense) · client: `icons.ts`, `keys.ts`, `main.ts` (`SPELL_SOUND`), `rules-text.ts` (group, use, rules, tips in both languages), `tips.ts` (`SPELL_ROWS`), `demo.ts` (`SCRIPTS`), `scene.ts` (`LOOK` if it is a projectile). The `ui-data`, `grimoire-demo`, `i18n` and `new-spells` tests flag whatever is missing.

## Protocol (`protocol.ts`)

New client message: variant in `ClientMsg` → `case` in `parseClientMessage` that returns `null` on any doubt, using `isObj`, `coord`, `seq`, `pubId`, `isSpell` → return the **rebuilt** object with known fields, never the raw one → input object with allowed keys only (see `parseOpts`, `parseSandbox`) → respect `MAX_MSG` → branch in `room-do.ts` and a test in `tests/protocol.test.ts`. Resource reports (`resources`) must have bounded numeric values and remain optional telemetry, never gameplay input.

## Snapshot (`snapshot.ts`)

- Shield proposal: blocks damage and takes 60% of new impulses and stun/root/slow durations. `statusDuration` decides at the moment of impact; activating later does not recompute prior effects. General protection, not an exception between two spells. No Meteor change in this PR.

- Post-knockback recovery (`kr`) only starts when a physical impulse crosses STUN_SPEED: zeroes the residual and resumes 50→100% in 1 s, +10 pp/0.2 s. Ending a stun without an impulse does not trigger recovery; a dedicated test covers this separation. The client rereads kr only from a new snapshot, never per frame.

- Proposal under review: `stunLeft` is an action-block clock separate from physical speed (`st` in the snapshot, -1 uses the old rule). `castBlocked` blocks everything under stun and only Mobility spells under Grip. Changes neither Meteor, Shield nor the speed recovery rule at this stage.

- Historical damage does not amplify knockback (`KNOCK_HP_SCALE=0`); it is still recorded for statistics. `WALKING_BIT` only marks a valid voluntary destination; physical displacement/reconciliation does not animate walking. The right button does not stay stuck after blur/pointercancel.

Flattened lists of numbers (layout in the `protocol.ts` comment), values with `r2`, optional fields only when there is content, new per-wizard state as a documented bit in `bits`. Inserting in the middle of `PROJ_KINDS` breaks an open client.

## Appearance (`characters.ts`)

The appearance code stores the **position** of each option (7 digits, one per piece), and it is saved in the browser and in rooms. A new option goes **at the end** of the piece's list; an option that leaves stays in place and becomes retired (`isRetired`): `decodeLook` swaps it for another (the hooded Rogue becomes Rogue + Hood, issue #107), the creator and the draw skip it. Every code input goes through `fixLook` (browser in `savedLook`, message in `parseClientMessage`, stored room in `resume`).
