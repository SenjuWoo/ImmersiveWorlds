// Pure living-world engine: schema, scene brief, director contract, patch application.
// No SillyTavern imports, so tests run it under plain node.

export const STATE_KEY = 'immersive_worlds_state_v1';
export const TURN_KEY = 'immersive_worlds_turn_v1';
export const STATE_VERSION = 2;
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
export const isOpen = thread => !DONE.has(String(thread?.status || '').toLowerCase());

function normRoutine(r) {
    if (!r || typeof r !== 'object') return null;
    const out = {};
    for (const s of SLOTS) if (r[s]) out[s] = slug(r[s], 'location');
    return Object.keys(out).length ? out : null;
}

function normThread(x, i, prefix) {
    const t = typeof x === 'string' ? { name: x } : x;
    const out = {
        id: slug(t.id || t.name || t.title || `${prefix}-${i + 1}`, prefix),
        name: str(t.name || t.title || t.summary || prefix, 120),
        description: str(t.description || t.summary || '', 600),
        status: str(t.resolved === true ? 'resolved' : (t.status || 'active'), 40).toLowerCase(),
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
        danger: str(x.danger, 80) || 'unknown',
    }));
    if (!s.locations.length) s.locations.push(baseLocation());
    const ids = new Set(s.locations.map(l => l.id));
    for (const l of s.locations) l.connections = l.connections.filter(c => c !== l.id && ids.has(c));
    s.currentLocationId = slug(s.currentLocationId || s.locations[0].id, 'location');
    if (!ids.has(s.currentLocationId)) s.currentLocationId = s.locations[0].id;
    s.npcs = list(s.npcs).filter(x => typeof x === 'object').map((x, i) => ({
        id: slug(x.id || x.name || `npc-${i + 1}`, 'npc'),
        name: str(x.name, 100) || `Stranger ${i + 1}`,
        role: str(x.role, 160) || 'resident',
        appearance: str(x.appearance, 900),
        personality: str(x.personality, 900),
        goals: strList(x.goals, 8, 300),
        relationship: str(x.relationship, 500) || 'unknown',
        locationId: ids.has(slug(x.locationId, '')) ? slug(x.locationId, '') : s.currentLocationId,
        status: str(x.status, 100).toLowerCase() || 'active',
        secrets: strList(x.secrets, 6, 300),
        inventory: strList(x.inventory, 20, 120),
        routine: normRoutine(x.routine),
        firstSeen: x.firstSeen || nowIso(),
        lastSeen: x.lastSeen || nowIso(),
        materializedAvatar: str(x.materializedAvatar, 300),
    }));
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
    s.events = list(s.events).map((x, i) => normThread(x, i, 'event')).slice(-40);
    s.quests = list(s.quests).map((x, i) => normThread(x, i, 'quest')).slice(-30);
    const player = s.player && typeof s.player === 'object' ? s.player : {};
    s.player = {
        currency: Number(player.currency) || 0,
        reputation: player.reputation && typeof player.reputation === 'object' ? player.reputation : {},
        inventoryIds: strList(player.inventoryIds, 200, 60).map(v => slug(v, 'item')),
    };
    s.chronicle = list(s.chronicle).map(x => (typeof x === 'string' ? { at: nowIso(), text: x } : x))
        .filter(x => x && x.text).map(x => ({ at: str(x.at, 40) || nowIso(), text: str(x.text, 700) })).slice(-MAX_CHRONICLE);
    s.scene = { ambient: str(s.scene?.ambient, 500) };
    const meta = s.meta && typeof s.meta === 'object' ? s.meta : {};
    s.meta = {
        createdAt: meta.createdAt || nowIso(),
        updatedAt: meta.updatedAt || nowIso(),
        tick: Math.max(0, Math.floor(Number(meta.tick)) || 0),
        bootstrapped: Boolean(meta.bootstrapped),
        lastIndex: Number.isInteger(meta.lastIndex) ? meta.lastIndex : -1,
        pending: Math.max(0, Math.floor(Number(meta.pending)) || 0),
    };
    return s;
}

/** Minimal world seeded from the active card. `card` = {name, scenario, description, personality, avatar}. */
export function baseWorld(card = {}) {
    const loc = baseLocation(cleanText(card.scenario, 80) || 'The Current Scene', cleanText(card.scenario, 800) || undefined);
    const npcs = card.name ? [{
        id: slug(card.name, 'npc'), name: card.name, role: 'Primary character',
        appearance: cleanText(card.description, 500), personality: cleanText(card.personality, 500),
        relationship: 'Established by the current chat', locationId: loc.id, status: 'present', materializedAvatar: card.avatar || '',
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
export const presentNpcs = state => state.npcs.filter(n => n.locationId === state.currentLocationId && n.status !== 'dead');

export function timeSlot(state) {
    const hour = Number(String(state.clock?.time || '12:00').split(':')[0]);
    return hour < 5 ? 'night' : hour < 9 ? 'dawn' : hour < 18 ? 'day' : hour < 21 ? 'dusk' : 'night';
}

const weatherKey = state => String(state.clock?.weather || 'clear').toLowerCase().replace(/[^a-z]+/g, '');

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
const WEATHER_ALIAS = { sunny: 'clear', raining: 'rain', rainy: 'rain', drizzle: 'rain', thunderstorm: 'storm', stormy: 'storm', snowing: 'snow', mist: 'fog', misty: 'fog', foggy: 'fog', windy: 'wind', humid: 'hot', heat: 'hot', freezing: 'cold' };
const TIME_LINES = {
    night: 'Lamplight pools in the dark and the world narrows to pockets of warmth.',
    dawn: 'Grey first light creeps in, washing everything in blue.',
    day: 'The day is at full stretch, light and shadow in constant motion.',
    dusk: 'Long shadows stretch and the light turns amber before it fails.',
};
export const WEATHER_ICONS = { clear: 'fa-sun', cloudy: 'fa-cloud', overcast: 'fa-cloud', rain: 'fa-cloud-rain', storm: 'fa-cloud-bolt', snow: 'fa-snowflake', fog: 'fa-smog', haze: 'fa-smog', wind: 'fa-wind', hot: 'fa-temperature-high', cold: 'fa-temperature-low' };
export const weatherClass = state => { const k = weatherKey(state); return WEATHER_ALIAS[k] || (WEATHER_LINES[k] ? k : 'clear'); };
export const weatherIcon = state => (timeSlot(state) === 'night' && weatherClass(state) === 'clear') ? 'fa-moon' : WEATHER_ICONS[weatherClass(state)];

export function atmosphereLine(state) {
    if (state.scene?.ambient) return state.scene.ambient;
    const k = weatherKey(state);
    return [WEATHER_LINES[WEATHER_ALIAS[k] || k] || '', TIME_LINES[timeSlot(state)]].filter(Boolean).join(' ');
}

/** Compact prose brief for the roleplay prompt. */
export function sceneBrief(state) {
    const loc = currentLocation(state);
    const c = state.clock;
    const lines = [`Day ${c.day}, ${c.time} · ${c.weather}${c.season !== 'unspecified' ? ` · ${c.season}` : ''} · ${loc.name}${loc.type && loc.type !== 'scene' ? ` (${loc.type})` : ''}`];
    lines.push(atmosphereLine(state));
    const present = presentNpcs(state).slice(0, 5);
    if (present.length) {
        lines.push('Here: ' + present.map(n => `${n.name} (${n.role}${['active', 'present'].includes(n.status) ? '' : `, ${n.status}`})${n.personality ? ` — ${cleanText(n.personality, 70)}` : ''}`).join('; '));
    }
    const exits = loc.connections.map(id => state.locations.find(l => l.id === id)?.name).filter(Boolean).slice(0, 6);
    if (exits.length) lines.push(`Exits: ${exits.join(', ')}`);
    const loose = state.items.filter(i => i.locationId === loc.id && !i.ownerId).slice(0, 5).map(i => i.name);
    if (loose.length) lines.push(`Around: ${loose.join(', ')}`);
    const threads = [...state.events, ...state.quests].filter(isOpen).slice(-3).map(t => t.name);
    if (threads.length) lines.push(`Stirring: ${threads.join('; ')}`);
    const recent = state.chronicle.slice(-2).map(x => cleanText(x.text, 140));
    if (recent.length) lines.push(`Lately: ${recent.join(' ')}`);
    return lines.join('\n');
}

export function buildInjection(state, { strictAgency = true } = {}) {
    return `[Living world — authoritative continuity. Convey it through senses, behavior and consequence; never recite it or mention this note. Other people keep their own motives, knowledge and routines.${strictAgency ? ' Never write {{user}}\'s words, thoughts, feelings or choices.' : ''}]\n${sceneBrief(state)}`;
}

export const DIRECTOR_SYSTEM = 'You maintain the hidden world state of an ongoing roleplay. Reply with exactly one JSON object and nothing else: no prose, no code fences.';

const PATCH_CONTRACT = `Return one JSON object containing only what changed (omit unchanged keys):
{"minutes":elapsed scene minutes 0-240,"weather":"","ambient":"1-2 concrete sensory sentences for the current scene","move_to":"location id",
"locations":[{"id","name","type","description","connections":["id"]}],
"npcs":[{"id","name","role","appearance","personality","goals":[],"relationship","locationId","status","routine":{"dawn":"loc id","day":"","dusk":"","night":""}}],
"items":[{"id","name","type","description","rarity","quantity","ownerId","locationId"}],
"events":[{"id","name","description","status"}],"quests":[{"id","name","description","status"}],"factions":[{"id","name","description","members":[]}],
"chronicle":["at most 3 terse continuity facts"]}
Upsert by id: a known id patches only the fields you send; a new id needs every field and a link (connections, owner/place, locationId and routine). Ids are lowercase-hyphen slugs. status "resolved" or "failed" closes a thread.`;

function budget(detail) {
    return detail === 'maximum' ? 3 : detail === 'high' ? 2 : 1;
}

/** Director prompt: only the slice of state the patch can touch, plus the new exchange. */
export function directorPrompt(state, transcript, policy = {}) {
    const loc = currentLocation(state);
    const here = presentNpcs(state);
    const others = state.npcs.filter(n => !here.includes(n)).sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen))).slice(0, 12);
    const exits = loc.connections.map(id => state.locations.find(l => l.id === id)).filter(Boolean);
    const known = state.locations.filter(l => l !== loc && !exits.includes(l)).slice(-12);
    const items = state.items.filter(i => i.locationId === loc.id || here.some(n => n.id === i.ownerId)).slice(0, 10);
    const threads = [...state.events, ...state.quests].filter(isOpen).slice(-6);
    const n = budget(policy.detail);
    const allow = [policy.allowNewCharacters !== false && 'people', policy.allowNewItems !== false && 'items', policy.allowNewLocations !== false && 'places'].filter(Boolean);
    const npcLine = x => `${x.id}|${x.name}|${x.role}|${x.locationId}|${x.status}`;
    return [
        `WORLD ${state.worldName} — ${state.genre}; tone: ${state.tone}.${state.rules.length ? ` Rules: ${state.rules.slice(0, 6).join('; ')}.` : ''}`,
        `NOW day ${state.clock.day} ${state.clock.time}, ${state.clock.weather}. HERE ${loc.id}: ${loc.name} (${loc.type}) — ${cleanText(loc.description, 180)}`,
        exits.length ? `EXITS ${exits.map(l => `${l.id}=${l.name}`).join(', ')}` : 'EXITS none mapped',
        known.length ? `PLACES ${known.map(l => `${l.id}=${l.name}`).join(', ')}` : '',
        `PEOPLE id|name|role|at|status\n${[...here, ...others].map(npcLine).join('\n') || 'none'}`,
        items.length ? `ITEMS ${items.map(i => `${i.id}=${i.name}${i.ownerId ? `@${i.ownerId}` : ''}`).join(', ')}` : '',
        threads.length ? `OPEN ${threads.map(t => `${t.id}=${t.name}`).join('; ')}` : '',
        `NEW EXCHANGE\n${transcript || '(none)'}`,
        PATCH_CONTRACT,
        `Materialize what the exchange implies${allow.length ? ` (${allow.join(', ')}; at most ${n} new per kind)` : ' only by updating existing entries'}. Advance open threads and move people along plausible routines as time passes.${policy.offscreen === false ? ' No off-screen events.' : ' Off-screen change only when causally justified.'} Never invent {{user}}'s actions, words or feelings.`,
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

/** Move people to their routine spot for the current time slot. Returns names moved. */
export function enforceRoutines(state, skip = new Set()) {
    const ids = new Set(state.locations.map(l => l.id));
    const byName = new Map(state.locations.map(l => [slug(l.name, ''), l.id]));
    const slot = timeSlot(state);
    const moved = [];
    for (const n of state.npcs) {
        if (!n.routine || n.status === 'dead' || skip.has(n.id)) continue;
        let target = n.routine[slot] || n.routine.day;
        if (target && !ids.has(target)) target = byName.get(target);
        if (!target || target === n.locationId) continue;
        n.locationId = target;
        moved.push(n.name);
    }
    return moved;
}

/** Advance time; when the time of day turns over, people drift to their routines. */
export function passTime(state, minutes, skip) {
    const before = timeSlot(state);
    advanceClock(state.clock, minutes);
    if (timeSlot(state) === before) return;
    if (enforceRoutines(state, skip).length) state.chronicle.push({ at: nowIso(), text: `As ${timeSlot(state)} settles in, folk drift to their usual haunts.` });
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
            Object.assign(existing, value, { id: existing.id }, connections ? { connections } : {});
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

/** Apply a director patch. Accepts the v2 contract and the v1 new_x/x_updates keys. */
export function applyPatch(state, patch, policy = {}) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('The director returned something other than a JSON object.');
    const p = { allowNewCharacters: true, allowNewItems: true, allowNewLocations: true, maxNpcs: 48, maxItems: 80, maxLocations: 36, ...policy };
    const here = state.currentLocationId;
    const stamp = nowIso();

    const locs = merge(state.locations, pick(patch, 'locations', 'new_locations', 'location_updates'), { allowNew: p.allowNewLocations, prefix: 'location', defaults: { type: 'place', discovered: true, connections: [], danger: 'unknown' } });
    const anchor = state.locations.find(l => l.id === here);
    for (const id of locs.created) {
        const loc = state.locations.find(l => l.id === id);
        if (!anchor || loc === anchor || (loc.connections || []).length) continue;
        loc.connections = [anchor.id];
    }
    for (const loc of state.locations) {
        for (const c of loc.connections || []) {
            const other = state.locations.find(l => l.id === slug(c, 'location'));
            if (other && !other.connections.includes(loc.id)) other.connections.push(loc.id);
        }
    }

    // A bogus place reference must not teleport anyone: drop it and keep where they were.
    const placed = entries => entries.map(e => {
        if (!e || typeof e !== 'object' || !('locationId' in e)) return e;
        const loc = state.locations.find(l => l.id === slug(e.locationId, '') || l.name.toLowerCase() === String(e.locationId).toLowerCase());
        const { locationId, ...rest } = e;
        return loc ? { ...rest, locationId: loc.id } : rest;
    });
    const npcs = merge(state.npcs, placed(pick(patch, 'npcs', 'new_npcs', 'npc_updates')), { allowNew: p.allowNewCharacters, prefix: 'npc', defaults: { locationId: here, status: 'active', firstSeen: stamp } });
    for (const id of npcs.touched) {
        const n = state.npcs.find(x => x.id === id);
        if (n && n.locationId === state.currentLocationId) n.lastSeen = stamp;
    }
    merge(state.items, placed(pick(patch, 'items', 'new_items', 'item_updates')), { allowNew: p.allowNewItems, prefix: 'item', defaults: { locationId: here, quantity: 1, rarity: 'ordinary' } });
    merge(state.factions, pick(patch, 'factions', 'new_factions', 'faction_updates'), { prefix: 'faction', defaults: { status: 'active' } });
    merge(state.events, pick(patch, 'events', 'new_events', 'event_updates'), { prefix: 'event', defaults: { status: 'active' } });
    merge(state.quests, pick(patch, 'quests', 'new_quests', 'quest_updates'), { prefix: 'quest', defaults: { status: 'active' } });

    const target = patch.move_to || patch.current_location_id;
    if (target) {
        const dest = state.locations.find(l => l.id === slug(target, '') || l.name.toLowerCase() === String(target).toLowerCase());
        if (dest && dest.id !== state.currentLocationId) {
            state.currentLocationId = dest.id;
            state.scene.ambient = '';
        }
    }
    if (patch.weather) state.clock.weather = str(patch.weather, 60);
    if (patch.ambient) state.scene.ambient = str(patch.ambient, 500);
    passTime(state, patch.minutes ?? patch.time_minutes, new Set(npcs.touched));

    const chronicle = strList(patch.chronicle, 3, 700);
    if (!chronicle.length && patch.summary) chronicle.push(str(patch.summary, 700));
    for (const text of chronicle) state.chronicle.push({ at: stamp, text });

    state.meta.tick += 1;
    state.meta.updatedAt = stamp;
    const out = normalizeState(state);
    const keepHere = x => x.locationId === out.currentLocationId;
    out.npcs = capKeeping(out.npcs, p.maxNpcs, keepHere);
    out.items = capKeeping(out.items, p.maxItems, keepHere);
    out.locations = capKeeping(out.locations, p.maxLocations, l => l.id === out.currentLocationId);
    return normalizeState(out);
}

// Drop the oldest entries past the cap, never the ones in the current scene.
function capKeeping(items, max, keep) {
    const limit = Math.max(1, Number(max) || items.length);
    if (items.length <= limit) return items;
    const drop = new Set(items.filter(x => !keep(x)).slice(0, items.length - limit));
    return items.filter(x => !drop.has(x));
}

/** Player-driven travel along the map. Returns the chronicle line, or '' if nothing changed. */
export function travel(state, idOrName, minutes = 15) {
    const q = String(idOrName ?? '').trim();
    const target = state.locations.find(l => l.id === q || l.id === slug(q, '') || l.name.toLowerCase() === q.toLowerCase());
    if (!target || target.id === state.currentLocationId) return '';
    const from = currentLocation(state);
    state.currentLocationId = target.id;
    target.discovered = true;
    state.scene.ambient = '';
    passTime(state, minutes);
    const line = `Travelled from ${from?.name || 'somewhere'} to ${target.name}.`;
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
