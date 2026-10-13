# STATE — Immersive Worlds

Updated 2026-10-13 · v2.4.0 · branch `main`

## Where things are
- Live checkout: `SillyTavern/public/scripts/extensions/third-party/ImmersiveWorlds` (this repo)
- Sibling extension sharing `kit.js`, `llm.js` and the kit block of `style.css` byte-for-byte: `../ImmersiveAdventures` (private repo). Edit both copies together; `tests/selftest.js` fails if they drift.
- Last known good: git tag `v2.4.0` / GitHub release zip; previous `v2.3.0`, `v2.2.0`, `v2.1.0`, `v2.0.0`, then `v1.3.0` (1.5.0 was never tagged).
- Roadmap: `docs/superpowers/specs/2026-10-13-living-senses-design.md`; 2.3.0 plan `docs/superpowers/plans/2026-10-13-living-senses-2-3-0.md`. Scene visuals plan (2.4.0 done, 2.4.1 next): `docs/superpowers/plans/2026-10-13-scene-visuals-2-4.md`. Next: 2.4.1 (opt-in generated art through the Image Generation extension: place backdrops per day/night, portraits, item pictures; Tasks 6-10 of that plan), 2.5.0 (hourly routines, relationship bars, "while you were away", rumours and suspicions).
- 2.1.0 design and plan: `docs/superpowers/specs/2026-10-12-immersive-hud-design.md` (+ mockup), `docs/superpowers/plans/2026-10-12-immersive-hud.md`.

## Verified (2026-10-13, 2.4.0)
- `node tests/selftest.js` 95/95; `node --check` on every file
- E2E in an isolated ST 1.19 (own data dir, port 8123, world injected into chat metadata): backdrop for dawn/day/dusk/night with clear, rain, snow, fog, storm over harbor, city, tavern and interior places; modes grade/painted/off (layer hides, particle canvas removed); particles on/off; HUD strip at full width and hidden when compact; 375 px width has no horizontal scroll; no console errors
- Found and fixed in E2E: a fixed layer with insets collapsed on phones (the body is fixed there), so the layer is sized like ST's `#bg1`; the grade over a painted scene is light (min .15) or night became black
- Not verified: reduced-motion emulation (logic reads `prefers-reduced-motion`), a real SillyTavern 1.18, silhouettes against user themes with light text

## Verified (2026-10-13, 2.3.0)
- `node tests/selftest.js` 81/81 (IW) and 69/69 (Immersive Adventures after mirroring llm.js and models.js)
- E2E in an isolated ST 1.19 (mock model on :5055): learned facts + toast, notes/removals survive swipe back and forth, Ideas filter drops unknown ids and a click fills the box without sending, model override reaches the connection (`my-local-model`), live OpenRouter list loads (463 models, DeepSeek V4.1 Flash first), OpenRouter call without a key gives the plain-language error, settings drawer, 375 px width (HUD steps aside, status strip stays)
- Found and fixed in E2E: ST only reports "Bad Request"/"Response not OK" so the reasoning ladder now steps down on any plain rejection (not only ones naming reasoning); hidden settings rows needed a CSS rule

## Verified (2026-10-12, 2.2.0)
- `node tests/selftest.js` 63/63
- Root cause of the 2.1 "teleported back to camp" report confirmed from the user's chat backup: Go lived only in a weak note + stale position; the next director pass used move_to from the narration. Fixed: Go prefills the message, director move_to is rejected right after a user move, old position cleared.
- E2E (isolated ST 1.19, dev worktree as user extension, mock, Run every = 3): director ran on reply 1 because the reply named a place; background person kept tags only and has no portrait; main card shows perceived mind, hidden truth only in Everything mode; Go prefilled the message, the update ran at once and its move_to back was rejected; injection carried the strong note, no stale position.

## Verified (2026-10-12, 2.1.0)
- `node tests/selftest.js` 55/55
- E2E in an isolated SillyTavern 1.19.0 (dev worktree loaded as a user-scoped extension, global copy disabled for the test user; mock model): HUD corners at 1920/1600/1500/1280, hover card, arrival glow + toast, heard room, Peek, Go, two-hop move charged, bogus move rejected, person walking in at ETA, right drawer hides right side, reveal modes, delete rewinds HUD, no unknown names/secrets in default HUD, world note ~590 chars, director ~3,100 chars

## Verified (2026-10-11, 2.0.0)
- `node tests/selftest.js` 26/26; `node --check` on every file
- E2E in an isolated SillyTavern 1.19.0 (`--configPath/--dataRoot` + OpenAI-compatible mock): build, director pass, swipe regenerate/browse, delete rewind, forge, card + lorebook, reload, 375 px width, settings drawer

## Not verified
- Real providers: director, Ideas and the new `learned` field on DeepSeek V4.1 Flash were only run against a mock; no OpenRouter key was available to test a successful call
- Expression sprites with a real sprite pack
- SillyTavern 1.18 at runtime (newer APIs are feature-detected)

## Design decisions
- World only exists per chat when created (no auto-bootstrap). Injection: one 255-char instruction line + scene brief, IN_CHAT depth 1.
- Swipe safety: pre-turn snapshot in chat metadata `immersive_worlds_turn_v1` + per-message `extra.iw_patch` mirrored into swipe_info; epoch counter drops stale results.
- Background calls: Connection Profile → ChatCompletionService (cloned settings, reasoning off) → generateRaw fallback.
- Public API for Immersive Adventures: `globalThis.immersiveWorlds { version, isActive, getState, brief, travel }`.

## Known limits / next ideas
- People crossing on the same road do not meet (travel is origin to destination).
- Immersive Adventures /ia-travel still says "Setting out" when Immersive Worlds refuses a route.
- The test browser pane fires no real resize events; live window resizing was checked with a synthetic event only.
- Possible: route/openness editing in the panel, per-hour routines.
