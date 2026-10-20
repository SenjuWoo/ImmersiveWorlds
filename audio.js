// What the weather should sound like: gains and filter cutoffs, no DOM and no WebAudio, so node can test it.
// The player only moves numbers; every judgement about the world is made here.
import { currentLocation, weatherClass } from './engine.js';
import { placeKind } from './scenery.js';

// Places whose walls muffle the weather. Anything else is open sky.
const ENCLOSED = new Set(['interior', 'tavern', 'temple', 'cave', 'ship']);

/** Is this place under a roof? Uses the same classifier as the backdrop, so sound and picture agree. */
export const isEnclosed = loc => ENCLOSED.has(placeKind(loc?.type, loc?.name));

// One row per weather kind weatherClass can return. Gains are 0..1, cutoffs in Hz.
// Clear is silent on purpose: no weather means no hum, not a fan noise.
export const BEDS = Object.freeze({
    clear: { rain: 0, lp: 7000, hp: 700, roar: 0, roarLp: 320, wind: 0, windLp: 500, whistle: 0 },
    cloudy: { rain: 0, lp: 7000, hp: 700, roar: 0, roarLp: 320, wind: 0.07, windLp: 550, whistle: 0 },
    overcast: { rain: 0, lp: 7000, hp: 700, roar: 0, roarLp: 320, wind: 0.06, windLp: 550, whistle: 0 },
    rain: { rain: 0.20, lp: 7000, hp: 700, roar: 0.05, roarLp: 320, wind: 0.04, windLp: 500, whistle: 0 },
    storm: { rain: 0.46, lp: 9000, hp: 600, roar: 0.20, roarLp: 380, wind: 0.30, windLp: 800, whistle: 0.05 },
    snow: { rain: 0.11, lp: 1100, hp: 220, roar: 0.02, roarLp: 300, wind: 0.05, windLp: 350, whistle: 0 },
    fog: { rain: 0.02, lp: 700, hp: 300, roar: 0, roarLp: 300, wind: 0.02, windLp: 300, whistle: 0 },
    haze: { rain: 0, lp: 5000, hp: 700, roar: 0, roarLp: 320, wind: 0.04, windLp: 450, whistle: 0 },
    wind: { rain: 0, lp: 7000, hp: 700, roar: 0, roarLp: 320, wind: 0.34, windLp: 900, whistle: 0.07 },
    hot: { rain: 0, lp: 4000, hp: 700, roar: 0, roarLp: 320, wind: 0.02, windLp: 400, whistle: 0 },
    cold: { rain: 0, lp: 3000, hp: 700, roar: 0, roarLp: 320, wind: 0.10, windLp: 500, whistle: 0.02 },
});

export const clampVolume = v => Math.max(0, Math.min(1, Number(v) || 0));

/** A bed for one weather kind. Unknown kinds are clear. `indoor` muffles it: quieter, duller, less air. */
export function weatherSpec(kind, { volume = 1, indoor = false } = {}) {
    const p = BEDS[kind] ?? BEDS.clear;
    const v = clampVolume(volume);
    const k = indoor ? 0.35 : 1;
    return {
        kind: BEDS[kind] ? kind : 'clear',
        indoor: Boolean(indoor),
        volume: v,
        rain: p.rain * k * v,
        lp: Math.max(120, p.lp * (indoor ? 0.22 : 1)),
        hp: p.hp * (indoor ? 0.6 : 1),
        roar: p.roar * k * v,
        roarLp: p.roarLp * (indoor ? 0.7 : 1),
        wind: p.wind * (indoor ? 0.4 : 1) * v,
        windLp: p.windLp * (indoor ? 0.5 : 1),
        whistle: p.whistle * (indoor ? 0.2 : 1) * v,
    };
}

/** The bed for the world right now. `indoor: null` reads it from the current place. */
export function audioSpec(state, { volume = 1, indoor = null } = {}) {
    const loc = state ? currentLocation(state) : null;
    const kind = state ? weatherClass(state) : 'clear';
    const inside = indoor === null ? isEnclosed(loc) : Boolean(indoor);
    return { ...weatherSpec(kind, { volume, indoor: inside }), storm: kind === 'storm' };
}

// A flash and its clap: near strikes come fast, far ones roll in late. Deterministic with an injected rand.
export const thunderDelay = (rand = Math.random) => 400 + rand() * 3600;
export const nextStrike = (rand = Math.random) => 9000 + rand() * 15000;

/** Stable identity of a spec, so the player can skip a repaint that changes nothing. */
export const specKey = s => [s.kind, s.indoor ? 1 : 0, s.rain.toFixed(3), s.lp | 0, s.hp | 0, s.roar.toFixed(3), s.roarLp | 0, s.wind.toFixed(3), s.windLp | 0, s.whistle.toFixed(3)].join('|');
