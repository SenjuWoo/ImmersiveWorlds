// Pure art helpers: the picture store, safe prompts and a single-flight queue.
// The image generator is injected, so nothing here touches SillyTavern and node can test all of it.
import { cleanText } from './engine.js';
import { artSlot } from './scenery.js';

/** Chat-metadata key. Art is presentation, not story state: swipes, regenerates and deletes never rewind it. */
export const ART_KEY = 'immersive_worlds_art_v1';
const MAX_URL = 500;
const MAX_KEY = 120;

/** Coerce anything into { v: 1, items: { key: { url, at } } }; entries that are not a short url string are dropped. */
export function normArt(raw) {
    const items = {};
    const src = raw && typeof raw === 'object' && raw.items && typeof raw.items === 'object' ? raw.items : {};
    for (const [key, v] of Object.entries(src)) {
        if (key.length <= MAX_KEY && v && typeof v.url === 'string' && v.url && v.url.length <= MAX_URL) items[key] = { url: v.url, at: String(v.at ?? '') };
    }
    return { v: 1, items };
}

/** place:<id>:<day|night> (dawn shares the day picture, dusk the night one), person:<id>, item:<id>. */
export const artKey = (kind, id, slot = '') => (kind === 'place' ? `place:${id}:${artSlot(slot)}` : `${kind}:${id}`);
export const getArt = (store, key) => store.items[key]?.url ?? '';
export const putArt = (store, key, url, at = new Date().toISOString()) => { store.items[key] = { url: String(url), at }; };
export const dropArt = (store, key) => { delete store.items[key]; };
export const clearArt = store => { store.items = {}; };
export const artCount = store => Object.keys(store.items).length;
export const clampCap = n => { const v = Math.floor(Number(n)); return Number.isFinite(v) ? Math.max(4, Math.min(40, v)) : 12; };

// Prompts are built from what the player can see only, and never carry weather (particles and the grade draw that),
// pipes (they end a slash command) or {{macros}} (SillyTavern would expand them).
const WEATHER = /\b(?:rain\w*|storm\w*|snow\w*|fog\w*|mist\w*|thunder\w*|blizzard|drizzle)\b/gi;
const plain = (text, max) => cleanText(text, max).replace(/[|\r\n]+/g, ' ').replace(/\{\{|\}\}/g, '').replace(/\s+/g, ' ').trim();
const noWeather = text => text.replace(WEATHER, '').replace(/\s+/g, ' ').replace(/\s,/g, ',').trim();

/** One line for a place picture: name, type, season, setting, time of day (two pictures per place). */
export function placePrompt({ name, type, season, genre, tone, slot }) {
    const night = artSlot(slot) === 'night';
    const parts = [plain(name, 120), plain(type, 60), season && season !== 'unspecified' ? `${plain(season, 40)} season` : '', genre ? `${plain(genre, 60)} setting` : '', tone ? `${plain(tone, 60)} mood` : '']
        .filter(Boolean).join(', ');
    const light = night ? 'night, moonlit, dark sky' : 'daytime, daylight';
    return `${noWeather(parts).slice(0, 280)}, ${light}, no people, no text, no watermark, wide landscape background, detailed`.slice(0, 400);
}

/** A portrait from how the player sees the person (look), else only their visible label and tags. */
export function portraitPrompt({ label, look, tags }) {
    const who = plain(look, 200) || plain(label, 80) || 'a person';
    const seen = (Array.isArray(tags) ? tags : []).map(t => plain(t, 30)).filter(Boolean).slice(0, 4);
    return `portrait of ${[who, ...seen].join(', ')}, upper body, neutral background, no text`.slice(0, 400);
}

export function itemPrompt({ name, type, description }) {
    const desc = plain(description, 120);
    return `still life of ${plain(name, 80)}${type ? ` (${plain(type, 40)})` : ''}${desc ? `, ${desc}` : ''}, plain background, no text`.slice(0, 400);
}

/** The item as the player knows it, or null when it is neither held nor in sight. */
export function itemBrief(view, id, describe = () => '') {
    const item = [...view.items.mine, ...view.items.here].find(i => i.id === id);
    return item ? { name: item.name, type: item.type, description: describe(id) } : null;
}

/**
 * Runs picture jobs one at a time. `generate(job)` returns a url ('' or a throw is a failure). Two failures in a row pause
 * the queue (one `onPause`) until `resume()`. `reset()` forgets everything queued and drops the result of a job still running.
 */
export class ArtQueue {
    #jobs = [];
    #running = null;
    #fails = 0;
    #paused = false;
    #epoch = 0;
    #waiters = [];

    constructor({ generate, cap = 12, used = () => 0, onDone = () => {}, onFail = () => {}, onPause = () => {} }) {
        Object.assign(this, { generate, cap, used, onDone, onFail, onPause });
    }

    get running() { return this.#running?.key ?? ''; }
    get pending() { return this.#jobs.length; }

    enqueue(job) {
        if (this.#paused) return 'paused';
        if (job.key === this.running || this.#jobs.some(j => j.key === job.key)) return 'duplicate';
        if (this.used() + this.#jobs.length + (this.#running ? 1 : 0) >= this.cap) return 'capped';
        this.#jobs.push(job);
        this.#pump();
        return 'queued';
    }

    resume() { this.#paused = false; this.#fails = 0; }

    reset() {
        this.#epoch++;
        this.#jobs = [];
        this.#running = null;
        this.#settle();
    }

    /** Resolves when nothing is queued or running. */
    whenIdle() {
        return this.#running || this.#jobs.length ? new Promise(r => this.#waiters.push(r)) : Promise.resolve();
    }

    // A throwing callback must never become an unhandled rejection or stall the queue.
    #call(fn, ...args) { try { fn(...args); } catch (e) { console.warn('[Immersive Worlds] art callback failed', e); } }

    #settle() {
        if (this.#running || this.#jobs.length) return;
        for (const r of this.#waiters.splice(0)) r();
    }

    async #pump() {
        if (this.#running || this.#paused || !this.#jobs.length) return;
        const job = this.#jobs.shift();
        const epoch = this.#epoch;
        this.#running = job;
        let url = '';
        let error = null;
        try { url = await this.generate(job); } catch (e) { error = e; }
        if (epoch !== this.#epoch) return; // the chat changed while it drew: nothing from before may land
        this.#running = null;
        if (typeof url === 'string' && url && !error) {
            this.#fails = 0;
            this.#call(this.onDone, job, url);
        } else {
            this.#fails++;
            this.#call(this.onFail, job, error ?? new Error('no picture came back'));
            if (this.#fails >= 2) { this.#paused = true; this.#jobs = []; this.#call(this.onPause); }
        }
        this.#settle();
        this.#pump();
    }
}
