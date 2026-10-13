// Weather particles on one fixed canvas: rain, snow, fog and dust. The maths is pure (node-tested);
// the canvas is DOM and only runs while there is weather to show. It never takes clicks.

const MAX = 300;
const FPS = 30;
// Per kind: how a particle is born (speed in px/s, size, alpha). rand() is injected so tests are deterministic.
const BIRTH = {
    rain: r => ({ vx: 60 + r() * 60, vy: 500 + r() * 300, r: 10 + r() * 8, a: 0.25 + r() * 0.25 }),
    snow: r => ({ vx: (r() < 0.5 ? -1 : 1) * (6 + r() * 20), vy: 30 + r() * 50, r: 1 + r() * 2, a: 0.6 + r() * 0.3 }),
    fog: r => ({ vx: 8 + r() * 12, vy: 0, r: 120 + r() * 140, a: 0.04 + r() * 0.04 }),
    dust: r => ({ vx: 15 + r() * 25, vy: (r() - 0.5) * 10, r: 0.8 + r(), a: 0.2 + r() * 0.3 }),
};

/** A fresh field of particles inside w x h. Unknown kinds give none; the count is capped. */
export function makeParticles(kind, count, w, h, rand = Math.random) {
    const born = BIRTH[kind];
    if (!born) return [];
    return Array.from({ length: Math.min(MAX, Math.max(0, count | 0)) }, () => ({ x: rand() * w, y: rand() * h, ...born(rand) }));
}

const wrap = (v, max) => ((v % max) + max) % max;

/** Advance by dt seconds, wrapping around the box. Mutates the list. */
export function stepParticles(list, kind, w, h, dt) {
    for (const p of list) {
        p.x = wrap(p.x + p.vx * dt, w);
        p.y = wrap(p.y + p.vy * dt, h);
    }
}

let canvas = null;
let ctx2d = null;
let list = [];
let current = '';
let raf = 0;
let last = 0;

function resize() {
    if (!canvas) return;
    canvas.width = innerWidth;
    canvas.height = innerHeight;
    list = makeParticles(current.split(':')[0], Number(current.split(':')[1]) || 0, canvas.width, canvas.height);
}

function draw(kind) {
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of list) {
        if (kind === 'rain') {
            ctx2d.strokeStyle = `rgba(185,205,235,${p.a})`;
            ctx2d.lineWidth = 1;
            ctx2d.beginPath();
            ctx2d.moveTo(p.x, p.y);
            ctx2d.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
            ctx2d.stroke();
        } else if (kind === 'fog') {
            const g = ctx2d.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
            g.addColorStop(0, `rgba(205,212,222,${p.a})`);
            g.addColorStop(1, 'rgba(205,212,222,0)');
            ctx2d.fillStyle = g;
            ctx2d.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
        } else {
            ctx2d.fillStyle = kind === 'snow' ? `rgba(255,255,255,${p.a})` : `rgba(235,205,150,${p.a})`;
            ctx2d.beginPath();
            ctx2d.arc(p.x, p.y, p.r, 0, 6.2832);
            ctx2d.fill();
        }
    }
}

function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - last < 1000 / FPS || document.hidden) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const kind = current.split(':')[0];
    stepParticles(list, kind, canvas.width, canvas.height, dt);
    draw(kind);
}

export function stopParticles() {
    cancelAnimationFrame(raf);
    raf = 0;
    removeEventListener('resize', resize);
    canvas?.remove();
    canvas = ctx2d = null;
    list = [];
    current = '';
}

/** Run (or keep running) the given weather; `kind: null` stops. The same spec twice does not restart anything. */
export function startParticles({ kind, count } = {}) {
    if (!kind) return stopParticles();
    const key = `${kind}:${count}`;
    if (key === current && canvas?.isConnected) return;
    current = key;
    if (!canvas?.isConnected) {
        canvas = document.createElement('canvas');
        canvas.id = 'iw-particles';
        canvas.setAttribute('aria-hidden', 'true');
        document.body.append(canvas);
        ctx2d = canvas.getContext('2d');
        addEventListener('resize', resize);
        last = 0;
        raf = requestAnimationFrame(loop);
    }
    resize();
}
