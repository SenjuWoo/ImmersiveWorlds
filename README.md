<p align="center">
  <img src="assets/mark.svg" width="72" height="72" alt="Immersive Worlds mark">
</p>

<h1 align="center">Immersive Worlds</h1>

<p align="center"><strong>A city that keeps living between messages.</strong></p>

<p align="center">
  SillyTavern extension that runs a background director over every chat:<br>
  clock, weather, streets, NPCs with routines, items, factions, rumors, quests.
</p>

<p align="center">
  <a href="https://github.com/ShugokiFable/ImmersiveWorlds/actions/workflows/ci.yml"><img src="https://github.com/ShugokiFable/ImmersiveWorlds/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2ee6c5?labelColor=0d0f11" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/version-1.5.0-8f9aa6?labelColor=0d0f11" alt="v1.5.0">
  <img src="https://img.shields.io/badge/SillyTavern-%E2%89%A5%201.18.0-8f9aa6?labelColor=0d0f11" alt="SillyTavern 1.18+">
</p>

<p align="center">
  <a href="#install">Install</a>
  ·
  <a href="#usage">Usage</a>
  ·
  <a href="#settings">Settings</a>
  ·
  <a href="#honest-status">Status</a>
</p>

## Why it exists

A lorebook is a dump. A roleplay city is a simulation: time passes, weather shifts, people have jobs, shops exist when you mention them, and the next reply should already know the street you are standing on.

Immersive Worlds keeps that state in the chat and weaves a prose scene brief into every generation. The director does not own your character's words.

## What you get

- One-click **AI bootstrap** of a coherent city: locations, NPCs, items, factions, events, premise
- **Living director** after each turn: clock, weather, rumors, events, chronicle notes
- **NPC routines** for dawn / day / dusk / night — the city moves even off-screen
- **Active materialization** — mention a shopfront, a key, a passerby; the director can create it now, gated by a growth budget
- Travelable location graph; click a connection to move
- Sensory ambient line plus a compact **SCENE BRIEF** (not a JSON dump) on every reply
- Deep NPC → SillyTavern character card, with a bundled world lorebook
- **Character forge** for world-consistent NPCs on demand
- Quests panel in the World tab
- Optional time-of-day UI tint (dawn / day / dusk / night)
- Built for reasoning models: OpenRouter `effort: none` on state updates, real token budgets, director detached from your reply (120s hard timeout)

Built for adults. Any resemblance to real persons or places is coincidental.

## Install

Requirements: **SillyTavern ≥ 1.18.0** and any chat-completions API SillyTavern already speaks (OpenAI, OpenRouter, local, …).

```powershell
cd SillyTavern/public/scripts/extensions/third-party
git clone https://github.com/ShugokiFable/ImmersiveWorlds.git
```

Restart SillyTavern (or Ctrl+F5) and enable **Immersive Worlds: Living Cities**.

```powershell
git -C public/scripts/extensions/third-party/ImmersiveWorlds pull
```

## Usage

1. Open the panel (floating button, bottom-right) and hit **Generate world**, or just start chatting — the world bootstraps on the first message.
2. **Travel** from the World tab by clicking a connection.
3. With the director on, every turn advances the simulation. New items, POIs, NPCs, and events appear as the story implies them.
4. Inspect People / Items / Timeline; add or edit by hand; export / import world JSON.
5. **Advance world** runs one director pass without sending a player line.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `autoDirector` | on | Run the director after every user message |
| `directorEvery` | 1 | Run the director every N messages |
| `simulationDetail` | high | Growth budget: low (1 item), high (2 items + 1 POI + 1 NPC + 1 event), maximum (3 + 2 + 2 + 1) |
| `allowNewCharacters` | on | Lore-consistent dynamic NPCs |
| `allowNewItems` | on | Dynamic items |
| `allowNewLocations` | on | Dynamic locations / POIs |
| `allowOffscreenEvents` | on | Restrained off-screen events |
| `strictUserAgency` | on | Protect user actions, thoughts, and dialogue |
| `bootstrapTokens` | 6000 | World-generation token budget |
| `directorTokens` | 3000 | Per-pass token budget |
| `jsonTemperature` | 0.5 | State-update temperature |
| `disableReasoning` | on | Disable OpenRouter thinking during state updates |
| `nativeStructuredOutput` | off | Try native `json_schema` first |
| `suspendDirectorOnApiError` | on | Auto-suspend if a background request is rejected |
| `injectDepth` | 2 | Chat depth for the scene brief |
| `immersiveTheme` / `ambientEffects` / `showFloatingButton` | on | Theme, time-of-day tint, launcher |

## Project map

```text
manifest.json   SillyTavern extension manifest (v1.5.0, loading_order 6)
index.js        director, bootstrap, interceptor, panel logic
panel.html      world / people / items / timeline / quests UI
settings.html   extension settings
style.css       panel + ambient theme
```

State lives in chat metadata key `immersive_worlds_state_v1`.

## Honest status

Verified in this tree:

- Manifest version **1.5.0**, minimum client **1.18.0**
- CI workflow `.github/workflows/ci.yml` (`node --check` on `index.js`, manifest parse)
- Director routines, character-card forge, quests, and scene-brief injection as described above

Not claimed:

- A GitHub release matching 1.5.0 (tagged GitHub release is still `v1.3.0`)
- Automated director-quality evals against a live model
- A standalone app outside SillyTavern

Companion mechanics layer (private): [ImmersiveAdventures](https://github.com/ShugokiFable/ImmersiveAdventures).

## Version notes

- **1.5.0** — NPC dawn/day/dusk/night routines; inspector shows each routine
- **1.4.0** — Deep character cards + world lorebook; Forge; quests in the World tab
- **1.3.0** — Token-lean director (~86% smaller input); detached director; crash guards
- **1.2.0** — Active materialization; atmosphere card; growth budgets
- **1.1.0** — Reasoning-safe OpenRouter/DeepSeek path; prose SCENE BRIEF
- **1.0.1** — First published build

## License

[MIT](LICENSE)
