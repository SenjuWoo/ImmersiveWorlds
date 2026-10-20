# Changelog

## 2.6.1 — 2026-10-19

Places you can hear. 2.6.0 gave the weather a voice; this gives the room one. Still no sound files.

- **Place beds**: five continuous textures — water, fire, room tone, leaves and a distant hum — mixed per place kind. A harbour has water, a tavern has fire and a room, a forest has leaves, a cave has both.
- **One-shots**: birds by day in a forest, drips in a cave, chairs and coins in a tavern, a creak on a ship, footsteps on a road. One every 2.5–8 s, never more than one every 700 ms, never while the tab is hidden.
- **World-driven cues**: a footstep when someone arrives and a door when someone leaves, once per tick, from the same `scene.arrived` / `scene.left` the HUD uses.
- Two new switches under Sound: **place sounds** and **one-shots**. The weather bed keeps working with both off.
- Still no voices, crowd or music: they cannot be synthesised convincingly and stay out until 2.6.2, behind an opt-in pack.
- Tests: 118.

## 2.6.0 — 2026-10-19

Weather you can hear. Worlds from 2.4 load unchanged; sound is off until you turn it on.

- **Sound**: a continuous weather bed that follows the world — rain, downpour, wind, the hush of snow, fog, and thunder while a storm lasts. Synthesised in the browser from noise and filters: no sound files, nothing downloaded, nothing to license, and no loop seam to get tired of.
- **Thunder with a flash**: the screen lights up and the clap follows 0.4–4 s later, so a near strike snaps and a far one rolls in.
- **Indoors is quieter and duller**: the same classifier that picks the backdrop's skyline decides whether you are under a roof, so a tavern in the rain sounds like a room and a market sounds like a street.
- **Volume, thunder on/off, Test sound**, and silence while the tab is in the background. Off by default.
- Sound is a view of the world, not a second state: it is driven from the same refresh as the HUD, so swiping, regenerating, deleting, travelling and switching chats rewind it exactly as they rewind the HUD.
- No new model calls, no prompt text, no new chat metadata, no schema change.
- Tests: 114.

## 2.4.1 — 2026-10-13

Scene visuals II: generated art (opt in). Worlds from 2.4 load unchanged.

- Generated place pictures: choose "Generated picture" under Scene backdrop. You get one picture of the place for day and one for night, drawn the first time you are there (weather is drawn over it, dawn uses the day picture, dusk the night one). The painted scene shows until it is ready.
- Portraits for people who have no picture of their own, drawn from how you see them (the director now writes a short `look` once per person; the sheet's appearance is never used).
- Item pictures: a Draw button on item cards (off by default), with Redraw and Remove.
- Uses SillyTavern's Image Generation extension, one picture at a time, with a per-chat cap (default 12), a Test image generation button and a Clear generated art button. Two failures in a row pause drawing with one message.
- Pictures are never made from anything you have not seen, and prompts carry no weather, people or macros.
- Picture file names with apostrophes, accents or non-Latin letters work; prompts are stripped of anything a slash command could act on; your own Image Generation "extend" and "edit prompt" settings no longer apply to these pictures; Test image generation runs through the same one-at-a-time queue; portraits work with the backdrop off; a picture that failed is not retried on every update.
- Tests: 105.

## 2.4.0 — 2026-10-13

Scene visuals I. Worlds from 2.3 load unchanged.

- Scene backdrop: the screen now follows the time of day (dawn, day, dusk, night) and the weather, in its own layer above your chat background. It never changes your background; switching it off brings it straight back.
- Painted scene (opt in): a drawn sky and skyline for the kind of place you are in (city, market, harbor, tavern, temple, forest, mountain, cave, desert, plains, road, ship, room).
- Weather particles: rain, storm, snow, fog and dust, with a setting; none under reduced motion.
- Scene strip: a small sky and skyline at the top of the HUD scene card.
- The "Tint the screen by time of day" checkbox became "Scene backdrop"; your choice carries over.
- Weather is read from free text ("light rain", "thick fog"), so particles and the grade follow what the model really writes.
- Tests: 95.

## 2.3.0 — 2026-10-13

Living senses I. Worlds from 2.2 load unchanged.

- Dossier: what you have learned about each person (likes, dislikes, interests, history, bonds, promises), dated, shown in their HUD card and a Dossier popup; remove facts or add your own notes (they survive swipes, regenerates and deletes). Only what the story showed you; the narrator prompt is untouched.
- Ideas (💡 on the HUD, wand menu, `/iw ideas`): up to four ideas for what to do next, built only from what your character knows; click one to put it in your message box (never sent). Off / on request / after every update; clickable actions or gentle nudges.
- Faces for everyone: expression sprite, else avatar, else a coloured monogram (background people no longer have an empty slot).
- Background model picker: current connection, a connection profile, or Pick a model: OpenRouter via a live searchable list with prices (DeepSeek V4.1 Flash in one click), or a model name on your current local/other connection. Reasoning is turned off with a fallback ladder (none, minimal, none given) and OpenRouter errors say what to fix.
- Director learns a compact `learned` field (max 3 facts per person per update, never hidden facts); known facts are listed so they are not repeated.
- Tests: 81.

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
