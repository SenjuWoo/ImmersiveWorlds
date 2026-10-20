<p align="center">
  <img src="assets/mark.svg" width="72" height="72" alt="Immersive Worlds mark">
</p>

<h1 align="center">Immersive Worlds</h1>

<p align="center"><strong>A city that keeps living between messages.</strong></p>

<p align="center">
  SillyTavern extension that gives a chat a persistent world:<br>
  clock, weather, places, people with routines, items, factions and open threads.
</p>

<p align="center">
  <a href="https://github.com/SenjuWoo/ImmersiveWorlds/actions/workflows/ci.yml"><img src="https://github.com/SenjuWoo/ImmersiveWorlds/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2ee6c5?labelColor=0d0f11" alt="MIT License"></a>
  <a href="https://github.com/SenjuWoo/ImmersiveWorlds/releases/tag/v2.7.0"><img src="https://img.shields.io/badge/release-v2.7.0-8f9aa6?labelColor=0d0f11" alt="v2.7.0"></a>
  <img src="https://img.shields.io/badge/SillyTavern-%E2%89%A5%201.18.0-8f9aa6?labelColor=0d0f11" alt="SillyTavern 1.18+">
</p>

<p align="center">
  <a href="#install">Install</a>
  ·
  <a href="#usage">Usage</a>
  ·
  <a href="#token-cost">Token cost</a>
  ·
  <a href="#settings">Settings</a>
  ·
  <a href="#honest-status">Status</a>
</p>

## Why it exists

A lorebook is a dump. A roleplay city is a simulation: time passes, weather shifts, people have jobs and routines, a shop exists once you mention it, and the next reply already knows the street you are standing on.

Immersive Worlds keeps that state in the chat and gives the model a short scene brief each turn. It never writes your character's words, thoughts or choices.

## What you get

- **Immersion HUD** in the empty space beside the chat: the scene top-left (place, time, weather, what is happening right now), the people here top-right (2–3 state tags each; hover for body, mind and what they hold), items bottom-left, and a map of the places around you bottom-right
- **Dossier on everyone**: what you have *learned* about a person (what they like and dislike, their history, what they promised, how they stand with you), dated and shown in their card; remove a fact, or add your own note; your edits survive swipes and deletes, and nothing is in the dossier that the story has not shown you
- **Ideas button** (💡): "what could I do next?" gives up to four ideas drawn only from what you know (people's wants and what they said, things at hand, places nearby, open threads); click one to drop it into your message box (it never sends); on request, after every update, or off
- **Faces for everyone**: the character's expression sprite when it has them, else the avatar, else a coloured monogram
- **Pick the background model**: current connection, a connection profile, or any OpenRouter model from a live searchable list (DeepSeek V4.1 Flash is one click), or a model name on your current (local or other) connection
- **Only what your character knows**: people's state is what you actually noticed: if you looked away or something is covered, it isn't there, and their mind is your read of them ("wants: some time alone?"), not their true intent; strangers show as "a dock guard" until someone says their name; next door is *seen* through an open way, *heard* through a door ("two voices arguing") or blank behind a wall; **Peek** through a door; a setting widens it to everything nearby or everything (secrets too)
- **Main cast and background**: character cards are the main cast (portrait, full card, a hidden truth the narrator keeps); everyone the world invents is a background person (a name and a few tags, no portrait), which keeps prompts small
- **Your moves are yours**: Go writes the move into your message, and nothing the narrator writes can move you somewhere you didn't go; comings and goings update the world right away, whatever "Run every" says
- **World logic in code**: every path has a walking time, moving follows the paths and costs that time, people walk instead of teleporting ("heading to the Waystone"), time only jumps when the story sleeps, waits or travels, and new things appear only where the story is
- **Living world per chat**, created only when you ask for one (chats without a world cost nothing)
- **Build world**: one background call drafts places, people, items, factions and threads from the character card, scenario and lorebook. **Start** seeds a minimal world with no model call
- **Scene backdrop** behind the chat, in its own layer (your own background is never touched): a time-of-day and weather grade (dawn, day, dusk, night, darker in storms), optionally a painted scene for the place you are in (city, harbor, tavern, forest, cave, ship, room and more), weather particles (rain, storm, snow, fog, dust) and a small sky-and-skyline strip in the scene card. Off in one click; particles stop under reduced motion
- **Weather you can hear** (off by default): a continuous bed synthesised in the browser — rain, downpour, wind, the hush of snow, fog, and thunder with a lightning flash while a storm lasts. Indoors is quieter and duller, because a tavern in the rain should sound like a room. No sound files, nothing downloaded. One volume, thunder on/off, a Test button, and silence while the tab is in the background. The room has a bed of its own: water in a harbour, fire and a room in a tavern, leaves in a forest, a cave's low tone — plus birds by day, drips, a chair, a coin, and a footstep when someone walks in
- **Generated pictures** (opt in, needs an image backend set up in SillyTavern's Image Generation extension): a picture of the place you are in, one for day and one for night (drawn the first time you are there; weather is drawn over it), portraits for people who have no picture of their own, and item pictures on request. One picture at a time, a per-chat cap, a Test button, and nothing is drawn from anything you have not seen
- **Background director** after each reply: clock, weather, ambient line, who moved where, new people/places/items the scene implied, chronicle notes
- **Routines** (dawn / day / dusk / night): people move with the clock, even off-screen
- **Swipe-, regenerate- and delete-safe**: every reply caches its own world patch, so browsing swipes re-applies the right state with no extra call, and deleting a reply rewinds the world
- Panel in SillyTavern's own style (MovingUI, theme colours, wand menu): World, People, Items, History, Manage
- **Status strip** above the chat input (day, time, weather, place) and the scene backdrop's time-of-day grade
- **Forge** world-consistent people on demand; turn anyone into a **character card with a world lorebook**
- Export / import world JSON; slash command and macros
- Background calls go to the model you pick (a fast, cheap one is ideal), with reasoning switched off by default and a 120 s timeout

Built for adults. Any resemblance to real persons or places is coincidental.

## Install

Requirements: **SillyTavern ≥ 1.18.0** (tested on 1.19.0) and any API SillyTavern already speaks.

**Extensions → Install extension** → `https://github.com/SenjuWoo/ImmersiveWorlds`

or

```bash
cd SillyTavern/public/scripts/extensions/third-party
git clone https://github.com/SenjuWoo/ImmersiveWorlds.git
```

Optional companion: [Immersive Adventures](https://github.com/SenjuWoo/ImmersiveAdventures) (RPG rules, combat, inventory). When both run, the world owns time and place and the adventure owns the hero.

## Usage

1. Open a chat, then **wand menu → Living World** (or `/iw`).
2. **Build world** (AI draft) or **Start** (minimal, no call).
3. Roleplay. After each reply the director updates the world in the background; the HUD follows.
4. **HUD**: hover or click a main character for the full card; click an item for its details; click a place on the map for **Go** (walks there, time passes, and puts "*I make my way to …*" in your message box to send or edit) or **Peek** (through a door, 1 minute, same idea). Click the place name to open the panel. Arrivals glow green, departures fade with where they went.
5. **Panel** (wand menu): **People**: Inspect, Forge, Add, Make card. **World**: travel by clicking an exit. **Manage**: Update now, Edit identity, Rebuild, Export / Import, Remove.

The HUD needs free space beside the chat (wide windows, or a narrower Chat Width in User Settings). With little space it shrinks to faces and icons; on phones it steps aside for the status strip and panel. A side hides while SillyTavern's drawer on that side is open.

| Command | Does |
| --- | --- |
| `/iw` | open the panel |
| `/iw start` / `/iw build` | minimal world / AI-drafted world |
| `/iw update` | one director pass now |
| `/iw travel Market` | walk to a place along the paths |
| `/iw ideas` | ask for ideas now and return them |
| `/iw brief` | return the current scene brief |

Macros: `{{iwTime}}` `{{iwDay}}` `{{iwWeather}}` `{{iwLocation}}` `{{iwScene}}`.

## Token cost

Measured against v1.5.0 on the same world:

| | v1.5.0 | v2.1.0 |
| --- | --- | --- |
| Fixed instruction text in every reply's prompt | 1,340 chars | 255 chars |
| Whole world note in a typical reply (people's state, exits with minutes, sounds) | — | ~590 chars |
| Director request (instructions + schema + world + exchange) | 4,227 chars of instructions and schema alone, plus the card, the whole state as JSON and 6 messages | ~3,100 chars for the whole request, character sheets included |
| Director input | last 6 messages | only the new exchange |
| Chats without a world | world auto-created, director runs | nothing injected, no calls |

The scene brief sits at depth 1 (`In-chat @ depth`), so everything above it, including the whole chat history, stays prompt-cacheable.

## Settings

**Extensions → Immersive Worlds.** The panel's Manage tab has the two most-used toggles.

| Setting | Default | What it does |
| --- | --- | --- |
| Enabled | on | Master switch |
| Update after each reply | on | Background director after every AI reply |
| Run every | reply | Director every N replies |
| Never write the user's words… | on | Agency line in the scene brief |
| Show time and place above the chat input | on | Status strip |
| Scene backdrop | Time-of-day grade | *Off* (your own background untouched), *grade only*, or *Painted scene* for the place you are in |
| Weather particles | on | Rain, snow, fog, dust; stops under reduced motion |
| Weather you can hear | off | The synthesised weather bed and thunder; silent while the tab is in the background |
| Volume | 60 | Master volume for the weather bed and thunder |
| Thunder, with a flash of lightning | on | The screen flashes and the clap follows 0.4–4 s later; no flash under reduced motion |
| Place sounds | on | Water, fire, room tone, leaves and a distant hum, mixed per place kind |
| One-shots | on | Birds, drips, creaks, footsteps, doors, coins, chairs and pages, at most one every 700 ms |
| Standing bar | on | A person's true feeling for you, −5…+5, as a bar in their card and a dot in the room list. Off removes the field from the director prompt entirely |
| Rumours | on | People who share a room pass on what they were told, at most one fact per room per tick, marked *heard from…* |
| Scene backdrop → Generated picture | off | A generated picture of the place, day and night (needs an image backend); the painted scene shows until it is ready |
| Most pictures per chat | 12 | Cap on generated pictures (4–40) |
| Offer a Draw button on item cards | off | Item pictures, only when you press it |
| Draw portraits for people with no picture | off | Only people the HUD shows, from how you see them |
| Test image generation / Clear generated art | | Draws one small picture to prove the backend works; forgets this chat's pictures (files stay on disk) |
| Show the HUD | on | The floating HUD beside the chat (the status strip hides while it shows) |
| What the HUD reveals | Only what I sense | Or *Everything nearby*, or *Everything* (real names, hidden truths, secrets) |
| Background model | Current connection | Current connection, a connection profile, or *Pick a model* |
| Send it to / Model | OpenRouter | With *Pick a model*: OpenRouter (uses the OpenRouter key saved in SillyTavern; live list with prices) or the current connection with a model name you type (local backends) |
| Ideas button | On request | On request, after every update, or off |
| Style | Actions | Ideas as clickable first-person actions, or gentle nudges |
| Use expression sprites as faces | on | Character sprites when available |
| Skip model reasoning | on | Reasoning off for world updates (faster, cheaper) |
| Pause the director if the API rejects its request | on | Stops retry storms on providers that refuse the call |
| Growth | Lively | How much new content each pass may add |
| New people / items / places / off-screen events | on | Creation switches |
| Update tokens / World-build tokens | 1200 / 3000 | Response budgets |
| Temperature | 0.4 | Background-call temperature (Forge uses at least 0.8) |
| Prompt depth | 1 | Chat depth of the scene brief |
| Debug log | off | Verbose log in the browser console |

## Log

The browser console (F12 → Console) always shows `[Immersive Worlds] v2.6.1 ready` and every failure with its cause. Turn on **Debug log** in the settings for the resolved settings at startup, every director pass, and every move or change the world rules rejected (with the reason); it logs at the *Verbose* level, so enable that level in the console filter.

## Project map

```text
manifest.json   SillyTavern manifest (loading_order 6, activate hook)
index.js        host: settings, per-chat world, injection, director pipeline, panel, commands, macros
engine.js       pure world model: schema, patching under the rules, scene brief, prompts
rules.js        pure: paths with walking time and openness, shortest routes, time caps, people in transit, rumours
senses.js       pure: what the user's character perceives (the HUD's view), Peek
hud.js          the floating HUD
llm.js          background calls (profile / OpenRouter model / current connection → generateRaw), JSON parsing
models.js       OpenRouter model list, reasoning-effort fallback, error wording (identical in Immersive Adventures)
dossier.js      what you learned about each person, your notes and removals
hints.js        the Ideas prompt and a filter that keeps only ideas resting on things you can see
faces.js        sprite, avatar or monogram faces
scenery.js      pure: place kind from free text, sky palette per time and weather, particle spec
backdrop.js     the backdrop layer: grade, painted scene, skyline drawings
particles.js    the weather canvas (rain, snow, fog, dust)
audio.js        pure: weather kind + place kind -> gains and filter cutoffs, thunder timing
player.js       the weather you can hear: one AudioContext, noise and filters, parameter ramps
art.js          pure: picture store, safe prompts, one-at-a-time queue (the image call itself is in index.js)
kit.js          shared panel kit (identical in Immersive Adventures)
settings.html   settings drawer
style.css       shared kit block + backdrop + particles + HUD
tests/          node tests/selftest.js
```

State lives in chat metadata key `immersive_worlds_state_v1`; your dossier notes and removals live in `immersive_worlds_notes_v1`. Worlds from 1.x, 2.0, 2.1 and 2.2 load unchanged.

## Honest status

Verified:

- `node tests/selftest.js` — 105 tests (new in 2.4.1: picture paths with any name (apostrophes, accents, kana), prompts stripped of anything the command parser could run, art store, safe prompts that carry no weather, pipe or macro, the picture queue (one at a time, cap, pause after two failures, reset drops late results), `look` set once and shown only for people you know, item pictures only for what you hold or see; new in 2.4: free-text weather wording, type-before-name place kinds, weather in the painted scene, place kinds from free text, sky and particle rules, backdrop settings migration, skyline drawings, particle maths, scene art in the HUD view without any place description; new in 2.3: dossier rules and caps, a nested dossier list that cannot wipe it, deletions that survive the director rephrasing, notes that survive a rewind, perceived dossier without hidden truth, ideas that never leak and are filtered to known things, faces, model list and reasoning fallback): paths and walking time, rejected moves, user-chosen moves the director cannot undo, movement detection, people in transit, time caps, creation only where the story is, main vs background people, perceived state and hidden truth, state only for people present, perception per path openness and reveal mode, names and threads hidden until known, Peek, migration, prompt sizes
- End-to-end in an isolated SillyTavern 1.19.0 against a mock model: HUD in all four corners at 1920, 1600, 1500 and 1280 px; hover cards; arrival glow and toast; a heard room, Peek and Go; a two-hop move charged its walking time; a bogus move rejected and logged; a person walking in over time; a drawer hiding its side; reveal modes; delete rewinding the HUD; no unknown name or secret in the default HUD; world note ~590 chars, director ~3,100 chars
- 2.3.0 end-to-end in an isolated SillyTavern 1.19.0 against a mock model: facts learned from a reply appear in the card with a "learned" toast; a note and a removed fact stay put while swiping back and forth (the swiped reply's facts come and go); Ideas lists only ideas resting on known things and a click fills the message box without sending; the model override reaches the connection; the live OpenRouter list (463 models, DeepSeek V4.1 Flash pinned first) fills the picker; an OpenRouter call without a key reads as a plain instruction; settings drawer; phone width
- 2.4.0 end-to-end in an isolated SillyTavern 1.19.0: backdrop in all four time slots with clear, rain, snow, fog and storm over harbor, city, tavern and interior places; mode switch grade/painted/off (the layer hides and the particle canvas is removed); particles on and off; the HUD strip at full width and hidden when compact; phone width (no horizontal scroll, HUD steps aside); no console errors. Painted scenes are hand-drawn silhouettes, not generated pictures
- 2.4.1 end-to-end in an isolated SillyTavern 1.19.0 against a stub `/imagine`: a place picture is drawn on first visit and cached, day and night get one each (dawn shares day, dusk shares night), travelling away mid-draw lands the picture under its own place, a chat switch drops a late result, two failures in a row give one toast and pause, Test resumes, the cap and Clear work, portraits use the look (never the sheet's appearance), item pictures draw, redraw and remove on request. **Not run against a real image backend**
- Reload persistence of the world and the HUD; Forge, Make card and swipe browsing were verified in 2.0.0 (their host code did not change; not re-run this round)

- 2.7.0: `npm test` 126/126; schema v5 migration, `bond` clamping, the prompt carrying `"bond"` only when the switch is on, and the rumour rules (same room only, `history`/`bond`/`promise` only, never twice, same tick same gossip). **The HUD bar and the *heard from* line are not visually verified** — `hud.js` imports SillyTavern's own modules, so a standalone browser probe drags in the whole app; the data reaching it is tested, the markup is not
- 2.6.1: `npm test` 118/118; the place bed driven in headless Edge with every gain node recorded — a tavern mixes fire 0.115 and room 0.127 at volume 0.6, a harbour mixes water 0.196 and hum 0.029, turning place sounds off ramps all five layers to zero, twenty identical repaints add no nodes, and a `drip` cue builds its two oscillators on the spot. **Not heard through a speaker** (headless has no audio device) and **not yet run inside SillyTavern itself**
- 2.6.0: `node tests/selftest.js` 114/114 and `node --check` on every file; the audio graph driven for real in headless Edge (the extension's own `audio.js`/`player.js`/`backdrop.js` loaded over HTTP with every gain node recorded): a storm bed reaches its gain and holds it, twenty identical repaints create no new nodes, clear weather ramps back to silence, indoors is measurably quieter than the same rain outdoors (0.053 vs 0.133), the flash layer exists at z-index 900 and animates, and `prefers-reduced-motion` stops the flash being created at all. **Not verified against a real speaker** (headless has no output device) and **not yet run inside SillyTavern itself**

Not claimed:

- Director, Ideas and dossier quality against a real model (all exercised against a mock; the parsers tolerate fences and prose); in particular the extra `learned` field on DeepSeek V4.1 Flash
- A successful OpenRouter call (no key was available; the request path and its error handling were checked)
- Expression sprites with a real sprite pack (the lookup is feature-detected; avatar and monogram faces were checked)
- SillyTavern 1.18 at runtime (the newer APIs used are feature-detected)
- The HUD re-laying itself on a live window resize was checked with a synthetic resize event (the test browser pane does not fire real ones)

## License

[MIT](LICENSE)
