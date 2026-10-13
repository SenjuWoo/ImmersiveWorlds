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
  <a href="https://github.com/SenjuWoo/ImmersiveWorlds/releases/tag/v2.4.0"><img src="https://img.shields.io/badge/release-v2.4.0-8f9aa6?labelColor=0d0f11" alt="v2.4.0"></a>
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

The browser console (F12 → Console) always shows `[Immersive Worlds] v2.4.0 ready` and every failure with its cause. Turn on **Debug log** in the settings for the resolved settings at startup, every director pass, and every move or change the world rules rejected (with the reason); it logs at the *Verbose* level, so enable that level in the console filter.

## Project map

```text
manifest.json   SillyTavern manifest (loading_order 6, activate hook)
index.js        host: settings, per-chat world, injection, director pipeline, panel, commands, macros
engine.js       pure world model: schema, patching under the rules, scene brief, prompts
rules.js        pure: paths with walking time and openness, shortest routes, time caps, people in transit
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
kit.js          shared panel kit (identical in Immersive Adventures)
settings.html   settings drawer
style.css       shared kit block + backdrop + particles + HUD
tests/          node tests/selftest.js
```

State lives in chat metadata key `immersive_worlds_state_v1`; your dossier notes and removals live in `immersive_worlds_notes_v1`. Worlds from 1.x, 2.0, 2.1 and 2.2 load unchanged.

## Honest status

Verified:

- `node tests/selftest.js` — 95 tests (new in 2.4: free-text weather wording, type-before-name place kinds, weather in the painted scene, place kinds from free text, sky and particle rules, backdrop settings migration, skyline drawings, particle maths, scene art in the HUD view without any place description; new in 2.3: dossier rules and caps, a nested dossier list that cannot wipe it, deletions that survive the director rephrasing, notes that survive a rewind, perceived dossier without hidden truth, ideas that never leak and are filtered to known things, faces, model list and reasoning fallback): paths and walking time, rejected moves, user-chosen moves the director cannot undo, movement detection, people in transit, time caps, creation only where the story is, main vs background people, perceived state and hidden truth, state only for people present, perception per path openness and reveal mode, names and threads hidden until known, Peek, migration, prompt sizes
- End-to-end in an isolated SillyTavern 1.19.0 against a mock model: HUD in all four corners at 1920, 1600, 1500 and 1280 px; hover cards; arrival glow and toast; a heard room, Peek and Go; a two-hop move charged its walking time; a bogus move rejected and logged; a person walking in over time; a drawer hiding its side; reveal modes; delete rewinding the HUD; no unknown name or secret in the default HUD; world note ~590 chars, director ~3,100 chars
- 2.3.0 end-to-end in an isolated SillyTavern 1.19.0 against a mock model: facts learned from a reply appear in the card with a "learned" toast; a note and a removed fact stay put while swiping back and forth (the swiped reply's facts come and go); Ideas lists only ideas resting on known things and a click fills the message box without sending; the model override reaches the connection; the live OpenRouter list (463 models, DeepSeek V4.1 Flash pinned first) fills the picker; an OpenRouter call without a key reads as a plain instruction; settings drawer; phone width
- 2.4.0 end-to-end in an isolated SillyTavern 1.19.0: backdrop in all four time slots with clear, rain, snow, fog and storm over harbor, city, tavern and interior places; mode switch grade/painted/off (the layer hides and the particle canvas is removed); particles on and off; the HUD strip at full width and hidden when compact; phone width (no horizontal scroll, HUD steps aside); no console errors. Painted scenes are hand-drawn silhouettes, not generated pictures
- Reload persistence of the world and the HUD; Forge, Make card and swipe browsing were verified in 2.0.0 (their host code did not change; not re-run this round)

Not claimed:

- Director, Ideas and dossier quality against a real model (all exercised against a mock; the parsers tolerate fences and prose); in particular the extra `learned` field on DeepSeek V4.1 Flash
- A successful OpenRouter call (no key was available; the request path and its error handling were checked)
- Expression sprites with a real sprite pack (the lookup is feature-detected; avatar and monogram faces were checked)
- SillyTavern 1.18 at runtime (the newer APIs used are feature-detected)
- The HUD re-laying itself on a live window resize was checked with a synthetic resize event (the test browser pane does not fire real ones)

## License

[MIT](LICENSE)
