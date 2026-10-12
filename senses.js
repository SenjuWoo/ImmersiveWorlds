// What the user's character perceives: the HUD reads this, never the raw world. Pure, node-testable.
import { currentLocation, presentNpcs, timeSlot, weatherIcon, atmosphereLine, isOpen, passTime, BODY, MIND, YOU } from './engine.js';

export const REVEAL = ['senses', 'nearby', 'all'];
const LABELS = { restraints: 'Restraints', wearing: 'Wearing', position: 'Position', condition: 'Condition', mood: 'Mood', wants: 'Wants', toward: 'Toward you' };
const SLOT_LABEL = { dawn: 'Dawn', day: 'Day', dusk: 'Dusk', night: 'Night' };

// "lamplighter" -> "a lamplighter"; "the harbormaster" stays as written.
export const withArticle = role => !role ? 'someone' : /^(a|an|the|my|his|her|their)\s/i.test(role) ? role : `${/^[aeiou]/i.test(role) ? 'an' : 'a'} ${role}`;

export function labelOf(npc, mode = 'senses') {
    if (npc.nameKnown || mode === 'all') return npc.name;
    return npc.role ? withArticle(npc.role) : 'a stranger';
}

const pairs = (obj, keys) => keys.filter(k => obj?.[k]).map(k => [LABELS[k], obj[k]]);
const at = (state, locId) => state.npcs.filter(n => n.locationId === locId && n.status !== 'dead' && !n.travel);

/** People here are seen; people through an open way are seen from afar. */
export function markPerceived(state) {
    const here = currentLocation(state);
    for (const n of presentNpcs(state)) Object.assign(n, { known: true, seenTick: state.meta.tick });
    for (const [id, r] of Object.entries(here.routes ?? {})) {
        if (r.sense === 'open' || state.scene.peeked.includes(id)) for (const n of at(state, id)) n.known = true;
    }
}

/** Glance through a door: the room's people become seen for this turn. Returns the story note, or ''. */
export function peek(state, locId) {
    const here = currentLocation(state);
    const loc = state.locations.find(l => l.id === locId);
    if (!loc || here.routes?.[locId]?.sense !== 'door') return '';
    if (!state.scene.peeked.includes(locId)) state.scene.peeked.push(locId);
    for (const n of at(state, locId)) Object.assign(n, { known: true, seenTick: state.meta.tick });
    passTime(state, 1);
    state.scene.note = `{{user}} quietly peeks into ${loc.name}.`;
    return state.scene.note;
}

function soundOf(state, loc) {
    if (loc.sound && loc.soundTick === state.meta.tick) return loc.sound;
    const n = at(state, loc.id).length;
    return n === 0 ? '' : n === 1 ? 'someone moving about' : 'voices';
}

/** The HUD's view model. `mode`: senses (default) | nearby | all. */
export function perceive(state, mode = 'senses', { userName = '' } = {}) {
    const here = currentLocation(state);
    const all = mode === 'all';
    const present = presentNpcs(state);
    const holding = new Set(state.player.holding.map(h => h.toLowerCase()));
    const placeName = id => {
        const loc = state.locations.find(l => l.id === id);
        return loc && (loc.discovered || all) ? loc.name : '';
    };

    // Main characters (cards) in full; background people are a name and a few tags, no portrait unless they have one.
    const row = n => {
        const truth = all ? [n.hidden, ...n.secrets].filter(Boolean) : [];
        return {
            id: n.id,
            label: labelOf(n, mode),
            main: n.main,
            tags: n.tags,
            body: n.main ? pairs(n.body, BODY) : [],
            mind: n.main ? pairs(n.mind, MIND) : [],
            holding: n.main ? n.holding : [],
            avatar: n.materializedAvatar,
            isNew: state.scene.arrived.includes(n.id),
            isYou: false,
            ...(truth.length ? { truth } : {}),
        };
    };
    const you = state.player;
    const people = [
        ...present.filter(n => n.main).map(row),
        {
            id: 'you', label: userName || 'You', main: true, isYou: true, isNew: false, avatar: '',
            tags: [you.body.position, ...you.holding.map(h => `holding ${h}`)].filter(Boolean).slice(0, 3),
            body: pairs(you.body, YOU), mind: [], holding: you.holding,
        },
        ...present.filter(n => !n.main).map(row),
    ];

    const left = state.scene.left.map(({ id, toward }) => {
        const n = state.npcs.find(x => x.id === id);
        return n ? { label: labelOf(n, mode), toward: placeName(toward) } : null;
    }).filter(Boolean);

    const presentIds = new Set(present.map(n => n.id));
    const item = (i, where) => ({ id: i.id, name: i.name, type: i.type, where });
    const mine = state.items.filter(i => i.ownerId === 'player' || state.player.inventoryIds.includes(i.id))
        .map(i => item(i, holding.has(i.name.toLowerCase()) ? 'in your hand' : 'on you'));
    const loose = state.items.filter(i => i.locationId === here.id && !i.ownerId).map(i => item(i, 'here'));
    const held = state.items.filter(i => presentIds.has(i.ownerId)).map(i => item(i, `with ${labelOf(state.npcs.find(n => n.id === i.ownerId), mode)}`));

    const around = Object.entries(here.routes ?? {}).map(([id, r]) => {
        const loc = state.locations.find(l => l.id === id);
        if (!loc || (!loc.discovered && !all)) return null;
        const seen = r.sense === 'open' || state.scene.peeked.includes(id) || mode !== 'senses';
        return {
            id, name: loc.name, minutes: r.minutes, sense: r.sense, visited: loc.visited, seen,
            people: seen ? at(state, id).map(n => labelOf(n, mode)) : [],
            sound: !seen && r.sense === 'door' ? soundOf(state, loc) : '',
        };
    }).filter(Boolean);

    return {
        scene: {
            place: here.name,
            kicker: `Day ${state.clock.day} · ${SLOT_LABEL[timeSlot(state)]}`,
            when: `${state.clock.time} · ${state.clock.weather}`,
            icon: weatherIcon(state),
            atmosphere: atmosphereLine(state),
            now: state.scene.now,
            threads: [...state.events, ...state.quests].filter(t => isOpen(t) && (t.known || all)).slice(-3).map(t => t.name),
        },
        people,
        left,
        items: { mine, here: [...loose, ...held] },
        around,
        tick: state.meta.tick,
    };
}
