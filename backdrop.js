// The scene backdrop: one fixed layer between SillyTavern's own background (#bg1) and the UI.
// It grades the screen by time of day and weather, and can draw a silhouette scene or show a generated picture.
// It never touches SillyTavern's background setting, so turning it off gives the user's background back.
import { skyOf, PLACE_KINDS } from './scenery.js';

export const BACKDROP_MODES = ['off', 'tint', 'scene', 'art'];

/** The old "tint by time of day" checkbox became a mode; an existing valid mode always wins. */
export function migrateBackdrop(settings) {
    if (BACKDROP_MODES.includes(settings?.backdrop)) return settings.backdrop;
    return settings?.ambientEffects === false ? 'off' : 'tint';
}

// Hand-drawn skylines, 1000x220, filled with the layer's silhouette colour. Small on purpose.
const SIL = {
    city: 'M0 220V150h50v-45h40v45h30v-90h55v90h35v-60h45v60h50v-110h40v110h40v-70h60v70h35v-120h50v120h45v-55h45v55h50v-80h55v80h50v-40h50v40h50V220z',
    market: 'M0 220v-70l60-40 60 40v70zm140 0v-60l55-35 55 35v60zm270 0v-75l65-45 65 45v75zm220 0v-60l60-38 60 38v60zm160 0v-72l65-42 65 42v72zM0 220h1000v-18H0z',
    harbor: 'M0 200q125-14 250 0t250 0 250 0 250 0v20H0zM140 200V70l50 90 -50 -2zm0-20 60 0zM410 200V40l70 120zM420 200h90v-14h-90zM700 200V90l55 100zM60 205h260v10H60z',
    tavern: 'M0 220V170h200v-60l110-60 110 60v60h30v-80h25v80h20V50h30v40h340V170H1000V220zM280 140h40v50h-40z',
    temple: 'M0 220V190h120v-20h760v20h120v30zM180 170V90h40v80zm110 0V90h40v80zm110 0V90h40v80zm110 0V90h40v80zm110 0V90h40v80zm110 0V90h40v80zM150 90 500 20 850 90z',
    forest: 'M0 220V150l40-100 40 100 30-70 40 90 40-110 45 120 30-60 40 80 40-100 40 110 40-70 35 90 45-120 40 110 40-80 30 70 45-100 40 120 45-90 40 80 35-60 40 80V220z',
    mountain: 'M0 220V150l110-90 70 60 120-110 110 130 90-80 120-60 130 120 80-50 170 80V220z',
    cave: 'M0 220V150l60 50 40-90 55 100 60-70 50 80 70-60 50 90 80-80 60 70 60-100 70 90 60-60 55 70 60-90 70 80V220zM0 0h1000v40l-70 30-50-45-60 55-40-50-80 60-60-40-70 60-50-50-80 50-70-45-60 55-50-60-60 50-70-40-60 60-40-30-80 40z',
    desert: 'M0 220V160q120-60 260-10t240-20 240 30 260-20v80zM780 150V90h14V120h20V80h14v70z',
    plains: 'M0 220V170q150-50 300-10t300-20 400 30v50zM770 150V100h10v50zM740 100q40-50 80 0z',
    road: 'M0 220V160q200-60 400-20t600-30v110zM300 160V120h8v40zm120 6V126h8v40zm120 0V126h8v40zm120 -4V122h8v40z',
    ship: 'M60 190h880l-90 30H150zM490 190V30L650 170zM470 190V50L330 170zM480 30h20v30h-20z',
    interior: 'M0 220V50h1000V220zM110 90h190v90H110zM405 90h190v90H405zM700 90h190v90H700zM205 90h10v90h-10zM500 90h10v90h-10zM795 90h10v90h-10z',
    default: 'M0 220V150q150-50 350-10t350-10 300 30v60z',
};

/** An inline SVG skyline for a place kind; unknown kinds get the default hills. */
export function silhouetteSvg(kind) {
    const d = SIL[PLACE_KINDS.includes(kind) ? kind : 'default'] ?? SIL.default;
    return `<svg viewBox="0 0 1000 220" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="${d}"/></svg>`;
}

let layer = null;

/** Create the layer right after #bg1 (so it paints above SillyTavern's background and below the UI). Idempotent. */
export function mountBackdrop() {
    if (layer?.isConnected) return;
    layer = document.createElement('div');
    layer.id = 'iw-backdrop';
    layer.setAttribute('aria-hidden', 'true');
    layer.dataset.mode = 'off';
    const bg = document.getElementById('bg1');
    if (bg) bg.after(layer); else document.body.prepend(layer);
}

export function unmountBackdrop() {
    layer?.remove();
    layer = null;
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Draw the backdrop. `mode`: off | tint (grade only) | scene (sky + silhouette) | art (a picture, scene until it exists).
 * Changing the picture crossfades; weather and time only move the grade.
 */
export function paintBackdrop({ mode = 'off', kind = 'default', slot = 'day', weather = 'clear', art = '' } = {}) {
    if (!layer) return;
    const sky = skyOf(slot, weather);
    const on = BACKDROP_MODES.includes(mode) && mode !== 'off';
    layer.dataset.mode = on ? mode : 'off';
    layer.dataset.slot = slot;
    layer.dataset.weather = weather;
    layer.style.setProperty('--iw-dim', String(on ? sky.dim * (mode === 'tint' ? 0.7 : 1) : 0));
    layer.style.setProperty('--iw-tint', sky.tint);
    layer.style.setProperty('--iw-tint-a', String(on ? sky.tintAlpha : 0));

    const picture = mode === 'scene' || mode === 'art';
    const key = picture ? `${art ? `art:${art}` : `scene:${kind}:${slot}`}` : '';
    if (layer.dataset.pic === key) return;
    layer.dataset.pic = key;
    const old = [...layer.querySelectorAll('.iw-bd-pic')];
    const fade = !reduced();
    if (key) {
        const pic = document.createElement('div');
        pic.className = 'iw-bd-pic';
        if (art) pic.style.backgroundImage = `url("${String(art).replace(/["\\\n]/g, encodeURIComponent)}")`;
        else {
            pic.style.setProperty('--iw-sky-top', sky.top);
            pic.style.setProperty('--iw-sky-bottom', sky.bottom);
            pic.style.setProperty('--iw-light', sky.light);
            pic.dataset.slot = slot;
            pic.innerHTML = silhouetteSvg(kind);
        }
        layer.append(pic);
        if (fade) { void pic.offsetWidth; pic.classList.add('is-in'); } else pic.classList.add('is-in', 'no-fade');
    }
    // Old pictures fade out with the new one fading in, then go.
    for (const o of old) { o.classList.remove('is-in'); setTimeout(() => o.remove(), fade ? 1400 : 0); }
}
