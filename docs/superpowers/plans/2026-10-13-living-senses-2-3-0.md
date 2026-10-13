# Immersive Worlds 2.3.0 "Living Senses I" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 2.3.0: model picker for background calls, per-person dossier of learned facts, hints, and Tier-0 faces.

**Architecture:** New pure modules (`models.js`, `dossier.js`, `hints.js`, `faces.js`) keep logic node-testable; `engine.js` gains schema v4 + `learned` patch handling; `senses.js`/`hud.js` render only perceived data; `index.js` wires settings, calls and popups. Background calls go through `llm.js` (mirrored into Immersive Adventures).

**Tech Stack:** Plain ES modules, SillyTavern ≥ 1.18 extension API, `node tests/selftest.js` (plain assert), Playwright-free manual E2E in an isolated ST instance with a mock OpenAI-compatible server.

**Spec:** `docs/superpowers/specs/2026-10-13-living-senses-design.md` (sections 1, 3, 4 and Tier 0 of 2). 2.4/2.5 items are out of this plan.

## Global Constraints
- ST ≥ 1.18 (`minimum_client_version` stays `1.18.0`); no build step; no new dependencies.
- `kit.js`, `llm.js`, kit block of `style.css` byte-identical with `../ImmersiveAdventures`; selftest enforces. Mirror `llm.js` in the same task.
- Narrator note (`sceneBrief`) must not grow: typical scene stays ≤ ~600 chars; dossier is never injected into the roleplay prompt.
- Director prompt for the existing selftest scenario stays < 3,600 chars after adding `learned`.
- Only what {{user}} knows is shown (HUD, dossier, hints). `hidden`, `secrets`, `appearance`, `personality` never appear in hints or the HUD in `senses`/`nearby` modes.
- Hints never send; they only fill the message box.
- Swipe/regenerate/delete safe: director-authored `learned` rides in the patch/snapshot; user notes and deletions live in separate key `immersive_worlds_notes_v1` (not rewound).
- Public name in all commits/docs: SenjuWoo. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Verified live 2026-10-13: OpenRouter `GET https://openrouter.ai/api/v1/models` is CORS-open (`Access-Control-Allow-Origin: *`); slug `deepseek/deepseek-v4.1-flash` exists (1,048,576 ctx; $0.0441/M in, $0.63/M out; supports `reasoning`, `reasoning_effort`, `response_format`); OpenRouter accepts `reasoning.effort` ∈ `max|xhigh|high|medium|low|minimal|none` and rejects `min` (observed 400).

## Review Focus
1. OpenRouter list fetch fails/offline/slow → settings still usable with free-text slug and shortlist; no unhandled rejection.
2. A model that cannot disable reasoning (400 on `none`) → ladder retries `minimal`, then no effort field; a real auth error is not retried and reads "no OpenRouter key".
3. Director returns `learned` for an unknown person id, duplicates, 200-char strings, non-array → ignored/clamped, never throws.
4. Swipe back and forth over a reply that added facts → facts appear/disappear with the reply; user notes and deletions stay.
5. Hints call returns text with ids the player has not met, or invalid JSON → unknown-source ideas dropped; empty result shows "Nothing new comes to mind", never an error toast storm.

---

### Task 1: Model picker core (`models.js`, `llm.js`, mirror)

**Files:**
- Create: `models.js`
- Modify: `llm.js` (add `model`, `viaOpenRouter` params), mirror byte-for-byte to `../ImmersiveAdventures/llm.js`
- Test: `tests/selftest.js`

**Interfaces:**
- Produces (`models.js`): `RECOMMENDED: string[]` (`['deepseek/deepseek-v4.1-flash','deepseek/deepseek-v4-flash','anthropic/claude-haiku-5.5']`); `parseModels(json): {id,name,ctx,inPerM,outPerM,reasoning}[]` (prices per million tokens as numbers, invalid rows skipped); `modelOptions(models, query='', limit=60): model[]` (recommended present in list first, then others whose id/name contains query, case-insensitive, cheapest output price first); `EFFORT_LADDER = ['none','minimal','']`; `async withLadder(send: (effort:string)=>Promise<any>, ladder=EFFORT_LADDER): Promise<any>` (tries each effort; on `isRejection(error)` tries next; rethrows others and the last rejection); `async fetchModels(signal?): Promise<model[]>` (fetch OpenRouter public list, 8 s timeout, throws on non-OK).
- Produces (`llm.js`): `backgroundGenerate({system,prompt,maxTokens,profileId,temperature,noReasoning,model='',viaOpenRouter=false})`. `viaOpenRouter && model` → direct request `chat_completion_source:'openrouter'`, `include_reasoning:false`, effort via `withLadder` when `noReasoning`; 401/403/"key" errors rethrown as `Error('No OpenRouter API key in SillyTavern. Add it under API Connections → Chat Completion → OpenRouter, or choose another source.')`. `model` without `viaOpenRouter` → existing active-connection path with `model` override. `profileId` still wins when set. `llm.js` imports `withLadder` from `./models.js` (so `models.js` must also exist in Immersive Adventures: mirror `models.js` too, identical).

- [ ] **Step 1: Write failing tests** in `tests/selftest.js`: `parseModels` maps `{id:'a/b',name:'A',context_length:1000,pricing:{prompt:'0.0000001',completion:'0.000001'},supported_parameters:['reasoning']}` to `inPerM 0.1, outPerM 1, reasoning true` and skips rows without `id`; `modelOptions` puts `deepseek/deepseek-v4.1-flash` first when present, filters by `query:'haiku'`, caps at `limit`; `withLadder` calls `send('none')` first, on `new Error('Bad Request 400 reasoning.effort invalid')` calls `send('minimal')`, then `send('')`, returns first success, rethrows a non-rejection (`new Error('network down')`) immediately after one call; shared-file parity test already covers mirrors.
- [ ] **Step 2:** `node tests/selftest.js` → new tests FAIL (module missing).
- [ ] **Step 3:** Implement `models.js` as specified (import `isRejection` from `./llm.js` is circular → define the rejection regex locally via `export { isRejection }` moved: put `isRejection` and `errorText` in `models.js`? NO: keep them in `llm.js`; `withLadder` takes an optional `isReject = isRejectionLocal` param with a local copy of the same regex to avoid the cycle).
- [ ] **Step 4:** Implement the `llm.js` branch; copy `llm.js` and `models.js` to `../ImmersiveAdventures/`.
- [ ] **Step 5:** `node tests/selftest.js` (IW) and `node tests/selftest.js` in `../ImmersiveAdventures` → all pass.
- [ ] **Step 6:** Commit IW (`feat(models): model picker core`) and IA (`sync: llm.js and models.js with Immersive Worlds 2.3.0`).

### Task 2: Dossier data and director contract (`dossier.js`, `engine.js`)

**Files:**
- Create: `dossier.js`
- Modify: `engine.js` (STATE_VERSION 4; npc `learned`; `scene.fresh`; `PATCH_CONTRACT`; `applyPatch`; `directorPrompt` known-facts hint)
- Test: `tests/selftest.js`

**Interfaces:**
- Produces (`dossier.js`): `KINDS = ['like','dislike','interest','history','trait','bond','promise','other']`; `CAPS = {main:14, bg:6}`; `normLearned(list): {k,t,at}[]` (kind coerced to `other`, `t` ≤ 120 chars, empties dropped); `addLearned(npc, items, at): {k,t,at}[]` returns facts newly added (dedupe by lower-cased normalised `t`, ≤ 3 per call, cap per CAPS with oldest-first drop preferring `other`/`trait`); `factKey(npc, fact): string` (stable fingerprint `id|k|normalised t`, for hidden marks).
- Produces (`engine.js`): npc field `learned: {k,t,at}[]` (default `[]`); `state.scene.fresh: {id,t}[]` (facts added by the last patch; reset each patch); director patch key `learned:[{id,k,t}]`; contract text instructs "record a fact only if {{user}} saw, heard or was told it in the new exchange; at most 3 per person; nothing hidden"; `STATE_VERSION = 4`. `directorPrompt` adds, for present people only, `KNOWN id: k:t; ...` capped to the newest 4 facts per person so the model does not repeat them.
- Rules: unknown/unknown-to-player (`!known`) ids ignored; `at` = `"D{day} {time}"`; `learned` on non-object entries ignored.

- [ ] **Step 1: Failing tests**: `addLearned` dedupes `"Likes tea"`/`"likes tea."` (normalise: lowercase, strip punctuation/space runs), caps main at 14 keeping newest, background at 6, coerces kind `foo`→`other`, clamps 120 chars; `applyPatch(state,{learned:[{id:'mara',k:'like',t:'Loves the smell of tar'},{id:'ghost',k:'like',t:'x'}]})` adds one fact to Mara, none for `ghost`, sets `scene.fresh` to that one, and a second identical patch adds nothing; `normalizeState` of a v3 world (no `learned`) yields `learned: []` and `version 4`; `directorPrompt` for the standard test world contains `learned` contract text and stays < 3,600 chars; `sceneBrief` output is unchanged for a world with learned facts (never injected).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** Implement `dossier.js`; wire `engine.js` (normalise `learned` per npc, `scene.fresh`, patch handling after the people merge so a person created in the same patch can receive facts, contract line, KNOWN lines).
- [ ] **Step 4:** run → PASS; also `node --check` all files.
- [ ] **Step 5:** Commit `feat(dossier): learned facts per person, schema v4`.

### Task 3: Perceived view, notes store, HUD dossier (`senses.js`, `dossier.js`, `hud.js`, `index.js`)

**Files:**
- Modify: `senses.js` (`perceive` adds `learned` per person row and `fresh`; thread entries become `{id,name}`), `hud.js` (dossier block in the person card; "just learned" dot; toast), `index.js` (notes store, dossier popup with edit/delete/add-note, handlers)
- Modify: `dossier.js` (add notes helpers)
- Test: `tests/selftest.js`

**Interfaces:**
- Consumes: Task 2 `learned`, `scene.fresh`, `factKey`.
- Produces (`dossier.js`): `NOTES_KEY = 'immersive_worlds_notes_v1'`; `normNotes(raw): {notes:{[npcId]:{id,t,at}[]}, hidden:string[]}`; `mergedFacts(npc, notes): {key,k,t,at,own:boolean}[]` (director facts minus `hidden` keys, plus user notes as `k:'note'`, newest last); `addNote(store,npcId,text,at)`, `hideFact(store,key)`, `removeNote(store,npcId,id)` (mutating, text ≤ 160, ≤ 20 notes per person).
- Produces (`senses.js`): person row gains `learned: {k,t,own,fresh}[]` (empty for the user row; only `known` people; `mergedFacts` applied by the caller passing `notes` as 3rd opt: `perceive(state, mode, { userName, notes })`); `scene.threads` becomes `[{id,name}]`.
- Produces (`hud.js`): handlers `onDossier(personId)` opens the editor; card shows "Learned" section (≤ 6 newest, kind icon, fresh ones highlighted); toast "Learned something about Mara." once per update when `view.fresh.length`.

- [ ] **Step 1: Failing tests**: `mergedFacts` hides facts whose key is in `hidden`, appends notes, preserves order; `hideFact` then re-adding the same director fact does not resurrect it; `perceive` returns `learned` only for known people and hides `truth`/`hidden`/`secrets`; `perceive(...).scene.threads` are `{id,name}` objects; a rewound state (structuredClone of the pre-turn snapshot) loses director facts but `notes` store (separate object) is untouched.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** Implement notes helpers, `perceive` changes, HUD rendering/toast, update `hud.js` thread rendering for objects, and in `index.js` the store accessor `getNotes()` (reads/creates `chatMetadata[NOTES_KEY]`, saves with `saveMetadataDebounced`) plus `openDossier(id)` popup (list facts with delete buttons, add-note input) and People-tab "Dossier" button; `paintHud` passes `notes`.
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** Commit `feat(hud): dossier in the person card, notes that survive swipes`.

### Task 4: Faces (`faces.js`, `hud.js`, `style.css`)

**Files:**
- Create: `faces.js`
- Modify: `hud.js` (`face()`), `index.js` (pass `faceFor` handler), `style.css`
- Test: `tests/selftest.js`

**Interfaces:**
- Produces (`faces.js`): `monogram(name): {letter:string, hue:number}` (first letter uppercased or `?`; hue = stable hash of the lower-cased name mod 360); `pickSprite(sprites:{label,path}[], label:string, fallbacks=['neutral']): string|''` (exact label, else fallback labels, else first sprite path, else ''); `async spriteUrls(folder): Promise<{label,path}[]>` (cached per folder; `fetch('/api/sprites/get?name=…')` with `getRequestHeaders`-free GET; `[]` on any failure); `expressionOf(folder): string` (reads `lastExpression[folder]` from `../../expressions/index.js` via guarded dynamic import; `''` if unavailable).
- Consumes: HUD person rows (`avatar`, `label`, `main`, `isYou`).
- Rule: order sprite (main person with a card whose sprite folder has files) → avatar → monogram for everyone **except** background people with no avatar, who get the monogram; the user row uses persona avatar then monogram.

- [ ] **Step 1: Failing tests**: `monogram('Fern')` → `{letter:'F',hue}` and identical hue on repeat/case change; `monogram('')` → `?`; `pickSprite([{label:'joy',path:'a'},{label:'neutral',path:'b'}],'anger')` → `'b'` (fallback), `…,'joy')` → `'a'`, `[]` → `''`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement `faces.js`; `hud.js face(p)` renders `<img>` for sprite/avatar and `<span class="iw-hud-face is-mono" style="--hue:…">F</span>` otherwise; sprites resolve asynchronously (draw avatar/monogram first, swap and redraw when the sprite list arrives); CSS for mono disc in theme colours (`hsl(var(--hue) 35% 38%)`) with `prefers-reduced-motion` respected.
- [ ] **Step 4:** run → PASS. **Step 5:** Commit `feat(hud): sprite, avatar or monogram faces`.

### Task 5: Hints (`hints.js`, `index.js`, `hud.js`)

**Files:**
- Create: `hints.js`
- Modify: `index.js` (settings `hints`: `off|request|auto`, `hintTone`: `nudge|options`; call; cache; HUD wiring), `hud.js` (lightbulb button + list)
- Test: `tests/selftest.js`

**Interfaces:**
- Consumes: `perceive()` view (Task 3).
- Produces (`hints.js`): `HINT_SYSTEM` (one JSON object only); `hintBrief(view): string` (compact lines built **only** from the view: place + now, threads `id=name`, people `id=label: tags; mind; learned`, items `id=name (where)`, exits `id=name Nm`; ≤ 1,200 chars); `hintPrompt(view, tone, lastLine): string` (asks for ≤ 4 ideas as `{"hints":[{"text":"…","src":"id"}]}`; `text` ≤ 90 chars, first-person action phrasing for `options`, a question/nudge for `nudge`; never write {{user}}'s words); `parseHints(raw, view): {text,src}[]` (JSON parse tolerant like `parseJson`; drops entries whose `src` is not an id present in the view; ≤ 4; text clamped to 90).
- Produces (`index.js`): `requestHints()` (one `backgroundGenerate` with `maxTokens:300`, `noReasoning`, chosen model; cached on `state.scene.hints` keyed by `meta.tick`; skip if busy; results dropped if epoch/chat changed); clicking a hint calls `prefillAction(text)`; mode `auto` runs `requestHints()` after each successful director pass; HUD lightbulb shows "Nothing new comes to mind." on empty.

- [ ] **Step 1: Failing tests**: `hintBrief` never contains a person's `hidden`, `secrets`, `appearance` or an unknown person's real name (use a world with a hidden-flagged secret and `nameKnown:false`) and is ≤ 1,200 chars; `parseHints` drops `src:'ghost'`, accepts fenced JSON, caps at 4 and 90 chars, returns `[]` on garbage; `hintPrompt` mentions the tone wording and forbids speaking for {{user}}.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS. **Step 5:** Commit `feat(hints): ideas from what you know, never sent`.

### Task 6: Settings UI and call wiring (`settings.html`, `index.js`)

**Files:** Modify `settings.html`, `index.js`, `style.css`. Test: `tests/selftest.js` (settings migration pure helper).

**Interfaces:**
- Produces (`index.js`): settings `modelMode: 'current'|'profile'|'model'`, `modelSource: 'openrouter'|'current'`, `modelId: string`; `migrate`: absent `modelMode` → `'profile'` when `profileId` non-empty else `'current'`; helper `backgroundOpts(): {profileId,model,viaOpenRouter}` used by **every** `backgroundGenerate` call (director, bootstrap, forge, hints); UI: mode select; profile dropdown visible for `profile`; for `model`: source select, search box with `<datalist>` of `modelOptions(list, query)` (shows `id — $in/$out per M, ctx`) filled by `fetchModels()` on first open (cached 30 min, error note inline, free text always allowed), "Recommended" fill button that sets `deepseek/deepseek-v4.1-flash`.
- Pure helper exported from `engine.js` or new function in `models.js`: `migrateModelMode(s): 'current'|'profile'|'model'`.

- [ ] **Step 1: Failing test** for `migrateModelMode({profileId:'x'})→'profile'`, `({})→'current'`, `({modelMode:'model'})→'model'`.
- [ ] **Step 2–4:** implement, run, PASS. **Step 5:** Commit `feat(settings): model picker and hint options`.

### Task 7: Verify, document, release

**Files:** Modify `manifest.json`, `index.js` (`VERSION = '2.3.0'`), `README.md`, `CHANGELOG.md`, `STATE.md`; add selftest for the director budget.

- [ ] **Step 1:** `node tests/selftest.js` (IW and IA) and `node --check` every `*.js` in both repos → all pass; sibling parity test green.
- [ ] **Step 2: E2E** in an isolated ST (`--configPath/--dataRoot`, mock OpenAI-compatible server on a free port, dev worktree loaded as user extension): build world; director reply containing `learned` adds facts, toast shows; swipe back/forward removes/restores them while a note and a deleted fact persist; hint request returns clickable ideas and click fills the box without sending; faces show monogram for a background person; model picker mode switches and writes expected request (`chat_completion_source`, `model`, `reasoning_effort:'none'` observed in mock log); 375 px width still fine. Record what was **not** verified (real OpenRouter/DeepSeek call, real expression sprites).
- [ ] **Step 3:** Update docs (README features + settings table + debug log location; CHANGELOG 2.3.0 in plain "- " lines; STATE.md verified/not verified/next 2.4–2.5), bump `manifest.json`.
- [ ] **Step 4:** Commit, push `main`, wait for CI green on that SHA, query Dependabot/code-scanning/secret-scanning alerts (must be 0 or fixed), tag `v2.3.0`, build payload-only zip (`manifest.json`, `*.js`, `style.css`, `settings.html`, `README.md`, `CHANGELOG.md`, `LICENSE`; no tests/docs/.github), create GitHub release, verify uploaded asset size/hash against the local zip. Push the IA sync commit (no IA release).
- [ ] **Step 5:** Final report with copy-paste changelog block.

## Self-review
- Spec coverage (2.3.0 scope): model picker → T1/T6; dossier + persistence of user edits → T2/T3; Tier-0 faces → T4 (items/icons already exist, no work); hints incl. leakage guard → T5. Deferred by design: Tier-1 art, place art/particles (2.4); hourly routines, relationship, recap, rumours (2.5).
- Deviation from spec, deliberate: "Pick a model" fails loudly instead of silently falling back to another provider when no OpenRouter key exists (silently sending the story to a different provider than chosen is a privacy surprise); local backends use model-name override with free text (no status-route listing yet).
- Types consistent: `learned {k,t,at}`; fact key via `factKey`; `scene.fresh {id,t}`; hint `{text,src}`; view `threads {id,name}` consumed by `hud.js` and `hints.js`.
