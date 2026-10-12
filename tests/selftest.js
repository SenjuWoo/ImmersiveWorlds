// node tests/selftest.js — pure-module checks, no SillyTavern needed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    normalizeState, baseWorld, applyPatch, travel, sceneBrief, buildInjection, directorPrompt, bootstrapPrompt,
    cleanText, transcriptOf, timeSlot, advanceClock, currentLocation, presentNpcs, isOpen, slug,
} from '../engine.js';
import { parseJson, isRejection, errorText } from '../llm.js';
import { SENSES, normalizeRoutes, routeOf, shortestPath, capMinutes, worldMinutes, sendNpc, tickTravel } from '../rules.js';

const tests = [];
const t = (name, fn) => tests.push([name, fn]);

function world() {
    return normalizeState({
        worldName: 'Saltmere', genre: 'low fantasy', tone: 'grim', clock: { day: 1, time: '08:30', weather: 'rain' },
        currentLocationId: 'market',
        locations: [
            { id: 'market', name: 'Market Square', type: 'plaza', description: 'Stalls under dripping awnings.', connections: ['docks'] },
            { id: 'docks', name: 'Docks', type: 'harbor', description: 'Tar and gulls.' },
            { id: 'temple', name: 'Old Temple', type: 'shrine' },
        ],
        npcs: [
            { id: 'mara', name: 'Mara', role: 'fishmonger', locationId: 'market', personality: 'Sharp-tongued', routine: { dawn: 'docks', day: 'market', dusk: 'market', night: 'temple' } },
            { id: 'tom', name: 'Old Tom', role: 'beggar', locationId: 'docks' },
        ],
        items: [{ id: 'key', name: 'Rusty Key', locationId: 'market' }],
        quests: [{ name: 'Find the smuggler', status: 'active' }, { name: 'Old debt', status: 'resolved' }],
    });
}

t('normalize keeps routines (v1 dropped them)', () => {
    assert.deepEqual(world().npcs[0].routine, { dawn: 'docks', day: 'market', dusk: 'market', night: 'temple' });
});

t('normalize makes connections symmetric-safe and drops dangling ids', () => {
    const s = normalizeState({ locations: [{ id: 'a', name: 'A', connections: ['b', 'ghost', 'a'] }, { id: 'b', name: 'B' }] });
    assert.deepEqual(s.locations[0].connections, ['b']);
});

t('normalize survives garbage', () => {
    const s = normalizeState({ locations: 'x', npcs: [null, 3, { name: 'X', locationId: 'nowhere' }], clock: { time: 'noon' }, quests: ['Rumor'] });
    assert.equal(s.locations.length, 1);
    assert.equal(s.npcs.length, 1);
    assert.equal(s.npcs[0].locationId, s.currentLocationId);
    assert.equal(s.clock.time, '09:00');
    assert.equal(s.quests[0].name, 'Rumor');
});

t('cleanText strips tags without a DOM and keeps "<3"', () => {
    assert.equal(cleanText('<img src=x onerror=alert(1)>Hi <b>there</b> <3'), 'Hi there <3');
    assert.equal(cleanText('She nods. <!--state [{"type":"xp.add"}]--> Later.'), 'She nods. Later.');
    assert.equal(cleanText('Cut off <!--state [{"ty'), 'Cut off');
});

t('baseWorld seeds from the card', () => {
    const s = baseWorld({ name: 'Iris', scenario: 'A rainy lighthouse', personality: 'Quiet' });
    assert.equal(s.worldName, "Iris's World");
    assert.equal(s.npcs[0].name, 'Iris');
    assert.equal(currentLocation(s).name, 'A rainy lighthouse');
});

t('applyPatch upserts by id and by name, merges connections', () => {
    const s = applyPatch(world(), {
        minutes: 20,
        npcs: [{ id: 'mara', status: 'haggling' }, { name: 'old tom', role: 'informant' }],
        locations: [{ id: 'docks', connections: ['temple'] }],
    });
    assert.equal(s.npcs.find(n => n.id === 'mara').status, 'haggling');
    assert.equal(s.npcs.find(n => n.id === 'tom').role, 'informant');
    assert.deepEqual(new Set(s.locations.find(l => l.id === 'docks').connections), new Set(['market', 'temple']));
    assert.ok(s.locations.find(l => l.id === 'temple').connections.includes('docks'), 'back-link');
    assert.equal(s.clock.time, '08:50');
});

t('applyPatch links a new place to the current scene', () => {
    const s = applyPatch(world(), { locations: [{ id: 'bakery', name: 'Bakery', type: 'shop', description: 'Warm bread.' }] });
    assert.ok(s.locations.find(l => l.id === 'bakery').connections.includes('market'));
    assert.ok(currentLocation(s).connections.includes('bakery'));
});

t('applyPatch respects creation switches', () => {
    const s = applyPatch(world(), { npcs: [{ id: 'new-guy', name: 'New Guy', role: 'x' }], items: [{ name: 'Gem' }] }, { allowNewCharacters: false, allowNewItems: false });
    assert.ok(!s.npcs.some(n => n.id === 'new-guy'));
    assert.ok(!s.items.some(i => i.name === 'Gem'));
});

t('applyPatch accepts v1 keys', () => {
    const s = applyPatch(world(), { time_minutes: 0, new_items: [{ name: 'Lantern' }], quest_updates: [{ name: 'Find the smuggler', status: 'complete' }], current_location_id: 'docks' });
    assert.ok(s.items.some(i => i.name === 'Lantern'));
    assert.equal(s.quests.find(q => q.name === 'Find the smuggler').status, 'complete');
    assert.equal(s.currentLocationId, 'docks');
});

t('a bogus locationId does not teleport anyone', () => {
    const s = applyPatch(world(), { npcs: [{ id: 'tom', locationId: 'atlantis' }] });
    assert.equal(s.npcs.find(n => n.id === 'tom').locationId, 'docks');
});

t('routines fire only when the time of day turns over', () => {
    let s = applyPatch(world(), { minutes: 10 });
    assert.equal(s.npcs[0].locationId, 'market', 'still dawn->day boundary not crossed? 08:40 is dawn, routine says docks but slot unchanged');
    s = applyPatch(s, { minutes: 30 });
    assert.equal(timeSlot(s), 'day');
    assert.equal(s.npcs[0].locationId, 'market');
    s = applyPatch(s, { minutes: 13 * 60 });
    assert.equal(timeSlot(s), 'night');
    assert.equal(s.npcs[0].locationId, 'temple');
});

t('explicit moves in a patch beat the routine', () => {
    const s = applyPatch(world(), { minutes: 14 * 60, npcs: [{ id: 'mara', locationId: 'docks' }] });
    assert.equal(s.npcs[0].locationId, 'docks');
});

t('move_to by name clears the stale ambient line', () => {
    const w = world();
    w.scene.ambient = 'Rain on awnings.';
    const s = applyPatch(w, { move_to: 'Docks' });
    assert.equal(s.currentLocationId, 'docks');
    assert.equal(s.scene.ambient, '');
});

t('applyPatch rejects non-objects', () => {
    assert.throws(() => applyPatch(world(), [1, 2]));
    assert.throws(() => applyPatch(world(), null));
});

t('caps never evict the current scene', () => {
    const w = world();
    for (let i = 0; i < 10; i++) w.npcs.unshift({ id: `x${i}`, name: `X${i}`, locationId: 'docks', role: 'r' });
    const s = applyPatch(normalizeState(w), {}, { maxNpcs: 3 });
    assert.equal(s.npcs.length, 3);
    assert.ok(s.npcs.some(n => n.id === 'mara'));
});

t('travel follows the map and returns a line', () => {
    const s = world();
    assert.match(travel(s, 'Docks'), /Market Square to Docks/);
    assert.equal(s.currentLocationId, 'docks');
    assert.equal(travel(s, 'Docks'), '', 'already there');
    assert.equal(travel(s, 'Nowhere'), '');
});

t('advanceClock rolls days', () => {
    const c = { day: 1, time: '23:50' };
    advanceClock(c, 20);
    assert.deepEqual(c, { day: 2, time: '00:10' });
});

t('scene brief is compact and current', () => {
    const brief = sceneBrief(world());
    assert.match(brief, /Day 1, 08:30 · rain · Market Square \(plaza\)/);
    assert.match(brief, /Here: Mara \(fishmonger\) — Sharp-tongued/);
    assert.match(brief, /Exits: Docks/);
    assert.match(brief, /Stirring: Find the smuggler/);
    assert.ok(!brief.includes('Old debt'), 'closed threads stay out');
    const inj = buildInjection(world(), { strictAgency: true });
    assert.ok(inj.length < 900, `injection is ${inj.length} chars`);
    assert.match(inj, /\{\{user\}\}/);
});

t('director prompt carries ids, exchange and the contract, and stays small', () => {
    const p = directorPrompt(world(), 'User: I look for Tom.\nIris: He went to the docks.', { detail: 'high' });
    for (const s of ['HERE market', 'EXITS docks=Docks', 'mara|Mara|fishmonger|market', 'NEW EXCHANGE', 'Upsert by id', 'at most 2 new']) assert.ok(p.includes(s), s);
    assert.ok(p.length < 3200, `director prompt is ${p.length} chars`);
    assert.match(directorPrompt(world(), '', { allowNewCharacters: false, allowNewItems: false, allowNewLocations: false }), /only by updating existing entries/);
});

t('bootstrap prompt embeds lore', () => {
    assert.match(bootstrapPrompt('Character: Iris', ''), /Character: Iris/);
});

t('transcript is bounded and skips system messages', () => {
    const chat = [{ name: 'A', mes: 'one' }, { is_system: true, mes: 'sys' }, { name: 'B', is_user: true, mes: 'two' }, { name: 'C', mes: 'x'.repeat(5000) }];
    const tr = transcriptOf(chat, 0, 3, { maxChars: 50 });
    assert.ok(!tr.includes('sys'));
    assert.equal(tr.split('\n').length, 3);
    assert.ok(tr.length < 120);
    assert.equal(transcriptOf(chat, 3, 3), `C: ${'x'.repeat(1400)}`);
});

t('helpers', () => {
    assert.ok(isOpen({ status: 'active' }) && !isOpen({ status: 'Failed' }));
    assert.equal(slug('Ça Va!'), 'ca-va');
    assert.equal(presentNpcs(world()).length, 1);
});

t('parseJson tolerates fences and prose', () => {
    assert.deepEqual(parseJson('```json\n{"a":1}\n```'), { a: 1 });
    assert.deepEqual(parseJson('Sure! {"a":{"b":2}} hope that helps'), { a: { b: 2 } });
    assert.throws(() => parseJson(''), /empty/);
    assert.throws(() => parseJson('no json'), /No JSON/);
});

t('error helpers', () => {
    assert.ok(isRejection(new Error('Bad Request')));
    assert.ok(!isRejection(new Error('timed out')));
    assert.match(errorText(new Error('API request failed', { cause: new Error('401') })), /401/);
});

t('manifest version matches index.js', () => {
    const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
    const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
    assert.equal(src.match(/VERSION = '([^']+)'/)[1], manifest.version);
});

t('shared kit files are identical to the copy in Immersive Adventures (when checked out side by side)', () => {
    const sibling = new URL('../../ImmersiveAdventures/', import.meta.url);
    for (const f of ['kit.js', 'llm.js']) {
        let other;
        try { other = readFileSync(new URL(f, sibling), 'utf8'); } catch { return; }
        assert.equal(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'), other, f);
    }
    const kit = css => css.slice(0, css.indexOf('/* ==== end of shared kit ==== */'));
    let otherCss;
    try { otherCss = readFileSync(new URL('style.css', sibling), 'utf8'); } catch { return; }
    assert.equal(kit(readFileSync(new URL('../style.css', import.meta.url), 'utf8')), kit(otherCss), 'style.css kit block');
});

// ---- rules.js: routes, paths, clock, travel ----
function house() {
    const locations = [
        { id: 'hall', name: 'Hall', type: 'hallway', connections: ['living', 'kitchen', 'street'] },
        { id: 'living', name: 'Living Room', type: 'living room', connections: ['hall'] },
        { id: 'kitchen', name: 'Kitchen', type: 'kitchen', connections: ['hall'], routes: { hall: { minutes: 3, sense: 'open' } } },
        { id: 'street', name: 'Street', type: 'street', connections: ['hall', 'market'] },
        { id: 'market', name: 'Market', type: 'market', connections: ['street'] },
        { id: 'island', name: 'Island', type: 'beach', connections: [] },
    ];
    normalizeRoutes(locations);
    return { locations, currentLocationId: 'living', clock: { day: 1, time: '10:00' }, npcs: [] };
}

t('routes are symmetric and typed', () => {
    const s = house();
    const by = id => s.locations.find(l => l.id === id);
    assert.deepEqual(by('hall').routes.kitchen, { minutes: 3, sense: 'open' }, 'the side that had a route wins');
    assert.deepEqual(by('kitchen').routes.hall, { minutes: 3, sense: 'open' });
    assert.deepEqual(by('living').routes.hall, { minutes: 1, sense: 'door' }, 'indoor-indoor');
    assert.deepEqual(by('street').routes.market, { minutes: 10, sense: 'none' }, 'outdoor-outdoor');
    assert.deepEqual(by('hall').routes.street, { minutes: 2, sense: 'door' }, 'mixed');
    assert.deepEqual(by('hall').connections.sort(), ['kitchen', 'living', 'street']);
});

t('unknown sense coerces to door and minutes are clamped', () => {
    const locs = [{ id: 'a', type: 'room', connections: ['b'], routes: { b: { minutes: -5, sense: 'telepathy' } } }, { id: 'b', type: 'room', connections: [] }];
    normalizeRoutes(locs);
    assert.deepEqual(locs[0].routes.b, { minutes: 0, sense: 'door' });
    assert.deepEqual(locs[1].connections, ['a']);
    assert.ok(SENSES.includes('open') && SENSES.includes('none'));
});

t('shortest path sums minutes across hops', () => {
    const s = house();
    assert.deepEqual(shortestPath(s, 'living', 'market'), { path: ['living', 'hall', 'street', 'market'], minutes: 13 });
    assert.deepEqual(routeOf(s, 'hall', 'kitchen'), { minutes: 3, sense: 'open' });
    assert.equal(routeOf(s, 'living', 'market'), null);
});

t('no path returns null (single-location world)', () => {
    const s = house();
    assert.equal(shortestPath(s, 'living', 'island'), null);
    assert.equal(shortestPath({ locations: [{ id: 'x', routes: {}, connections: [] }] }, 'x', 'y'), null);
    assert.deepEqual(shortestPath(s, 'hall', 'hall'), { path: ['hall'], minutes: 0 });
});

t('capMinutes caps 90 normally and 720 with a jump reason', () => {
    assert.equal(capMinutes(30), 30);
    assert.equal(capMinutes(240), 90);
    assert.equal(capMinutes(600, 'sleep'), 600);
    assert.equal(capMinutes(2000, 'wait'), 720);
    assert.equal(capMinutes(240, 'nonsense'), 90);
    assert.equal(capMinutes(-3), 0);
    assert.equal(capMinutes('abc'), 0);
});

t('sendNpc puts far people en route and tickTravel lands them at eta', () => {
    const s = house();
    const tom = { id: 'tom', locationId: 'living', travel: null };
    s.npcs.push(tom);
    assert.equal(worldMinutes(s.clock), 600);
    assert.equal(sendNpc(s, tom, 'market'), 'en-route');
    assert.equal(tom.locationId, 'living');
    assert.deepEqual(tom.travel, { to: 'market', eta: 613 });
    s.clock.time = '10:05';
    assert.deepEqual(tickTravel(s), []);
    s.clock.time = '10:13';
    assert.deepEqual(tickTravel(s), ['tom']);
    assert.equal(tom.locationId, 'market');
    assert.equal(tom.travel, null);
    assert.equal(sendNpc(s, tom, 'island'), 'no-route');
    assert.equal(sendNpc(s, tom, 'market'), 'arrived', 'already there');
});

let failed = 0;
for (const [name, fn] of tests) {
    try { await fn(); console.log(`  ok   ${name}`); } catch (e) { failed++; console.error(`FAIL  ${name}\n      ${e.message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
