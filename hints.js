// "What could I do next?": ideas built only from what the HUD already shows. Pure, node-testable.
import { cleanText } from './engine.js';
import { parseJson } from './llm.js';

export const HINT_SYSTEM = 'You suggest what a roleplayer could try next. Reply with exactly one JSON object and nothing else: no prose, no code fences.';
const MAX_HINTS = 4;
const MAX_TEXT = 90;
const MAX_BRIEF = 1200;

const TONES = {
    options: 'Write each as a concrete action in first person, e.g. "I ask Mara about the harbour."',
    nudge: 'Write each as a gentle nudge or open question, e.g. "Mara seems to be waiting for something."',
};

/** Compact facts for the model, built from the perceived view only (never the raw world). */
export function hintBrief(view) {
    const people = view.people.filter(p => !p.isYou).map(p => {
        const bits = [...p.tags, ...p.mind.map(([k, v]) => `${k.toLowerCase()} ${v}`), ...p.learned.map(f => f.t)].filter(Boolean).join('; ');
        return `${p.id}=${p.label}${bits ? `: ${bits}` : ''}`;
    });
    const items = [...view.items.mine, ...view.items.here].map(i => `${i.id}=${i.name} (${i.where})`);
    const exits = view.around.map(a => `${a.id}=${a.name} ${a.minutes}m${a.people.length ? ` [${a.people.join(', ')}]` : ''}`);
    return [
        `PLACE ${view.scene.place} — ${cleanText(view.scene.now || view.scene.atmosphere, 200)}`,
        view.scene.threadRefs.length ? `STIRRING ${view.scene.threadRefs.map(t => `${t.id}=${t.name}`).join('; ')}` : '',
        people.length ? `PEOPLE ${people.join(' | ')}` : '',
        items.length ? `ITEMS ${items.join(', ')}` : '',
        exits.length ? `EXITS ${exits.join(', ')}` : '',
    ].filter(Boolean).join('\n').slice(0, MAX_BRIEF);
}

export function hintPrompt(view, tone = 'options', lastLine = '') {
    return `${hintBrief(view)}
LAST ${cleanText(lastLine, 300) || '(nothing yet)'}
Suggest up to ${MAX_HINTS} things {{user}} could do or try next, grounded only in the facts above: people's wants and what they said, things at hand, places nearby, open threads. ${TONES[tone] ?? TONES.options} Each under ${MAX_TEXT} characters. Never speak, think or decide for {{user}}; these are only ideas.
Return {"hints":[{"text":"…","src":"id of the person, item, place or thread it rests on"}]}`;
}

/** Keep ideas that rest on something {{user}} can actually see; clamp, dedupe, cap. */
export function parseHints(raw, view) {
    let data;
    try { data = parseJson(raw); } catch { return []; }
    const known = new Set([
        ...view.people.filter(p => !p.isYou).map(p => p.id), ...view.items.mine.map(i => i.id), ...view.items.here.map(i => i.id),
        ...view.around.map(a => a.id), ...view.scene.threadRefs.map(t => t.id),
    ]);
    const seen = new Set();
    const out = [];
    for (const h of Array.isArray(data?.hints) ? data.hints : []) {
        const text = cleanText(h?.text, MAX_TEXT);
        const key = text.toLowerCase();
        if (!text || !known.has(String(h?.src ?? '')) || seen.has(key)) continue;
        seen.add(key);
        out.push({ text, src: String(h.src) });
    }
    return out.slice(0, MAX_HINTS);
}
