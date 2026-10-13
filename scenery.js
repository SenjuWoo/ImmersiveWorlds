// Pure scene helpers: place kind, sky palette, particle spec. No DOM, so node can test them.
// The backdrop, HUD strip and particle canvas only draw what these return.

export const PLACE_KINDS = ['city', 'market', 'harbor', 'tavern', 'temple', 'forest', 'mountain', 'cave', 'desert', 'plains', 'road', 'ship', 'interior', 'default'];

// A trailing * is a stem ("harbo*" -> harbor, harbour); other words match whole, with an optional plural s.
const kw = words => new RegExp(`\\b(?:${words.map(w => (w.endsWith('*') ? `${w.slice(0, -1)}\\w*` : `${w}s?\\b`)).join('|')})`, 'i');
const KEYWORDS = {
    city: kw(['city', 'town', 'street', 'alley', 'plaza', 'square', 'district', 'quarter', 'gate', 'bridge']),
    market: kw(['market', 'bazaar', 'stall', 'shop', 'store']),
    harbor: kw(['dock', 'harbo*', 'port', 'pier', 'wharf', 'quay', 'beach', 'shore', 'coast']),
    tavern: kw(['tavern', 'inn', 'pub', 'bar', 'cantina', 'saloon', 'brothel']),
    temple: kw(['temple', 'shrine', 'church', 'cathedral', 'chapel', 'monaster*', 'crypt', 'tomb']),
    forest: kw(['forest', 'wood', 'grove', 'jungle', 'swamp', 'marsh', 'garden', 'park']),
    mountain: kw(['mountain', 'cliff', 'pass', 'peak', 'hill', 'canyon']),
    cave: kw(['cave', 'cavern', 'mine', 'tunnel', 'sewer', 'dungeon', 'cellar']),
    desert: kw(['desert', 'dune', 'wasteland', 'oasis']),
    plains: kw(['field', 'plain', 'meadow', 'farm', 'village', 'camp', 'ruin']),
    road: kw(['road', 'path', 'trail', 'highway']),
    ship: kw(['ship', 'boat', 'vessel', 'deck', 'airship']),
    interior: kw(['room', 'house', 'hall', 'kitchen', 'bedroom', 'cabin', 'office', 'apartment', 'flat', 'castle', 'keep', 'library', 'lab', 'cell', 'barracks', 'manor']),
};

/** Which silhouette a place gets, from its free-text type and name. Unknown or non-string input is 'default'. */
export function placeKind(type, name) {
    const text = `${typeof type === 'string' ? type : ''} ${typeof name === 'string' ? name : ''}`;
    return PLACE_KINDS.find(k => KEYWORDS[k]?.test(text)) ?? 'default';
}

/** Generated art has two pictures per place: dawn and day share one, dusk and night the other. */
export const artSlot = slot => (slot === 'dusk' || slot === 'night' ? 'night' : 'day');

const WEATHER_ALIAS = { rainy: 'rain', raining: 'rain', drizzle: 'rain', thunderstorm: 'storm', stormy: 'storm', snowing: 'snow', mist: 'fog', misty: 'fog', foggy: 'fog', humid: 'hot', heat: 'hot', sunny: 'clear' };
const weatherOf = w => { const k = String(w ?? '').toLowerCase().replace(/[^a-z]+/g, ''); return WEATHER_ALIAS[k] ?? k; };
const GLOOM = new Set(['rain', 'storm', 'snow', 'fog', 'overcast', 'cloudy']);

// hue, saturation, lightness of the sky's top and bottom, the grade strength and the overlay tint per slot.
const SKY = {
    dawn: { top: [215, 38, 34], bottom: [22, 70, 66], dim: 0.18, tint: '120 160 255', alpha: 0.12 },
    day: { top: [210, 70, 58], bottom: [200, 60, 80], dim: 0, tint: '255 255 255', alpha: 0 },
    dusk: { top: [255, 40, 28], bottom: [18, 80, 56], dim: 0.22, tint: '255 140 60', alpha: 0.16 },
    night: { top: [232, 50, 8], bottom: [225, 40, 18], dim: 0.5, tint: '40 60 160', alpha: 0.2 },
};
const hsl = ([h, s, l], k = 1) => `hsl(${h} ${Math.round(s * k)}% ${l}%)`;

/** Sky colours and the screen grade for a time slot and weather. Unknown input falls back to a clear day. */
export function skyOf(slot, weather) {
    const p = SKY[slot] ?? SKY.day;
    const bad = GLOOM.has(weatherOf(weather));
    return {
        top: hsl(p.top, bad ? 0.45 : 1),
        bottom: hsl(p.bottom, bad ? 0.45 : 1),
        light: hsl(p.bottom, 0.9),
        dim: Math.min(0.55, p.dim + (bad ? 0.08 : 0)),
        tint: p.tint,
        tintAlpha: p.alpha,
    };
}

const NONE = Object.freeze({ kind: null, count: 0 });

/** Which particles fall for this weather. Reduced motion means none. */
export function particleSpec(weather, slot, reduced = false) {
    if (reduced) return { ...NONE };
    switch (weatherOf(weather)) {
        case 'rain': return { kind: 'rain', count: 140 };
        case 'storm': return { kind: 'rain', count: 220 };
        case 'snow': return { kind: 'snow', count: 120 };
        case 'fog': return { kind: 'fog', count: 14 };
        case 'hot': case 'haze': return { kind: 'dust', count: 30 };
        default: return { ...NONE };
    }
}
