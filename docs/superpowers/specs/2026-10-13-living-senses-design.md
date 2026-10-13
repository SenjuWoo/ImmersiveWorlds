# Immersive Worlds 2.3–2.5 — "Living Senses" design

Status: draft for approval · 2026-10-13 · builds on 2.2.0 (schema v3)

## Intent (the why)
The operator plays long text roleplay and has trouble keeping up with all the text. 2.1/2.2 put scene, people, items and map in a HUD. The next step is to make the world **readable at a glance** and **inspiring**: faces and places you can see, a record of what you have *learned* about each person, hints when you run out of ideas, hourly lives for people, and a free choice of background model (DeepSeek V4.1 Flash first, any OpenRouter or local model).

## Goals
1. **Dossier** per person: only what {{user}} has learned (interests, likes/dislikes, history told, feelings toward {{user}}, promises/debts), each fact dated, editable, removable, plus manual notes.
2. **Visuals** in two tiers. Tier 0 (free, always): expression sprite → avatar → monogram faces, item icons, place header art drawn from place type/time/weather, weather particles. Tier 1 (opt-in): generated portraits, place backdrops, item pictures through SillyTavern's own Image Generation extension.
3. **Hints**: "what could I do next?" ideas built only from what {{user}} knows (open threads, people's visible wants, items on hand, exits). Click puts the idea in the message box; never auto-sends.
4. **Model picker** for the background (director) calls: current connection / connection profile / pick a model (live OpenRouter list, recommended shortlist, free-text slug) / local endpoint models.
5. **Hourly routines**: people follow a schedule of time blocks instead of four fixed slots; the HUD shows "at the market until 15:00" only when {{user}} could know it.
6. **Small immersion extras** (code-only, no extra model calls): relationship bars from the dossier, a "while you were away" recap when you return to a place.

## Non-goals / anti-goals
- No hidden information on the HUD, dossier or hints (same rule as 2.1: only what {{user}} knows; "Everything" reveal mode stays the only exception).
- No image generation unless the operator turns it on; no surprise cost or queue storms; never block chat.
- Hints never write {{user}}'s words or choices into the story and never send.
- No new per-reply main-prompt cost: the narrator's world note stays about the same size (~600 chars typical).
- Not in this round: voice/TTS, multi-chat worlds.
- Must not break 2.0–2.2 worlds: migration is additive and silent.

## Constraints
- SillyTavern ≥ 1.18 (feature-detect newer APIs); runs as a third-party extension, plain ES modules, no build step.
- `kit.js`, `llm.js` and the kit block of `style.css` stay byte-identical with the sibling Immersive Adventures extension; the selftest fails on drift. Any `llm.js` change must be mirrored there in the same commit.
- Token discipline: dossier and hints ride on the existing director call; extra fields are compact, capped and omitted when empty. Hints "on request" cost one small separate call only when pressed.
- Swipe/regenerate/delete safety must hold for every new state (dossier facts, art, relationship values live in the same snapshot/patch mechanism).
- CI + `node tests/selftest.js` extended for every new rule; release only after CI green on the pushed SHA.

## Design

### 1. Dossier (schema v4, additive)
- Person gets `learned: [{k, t, at}]` (k = category `like|dislike|interest|history|trait|bond|promise|other`, t ≤ 120 chars, at = world time) and `notes` (user text).
- Director output gains `learned:[{id,k,t}]`, instructed: "record a fact only if {{user}} saw, heard or was told it in the new exchange; merge duplicates; at most 3 per person per update; nothing hidden". Engine dedupes (normalised text), caps 14 facts/person (oldest of lowest-priority category dropped), ignores unknown ids, and sets `known` flags as today.
- Surfaced as: a Dossier tab inside the HUD hover/click card and the panel's People tab; "just learned" highlight + one toast per update; edit/delete/add-note controls.
- Not injected into the narrator prompt (the story already contains it) → zero main-prompt cost.

### 2. Visuals
- **Tier 0 faces**: if the person's card has Expressions sprites, show the sprite for the current mood (read the Expressions extension's cached label/sprite; no extra classification calls from us); else avatar; else a monogram disc coloured from the name. Mood maps to the existing `mind.mood` text when no sprite.
- **Items**: type → icon + colour; small tooltip art-free.
- **Places**: header strip rendered from place `type`, time slot and weather (CSS gradients/silhouettes/particles), crossfades on travel; weather particles (rain/snow/fog/embers) respect `prefers-reduced-motion` and a setting.
- **Tier 1 generated art (opt-in, off by default)**: portraits for people without avatars on first meeting, place backdrop on first visit, item picture on click. Calls the Image Generation extension (`/imagine quiet=true`, returns a URL) from a single-file queue with a per-chat cap (default 12) and a visible "drawing…" state; prompts built only from *perceived* appearance tags (never `hidden`). URLs stored in `state.art[id]`; regenerate / remove per image; a "Test image generation" button in settings. Place backdrops are generated per (place, art slot): art slot `day` for dawn/day, `night` for dusk/night, so at most 2 pictures per place. Prompts carry no weather and no people (weather is drawn by particles and tint, so one picture serves every weather); dawn and dusk get a blue/amber CSS tint over the nearest picture. The picture is shown in the extension's own layer (`#iw-backdrop`) above `#bg1`, never by changing SillyTavern's background (that would lock it into the chat and grow its background list); turning it off restores the user's background.
- Honest limit: Tier 1 only works once an image-generation backend is set up in SillyTavern; until then it stays dormant and the free tier covers faces and places.

### 3. Hints
- Settings: **Off / On request (default) / After every update**; tone: *gentle nudge* or *concrete options*.
- Hints always come from their own small call fed the **same filtered brief the HUD uses** (never the director's `hidden` lines): ≤ 4 one-line ideas, each citing a source id (thread/person/item/place) that the engine checks is known to {{user}} before showing it. "On request": a lightbulb on the HUD. "With every update": the same call runs automatically after each world update (~250 tokens in, ~60 out). The director is not asked for hints.
- Clicking an idea fills the message box like Go/Peek do (`*I …*`). Hints are cached per reply and dropped on swipe/delete like other patches.

### 4. Model picker
- Director source: **Current connection · Connection profile · Pick a model**.
- Pick a model: OpenRouter list fetched live from the public models endpoint (no user data sent), searchable, with a pinned shortlist that includes `deepseek/deepseek-v4.1-flash` (verified live 2026-10-13: 1 M context, ~$0.044/M in, $0.63/M out, supports `reasoning` and `response_format`), plus free-text slug; for a local/custom active backend, list models from that backend through SillyTavern's own status route, free-text fallback. Reasoning is switched off per provider using the values the provider accepts (observed: OpenRouter rejects `reasoning.effort: min`; accepts `none|minimal|low|medium|high|xhigh|max`).
- Uses the user's existing key/connection through SillyTavern; never reads or stores secrets.

### 5. Hourly routines
- `routine` becomes an ordered list of `{from:"HH", loc}` blocks (3–5 per person typical). Existing four-slot routines convert on load (dawn 05, day 08, dusk 17, night 21). Bootstrap and director prompts ask for compact blocks only for main/active people.
- Engine: on each clock advance, each person's target = block for the current hour; they set off along routes (existing travel-time logic) and arrive after the route time. Explicit story moves and user-chosen moves still win.
- HUD/dossier show "usually at X from HH" only if `known` (e.g., learned or observed).

### 6. Extras (code-only)
- **Relationship**: `rel{trust,affection,fear,respect}` 0–100, nudged by director deltas for people in scene; shown as thin bars in the dossier. Capped, optional field.
- **While you were away**: on arriving at a place not visited for ≥ 1 h, compute the diff (who left/arrived, items moved) from state and show a one-line recap on the HUD.

### 7. Rumours and suspicions (added at approval, 2.5.0)
- `state.rumours: [{id, text, about, origin, spread:[locIds], heat 0-100, at, known}]`. Director may add/update rumours when the story gives cause (something witnessed, said, done in public); each carries who it is about (person/{{user}}/faction), where it started, and how far it has spread. Spread is code-driven: each hour a rumour with heat spreads along routes at a rate set by distance and the people who travel between places; heat decays. No model call for spreading.
- People may hold a **suspicion** about {{user}} or another person (`suspects:[{of, what, strength}]`). It shows in the dossier only once {{user}} has learned of it (told, overheard, or acted on visibly), and nudges that person's `rel` and routines (avoid, watch, report).
- HUD: a small "Word on the street" list of rumours {{user}} has heard (known only); hints can use them ("Mara heard about the fire: she might ask questions"). Rumours the player has not heard stay hidden, same rule as everything else.
- Narrator note: at most one line, only for rumours about {{user}} that have reached the current place (token-capped).

## Proposed release split (my call; override freely)
- **2.3.0** model picker, dossier, hints, Tier 0 faces/items.
- **2.4.0** drawn backdrop + real day/night grade + weather particles + HUD scene strip (no image backend needed).
- **2.4.1** Tier 1 generated art: place backdrops, portraits, item pictures.
- **2.5.0** hourly routines, relationship bars, recap, rumours and suspicions.

## Decisions from the builder check (my calls, not yours)
- **Model picker routing**: "Pick a model" sends to OpenRouter through SillyTavern when an OpenRouter key is stored server-side, or overrides only the model name when the active connection is already OpenRouter; if there is no key it fails loudly in settings (inline note + toast) and the director falls back to the current connection. Local backends: model name override on the active backend. The new model/source parameters are the only `llm.js` change; the picker UI lives in an IW-only module.
- **Sibling extension**: `llm.js` is mirrored byte-for-byte into the local Immersive Adventures checkout and committed there (its CI/tests must pass); no Immersive Adventures release unless you ask.
- **Who gets what**: dossier facts for anyone in the scene (background people capped at 6 facts, main at 14); relationship bars and hourly routines only for main people and people currently travelling or active; no promotion rule, background people stay light.
- **User edits persist across swipe/delete**: manual notes and deleted-fact marks live in a separate non-rewound store (`state.userNotes`, `state.hiddenFacts`), not in the per-reply patch snapshot.
- **Image prompts**: new director field `look` (≤ 200 chars, how {{user}} sees the person, same "only perceived" rule) used with tags; `appearance` and `hidden` are never used.
- **Routines in motion**: a person already travelling finishes the leg, then retargets; an unreachable or identical target means they stay put (logged). Four-slot routines convert on load only when the story has not already overridden them.
- **Planning scope**: detailed plan for 2.3.0; 2.4/2.5 are outlined and planned when they start. Schema bumps to v4 once, extra fields (`look`, `art`, `rel`) are added lazily and normalised, so older worlds load unchanged.

## Left to the builder
Exact CSS art, particle implementation, ids/ordering of UI, prompt wording within the token caps above, how the Expressions extension's current sprite is read without extra calls, which SillyTavern status route lists local models.

## Risks to test with a real provider (not just the mock)
Director JSON validity with the added `learned`/`hints` fields on DeepSeek V4.1 Flash; reasoning-off parameter acceptance; token growth per update; image queue behaviour when the backend is slow or absent.
