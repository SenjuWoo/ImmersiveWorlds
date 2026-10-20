// The weather, heard. One AudioContext, one graph of noise and filters, and parameter ramps between beds.
// No sound files: rain, wind and thunder are filtered noise, so there is nothing to download or license.
import { weatherSpec, specKey, thunderDelay, nextStrike } from './audio.js';

let ac = null;          // the context, built on first use
let nodes = null;       // the fixed graph
let key = '';           // the spec currently applied
let storm = false;      // is the thunder timer running?
let live = false;       // should sound be playing at all?
let vol = 1;            // last volume, so thunder follows the slider too
let strikeTimer = 0;
let onFlash = null;

const at = () => ac.currentTime;

/** 3 s of stereo white noise: the raw material for every sound here. */
function noiseBuffer(c) {
    const len = Math.floor(c.sampleRate * 3);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return buf;
}

/**
 * Build the whole graph once. Every bed only moves gains and cutoffs, so switching weather never clicks
 * and never creates nodes that would need collecting.
 */
function build() {
    if (ac) return true;
    const C = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!C) return false;
    try { ac = new C(); } catch { return false; }

    const noise = noiseBuffer(ac);
    const src = () => { const s = ac.createBufferSource(); s.buffer = noise; s.loop = true; s.start(0, Math.random() * 2); return s; };
    const gain = v => { const g = ac.createGain(); g.gain.value = v; return g; };
    const filt = (type, f, q = 0.7) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };

    // Rain: bright noise for the hiss. Roar: the low body a downpour has. Wind: slow low noise plus a whistle.
    const rainG = gain(0), rainHP = filt('highpass', 700), rainLP = filt('lowpass', 7000);
    src().connect(rainHP).connect(rainLP).connect(rainG).connect(ac.destination);
    const roarG = gain(0), roarLP = filt('lowpass', 320);
    src().connect(roarLP).connect(roarG).connect(ac.destination);
    const windG = gain(0), windLP = filt('lowpass', 500);
    src().connect(windLP).connect(windG).connect(ac.destination);
    const whistleG = gain(0), whistleBP = filt('bandpass', 950, 9);
    src().connect(whistleBP).connect(whistleG).connect(ac.destination);

    // One slow LFO on the rain and wind gains: without it the bed sounds like a dead machine.
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.07;
    const lfoRain = gain(0), lfoWind = gain(0);
    lfo.connect(lfoRain).connect(rainG.gain);
    lfo.connect(lfoWind).connect(windG.gain);
    lfo.start();

    nodes = { noise, rainG, rainHP, rainLP, roarG, roarLP, windG, windLP, whistleG, lfoRain, lfoWind };
    return true;
}

/** Move every parameter to the spec's values. Ramps are long enough to hide the change, short enough to feel it. */
function apply(spec) {
    if (!nodes) return;
    const t = at(), ramp = (p, v) => p.setTargetAtTime(v, t, 0.4);
    vol = spec.volume ?? 1;
    ramp(nodes.rainG.gain, spec.rain);
    ramp(nodes.rainLP.frequency, spec.lp);
    ramp(nodes.rainHP.frequency, spec.hp);
    ramp(nodes.roarG.gain, spec.roar);
    ramp(nodes.roarLP.frequency, spec.roarLp);
    ramp(nodes.windG.gain, spec.wind);
    ramp(nodes.windLP.frequency, spec.windLp);
    ramp(nodes.whistleG.gain, spec.whistle);
    nodes.lfoRain.gain.value = spec.rain * 0.35;
    nodes.lfoWind.gain.value = spec.wind * 0.4;
}

/** One clap: a band-passed crack, a rumble sweeping down to 70 Hz, and a sub thump for the chest. */
function thunder() {
    if (!ac || !nodes || !live) return;
    const t = at();
    const n = () => { const s = ac.createBufferSource(); s.buffer = nodes.noise; s.start(t, Math.random() * 2); return s; };

    const crack = n(), cbp = ac.createBiquadFilter(), cg = ac.createGain();
    cbp.type = 'bandpass'; cbp.frequency.value = 1700; cbp.Q.value = 0.8;
    cg.gain.setValueAtTime(0.0001, t);
    cg.gain.exponentialRampToValueAtTime(0.55 * vol, t + 0.012);
    cg.gain.exponentialRampToValueAtTime(0.0008, t + 0.22);
    crack.connect(cbp).connect(cg).connect(ac.destination);
    crack.stop(t + 0.3);

    const roll = n(), rlp = ac.createBiquadFilter(), rg = ac.createGain();
    rlp.type = 'lowpass';
    rlp.frequency.setValueAtTime(340, t + 0.05);
    rlp.frequency.exponentialRampToValueAtTime(70, t + 3.0);
    rg.gain.setValueAtTime(0.0001, t + 0.04);
    rg.gain.exponentialRampToValueAtTime(0.85 * vol, t + 0.30);
    rg.gain.exponentialRampToValueAtTime(0.0008, t + 3.4);
    roll.connect(rlp).connect(rg).connect(ac.destination);
    roll.stop(t + 3.6);

    const sub = ac.createOscillator(), sg = ac.createGain();
    sub.frequency.setValueAtTime(58, t + 0.05);
    sub.frequency.exponentialRampToValueAtTime(27, t + 1.6);
    sg.gain.setValueAtTime(0.0001, t + 0.05);
    sg.gain.exponentialRampToValueAtTime(0.5 * vol, t + 0.2);
    sg.gain.exponentialRampToValueAtTime(0.0006, t + 2.2);
    sub.connect(sg).connect(ac.destination);
    sub.start(t + 0.05); sub.stop(t + 2.3);
}

/** Arm (or disarm) the storm timer. Called only when the storm state changes, never on every repaint. */
function schedule() {
    clearTimeout(strikeTimer);
    strikeTimer = 0;
    if (!storm || !ac) return;
    strikeTimer = setTimeout(() => {
        strikeTimer = 0;
        if (document.hidden) return schedule();     // do not pile up strikes nobody can hear
        onFlash?.();
        setTimeout(thunder, thunderDelay());
        schedule();
    }, nextStrike());
}

const resume = () => { if (ac?.state === 'suspended') ac.resume().catch(() => {}); };

// Browsers start audio suspended until the page has seen a gesture; SillyTavern always has one.
if (typeof document !== 'undefined') {
    document.addEventListener('pointerdown', resume, { passive: true });
    document.addEventListener('keydown', resume, { passive: true });
    document.addEventListener('visibilitychange', () => {
        if (!ac) return;
        if (document.hidden) ac.suspend().catch(() => {});
        else if (live) ac.resume().catch(() => {});
    });
}

/**
 * Show the world's weather. `spec` comes from audioSpec(); `thunder` arms the storm timer and `onFlash`
 * is called at the moment of the strike, before the clap, so the picture and the sound are one event.
 */
export function syncAudio(spec, { thunder: wantThunder = true, onFlash: cb = null } = {}) {
    if (!spec) return stopAudio();
    if (!build()) return;
    live = true;
    onFlash = cb;
    resume();
    const k = specKey(spec);
    if (k !== key) { key = k; apply(spec); }
    const want = Boolean(wantThunder && spec.storm);
    if (want !== storm) { storm = want; schedule(); }
}

/** Fade out and let the context sleep. Safe to call when nothing is playing, and cheap when it already is. */
export function stopAudio() {
    const wasPlaying = live || storm || key;
    live = false;
    storm = false;
    key = '';
    clearTimeout(strikeTimer);
    strikeTimer = 0;
    if (!ac || !nodes || !wasPlaying) return;
    apply(weatherSpec('clear'));
    setTimeout(() => { if (!live && ac?.state === 'running') ac.suspend().catch(() => {}); }, 800);
}

/** Play a bed for a few seconds with one clap, for the settings Test button. False when the browser has no WebAudio. */
export function testAudio(spec) {
    if (!spec || !build()) return false;
    live = true;
    resume();
    key = '';
    apply(spec);
    setTimeout(thunder, 500);
    return true;
}
