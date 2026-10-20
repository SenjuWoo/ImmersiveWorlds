// World logic the model cannot overrule: routes with travel time and openness, paths, time caps, people in transit.
// Pure: no SillyTavern imports, no engine imports (engine imports this).
import { CAPS } from './dossier.js';

export const SENSES = ['open', 'door', 'none'];
export const JUMPS = ['sleep', 'wait', 'travel', 'montage'];

const INDOOR = /room|hall|kitchen|bed|bath|living|cellar|attic|office|study|interior|house|home|apartment|corridor|stair/i;
const OUTDOOR = /street|road|square|plaza|market|field|camp|forest|wood|park|garden|yard|dock|harbor|harbour|beach|river|trail|path|courtyard/i;

export function defaultRoute(a, b) {
    const ta = String(a?.type ?? ''), tb = String(b?.type ?? '');
    if (INDOOR.test(ta) && INDOOR.test(tb)) return { minutes: 1, sense: 'door' };
    if (OUTDOOR.test(ta) && OUTDOOR.test(tb)) return { minutes: 10, sense: 'none' };
    return { minutes: 2, sense: 'door' };
}

const cleanRoute = r => ({
    minutes: Math.max(0, Math.min(1440, Math.round(Number(r?.minutes)) || 0)),
    sense: SENSES.includes(r?.sense) ? r.sense : 'door',
});

/** Give every connection a route, identical both ways; `connections` mirrors the route keys. Mutates. */
export function normalizeRoutes(locations) {
    const byId = new Map(locations.map(l => [l.id, l]));
    for (const l of locations) {
        const routes = l.routes && typeof l.routes === 'object' && !Array.isArray(l.routes) ? l.routes : {};
        l.routes = {};
        for (const [id, r] of Object.entries(routes)) if (byId.has(id) && id !== l.id) l.routes[id] = cleanRoute(r);
    }
    for (const l of locations) {
        for (const id of Array.isArray(l.connections) ? l.connections : []) {
            const other = byId.get(id);
            if (!other || other === l) continue;
            const route = l.routes[id] ?? other.routes[l.id] ?? defaultRoute(l, other);
            l.routes[id] = cleanRoute(route);
        }
    }
    for (const l of locations) {
        for (const [id, r] of Object.entries(l.routes)) {
            const other = byId.get(id);
            if (!other.routes[l.id]) other.routes[l.id] = { ...r };
        }
    }
    for (const l of locations) l.connections = Object.keys(l.routes);
}

export function routeOf(state, fromId, toId) {
    return state.locations.find(l => l.id === fromId)?.routes?.[toId] ?? null;
}

/** Dijkstra over routes. Worlds are small (dozens of places), so a linear scan for the next node is fine. */
export function shortestPath(state, fromId, toId) {
    const byId = new Map(state.locations.map(l => [l.id, l]));
    if (!byId.has(fromId) || !byId.has(toId)) return null;
    const dist = new Map([[fromId, 0]]);
    const prev = new Map();
    const open = new Set([fromId]);
    while (open.size) {
        let cur = null;
        for (const id of open) if (cur === null || dist.get(id) < dist.get(cur)) cur = id;
        open.delete(cur);
        if (cur === toId) break;
        for (const [next, r] of Object.entries(byId.get(cur).routes ?? {})) {
            const d = dist.get(cur) + r.minutes;
            if (byId.has(next) && d < (dist.get(next) ?? Infinity)) {
                dist.set(next, d);
                prev.set(next, cur);
                open.add(next);
            }
        }
    }
    if (!dist.has(toId)) return null;
    const path = [toId];
    while (path[0] !== fromId) path.unshift(prev.get(path[0]));
    return { path, minutes: dist.get(toId) };
}

export function capMinutes(minutes, jump) {
    const cap = JUMPS.includes(jump) ? 720 : 90;
    return Math.max(0, Math.min(cap, Math.round(Number(minutes)) || 0));
}

export function worldMinutes(clock) {
    const [h, m] = String(clock?.time || '00:00').split(':').map(Number);
    return (Math.max(1, Number(clock?.day) || 1) - 1) * 1440 + (h || 0) * 60 + (m || 0);
}

/** Start someone toward a place along the map. */
export function sendNpc(state, npc, toId) {
    if (npc.locationId === toId) { npc.travel = null; return 'arrived'; }
    const route = shortestPath(state, npc.locationId, toId);
    if (!route) return 'no-route';
    if (route.minutes <= 0) {
        npc.locationId = toId;
        npc.travel = null;
        return 'arrived';
    }
    npc.travel = { to: toId, eta: worldMinutes(state.clock) + route.minutes };
    return 'en-route';
}

/** Land everyone whose trip is over. Returns their ids. */
export function tickTravel(state) {
    const now = worldMinutes(state.clock);
    const ids = new Set(state.locations.map(l => l.id));
    const arrived = [];
    for (const n of state.npcs) {
        if (!n.travel) continue;
        if (!ids.has(n.travel.to)) { n.travel = null; continue; }
        if (n.travel.eta > now) continue;
        n.locationId = n.travel.to;
        n.travel = null;
        arrived.push(n.id);
    }
    return arrived;
}

// Comings and goings worth a world update now, whatever the "run every" cadence says.
const MOVES = /\b(leaves?|left (?:the|for|to|through|without)|arriv(?:e|es|ed|ing)|enters?|entered|returns?|returned|follows?|followed|(?:walks?|walked|runs?|ran|heads?|headed|goes|went|comes?|came|steps?|stepped|storms?|stormed) (?:away|off|out|in|inside|outside|over|back|to|toward|towards|into))\b/i;
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Does this text move anyone: a coming-or-going phrase, or another known place named? */
export function movementHint(state, text) {
    const t = String(text ?? '');
    if (MOVES.test(t)) return true;
    return state.locations.some(l => {
        if (l.id === state.currentLocationId) return false;
        const name = String(l.name || '').replace(/^the\s+/i, '').trim();
        return name.length >= 3 && new RegExp(`\\b${escapeRe(name)}\\b`, 'i').test(t);
    });
}

// ---------------------------------------------------------------------------
// Rumours: what one person was told can reach another in the same room.
// ---------------------------------------------------------------------------

/** Small seeded PRNG (mulberry32): the same tick spreads the same gossip, so a swipe rewinds it exactly. */
function prng(seed) {
    let a = (Number(seed) || 0) >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Things you are told, not things you see by looking. `trait` and `like` never travel.
const RUMOURABLE = new Set(['history', 'bond', 'promise']);
const sameFact = t => String(t ?? '').trim().toLowerCase();

/**
 * Pass facts between people who share a room: at most one per place per tick, `maxPerTick` in the world,
 * never a `hidden` truth. The listener records `via`, so the panel can say "heard from Marta" instead of
 * pretending {{user}} witnessed it. Returns the spreads, for tests and the debug log.
 */
export function spreadRumours(state, { seed = state?.meta?.tick ?? 0, maxPerTick = 3 } = {}) {
    const out = [];
    const rand = prng(seed);
    const rooms = new Map();
    for (const n of state?.npcs ?? []) {
        if (!n.known || n.travel || !['active', 'present', ''].includes(String(n.status ?? ''))) continue;
        const list = rooms.get(n.locationId) ?? [];
        list.push(n);
        rooms.set(n.locationId, list);
    }
    for (const [, people] of rooms) {
        if (out.length >= maxPerTick) break;
        if (people.length < 2) continue;
        // Offer what the room knows, then pick a fact and its teller: the gossip decides who speaks,
        // not a coin toss that lands on the one person with nothing to say.
        const offers = people.flatMap(p => (p.learned ?? []).filter(f => RUMOURABLE.has(f.k)).map(f => ({ teller: p, f })));
        if (!offers.length) continue;
        const { teller, f: fact } = offers[Math.floor(rand() * offers.length)];
        const others = people.filter(p => p !== teller);
        const listener = others[Math.floor(rand() * others.length)];
        if ((listener.learned ?? []).some(f => sameFact(f.t) === sameFact(fact.t))) continue;
        const cap = listener.main ? CAPS.main : CAPS.bg;
        listener.learned = [...(listener.learned ?? []), { k: fact.k, t: fact.t, at: state?.clock?.time ?? '', via: teller.id }].slice(-cap);
        out.push({ from: teller.id, to: listener.id, t: fact.t });
    }
    return out;
}
