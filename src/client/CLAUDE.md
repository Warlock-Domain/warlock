# src/client — browser (Three.js + DOM interface)

Applies together with the root `CLAUDE.md`.

## Interface

- `RoomLoadingGate` owns room startup readiness (scene, joined room, required snapshot). Its settings-independent cat overlay hides HUD/labels/scene and disables gameplay input until ready; when ready the overlay is detached, not hidden, because Esc, the controller and the taunt wheel treat any `.overlay` in the DOM as open.
- Casting settings clone only the existing skills markup, without portrait or gameplay listeners. `SettingsCtx.castingHud` owns mount/release of this settings-only preview; never move the live HUD. `castModeControl` uses the same effective-mode resolver as keyboard input, with individual > key > global precedence; Heal and Inelegant Solution stay click-only and take no preference. Passive item preferences save future intent only. Individual spell/item lists stay expandable.

- Closed Body keeps its local effect aligned with the current stance, without a cursor aim line. PT/EN descriptions and the off-axis demo explain the preserved facing.

- Blindness: vignette anchored to the ground by the affected player's 3 m radius, not by the camera; hides entities and labels beyond the limit. Text-only status chapter in the Grimoire; Sand Blast has its own PT/EN sheet and demo under Control.
- Closed Body darkens cloned materials and restores them when it ends; own sounds at start/end confirmed. Recordings provided by Leonard, declared CC0, respect the mixer/distance.

- Geyser under Support: aims at the ground like Grip; the blue jet lifts the target and blocks prediction/commands during the suspension. Sheet and PT/EN demo follow the shared stats.
- Heal: the key or the bar selects and a click on the model confirms, in any cast mode (Quick or On release). Clicking the ground does not heal; an invalid target keeps the selection, and Esc, S or the right button cancel. On the controller, with the right stick released, it heals yourself (`padTarget`). The 1.5 s green aura and the synthesized choir play on the confirmed event, with the mixer and distance. PT/EN texts, sheet, demo and own icon follow the numbers.

- **DOM always with `el(tag, props, ...children)`** from `icons.ts` (`on*` becomes a listener, `class` becomes `className`, a `null`/`false` child disappears). Do not create another DOM helper. Icons: `icon(id)` with `ICON`, `ITEM_ICON`, `UI_ICON`.
- **Spell groups** (`SPELL_GROUPS` in `rules-text.ts`, colour in `.g-<group>` in `style.css`): Support (green) shows up even when empty and Mobility is gold (decision of 24/10, PR #343); `searchFilter(..., keepEmpty)` keeps the empty group visible without a search, so the player sees the category exists before its spells.
- Reuse `choice(...)` from `icons.ts` (button group with `aria-pressed`), `tabs<T extends string>(label, list, on, set, cls = 'stats-tabs', role = 'tablist')` from `ui.ts` (ARIA tabs; pass `null` for both `label` and `role` when a parent owns the tablist), and `withTip(element, () => html)` (tooltip on hover and focus).
- **Icon-only button (✕, ⋯, ‹ ›, gear) only with `iconButton(child, name, onclick, props?)`** (`icons.ts`): the name becomes `title` and `aria-label`; `props` overrides (`class: 'icon wide-only'`, `title` with the key, `aria-expanded`, `hidden`). A look different from the ✕ only through the class: `kick` (small and red) and `info-close` (corner of the ⓘ).
- **Dialog over the screen only with `dialog(cls, title, body, { ico, onKey, onClose })`** (`ui.ts`, issue #110): backdrop `<cls>-overlay` (layer and mobile in the CSS), header `.dialog-head` with title and ✕; ✕, click outside, Esc and the controller's B close it. It holds all keys in the capture phase (nothing reaches the game); `onKey` sees each key first and, with `preventDefault`, Esc does not close. Returns `{ overlay, close }`; initial focus on the ✕ (the caller may change it). Interface standardization with plain-DOM functions, one per PR (decision of 20/10, issue #91).
- **Search by name only with `searchFilter(groups, item selector, text, off?)`** (`ui.ts`): hides the items whose `data-name` (stored with `norm`) lacks the text and the empty groups; `off` hides whole groups (filter). Used in the Library (the Shop was left without search, Fernando's request of 21/10).
- **Drag to swap slots only with `draggableSlot(node, index, occupied)`** (`ui.ts`): up to 6 px counts as a click; beyond that, a `.drag-ghost` with the slot's icon follows the mouse and the slot under it gets `.drop-target`; on drop, `moveLoadout` swaps the positions. Used in the bottom bar, the only one that reorders spells: on desktop it stays visible in the Shop too (`SHOP_BAR`, the same cut as `.compact-shop`), and the Shop ends above it (`--bar-space`); another list that reorders by dragging reuses the two classes instead of creating another look (PR #197).
- **Saved builds in the Shop** (`buildsBox` in `shopPanel`, issue #185): collapsible box that reuses `details.sheet-box` and `.keys-row`; the ★ badge of the most bought is the `.key` dot with the `.fav` variant. The logic (Use queue, broken save, count) lives in `screen-data.ts`, with a test.
- **Messages received only after decoding**: `net.ts` receives `unknown`, handles invalid JSON and calls the channel's decoder (`net-message.ts`) before dispatching. Room messages use `parseServerMessage`; the lobby uses `parseLobbyMessage`. Preserve the compact `snap` vectors without copying and validate their lengths in one pass.
- Room state follows the strict `PublicRoom` contract: reject malformed messages instead of delivering partially validated state and log one warning per message type and connection. Test `publicRoom` examples in all modes when changing this boundary; do not reconnect automatically on a schema error, since the same server version would repeat the rejection.
- **Campaign minimap** (`minimap.ts`, 25/10): the only canvas on the HUD (`.minimap`, top right), drawn by `drawMinimap` with the `:root` colors at most every 100 ms; `seenRooms` decides the explored rooms, and the scene's per-room fog lids use the same list. A new map view reuses both instead of drawing its own.
- **Player preference only through `store`** (`store.ts`): `store.get`/`set`/`json` already have try/catch and fall back to memory. `json()` returns `unknown`: decode once when loading each format (`train.ts`, `mimic.ts`, `screen-data.ts`, `challenges.ts`, `keys.ts`); common validation pieces live in `saved-data.ts`. Never `localStorage` directly. Keys with the `warlock:` prefix.
- **Lean menus** (Fernando's decision): before putting a new option on a screen, ask whether it needs to exist.
- **Game logo as an image:** `public/warlock-wars.svg` (the W with the golden frame from the group photo, vector, independent of the font) → `el('img', { src: '/warlock-wars.svg', alt: 'Warlock Wars' })` or `<img src="/warlock-wars.svg">`. It is also the tab icon. Generated by `scripts/assets/favicon.py` (with `favicon.ico` and `apple-touch-icon.png`); do not edit by hand.
- New home menu tab: tuple in `HOME_TABS` + key in `HomeTab` + panel in `panels` with `panel(...)`. Heavy content loads on demand (`void import('./grimoire.ts')`).
- **Taunt wheel** (`radialPicker`, `radial-picker.ts`, PRs #239/#238/#240): buttons around a centre that cancels, built with `el`/`iconButton`; mouse, arrows, numbers and analog stick choose through the same index (`radialIndex`). The math and the held key (`radialHold`) live in `taunt-wheel.ts`, without DOM, with a test. It has eight positions (`TAUNT_WHEEL_SIZE`, PR #261), the same in Settings and in the match; all the lines in `TAUNTS` (23 today, 8 text-only with emoji, no audio) stay in the catalogue to fill those positions, and a new line goes into the catalogue, not onto the wheel. The preference (`warlock:taunt-wheel`, `tauntWheelSlots`/`assignTauntSlot`, edited in Settings → Communication) migrates the old wheel preserving the first eight valid choices; choosing a line already equipped swaps the positions, choosing another replaces only the slot. The wheel rereads the preference on opening and the server always receives the catalogue index. Numbers 1 to 8 choose the positions; 9 and 0 are consumed while the wheel is open so no spell is cast underneath. `{ inline: true, hint }` embeds the same wheel in Settings (without opening over the match and without choosing by focus alone); `setLabels` swaps the labels.
- Guide audit: sheets use `n2` (hundredths) only on the Meteor's delay and stun, the rest `n1`; `knockDistance` uses the damping/soft-cap/cut of `moveWizard`, with no amplification by historical damage. Scripts demonstrate stun/Grip blocks, Shield against area/reflection, Blast collisions and Illusion trajectories. `demoStatus` reads real states. An instrumented canvas does not replace visual inspection in the browser.
- Grimoire: `MECHANIC_GUIDES` contains Attack/Hold ground with previews; `NEGATIVE_GUIDES` contains nine independent statuses, text-only and with no spell/demo attached. The statuses appear only in the book; Attack and Hold ground are also in the library ("Ações fixas" section, the first) and on the match bar, at the start of the bottom row (Q W E R on top, A S D F below: `fixedBtns` come after the first 4 positions in `refreshEquipment`, class `.fixed-skill`, dimmed and `aria-disabled`, they only show the `mechanicTip` tip with a demo; issue #401). Icons in `MECHANIC_ICON` (`icons.ts`), reusing the sprite; outside the Shop. Normal opening starts at the table of contents, without persisting the page; explicit ability links stay direct. Recovery 50→100% lives under Knockback.
- **The Grimoire lives in the Learn tab** (Fernando's requests, 24/10): `grimoire({ side, onShow })` returns the loose book (`root`, `contents`, `goTo`, `onKey`, `dispose`); the match puts it in a dialog (`openGrimoire`, with the table-of-contents pages) and the Learn tab mounts `.learn-grid` with three areas: the side table of contents (`contents`, reuses `.settings-toc`, chapter in view with `.on`), the book without the 2 table-of-contents pages (`side`: starts on page 3, Home and ‹ stop there) and the library, where `onShow` marks the open spell or item with `aria-current`. The tab widens up to 2400 px (`.lobby:has(...)`); from 1800 px the columns sit side by side at screen height, below that the library drops below the book. `showRules` and F2 decide by the menu on screen: with it, they switch to the tab (F1 on the first page, F2 on the library search); without it, they open the dialog. The demo only pauses with the tab hidden (`[hidden]`) and stops when the book leaves the DOM.

- **Test versions** (issue #402): the shop's `altBox` (two `choice` rows) sends `act.alt`; with the melee arc the attack key swings at once toward the cursor (`meleeArc` in `input.ts`) and `scene.arc` shows the 120° sector during the windup from a local timer (`arcPreview`), not the snapshot. Gesture by weapon in `meleeAnim` (`scene.ts`); guard pose is the `Block` clip. The fixed A and S buttons keep their look; `mechanicTip(g, alt)` (`tips.ts`) swaps to the active version's text and numbers.

## Connection lifecycle (`net.ts`)

- `Connection<T>` owns its socket, reconnect timer, heartbeat, visibility listener, and parser warning state. Keep that state private and specific to the instance.
- `connect()` remains the entry point for lobby and room callers. Its `send` and `stop` callbacks stay bound to the instance; `stop()` is terminal and idempotent, including when browser events are already queued.
- Preserve socket identity guards when replacing a connection. Lifecycle regressions live in `tests/net-lifecycle.test.ts`.

## Character preview (`avatar.ts`)

- `AvatarPreview` owns the renderer, camera, current appearance and visibility-aware frame loop. `avatarPanel()` lazily creates one instance and reuses its panel across Wardrobe and Settings, keeping one WebGL context for the browser session.
- Its observer and visibility listener live as long as that shared panel. Hiding or detaching the panel pauses animation and rendering; remounting must not create a second frame loop. Keep the visibility-aware RAF scheduler so hidden previews do no work.
- Wardrobe layout (issue #204, proposal A): a 300×400 preview on the left; each piece is a row of thumbnails (`.avatar-tile`, reusing `.avatar-preset`) showing the portrait of the character the option comes from (the Hood shows the hooded Rogue, ∅ for none), the chosen one with `aria-pressed` and a gold border; presets sit in one row with Random beside them. No new UI piece: plain buttons, `:root` variables.
- Replacing the appearance calls `disposeAppearance` for its owned materials, skeletons and mixer. Cached source geometry and textures remain shared with the match. Ignore asynchronous loads for a look that is no longer selected.

## Controller input (`gamepad.ts`)

- `Pad` owns button edges, aiming, menu focus, capture and rumble preferences. The exported functions delegate to one browser-session instance; `main.ts` calls `startPad()` once to install its input listeners and frame loop.
- Room input registers its current callbacks through `setPadGame()`. Preserve button-release handling during remapping and taunt selection so the scoreboard cannot stay held and menu actions cannot cast or move.

## Movement prediction (`predict.ts`)

- `MovementPredictor` owns predicted movement, snapshot identity, queued input, cast holds, dash/stun/death transitions, RTT smoothing, and Campaign terrain/room-lock configuration.
- Keep `createPredict()` and its bound public callbacks compatible. `reset()` clears transient movement and input state while preserving RTT and map configuration.
- Use the shared movement/collision helpers and preserve transition order. Read authoritative residual velocity once per new snapshot; repeated render frames must not renew an impulse. Prediction/reset, obstacle, dash, suspension, and recovery regressions cover this boundary.

## Language

- All visible text with `t('português', 'English')` (`i18n.ts`). Names through `spellName`, `itemName`, `arenaName`; item texts through `itemText`; numbers with `LOCALE` (helpers `n1`/`pct`).
- The language is read once on load (`setLang` saves and reloads), so text lists can live in module constants.
- Long rules texts live in `_PT`/`_EN` pairs in `rules-text.ts`. Server errors arrive in Portuguese and are translated by `SERVER_EN` (`main.ts`).

## CSS (`style.css`, single file)

- Colours and sizes come from the `:root` variables (`--lava`, `--gold`, `--bronze`, `--panel`, `--fg`, `--r-md`…). No loose hex, except the group colour and the Grimoire leather and pages (`.grimoire`, `.g-book`).
- Font sizes, `gap` and single-value `padding` come from the `:root` scale (`--fs-90` = `.9rem`, `--sp-8` = `8px`; named by value, issue #141): a new rule uses the nearest step instead of inventing a size. Moving an existing size to another step changes the screen and is Fernando's decision.
- Group colour: `.g-ataque`, `.g-mobilidade`, `.g-defesa`, `.g-controle` (variable `--g`); silver items (`--item`). The class comes from `spellClass(s)` by position in `SPELL_GROUPS`: a new spell gets its colour by joining a group, with no new class. In the Shop, Library and Grimoire, items sit in sections by `ITEM_GROUPS` (`rules-text.ts`, same format, all silver, no group class): Head, Cape, Clothing, Footwear and Accessory, a display grouping only, with no equipment slots (PR #427). A new item joins a group, otherwise it vanishes from the Shop (test in `ui-data.test.ts`).
- Mobile (out of focus since 20/10: do not check on every change, just do not delete these rules): `(max-width: 600px)`, `(max-height: 500px)` (landscape), `(pointer: coarse)` with 44 px targets, `(max-width: 860px)` / `(min-width: 861px)`. Hover only inside `(hover: hover)`. New animation with `(prefers-reduced-motion: reduce)`. In JS, `TOUCH` (`ui.ts`).

## Keys (`keys.ts`)

Taunts on the controller: ← by default, remappable; if an old preference already occupies ←, it picks a free button without overwriting. Routing in `gamepad.ts` opens the wheel (the interface button), the analog stick points via `radialIndex`, the d-pad moves ±1 per tap, A/✕ confirms, B/○ or Start cancels. While open it sends no movement or spell; it reuses the current interface button and send.

`DEFAULTS` uses `event.code` (`'KeyQ'`, `'Digit1'`, `'F1'`), never `event.key`. A new interface action goes into `UI_ACTIONS` and `UI_NAMES` (`''` = no key). Esc, Enter, Space and ← → are reserved. All 26 letters already have an owner.

Keys by position (default): spells use the key of the **position** on the bar (`POS_ACTIONS`: Spell 1 to 6 on Q W E R D F, stored in `warlock:poskeys6`, issue #401; the `warlock:poskeys8` of the 8 positions from 21/10 is migrated once (`migratePositions`): the old 5 to 8 become the new 1 to 4, the old 1 to 4 (numbers) are dropped, D F stay at the default, and a key that collides with A, S, another shortcut or another position goes back to the default only for that position; the old key is never deleted; no active items since 21/10, #217); `keyOf`/`actionFor`/`whoUses` already resolve the mode. The order of positions comes from `loadoutSlots`/`moveLoadout` (`screen-data.ts`, stored in `warlock:loadout-order`) and reaches the keys and the controller through `setSlots`; an empty slot is `null`. Positions and interface shortcuts never repeat a key (`setKey` swaps). Changing any key pins the mode in use in the browser.

## Settings page (`settings.ts`)

- `SettingsPage` owns the sections/body, table of contents, responsive media listener, `IntersectionObserver`, highlight hold, and `fill`/`jump`/`dispose` lifecycle. `settingsPage()` and `openSettings()` keep the home-versus-dialog coordinator outside the page and retain their existing entry points.
- `dispose()` is idempotent, disconnects observed section nodes, removes the media listener, and makes queued observer callbacks inert. Dispose the old home page before replacing it and the modal page when the dialog closes. Field redraw restores focus by stable ID; keep IDs unique because home settings and the dialog are never shown together.
- A page receives whether it is the home page: in the lobby, the Character section links to the single `avatarPanel` WebGL preview; in the match, it renders that section directly. Section content stays in `SECTIONS` and its existing builders; `null` continues to hide match-only effects in the lobby.
- Sound has four persisted volumes: master multiplies SFX, music and taunts. `channelVolume` and `isAudioMuted` centralize mixing and mute state. Master starts neutral in the migration; taunts inherit SFX once, and private previews respect master × taunts. The same sliders work in home settings and the match dialog.
- Sound sliders use required `volumes`/`setVolume` callbacks from `SettingsCtx`, supplied by the current lobby or room `createSound()` instance. Persisted preferences intentionally survive page replacement.
- Each `createSound()` call returns callbacks backed by a private `AudioPlayer` instance. The player owns its lazy context, routing nodes, decoded and normalized buffers, music element, volume snapshot, ambience intent, and ducking state. Keep callbacks safe when detached; preferences remain persisted through the shared `store`, while runtime resources and caches stay per player.
- `TauntPreviewSession` owns the private preview element, Web Audio context cleanup, current request identity, and fallback/Web Audio volume mode. Keep `previewTaunt()` and `stopTauntPreview()` as compatibility adapters; route live master/taunt volume changes through the session. A stale download or decode must not play, stop, or close a replacement preview. This session does not own in-match playback or the `createSound()` cache.

## Scene (`scene.ts`)

- `proj-models.ts` contains stateless projectile and vine factories. Each call creates resources owned by the requesting scene; keep disposal in the scene's existing teardown paths rather than disposing shared appearance assets or adding module-level mesh caches.

- `resourceStats()` exposes Three.js geometry and texture counts for low-frequency telemetry. These are resource counts, not GPU memory in bytes; keep collection outside the render loop and do not add listeners or timers that outlive the room.

- Simple destruction (`clash/pulse`) enlarges only the explosion/wave at the projectile's point, without changing the Lightning beam, range, damage or collision.

- `cloneAppearance` keeps the colours/textures of the Wardrobe assembly in the match; the slot colour stays on the ring/bar/name, without tinting clothes. It clones materials/skeleton, shares geometries/textures. When swapping the preview, dispose only its own materials.

- Damage numbers do not appear over targets hidden from the observer. The spell's public impact remains. `main.ts` passes the hidden targets through the event/replay snapshot and the Sandbox vision option, without depending on the previous interpolated pose.

- **Pixel art** (`setPixel`, issue #79): swaps the `RenderPass` for the `RenderPixelatedPass` (blocks of `pixelSize` px: 2 or 3, 0 turns it off). In this mode the camera sits farther back at a lower angle (`camK`) and is snapped to the grid; the remainder slides the canvas and the names (`pixelShift`). Whoever touches camera positioning keeps both, otherwise the floor starts shaking again. PC only (it needs the `EffectComposer`, which mobile does not create); the choice is stored in `warlock:pixel` (`savedPixel`).

## What does not go into `ui.ts`

- **Sound distance:** `sound-distance.ts` computes attenuation from the player's own wizard position, not the camera (full intensity up to 2 m, quadratic falloff to silence at 24 m). `main.ts` applies it to world events and manual taunts; music, menu and global notices do not depend on distance. The taunt requeries the position after loading the audio. A spectator without a wizard uses a neutral level of 0.6; a missing source produces no sound.

- **Audio levelling:** `audio-level.ts` measures RMS in active 50 ms windows, aiming for 0.12 with a peak up to 0.8. `sound.ts` measures files and pre-rendered synthesis, compensates impact layers and keeps the taunt preview at the same level as the match. Immediate synthesis remains as a fallback until the cache is ready; human listening checks are still necessary.

`ui.ts` uses `document`/`matchMedia` on load and does not run in Vitest. A screen decision that needs a test goes into a pure function in `screen-data.ts` (or `rules-text.ts`, `tips.ts`, `icons.ts`, `keys.ts`, `sheet.ts`, `reach.ts`, which do not touch the DOM on load).

## Aim preview (`aim-preview.ts`)

- `AimPreview` owns the ground meshes of aiming: range ring, area circle, hit bands, sand cone, melee arc, target lock and controller reticle. `createScene` builds one and exposes it as `scene.preview`; `main.ts` feeds it every frame.
- What a spell shows comes only from `aimOf`/`blastOf` (`reach.ts`, pure and tested) through `preview.shape(...)`: a new spell shape goes there, never as a spell-name branch in the scene. The area circle is read from the data (range + radius and it does not fly), so a new area spell gets it without touching a list.

## Snapshot interpolation (`interp.ts`)

- `SnapshotInterpolator` owns a bounded snapshot buffer, its capacity, and the smoothed server/local clock offset. Live rendering and replay use independent instances through `createInterp(max)`.
- Preserve bound `push`, `latest`, `sample`, and `reset` callbacks. Reset clears history and clock offset; simulation clock rollback also starts new history. Keep interpolation math and `keepLast()` as module helpers.
- Preserve snapshot references, interpolation delay/smoothing, and replay limits. Compatibility, round-reset, capacity, and instance-isolation coverage lives in `tests/client.test.ts`.
