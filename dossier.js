// What {{user}} has learned about each person, plus the user's own notes. Pure, node-testable.

export const KINDS = ['like', 'dislike', 'interest', 'history', 'trait', 'bond', 'promise', 'other'];
export const CAPS = { main: 14, bg: 6 };
export const HEARD_CAP = 4; // what one person remembers being told
export const NOTES_KEY = 'immersive_worlds_notes_v1';
const PER_PATCH = 3;
const MAX_NOTES = 20;
const WEAK = new Set(['other', 'trait']); // dropped first when a dossier is full

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const sameText = t => String(t).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Anything -> clean [{k,t,at}], empties dropped. */
export function normLearned(list) {
    return (Array.isArray(list) ? list : []).map(x => (typeof x === 'string' ? { t: x } : x))
        .filter(x => x && typeof x === 'object' && clip(x.t, 120))
        .map(x => ({ k: KINDS.includes(x.k) ? x.k : 'other', t: clip(x.t, 120), at: clip(x.at, 20) }));
}

/** Add up to three new facts to a person. Returns the facts actually added (duplicates and overflow skipped). */
export function addLearned(npc, items, at) {
    npc.learned = normLearned(npc.learned);
    const have = new Set(npc.learned.map(f => sameText(f.t)));
    const added = [];
    for (const f of normLearned(items)) {
        if (added.length >= PER_PATCH) break;
        const key = sameText(f.t);
        if (!key || have.has(key)) continue;
        have.add(key);
        added.push({ ...f, at: clip(at, 20) });
    }
    npc.learned.push(...added);
    const cap = npc.main ? CAPS.main : CAPS.bg;
    while (npc.learned.length > cap) {
        const weak = npc.learned.findIndex(f => WEAK.has(f.k));
        npc.learned.splice(weak >= 0 ? weak : 0, 1);
    }
    return added.filter(f => npc.learned.includes(f));
}

/** Stable fingerprint of a fact, so a deletion survives the director saying it again. */
export const factKey = (npc, fact) => `${npc.id}|${sameText(fact.t)}`;

// ---- user-side store (separate chat-metadata key: swipes and deletes never rewind it) ----

export function normNotes(raw) {
    const notes = {};
    for (const [id, list] of Object.entries(raw?.notes && typeof raw.notes === 'object' ? raw.notes : {})) {
        const clean = (Array.isArray(list) ? list : []).filter(n => n && clip(n.t, 160)).map(n => ({ id: clip(n.id, 40) || Math.random().toString(36).slice(2, 9), t: clip(n.t, 160), at: clip(n.at, 20) })).slice(-MAX_NOTES);
        if (clean.length) notes[id] = clean;
    }
    return { notes, hidden: (Array.isArray(raw?.hidden) ? raw.hidden : []).map(h => clip(h, 200)).filter(Boolean).slice(-200) };
}

export function addNote(store, npcId, text, at) {
    const t = clip(text, 160);
    if (!t) return null;
    const note = { id: Math.random().toString(36).slice(2, 9), t, at: clip(at, 20) };
    store.notes[npcId] = [...(store.notes[npcId] ?? []), note].slice(-MAX_NOTES);
    return note;
}

export function removeNote(store, npcId, noteId) {
    store.notes[npcId] = (store.notes[npcId] ?? []).filter(n => n.id !== noteId);
    if (!store.notes[npcId].length) delete store.notes[npcId];
}

export function hideFact(store, key) {
    if (!store.hidden.includes(key)) store.hidden.push(key);
}

/** Director facts minus the ones the user deleted, then the user's notes. `own` marks notes. */
export function mergedFacts(npc, store) {
    const hidden = new Set(store?.hidden ?? []);
    const facts = normLearned(npc.learned).map(f => ({ ...f, key: factKey(npc, f), own: false })).filter(f => !hidden.has(f.key));
    const notes = (store?.notes?.[npc.id] ?? []).map(n => ({ k: 'note', t: n.t, at: n.at, key: `note|${n.id}`, own: true }));
    return [...facts, ...notes];
}
