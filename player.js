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
let evTimer = 0;
let evKey = '';
let lastSpark = 0;
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

    // The place: five textures, each a filtered noise. Mixing them is the room.
    const waterG = gain(0), waterLP = filt('lowpass', 900);
    src().connect(waterLP).connect(waterG).connect(ac.destination);
    const fireG = gain(0), fireLP = filt('lowpass', 1400);
    src().connect(fireLP).connect(fireG).connect(ac.destination);
    const roomG = gain(0), roomLP = filt('lowpass', 180);
    src().connect(roomLP).connect(roomG).connect(ac.destination);
    const leavesG = gain(0), leavesBP = filt('bandpass', 3200, 0.7);
    src().connect(leavesBP).connect(leavesG).connect(ac.destination);
    const humG = gain(0), humBP = filt('bandpass', 420, 0.8);
    src().connect(humBP).connect(humG).connect(ac.destination);

    // Water breathes slowly; fire and leaves flutter. Two LFOs cover all three.
    const wash = ac.createOscillator(); wash.frequency.value = 0.22;
    const washAmt = gain(0); wash.connect(washAmt).connect(waterG.gain); wash.start();
    const flicker = ac.createOscillator(); flicker.frequency.value = 4.5;
    const flickFire = gain(0), flickLeaves = gain(0);
    flicker.connect(flickFire).connect(fireG.gain);
    flicker.connect(flickLeaves).connect(leavesG.gain);
    flicker.start();

    // One slow LFO on the rain and wind gains: without it the bed sounds like a dead machine.
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.07;
    const lfoRain = gain(0), lfoWind = gain(0);
    lfo.connect(lfoRain).connect(rainG.gain);
    lfo.connect(lfoWind).connect(windG.gain);
    lfo.start();

    nodes = {
        noise, rainG, rainHP, rainLP, roarG, roarLP, windG, windLP, whistleG, lfoRain, lfoWind,
        waterG, waterLP, fireG, fireLP, roomG, roomLP, leavesG, leavesBP, humG, humBP, washAmt, flickFire, flickLeaves,
    };
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
    // The room. A spec without layers (the Test button, the fade-out) simply zeroes them.
    const L = spec.layers ?? {};
    ramp(nodes.waterG.gain, L.water ?? 0);
    ramp(nodes.fireG.gain, L.fire ?? 0);
    ramp(nodes.roomG.gain, L.room ?? 0);
    ramp(nodes.leavesG.gain, L.leaves ?? 0);
    ramp(nodes.humG.gain, L.hum ?? 0);
    nodes.washAmt.gain.value = (L.water ?? 0) * 0.3;
    nodes.flickFire.gain.value = (L.fire ?? 0) * 0.25;
    nodes.flickLeaves.gain.value = (L.leaves ?? 0) * 0.3;
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

/**
 * A short synthesised sound: a burst of noise or a swept tone with a fast envelope.
 * Eight voices cover every one-shot in the extension; none of them is a sample.
 */
function spark(kind) {
    if (!ac || !nodes || !live) return;
    const t = at();
    const noise = (peak, dur, type, freq, q = 0.8, off = 0) => {
        const s = ac.createBufferSource(); s.buffer = nodes.noise; s.start(t + off, Math.random() * 2); s.stop(t + off + dur + 0.05);
        const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t + off);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * vol), t + off + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0008, t + off + dur);
        s.connect(f).connect(g).connect(ac.destination);
    };
    const tone = (peak, dur, f0, f1, off = 0, type = 'sine') => {
        const o = ac.createOscillator(); o.type = type;
        o.frequency.setValueAtTime(f0, t + off);
        if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + off + dur);
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t + off);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * vol), t + off + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0008, t + off + dur);
        o.connect(g).connect(ac.destination);
        o.start(t + off); o.stop(t + off + dur + 0.05);
    };

    switch (kind) {
        case 'footstep': noise(0.22, 0.14, 'lowpass', 380); noise(0.15, 0.12, 'lowpass', 340, 0.8, 0.17); break;
        case 'door': noise(0.20, 0.30, 'bandpass', 700, 1.2); tone(0.14, 0.25, 90, 60); break;
        case 'coin': tone(0.10, 0.05, 2400, 2400); tone(0.08, 0.06, 3300, 3300, 0.06); tone(0.05, 0.08, 2100, 2100, 0.12); break;
        case 'chair': tone(0.16, 0.18, 130, 90); noise(0.10, 0.08, 'highpass', 2000, 0.8, 0.02); break;
        case 'page': noise(0.09, 0.14, 'highpass', 2500); break;
        case 'bird': tone(0.07, 0.07, 2900, 4100); tone(0.06, 0.06, 3200, 4400, 0.13); break;
        case 'drip': tone(0.10, 0.16, 1200, 760); tone(0.05, 0.20, 900, 640, 0.18); break;
        case 'creak': {
            // Resonant noise swept down: reads as wood under strain, where a raw saw would just buzz.
            const s = ac.createBufferSource(); s.buffer = nodes.noise; s.start(t, Math.random() * 2); s.stop(t + 0.62);
            const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 12;
            f.frequency.setValueAtTime(520, t); f.frequency.linearRampToValueAtTime(380, t + 0.5);
            const g = ac.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.18 * vol), t + 0.06);
            g.gain.exponentialRampToValueAtTime(0.0008, t + 0.55);
            s.connect(f).connect(g).connect(ac.destination);
            break;
        }
    }
}

/**
 * One-shots for the room you are in. A random pick every 2.5-8 s, never more than one
 * every 700 ms, never while the tab is hidden. Re-armed after every pick, not on every repaint.
 */
function scheduleEvents(events) {
    clearTimeout(evTimer);
    evTimer = 0;
    if (!events?.length || !live) return;
    evTimer = setTimeout(() => {
        evTimer = 0;
        if (!live) return;
        if (!document.hidden && Date.now() - lastSpark > 700) {
            lastSpark = Date.now();
            spark(events[Math.floor(Math.random() * events.length)]);
        }
        scheduleEvents(events);
    }, 2500 + Math.random() * 5500);
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
export function syncAudio(spec, { thunder: wantThunder = true, onFlash: cb = null, cues = [] } = {}) {
    if (!spec) return stopAudio();
    if (!build()) return;
    live = true;
    onFlash = cb;
    resume();
    const k = specKey(spec);
    if (k !== key) { key = k; apply(spec); }
    const want = Boolean(wantThunder && spec.storm);
    if (want !== storm) { storm = want; schedule(); }
    const events = spec.events ?? [];
    const ek = events.join(',');
    if (ek !== evKey) { evKey = ek; scheduleEvents(events); }
    // Cues fire now: an arrival should land with the HUD's glow, not with the next timer tick.
    cues.forEach((c, i) => setTimeout(() => spark(c), i * 220));
}

/** Fade out and let the context sleep. Safe to call when nothing is playing, and cheap when it already is. */
export function stopAudio() {
    const wasPlaying = live || storm || key;
    live = false;
    storm = false;
    key = '';
    evKey = '';
    clearTimeout(strikeTimer);
    clearTimeout(evTimer);
    strikeTimer = 0;
    evTimer = 0;
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
    scheduleEvents(spec.events ?? []);
    setTimeout(thunder, 500);
    return true;
}
