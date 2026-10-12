# Immersion HUD and World Logic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Immersive Worlds 2.1.0: a floating corner HUD (scene, people, items, map) that shows only what the user's character perceives, on top of code-enforced routes, travel time and per-person state.

**Architecture:** Pure logic stays node-testable: `rules.js` (routes, paths, time, travel), `senses.js` (perception → HUD view model), `engine.js` (schema v3, patch, prompts). `hud.js` is the only new DOM module; `index.js` wires state → `perceive()` → `renderHud()`.

**Tech Stack:** SillyTavern 1.18+ extension, vanilla ES modules, Font Awesome 6 (bundled), node:assert tests, no build step.

**Spec:** `docs/superpowers/specs/2026-10-12-immersive-hud-design.md` (mockup beside it).

## Global Constraints

- SillyTavern ≥ 1.18, tested on 1.19.0; no new dependencies; no emoji in shipped UI; theme CSS variables only.
- `kit.js`, `llm.js` and the kit block of `style.css` stay byte-identical to Immersive Adventures; HUD CSS goes after `/* ==== end of shared kit ==== */`.
- STATE_KEY unchanged (`immersive_worlds_state_v1`); STATE_VERSION 3; v2 saves load silently.
- Injection ≤ 800 chars for the test world; director prompt ≤ 3,500 chars.
- Never write the user's thoughts/feelings; the user's tracked state is wearing/position/condition/holding only.
- Version 2.1.0 in `manifest.json` and `index.js` (`VERSION`); a test enforces they match.

## Review Focus

1. A world with no routes at all (blank Start world, one place): HUD shows the scene and "no paths yet", travel refuses politely, nothing throws. → test in Task 1 (`shortestPath` null) and Task 5 (`perceive` with one location).
2. The director names a place that does not exist or is unreachable in `move_to` / an NPC `locationId`: nobody moves, the rejection is logged. → tests in Task 2.
3. Unnamed strangers: the HUD and toasts must never print `name` when `nameKnown` is false in `senses` mode, including in departures. → test in Task 3.
4. Very narrow or pinned-drawer layouts: HUD side hides instead of overlapping chat or drawers. → manual E2E check in Task 6 at 1280 px with the right drawer pinned.
5. Swipe/regenerate after a Go or Peek: state rewinds with the turn snapshot like 2.0.0; HUD repaints from the rewound state. → E2E check in Task 7.

---

### Task 1: `rules.js` — routes, paths, clock, travel

**Files:** Create `rules.js`; Test `tests/selftest.js` (append).

**Interfaces — Produces:**
- `SENSES = ['open','door','none']`
- `worldMinutes(clock) -> number` (minutes since day 1 00:00)
- `defaultRoute(a, b) -> {minutes, sense}`: both indoor (type matches `/room|hall|kitchen|bed|bath|living|cellar|attic|office|study|interior|house|home|apartment|corridor|stair/`) → `{1,'door'}`; both outdoor (`/street|road|square|plaza|market|field|camp|forest|wood|park|garden|yard|dock|harbor|beach|river|trail|path|courtyard/`) → `{10,'none'}`; otherwise `{2,'door'}`.
- `normalizeRoutes(locations) -> void`: every connection gets `routes[id] = {minutes:int 0..1440, sense}`, both directions identical (the side that already had a route wins), unknown ids dropped, `connections` rebuilt from `routes` keys.
- `routeOf(state, fromId, toId) -> {minutes, sense} | null`
- `shortestPath(state, fromId, toId) -> {path: string[], minutes: number} | null` (Dijkstra; `path` includes both ends).
- `capMinutes(minutes, jump) -> number`: 0..90 normally; 0..720 when `jump` ∈ `sleep|wait|travel|montage`.
- `sendNpc(state, npc, toId) -> 'arrived'|'en-route'|'no-route'`: uses `shortestPath`; 0-minute paths arrive; else sets `npc.travel = {to, eta: worldMinutes(clock) + minutes}`.
- `tickTravel(state) -> string[]` (ids that arrived): clears `travel` and sets `locationId` when `eta <= worldMinutes(clock)`.

- [ ] Step 1: tests `routes are symmetric and typed`, `shortest path sums minutes across hops`, `no path returns null (single-location world)`, `capMinutes caps 90 / 720 with jump`, `sendNpc puts far people en route and tickTravel lands them at eta`, `unknown sense coerces to door`.
- [ ] Step 2: run `node tests/selftest.js` → new tests FAIL (import error).
- [ ] Step 3: implement `rules.js` (pure, no imports except `slug` from engine is not allowed—define nothing that imports engine; engine imports rules).
- [ ] Step 4: `node tests/selftest.js` → all pass.
- [ ] Step 5: commit `feat(rules): routes, travel time, en-route people`.

### Task 2: `engine.js` schema v3 and logical patching

**Files:** Modify `engine.js` (normalizeState, baseWorld, applyPatch, travel, passTime/enforceRoutines); Test `tests/selftest.js`.

**Interfaces — Consumes:** Task 1. **Produces:**
- Location adds `routes`, `visited:boolean`, `sound:string`, `soundTick:int`. `discovered` = known to the user.
- NPC adds `body {restraints,wearing,position,condition}`, `mind {mood,wants,toward}`, `holding: string[≤6]`, `tags: string[≤3]`, `known`, `nameKnown`, `seenTick`, `travel {to, eta} | null`. v2 NPCs migrate with `known = nameKnown = true`.
- `player` adds `body {wearing,position,condition}`, `holding: string[≤6]`. Items may have `ownerId: 'player'`.
- `scene` = `{ambient, now, arrived: string[], left: [{id, toward}], note, peeked: string[]}`.
- `applyPatch(state, patch, policy)` new rules:
  - `move_to` resolves via `shortestPath`; unreachable → ignored + `state.meta.rejected.push(reason)` (array, last 10, for the debug log). Charged minutes = `max(capMinutes(patch.minutes, patch.jump), path.minutes)`.
  - NPC `locationId` changes go through `sendNpc` after the clock advances by the charged minutes (people moved by the patch whose path ≤ elapsed arrive).
  - New items: `locationId` forced to here unless `ownerId` is `player` or a person here. New NPCs: placed here unless their `locationId` is an existing, already-known place (mentioned people). New locations: always connected to here.
  - `body/mind/holding/tags` accepted only for people here (after moves); `patch.you` → `player.body/holding`; `patch.sounds {locId: text}` → `sound/soundTick` for door-adjacent places; `patch.now` → `scene.now`; route fields in `locations[].routes` merge then `normalizeRoutes`.
  - `scene.arrived/left` computed from the present set before vs after (empty `arrived` when the user changed place); `scene.peeked` and `scene.note` cleared.
  - Routines call `sendNpc` instead of teleporting; `tickTravel` runs after every clock advance.
- `travel(state, idOrName) -> string` charges `shortestPath` minutes, marks path places visited+discovered, sets `scene.note = "{{user}} walked to X (N min)."`; returns `''` when no route.

- [ ] Step 1: tests `v2 world migrates to v3 silently`, `move_to an unconnected place walks the path and charges its time`, `unreachable move_to is rejected and logged`, `director minutes are capped unless jump`, `new item elsewhere is pulled into the scene`, `mentioned person may live at a known place`, `state fields only stick for people here`, `arrivals and departures are recorded with direction`, `travel refuses without a route`. Update existing tests that assumed 15-minute travel or instant routines.
- [ ] Step 2: run → FAIL. Step 3: implement. Step 4: run → PASS.
- [ ] Step 5: commit `feat(engine): schema v3, logical moves and person state`.

### Task 3: `senses.js` — perception view model and Peek

**Files:** Create `senses.js`; Test `tests/selftest.js`.

**Interfaces — Consumes:** Tasks 1–2. **Produces:**
- `REVEAL = ['senses','nearby','all']`
- `labelOf(npc, mode) -> string`: name when `nameKnown` or mode `all`; else `withArticle(role)` ("a dock guard"), fallback "a stranger". `withArticle` moves here from index.js and is exported.
- `markPerceived(state) -> void`: people here → `known, seenTick = meta.tick`; people in `open`-routed neighbours → `known`.
- `perceive(state, mode) -> View` where `View = { scene:{place, kicker, when, now, threads[]}, people:[{id,label,tags,body,mind,holding,avatar,isNew,isYou}], left:[{label,toward}], items:{mine:[{id,name,type,where}], here:[…]}, around:[{id,name,minutes,sense,people:string[],sound,visited}], secrets?:[…] }`. Sensing: here → seen; `open` or peeked or mode≥nearby → people listed; `door` → `sound` when `soundTick === meta.tick`, else fallback (`0`: '', `1`: 'someone moving about', `2+`: 'voices'); `none` → people `[]`, sound '' (UI shows "can't see in"). Undiscovered places omitted unless mode `all`. Secrets only in mode `all`.
- `peek(state, locId) -> string`: only for a `door` route from here; adds to `scene.peeked`, marks people there known, advances 1 minute, sets `scene.note`; returns the note or ''.

- [ ] Step 1: tests `door neighbours are heard not seen`, `open neighbours are seen`, `nearby and all modes widen the view`, `unnamed people are labelled by role and never by name in senses mode (people, left)`, `secrets only in all mode`, `peek reveals a door room and costs a minute`, `single-location world perceives without throwing`.
- [ ] Step 2–4: fail → implement → pass. Step 5: commit `feat(senses): perception and peek`.

### Task 4: prompts — injection and director contract

**Files:** Modify `engine.js` (`sceneBrief`, `buildInjection`, `directorPrompt`, `PATCH_CONTRACT`); Test `tests/selftest.js`.

**Interfaces — Produces:**
- `sceneBrief(state)` lines: header; atmosphere; `Here: Name (role) — <tags or body summary ≤90>`; `{{user}}: <wearing; position; holding>` when set; `Exits: Docks 10m, Kitchen 1m`; `Heard: Kitchen — <sound>` for door neighbours with a current sound; `Around: items`; `Stirring`; `Lately`; `Note: <scene.note>` when set.
- `directorPrompt(state, transcript, policy, sheets = {})`: `EXITS id=Name Nm sense`; `STATE id: tags | body | mind | holding` for people here; `SHEETS id: text` (≤240 chars each, from `sheets[id]`, `you` key for the persona); contract adds `now`, `jump`, `you`, `sounds`, per-NPC `body/mind/holding/tags/nameKnown`, per-location `routes`, and the rules: state only for people HERE, mind = what {{user}} can read, sheets win, moves must follow EXITS.
- Budgets: injection < 800, director < 3,500 for the test world with 2 sheets.

- [ ] Step 1: tests `brief carries visible state, exits with minutes and sounds`, `brief stays under 800`, `director carries sheets, state and routes and stays under 3500`, `note line appears once set`. Step 2–4. Step 5: commit `feat(prompts): facts for the narrator, sheets for the director`.

### Task 5: host wiring in `index.js` + settings

**Files:** Modify `index.js`, `settings.html`; Test: E2E in Task 7.

**Interfaces — Consumes:** Tasks 1–4, Task 6 (`mountHud`, `renderHud`). **Produces:**
- Settings `hud: true`, `hudReveal: 'senses'` (DEFAULTS + settings.html checkbox and select "What the HUD reveals": Only what I sense / Everything nearby / Everything).
- `sheetsFor(state) -> {[npcId]: string, you: string}`: card characters (ST character whose `avatar === npc.materializedAvatar`, or the active card by name) → `description + personality`; others → `appearance + personality`; `you` → persona.
- After every `setState`: `markPerceived`, then `renderHud(perceive(state, s.hudReveal))` when `s.hud`; status strip hidden while the HUD's left side is visible.
- Actions from the HUD: `onGo(id)` → `travel`, toast on refusal "No path from here to X."; `onPeek(id)` → `peek`. Both `setState` + `inject`.
- `scene.note` cleared after the director pass that follows it.
- Panel World tab shows each exit's minutes; `/iw travel` and `immersiveWorlds.travel` use the routed `travel`.
- Rejections in `meta.rejected` are logged with `log('rejected', …)` after each pass.
- Avatars: `getThumbnailUrl('avatar', file)` for card/materialized people; `getThumbnailUrl('persona', user_avatar)` for the user.

- [ ] Step 1: implement. Step 2: `node --check index.js`; `node tests/selftest.js` passes. Step 3: commit `feat: wire HUD, reveal setting, routed travel`.

### Task 6: `hud.js` + HUD CSS

**Files:** Create `hud.js`; Modify `style.css` (after the kit block).

**Interfaces — Produces:** `mountHud({onGo, onPeek, onOpenPanel})`, `renderHud(view | null)`, `unmountHud()`.
- One fixed `#iw-hud` layer (`pointer-events:none`, z-index 29: above body, below `#sheld` 30 only where they overlap—they don't—and below drawers 3000, MovingUI 4000, popups). Groups `.iw-hud-scene` (top-left), `.iw-hud-people` (top-right), `.iw-hud-items` (bottom-left), `.iw-hud-map` (bottom-right) with `pointer-events:auto`.
- Layout from `#sheld.getBoundingClientRect()` on window resize, `ResizeObserver(#sheld)`, and a `MutationObserver` on `.fillLeft, .fillRight` class changes: side width = gutter − 48 capped at 360; `full` ≥ 260, `compact` ≥ 120, hidden below; a side hides when `.fillLeft.openDrawer` / `.fillRight.openDrawer` (or pinned) covers it.
- People rows: label, up to 3 tags (first highlighted when `tags[0]` exists), portrait (thumbnail or initial circle coloured by id hash). Hover/focus opens the card (Body / Mind / Has, empty rows omitted); click pins it. `isNew` rows glow, `left` rows fade with "left · toward X".
- Toast for arrivals and new sounds, once per `meta.tick`, 6 s, skipped under `prefers-reduced-motion` animation (still shown, no slide).
- Items: tiles with FA icon by type keyword (key→fa-key, weapon/sword/blade/knife→fa-khanda, bag/pack/sack→fa-sack-xmark, letter/note/scroll/map→fa-scroll, book→fa-book, potion/bottle/drink/flask→fa-flask, food→fa-drumstick-bite, cloth/shirt/dress/coat→fa-shirt, ring/jewel/necklace→fa-gem, coin/money/gold→fa-coins, tool→fa-screwdriver-wrench, light/lamp/lantern/torch→fa-fire, default fa-cube); click toggles a detail popover.
- Map: current place centre, ≤6 neighbours on an arc (SVG lines, minutes on each edge), labels per sense ("can't see in" for none/empty); click a node → small menu Go / Peek (Peek only for `door`).
- Text on the background with `text-shadow` from `--SmartThemeShadowColor`; cards/tiles use `--SmartThemeBlurTintColor` + border `--SmartThemeBorderColor`; accent `--SmartThemeQuoteColor`.

- [ ] Step 1: implement. Step 2: `node --check hud.js`; selftest still passes (kit block unchanged). Step 3: commit `feat(hud): floating corner HUD`.

### Task 7: E2E, docs, release

**Files:** Modify `README.md`, `CHANGELOG.md`, `STATE.md`, `manifest.json`, `index.js` (VERSION), `.github/workflows/ci.yml` (unchanged unless new files need checks—the loop covers them).

- [ ] Step 1: isolated SillyTavern 1.19 (`--configPath/--dataRoot`, port 8123) + OpenAI-compatible mock (port 5055) returning v3 patches (now, body/mind/tags, routes, sounds, an unreachable `move_to`, a person moving far away).
- [ ] Step 2: verify at 1920×1080 and 2560×1440: four groups placed, hover card, arrival glow + toast, departure fade, heard room, Peek, Go with minutes, unreachable move rejected (debug log), compact at 1280, hidden at 900, right drawer open hides the right side; reveal modes switch; swipe/regenerate/delete rewind the HUD; no secret or unnamed name visible in `senses` mode; prompt sizes in the mock request log.
- [ ] Step 3: version 2.1.0, CHANGELOG, README (HUD, Reveal setting, token numbers), STATE.md; commit; push; CI green on the SHA; alerts query; release zip (payload incl. `rules.js`, `senses.js`, `hud.js`); verify bytes; copy-paste changelog.
