# Changelog

## 2.2.0 — 2026-10-12

From play-testing 2.1.

- Only what you sense now means what your character actually noticed: covered or unseen things stay off the HUD, and minds are your read of people ("wants: some time alone?"), not their true intent. The truth goes to a hidden line the narrator keeps and the Everything mode shows.
- Main cast vs background: character cards keep full state and a portrait; people the world invents are background (a name and a few tags, no placeholder portrait) and cost far fewer tokens.
- Go and Peek put the action into your message box ("*I make my way to the Creek.*"), so the story sees you move.
- A move you chose can no longer be undone by the next world update, even if the narrator writes you somewhere else; moving clears your old position.
- Comings and goings (someone leaving, arriving, a known place named) update the world right away, whatever "Run every" is set to.
- The director is told that animals and people are never items, and only your own message may move you.
- Tests: 63.

## 2.1.0 — 2026-10-12

The immersion update. Worlds from 2.0 load unchanged.

- Immersion HUD in the empty space beside the chat: scene top-left (place, time, weather, what is happening right now), people top-right (state tags, hover card with body, mind and what they hold), items bottom-left, a map of the places around you bottom-right. In SillyTavern's theme; shrinks on narrow screens, steps aside on phones and when a side drawer is open.
- Only what your character knows: strangers are "a dock guard" until named; next door is seen through an open way, heard through a door, blank behind a wall; Peek through a door. Setting "What the HUD reveals": only what I sense / everything nearby / everything (secrets too).
- Arrivals glow and announce themselves; departures show where people went.
- World logic in code: paths have walking times; moving follows the paths and costs the time (Go on the map, /iw travel, and moves the story implies); people walk to places instead of teleporting; time only jumps when the story sleeps, waits or travels; new items and people appear only where the story is; impossible moves are rejected and logged.
- Per-person state (restraints, clothing, position, condition, mood, wants, attitude, holding) kept for everyone in the scene, and your character's visible state (never feelings).
- Character sheets win: the director reads each present person's card or profile and your persona before changing them.
- The roleplay prompt now carries people's visible state, exits with walking times and what can be heard next door (~590 chars in a typical scene).
- Open threads only show on the HUD once the story has touched them.
- Tests: 55.

## 2.0.0 — 2026-10-11

Rebuilt from the ground up. Old worlds load unchanged (same chat-metadata key); old settings migrate.

- Worlds are per chat and only exist when you create one (Build world / Start). Chats without a world inject nothing and make no calls. (1.x auto-created a world in every chat.)
- Panel rebuilt in SillyTavern's own style: MovingUI panel, theme colours, wand-menu entry, native settings drawer. Same visuals as Immersive Adventures.
- Status strip above the chat input (day, time, weather, place); time-of-day tint kept.
- Swipe-, regenerate- and delete-safe: each reply caches its world patch; swiping re-applies it with no extra call; regenerating rewinds first; deleting a reply rewinds the world. Stale background results are dropped.
- Director reads only the new exchange, gets a compact line-format world, and returns only what changed. Whole director request ~2 k chars (1.5.0: ~4.2 k of instructions and schema before any state or transcript).
- Scene brief at depth 1 with a 255-char instruction line (1.5.0: 1,340 chars), so the chat history above it stays prompt-cacheable.
- Background calls go through a chosen Connection Profile, with per-provider reasoning off by default and no change to your main connection settings; falls back to the current connection.
- Routines move people only when the time of day turns over; explicit moves win. Caps never evict anyone in the current scene.
- Forge and Make card (character card + world lorebook) kept; card text reads naturally.
- `/iw` command (open, start, build, update, travel, brief) and macros `{{iwTime}}` `{{iwDay}}` `{{iwWeather}}` `{{iwLocation}}` `{{iwScene}}`.
- Hidden machine lines from Immersive Adventures are stripped before the director sees a reply.
- Debug log toggle (browser console, Verbose level); version and failures always logged.
- Tests: `node tests/selftest.js` (26). CI checks every file and runs them.

## 1.5.0

- NPC dawn/day/dusk/night routines; inspector shows each routine.

## 1.4.0

- Character cards with a world lorebook; Forge; quests in the World tab.

## 1.3.0

- Token-lean director; detached director; crash guards.

## 1.2.0

- Active materialization; atmosphere card; growth budgets.

## 1.1.0

- Reasoning-safe OpenRouter/DeepSeek path; prose scene brief.

## 1.0.1

- First published build.
