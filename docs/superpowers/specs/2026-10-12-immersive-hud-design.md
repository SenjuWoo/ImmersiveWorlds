# Immersive Worlds — Immersion HUD and World Logic (design)

Date: 2026-10-12 · Target: Immersive Worlds 2.1.0 (current: 2.0.0) · Owner: SenjuWoo

Reference mockup (approved): option **B, "Game HUD in the corners"**. A copy lives next to this file as `2026-10-12-immersive-hud-mockup.html`.

## Intent

The user wants *the ultimate immersion module*. While roleplaying they glance away from the text and want the screen to tell them everything the story has not spelled out: who is here and in what state (body, mind, what they hold), what is on hand, what is happening right now, what is going on next door, and how the world fits together. Today Immersive Worlds shows this only in a boxed side panel the user must open, and most of a wide screen is empty space on both sides of the chat column (see the user's screenshot: a 2000 px window with a ~1000 px chat column).

Equally important, the world must **make sense**: no teleporting, time that passes plausibly, people who move along real routes, and characters that only use places and things that exist. The user said the character sheets come **above all**.

## Decided by the user

1. **Layout B**: a floating HUD in the empty space beside the chat, no boxes, over the SillyTavern background. Scene top-left, people top-right, items bottom-left, a small map ("around you") bottom-right. Details on hover/click.
2. **Only what my character knows** is shown by default. No hidden thoughts, secrets or people behind walls.
3. **Senses**: people in a neighbouring room can be *seen*, *heard* or *peeked at*, depending on how the places connect. A **toggle** lets the user choose how much is revealed.
4. **Logic over freedom**: time and place change dynamically but logically; no teleporting; others are aware of existing items and places and do not invent things that do not exist.
5. **Character sheets win** over the world state when they disagree.
6. **Immersive Worlds first**. Immersive Adventures integration is out of scope for this round.

## Goals

- A HUD that turns the side space into a living, glanceable view of the scene, in SillyTavern's theme.
- Per-person state for everyone in the scene: body, mind, what they are holding, shown as 2–3 tags plus a full card on hover/click.
- A perception layer: what the user's character has seen, heard or been told, separate from what is true.
- Code-enforced world logic: routes with travel times, people moving along them over time, time jumps only when earned, new things appearing only where the story is.
- The roleplay model gets the facts it needs (exits, items, people's visible state, what is audible next door) in a compact form, so it reaches for real things.

## Non-goals (this round)

- Immersive Adventures data in the HUD (hero, bag, combat). Its own status strip stays as it is.
- A drawn, graphical map or VTT. The map is a small node graph.
- A HUD on phones. On narrow screens the HUD gives way to the existing panel.
- Sound effects, music, generated portraits.

## Anti-goals (failure even if it "works")

- In the default mode, the HUD reveals anything the user's character could not know (a secret, an unseen person, an unvisited room's contents, a name nobody said).
- The user or anyone else changes place without a route and the time it takes.
- The HUD covers chat text, the send box, SillyTavern's side drawers or the MovingUI panels.
- The prompt grows noticeably. The per-reply injection should stay roughly within 800 characters in a typical scene (today about 550); the director request should stay roughly within 3,500 characters.
- Swipe, regenerate and delete safety (already shipped in 2.0.0) breaks.
- A HUD that feels like a dashboard instead of part of the scene: boxes, dense tables, debug-looking text.

## Constraints

- SillyTavern ≥ 1.18 extension; tested on 1.19.0. No build step, no new dependencies. Keep the pure `engine.js` / thin `index.js` split and node tests.
- Theme colours only (SillyTavern CSS variables such as `--SmartThemeBodyColor`, `--SmartThemeQuoteColor`, `--SmartThemeBlurTintColor`, `--SmartThemeBorderColor`) and SillyTavern's font. Font Awesome (bundled with SillyTavern) for icons; no emoji in the shipped UI.
- `kit.js`, `llm.js` and the kit block of `style.css` are byte-shared with Immersive Adventures (a test enforces it). HUD code and CSS go outside the kit block.
- Old worlds (state v2) must load; migration is silent.
- Token efficiency is a standing requirement for this user.
- Strict agency: never write the user's words, thoughts or feelings. The user's character may have tracked *visible* state (holding, wearing, position) taken from the user's own messages and persona, never mood or intent.

## How it should behave

### 1. The HUD

Four floating groups positioned in the free space left and right of SillyTavern's chat column (`#sheld`). Text sits directly on the background with a soft text shadow; only the hover/click cards and the item tiles have a translucent backing.

**Top-left, Scene.**
- A small kicker (time-of-day icon, "Day 1 · Morning"), the place name in large type, then time, weather and light.
- A 1–2 sentence **"right now"** line describing the situation: who is doing what and what is at stake. Written by the director, never revealing hidden information.
- One quiet line of open threads ("Stirring · …").

**Top-right, People.** One row per person the user currently perceives in the scene, user's character included (marked "you"):
- Name, then 2–3 short state tags (one may be highlighted when it is the most salient fact), then a round portrait. Portrait: the character card's avatar thumbnail if the person is a card or materialized NPC, otherwise a coloured circle with an initial.
- A person whose name the user's character does not know is labelled by appearance ("a tall man in a grey coat").
- **Arrivals** glow green for the turn they arrive. **Departures** stay one turn faded, with "left · toward <place>" when that direction was observable.
- Hover or click a row to open the full card: **Body** (restraints, wearing, position, condition), **Mind** (mood, wants, toward you), **Has** (holding/carrying). Show only what is perceivable: mood as it shows on the face, wants only if stated or obvious. Blank fields are omitted, never shown as "unknown".
- A short toast near this group announces notable arrivals or sounds ("Bramble, Perrin's dog, trots in from the Trade Road"), then fades. Respect `prefers-reduced-motion`.

**Bottom-left, Items.** "Here & on you": tiles for what the user's character carries and what is visibly in the place. Each tile has an icon by item type, a name and where it is ("your hand", "on the horse"). The one most relevant to the moment may be highlighted. Click a tile for its description, owner and location.

**Bottom-right, Around you.** A small node graph: the current place in the middle, connected places around it, each labelled with what the user senses there (faces/names when visible, a sound line when heard, "can't see in" when nothing). Labels on the edges or a legend give the travel time. Click a node to open a small menu:
- **Go**: travel along the route; time passes by the route's minutes.
- **Peek**: only where the connection allows sound but not sight. Costs 1 minute; people there become seen for this turn and known by appearance; a one-line note tells the story the user's character looked in.

**Fitting the screen.**
- Each side gets the free width beside the chat column, capped around 360 px.
- When a side has less than about 220 px, that side switches to a compact form: faces and icons only, details on hover.
- When the window is too narrow (phone, or chat width near 100%), the HUD hides and the existing status strip and panel remain the way in.
- A side's HUD hides while SillyTavern's drawer on that side is open. The HUD always sits below MovingUI panels and popups.

**Turning it on.** The HUD appears automatically whenever the chat has a living world and the HUD setting is on (default on). The existing World panel stays for editing and deep browsing. The existing status strip above the chat input is redundant when the HUD is showing; hiding it then is the builder's call.

### 2. Per-person state

Every person in the current scene carries a short, free-text state the director keeps current:
- body: restraints, wearing, position, condition
- mind: mood, wants, toward the user
- holding: short list
- tags: the 2–3 most salient facts for the HUD

Rules:
- State is updated only for people in the scene this turn. Everyone else's state is frozen until they are perceived again.
- Changes must be consistent with the person's sheet (see 5) and with what happened in the exchange.
- The user's character gets body and holding only. They are derived from the user's own messages and the persona; no mood or intent is ever written for them.
- The roleplay injection carries the *visible* state of present people in one compact line each (for example "Fern: wrists cuffed behind back; sheet only; kneeling"), so the model keeps continuity (the cuffs stay on until someone removes them).

### 3. Perception (what the user's character knows)

Truth and knowledge are stored separately. The HUD reads knowledge; the director and the roleplay model work from truth.

- **People**:
  - *Known*: the user's character knows they exist. A person becomes known when seen, heard about or introduced.
  - *Name known*: set when a name was said or the person was introduced. Otherwise the HUD uses an appearance label.
  - *Last perceived*: when they were last seen or heard.
- **Places**:
  - *Visited*: the user has been there.
  - *Known*: heard of or seen from a connected place. Unknown places are not drawn.
- **Each connection** has an openness:
  - **open**: archway, same hall, open ground. You see and hear.
  - **door**: closed door or thin wall. You hear but don't see.
  - **none**: far or solid. You get nothing.
  - Openness is directional-agnostic (the same both ways).
- **Live sensing**, computed by code each turn: people in the current place are seen; people in an *open*-connected place are seen; people in a *door*-connected place are heard. The director supplies a short sound line for heard places when there is something to hear ("two voices arguing, a TV on"). Without one, code falls back to a generic line based on how many people are there, or silence.
- **Toggle**, setting "What the HUD reveals":
  - *Only what I sense* (default): the rules above.
  - *Everything nearby*: everyone in connected places, as if all were open.
  - *Everything*: the whole truth, secrets included, for curiosity or to debug what the AI tracks.

### 4. World logic, enforced in code

The director proposes; code checks and applies.

- **Routes**: every connection has a travel time in minutes (set at world build or discovery; the builder picks sensible defaults by place type), plus an openness.
- **The user's moves**:
  - If the exchange moves the user to a connected place, accept it and charge that route's time.
  - To a place reachable only through others, accept it along the shortest path and charge the summed time.
  - To a place with no route, reject the move. The user stays put, and because the brief states the current place, the next reply re-anchors.
  - The time charged is at least the route time even if the director's `minutes` is lower.
- **Other people's moves**:
  - Same path rules. If the elapsed time covers the route, they arrive.
  - If it doesn't, they are *en route* ("heading to the Waystone", with an arrival time) and arrive when the clock passes it.
  - Routines (dawn/day/dusk/night) create such trips instead of instant jumps.
- **Time**:
  - A normal exchange advances by a small, plausible amount, capped (for example 60–90 minutes; builder's call).
  - Larger jumps are allowed only when the director marks a reason (sleep, wait, travel, montage), capped at, for example, 12 hours per turn.
  - Time never runs backwards.
- **New things**:
  - New items and people may only appear in the current place (or owned by someone present).
  - New places only as a connection of the current place.
  - Everything new is permanent and immediately in the facts the model sees. The existing creation switches still apply.
- **Facts for the model**: the roleplay injection lists exits with travel times, visible items, present people's visible state and what is audible next door, so narration uses real things. The director gets the same facts by id.
- Every rejection is written to the debug log with its reason.

### 5. Character sheets above all

- The active character card (description, personality, scenario) and the user's persona are read-only sources of truth. SillyTavern already puts them in the roleplay prompt. The director gets a compact sheet line for each present person: the card for card characters (and materialized NPCs), the world's own profile for side characters, the persona for the user. It is told that state changes must not contradict a sheet.
- World build and Rebuild keep reading the card, persona and lorebook as today.
- If a world fact contradicts a sheet (for example a card says she always carries a bow and the world says otherwise), the sheet wins and the world is corrected on the next update.

### 6. The director contract changes

The patch gains (names are the builder's call):
- the "right now" line
- per-person state for present people
- name/known updates when someone is introduced
- sound lines for door-connected places
- route minutes and openness for new connections
- a time-jump reason

It loses the ability to set anyone's location freely; it proposes moves, and code resolves them. Its input gains present people's sheet lines and the route table around the current place. Keep the line format and "only what changed" style; stay within the budget in Anti-goals.

## Migration

State v2 → v3, silent on load:
- Existing `connections` become routes with a default time and openness, chosen by place type (builder's call; a reasonable default is 15 minutes and *door*).
- Existing people get empty state. People in the current place and places marked discovered become known.
- STATE_KEY stays the same; older extension versions must not crash on v3 data (they normalize and drop unknown fields).

## What's left to the builder

- Exact field names and schema shape; how routes are stored (keep `connections` readable for back-compat if cheap).
- HUD DOM placement and how free space is measured (for example from `#sheld`'s bounding box on resize, chat-width change and drawer toggle).
- Default route minutes and openness by place type; time caps.
- The icon mapping for item types; avatar thumbnail URLs.
- Whether to hide the status strip when the HUD shows.
- Animation details within the stated behaviour.
- How Peek's note reaches the story (for example a one-shot line in the next injection).

## Verification expectations

- Node tests for every pure rule: pathfinding and time charged, rejected moves, en-route arrivals, time caps and jumps, creation only where the story is, sensing per openness and per toggle mode, appearance labels for unnamed people, migration v2→v3, injection and director size budgets.
- End-to-end in an isolated SillyTavern 1.19 with a mock model (the recipe used for 2.0.0): HUD renders in both gutters at 1920 and 2560 px wide; compact and hidden modes at narrower widths; drawers and panels hide or overlap correctly; arrival, departure, sound and peek flows; swipe, regenerate and delete still rewind HUD state; default mode never shows a secret or an unseen person.
- Visual check against the mockup in light and dark themes.
