// Immersive UI kit, shared verbatim by Immersive Worlds and Immersive Adventures so both look and
// behave alike. Native SillyTavern chrome only: a MovingUI panel, the wand menu, theme variables.
import { dragElement } from '../../../RossAscends-mods.js';
import { loadMovingUIState } from '../../../power-user.js';

export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c]);
}

export const isPanelOpen = id => Boolean(document.getElementById(id));

/**
 * Open (or return) a draggable panel in #movingDivs.
 * @param {{id:string, icon:string, title:string, tabs:{id:string,icon:string,label:string}[], onTab:(id:string)=>void, onClose?:()=>void}} o
 * @returns {HTMLElement}
 */
export function openPanel({ id, icon, title, tabs, onTab, onClose }) {
    const existing = document.getElementById(id);
    if (existing) return existing;
    const panel = document.createElement('div');
    panel.id = id;
    panel.className = 'draggable imx-panel';
    panel.innerHTML = `
        <div class="panelControlBar flex-container">
            <div id="${id}header" class="fa-fw fa-solid fa-grip drag-grabber hoverglow" title="Drag"></div>
            <div class="fa-fw fa-solid fa-circle-xmark hoverglow dragClose" title="Close" data-imx-close></div>
        </div>
        <header class="imx-head"><i class="fa-solid ${icon}" aria-hidden="true"></i><div><b class="imx-title">${escapeHtml(title)}</b><small class="imx-sub"></small></div></header>
        <nav class="imx-tabs" role="tablist">${tabs.map(t => `<button type="button" role="tab" class="imx-tab" data-tab="${t.id}" title="${escapeHtml(t.label)}"><i class="fa-solid ${t.icon}" aria-hidden="true"></i><span>${escapeHtml(t.label)}</span></button>`).join('')}</nav>
        <div class="imx-body" role="tabpanel"></div>`;
    (document.getElementById('movingDivs') || document.body).append(panel);
    panel.querySelector('[data-imx-close]').addEventListener('click', () => { panel.remove(); onClose?.(); });
    panel.querySelector('.imx-tabs').addEventListener('click', e => {
        const tab = e.target.closest('.imx-tab');
        if (tab) onTab(tab.dataset.tab);
    });
    panel.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !e.target.closest('input, textarea, select')) { panel.remove(); onClose?.(); }
    });
    loadMovingUIState();
    dragElement($(panel));
    return panel;
}

export function closePanel(id) {
    document.getElementById(id)?.remove();
}

/** Fill a panel: header subtitle, active tab, body HTML. */
export function paintPanel(panel, { tab, subtitle = '', busy = false, html }) {
    const sub = panel.querySelector('.imx-sub');
    sub.textContent = subtitle;
    sub.classList.toggle('busy', busy);
    for (const b of panel.querySelectorAll('.imx-tab')) {
        b.classList.toggle('active', b.dataset.tab === tab);
        b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    }
    const body = panel.querySelector('.imx-body');
    const scroll = body.dataset.tab === tab ? body.scrollTop : 0;
    body.dataset.tab = tab;
    body.innerHTML = html;
    body.scrollTop = scroll;
    return body;
}

/** This extension's slot in the shared status strip above the chat input. */
export function statusSlot(owner) {
    let bar = document.getElementById('imx-status');
    if (!bar) {
        const form = document.getElementById('send_form');
        if (!form) return null;
        bar = document.createElement('div');
        bar.id = 'imx-status';
        form.prepend(bar);
    }
    let slot = bar.querySelector(`[data-imx-owner="${owner}"]`);
    if (!slot) {
        slot = document.createElement('div');
        slot.className = 'imx-slot';
        slot.dataset.imxOwner = owner;
        bar.append(slot);
    }
    return slot;
}

/** One entry in the extensions (wand) menu. */
export function addWandItem({ id, icon, label, onClick }) {
    const menu = document.getElementById('extensionsMenu');
    if (!menu || document.getElementById(id)) return;
    const item = document.createElement('div');
    item.id = id;
    item.className = 'list-group-item flex-container flexGap5 interactable';
    item.tabIndex = 0;
    item.innerHTML = `<div class="fa-solid ${icon} extensionsMenuExtensionButton"></div><span>${escapeHtml(label)}</span>`;
    item.addEventListener('click', onClick);
    menu.append(item);
}

/** A themed meter (0..1). */
export function meter(value, max, cls = '') {
    const pct = Math.max(0, Math.min(100, Math.round((Number(value) / Math.max(1, Number(max))) * 100)));
    return `<span class="imx-meter ${cls} ${pct <= 25 ? 'low' : ''}" role="meter" aria-valuemin="0" aria-valuemax="${Number(max)}" aria-valuenow="${Number(value)}"><i style="width:${pct}%"></i></span>`;
}

export const empty = text => `<div class="imx-empty">${escapeHtml(text)}</div>`;
