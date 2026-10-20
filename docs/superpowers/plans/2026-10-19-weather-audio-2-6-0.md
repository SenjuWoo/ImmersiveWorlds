# Immersive Worlds 2.6.0 "Weather you can hear" — Implementation Plan

> **For agentic workers:** use `superpowers:executing-plans`. Steps use `- [ ]`.

**Goal:** a continuous, synthesised weather bed (rain, wind, snow hush, fog) with thunder after a lightning flash, muffled indoors, driven by world state and rewound by swipes like the HUD.

**Architecture:** pure `audio.js` (weather kind + place kind → gains and filter cutoffs) feeds `player.js` (one `AudioContext`, one graph, parameter ramps). `index.js` calls it from `applyAmbient()`, which already runs on every `refresh()`. `backdrop.js` gains `flash()`. No files, no dependencies, no prompt or schema change.

**Tech Stack:** plain ES modules, WebAudio, CSS animation, `node tests/selftest.js`, manual check in SillyTavern.

**Spec:** `docs/superpowers/specs/2026-10-19-weather-audio-design.md`

## Global Constraints
- ST ≥ 1.18; no build step; no dependencies; no audio files.
- `kit.js`, `llm.js`, `models.js`, `models.js` and the shared kit block of `style.css` untouched.
- No new chat-metadata key, no schema change, no director or prompt change.
- Off by default; master volume; silence while the tab is hidden; no flash under `prefers-reduced-motion`.
- Version `2.6.0` in `manifest.json` and `VERSION`.

## Review Focus
1. AudioContext never resumed (no gesture yet) → silent, no errors, no console spam.
2. `refresh()` runs many times a second in some flows → identical specs must not restart ramps or postpone thunder.
3. Chat switch / world removal / `enabled` off → sound stops, not fades into the next chat's world.
4. Weather text is free ("light rain", "eldritch haze", "") → `weatherClass` already falls back to `clear`; the bed must be silent, not throw.
5. Reduced motion → no flash, thunder still plays.

---

### Task 1: `audio.js` (pure)
**Files:** create `audio.js`

- [ ] `ENCLOSED`, `isEnclosed(loc)`, `BEDS` (11 weather kinds), `weatherSpec`, `audioSpec`, `thunderDelay`, `nextStrike`, `specKey`, `volumeOf`.
- [ ] `weatherSpec('clear')` is all zeros; unknown kinds fall back to `clear`.
- [ ] Indoor scaling: gains ×0.35, low-pass ×0.22, wind ×0.4, whistle ×0.2.

### Task 2: `player.js`
**Files:** create `player.js`

- [ ] Lazy `AudioContext`, graph built once: rain (hp→lp), roar (lp), wind (lp), whistle (bp), one LFO on rain+wind gains, master → destination.
- [ ] `syncAudio(spec, {thunder, onFlash})`, `stopAudio()`, `testAudio(spec)`.
- [ ] Thunder: crack + sweeping rumble + sub; `nextStrike` timer only restarted when storm state changes.
- [ ] Resume on first `pointerdown`; suspend on `document.hidden`; skip strikes while hidden.

### Task 3: Lightning
**Files:** modify `backdrop.js`, `style.css`

- [ ] `#iw-flash` fixed layer, `flash()` restarts a 900 ms two-pulse animation, removed with the backdrop layer.
- [ ] `@media (prefers-reduced-motion: reduce) { #iw-flash { display: none } }`.

### Task 4: Wiring
**Files:** modify `index.js`, `settings.html`

- [ ] `DEFAULTS`: `audio: false`, `audioVolume: 60`, `audioThunder: true`.
- [ ] `applyAudio()` + call at the top of `applyAmbient()`.
- [ ] Settings Sound block: enable, volume range (live `input`), thunder, Test sound.
- [ ] `VERSION` and `manifest.json` → `2.6.0`.

### Task 5: Tests
**Files:** modify `tests/selftest.js`

- [ ] clear is silent; rain audible; storm has wind; snow is dark; indoor quieter and duller; volume scales; unknown weather falls back; enclosure table; thunder delay and strike gap ranges with a seeded rand; `specKey` stability; `index.js` wiring present.

### Task 6: Docs and release
**Files:** `README.md`, `CHANGELOG.md`, `STATE.md`

- [ ] Changelog entry, README bullet + settings row + project map + honest status, STATE verified block.
- [ ] `node --check` every file, `node tests/selftest.js`, commit, push, CI green on that SHA.
