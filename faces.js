// Faces for the HUD: an expression sprite when the card has them, else the avatar, else a monogram.
// Pure helpers plus a small sprite-list cache; nothing here talks to the model.

/** First letter of the name (leading article dropped) and a stable hue, so a person keeps their colour. */
export function monogram(name) {
    const text = String(name ?? '').trim().replace(/^(a|an|the)\s+/i, '');
    const letter = (text.match(/\p{L}|\p{N}/u)?.[0] ?? '?').toUpperCase();
    let h = 0;
    for (const ch of text.toLowerCase()) h = (h * 31 + ch.codePointAt(0)) % 360;
    return { letter, hue: h };
}

/** The sprite for `label`, else a fallback label, else the first one, else ''. */
export function pickSprite(sprites, label, fallbacks = ['neutral']) {
    const list = Array.isArray(sprites) ? sprites.filter(s => s?.path) : [];
    for (const l of [label, ...fallbacks]) {
        const hit = l && list.find(s => s.label === l);
        if (hit) return hit.path;
    }
    return list[0]?.path ?? '';
}

const lists = new Map(); // folder -> sprite list once loaded, 'loading' while in flight

/** Sprites for a sprite folder, or [] until the first fetch lands (then `onReady` fires once). */
export function spritesFor(folder, onReady) {
    if (!folder) return [];
    const have = lists.get(folder);
    if (Array.isArray(have)) return have;
    if (have === undefined) {
        lists.set(folder, 'loading');
        fetch(`/api/sprites/get?name=${encodeURIComponent(folder)}`)
            .then(res => (res.ok ? res.json() : []))
            .catch(() => [])
            .then(list => { lists.set(folder, Array.isArray(list) ? list : []); onReady?.(); });
    }
    return [];
}

let expressions = null;
/** The Expressions extension is optional; its current label per character is read, never recomputed. */
export function loadExpressions() {
    import('../../expressions/index.js').then(m => { expressions = m; }).catch(() => { expressions = null; });
}
export const expressionOf = folder => String(expressions?.lastExpression?.[folder] ?? '');

/** ST's sprite folder for a card is its avatar file name without the extension. */
export const spriteFolder = avatar => String(avatar ?? '').replace(/\.[^/.]+$/, '');
