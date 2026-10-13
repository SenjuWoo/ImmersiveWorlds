# Immersive Worlds 2.4.0 + 2.4.1 "Scene Visuals" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the place you are in visible and make the time of day and weather matter on screen: 2.4.0 ships a free drawn backdrop, a real day/night grade, weather particles and a HUD scene strip; 2.4.1 adds opt-in generated place backdrops, portraits and item pictures through SillyTavern's Image Generation extension.

**Architecture:** New pure module `scenery.js` (place kind, sky palette, particle spec, no DOM) feeds two DOM modules, `backdrop.js` (a fixed layer between SillyTavern's `#bg1` and the UI) and `particles.js` (one canvas). 2.4.1 adds pure `art.js` (prompts, store, single-flight queue with an injected generator) and a thin bridge in `index.js` that runs `/imagine quiet=true`. The backdrop is our own layer, never SillyTavern's background setting, so the user's background is never changed and "off" restores it by hiding the layer.

**Tech Stack:** Plain ES modules, CSS custom properties, one `<canvas>`, SillyTavern ≥ 1.18 extension API, `node tests/selftest.js`, manual E2E in an isolated ST with a mock OpenAI-compatible server and a mock `/imagine`.

**Spec:** `docs/superpowers/specs/2026-10-13-living-senses-design.md` §2 (Visuals). The generated-backdrop-with-time-of-day behaviour and the own-layer decision were added by the operator and the builder on 2026-10-13 and are recorded in Task 0 of this plan (spec addendum). Hourly routines, relationship bars, recap and rumours are 2.5.0 and are not in this plan.

## Global Constraints
- ST ≥ 1.18 (`minimum_client_version` stays `1.18.0`); no build step; no new dependencies; no external fonts or images.
- `kit.js`, `llm.js`, `models.js` and the kit block of `style.css` (everything above `/* ==== end of shared kit ==== */`) are not touched. All new CSS goes below that marker. Immersive Adventures is not touched.
- Nothing here adds text to the narrator prompt or a model call. The only new model-side change is the optional `look` director field in Task 8 (2.4.1), capped so `directorPrompt` for the selftest scenario stays < 3,600 chars.
- Only what {{user}} knows: art prompts use the current place's name, type, season, time slot and the genre/tone only, never a place `description`, `hidden`, `secrets`, `appearance` or `personality`. Portraits use only `look` and visible tags.
- Image generation is off unless the operator picks "Generated picture" (backdrop) or ticks portraits/items. Never blocks chat; one image at a time; per-chat cap default 12; two failures in a row pause generation for the session with one toast.
- Generated files are never deleted by the extension. "Clear art" drops references only.
- Art, backdrop mode and particles are presentation, not story state: they live in settings or in a separate chat-metadata key `immersive_worlds_art_v1` that swipe, regenerate and delete never rewind. Story state (`STATE_KEY`, patches, `TURN_KEY`) is not changed by this plan except the lazily-added person field `look` (Task 8).
- `prefers-reduced-motion` turns particles and crossfades off. Backdrop and particles are `pointer-events: none` and never take clicks.
- Worlds from 2.3 load unchanged; settings migrate silently (`ambientEffects` true/false becomes `backdrop` `'tint'`/`'off'`).
- Public name in commits and docs: SenjuWoo. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Release rule (per project): push, CI green on that exact SHA, tag, GitHub release zip (payload only), verify the asset bytes, then a copy-paste changelog for Nexus/LoversLab/Undertow.

## Review Focus
1. Place `type` is free text from the model ("plaza", "back alley", "the Gilded Stag", "" or a language other than English) → `placeKind` returns `'default'` instead of throwing, and the strip and backdrop still draw.
2. Unknown weather string ("eldritch haze", "") → same as `clear`; no particle kind, no crash.
3. Clock `time` malformed or crossing midnight (23:59 → 00:01) → slot and art slot stay valid, no flicker on every tick when the slot does not change.
4. Image Generation extension missing, no backend configured, or `/imagine` returns an empty string → one plain toast ("Image generation isn't set up in SillyTavern"), generation pauses, the painted scene keeps showing, nothing throws.
5. User travels A → B → A while an image for A is still drawing, or switches chat mid-generation → the late result is stored under its own key (A, slot) and never displayed for B; a chat switch discards the queue and does not write into the new chat's store.

---

### Task 0: Spec addendum

**Files:**
- Modify: `docs/superpowers/specs/2026-10-13-living-senses-design.md` (§2 "Tier 1" and "Proposed release split")

**Interfaces:** none.

- [ ] **Step 1:** In §2 Tier 1 add: place backdrops are generated per (place, art slot) where art slot is `day` for dawn/day and `night` for dusk/night; prompts carry no weather and no people (weather is drawn by particles and tint, so one picture serves every weather); dusk and dawn get an amber/blue CSS tint over the nearest picture; max 2 pictures per place. The picture is shown in the extension's own layer (`#iw-backdrop`), not by changing SillyTavern's background; this replaces "use place art as chat background".
- [ ] **Step 2:** In the release split replace the 2.4.0 line with: **2.4.0** drawn backdrop + day/night grade + weather particles + HUD scene strip; **2.4.1** generated backdrops, portraits, item pictures.
- [ ] **Step 3:** Commit `docs: spec addendum for scene visuals`.

---

## Part A: 2.4.0 (free, no image backend needed)

### Task 1: `scenery.js` (pure)

**Files:**
- Create: `scenery.js`
- Test: `tests/selftest.js`

**Interfaces:**
- Produces:
  - `PLACE_KINDS = ['city','market','harbor','tavern','temple','forest','mountain','cave','desert','plains','road','ship','interior','default']`
  - `placeKind(type: string, name: string): string` — case-insensitive keyword match over `"${type} ${name}"`, first hit wins in the order of `PLACE_KINDS`; keywords: city = `city|town|street|alley|plaza|square|district|quarter|gate|bridge`; market = `market|bazaar|stall|shop|store`; harbor = `dock|harbo|port|pier|wharf|quay|beach|shore|coast`; tavern = `tavern|inn|pub|bar|cantina|saloon|brothel`; temple = `temple|shrine|church|cathedral|chapel|monaster|crypt|tomb`; forest = `forest|wood|grove|jungle|swamp|marsh|garden|park`; mountain = `mountain|cliff|pass|peak|hill|canyon`; cave = `cave|cavern|mine|tunnel|sewer|dungeon|cellar`; desert = `desert|dune|wasteland|oasis`; plains = `field|plain|meadow|farm|village|camp|ruin`; road = `road|path|trail|highway`; ship = `ship|boat|vessel|deck|airship`; interior = `room|house|hall|kitchen|bedroom|cabin|office|apartment|flat|castle|keep|library|lab|cell|barracks|manor`; otherwise `'default'`. Non-string or empty input returns `'default'`.
  - `artSlot(slot: 'dawn'|'day'|'dusk'|'night'): 'day'|'night'` (dawn and day → `day`; dusk and night → `night`; anything else → `day`).
  - `skyOf(slot: string, weather: string): { top: string, bottom: string, light: string, dim: number, tint: string, tintAlpha: number }` — CSS colour strings; `dim` 0–0.55 is the black overlay strength (day 0, dawn .18, dusk .22, night .5); `tint` is the dawn blue / dusk amber / night blue / day none overlay colour and `tintAlpha` 0–0.3; storm/rain/overcast/fog add +0.08 to `dim` (capped .55) and desaturate by lowering colour chroma in `top`/`bottom` (exact colours are free, they must differ per slot).
  - `particleSpec(weather: string, slot: string, reduced = false): { kind: 'rain'|'snow'|'fog'|'embers'|'dust'|null, count: number }` — rain/storm → rain (count 140, storm 220); snow → snow (120); fog/mist → fog (14 large soft blobs); cold at night and fire-like `embers` are never produced from weather alone; `hot` and `haze` → dust (30); everything else → `{kind:null,count:0}`; `reduced` true → `{kind:null,count:0}`. Weather is normalised with the same alias table the engine uses (import `weatherClass` is not possible without state, so accept a plain string and lower-case/strip non-letters, mapping `rainy|raining|drizzle` → rain, `thunderstorm|stormy` → storm, `snowing` → snow, `mist|misty|foggy` → fog, `humid|heat` → hot).
- Consumes: nothing.

- [ ] **Step 1: Write failing tests** (`t('placeKind ...')` etc.): `placeKind('plaza','Market Square')` → `'city'` (order: city before market); `placeKind('','The Gilded Stag')` → `'default'`; `placeKind('harbor','Docks')` → `'harbor'`; `placeKind(null, undefined)` → `'default'`; `placeKind('Taverne','')` → `'default'` (non-English is not guessed); `artSlot` mapping for all four slots and for `'bogus'`; `skyOf('night','clear').dim > skyOf('day','clear').dim`; `skyOf('night','storm').dim <= 0.55`; `skyOf('day','clear').top !== skyOf('night','clear').top`; `particleSpec('rainy','day').kind === 'rain'`; `particleSpec('Eldritch Haze','day').kind === null` (unknown word, no crash); `particleSpec('storm','day').count > particleSpec('rain','day').count`; `particleSpec('snow','day', true)` → `{kind:null,count:0}`.
- [ ] **Step 2:** `node tests/selftest.js` → new tests FAIL (module missing).
- [ ] **Step 3:** Implement `scenery.js` per Interfaces (header comment: "Pure scene helpers: place kind, sky palette, particle spec. No DOM.").
- [ ] **Step 4:** `node tests/selftest.js` → all pass (81 + new).
- [ ] **Step 5:** Commit `feat(scenery): place kind, sky palette, particle spec`.

### Task 2: Backdrop layer and day/night grade

**Files:**
- Create: `backdrop.js`
- Modify: `index.js` (DEFAULTS, `applyAmbient`, settings migration, `refresh`), `settings.html`, `style.css` (below the kit marker; replace the old `body.iw-ambient::before` block)
- Test: `tests/selftest.js` (settings migration only; DOM is covered by E2E in Task 9)

**Interfaces:**
- Consumes (`scenery.js`): `placeKind`, `skyOf`, `artSlot`.
- Produces (`backdrop.js`): `mountBackdrop(): void` (creates `<div id="iw-backdrop" aria-hidden="true">` as the next sibling of `#bg1`, or first child of `body` if `#bg1` is missing; idempotent); `unmountBackdrop(): void`; `paintBackdrop(view: { mode: 'off'|'tint'|'scene'|'art', kind: string, slot: string, weather: string, art?: string }): void` — sets CSS custom properties `--iw-sky-top`, `--iw-sky-bottom`, `--iw-dim`, `--iw-tint`, `--iw-tint-a` and `data-mode`, `data-kind`, `data-slot`, `data-weather` on the layer; in `scene` mode the layer shows the sky gradient plus an inline-SVG silhouette for `kind` (one SVG string per kind, hand-drawn, ≤ 1 KB each, `fill: currentColor` with colour from the sky); in `art` mode it shows `art` as a CSS `background-image` when given, else behaves as `scene`; in `tint` mode no picture, only the grade overlay; `off` hides the layer and removes the grade. Changing `kind` or `art` crossfades (two stacked child divs, opacity transition 1.2 s; none under `prefers-reduced-motion`).
- Produces (`index.js`): setting `backdrop: 'off'|'tint'|'scene'|'art'` default `'tint'`; `migrateBackdrop(s): 'tint'|'off'` (exported from `scenery.js`? No: from `backdrop.js` as pure function `migrateBackdrop(settings)` returning `'off'` if `settings.ambientEffects === false`, else `'tint'`); `applyAmbient()` now calls `paintBackdrop` with `kind = placeKind(loc.type, loc.name)`, `slot = timeSlot(state)`, `weather = weatherClass(state)` and keeps setting `document.body.dataset.iwTime` / `iwWeather` for existing CSS and the HUD.
- Layer rules (CSS): `position: fixed; inset: 0; z-index: -1; pointer-events: none;` inserted after `#bg1` so it paints above SillyTavern's background and below everything else; grade is a `::after` overlay (`background: black; opacity: var(--iw-dim)` plus a second gradient using `--iw-tint` at `--iw-tint-a`). In `tint` mode the layer has no picture and the existing look (faint wash) is replaced by the stronger grade. The old `body.iw-ambient::before` rules are removed.

- [ ] **Step 1: Write failing tests:** `migrateBackdrop({ambientEffects:false})` → `'off'`; `migrateBackdrop({ambientEffects:true})` → `'tint'`; `migrateBackdrop({})` → `'tint'`; `migrateBackdrop({backdrop:'scene'})` returns `'scene'` unchanged (an already-set value wins). Settings screen text check: `settings.html` contains `data-iw-setting="backdrop"` and no longer contains `data-iw-setting="ambientEffects"` (read the file in the test).
- [ ] **Step 2:** Run selftest → FAIL.
- [ ] **Step 3:** Implement `backdrop.js`; add `backdrop` and `particles` (true) to `DEFAULTS`; in `settings()` run the migration once when `s.backdrop === undefined` (same place as the existing `modelMode` migration at `index.js:83`); replace `applyAmbient` body; replace the settings row with a select "Scene backdrop" (Off / Time-of-day grade only / Painted scene / Generated picture (needs Image Generation, 2.4.1)) — the Generated option is present but disabled with the note "coming in 2.4.1" until Task 7; call `mountBackdrop()` in `init()` and `unmountBackdrop()` when `enabled` is false.
- [ ] **Step 4:** `node tests/selftest.js` and `node --check` on every `.js` → pass. Load in the isolated ST and screenshot the four slots × clear/rain for `tint` and `scene` (full E2E list in Task 5).
- [ ] **Step 5:** Commit `feat(backdrop): own backdrop layer, day/night grade, painted scene`.

### Task 3: Weather particles

**Files:**
- Create: `particles.js`
- Modify: `index.js` (wire in `applyAmbient`), `settings.html`, `style.css`
- Test: `tests/selftest.js` (pure part only)

**Interfaces:**
- Consumes (`scenery.js`): `particleSpec`.
- Produces (`particles.js`): `stepParticles(list: Particle[], kind: string, w: number, h: number, dt: number): void` (pure; mutates positions, wraps around the screen; `Particle = {x,y,vx,vy,r,a}`); `makeParticles(kind: string, count: number, w: number, h: number, rand = Math.random): Particle[]` (pure); `startParticles(spec: { kind: string|null, count: number }): void` and `stopParticles(): void` (DOM: one `<canvas id="iw-particles">` fixed, `z-index: 28`, under the HUD (29) and above chat; `pointer-events: none`; resizes with the window; `requestAnimationFrame` loop capped at 30 fps; paused when `document.hidden`; `stopParticles` cancels the loop and removes the canvas).
- Rules: honours `matchMedia('(prefers-reduced-motion: reduce)')` (never starts) and the `particles` setting; `startParticles` with the same spec as running does nothing (no restart on every refresh); `kind: null` stops.

- [ ] **Step 1: Write failing tests:** `makeParticles('rain', 10, 800, 600, seq)` returns 10 items inside the box; `stepParticles` for rain moves `y` down and wraps `y > h` back to the top; snow drifts (`vx` non-zero); a `kind` of `'none'` or `null` returns `[]`; `makeParticles('rain', 5000, …)` is capped at 300.
- [ ] **Step 2:** Run selftest → FAIL.
- [ ] **Step 3:** Implement `particles.js`; draw rain as short slanted lines, snow as soft dots, fog as large low-alpha radial blobs drifting slowly, dust as tiny warm dots. Wire `applyAmbient` to call `startParticles(particleSpec(weather, slot, reducedMotion))` when `settings().particles` and `settings().backdrop !== 'off'`, else `stopParticles()`.
- [ ] **Step 4:** Selftest and `node --check` pass. In the E2E pane set weather to rain, snow, fog, hot and confirm particles appear, stop on `clear`, stop with the setting off, and stop under emulated reduced motion.
- [ ] **Step 5:** Commit `feat(particles): rain, snow, fog and dust that follow the weather`.

### Task 4: HUD scene strip

**Files:**
- Modify: `senses.js` (`perceive` scene gets `art`), `hud.js` (`sceneHtml`), `style.css`
- Test: `tests/selftest.js`

**Interfaces:**
- Consumes: `placeKind`, `skyOf` (from `scenery.js`).
- Produces: `perceive(...).scene.art = { kind: string, slot: string, weather: string }` (strings only, derived from the current place `type`/`name`, `timeSlot`, `weatherClass`); the HUD scene section renders `<div class="iw-hud-strip" data-kind data-slot data-weather style="--iw-sky-top:…;--iw-sky-bottom:…">` above the kicker (height 44 px, rounded, the same silhouette SVG as the backdrop `scene` mode, reusing the exported `silhouetteSvg(kind): string` from `backdrop.js`). It crossfades when `kind` or `slot` changes and is hidden in compact mode and when the left side is `hidden`.

- [ ] **Step 1: Write failing tests:** `perceive(world(), 'senses').scene.art` equals `{kind:'city', slot:'dawn', weather:'rain'}` for the selftest `world()` (08:30, rain, market type `plaza`); a world whose current place has an empty type yields `kind:'default'`; the art object contains no place `description` text (assert `JSON.stringify(art)` does not include the description string).
- [ ] **Step 2:** Run selftest → FAIL.
- [ ] **Step 3:** Implement: add `art` in `perceive`; export `silhouetteSvg` in `backdrop.js` and import it in `hud.js`; add the strip markup and CSS.
- [ ] **Step 4:** Selftest passes; E2E check at 1920 and 1280 widths (strip shows full, hides compact) and 375 px (HUD hidden as before).
- [ ] **Step 5:** Commit `feat(hud): scene strip with place silhouette, sky and weather`.

### Task 5: Release 2.4.0

**Files:**
- Modify: `manifest.json`, `index.js` (`VERSION`), `README.md`, `CHANGELOG.md`, `STATE.md`, `.github` (only if a new `.js` file is not covered by the glob; it is)
- Test: full gate

**Interfaces:** none.

- [ ] **Step 1:** Bump `manifest.json` and `index.js` `VERSION` to `2.4.0` (the existing test `manifest version matches index.js` guards it).
- [ ] **Step 2:** Changelog `## 2.4.0 — <date>`: "Scene visuals I. Worlds from 2.3 load unchanged." with short lines: backdrop modes (grade only / painted scene), real day/night grade (dawn, day, dusk, night), weather particles (rain, storm, snow, fog, dust) with a setting and reduced-motion support, HUD scene strip, setting `ambientEffects` became `Scene backdrop`; test count.
- [ ] **Step 3:** README feature list and settings; STATE.md: version, verified list (what was run), not-verified list, next = 2.4.1 and Task pointer to this plan.
- [ ] **Step 4:** Full E2E in an isolated ST 1.19 with the mock model: four slots × (clear, rain, snow, fog) in `tint` and `scene`; travel between a `harbor` and an `interior` place crossfades; setting off restores the user's own background (screenshot before/after); reduced motion; 375 px width; swipe/delete leave the backdrop consistent with the rewound state; no console errors.
- [ ] **Step 5:** `node tests/selftest.js` (all pass), `node --check` on every file, commit, push, wait for CI green on that SHA, query Dependabot/code-scanning/secret-scanning alerts (`gh api`), tag `v2.4.0`, build the zip (payload only: all runtime `.js`, `style.css`, `settings.html`, `manifest.json`, `README.md`, `CHANGELOG.md`, `LICENSE`, `assets/`), create the GitHub release, download the asset and verify its bytes/hash against the build.
- [ ] **Step 6:** Hand over the copy-paste changelog block (plain text, short "- " lines, 2.3.0 → 2.4.0).

---

## Part B: 2.4.1 (opt-in generated art)

### Task 6: `art.js` (pure: store, prompts, queue)

**Files:**
- Create: `art.js`
- Test: `tests/selftest.js`

**Interfaces:**
- Produces:
  - `ART_KEY = 'immersive_worlds_art_v1'`; `normArt(raw): { v: 1, items: Record<string, { url: string, at: string }> }` (drops entries whose url is not a non-empty string or longer than 500 chars; unknown shapes → empty store).
  - `artKey(kind: 'place'|'person'|'item', id: string, slot = ''): string` → `place:<id>:<day|night>`, `person:<id>`, `item:<id>`.
  - `getArt(store, key): string` (url or ''); `putArt(store, key, url, at = new Date().toISOString()): void`; `dropArt(store, key): void`; `clearArt(store): void`; `artCount(store): number`.
  - `placePrompt({ name, type, season, genre, tone, slot }: PlaceBrief): string` — one line, comma-separated, ends with `, no people, no text, no watermark, wide landscape background, detailed`; contains the place name and type, the season only when not `'unspecified'`, `night` or `daytime` from `artSlot(slot)`; contains no weather word; cleaned with `cleanText` and stripped of `|`, `{{`, `}}`, newlines and anything past 400 chars.
  - `portraitPrompt({ label, look, tags }: PersonBrief): string` — `portrait of <look or label>` plus tags, ends `, upper body, neutral background, no text`; the same stripping; `look` empty → uses the visible `label` and `tags` only.
  - `itemPrompt({ name, type, description }: ItemBrief): string` — `still life of <name> (<type>), plain background, no text`; the item `description` is used (≤ 120 chars) only when the item is one the player holds or has seen (the caller passes it only then).
  - `class ArtQueue` — `constructor({ generate: (job: { key: string, prompt: string, kind: string, size: [number, number] }) => Promise<string>, cap = 12, onDone, onFail, onPause })`; `enqueue(job): 'queued'|'duplicate'|'capped'|'paused'` (duplicate = same key queued or running; capped when `store count + queued + running >= cap`; paused after two consecutive failures); one job runs at a time in order; `reset(): void` (clears queued, bumps an internal epoch so a late result from the previous epoch is dropped without calling `onDone`); `resume(): void`; `get running(): string` (key or ''); `get pending(): number`. Success calls `onDone(job, url)` with a non-empty string; an empty string or a throw counts as a failure → `onFail(job, error)`.
- Consumes: `cleanText` from `engine.js`, `artSlot` from `scenery.js`.

- [ ] **Step 1: Write failing tests:** `placePrompt` for the selftest market at `'night'` contains `Market Square`, `night`, `no people` and does not match `/rain|storm|snow|fog/i`; with a malicious name `'Evil|/imagine{{user}}\nplaza'` the result has no `|`, `{{`, `}}` or newline; length ≤ 400; `portraitPrompt` with empty `look` still returns a non-empty string containing the label; `normArt('junk')` → `{v:1, items:{}}`; `normArt` drops an entry with a 600-char url; queue: enqueue the same key twice → second returns `'duplicate'`; with `cap:2` and a store of 1 plus one queued the third job returns `'capped'`; two jobs run strictly one after the other (fake generator records overlap = 0); a generator that returns `''` twice pauses the queue (`enqueue` then returns `'paused'`) and `resume()` re-enables it; `reset()` while a job runs drops its late result (`onDone` not called) and clears the queue.
- [ ] **Step 2:** Run selftest → FAIL.
- [ ] **Step 3:** Implement `art.js` per Interfaces (header comment: "Pure art helpers: store, prompts, single-flight queue. The generator is injected, so nothing here touches SillyTavern.").
- [ ] **Step 4:** Selftest passes.
- [ ] **Step 5:** Commit `feat(art): art store, safe prompts, single-flight queue`.

### Task 7: Image Generation bridge and generated place backdrops

**Files:**
- Modify: `index.js` (bridge, store access, enqueue on arrival, settings handlers), `backdrop.js` (accept `art`), `settings.html`, `style.css`
- Test: `tests/selftest.js` (settings and migration only), E2E with a mock `/imagine`

**Interfaces:**
- Consumes: `ArtQueue`, `artKey`, `getArt`, `putArt`, `normArt`, `placePrompt`, `ART_KEY` (from `art.js`); `artSlot`, `placeKind` (`scenery.js`); `paintBackdrop` (Task 2).
- Produces (`index.js`):
  - `async function imagine(job): Promise<string>` — runs `ctx().executeSlashCommandsWithOptions(\`/imagine quiet=true width=${w} height=${h} negative="people, text, watermark" ${job.prompt}\`)` and returns `result.pipe` (trimmed string); returns `''` when the result is falsy or not a path/URL string; places use `[1024, 576]`, portraits `[512, 768]`, items `[512, 512]`.
  - `getArtStore()` = `ctx().chatMetadata[ART_KEY] ??= normArt(null)`; `saveArt()` = `ctx().saveMetadataDebounced(); refresh()`.
  - `const artQueue = new ArtQueue({ generate: imagine, cap: settings().artCap, onDone: (job, url) => { putArt(getArtStore(), job.key, url); saveArt(); }, onFail: …one toast per pause, onPause: … })`; recreated or `reset()` in `onChatChanged`.
  - `wantPlaceArt()`: when `settings().backdrop === 'art'` and a world exists, builds the `PlaceBrief` from the current location (name, type), `state.clock.season`, `state.genre`, `state.tone`, `timeSlot(state)` and `enqueue({ key: artKey('place', loc.id, artSlot(slot)), kind: 'place', size: [1024, 576], prompt })` unless `getArt` already has it. Called from `refresh()` after the world note is built and 1.5 s after a place or art-slot change (debounced), never while `setBusy` is on.
  - Settings: `backdrop` option "Generated picture" enabled; `artCap` (number, 4–40, default 12); button "Test image generation" (`data-iw="art-test"`) that runs one 256×256 `imagine` and shows the result in a dialog or the plain error; button "Clear generated art" (`data-iw="art-clear"`, confirm first, drops references only); counter "Pictures: N / cap".
  - `paintBackdrop` receives `art: getArt(store, artKey('place', loc.id, artSlot(slot)))` in `art` mode; dusk and dawn keep their normal CSS tint over the chosen picture.
- Failure rule: if `imagine` returns `''` the queue's failure path runs; after the second consecutive failure show one toast "Image generation isn't set up in SillyTavern. Pick an image backend in the Image Generation extension, then press Test." and keep the painted scene.

- [ ] **Step 1: Write failing tests (pure):** `settings` default `artCap` is 12 and out-of-range values clamp (4 and 40) via a pure `clampCap(n)` exported from `art.js` (add it to Task 6's module in this step); `settings.html` contains `data-iw="art-test"`, `data-iw="art-clear"` and the `artCap` setting.
- [ ] **Step 2:** Run selftest → FAIL.
- [ ] **Step 3:** Implement the bridge and wiring as above; enable the "Generated picture" option.
- [ ] **Step 4:** Selftest and `node --check` pass. E2E with a mock `/imagine` (a tiny local HTTP image or a registered stub slash command named `imagine` returning a data path): enter a place → painted scene shows at once → picture crossfades in; second visit uses the cache with zero calls; day→night adds one more picture; A→B→A with a slow stub shows each picture only in its own place; chat switch mid-draw leaves the new chat's store untouched; stub returning `''` twice → one toast and the painted scene stays; cap 2 stops at two pictures; "Clear generated art" empties the references; swipe and delete leave the art untouched.
- [ ] **Step 5:** Commit `feat(art): generated place backdrops through Image Generation`.

### Task 8: `look` field and generated portraits

**Files:**
- Modify: `engine.js` (npc `look`, `PATCH_CONTRACT`, `applyPatch`), `senses.js` (`row` exposes `look` only for known people), `hud.js` (`face` precedence), `index.js` (enqueue portraits), `settings.html`
- Test: `tests/selftest.js`

**Interfaces:**
- Produces: npc field `look: string` (≤ 200, default `''`, added lazily by `normalizeState`); director patch key `npcs[].look` accepted only when the stored `look` is empty (a person's look is set once, then fixed unless the user clears art); contract line (appended to the existing NPC field list, ≤ 140 chars): `look: how {{user}} sees them now, ≤ 200 chars, only what is visible; set once`; `perceive().people[].look` is present only for people who are known; face precedence: sprite → avatar → generated portrait (`artKey('person', id)`) → monogram. Setting `artPortraits` (default false): when true and a present, known person has no sprite and no avatar, enqueue `portraitPrompt({ label, look, tags })` with size `[512, 768]`.
- Consumes: `portraitPrompt`, `artKey`, `getArt`.

- [ ] **Step 1: Write failing tests:** `normalizeState` keeps `look` and trims it to 200; `applyPatch` sets `look` on an empty one and ignores a second `look` for the same person; `perceive` omits `look` for an unknown person and includes it for a known one; a person with an `appearance` secret string never has that string in `look` or in the prompt (assert `portraitPrompt` output excludes `appearance` text passed separately); `directorPrompt` for the selftest scenario is still < 3,600 chars.
- [ ] **Step 2:** Run selftest → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Selftest passes; E2E: a background person without avatar gets a portrait only when `artPortraits` is on and only after being met; a person with an avatar never triggers a call.
- [ ] **Step 5:** Commit `feat(art): look field and generated portraits for people without a face`.

### Task 9: Item pictures

**Files:**
- Modify: `hud.js` (item popover button), `index.js` (handler), `style.css`
- Test: `tests/selftest.js`

**Interfaces:**
- Produces: HUD item popover shows `<img>` when `artKey('item', id)` exists, else (when `artItems` is on) a "Draw this" button (`data-iw-art-item="<id>"`) that enqueues `itemPrompt`; a small "redraw" and "remove" pair on an existing picture (`dropArt`). Setting `artItems` default false. The item description is passed to `itemPrompt` only for items the player holds or sees (`view.items.mine` / `view.items.here`).
- Consumes: `itemPrompt`, `artKey`, `putArt`, `dropArt`.

- [ ] **Step 1: Write failing tests:** `itemPrompt` with a 300-char description clamps the description to 120; an item the player does not see is never passed (test the helper that builds the brief: `itemBrief(view, id)` returns `null` for an id not in `view.items.mine`/`here`).
- [ ] **Step 2:** Run selftest → FAIL.
- [ ] **Step 3:** Implement `itemBrief(view, id)` in `art.js` and the HUD/handler wiring.
- [ ] **Step 4:** Selftest passes; E2E click-through with the stub generator.
- [ ] **Step 5:** Commit `feat(art): item pictures on request`.

### Task 10: Release 2.4.1

**Files:** `manifest.json`, `index.js` (`VERSION`), `README.md`, `CHANGELOG.md`, `STATE.md`

- [ ] **Step 1:** Bump to `2.4.1`; changelog `## 2.4.1`: generated place backdrops (day and night picture per place, weather by particles), portraits for people without a face, item pictures, Test button, cap, Clear art; honest limit: needs an image backend set up in SillyTavern; STATE.md updated (verified vs not verified: **a real image backend was or was not run**; say which).
- [ ] **Step 2:** If an image backend is available to the operator, run one real generation per kind and record the prompts used and the result (screenshots) in STATE.md; if not, state "mock only" there.
- [ ] **Step 3:** Same release gate as Task 5 (selftest, `node --check`, push, CI green on that SHA, alerts query, tag `v2.4.1`, zip payload only, GitHub release, verify asset bytes, copy-paste changelog 2.4.0 → 2.4.1).

---

## Self-review notes
- Spec §2 coverage: Tier 0 faces/items already shipped in 2.3.0; place header strip (Task 4), weather particles (Task 3), reduced-motion (Tasks 2, 3), Tier 1 portraits/backdrop/item pictures with queue, cap, drawing state, regenerate/remove, Test button and perceived-only prompts (Tasks 6–9), place art as chat background replaced by the own layer (Task 0). The visible "drawing…" state is delivered by Task 7's backdrop (painted scene until the picture lands) plus ST's own non-blocking "Generating an image..." toast; a dedicated in-HUD spinner is not built (YAGNI).
- Type consistency: `artSlot`, `placeKind`, `skyOf`, `particleSpec` (Task 1) are the only scenery names used later; `artKey`/`getArt`/`putArt`/`dropArt`/`ArtQueue` (Task 6) are the only art names used later; `paintBackdrop` takes `art?: string` from Task 2 onward.
- Proportion: this plan is longer than the 2.3.0 spec section it implements because 2.4.1 touches ST's image pipeline; bodies are deliberately not written out.
