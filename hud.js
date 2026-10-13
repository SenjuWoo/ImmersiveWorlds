// Floating corner HUD in the empty space beside the chat column. DOM only: it draws a senses.perceive() view.
import { escapeHtml } from './kit.js';
import { monogram } from './faces.js';
import { skyOf } from './scenery.js';
import { silhouetteSvg } from './backdrop.js';

const ICONS = [
    [/key/i, 'fa-key'], [/chain|cuff|shackle|rope|leash|collar/i, 'fa-link'], [/weapon|sword|blade|knife|dagger|axe|bow|spear|gun|pistol/i, 'fa-khanda'],
    [/bag|pack|sack|pouch|satchel/i, 'fa-sack-xmark'], [/letter|note|scroll|map|paper|deed/i, 'fa-scroll'], [/book|journal|diary/i, 'fa-book'],
    [/potion|bottle|drink|flask|vial|wine|ale|elixir/i, 'fa-flask'], [/food|bread|meat|fruit|meal|cheese/i, 'fa-drumstick-bite'],
    [/cloth|shirt|dress|coat|cloak|robe|sheet|blanket|boot|glove/i, 'fa-shirt'], [/ring|jewel|necklace|gem|amulet|pendant/i, 'fa-gem'],
    [/coin|money|gold|purse|silver/i, 'fa-coins'], [/tool|hammer|pick|saw|wrench/i, 'fa-screwdriver-wrench'], [/light|lamp|lantern|torch|candle/i, 'fa-fire'],
    [/phone|device|radio/i, 'fa-mobile-screen'],
];
export const KIND_ICON = { like: 'fa-heart', dislike: 'fa-heart-crack', interest: 'fa-star', history: 'fa-scroll', trait: 'fa-masks-theater', bond: 'fa-link', promise: 'fa-handshake', note: 'fa-pen', other: 'fa-circle-info' };
export const iconFor = item => (ICONS.find(([re]) => re.test(`${item.type} ${item.name}`)) ?? [null, 'fa-cube'])[1];

const FULL = 260;
const COMPACT = 120;
const MAX_TILES = 8;
const MAX_NODES = 6;

let root = null;
let handlers = {};
let view = null;
let pinned = '';
let openItem = '';
let openNode = '';
let lastTick = null;
let lastStrip = '';
let ideas = { mode: 'off', tone: 'options', items: [], asked: false, loading: false };
const lastSounds = new Map();
let toastTimer = 0;
const observers = [];

const esc = escapeHtml;

export function mountHud(opts = {}) {
    handlers = opts;
    if (root) return;
    root = document.createElement('div');
    root.id = 'iw-hud';
    root.hidden = true;
    root.innerHTML = `
        <div class="iw-hud-side is-left"><section class="iw-hud-group iw-hud-scene"></section><section class="iw-hud-group iw-hud-items"></section></div>
        <div class="iw-hud-side is-right"><section class="iw-hud-group iw-hud-people"></section><section class="iw-hud-group iw-hud-map"></section></div>
        <div class="iw-hud-toast" role="status" aria-live="polite"></div>`;
    document.body.append(root);
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-iw-person]')) onClick(e); });
    // composedPath, not contains(): our own click handler re-renders, detaching the target before this runs.
    document.addEventListener('click', e => { if (root && !e.composedPath().includes(root) && (openNode || openItem)) { openNode = openItem = ''; draw(); } });
    addEventListener('resize', layout);
    const sheld = document.getElementById('sheld');
    if (sheld && 'ResizeObserver' in window) { const ro = new ResizeObserver(layout); ro.observe(sheld); observers.push(ro); }
    const mo = new MutationObserver(layout);
    for (const el of document.querySelectorAll('.fillLeft, .fillRight')) mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    observers.push(mo);
}

export function unmountHud() {
    observers.splice(0).forEach(o => o.disconnect());
    removeEventListener('resize', layout);
    root?.remove();
    root = null;
}

/** Is a side currently drawn? The host hides its duplicate status strip while the scene side shows. */
export const sideVisible = side => Boolean(root && !root.hidden && root.dataset[side] && root.dataset[side] !== 'hidden');

/** Draw a view, or hide the HUD with `null`. `quiet` suppresses toasts (chat just opened). */
export function renderHud(next, { quiet = false, ideas: nextIdeas } = {}) {
    if (!root) return;
    if (nextIdeas) ideas = nextIdeas;
    const fresh = view === null || quiet;
    view = next;
    root.hidden = !view;
    if (!view) { lastTick = null; lastSounds.clear(); return; }
    if (!view.people.some(p => p.id === pinned)) pinned = '';
    layout();
    draw();
    if (view.tick !== lastTick) {
        if (!fresh) announce();
        lastTick = view.tick;
        for (const a of view.around) lastSounds.set(a.id, a.sound);
    }
}

function layout() {
    if (!root) return;
    const sheld = document.getElementById('sheld')?.getBoundingClientRect();
    const left = sheld ? sheld.left : 0;
    const right = sheld ? innerWidth - sheld.right : 0;
    const covered = side => Boolean(document.querySelector(`.fill${side}.openDrawer, .fill${side}.pinnedOpen`));
    const mode = (gap, side) => covered(side) ? 'hidden' : gap >= FULL ? 'full' : gap >= COMPACT ? 'compact' : 'hidden';
    root.dataset.left = mode(left, 'Left');
    root.dataset.right = mode(right, 'Right');
    root.style.setProperty('--iw-lw', `${Math.max(0, Math.min(360, left - 40))}px`);
    root.style.setProperty('--iw-rw', `${Math.max(0, Math.min(360, right - 40))}px`);
    handlers.onLayout?.();
}

function draw() {
    if (!root || !view) return;
    root.querySelector('.iw-hud-scene').innerHTML = sceneHtml(view.scene);
    root.querySelector('.iw-hud-people').innerHTML = peopleHtml(view.people, view.left);
    const items = [...view.items.mine, ...view.items.here];
    root.querySelector('.iw-hud-items').innerHTML = items.length ? itemsHtml(items) : '';
    root.querySelector('.iw-hud-map').innerHTML = mapHtml(view.scene.place, view.around);
}

// A small sky and skyline of the place you are in; fades in only when the place or the light changes.
function stripHtml(a) {
    if (!a) return '';
    const key = `${a.kind}:${a.slot}`;
    const fresh = key !== lastStrip;
    lastStrip = key;
    const sky = skyOf(a.slot, a.weather);
    return `<div class="iw-hud-strip ${fresh ? 'is-fresh' : ''}" data-kind="${esc(a.kind)}" data-slot="${esc(a.slot)}" style="--iw-sky-top:${sky.top};--iw-sky-bottom:${sky.bottom};--iw-light:${sky.light}" aria-hidden="true">${silhouetteSvg(a.kind)}</div>`;
}

function sceneHtml(s) {
    return `
        ${stripHtml(s.art)}
        <div class="iw-hud-kicker"><i class="fa-solid ${esc(s.icon)}"></i> ${esc(s.kicker)}</div>
        <div class="iw-hud-place" data-iw-hud="panel" title="Open the Living World panel">${esc(s.place)}</div>
        <div class="iw-hud-when">${esc(s.when)}</div>
        <div class="iw-hud-now ${s.now ? '' : 'is-ambient'}">${esc(s.now || s.atmosphere)}</div>
        ${s.threads.length ? `<div class="iw-hud-threads"><span>Stirring</span> · ${s.threads.map(esc).join(' · ')}</div>` : ''}${ideasHtml()}`;
}

function ideasHtml() {
    if (ideas.mode === 'off') return '';
    const asClick = ideas.tone === 'options';
    const list = ideas.loading ? '<div class="iw-hud-meta">Thinking…</div>'
        : ideas.items.length ? `<ul class="iw-hud-ideas-list">${ideas.items.map((h, i) => `<li>${asClick ? `<button type="button" data-iw-use="${i}" title="Put this in your message box">${esc(h.text)}</button>` : esc(h.text)}</li>`).join('')}</ul>`
            : ideas.asked ? '<div class="iw-hud-meta">Nothing new comes to mind.</div>' : '';
    return `<div class="iw-hud-ideas"><button type="button" class="iw-hud-bulb" data-iw-hint title="What could I do next?"><i class="fa-solid fa-lightbulb"></i> Ideas</button>${list}</div>`;
}

// Expression sprite, else avatar, else a generated portrait, else a monogram in the person's own colour: everyone gets a face.
function face(p) {
    const sprite = handlers.spriteUrl?.(p) || '';
    const url = sprite || handlers.avatarUrl?.(p) || handlers.artUrl?.(p) || '';
    if (url) return `<img class="iw-hud-face ${sprite ? 'is-sprite' : ''}" src="${esc(url)}" alt="" loading="lazy">`;
    const m = monogram(p.label);
    return `<span class="iw-hud-face is-mono" style="--iw-hue:${m.hue}" aria-hidden="true">${esc(m.letter)}</span>`;
}

function cardHtml(p) {
    const rows = (title, list) => list.length ? `<div class="iw-hud-sec">${title}</div>${list.map(([k, v]) => `<div class="iw-hud-row"><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('')}` : '';
    const has = p.holding.length ? [['Holding', p.holding.join(', ')]] : [];
    const truth = p.truth?.length ? [['Hidden', p.truth.join(' · ')]] : [];
    const learned = p.learned?.length ? `<div class="iw-hud-sec">Learned</div>${p.learned.map(f => `<div class="iw-hud-fact ${f.fresh ? 'is-fresh' : ''}"><i class="fa-solid ${KIND_ICON[f.k] ?? KIND_ICON.other}"></i><span>${esc(f.t)}</span></div>`).join('')}` : '';
    const edit = p.isYou ? '' : `<div class="iw-hud-edit"><button type="button" data-iw-dossier="${esc(p.id)}"><i class="fa-solid fa-book-open"></i>Dossier</button></div>`;
    const html = rows('Body', p.body) + rows('Mind', p.mind) + rows('Has', has) + learned + rows('Truth', truth);
    return html ? `<div class="iw-hud-card">${html}${edit}</div>` : '';
}

function peopleHtml(people, left) {
    const rows = people.map(p => `
        <div class="iw-hud-person ${p.main ? '' : 'is-bg'} ${p.isNew ? 'is-new' : ''} ${p.isYou ? 'is-you' : ''} ${pinned === p.id ? 'is-open' : ''}" data-iw-person="${esc(p.id)}" tabindex="0">
            <span class="iw-hud-who">
                <span class="iw-hud-name">${esc(p.label)}${p.isYou ? ' <small>you</small>' : ''}</span>
                <span class="iw-hud-tags">${p.tags.map((t, i) => `<span class="iw-hud-tag ${i === 0 && !p.isYou ? 'is-hot' : ''}">${esc(t)}</span>`).join('')}</span>
            </span>
            ${face(p)}
        </div>${cardHtml(p)}`).join('');
    const gone = left.map((p, i) => `
        <div class="iw-hud-person is-gone">
            <span class="iw-hud-who"><span class="iw-hud-name">${esc(p.label)}</span><span class="iw-hud-tags"><span class="iw-hud-tag">left${p.toward ? ` · toward ${esc(p.toward)}` : ''}</span></span></span>${face({ ...p, id: `left-${i}` })}
        </div>`).join('');
    return rows + gone;
}

function itemsHtml(items) {
    const shown = items.slice(0, MAX_TILES);
    const detail = openItem && shown.find(i => i.id === openItem);
    return `
        <div class="iw-hud-label">Here &amp; on you</div>
        <div class="iw-hud-tray">${shown.map(i => `
            <button type="button" class="iw-hud-item ${i.where === 'in your hand' ? 'is-hot' : ''} ${openItem === i.id ? 'is-open' : ''}" data-iw-item="${esc(i.id)}" title="${esc(i.name)}">
                <i class="fa-solid ${iconFor(i)}"></i><span>${esc(i.name)}</span><small>${esc(i.where)}</small>
            </button>`).join('')}${items.length > MAX_TILES ? `<span class="iw-hud-more">+${items.length - MAX_TILES}</span>` : ''}</div>
        ${detail ? `<div class="iw-hud-card iw-hud-itemcard"><b>${esc(detail.name)}</b><span class="iw-hud-meta">${esc(detail.type)} · ${esc(detail.where)}</span>${(() => { const d = handlers.describeItem?.(detail.id); return d ? `<p>${esc(d)}</p>` : ''; })()}</div>` : ''}`;
}

function statusOf(a) {
    if (a.people.length) return a.people.length > 2 ? `${a.people.slice(0, 2).join(', ')} +${a.people.length - 2}` : a.people.join(', ');
    if (a.sound) return `“${a.sound}”`;
    if (a.seen) return 'empty';
    return a.sense === 'door' ? 'quiet' : 'can’t see in';
}

function mapHtml(place, around) {
    const nodes = around.slice(0, MAX_NODES);
    const W = 320, H = 240, cx = W / 2, cy = H / 2, rx = 112, ry = 86;
    const pos = nodes.map((_, i) => {
        const a = (-90 + (i * 360) / nodes.length) * (Math.PI / 180);
        return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
    });
    const pct = ([x, y]) => `left:${(x / W) * 100}%;top:${(y / H) * 100}%`;
    const lines = nodes.map((n, i) => `<line x1="${cx}" y1="${cy}" x2="${pos[i][0]}" y2="${pos[i][1]}" class="is-${n.sense}"/>`).join('');
    const mins = nodes.map((n, i) => `<span class="iw-hud-mins" style="${pct([cx + (pos[i][0] - cx) * 0.42, cy + (pos[i][1] - cy) * 0.42])}">${n.minutes}m</span>`).join('');
    const menu = n => openNode === n.id ? `<span class="iw-hud-menu">
            <button type="button" data-iw-go="${esc(n.id)}"><i class="fa-solid fa-person-walking"></i>Go · ${n.minutes} min</button>
            ${n.sense === 'door' && !n.people.length ? `<button type="button" data-iw-peek="${esc(n.id)}"><i class="fa-solid fa-eye"></i>Peek</button>` : ''}
        </span>` : '';
    return `
        <div class="iw-hud-label">Around you</div>
        <div class="iw-hud-graph">
            <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>${mins}
            <span class="iw-hud-node is-here" style="${pct([cx, cy])}"><i></i><b>${esc(place)}</b></span>
            ${nodes.map((n, i) => `<span class="iw-hud-node ${n.sense === 'none' && !n.people.length ? 'is-fog' : ''} ${openNode === n.id ? 'is-open' : ''}" style="${pct(pos[i])}" data-iw-node="${esc(n.id)}" tabindex="0" role="button">
                <i></i><b>${esc(n.name)}</b><small>${esc(statusOf(n))}</small>${menu(n)}</span>`).join('')}
            ${around.length > MAX_NODES ? `<span class="iw-hud-more iw-hud-more-map">+${around.length - MAX_NODES} more</span>` : ''}
            ${!around.length ? '<span class="iw-hud-meta iw-hud-empty">No paths charted yet.</span>' : ''}
        </div>`;
}

function onClick(e) {
    const t = e.target;
    const go = t.closest('[data-iw-go]');
    if (go) { openNode = ''; return handlers.onGo?.(go.dataset.iwGo); }
    if (t.closest('[data-iw-hint]')) return handlers.onHint?.();
    const use = t.closest('[data-iw-use]');
    if (use) return handlers.onUseHint?.(ideas.items[Number(use.dataset.iwUse)]?.text ?? '');
    const dos = t.closest('[data-iw-dossier]');
    if (dos) return handlers.onDossier?.(dos.dataset.iwDossier);
    const pk = t.closest('[data-iw-peek]');
    if (pk) { openNode = ''; return handlers.onPeek?.(pk.dataset.iwPeek); }
    const node = t.closest('[data-iw-node]');
    if (node) { openNode = openNode === node.dataset.iwNode ? '' : node.dataset.iwNode; openItem = ''; return draw(); }
    const item = t.closest('[data-iw-item]');
    if (item) { openItem = openItem === item.dataset.iwItem ? '' : item.dataset.iwItem; openNode = ''; return draw(); }
    const person = t.closest('[data-iw-person]');
    if (person) { pinned = pinned === person.dataset.iwPerson ? '' : person.dataset.iwPerson; return draw(); }
    if (t.closest('[data-iw-hud="panel"]')) handlers.onOpenPanel?.();
}

function announce() {
    const lines = [];
    const arrived = view.people.filter(p => p.isNew).map(p => p.label);
    if (arrived.length) lines.push(`${arrived.join(', ').replace(/^./, ch => ch.toUpperCase())} ${arrived.length > 1 ? 'arrive' : 'arrives'}.`);
    for (const a of view.around) if (a.sound && a.sound !== 'voices' && a.sound !== 'someone moving about' && lastSounds.get(a.id) !== a.sound) lines.push(`From ${a.name}: ${a.sound}`);
    if (view.fresh?.length) lines.push(`Learned something about ${view.fresh.slice(0, 2).join(' and ')}.`);
    if (!lines.length) return;
    const toast = root.querySelector('.iw-hud-toast');
    toast.textContent = lines.slice(0, 2).join(' ');
    toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-on'), 6000);
}
