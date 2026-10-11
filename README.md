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
  <a href="https://github.com/SenjuWoo/ImmersiveWorlds/releases/tag/v2.0.0"><img src="https://img.shields.io/badge/release-v2.0.0-8f9aa6?labelColor=0d0f11" alt="v2.0.0"></a>
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

- **Living world per chat**, created only when you ask for one (chats without a world cost nothing)
- **Build world**: one background call drafts places, people, items, factions and threads from the character card, scenario and lorebook. **Start** seeds a minimal world with no model call
- **Background director** after each reply: clock, weather, ambient line, who moved where, new people/places/items the scene implied, chronicle notes
- **Routines** (dawn / day / dusk / night): people move with the clock, even off-screen
- **Swipe-, regenerate- and delete-safe**: every reply caches its own world patch, so browsing swipes re-applies the right state with no extra call, and deleting a reply rewinds the world
- Panel in SillyTavern's own style (MovingUI, theme colours, wand menu): World, People, Items, History, Manage
- **Status strip** above the chat input (day, time, weather, place) and an optional time-of-day tint
- **Forge** world-consistent people on demand; turn anyone into a **character card with a world lorebook**
- Export / import world JSON; slash command and macros
- Background calls run through a **Connection Profile** of your choice (a fast, cheap model is ideal), with reasoning switched off by default and a 120 s timeout

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
3. Roleplay. After each reply the director updates the world in the background; the status strip and panel follow.
4. **People**: Inspect, Forge, Add, Make card. **World**: travel by clicking an exit. **Manage**: Update now, Edit identity, Rebuild, Export / Import, Remove.

| Command | Does |
| --- | --- |
| `/iw` | open the panel |
| `/iw start` / `/iw build` | minimal world / AI-drafted world |
| `/iw update` | one director pass now |
| `/iw travel Market` | move to a connected place |
| `/iw brief` | return the current scene brief |

Macros: `{{iwTime}}` `{{iwDay}}` `{{iwWeather}}` `{{iwLocation}}` `{{iwScene}}`.

## Token cost

Measured against v1.5.0 on the same world:

| | v1.5.0 | v2.0.0 |
| --- | --- | --- |
| Fixed instruction text in every reply's prompt | 1,340 chars | 255 chars |
| Director request (instructions + schema + world + exchange) | 4,227 chars of instructions and schema alone, plus the card, the whole state as JSON and 6 messages | 2,065 chars for the whole request |
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
| Tint the screen by time of day | on | Ambient wash |
| Connection profile | current | Profile for background calls |
| Skip model reasoning | on | Reasoning off for world updates (faster, cheaper) |
| Pause the director if the API rejects its request | on | Stops retry storms on providers that refuse the call |
| Growth | Lively | How much new content each pass may add |
| New people / items / places / off-screen events | on | Creation switches |
| Update tokens / World-build tokens | 1200 / 3000 | Response budgets |
| Temperature | 0.4 | Background-call temperature (Forge uses at least 0.8) |
| Prompt depth | 1 | Chat depth of the scene brief |
| Debug log | off | Verbose log in the browser console |

## Log

The browser console (F12 → Console) always shows `[Immersive Worlds] v2.0.0 ready` and every failure with its cause. Turn on **Debug log** in the settings for the resolved settings at startup and every director pass; it logs at the *Verbose* level, so enable that level in the console filter.

## Project map

```text
manifest.json   SillyTavern manifest (loading_order 6, activate hook)
index.js        host: settings, per-chat world, injection, director pipeline, panel, commands, macros
engine.js       pure world model: normalize, patch, routines, travel, scene brief, prompts
llm.js          background calls (Connection Profile → ChatCompletionService → generateRaw), JSON parsing
kit.js          shared panel kit (identical in Immersive Adventures)
settings.html   settings drawer
style.css       shared kit block + ambient tint
tests/          node tests/selftest.js
```

State lives in chat metadata key `immersive_worlds_state_v1`; v1 worlds load unchanged.

## Honest status

Verified:

- `node tests/selftest.js` — 26 tests (normalizing, patching, routines, travel, brief and prompt size, parsing)
- End-to-end in an isolated SillyTavern 1.19.0 against a mock model: build, director pass, swipe regenerate and browse, delete rewind, forge, card + lorebook creation, reload persistence, phone width

Not claimed:

- Director quality against every real model (it was exercised against a mock; the JSON parser is tolerant of fences and prose)
- SillyTavern 1.18 at runtime (the newer APIs used are feature-detected)

## License

[MIT](LICENSE)
