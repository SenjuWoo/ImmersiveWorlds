// Pure living-world engine: schema, scene brief, director contract, patch application.
// No SillyTavern imports, so tests run it under plain node.
import { normalizeRoutes, shortestPath, capMinutes, sendNpc, tickTravel } from './rules.js';
import { normLearned, addLearned, CAPS } from './dossier.js';
import { weatherKind } from './scenery.js';

export const STATE_KEY = 'immersive_worlds_state_v1';
export const TURN_KEY = 'immersive_worlds_turn_v1';
export const STATE_VERSION = 5;
export const SLOTS = ['dawn', 'day', 'dusk', 'night'];
const MAX_CHRONICLE = 40;
const DONE = new Set(['resolved', 'complete', 'completed', 'failed', 'ended', 'closed', 'abandoned', 'finished']);

export const nowIso = () => new Date().toISOString();

export function slug(value, prefix = 'id') {
    const cleaned = String(value ?? '')
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 42);
    return cleaned || `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function uniqueId(collection, preferred, prefix) {
    const used = new Set(collection.map(x => x.id));
    const base = slug(preferred, prefix);
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    return id;
}

// Text only, never through the DOM: assigning innerHTML fires <img onerror> even on a detached node.
export function cleanText(value, max = 800) {
    return String(value ?? '')
        .replace(/<!--[\s\S]*?(?:-->|$)/g, ' ') // hidden machine lines (e.g. Immersive Adventures state) are not story
        .replace(/<\/?[a-z][^>]*>/gi, ' ')
        .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);
}

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const list = v => (Array.isArray(v) ? v : []).filter(x => x !== null && x !== undefined && x !== '');
const strList = (v, max, len) => list(v).map(x => str(typeof x === 'object' ? (x.name ?? x.text ?? '') : x, len)).filter(Boolean).slice(0, max);
const fields = (o, keys, max) => Object.fromEntries(keys.map(k => [k, str(o?.[k], max)]));
export const BODY = ['restraints', 'wearing', 'position', 'condition'];
export const MIND = ['mood', 'wants', 'toward'];
export const YOU = ['wearing', 'position', 'condition'];
const int = v => Math.max(0, Math.floor(Number(v)) || 0);
// How a main person truly stands with {{user}}: -5 hatred, 0 a stranger, +5 devotion. Clamped, never free text.
const bondOf = v => Math.max(-5, Math.min(5, Math.round(Number(v)) || 0));
// Sparse and directed: only pairs the story has touched, at most 8 per person, 0 deletes.
const towardOf = v => {
    const out = {};
    if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (const [k, n] of Object.entries(v).slice(0, 8)) {
            const b = bondOf(n);
            if (k && b) out[str(k, 60)] = b;
        }
    }
    return out;
};
export const isOpen = thread => !DONE.has(String(thread?.status || '').toLowerCase());

function normRoutine(r) {
    if (!r || typeof r !== 'object') return null;
    const out = {};
    for (const s of SLOTS) if (r[s]) out[s] = slug(r[s], 'location');
    return Object.keys(out).length ? out : null;
}

function normThread(x, i, prefix, legacy = false) {
    const t = typeof x === 'string' ? { name: x } : x;
    const out = {
        id: slug(t.id || t.name || t.title || `${prefix}-${i + 1}`, prefix),
        name: str(t.name || t.title || t.summary || prefix, 120),
        description: str(t.description || t.summary || '', 600),
        status: str(t.resolved === true ? 'resolved' : (t.status || 'active'), 40).toLowerCase(),
        known: typeof t.known === 'boolean' ? t.known : legacy, // a thread is known once the story touches it
    };
    if (prefix === 'faction') out.members = strList(t.members, 30, 100);
    return out;
}

function baseLocation(name = 'The Current Scene', description = 'The place where the scene begins.') {
    return { id: slug(name, 'location'), name: str(name, 120), type: 'scene', description: str(description, 1600), connections: [], discovered: true, danger: 'unknown' };
}

/** Coerce anything (old saves, imports, model output) into a valid state. Mutates and returns it. */
export function normalizeState(input) {
    const s = input && typeof input === 'object' ? input : {};
    const legacy = (Number(s.version) || 0) < 3; // people a v2 panel already showed by name stay known
    s.version = STATE_VERSION;
    s.worldName = str(s.worldName, 120) || 'Living World';
    s.premise = str(s.premise, 4000);
    s.genre = str(s.genre, 100) || 'adaptive roleplay';
    s.tone = str(s.tone, 200) || 'immersive';
    s.rules = strList(s.rules, 20, 300);
    const clock = s.clock && typeof s.clock === 'object' ? s.clock : {};
    s.clock = {
        day: Math.max(1, Math.floor(Number(clock.day)) || 1),
        time: /^\d{1,2}:\d{2}$/.test(String(clock.time)) ? String(clock.time).padStart(5, '0') : '09:00',
        weather: str(clock.weather, 60) || 'clear',
        season: str(clock.season, 60) || 'unspecified',
    };
    s.locations = list(s.locations).filter(x => typeof x === 'object').map((x, i) => ({
        id: slug(x.id || x.name || `location-${i + 1}`, 'location'),
        name: str(x.name, 120) || `Location ${i + 1}`,
        type: str(x.type, 80) || 'place',
        description: str(x.description, 1600),
        connections: [...new Set(strList(x.connections, 20, 120).map(v => slug(v, 'location')))],
        discovered: x.discovered !== false,
        visited: x.visited === true,
        routes: Object.fromEntries(Object.entries(x.routes && typeof x.routes === 'object' && !Array.isArray(x.routes) ? x.routes : {}).map(([k, v]) => [slug(k, 'location'), v])),
        sound: str(x.sound, 200),
        soundTick: int(x.soundTick),
        danger: str(x.danger, 80) || 'unknown',
    }));
    if (!s.locations.length) s.locations.push(baseLocation());
    const ids = new Set(s.locations.map(l => l.id));
    for (const l of s.locations) l.connections = l.connections.filter(c => c !== l.id && ids.has(c));
    normalizeRoutes(s.locations);
    s.currentLocationId = slug(s.currentLocationId || s.locations[0].id, 'location');
    if (!ids.has(s.currentLocationId)) s.currentLocationId = s.locations[0].id;
    s.npcs = list(s.npcs).filter(x => typeof x === 'object').map((x, i) => ({
        id: slug(x.id || x.name || `npc-${i + 1}`, 'npc'),
        name: str(x.name, 100) || `Stranger ${i + 1}`,
        role: str(x.role, 160) || 'resident',
        appearance: str(x.appearance, 900),
        look: str(x.look, 200), // how {{user}} sees them: the only text a generated portrait may use
        personality: str(x.personality, 900),
        goals: strList(x.goals, 8, 300),
        relationship: str(x.relationship, 500) || 'unknown',
        bond: bondOf(x.bond),
        toward: towardOf(x.toward),
        locationId: ids.has(slug(x.locationId, '')) ? slug(x.locationId, '') : s.currentLocationId,
        status: str(x.status, 100).toLowerCase() || 'active',
        secrets: strList(x.secrets, 6, 300),
        inventory: strList(x.inventory, 20, 120),
        routine: normRoutine(x.routine),
        firstSeen: x.firstSeen || nowIso(),
        lastSeen: x.lastSeen || nowIso(),
        materializedAvatar: str(x.materializedAvatar, 300),
        body: fields(x.body, BODY, 120),
        mind: fields(x.mind, MIND, 120),
        holding: strList(x.holding, 6, 80),
        tags: strList(x.tags, 3, 40),
        known: typeof x.known === 'boolean' ? x.known : legacy,
        nameKnown: typeof x.nameKnown === 'boolean' ? x.nameKnown : legacy,
        seenTick: int(x.seenTick),
        travel: x.travel && ids.has(slug(x.travel.to, '')) && Number.isFinite(Number(x.travel.eta)) ? { to: slug(x.travel.to, ''), eta: Number(x.travel.eta) } : null,
        main: typeof x.main === 'boolean' ? x.main : Boolean(x.materializedAvatar), // card characters; everyone else is background
        hidden: str(x.hidden, 200),
        learned: normLearned(x.learned),
    }));
    for (const n of s.npcs) n.learned = n.learned.slice(-(n.main ? CAPS.main : CAPS.bg));
    s.items = list(s.items).filter(x => typeof x === 'object').map((x, i) => ({
        id: slug(x.id || x.name || `item-${i + 1}`, 'item'),
        name: str(x.name, 120) || `Item ${i + 1}`,
        type: str(x.type, 100) || 'object',
        description: str(x.description, 1000),
        rarity: str(x.rarity, 80) || 'ordinary',
        quantity: Math.max(1, Math.floor(Number(x.quantity)) || 1),
        ownerId: x.ownerId ? slug(x.ownerId, 'npc') : '',
        locationId: ids.has(slug(x.locationId, '')) ? slug(x.locationId, '') : (x.ownerId ? '' : s.currentLocationId),
        properties: strList(x.properties, 12, 120),
    }));
    s.factions = list(s.factions).map((x, i) => normThread(x, i, 'faction')).slice(-24);
    s.events = list(s.events).map((x, i) => normThread(x, i, 'event', legacy)).slice(-40);
    s.quests = list(s.quests).map((x, i) => normThread(x, i, 'quest', legacy)).slice(-30);
    const player = s.player && typeof s.player === 'object' ? s.player : {};
    s.player = {
        currency: Number(player.currency) || 0,
        reputation: player.reputation && typeof player.reputation === 'object' ? player.reputation : {},
        inventoryIds: strList(player.inventoryIds, 200, 60).map(v => slug(v, 'item')),
        body: fields(player.body, YOU, 120),
        holding: strList(player.holding, 6, 80),
    };
    s.chronicle = list(s.chronicle).map(x => (typeof x === 'string' ? { at: nowIso(), text: x } : x))
        .filter(x => x && x.text).map(x => ({ at: str(x.at, 40) || nowIso(), text: str(x.text, 700) })).slice(-MAX_CHRONICLE);
    const scene = s.scene && typeof s.scene === 'object' ? s.scene : {};
    s.scene = {
        ambient: str(scene.ambient, 500),
        now: str(scene.now, 400),
        arrived: strList(scene.arrived, 12, 60),
        left: list(scene.left).filter(x => x && typeof x === 'object' && x.id).map(x => ({ id: str(x.id, 60), toward: str(x.toward, 60) })).slice(0, 12),
        note: str(scene.note, 300),
        peeked: strList(scene.peeked, 12, 60),
        fresh: list(scene.fresh).filter(x => x && typeof x === 'object' && x.id && x.t).map(x => ({ id: str(x.id, 60), t: str(x.t, 120) })).slice(0, 12),
        moved: scene.moved === true, // the user just chose where to be; the next director pass may not move them
    };
    const here = s.locations.find(l => l.id === s.currentLocationId);
    here.visited = here.discovered = true;
    const meta = s.meta && typeof s.meta === 'object' ? s.meta : {};
    s.meta = {
        createdAt: meta.createdAt || nowIso(),
        updatedAt: meta.updatedAt || nowIso(),
        tick: Math.max(0, Math.floor(Number(meta.tick)) || 0),
        bootstrapped: Boolean(meta.bootstrapped),
        lastIndex: Number.isInteger(meta.lastIndex) ? meta.lastIndex : -1,
        pending: Math.max(0, Math.floor(Number(meta.pending)) || 0),
        rejected: strList(meta.rejected, 10, 200),
    };
    return s;
}

/** Minimal world seeded from the active card. `card` = {name, scenario, description, personality, avatar}. */
export function baseWorld(card = {}) {
    const loc = baseLocation(cleanText(card.scenario, 80) || 'The Current Scene', cleanText(card.scenario, 800) || undefined);
    const npcs = card.name ? [{
        id: slug(card.name, 'npc'), name: card.name, role: 'Primary character',
        appearance: cleanText(card.description, 500), personality: cleanText(card.personality, 500),
        relationship: 'Established by the current chat', locationId: loc.id, status: 'present', materializedAvatar: card.avatar || '', known: true, nameKnown: true, main: true,
    }] : [];
    return normalizeState({
        worldName: card.name ? `${card.name}'s World` : 'Living World',
        premise: cleanText(card.scenario || card.description, 1200),
        tone: 'immersive and grounded',
        locations: [loc],
        currentLocationId: loc.id,
        npcs,
        chronicle: [{ at: nowIso(), text: 'The living world opened.' }],
    });
}

export const currentLocation = state => state.locations.find(l => l.id === state.currentLocationId) || state.locations[0];
export const presentNpcs = state => state.npcs.filter(n => n.locationId === state.currentLocationId && n.status !== 'dead' && !n.travel);

export function timeSlot(state) {
    const hour = Number(String(state.clock?.time || '12:00').split(':')[0]);
    return hour < 5 ? 'night' : hour < 9 ? 'dawn' : hour < 18 ? 'day' : hour < 21 ? 'dusk' : 'night';
}


const WEATHER_LINES = {
    clear: 'The sky is clear and the light is sharp.',
    cloudy: 'Cloud cover softens the light and washes out colors.',
    overcast: 'Low cloud presses down, muffling sound and color.',
    rain: 'Rain patters steadily and the air smells of wet stone.',
    storm: 'Wind-driven rain and distant thunder make the world feel small.',
    snow: 'Snow falls in silence, hushing every sound.',
    fog: 'Fog swallows the distance and turns familiar shapes into guesses.',
    haze: 'Heat haze shimmers over the ground and the air tastes of dust.',
    wind: 'A restless wind pushes loose things about and snaps at clothing.',
    hot: 'The heat presses down, and even the shade feels tired.',
    cold: 'The cold bites; breath fogs and metal stings to the touch.',
};
const TIME_LINES = {
    night: 'Lamplight pools in the dark and the world narrows to pockets of warmth.',
    dawn: 'Grey first light creeps in, washing everything in blue.',
    day: 'The day is at full stretch, light and shadow in constant motion.',
    dusk: 'Long shadows stretch and the light turns amber before it fails.',
};
export const WEATHER_ICONS = { clear: 'fa-sun', cloudy: 'fa-cloud', overcast: 'fa-cloud', rain: 'fa-cloud-rain', storm: 'fa-cloud-bolt', snow: 'fa-snowflake', fog: 'fa-smog', haze: 'fa-smog', wind: 'fa-wind', hot: 'fa-temperature-high', cold: 'fa-temperature-low' };
export const weatherClass = state => weatherKind(state.clock?.weather);
export const weatherIcon = state => (timeSlot(state) === 'night' && weatherClass(state) === 'clear') ? 'fa-moon' : WEATHER_ICONS[weatherClass(state)];

export function atmosphereLine(state) {
    if (state.scene?.ambient) return state.scene.ambient;
    return [WEATHER_LINES[weatherClass(state)] || '', TIME_LINES[timeSlot(state)]].filter(Boolean).join(' ');
}

/** Compact prose brief for the roleplay prompt: the facts the narrator should reach for. */
export function sceneBrief(state) {
    const loc = currentLocation(state);
    const c = state.clock;
    const lines = [`Day ${c.day}, ${c.time} · ${c.weather}${c.season !== 'unspecified' ? ` · ${c.season}` : ''} · ${loc.name}${loc.type && loc.type !== 'scene' ? ` (${loc.type})` : ''}`];
    lines.push(atmosphereLine(state));
    const person = n => {
        const role = `${n.role}${['active', 'present'].includes(n.status) ? '' : `, ${n.status}`}${n.nameKnown ? '' : '; name unknown to {{user}}'}`;
        if (!n.main) return `${n.name} (${role})${n.tags[0] ? ` — ${cleanText(n.tags[0], 40)}` : ''}`;
        const facts = n.tags.length ? n.tags.join(', ') : [n.body.restraints, n.body.wearing, n.body.position].filter(Boolean).join(', ');
        const tail = facts ? cleanText(facts, 90) : n.personality ? cleanText(n.personality, 60) : '';
        return `${n.name} (${role})${tail ? ` — ${tail}` : ''}${n.hidden ? ` [unknown to {{user}}: ${cleanText(n.hidden, 120)}]` : ''}`;
    };
    const present = presentNpcs(state);
    const main = present.filter(n => n.main).slice(0, 4);
    const extras = present.filter(n => !n.main).slice(0, 5);
    if (main.length) lines.push(`Here: ${main.map(person).join('; ')}`);
    if (extras.length) lines.push(`${main.length ? 'Also here' : 'Here'}: ${extras.map(person).join('; ')}`);
    const you = state.player;
    const yours = [you.body.wearing && `wearing ${you.body.wearing}`, you.body.position, you.body.condition, you.holding.length && `holding ${you.holding.join(', ')}`].filter(Boolean);
    if (yours.length) lines.push(`{{user}}: ${cleanText(yours.join('; '), 160)}`);
    const exits = Object.entries(loc.routes).map(([id, r]) => [state.locations.find(l => l.id === id), r]).filter(([l]) => l).slice(0, 6);
    if (exits.length) lines.push(`Exits: ${exits.map(([l, r]) => `${l.name} ${r.minutes}m`).join(', ')}`);
    const heard = exits.filter(([l, r]) => r.sense === 'door' && l.sound && l.soundTick === state.meta.tick).map(([l]) => `${l.name} — ${l.sound}`);
    if (heard.length) lines.push(`Heard: ${heard.join('; ')}`);
    const loose = state.items.filter(i => i.locationId === loc.id && !i.ownerId).slice(0, 5).map(i => i.name);
    if (loose.length) lines.push(`Around: ${loose.join(', ')}`);
    const threads = [...state.events, ...state.quests].filter(isOpen).slice(-3).map(t => t.name);
    if (threads.length) lines.push(`Stirring: ${threads.join('; ')}`);
    const recent = state.chronicle.slice(-2).map(x => cleanText(x.text, 140));
    if (recent.length) lines.push(`Lately: ${recent.join(' ')}`);
    if (state.scene.note) lines.push(`Note: ${state.scene.note}`);
    return lines.join('\n');
}

export function buildInjection(state, { strictAgency = true } = {}) {
    return `[Living world — authoritative continuity. Convey it through senses, behavior and consequence; never recite it or mention this note. Other people keep their own motives, knowledge and routines.${strictAgency ? ' Never write {{user}}\'s words, thoughts, feelings or choices.' : ''}]\n${sceneBrief(state)}`;
}

export const DIRECTOR_SYSTEM = 'You maintain the hidden world state of an ongoing roleplay. Reply with exactly one JSON object and nothing else: no prose, no code fences.';

const PATCH_BASE = `Return one JSON object containing only what changed (omit unchanged keys):
{"minutes":scene minutes passed 0-90,"jump":"sleep|wait|travel|montage if the exchange skipped time (allows 720)","weather":"","ambient":"1-2 sensory sentences","now":"1-2 sentences: what is happening right now, as {{user}} knows it","move_to":"id of the place {{user}} ended up in",
"you":{"wearing","position","condition","holding":[]},"sounds":{"door exit id":"what {{user}} hears from there"},
"locations":[{"id","name","type","description","connections":["id"],"routes":{"id":{"minutes":0,"sense":"open|door|none"}}}],
"npcs":[{"id","name","role","appearance","personality","goals":[],"relationship","locationId","status","nameKnown":true,"look":"≤20 words, how {{user}} sees them, once","routine":{"dawn|day|dusk|night":"loc id"},"body":{"restraints","wearing","position","condition"},"mind":{"mood","wants","toward"},"holding":[],"tags":["2-3 short facts {{user}} noticed"],"hidden":"truth {{user}} cannot perceive"}],
"items":[{"id","name","type","description","rarity","quantity","ownerId","locationId"}],
"events"/"quests":[{"id","name","description","status"}],"factions":[{"id","name","description","members":[]}],
"chronicle":["at most 3 terse continuity facts"],
"learned":[{"id","k":"like|dislike|interest|history|trait|bond|promise","t":"≤12 words"}]}
Upsert by id: a known id patches only the fields you send; a new id needs every field and a link (connections+routes, owner/place, locationId and routine). Ids are lowercase-hyphen slugs. status "resolved" or "failed" closes a thread. ownerId "player" = {{user}} carries it.
State fields only for people HERE. People with a SHEETS line are main; others are background: tags only. For main people, body/mind/holding/tags = what {{user}} actually noticed (looked away or covered = not noticed); mind = {{user}}'s read, hedged with "?" (wants: "some time alone?"), never true intent; truth {{user}} can't perceive goes in "hidden" (one line). nameKnown once {{user}} learned the name. learned = what {{user}} saw, heard or was told in the NEW EXCHANGE, max 3 per person, not already in KNOWN, never hidden facts. you = {{user}}'s visible state from their own words, never feelings. Animals and people are never items (animals go in npcs). move_to only when {{user}}'s own message takes them somewhere, never because the narration placed them. Sheets win: never contradict a sheet. Everyone moves only along routes (EXITS); locationId is where someone heads.`;

/**
 * The patch contract for the director. `bond` only exists when standing is on, so a world with the
 * feature switched off pays nothing for it in tokens and the model never invents the field.
 */
const patchContract = ({ standing = true, relations = true } = {}) => {
    const extra = [standing && '"bond":-5..5', relations && '"toward":{"id":-5..5}'].filter(Boolean).join(',');
    return extra
        ? PATCH_BASE.replace('"hidden":"truth {{user}} cannot perceive"}', `"hidden":"truth {{user}} cannot perceive",${extra}`)
        : PATCH_BASE;
};

function budget(detail) {
    return detail === 'maximum' ? 3 : detail === 'high' ? 2 : 1;
}

const stateLine = n => [n.tags.join(', '), ...BODY.filter(k => n.body[k]).map(k => `${k} ${n.body[k]}`), ...MIND.filter(k => n.mind[k]).map(k => `${k} ${n.mind[k]}`), n.holding.length ? `holding ${n.holding.join(', ')}` : '', n.hidden ? `hidden ${n.hidden}` : ''].filter(Boolean).join(' | ');

/** Director prompt: only the slice of state the patch can touch, plus the new exchange. `sheets` = {npcId|'you': text}. */
export function directorPrompt(state, transcript, policy = {}, sheets = {}) {
    const loc = currentLocation(state);
    const here = presentNpcs(state);
    const others = state.npcs.filter(n => !here.includes(n)).sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen))).slice(0, 12);
    const exits = Object.entries(loc.routes).map(([id, r]) => [state.locations.find(l => l.id === id), r]).filter(([l]) => l);
    const near = new Set([loc, ...exits.map(([l]) => l)]);
    const known = state.locations.filter(l => !near.has(l)).slice(-12);
    const items = state.items.filter(i => i.locationId === loc.id || i.ownerId === 'player' || here.some(n => n.id === i.ownerId)).slice(0, 10);
    const threads = [...state.events, ...state.quests].filter(isOpen).slice(-6);
    const n = budget(policy.detail);
    const allow = [policy.allowNewCharacters !== false && 'people', policy.allowNewItems !== false && 'items', policy.allowNewLocations !== false && 'places'].filter(Boolean);
    const npcLine = x => `${x.id}|${x.name}|${x.role}|${x.travel ? `${x.locationId}→${x.travel.to}` : x.locationId}|${x.status}`;
    const states = here.filter(x => x.main).map(x => [x.id, stateLine(x)]).filter(([, v]) => v).map(([id, v]) => `STATE ${id}: ${v}`);
    const you = [...YOU.filter(k => state.player.body[k]).map(k => `${k} ${state.player.body[k]}`), state.player.holding.length ? `holding ${state.player.holding.join(', ')}` : ''].filter(Boolean);
    const sheetLines = [...here.map(x => x.id), 'you'].filter(id => sheets[id]).map(id => `${id}: ${cleanText(sheets[id], 240)}`);
    return [
        `WORLD ${state.worldName} — ${state.genre}; tone: ${state.tone}.${state.rules.length ? ` Rules: ${state.rules.slice(0, 6).join('; ')}.` : ''}`,
        `NOW day ${state.clock.day} ${state.clock.time}, ${state.clock.weather}. HERE ${loc.id}: ${loc.name} (${loc.type}) — ${cleanText(loc.description, 180)}`,
        exits.length ? `EXITS ${exits.map(([l, r]) => `${l.id}=${l.name} ${r.minutes}m ${r.sense}`).join(', ')}` : 'EXITS none mapped',
        known.length ? `PLACES ${known.map(l => `${l.id}=${l.name}`).join(', ')}` : '',
        `PEOPLE id|name|role|at|status\n${[...here, ...others].map(npcLine).join('\n') || 'none'}`,
        ...states,
        ...here.filter(x => x.learned.length).map(x => `KNOWN ${x.id}: ${x.learned.slice(-4).map(f => f.t).join('; ')}`),
        you.length ? `YOU ${you.join(' | ')}` : '',
        sheetLines.length ? `SHEETS\n${sheetLines.join('\n')}` : '',
        items.length ? `ITEMS ${items.map(i => `${i.id}=${i.name}${i.ownerId ? `@${i.ownerId}` : ''}`).join(', ')}` : '',
        threads.length ? `OPEN ${threads.map(t => `${t.id}=${t.name}`).join('; ')}` : '',
        `NEW EXCHANGE\n${transcript || '(none)'}`,
        patchContract(policy),
        `Materialize what the exchange implies${allow.length ? ` (${allow.join(', ')}; at most ${n} new per kind)` : ' only by updating existing entries'}, only here or along the exits. Advance open threads; people follow their routines as time passes.${policy.offscreen === false ? ' No off-screen events.' : ' Off-screen change only when causally justified.'} Never invent {{user}}'s actions, words or feelings.`,
    ].filter(Boolean).join('\n');
}

export function bootstrapPrompt(lore, transcript) {
    return `Create a compact, vivid persistent world for this roleplay: an explorable settlement with residents who have their own motives, useful objects, social tension, and room to grow. Never define {{user}}'s history.
Seed 5-10 locations with connections, 6-12 people with distinct roles, motives and routines, 6-14 items, 0-4 factions, 1-3 open events. Only people present at the start go in the starting location. Avoid generic filler the lore does not call for.

LORE
${lore || '(no card lore)'}

RECENT CHAT
${transcript || '(none)'}

Return one JSON object:
{"worldName","premise","genre","tone","rules":[],"clock":{"day":1,"time":"HH:MM","weather","season"},"currentLocationId",
"locations":[{"id","name","type","description","connections":["id"]}],
"npcs":[{"id","name","role","appearance","personality","goals":[],"relationship","locationId","status","secrets":[],"routine":{"dawn","day","dusk","night"}}],
"items":[{"id","name","type","description","rarity","quantity","ownerId","locationId"}],
"factions":[{"id","name","description","members":[]}],"events":[{"id","name","description","status"}],"quests":[]}
Ids are lowercase-hyphen slugs; routine values are location ids.`;
}

export function advanceClock(clock, minutes) {
    const amount = Math.max(0, Math.min(10080, Math.round(Number(minutes) || 0)));
    const [h, m] = String(clock.time || '09:00').split(':').map(Number);
    const total = (Number(clock.day || 1) - 1) * 1440 + (h || 0) * 60 + (m || 0) + amount;
    clock.day = Math.floor(total / 1440) + 1;
    const dm = total % 1440;
    clock.time = `${String(Math.floor(dm / 60)).padStart(2, '0')}:${String(dm % 60).padStart(2, '0')}`;
    return amount;
}

/** Send people toward their routine spot for the current time slot, along the map. Returns names set moving. */
export function enforceRoutines(state, skip = new Set()) {
    const ids = new Set(state.locations.map(l => l.id));
    const byName = new Map(state.locations.map(l => [slug(l.name, ''), l.id]));
    const slot = timeSlot(state);
    const moved = [];
    for (const n of state.npcs) {
        if (!n.routine || n.status === 'dead' || skip.has(n.id)) continue;
        let target = n.routine[slot] || n.routine.day;
        if (target && !ids.has(target)) target = byName.get(target);
        if (!target || target === n.locationId || n.travel?.to === target) continue;
        if (sendNpc(state, n, target) !== 'no-route') moved.push(n.name);
    }
    return moved;
}

/** Advance time; trips in progress land; when the time of day turns over, people set off on their routines. */
export function passTime(state, minutes, skip) {
    const before = timeSlot(state);
    advanceClock(state.clock, minutes);
    tickTravel(state);
    if (timeSlot(state) === before) return;
    if (enforceRoutines(state, skip).length) state.chronicle.push({ at: nowIso(), text: `As ${timeSlot(state)} settles in, folk drift to their usual haunts.` });
    tickTravel(state);
}

function defined(obj) {
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}

/** Upsert entries by id or name. Returns {created, touched} ids. */
function merge(collection, entries, { allowNew = true, defaults = {}, prefix }) {
    const created = [];
    const touched = [];
    for (const raw of entries) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const value = defined(raw);
        const id = slug(value.id || value.name, prefix);
        const name = String(value.name || '').toLowerCase();
        const existing = collection.find(x => x.id === id || (name && x.name.toLowerCase() === name));
        if (existing) {
            const connections = value.connections ? [...new Set([...(existing.connections || []), ...list(value.connections).map(c => slug(c, 'location'))])] : existing.connections;
            const routes = value.routes && typeof value.routes === 'object' ? { ...existing.routes, ...value.routes } : existing.routes;
            // toward is a map of other people, not a field: a patch about one pair must not wipe the rest.
            const toward = value.toward && typeof value.toward === 'object' ? towardOf({ ...existing.toward, ...value.toward }) : existing.toward;
            Object.assign(existing, value, { id: existing.id }, connections ? { connections } : {}, routes ? { routes } : {}, toward ? { toward } : {});
            touched.push(existing.id);
        } else if (allowNew && (value.name || value.id)) {
            collection.push({ ...defaults, ...value, id, name: value.name || value.id });
            created.push(id);
            touched.push(id);
        }
    }
    return { created, touched };
}

const pick = (patch, ...keys) => keys.flatMap(k => list(patch[k]));
const STATE_FIELDS = ['body', 'mind', 'holding', 'tags', 'hidden'];
const findPlace = (state, ref) => state.locations.find(l => l.id === slug(ref, '') || l.name.toLowerCase() === String(ref ?? '').toLowerCase());

/** Mark a walked path visited; returns nothing. */
function walk(state, path) {
    for (const id of path) {
        const loc = state.locations.find(l => l.id === id);
        if (loc) loc.visited = loc.discovered = true;
    }
}

/**
 * Apply a director patch under the world's rules: the director proposes, the map decides.
 * Moves follow routes and cost their time, people elsewhere travel instead of teleporting,
 * new things appear only where the story is, and state sticks only for people in the scene.
 * Accepts the v1 new_x/x_updates keys too.
 */
export function applyPatch(state, patch, policy = {}) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('The director returned something other than a JSON object.');
    const p = { allowNewCharacters: true, allowNewItems: true, allowNewLocations: true, maxNpcs: 48, maxItems: 80, maxLocations: 36, ...policy };
    const start = state.currentLocationId;
    const before = new Set(presentNpcs(state).map(n => n.id));
    const rejected = [];
    const stamp = nowIso();

    const locs = merge(state.locations, pick(patch, 'locations', 'new_locations', 'location_updates'), { allowNew: p.allowNewLocations, prefix: 'location', defaults: { type: 'place', discovered: true, connections: [], danger: 'unknown' } });
    for (const id of locs.created) {
        const loc = state.locations.find(l => l.id === id);
        loc.connections = list(loc.connections).map(c => slug(c, 'location'));
        if (loc.id !== start && !loc.connections.includes(start)) loc.connections.push(start); // new places open off the scene
    }
    normalizeRoutes(state.locations);

    // People: positions become move proposals, state waits until we know who is here.
    const moves = [];
    const later = [];
    const nested = []; // `learned` written inside an npc entry
    const people = pick(patch, 'npcs', 'new_npcs', 'npc_updates').filter(e => e && typeof e === 'object' && !Array.isArray(e)).map(raw => {
        const e = { ...raw };
        if ('look' in e && state.npcs.some(n => (n.id === slug(e.id || e.name, 'npc') || (e.name && n.name.toLowerCase() === String(e.name).toLowerCase())) && n.look)) delete e.look; // set once, then fixed
        const extra = {};
        for (const k of STATE_FIELDS) if (k in e) { extra[k] = e[k]; delete e[k]; }
        if ('learned' in e) {
            for (const f of list(e.learned)) nested.push({ ...(typeof f === 'object' ? f : { t: f }), id: slug(e.id || e.name, 'npc') });
            delete e.learned;
        }
        if ('locationId' in e) {
            const loc = findPlace(state, e.locationId);
            const existing = state.npcs.find(n => n.id === slug(e.id || e.name, 'npc') || (e.name && n.name.toLowerCase() === String(e.name).toLowerCase()));
            if (existing && loc && loc.id !== existing.locationId) moves.push({ npc: existing, to: loc.id });
            else if (existing && !loc) rejected.push(`${existing.name} → "${e.locationId}": unknown place`);
            if (existing || !loc) delete e.locationId;
            else e.locationId = loc.id; // a mentioned person keeps their (existing) home
        }
        later.push([e, extra]);
        return e;
    });
    const npcs = merge(state.npcs, people, { allowNew: p.allowNewCharacters, prefix: 'npc', defaults: { locationId: start, status: 'active', firstSeen: stamp } });
    for (const id of npcs.created) {
        const n = state.npcs.find(x => x.id === id);
        if (n.locationId !== start) n.known = true; // heard about
        n.nameKnown ??= n.locationId !== start;
    }

    const items = merge(state.items, pick(patch, 'items', 'new_items', 'item_updates'), { allowNew: p.allowNewItems, prefix: 'item', defaults: { locationId: start, quantity: 1, rarity: 'ordinary' } });
    const presentIds = new Set(presentNpcs(state).map(n => n.id));
    for (const id of items.created) {
        const it = state.items.find(x => x.id === id);
        if (it.ownerId === 'player') it.locationId = '';
        else if (it.ownerId && presentIds.has(slug(it.ownerId, ''))) it.locationId = '';
        else { it.ownerId = ''; it.locationId = start; }
    }
    merge(state.factions, pick(patch, 'factions', 'new_factions', 'faction_updates'), { prefix: 'faction', defaults: { status: 'active' } });
    for (const [list, keys] of [[state.events, ['events', 'new_events', 'event_updates']], [state.quests, ['quests', 'new_quests', 'quest_updates']]]) {
        const { touched } = merge(list, pick(patch, ...keys), { prefix: keys[0].slice(0, -1), defaults: { status: 'active' } });
        for (const t of list) if (touched.includes(t.id)) t.known = true;
    }

    // The user's move: along the map, never a jump.
    let walked = 0;
    const target = patch.move_to || patch.current_location_id;
    if (target && state.scene.moved) rejected.push(`move_to "${target}": {{user}} chose where to be this turn`);
    else if (target) {
        const dest = findPlace(state, target);
        const route = dest && dest.id !== start ? shortestPath(state, start, dest.id) : null;
        if (!dest) rejected.push(`move_to "${target}": unknown place`);
        else if (dest.id !== start && !route) rejected.push(`move_to ${dest.name}: no route from ${currentLocation(state).name}`);
        else if (route) {
            walk(state, route.path);
            walked = route.minutes;
            state.currentLocationId = dest.id;
            state.scene.ambient = '';
            state.scene.now = '';
            state.player.body.position = ''; // belonged to the old place
        }
    }

    // Others set off now; whoever's trip fits in the elapsed time arrives.
    for (const { npc, to } of moves) if (sendNpc(state, npc, to) === 'no-route') rejected.push(`${npc.name} → ${to}: no route`);
    if (patch.weather) state.clock.weather = str(patch.weather, 60);
    if (patch.ambient) state.scene.ambient = str(patch.ambient, 500);
    passTime(state, Math.max(capMinutes(patch.minutes ?? patch.time_minutes, patch.jump), walked), new Set(npcs.touched));

    const here = new Set(presentNpcs(state).map(n => n.id));
    for (const [e, extra] of later) {
        const n = state.npcs.find(x => x.id === slug(e.id || e.name, 'npc') || (e.name && x.name.toLowerCase() === String(e.name).toLowerCase()));
        if (!n || !here.has(n.id)) continue;
        if ('tags' in extra) n.tags = strList(extra.tags, 3, 40);
        if (!n.main) continue; // background people: tags only
        if ('hidden' in extra) n.hidden = str(extra.hidden, 200);
        if (extra.body) n.body = { ...n.body, ...fields(extra.body, BODY.filter(k => k in extra.body), 120) };
        if (extra.mind) n.mind = { ...n.mind, ...fields(extra.mind, MIND.filter(k => k in extra.mind), 120) };
        if ('holding' in extra) n.holding = strList(extra.holding, 6, 80);
    }
    for (const n of state.npcs) if (here.has(n.id)) n.lastSeen = stamp;
    state.scene.fresh = applyLearned(state, [...list(patch.learned), ...nested], here);
    if (patch.you && typeof patch.you === 'object') {
        state.player.body = { ...state.player.body, ...fields(patch.you, YOU.filter(k => k in patch.you), 120) };
        if ('holding' in patch.you) state.player.holding = strList(patch.you.holding, 6, 80);
    }
    if (patch.now) state.scene.now = str(patch.now, 400);

    const tick = state.meta.tick + 1;
    const nowAt = currentLocation(state);
    if (patch.sounds && typeof patch.sounds === 'object') {
        for (const [ref, text] of Object.entries(patch.sounds)) {
            const loc = findPlace(state, ref);
            if (loc && nowAt.routes?.[loc.id]?.sense === 'door' && str(text, 200)) Object.assign(loc, { sound: str(text, 200), soundTick: tick });
        }
    }

    const moved = state.currentLocationId !== start;
    state.scene.arrived = moved ? [] : [...here].filter(id => !before.has(id));
    state.scene.left = moved ? [] : [...before].filter(id => !here.has(id)).map(id => {
        const n = state.npcs.find(x => x.id === id);
        return { id, toward: n?.travel?.to || (n && n.locationId !== state.currentLocationId ? n.locationId : '') };
    });
    state.scene.peeked = [];
    state.scene.moved = false;
    state.scene.note = '';
    state.meta.rejected = rejected;

    const chronicle = strList(patch.chronicle, 3, 700);
    if (!chronicle.length && patch.summary) chronicle.push(str(patch.summary, 700));
    for (const text of chronicle) state.chronicle.push({ at: stamp, text });

    state.meta.tick = tick;
    state.meta.updatedAt = stamp;
    const out = normalizeState(state);
    const keepHere = x => x.locationId === out.currentLocationId;
    out.npcs = capKeeping(out.npcs, p.maxNpcs, keepHere);
    out.items = capKeeping(out.items, p.maxItems, keepHere);
    out.locations = capKeeping(out.locations, p.maxLocations, l => l.id === out.currentLocationId);
    return normalizeState(out);
}

/** Record what {{user}} learned. Only people they know of or are with can teach them anything. Returns [{id,t}] of new facts. */
function applyLearned(state, entries, here) {
    const byPerson = new Map();
    for (const e of list(entries)) {
        if (!e || typeof e !== 'object') continue;
        const n = state.npcs.find(x => x.id === slug(e.id || e.name, ''));
        if (n && (n.known || here.has(n.id))) byPerson.set(n.id, [...(byPerson.get(n.id) ?? []), e]);
    }
    const at = `D${state.clock.day} ${state.clock.time}`;
    return [...byPerson].flatMap(([id, items]) => addLearned(state.npcs.find(x => x.id === id), items, at).map(f => ({ id, t: f.t }))).slice(0, 12);
}

// Drop the oldest entries past the cap, never the ones in the current scene.
function capKeeping(items, max, keep) {
    const limit = Math.max(1, Number(max) || items.length);
    if (items.length <= limit) return items;
    const drop = new Set(items.filter(x => !keep(x)).slice(0, items.length - limit));
    return items.filter(x => !drop.has(x));
}

/** Player-driven travel along the map. Returns the chronicle line, or '' when there is no route. */
export function travel(state, idOrName) {
    const dest = findPlace(state, String(idOrName ?? '').trim());
    if (!dest || dest.id === state.currentLocationId) return '';
    const route = shortestPath(state, state.currentLocationId, dest.id);
    if (!route) return '';
    const from = currentLocation(state);
    walk(state, route.path);
    state.currentLocationId = dest.id;
    Object.assign(state.scene, { ambient: '', now: '', arrived: [], left: [], peeked: [], moved: true, note: `{{user}} has just walked to ${dest.name} (${route.minutes} min) and is now there.` });
    state.player.body.position = '';
    passTime(state, route.minutes);
    const line = `Travelled from ${from?.name || 'somewhere'} to ${dest.name} (${route.minutes} min).`;
    state.chronicle.push({ at: nowIso(), text: line });
    state.chronicle = state.chronicle.slice(-MAX_CHRONICLE);
    return line;
}

/** Transcript of chat[from..to] for the director, newest last, bounded. */
export function transcriptOf(chat, from, to, { maxMessages = 6, maxChars = 1400 } = {}) {
    const out = [];
    for (let i = Math.max(0, from, to - maxMessages + 1); i <= to && i < (chat?.length ?? 0); i++) {
        const m = chat[i];
        if (!m || m.is_system) continue;
        out.push(`${m.name || (m.is_user ? 'User' : 'Character')}: ${cleanText(m.mes, maxChars)}`);
    }
    return out.join('\n');
}
