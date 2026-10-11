# Changelog

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
