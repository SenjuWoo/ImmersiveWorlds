// Immersive Worlds: Living Cities — SillyTavern host. Pure logic lives in engine.js.
import { extension_prompt_types, extension_prompt_roles } from '../../../../script.js';
import { createWorldInfoEntry } from '../../../world-info.js';
import { user_avatar } from '../../../personas.js';
import {
    STATE_KEY, TURN_KEY, DIRECTOR_SYSTEM, normalizeState, baseWorld, currentLocation, presentNpcs, sceneBrief, buildInjection,
    directorPrompt, bootstrapPrompt, applyPatch, travel, transcriptOf, cleanText, slug, uniqueId, nowIso, isOpen, timeSlot,
    atmosphereLine, weatherIcon, weatherClass,
} from './engine.js';
import { movementHint } from './rules.js';
import { backgroundGenerate, parseJson, errorText, isRejection } from './llm.js';
import { escapeHtml, openPanel, paintPanel, isPanelOpen, statusSlot, addWandItem, empty } from './kit.js';
import { perceive, markPerceived, peek, withArticle, labelOf, REVEAL } from './senses.js';
import { mountHud, renderHud, sideVisible, KIND_ICON } from './hud.js';
import { NOTES_KEY, normNotes, mergedFacts, addNote, removeNote, hideFact } from './dossier.js';

export const VERSION = '2.2.0';
const MODULE_ID = 'immersive_worlds';
const PROMPT_ID = 'IMMERSIVE_WORLDS_STATE';
const PANEL_ID = 'iw-panel';
const TITLE = 'Immersive Worlds';
const FOLDER = decodeURIComponent(new URL('.', import.meta.url).pathname.split('/').filter(Boolean).pop());
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const DEFAULTS = Object.freeze({
    enabled: true,
    autoDirector: true,
    directorEvery: 1,
    profileId: '',
    noReasoning: true,
    directorTokens: 1200,
    bootstrapTokens: 3000,
    temperature: 0.4,
    injectDepth: 1,
    strictUserAgency: true,
    simulationDetail: 'high',
    allowNewCharacters: true,
    allowNewItems: true,
    allowNewLocations: true,
    allowOffscreenEvents: true,
    maxNpcs: 48,
    maxItems: 80,
    maxLocations: 36,
    showStatus: true,
    ambientEffects: true,
    hud: true,
    hudReveal: 'senses',
    suspendDirectorOnApiError: true,
    debug: false,
});
// v1 keys -> v2 keys; v1 keys without a successor are dropped.
const RENAMED = { disableReasoning: 'noReasoning', jsonTemperature: 'temperature' };

const TABS = [
    { id: 'world', icon: 'fa-map', label: 'World' },
    { id: 'people', icon: 'fa-people-group', label: 'People' },
    { id: 'items', icon: 'fa-box-open', label: 'Items' },
    { id: 'history', icon: 'fa-timeline', label: 'History' },
    { id: 'manage', icon: 'fa-sliders', label: 'Manage' },
];

let activeTab = 'world';
let busy = false;
let busyLabel = '';
let queued = null;
let epoch = 0;

const ctx = () => SillyTavern.getContext();
const log = (...args) => settings().debug && console.debug(`[${TITLE}]`, ...args);

function settings() {
    const all = ctx().extensionSettings;
    const s = all[MODULE_ID] ??= {};
    for (const [from, to] of Object.entries(RENAMED)) if (from in s) { s[to] ??= s[from]; delete s[from]; }
    for (const [k, v] of Object.entries(DEFAULTS)) if (s[k] === undefined) s[k] = v;
    for (const k of Object.keys(s)) if (!(k in DEFAULTS)) delete s[k];
    return s;
}

function policy() {
    const s = settings();
    return {
        allowNewCharacters: s.allowNewCharacters, allowNewItems: s.allowNewItems, allowNewLocations: s.allowNewLocations,
        offscreen: s.allowOffscreenEvents, detail: s.simulationDetail, maxNpcs: s.maxNpcs, maxItems: s.maxItems, maxLocations: s.maxLocations,
    };
}

// ---------------------------------------------------------------------------
// State: one world per chat, in chat metadata. Normalized once on chat load.
// ---------------------------------------------------------------------------

const getState = () => ctx().chatMetadata?.[STATE_KEY] || null;

// What the user wrote or removed in dossiers: its own key, so swipes and deletes never rewind it.
const getNotes = () => { const md = ctx().chatMetadata; return md ? (md[NOTES_KEY] ??= normNotes(null)) : normNotes(null); };
const saveNotes = () => { ctx().saveMetadataDebounced(); refresh(); };

function setState(state, { quiet = false } = {}) {
    markPerceived(state);
    ctx().chatMetadata[STATE_KEY] = state;
    state.meta.updatedAt = nowIso();
    ctx().saveMetadataDebounced();
    refresh({ quiet });
}

function cardInfo() {
    const c = ctx();
    const ch = c.groupId ? null : c.characters?.[c.characterId];
    return ch ? { name: ch.name, scenario: ch.scenario, description: ch.description, personality: ch.personality, avatar: ch.avatar } : {};
}

function hasChat() {
    const c = ctx();
    return Boolean(c.chatId || c.groupId || c.characterId !== undefined);
}

function startWorld() {
    if (!hasChat()) {
        toastr.warning('Open a chat first.', TITLE);
        return null;
    }
    if (getState()) return getState();
    const state = baseWorld(cardInfo());
    state.meta.lastIndex = (ctx().chat?.length ?? 0) - 1;
    log('world started', state.worldName);
    setState(state);
    return state;
}

/** The character cards in this chat: the active card, or every group member. */
function chatCards() {
    const c = ctx();
    if (!c.groupId) return c.characters?.[c.characterId] ? [c.characters[c.characterId]] : [];
    const group = c.groups?.find(g => String(g.id) === String(c.groupId));
    return (group?.members || []).map(a => c.characters?.find(ch => ch.avatar === a)).filter(Boolean);
}

/** Character sheets for the director: main characters (cards) and the persona. Background people get none, to save tokens. */
function sheetsFor(state) {
    const c = ctx();
    const out = {};
    for (const n of presentNpcs(state).filter(x => x.main)) {
        const card = c.characters?.find(ch => ch.avatar && ch.avatar === n.materializedAvatar) ?? (n.role === 'Primary character' ? c.characters?.[c.characterId] : null);
        const text = card ? `${card.description || ''} ${card.personality || ''}` : `${n.appearance} ${n.personality}`;
        if (text.trim()) out[n.id] = cleanText(text, 240);
    }
    try { const persona = c.getCharacterCardFields?.()?.persona; if (persona) out.you = cleanText(persona, 240); } catch { /* no persona */ }
    return out;
}

function lore() {
    const c = ctx();
    const f = (() => { try { return c.getCharacterCardFields?.() ?? {}; } catch { return {}; } })();
    const lines = [];
    if (c.groupId) {
        const group = c.groups?.find(g => String(g.id) === String(c.groupId));
        const members = (group?.members || []).map(a => c.characters?.find(ch => ch.avatar === a)).filter(Boolean);
        lines.push(`Ensemble: ${members.map(m => `${m.name}: ${cleanText(m.description || m.personality, 300)}`).join('\n')}`);
    } else {
        const ch = c.characters?.[c.characterId];
        if (ch?.name) lines.push(`Character: ${ch.name}`);
    }
    if (f.description) lines.push(`Description: ${cleanText(f.description, 1200)}`);
    if (f.personality) lines.push(`Personality: ${cleanText(f.personality, 600)}`);
    if (f.scenario) lines.push(`Scenario: ${cleanText(f.scenario, 900)}`);
    if (f.persona) lines.push(`{{user}}: ${cleanText(f.persona, 400)}`);
    const book = c.characters?.[c.characterId]?.data?.character_book?.entries || [];
    const entries = book.filter(e => e?.enabled !== false).slice(0, 10).map(e => cleanText(e.content, 220)).filter(Boolean);
    if (entries.length) lines.push(`Lore:\n- ${entries.join('\n- ')}`);
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Prompt injection: only when this chat has a world.
// ---------------------------------------------------------------------------

function inject() {
    const s = settings();
    const state = getState();
    const text = s.enabled && state ? buildInjection(state, { strictAgency: s.strictUserAgency }) : '';
    ctx().setExtensionPrompt(PROMPT_ID, text, extension_prompt_types.IN_CHAT, Number(s.injectDepth) || 0, false, extension_prompt_roles.SYSTEM);
}

globalThis.immersiveWorldsGenerationInterceptor = async function () {
    try { inject(); } catch (error) { console.error(`[${TITLE}] interceptor`, error); }
};

// ---------------------------------------------------------------------------
// Director: one background call after a reply, swipe- and delete-safe.
// The pre-turn state lives in chat metadata; the patch rides on the message.
// ---------------------------------------------------------------------------

function syncSwipe(msg) {
    const k = msg.swipe_id;
    if (typeof k !== 'number') return;
    if (Array.isArray(msg.swipes) && typeof msg.swipes[k] === 'string') msg.swipes[k] = msg.mes;
    if (Array.isArray(msg.swipe_info) && msg.swipe_info[k]) msg.swipe_info[k].extra = structuredClone(msg.extra ?? {});
}

function dropCachedPatch(index) {
    const msg = ctx().chat?.[index];
    if (!msg) return;
    if (msg.extra) delete msg.extra.iw_patch;
    for (const info of msg.swipe_info || []) if (info?.extra) delete info.extra.iw_patch;
}

function rewindTurn(index) {
    const md = ctx().chatMetadata;
    const turn = md?.[TURN_KEY];
    if (!turn || turn.index !== index) return false;
    md[STATE_KEY] = normalizeState(structuredClone(turn.state));
    return true;
}

function setBusy(on, label = 'Director at work…') {
    busy = on;
    busyLabel = on ? label : '';
    refresh();
}

function queueDirector(index) {
    if (busy) { queued = index; return; }
    runDirector(index).catch(error => console.error(`[${TITLE}] director`, error));
}

async function runDirector(index, { manual = false } = {}) {
    const s = settings();
    const c = ctx();
    if (!getState() || busy) return;
    const md = c.chatMetadata;
    const chatId = c.getCurrentChatId();
    const myEpoch = epoch;

    const prev = md[TURN_KEY];
    if (prev?.index === index) rewindTurn(index);
    else {
        if (prev) dropCachedPatch(prev.index);
        md[TURN_KEY] = { index, state: structuredClone(getState()) };
    }
    const state = getState();
    const transcript = transcriptOf(c.chat, manual ? index - 3 : state.meta.lastIndex + 1, index);

    setBusy(true);
    try {
        const prompt = c.substituteParams(directorPrompt(state, transcript, policy(), sheetsFor(state)));
        log('director prompt', prompt.length, 'chars');
        const raw = await backgroundGenerate({ system: DIRECTOR_SYSTEM, prompt, maxTokens: clamp(s.directorTokens, 400, 8192), profileId: s.profileId, temperature: s.temperature, noReasoning: s.noReasoning });
        const patch = parseJson(raw);
        if (myEpoch !== epoch || ctx().getCurrentChatId() !== chatId || !getState()) return log('director result dropped: chat moved on');
        const next = applyPatch(getState(), patch, policy());
        next.meta.lastIndex = index;
        next.meta.pending = 0;
        const msg = ctx().chat?.[index];
        if (msg && !msg.is_user) {
            msg.extra ??= {};
            msg.extra.iw_patch = patch;
            syncSwipe(msg);
            ctx().saveChat?.();
        }
        log('director patch', patch);
        if (next.meta.rejected.length) log('rejected by world rules', next.meta.rejected);
        setState(next);
        inject();
    } catch (error) {
        console.error(`[${TITLE}] director pass failed`, error);
        if (isRejection(error) && s.suspendDirectorOnApiError && !manual) {
            s.autoDirector = false;
            ctx().saveSettingsDebounced();
            syncSettingsUi();
            toastr.error('The API rejected the background world update, so automatic updates are paused. Pick a connection profile in the settings, then turn them back on.', TITLE);
        } else {
            toastr.warning(`World update skipped: ${errorText(error).slice(0, 180)}`, TITLE);
        }
    } finally {
        setBusy(false);
        const next = queued;
        queued = null;
        if (next !== null && next !== index) queueDirector(next);
    }
}

function onMessageReceived(index, type) {
    const s = settings();
    const state = getState();
    if (!s.enabled || !state || ['first_message', 'impersonate', 'quiet'].includes(type)) return;
    const msg = ctx().chat?.[index];
    if (!msg || msg.is_user || msg.is_system) return;
    // A Go/Peek note is for one reply; a director pass clears it too, but it may not run this turn.
    const spendNote = () => { if (state.scene.note) { state.scene.note = ''; inject(); } };
    if (!s.autoDirector) { spendNote(); return ctx().saveMetadataDebounced(); }
    if (ctx().chatMetadata[TURN_KEY]?.index === index) return queueDirector(index);
    state.meta.pending += 1;
    // Comings and goings update the world now, whatever "run every" says, so nobody lingers or vanishes.
    const prior = ctx().chat.slice(0, index).findLast(m => m.is_user && !m.is_system)?.mes || '';
    const moving = state.scene.moved || state.scene.peeked.length > 0 || movementHint(state, `${prior}\n${msg.mes}`);
    if (moving || state.meta.pending >= Math.max(1, Number(s.directorEvery) || 1)) { if (moving) log('movement: updating the world now'); queueDirector(index); }
    else { spendNote(); ctx().saveMetadataDebounced(); }
}

function onMessageSwiped(index) {
    if (!getState() || !rewindTurn(index)) return;
    epoch += 1;
    const patch = ctx().chat?.[index]?.extra?.iw_patch;
    if (patch) {
        try {
            const next = applyPatch(getState(), patch, policy());
            next.meta.lastIndex = index;
            next.meta.pending = 0;
            ctx().chatMetadata[STATE_KEY] = next;
        } catch (error) { console.warn(`[${TITLE}] cached patch rejected`, error); }
    }
    log('swipe', index, patch ? 'cached patch re-applied' : 'rewound, awaiting new reply');
    setState(getState());
    inject();
}

function onMessageDeleted(length) {
    const md = ctx().chatMetadata;
    const turn = md?.[TURN_KEY];
    if (!getState() || !turn || turn.index < length) return;
    rewindTurn(turn.index);
    delete md[TURN_KEY];
    epoch += 1;
    log('message deleted: world rewound to before #' + turn.index);
    setState(getState());
    inject();
}

async function buildWorld() {
    if (!hasChat()) return toastr.warning('Open a chat first.', TITLE);
    if (busy) return;
    const s = settings();
    const c = ctx();
    const chatId = c.getCurrentChatId();
    setBusy(true, 'Building the world…');
    try {
        const chat = c.chat || [];
        const prompt = c.substituteParams(bootstrapPrompt(lore(), transcriptOf(chat, chat.length - 6, chat.length - 1, { maxChars: 700 })));
        const raw = await backgroundGenerate({ system: DIRECTOR_SYSTEM, prompt, maxTokens: clamp(s.bootstrapTokens, 1500, 8192), profileId: s.profileId, temperature: Math.max(0.6, Number(s.temperature) || 0), noReasoning: s.noReasoning });
        const generated = parseJson(raw);
        if (ctx().getCurrentChatId() !== chatId) return;
        const state = normalizeState({ ...baseWorld(cardInfo()), ...generated, chronicle: [{ at: nowIso(), text: 'The living world took shape.' }], meta: { bootstrapped: true, lastIndex: chat.length - 1 } });
        const cards = chatCards();
        for (const n of state.npcs) {
            const card = cards.find(ch => ch.name?.toLowerCase() === n.name.toLowerCase());
            if (card) Object.assign(n, { known: true, nameKnown: true, main: true, materializedAvatar: n.materializedAvatar || card.avatar || '' });
        }
        delete ctx().chatMetadata[TURN_KEY];
        setState(state);
        inject();
        await ctx().saveMetadata();
        toastr.success(`${state.worldName} is live.`, TITLE);
    } catch (error) {
        console.error(`[${TITLE}] world build failed`, error);
        toastr.error(`Could not build the world: ${errorText(error).slice(0, 180)}`, TITLE);
    } finally {
        setBusy(false);
    }
}

// ---------------------------------------------------------------------------
// Public API for Immersive Adventures and scripts.
// ---------------------------------------------------------------------------

function travelTo(q) {
    const state = getState();
    if (!state) return '';
    const line = travel(state, q);
    if (line) { setState(state); inject(); }
    else log('travel refused: no route to', q);
    return line;
}

/** Put the move into the user's own message too, so the story (and the director) see it happen. */
function prefillAction(line) {
    const box = document.getElementById('send_textarea');
    if (!box) return;
    box.value = box.value.trim() ? `${box.value.trim()} ${line}` : line;
    box.dispatchEvent(new Event('input', { bubbles: true }));
    box.focus();
}

function goTo(id) {
    const name = getState()?.locations.find(l => l.id === id)?.name || id;
    if (travelTo(id)) prefillAction(`*I make my way to ${name}.*`);
    else toastr.warning(`No path from here to ${name}.`, TITLE);
}

function peekInto(id) {
    const state = getState();
    if (!state || !peek(state, id)) return;
    setState(state);
    inject();
    prefillAction(`*I peek into ${state.locations.find(l => l.id === id)?.name || 'the next room'}.*`);
}

globalThis.immersiveWorlds = Object.freeze({
    version: VERSION,
    isActive: () => Boolean(settings().enabled && getState()),
    getState,
    brief: () => (getState() ? sceneBrief(getState()) : ''),
    travel: travelTo,
});

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || lo)));
const sectionLabel = (text, extra = '') => `<div class="imx-label"><span>${escapeHtml(text)}</span>${extra}</div>`;
const count = n => `<span>${n}</span>`;

function refresh({ quiet = false } = {}) {
    paintHud(quiet);
    paintStatus();
    applyAmbient();
    if (isPanelOpen(PANEL_ID)) renderPanel();
}

function paintHud(quiet = false) {
    const s = settings();
    const state = getState();
    const mode = REVEAL.includes(s.hudReveal) ? s.hudReveal : 'senses';
    renderHud(s.enabled && s.hud && state ? perceive(state, mode, { userName: ctx().name1, notes: getNotes() }) : null, { quiet });
}

function avatarUrl(person) {
    const c = ctx();
    if (person.isYou) return user_avatar ? c.getThumbnailUrl('persona', user_avatar) : '';
    return person.avatar ? c.getThumbnailUrl('avatar', person.avatar) : '';
}

function paintStatus() {
    const slot = statusSlot('iw');
    if (!slot) return;
    const s = settings();
    const state = getState();
    const busyChip = busy ? `<span class="imx-chip" title="${escapeHtml(busyLabel)}"><i class="fa-solid fa-feather-pointed fa-fade"></i></span>` : '';
    if (!s.enabled || !s.showStatus || !state) { slot.innerHTML = ''; return; }
    if (sideVisible('left')) { slot.innerHTML = busyChip; return; } // the HUD already shows time and place
    const loc = currentLocation(state);
    slot.innerHTML = `
        <button type="button" class="imx-chip" data-iw-open="world" title="${escapeHtml(state.clock.weather)} · ${escapeHtml(atmosphereLine(state))}"><i class="fa-solid ${weatherIcon(state)}"></i><span>Day ${state.clock.day} · ${escapeHtml(state.clock.time)}</span></button>
        <button type="button" class="imx-chip" data-iw-open="world" title="${escapeHtml(cleanText(loc.description, 200))}"><i class="fa-solid fa-location-dot"></i><span>${escapeHtml(loc.name)}</span></button>
        ${busyChip}`;
}

function applyAmbient() {
    const s = settings();
    const state = getState();
    const on = Boolean(s.enabled && s.ambientEffects && state);
    document.body.classList.toggle('iw-ambient', on);
    if (on) {
        document.body.dataset.iwTime = timeSlot(state);
        document.body.dataset.iwWeather = weatherClass(state);
    }
}

function openWorldPanel(tab = activeTab) {
    activeTab = tab;
    openPanel({ id: PANEL_ID, icon: 'fa-compass', title: TITLE, tabs: TABS, onTab: t => { activeTab = t; renderPanel(); } });
    renderPanel();
}

function renderPanel() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const state = getState();
    const html = !state ? noWorld() : {
        world: worldTab, people: peopleTab, items: itemsTab, history: historyTab, manage: manageTab,
    }[activeTab]?.(state) ?? worldTab(state);
    paintPanel(panel, {
        tab: activeTab,
        busy,
        subtitle: busy ? busyLabel : state ? `${state.worldName} · day ${state.clock.day}, ${state.clock.time}` : 'No world in this chat',
        html,
    });
}

function noWorld() {
    return `<div class="imx-section imx-hero">
        <h3>No living world here yet</h3>
        <p class="imx-text">Build one from the character and recent chat (one background call), or start blank and let it grow as you play.</p>
        <div class="imx-actions">
            <div class="menu_button menu_button_icon" data-iw="build"><i class="fa-solid fa-city"></i><span>Build world</span></div>
            <div class="menu_button menu_button_icon" data-iw="start"><i class="fa-solid fa-seedling"></i><span>Start blank</span></div>
        </div>
    </div>`;
}

function threadCards(list) {
    return list.map(t => `<div class="imx-card"><div class="imx-card-head"><b>${escapeHtml(t.name)}</b><span class="imx-tag">${escapeHtml(t.status)}</span></div>${t.description ? `<p class="imx-text">${escapeHtml(t.description)}</p>` : ''}</div>`).join('');
}

function worldTab(state) {
    const loc = currentLocation(state);
    const exits = Object.entries(loc.routes).map(([id, r]) => ({ ...state.locations.find(l => l.id === id), minutes: r.minutes })).filter(l => l.id);
    const here = presentNpcs(state);
    const quests = state.quests.filter(isOpen);
    const events = state.events.filter(isOpen);
    return `
        ${state.meta.bootstrapped ? '' : `<div class="imx-card imx-callout"><span>This world is still a sketch.</span><div class="menu_button menu_button_icon" data-iw="build"><i class="fa-solid fa-city"></i><span>Build it out</span></div></div>`}
        <section class="imx-section imx-hero">
            <span class="imx-tag"><i class="fa-solid ${weatherIcon(state)}"></i> Day ${state.clock.day} · ${escapeHtml(state.clock.time)} · ${escapeHtml(state.clock.weather)}</span>
            <h3>${escapeHtml(loc.name)}</h3>
            <p class="imx-prose">${escapeHtml(atmosphereLine(state))}</p>
            ${loc.description ? `<p class="imx-text">${escapeHtml(loc.description)}</p>` : ''}
            ${here.length ? `<div class="imx-row">${here.map(n => `<button type="button" class="imx-pill" data-iw="inspect" data-id="${escapeHtml(n.id)}"><i class="fa-solid fa-user"></i>${escapeHtml(n.name)}</button>`).join('')}</div>` : ''}
        </section>
        <section class="imx-section">
            ${sectionLabel('Go to')}
            <div class="imx-row">${exits.length ? exits.map(l => `<button type="button" class="imx-pill" data-iw="travel" data-id="${escapeHtml(l.id)}"><i class="fa-solid fa-route"></i>${escapeHtml(l.name)} · ${l.minutes}m</button>`).join('') : '<span class="imx-meta">No mapped exits yet. Mention a place and the director will chart it.</span>'}</div>
        </section>
        <section class="imx-section">${sectionLabel('Quests', count(quests.length))}${threadCards(quests) || empty('No threads yet. They appear as the story implies them.')}</section>
        ${events.length ? `<section class="imx-section">${sectionLabel('Stirring', count(events.length))}${threadCards(events)}</section>` : ''}
        <section class="imx-section">
            ${sectionLabel('Known places', count(state.locations.length))}
            <div class="imx-grid">${state.locations.map(l => `<button type="button" class="imx-card ${l.id === loc.id ? 'is-here' : ''}" data-iw="travel" data-id="${escapeHtml(l.id)}"><span class="imx-tag">${escapeHtml(l.type)}</span><b>${escapeHtml(l.name)}</b><span class="imx-meta imx-clamp">${escapeHtml(l.description)}</span></button>`).join('')}</div>
        </section>`;
}

function npcCard(state, n) {
    const where = state.locations.find(l => l.id === n.locationId)?.name || 'somewhere';
    return `<div class="imx-card">
        <div class="imx-card-head"><b>${escapeHtml(n.name)}</b><span class="imx-tag">${escapeHtml(n.status)}</span></div>
        <span class="imx-meta">${escapeHtml(n.role)} · ${escapeHtml(where)}</span>
        <p class="imx-text imx-clamp">${escapeHtml(n.personality || n.appearance || 'Not yet known.')}</p>
        <div class="imx-actions">
            <div class="menu_button menu_button_icon" data-iw="inspect" data-id="${escapeHtml(n.id)}"><i class="fa-solid fa-eye"></i><span>Inspect</span></div>
            <div class="menu_button menu_button_icon" data-iw="dossier" data-id="${escapeHtml(n.id)}" title="What you have learned about ${escapeHtml(n.name)}"><i class="fa-solid fa-book-open"></i><span>Dossier</span></div>
            <div class="menu_button menu_button_icon ${n.materializedAvatar ? 'disabled' : ''}" data-iw="${n.materializedAvatar ? '' : 'materialize'}" data-id="${escapeHtml(n.id)}" title="Create a reusable character card with a world lorebook"><i class="fa-solid fa-id-card"></i><span>${n.materializedAvatar ? 'Has card' : 'Make card'}</span></div>
        </div>
    </div>`;
}

function peopleTab(state) {
    const here = presentNpcs(state);
    const elsewhere = state.npcs.filter(n => !here.includes(n));
    return `
        <section class="imx-section">
            ${sectionLabel('Here now', `<span class="imx-actions"><div class="menu_button menu_button_icon" data-iw="forge" title="Invent people who fit this world"><i class="fa-solid fa-wand-sparkles"></i><span>Forge</span></div><div class="menu_button menu_button_icon" data-iw="add-npc"><i class="fa-solid fa-user-plus"></i><span>Add</span></div></span>`)}
            ${here.map(n => npcCard(state, n)).join('') || empty('Nobody else is recorded here.')}
        </section>
        <section class="imx-section">${sectionLabel('Elsewhere', count(elsewhere.length))}${elsewhere.map(n => npcCard(state, n)).join('') || empty('The wider cast emerges as the world grows.')}</section>`;
}

function itemsTab(state) {
    const mine = new Set(state.player.inventoryIds);
    const cards = state.items.map(item => {
        const owner = state.npcs.find(n => n.id === item.ownerId);
        const where = owner ? `held by ${owner.name}` : mine.has(item.id) ? 'yours' : state.locations.find(l => l.id === item.locationId)?.name || 'unknown';
        return `<div class="imx-card"><div class="imx-card-head"><b>${escapeHtml(item.name)}${item.quantity > 1 ? ` ×${item.quantity}` : ''}</b><span class="imx-tag">${escapeHtml(item.rarity)}</span></div><span class="imx-meta">${escapeHtml(item.type)} · ${escapeHtml(where)}</span>${item.description ? `<p class="imx-text">${escapeHtml(item.description)}</p>` : ''}</div>`;
    }).join('');
    return `<section class="imx-section">${sectionLabel('Objects', `<div class="menu_button menu_button_icon" data-iw="add-item"><i class="fa-solid fa-plus"></i><span>Add</span></div>`)}${cards || empty('Objects the story creates appear here.')}</section>`;
}

function historyTab(state) {
    const done = [...state.quests, ...state.events].filter(t => !isOpen(t));
    const timeline = [...state.chronicle].reverse().map(e => `<div><span class="imx-meta">${escapeHtml(new Date(e.at).toLocaleString())}</span><p class="imx-text">${escapeHtml(e.text)}</p></div>`).join('');
    return `
        <section class="imx-section">${sectionLabel('Chronicle', count(state.chronicle.length))}<div class="imx-timeline">${timeline || empty('Nothing recorded yet.')}</div></section>
        ${state.factions.length ? `<section class="imx-section">${sectionLabel('Factions', count(state.factions.length))}${state.factions.map(f => `<div class="imx-card"><b>${escapeHtml(f.name)}</b>${f.description ? `<p class="imx-text">${escapeHtml(f.description)}</p>` : ''}${f.members.length ? `<span class="imx-meta">${escapeHtml(f.members.join(', '))}</span>` : ''}</div>`).join('')}</section>` : ''}
        ${done.length ? `<section class="imx-section">${sectionLabel('Closed threads', count(done.length))}${threadCards(done)}</section>` : ''}`;
}

function manageTab(state) {
    const s = settings();
    return `
        <section class="imx-section">
            ${sectionLabel('This chat')}
            <div class="imx-actions">
                <div class="menu_button menu_button_icon" data-iw="pass" title="Update the world from the latest exchange now"><i class="fa-solid fa-wand-magic-sparkles"></i><span>Update now</span></div>
                <div class="menu_button menu_button_icon" data-iw="identity"><i class="fa-solid fa-pen"></i><span>Edit identity</span></div>
                <div class="menu_button menu_button_icon" data-iw="build"><i class="fa-solid fa-city"></i><span>Rebuild</span></div>
                <div class="menu_button menu_button_icon" data-iw="export"><i class="fa-solid fa-file-export"></i><span>Export</span></div>
                <div class="menu_button menu_button_icon" data-iw="import"><i class="fa-solid fa-file-import"></i><span>Import</span></div>
                <div class="menu_button menu_button_icon redWarningBG" data-iw="remove"><i class="fa-solid fa-trash"></i><span>Remove world</span></div>
            </div>
            <input id="iw-import-file" type="file" accept="application/json,.json" hidden>
        </section>
        <section class="imx-section">
            ${sectionLabel('Quick toggles')}
            <label class="checkbox_label"><input type="checkbox" data-iw-setting="autoDirector" ${s.autoDirector ? 'checked' : ''}><span>Update after each reply</span></label>
            <label class="checkbox_label"><input type="checkbox" data-iw-setting="hud" ${s.hud ? 'checked' : ''}><span>Show the HUD beside the chat</span></label>
            <label class="checkbox_label"><input type="checkbox" data-iw-setting="ambientEffects" ${s.ambientEffects ? 'checked' : ''}><span>Time-of-day tint</span></label>
            <span class="imx-meta">All settings: Extensions → Immersive Worlds. Turn ${state.meta.tick} · v${VERSION}</span>
        </section>`;
}

async function promptFields(title, fields, okButton = 'Save') {
    const c = ctx();
    const form = document.createElement('div');
    form.className = 'imx-dialog';
    form.innerHTML = `<h3>${escapeHtml(title)}</h3>${fields.map(f => `<label class="imx-field"><span>${escapeHtml(f.label)}</span>${f.type === 'textarea'
        ? `<textarea class="text_pole" rows="4" data-field="${escapeHtml(f.key)}">${escapeHtml(f.value || '')}</textarea>`
        : `<input class="text_pole" data-field="${escapeHtml(f.key)}" value="${escapeHtml(f.value || '')}">`}</label>`).join('')}`;
    const ok = await c.callGenericPopup(form, c.POPUP_TYPE.CONFIRM, '', { okButton, cancelButton: 'Cancel', wide: true, allowVerticalScrolling: true });
    if (!ok) return null;
    return Object.fromEntries(fields.map(f => [f.key, String(form.querySelector(`[data-field="${f.key}"]`)?.value ?? '').trim()]));
}

async function inspectNpc(id) {
    const state = getState();
    const n = state?.npcs.find(x => x.id === id);
    if (!n) return;
    const where = state.locations.find(l => l.id === n.locationId)?.name || 'unknown';
    const routine = n.routine ? Object.entries(n.routine).map(([slot, lid]) => `${slot}: ${state.locations.find(l => l.id === lid)?.name || lid}`).join(' · ') : '';
    const rows = [['Appearance', n.appearance], ['Personality', n.personality], ['Relationship', n.relationship], ['Goals', n.goals.join(' · ')], ['Routine', routine], ['Carries', n.inventory.join(', ')]];
    const html = `<div class="imx-dialog"><h3>${escapeHtml(n.name)}</h3><div class="imx-row"><span class="imx-pill">${escapeHtml(n.role)}</span><span class="imx-pill">${escapeHtml(n.status)}</span><span class="imx-pill"><i class="fa-solid fa-location-dot"></i>${escapeHtml(where)}</span></div>${rows.filter(([, v]) => v).map(([k, v]) => `<div><div class="imx-label">${k}</div><p class="imx-text">${escapeHtml(v)}</p></div>`).join('')}</div>`;
    await ctx().callGenericPopup(html, ctx().POPUP_TYPE.TEXT, '', { wide: true, allowVerticalScrolling: true });
}

function dossierHtml(state, id) {
    const n = state.npcs.find(x => x.id === id);
    const mode = REVEAL.includes(settings().hudReveal) ? settings().hudReveal : 'senses';
    const facts = mergedFacts(n, getNotes());
    const where = state.locations.find(l => l.id === n.locationId)?.name || 'somewhere';
    return `<h3>${escapeHtml(labelOf(n, mode))}</h3>
        <div class="imx-row"><span class="imx-pill">${escapeHtml(n.role)}</span><span class="imx-pill"><i class="fa-solid fa-location-dot"></i>${escapeHtml(where)}</span></div>
        <div class="imx-label"><span>What you know</span></div>
        ${facts.length ? facts.map(f => `<div class="imx-fact"><i class="fa-solid ${KIND_ICON[f.k] ?? KIND_ICON.other}" title="${escapeHtml(f.k)}"></i><span>${escapeHtml(f.t)}</span><small>${escapeHtml(f.at)}</small><button type="button" class="menu_button" data-iw="fact-del" data-key="${escapeHtml(f.key)}" title="Remove"><i class="fa-solid fa-xmark"></i></button></div>`).join('') : empty('Nothing learned yet. It fills in as the story shows you who they are.')}
        <div class="imx-label"><span>Your note</span></div>
        <div class="imx-actions"><input class="text_pole" data-field="note" maxlength="160" placeholder="e.g. ask about the harbour"><div class="menu_button menu_button_icon" data-iw="note-add"><i class="fa-solid fa-plus"></i><span>Add</span></div></div>`;
}

async function openDossier(id) {
    const state = getState();
    if (!state?.npcs.some(n => n.id === id)) return;
    const box = document.createElement('div');
    box.className = 'imx-dialog';
    box.dataset.npc = id;
    box.innerHTML = dossierHtml(state, id);
    await ctx().callGenericPopup(box, ctx().POPUP_TYPE.TEXT, '', { allowVerticalScrolling: true });
}

function editDossier(action, el) {
    const box = el.closest('[data-npc]');
    const state = getState();
    if (!box || !state) return;
    const store = getNotes();
    if (action === 'fact-del') {
        const key = el.dataset.key || '';
        if (key.startsWith('note|')) removeNote(store, box.dataset.npc, key.slice(5)); else hideFact(store, key);
    } else {
        const input = box.querySelector('[data-field="note"]');
        if (!addNote(store, box.dataset.npc, input?.value, `D${state.clock.day} ${state.clock.time}`)) return;
    }
    saveNotes();
    box.innerHTML = dossierHtml(state, box.dataset.npc);
}

async function addNpc() {
    const v = await promptFields('Add a person', [{ key: 'name', label: 'Name' }, { key: 'role', label: 'Role' }, { key: 'personality', label: 'Personality', type: 'textarea' }, { key: 'appearance', label: 'Appearance', type: 'textarea' }]);
    const state = getState();
    if (!v?.name || !state) return;
    state.npcs.push({ ...v, id: uniqueId(state.npcs, v.name, 'npc'), locationId: state.currentLocationId, status: 'present', firstSeen: nowIso(), lastSeen: nowIso() });
    state.chronicle.push({ at: nowIso(), text: `${v.name} entered the story.` });
    setState(normalizeState(state));
    inject();
}

async function addItem() {
    const v = await promptFields('Add an item', [{ key: 'name', label: 'Name' }, { key: 'type', label: 'Type' }, { key: 'description', label: 'Description', type: 'textarea' }, { key: 'rarity', label: 'Rarity', value: 'ordinary' }]);
    const state = getState();
    if (!v?.name || !state) return;
    state.items.push({ ...v, id: uniqueId(state.items, v.name, 'item'), locationId: state.currentLocationId });
    setState(normalizeState(state));
    inject();
}

async function editIdentity() {
    const state = getState();
    const v = await promptFields('World identity', [{ key: 'worldName', label: 'Name', value: state.worldName }, { key: 'premise', label: 'Premise', type: 'textarea', value: state.premise }, { key: 'genre', label: 'Genre', value: state.genre }, { key: 'tone', label: 'Tone', value: state.tone }]);
    if (!v) return;
    Object.assign(state, v);
    setState(normalizeState(state));
    inject();
}

async function forgePeople() {
    const state = getState();
    if (!state || busy) return;
    const v = await promptFields('Forge people', [{ key: 'concept', label: 'Who do you want? (a concept or vibe; empty = surprise me)', type: 'textarea' }], 'Forge');
    if (v === null) return;
    const s = settings();
    const n = s.simulationDetail === 'balanced' ? 1 : 2;
    const prompt = ctx().substituteParams(`${directorPrompt(state, '', policy()).split('\nNEW EXCHANGE')[0]}
Invent ${n} new person(s) who belong in this world${v.concept ? `, matching: ${v.concept}` : ''}. Each needs a distinct role, concise vivid appearance and personality, 1-3 goals, up to 2 secrets, carried items, a relationship to {{user}}, a locationId and a routine.
Return {"npcs":[{"id","name","role","appearance","personality","goals":[],"secrets":[],"inventory":[],"relationship","locationId","status","routine":{"dawn","day","dusk","night"}}]}`);
    setBusy(true, 'Forging people…');
    try {
        const patch = parseJson(await backgroundGenerate({ system: DIRECTOR_SYSTEM, prompt, maxTokens: clamp(s.directorTokens, 400, 8192), profileId: s.profileId, temperature: Math.max(0.8, Number(s.temperature) || 0), noReasoning: s.noReasoning }));
        const people = (Array.isArray(patch?.npcs) ? patch.npcs : []).filter(p => p?.name).slice(0, 4).map(p => ({ ...p, id: uniqueId(getState().npcs, p.name, 'npc') }));
        if (!people.length) throw new Error('The model returned nobody usable.');
        const next = applyPatch(getState(), { npcs: people, chronicle: people.map(p => `${p.name} joined the cast.`) }, { ...policy(), allowNewCharacters: true });
        setState(next);
        inject();
        toastr.success(`Forged: ${people.map(p => p.name).join(', ')}`, TITLE);
    } catch (error) {
        toastr.error(`Forge failed: ${errorText(error).slice(0, 180)}`, TITLE);
    } finally {
        setBusy(false);
    }
}

function npcDescription(state, npc) {
    const loc = state.locations.find(x => x.id === npc.locationId);
    const owned = state.items.filter(i => i.ownerId === npc.id).map(i => `${i.name} (${i.type}) — ${i.description}`);
    const factions = state.factions.filter(f => f.members.some(m => m.toLowerCase() === npc.name.toLowerCase() || slug(m, '') === npc.id)).map(f => f.name);
    return [
        `${npc.name} is ${withArticle(npc.role)} in ${state.worldName}${loc ? `, usually found at ${loc.name}` : ''}.`,
        npc.appearance && `Appearance: ${npc.appearance}`,
        npc.personality && `Personality: ${npc.personality}`,
        npc.goals.length && `Goals:\n${npc.goals.map(g => `- ${g}`).join('\n')}`,
        npc.secrets.length && `Secrets (never stated outright; they leak through behavior):\n${npc.secrets.map(x => `- ${x}`).join('\n')}`,
        (npc.inventory.length || owned.length) && `Carries: ${[...npc.inventory, ...owned].join('; ')}`,
        factions.length && `Faction ties: ${factions.join(', ')}`,
        `Relationship to {{user}}: ${npc.relationship}`,
        `World: ${state.genre}; ${state.tone}.${state.rules.length ? ` Rules: ${state.rules.join('; ')}.` : ''}`,
    ].filter(Boolean).join('\n\n');
}

async function makeLorebook(state, npc) {
    const c = ctx();
    const names = c.getWorldInfoNames?.() ?? [];
    let name = `${state.worldName} — ${npc.name}`.slice(0, 80);
    for (let i = 2; names.includes(name); i++) name = `${state.worldName} — ${npc.name} (${i})`.slice(0, 80);
    const data = { entries: {} };
    const add = (keys, content, extra = {}) => Object.assign(createWorldInfoEntry(name, data), { key: keys, comment: keys[0], content, ...extra });
    add([state.worldName], `${state.worldName}: ${cleanText(state.premise, 700)} Genre: ${state.genre}. Tone: ${state.tone}.${state.rules.length ? ` Rules: ${state.rules.join('; ')}.` : ''}`, { constant: true, order: 10 });
    for (const loc of state.locations.slice(0, 12)) add([loc.name], `${loc.name} (${loc.type}): ${cleanText(loc.description, 400)}`, { order: loc.id === npc.locationId ? 20 : 80 });
    for (const other of state.npcs.filter(x => x.id !== npc.id).slice(0, 10)) add([other.name], `${other.name}: ${other.role}. ${cleanText(other.personality, 200)}`, { order: 70 });
    for (const item of state.items.filter(i => i.ownerId === npc.id)) add([item.name], `${item.name} (${item.type}, ${item.rarity}): ${cleanText(item.description, 300)}`, { order: 60 });
    await c.saveWorldInfo(name, data, true);
    await c.updateWorldInfoList?.();
    return name;
}

async function materializeNpc(id) {
    const state = getState();
    const npc = state?.npcs.find(x => x.id === id);
    if (!npc || npc.materializedAvatar) return;
    const loc = state.locations.find(x => x.id === npc.locationId);
    const fields = await promptFields(`Character card for ${npc.name}`, [
        { key: 'description', label: 'Description', type: 'textarea', value: npcDescription(state, npc) },
        { key: 'personality', label: 'Personality summary', type: 'textarea', value: [npc.personality, npc.goals.length ? `Driven by: ${npc.goals.join('; ')}.` : ''].filter(Boolean).join(' ') },
        { key: 'scenario', label: 'Scenario', type: 'textarea', value: `{{char}} is ${withArticle(npc.role)} in ${state.worldName}, currently at ${loc?.name || 'an unknown place'}. {{user}} arrives as the story dictates.` },
        { key: 'first_mes', label: 'First message', type: 'textarea', value: `*${npc.name} notices {{user}}.*` },
    ], 'Create card');
    if (!fields) return;
    try {
        let world = '';
        try { world = await makeLorebook(state, npc); } catch (error) {
            console.warn(`[${TITLE}] lorebook`, error);
            toastr.warning('The world lorebook could not be created; making the card without it.', TITLE);
        }
        const form = new FormData();
        const set = { ch_name: npc.name, ...fields, mes_example: '', creator_notes: `Generated by Immersive Worlds from ${state.worldName}.`, creator: 'Immersive Worlds', tags: `Immersive Worlds, ${state.worldName}`, talkativeness: '0.5', fav: 'false', extensions: JSON.stringify({ immersive_worlds: { sourceWorld: state.worldName, npcId: npc.id } }) };
        for (const [k, v] of Object.entries(set)) form.set(k, v);
        if (world) form.set('world', world);
        const res = await fetch('/api/characters/create', { method: 'POST', headers: ctx().getRequestHeaders({ omitContentType: true }), body: form, cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        npc.materializedAvatar = await res.text();
        npc.main = true;
        setState(state);
        await ctx().getCharacters?.();
        toastr.success(`${npc.name} is now a character card${world ? ' with its own world lorebook' : ''}.`, TITLE);
    } catch (error) {
        toastr.error(`Could not create a card for ${npc.name}: ${errorText(error)}`, TITLE);
    }
}

async function removeWorld() {
    const c = ctx();
    if (!await c.callGenericPopup('Remove the living world from this chat? Places, people, items and history are deleted. Export first to keep a copy.', c.POPUP_TYPE.CONFIRM)) return;
    delete c.chatMetadata[STATE_KEY];
    delete c.chatMetadata[TURN_KEY];
    delete c.chatMetadata[NOTES_KEY];
    epoch += 1;
    inject();
    await c.saveMetadata();
    refresh();
}

function exportWorld() {
    const state = getState();
    if (!state) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
    a.download = `${slug(state.worldName, 'living-world')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importWorld(file) {
    if (!file) return;
    try {
        if (file.size > MAX_IMPORT_BYTES) throw new Error('file is larger than 5 MB');
        const data = JSON.parse(await file.text());
        if (!data || typeof data !== 'object' || !Array.isArray(data.locations)) throw new Error('not an Immersive Worlds export');
        const state = normalizeState(data);
        delete ctx().chatMetadata[TURN_KEY];
        setState(state);
        inject();
        await ctx().saveMetadata();
        toastr.success(`${state.worldName} imported.`, TITLE);
    } catch (error) {
        toastr.error(`Import failed: ${errorText(error)}`, TITLE);
    }
}

async function onAction(action, el) {
    const id = el?.dataset?.id;
    switch (action) {
        case 'build': return buildWorld();
        case 'start': return startWorld();
        case 'travel': return goTo(id);
        case 'inspect': return inspectNpc(id);
        case 'dossier': return openDossier(id);
        case 'fact-del':
        case 'note-add': return editDossier(action, el);
        case 'materialize': return materializeNpc(id);
        case 'forge': return forgePeople();
        case 'add-npc': return addNpc();
        case 'add-item': return addItem();
        case 'identity': return editIdentity();
        case 'pass': {
            const chat = ctx().chat || [];
            const last = chat.findLastIndex(m => !m.is_user && !m.is_system);
            return last >= 0 ? runDirector(last, { manual: true }) : toastr.info('No reply to read yet.', TITLE);
        }
        case 'export': return exportWorld();
        case 'import': return document.getElementById('iw-import-file')?.click();
        case 'remove': return removeWorld();
    }
}

function syncSettingsUi() {
    const s = settings();
    for (const el of document.querySelectorAll('[data-iw-setting]')) {
        const v = s[el.dataset.iwSetting];
        if (el.type === 'checkbox') el.checked = Boolean(v);
        else el.value = String(v);
    }
}

function onSettingChange(el) {
    const s = settings();
    const key = el.dataset.iwSetting;
    s[key] = el.type === 'checkbox' ? el.checked : el.dataset.type === 'number' ? Number(el.value) : el.value;
    ctx().saveSettingsDebounced();
    syncSettingsUi();
    inject();
    refresh();
}

function bindUi() {
    document.addEventListener('click', e => {
        const open = e.target.closest('[data-iw-open]');
        if (open) return openWorldPanel(open.dataset.iwOpen || activeTab);
        const act = e.target.closest('#iw-panel [data-iw], .imx-dialog [data-iw]');
        if (act?.dataset.iw && !act.classList.contains('disabled')) onAction(act.dataset.iw, act);
    });
    document.addEventListener('change', e => {
        if (e.target.matches?.('[data-iw-setting]')) onSettingChange(e.target);
        if (e.target.id === 'iw-import-file') { importWorld(e.target.files?.[0]); e.target.value = ''; }
    });
}

async function mountSettings() {
    const html = await ctx().renderExtensionTemplateAsync(`third-party/${FOLDER}`, 'settings');
    (document.getElementById('extensions_settings2') || document.getElementById('extensions_settings'))?.insertAdjacentHTML('beforeend', html);
    document.getElementById('iw-open-panel')?.addEventListener('click', () => openWorldPanel());
    try {
        ctx().ConnectionManagerRequestService.handleDropdown('#iw-profile', settings().profileId, profile => {
            settings().profileId = profile?.id ?? '';
            ctx().saveSettingsDebounced();
        });
    } catch {
        document.getElementById('iw-profile-row')?.remove();
    }
    syncSettingsUi();
}

function registerCommands() {
    const { SlashCommandParser, SlashCommand, SlashCommandArgument, ARGUMENT_TYPE } = ctx();
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'iw',
        returns: 'the current scene brief',
        unnamedArgumentList: [SlashCommandArgument.fromProps({ description: 'open | start | build | update | travel <place> | brief', typeList: [ARGUMENT_TYPE.STRING], isRequired: false })],
        helpString: 'Immersive Worlds. <code>/iw</code> opens the panel; <code>/iw start</code>, <code>/iw build</code>, <code>/iw update</code>, <code>/iw travel Market</code>, <code>/iw brief</code> (returns the scene brief).',
        callback: async (_args, value) => {
            const [cmd, ...rest] = String(value ?? '').trim().split(/\s+/);
            const arg = rest.join(' ');
            switch ((cmd || 'open').toLowerCase()) {
                case 'start': startWorld(); break;
                case 'build': await buildWorld(); break;
                case 'update': await onAction('pass', {}); break;
                case 'travel': return travelTo(arg) || `No known place "${arg}" next to here.`;
                case 'brief': break;
                default: openWorldPanel();
            }
            return getState() ? sceneBrief(getState()) : '';
        },
    }));
}

function registerMacros() {
    const c = ctx();
    const defs = {
        iwTime: ['Living world time of day (HH:MM)', s => s.clock.time],
        iwDay: ['Living world day number', s => String(s.clock.day)],
        iwWeather: ['Living world weather', s => s.clock.weather],
        iwLocation: ['Current living world location', s => currentLocation(s).name],
        iwScene: ['Full living world scene brief', s => sceneBrief(s)],
    };
    for (const [name, [description, fn]] of Object.entries(defs)) {
        const handler = () => { const s = getState(); return s ? fn(s) : ''; };
        try {
            if (c.macros?.register) c.macros.register(name, { category: TITLE, description, handler });
            else c.registerMacro?.(name, handler, description);
        } catch (error) { log('macro', name, error); }
    }
}

function onChatChanged() {
    epoch += 1;
    queued = null;
    const md = ctx().chatMetadata;
    if (md?.[STATE_KEY]) markPerceived(md[STATE_KEY] = normalizeState(md[STATE_KEY]));
    if (md?.[NOTES_KEY]) md[NOTES_KEY] = normNotes(md[NOTES_KEY]);
    inject();
    refresh({ quiet: true });
}

export async function init() {
    const c = ctx();
    settings();
    await mountSettings();
    bindUi();
    mountHud({ onGo: goTo, onPeek: peekInto, onDossier: openDossier, onOpenPanel: () => openWorldPanel('world'), avatarUrl, describeItem: id => getState()?.items.find(i => i.id === id)?.description || '', onLayout: paintStatus });
    addWandItem({ id: 'iw-wand', icon: 'fa-compass', label: 'Living World', onClick: () => openWorldPanel() });
    registerCommands();
    registerMacros();
    c.eventSource.on(c.eventTypes.CHAT_CHANGED, onChatChanged);
    c.eventSource.on(c.eventTypes.MESSAGE_RECEIVED, onMessageReceived);
    c.eventSource.on(c.eventTypes.MESSAGE_SWIPED, onMessageSwiped);
    c.eventSource.on(c.eventTypes.MESSAGE_DELETED, onMessageDeleted);
    onChatChanged();
    console.info(`[${TITLE}] v${VERSION} ready`);
    log('settings', structuredClone(settings()));
}
