# STATE — Immersive Worlds

Updated 2026-10-11 · v2.0.0 · branch `main`

## Where things are
- Live checkout: `SillyTavern/public/scripts/extensions/third-party/ImmersiveWorlds` (this repo)
- Sibling extension sharing `kit.js`, `llm.js` and the kit block of `style.css` byte-for-byte: `../ImmersiveAdventures` (private repo). Edit both copies together; `tests/selftest.js` fails if they drift.
- Last known good: git tag `v2.0.0` / GitHub release zip. Previous line: `v1.3.0` tag (1.5.0 was never tagged).

## Verified (2026-10-11)
- `node tests/selftest.js` 26/26; `node --check` on every file
- E2E in an isolated SillyTavern 1.19.0 (`--configPath/--dataRoot` + OpenAI-compatible mock): build, director pass, swipe regenerate/browse, delete rewind, forge, card + lorebook, reload, 375 px width, settings drawer

## Not verified
- Real providers (director exercised against a mock only)
- SillyTavern 1.18 at runtime (newer APIs are feature-detected)

## Design decisions
- World only exists per chat when created (no auto-bootstrap). Injection: one 255-char instruction line + scene brief, IN_CHAT depth 1.
- Swipe safety: pre-turn snapshot in chat metadata `immersive_worlds_turn_v1` + per-message `extra.iw_patch` mirrored into swipe_info; epoch counter drops stale results.
- Background calls: Connection Profile → ChatCompletionService (cloned settings, reasoning off) → generateRaw fallback.
- Public API for Immersive Adventures: `globalThis.immersiveWorlds { version, isActive, getState, brief, travel }`.

## Next ideas (not started)
- None required. Possible: per-hour routines, map view.
