# Immersive Worlds 2.5.0 — "People who remember and talk" design

Status: proposed 2026-10-19 · builds on 2.6.1 · schema v5

## Intent
The world moves and the weather speaks, but nobody *knows* anything. A person's opinion of you is a free-text line the director rewrites, and a fact learned in one conversation never reaches anyone else. Two rules fix that without another model call: a number for how someone stands with you, and facts that travel between people who share a room.

## Goals
1. **Standing**: `bond`, an integer −5..5 per main person, written by the director, shown as a small bar in the person card and as a dot in the room list. −5 hatred, 0 a stranger, +5 devotion.
2. **Rumours**: facts a person learned can spread to someone else in the same place, once per tick, marked with who told them. The person card says *heard from Marta*, so the player can see the difference between witnessed and second-hand.
3. **Nothing else changes**: same prompt budget, same number of model calls, same HUD.

## Non-goals
- No hourly routines. The clock already has minutes; the four-slot routine works, and finer granularity buys little for the tokens it costs.
- No "while you were away" recap in this release: it needs a stored last-seen time and a summary surface, which is 2.5.1.
- No new LLM call, no new prompt section, no change to `learned` semantics for the model.
- No reputation between NPCs (A's opinion of B). One axis, user-facing only.

## Design

### Schema v5
- `npc.bond`: integer, clamped −5..5, default `0` (unknown, not neutral). Absent on background people.
- `learned[]` entry gains optional `via`: the id of the person it was heard from. Absent means witnessed.
- No extra bookkeeping field: the spread is seeded by `meta.tick`, so the same tick always produces the same gossip and a swipe rewinds it exactly.
- `normalizeState` migrates v4 → v5 with `bond: 0` and no `via`. Old chats keep their text `relationship` untouched.

### Director
One clause added to the NPC shape in `PATCH_CONTRACT`, and nothing else: `"bond":-5..5`. The field is only in the contract when the feature is on, so a world with standing off sends a byte-identical prompt to 2.6.1. `relationship` stays as the human-readable sentence and is not derived from `bond`.

### Rumours (pure, in `rules.js`)
`spreadRumours(state, rand)` runs once per tick, after the director patch lands:
- group known, active people by location; for each place with two or more, collect what the room knows and pick one fact, then its teller and a listener;
- the teller offers one fact with `k` in `history | bond | promise` that the listener does not already have (same `t`, case-insensitive);
- the listener gets it with `via: teller.id`, respecting the existing per-person cap;
- at most 3 spreads per tick across the whole world, so a busy tavern does not become a copying machine.

Why those three kinds: `like`, `dislike`, `interest` and `trait` are things you notice by looking. `history`, `bond` and `promise` are things you are *told*, which is what gossip is.

### Panel
- Person card: a five-segment bar under the name, `aria-label="standing: −2 of 5"`, colour from the existing danger palette (hostile red, warm amber, friendly green).
- Each learned line with `via` renders as `heard from <name>`; the name is resolved from the world, and an unknown id degrades to "someone".
- Room list: a 3 px dot beside each person, same colour scale, hidden in compact mode.

### Swipe safety
Rumours run inside the same patch pipeline as everything else and are covered by the existing pre-turn snapshot: a swipe rewinds the spread with the rest of the state. `meta.rumourTick` stops a double spread when the same tick is painted twice.

## Risks
- `bond` is a number the model must be trusted to write sensibly; a −5 for a mild disagreement would read as a bug. Mitigation: clamp, and never show the raw number, only segments.
- Gossip can leak a fact the player was told in confidence, which may be the point or may feel like a bug. Mitigation: only `history | bond | promise`, and never `hidden`.
- Two facts with the same text from different tellers collapse; acceptable, and cheaper than tracking provenance per duplicate.

## Test plan
- Normalisation: v4 state gains `bond: 0`, clamps out-of-range values, keeps `relationship`.
- `spreadRumours`: one spread per pair per tick, cap respected, `via` set, no `hidden` leak, deterministic with a seeded rand, no spread with one person present.
- Panel: a card with `via` renders "heard from"; unknown id degrades.
- Wiring: the director contract carries `bond`, and the prompt tells the model what it means.
