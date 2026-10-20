# Immersive Worlds 2.6.0 — "Weather you can hear" design

Status: approved 2026-10-19 · builds on 2.4.1 (schema v4, unchanged)

## Intent (the why)
The world is already visible: the backdrop grades the light, particles fall, the HUD names the place and the weather. It is still silent. The operator asked for rain, thunder and the like, because the one thing missing from a room described in text is the sound of it. Sound is also the cheapest immersion left: the state that drives it is already computed every turn.

## Goals
1. A **continuous weather bed** that follows `weatherClass(state)`: rain intensity, wind, the hush of snow, the dullness of fog.
2. **Thunder**, timed after a **lightning flash**, only in a storm.
3. **Indoors is quieter and duller**, driven by the place kind the backdrop already uses — the walls do the work.
4. It **follows the state, not the reply**: swiping, regenerating and deleting rewind the sound exactly as they rewind the HUD, because the mixer is a renderer of the injected world.
5. Off by default, one master volume, silence while the tab is hidden.

## Non-goals / anti-goals
- No sound files. Nothing downloaded, nothing licensed, no 30-second loop heard for an hour.
- No place beds, voices, music, footsteps, one-shots or haptics in this release. Those need a sample pack and are 2.6.1 at the earliest.
- No new model calls, no new prompt text, no new chat-metadata key. Audio is presentation: it lives in settings and is derived from state that already exists.
- No change to story state, the director, the scene brief or the schema.
- Never autoplay on load; never make a sound the operator did not switch on.

## Constraints
- SillyTavern ≥ 1.18, plain ES modules, no build step, no dependencies.
- `kit.js`, `llm.js`, `models.js` and the shared kit block of `style.css` stay byte-identical with Immersive Adventures.
- `prefers-reduced-motion` disables the lightning flash (photosensitivity); audio is not tied to it, it has its own switch.
- Pure logic in `audio.js` (node-testable, no DOM, no WebAudio); all nodes in `player.js`.
- CI + `node tests/selftest.js` extended for every new rule.

## Design

### 1. `audio.js` — pure
- `ENCLOSED = {interior, tavern, temple, cave, ship}`; `isEnclosed(loc)` uses `placeKind(loc.type, loc.name)`, the same classifier the backdrop uses, so sound and picture never disagree about what a place is.
- `BEDS`: one row per weather kind `weatherClass` can return (clear, cloudy, overcast, rain, storm, snow, fog, haze, wind, hot, cold). Each row is `{rain, lp, hp, roar, roarLp, wind, windLp, whistle}` — gains 0..1 and filter cutoffs in Hz. Clear is all zeros: no weather means silence, not a hum.
- `weatherSpec(kind, {volume, indoor})`: the row, scaled. Indoors multiplies the gains by 0.35, cuts the low-pass to 0.22, and drops wind and whistle harder than rain.
- `audioSpec(state, {volume, indoor = null})`: weather kind from `weatherClass`, enclosure from the current location (or an explicit override for tests). Returns the spec plus `{kind, indoor, storm}`.
- `thunderDelay(rand)`: 400–4000 ms after the flash. `nextStrike(rand)`: 9–24 s between strikes.
- `specKey(spec)`: a stable string so the player can skip identical updates.

### 2. `player.js` — WebAudio
One `AudioContext`, built lazily on first use, resumed on the first pointerdown (autoplay policy). One graph for the whole session: stereo noise buffers → filters → gains → master → destination, with one slow LFO nudging rain and wind so nothing sits perfectly still. Beds move gains and cutoffs with `setTargetAtTime`, so switching weather never clicks.

- `syncAudio(spec, {thunder, onFlash})`: apply, and own the storm timer. The timer fires `onFlash()` then the clap after `thunderDelay()`. Only rescheduled when the storm state actually changes, so a HUD repaint cannot postpone thunder forever.
- `stopAudio()`: ramp to zero, cancel the timer, suspend the context.
- `testAudio(spec)`: apply a storm spec for ~4.5 s, then the caller re-syncs.
- `document.hidden` suspends the context and the timer skips strikes while hidden.

Thunder itself: a band-passed noise crack (1700 Hz, 12 ms attack), a low-passed rolling tail that sweeps 340 → 70 Hz over 3 s, and a 58 → 27 Hz sine for the chest thump. Three short envelopes, no assets.

### 3. Lightning
`backdrop.js` gains `flash()`: a fixed `#iw-flash` layer above the UI, two pulses over ~900 ms, `display: none` under reduced motion. `index.js` passes `flash` to `syncAudio` as `onFlash`, so the picture and the sound are one event.

### 4. Wiring
`applyAmbient()` already runs on every `refresh()` — the same call that paints the HUD, the status strip, the backdrop and the particles. Audio joins it, unconditionally, because sound must not depend on the backdrop mode. That single hook is why swipes, deletes, travel and chat switches rewind the sound for free.

Settings: `audio` (off), `audioVolume` (60), `audioThunder` (on). Settings drawer gets a Sound block with a Test button.

## Release split
- **2.6.0** (this): weather bed, thunder + flash, indoor muffling, volume, test.
- **2.6.1** (not now): place beds and one-shots, once a small CC0 pack is chosen; the mixer already takes a place kind, so it is a table plus a loader.

## Left to the builder
- Whether the noise is generated per channel at 44.1/48 kHz — take `ctx.sampleRate`, do not assume.
- Exact gain staging so rain under a chat is present but never masks TTS.

## Risks to test
- A browser that never delivers a gesture before audio is switched on (context stays suspended, nothing breaks, no error spam).
- Tab hidden mid-storm (no strikes pile up, no sound on return until the next sync).
- Two chats with different weather, switched back and forth (the bed follows, no leak from the old world).
- Reduced motion on: no flash, thunder still audible.
