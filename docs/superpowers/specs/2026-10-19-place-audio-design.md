# Immersive Worlds 2.6.1 — "Places you can hear" design

Status: approved 2026-10-19 · builds on 2.6.0

## Intent
2.6.0 gave the weather a voice. A room is still silent: a tavern with no fire, a harbour with no water, a forest with no birds. The same state already knows the place kind and the time slot, so the second bed is another table, not another subsystem.

## Goals
1. **Continuous place layers** under the weather bed: water, fire, room tone, leaves, distant hum. Five textures, one mix per place kind.
2. **Synthesised one-shots** where they belong: birds by day in a forest, drips in a cave, chairs and coins in a tavern, a creak on a ship, footsteps on a road.
3. **World-driven cues**: a footstep when someone arrives, a door when someone leaves — from `scene.arrived` / `scene.left`, once per tick, never on a repaint.
4. Still no files. Every sound is noise, filters and envelopes.

## Non-goals
- No voices, no crowd murmur, no music: they cannot be synthesised convincingly and need a sample pack. That is 2.6.2, opt-in, with a licence file.
- No second bus for "the room through the door". Meaningful once there are voices; useless with water and fire.
- No change to weather behaviour, prompt, schema or chat metadata.
- No per-place bespoke code: a place is a mix of five layers and a short event list.

## Design
- `LAYERS = [water, fire, room, leaves, hum]`; `PLACE[kind]` gives gains 0..1. Unknown kinds use `default`.
- `placeSpec(kind, slot, {volume, place})` returns `{kind, layers, events}`.
- `EVENTS[kind]` is a short weighted-by-repetition list; `bird` is filtered out at dusk and night.
- `audioSpec(state)` merges the weather spec, the layers and the event list into one object, so the player still has one thing to apply and one key to compare.
- `player.js` builds five more noise chains and two LFOs (a slow wash on water, a fast flutter on fire and leaves), plus a `spark(kind)` voice per one-shot: bird, drip, creak, footstep, door, coin, chair, page.
- One event every 2.5–8 s, never more than one per 700 ms, never while the tab is hidden.
- Cues are passed separately (`syncAudio(spec, {cues})`) and fire immediately, so an arrival lands with the HUD glow.
- Two settings: **place beds** and **one-shots**, both on, under the existing Sound block. Someone who wants rain and nothing else can have it.

## Risks
- Layering a place bed under a weather bed is where gain staging gets fiddly; the whole mix may need one pass by ear.
- Random one-shots are divisive; the 700 ms floor and a switch are the mitigation.
- Headless verification can prove the graph moves, not that it sounds good.
