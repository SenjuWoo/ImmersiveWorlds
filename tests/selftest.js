// node tests/selftest.js — pure-module checks, no SillyTavern needed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    normalizeState, baseWorld, applyPatch, travel, sceneBrief, buildInjection, directorPrompt, bootstrapPrompt,
    cleanText, transcriptOf, timeSlot, weatherClass, advanceClock, currentLocation, presentNpcs, isOpen, slug,
} from '../engine.js';
import { parseJson, isRejection, errorText } from '../llm.js';
import { hintBrief, hintPrompt, parseHints } from '../hints.js';
import { monogram, pickSprite, spriteFolder } from '../faces.js';
import { addLearned, normNotes, mergedFacts, hideFact, addNote, removeNote, factKey } from '../dossier.js';
import { parseModels, modelOptions, withLadder, friendlyOpenRouterError, migrateModelMode, RECOMMENDED } from '../models.js';
import { placeKind, artSlot, skyOf, particleSpec, weatherKind, PLACE_KINDS } from '../scenery.js';
import { migrateBackdrop, silhouetteSvg, pictureKey, gradeOf, sanitizeBackdrop } from '../backdrop.js';
import { makeParticles, stepParticles } from '../particles.js';
import { normArt, artKey, getArt, putArt, dropArt, clearArt, artCount, clampCap, placePrompt, portraitPrompt, itemPrompt, itemBrief, ArtQueue, isImagePath } from '../art.js';
import { perceive, markPerceived, peek, labelOf, withArticle } from '../senses.js';
import { SENSES, normalizeRoutes, routeOf, shortestPath, capMinutes, worldMinutes, sendNpc, tickTravel, movementHint } from '../rules.js';

const tests = [];
const t = (name, fn) => tests.push([name, fn]);

function world() {
    return normalizeState({
        worldName: 'Saltmere', genre: 'low fantasy', tone: 'grim', clock: { day: 1, time: '08:30', weather: 'rain' },
        currentLocationId: 'market',
        locations: [
            { id: 'market', name: 'Market Square', type: 'plaza', description: 'Stalls under dripping awnings.', connections: ['docks'] },
            { id: 'docks', name: 'Docks', type: 'harbor', description: 'Tar and gulls.' },
            { id: 'temple', name: 'Old Temple', type: 'shrine', connections: ['docks'] },
        ],
        npcs: [
            { id: 'mara', name: 'Mara', role: 'fishmonger', locationId: 'market', main: true, personality: 'Sharp-tongued', routine: { dawn: 'docks', day: 'market', dusk: 'market', night: 'temple' } },
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
    s = applyPatch(s, { minutes: 13 * 60, jump: 'wait' });
    assert.equal(timeSlot(s), 'night');
    assert.equal(s.npcs[0].travel?.to, 'temple', 'night routine starts a walk');
    s = applyPatch(s, { minutes: 15 });
    assert.equal(s.npcs[0].locationId, 'temple');
});

t('explicit moves in a patch beat the routine', () => {
    const s = applyPatch(world(), { minutes: 600, jump: 'wait', npcs: [{ id: 'mara', locationId: 'docks' }] });
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
    assert.ok(p.length < 3600, `director prompt is ${p.length} chars`);
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
    assert.ok(isRejection(new Error('No usable OpenRouter API key in SillyTavern.')), 'a key problem pauses the director instead of toasting every reply');
    assert.ok(isRejection(new Error('OpenRouter did not accept the request: usually a missing key')));
    assert.match(errorText(new Error('API request failed', { cause: new Error('401') })), /401/);
});

t('manifest version matches index.js', () => {
    const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
    const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
    assert.equal(src.match(/VERSION = '([^']+)'/)[1], manifest.version);
});

t('shared kit files are identical to the copy in Immersive Adventures (when checked out side by side)', () => {
    const read = url => readFileSync(url, 'utf8').replace(/\r\n/g, '\n'); // git autocrlf may differ per checkout
    const sibling = new URL('../../ImmersiveAdventures/', import.meta.url);
    for (const f of ['kit.js', 'llm.js', 'models.js']) {
        let other;
        try { other = read(new URL(f, sibling)); } catch { return; }
        assert.equal(read(new URL(`../${f}`, import.meta.url)), other, f);
    }
    const kit = css => css.slice(0, css.indexOf('/* ==== end of shared kit ==== */'));
    let otherCss;
    try { otherCss = read(new URL('style.css', sibling)); } catch { return; }
    assert.equal(kit(read(new URL('../style.css', import.meta.url))), kit(otherCss), 'style.css kit block');
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

// ---- engine v3: logical patching ----
function island(s) {
    s.locations.push({ id: 'island', name: 'Far Island', type: 'beach', connections: [], routes: {}, discovered: false, visited: false, sound: '', soundTick: 0, description: '', danger: 'unknown' });
    return s;
}

t('v2 world migrates to the current schema silently', () => {
    const v2 = { version: 2, worldName: 'Old', locations: [{ id: 'a', name: 'A', type: 'room', connections: ['b'] }, { id: 'b', name: 'B', type: 'room' }], currentLocationId: 'a', npcs: [{ id: 'x', name: 'X', locationId: 'b' }] };
    const s = normalizeState(v2);
    assert.equal(s.version, 4);
    assert.deepEqual(s.locations[0].routes, { b: { minutes: 1, sense: 'door' } });
    assert.equal(s.locations[0].visited, true, 'the current place counts as visited');
    const x = s.npcs[0];
    assert.ok(x.known && x.nameKnown, 'people shown by name in 2.0 stay known');
    assert.deepEqual(x.body, { restraints: '', wearing: '', position: '', condition: '' });
    assert.deepEqual(x.mind, { mood: '', wants: '', toward: '' });
    assert.deepEqual([x.holding, x.tags, x.travel], [[], [], null]);
    assert.deepEqual(s.scene, { ambient: '', now: '', arrived: [], left: [], note: '', peeked: [], fresh: [], moved: false });
    assert.deepEqual(s.player.holding, []);
    assert.deepEqual(s.meta.rejected, []);
});

t('people generated for a v3 world start unknown unless already met', () => {
    const s = normalizeState({ version: 3, locations: [{ id: 'a', name: 'A' }], npcs: [{ name: 'Stranger' }, { name: 'Friend', known: true, nameKnown: true }] });
    assert.deepEqual(s.npcs.map(n => [n.known, n.nameKnown]), [[false, false], [true, true]]);
    const card = baseWorld({ name: 'Iris' });
    assert.ok(card.npcs[0].known && card.npcs[0].nameKnown, 'the card character is known by name');
});

t('move_to an unconnected place walks the path and charges its time', () => {
    const s = applyPatch(world(), { move_to: 'temple' });
    assert.equal(s.currentLocationId, 'temple');
    assert.equal(s.clock.time, '08:42', 'market to docks 10 min + docks to temple 2 min');
    assert.ok(s.locations.find(l => l.id === 'docks').visited, 'places on the way are visited');
});

t('unreachable move_to is rejected and logged', () => {
    const s = applyPatch(island(world()), { move_to: 'island', minutes: 5 });
    assert.equal(s.currentLocationId, 'market');
    assert.equal(s.clock.time, '08:35');
    assert.match(s.meta.rejected.join(' '), /Far Island/);
    assert.match(applyPatch(world(), { move_to: 'atlantis' }).meta.rejected.join(' '), /atlantis/);
});

t('director minutes are capped unless a jump is named', () => {
    assert.equal(applyPatch(world(), { minutes: 240 }).clock.time, '10:00');
    assert.equal(applyPatch(world(), { minutes: 600, jump: 'sleep' }).clock.time, '18:30');
});

t('a new item elsewhere is pulled into the scene', () => {
    const s = applyPatch(world(), { items: [{ name: 'Gem', locationId: 'docks' }, { name: 'Coin', ownerId: 'player' }, { name: 'Pipe', ownerId: 'tom' }] });
    const by = n => s.items.find(i => i.name === n);
    assert.equal(by('Gem').locationId, 'market');
    assert.deepEqual([by('Coin').ownerId, by('Coin').locationId], ['player', '']);
    assert.deepEqual([by('Pipe').ownerId, by('Pipe').locationId], ['', 'market'], 'Tom is not here to own it');
});

t('a mentioned person may live at an existing place', () => {
    const s = applyPatch(world(), { npcs: [{ id: 'perrin', name: 'Perrin', role: 'ferryman', locationId: 'docks', nameKnown: true }, { name: 'Walk-in', role: 'courier' }] });
    const p = s.npcs.find(n => n.id === 'perrin');
    assert.deepEqual([p.locationId, p.known, p.nameKnown], ['docks', true, true]);
    assert.equal(s.npcs.find(n => n.name === 'Walk-in').locationId, 'market');
});

t('state fields only stick for people here', () => {
    const s = applyPatch(world(), { npcs: [{ id: 'mara', body: { wearing: 'apron', restraints: 'none' }, mind: { mood: 'brisk' }, tags: ['haggling', 'brisk', 'wet', 'extra'], holding: ['knife'] }, { id: 'tom', body: { wearing: 'rags' } }] });
    const mara = s.npcs.find(n => n.id === 'mara');
    assert.equal(mara.body.wearing, 'apron');
    assert.equal(mara.mind.mood, 'brisk');
    assert.deepEqual(mara.tags, ['haggling', 'brisk', 'wet']);
    assert.deepEqual(mara.holding, ['knife']);
    assert.equal(s.npcs.find(n => n.id === 'tom').body.wearing, '');
});

t('you, sounds and the right-now line', () => {
    const s = normalizeState({ locations: [{ id: 'hall', name: 'Hall', type: 'hallway', connections: ['kitchen', 'street'] }, { id: 'kitchen', name: 'Kitchen', type: 'kitchen' }, { id: 'street', name: 'Street', type: 'street' }], currentLocationId: 'hall' });
    const n = applyPatch(s, { you: { holding: ['key'], wearing: 'coat', mood: 'scared' }, sounds: { kitchen: 'pans clattering', street: 'cart wheels', nowhere: 'x' }, now: 'Someone is cooking.' });
    assert.deepEqual(n.player.holding, ['key']);
    assert.equal(n.player.body.wearing, 'coat');
    assert.ok(!('mood' in n.player.body), 'no feelings for the user');
    const k = n.locations.find(l => l.id === 'kitchen');
    assert.deepEqual([k.sound, k.soundTick], ['pans clattering', n.meta.tick]);
    assert.equal(n.locations.find(l => l.id === 'street').sound, 'cart wheels', 'hall to street is a door too (mixed)');
    assert.equal(n.scene.now, 'Someone is cooking.');
});

t('arrivals and departures are recorded with direction', () => {
    let s = applyPatch(world(), { minutes: 15, npcs: [{ id: 'tom', locationId: 'market' }] });
    assert.deepEqual(s.scene.arrived, ['tom']);
    s = applyPatch(s, { npcs: [{ id: 'mara', locationId: 'temple' }] });
    assert.deepEqual(s.scene.left, [{ id: 'mara', toward: 'temple' }]);
    assert.ok(!presentNpcs(s).some(n => n.id === 'mara'), 'on the road, not in the room');
    assert.equal(s.npcs.find(n => n.id === 'mara').travel.to, 'temple');
    s = applyPatch(s, { move_to: 'docks' });
    assert.deepEqual([s.scene.arrived, s.scene.left], [[], []], 'a new scene has no arrivals');
});

t('travel refuses without a route and charges route time', () => {
    const s = island(world());
    assert.equal(travel(s, 'Far Island'), '');
    assert.match(travel(s, 'Docks'), /Market Square to Docks \(10 min\)/);
    assert.equal(s.clock.time, '08:40');
    assert.match(s.scene.note, /Docks/);
    assert.ok(s.locations.find(l => l.id === 'docks').visited);
});

// ---- senses.js: what the user's character perceives ----
function flat() {
    return normalizeState({
        version: 3, worldName: 'Flat', clock: { day: 2, time: '07:44', weather: 'fog' }, currentLocationId: 'living',
        locations: [
            { id: 'living', name: 'Living Room', type: 'living room', connections: ['kitchen', 'hall', 'garden'], routes: { kitchen: { minutes: 1, sense: 'door' }, hall: { minutes: 1, sense: 'open' }, garden: { minutes: 2, sense: 'none' } } },
            { id: 'kitchen', name: 'Kitchen', type: 'kitchen' },
            { id: 'hall', name: 'Hall', type: 'hallway', connections: ['attic'] },
            { id: 'garden', name: 'Garden', type: 'garden' },
            { id: 'attic', name: 'Attic', type: 'attic', discovered: false },
        ],
        npcs: [
            { id: 'fern', name: 'Fern', role: 'ranger', locationId: 'living', main: true, known: true, nameKnown: true, tags: ['cuffed', 'humiliated'], body: { restraints: 'cuffed behind her back', wearing: 'a sheet' }, mind: { mood: 'flat-faced' }, secrets: ['she set this up'] },
            { id: 'guard', name: 'Hal', role: 'dock guard', locationId: 'living' },
            { id: 'cook', name: 'Marta', role: 'cook', locationId: 'kitchen' },
            { id: 'kid', name: 'Pip', role: 'courier', locationId: 'kitchen' },
            { id: 'butler', name: 'Jeeves', role: 'butler', locationId: 'hall' },
            { id: 'gardener', name: 'Old Sam', role: 'gardener', locationId: 'garden' },
        ],
        items: [{ id: 'key', name: 'Cuff key', type: 'key', ownerId: 'player' }, { id: 'bag', name: 'Saddlebag', type: 'bag', locationId: 'living' }, { id: 'bow', name: 'Bow', type: 'weapon', ownerId: 'fern' }],
        player: { holding: ['Cuff key'] },
        scene: { now: 'Fern is stuck.', left: [{ id: 'gardener', toward: 'garden' }] },
    });
}

t('door neighbours are heard, not seen', () => {
    const v = perceive(flat(), 'senses');
    const k = v.around.find(a => a.id === 'kitchen');
    assert.deepEqual([k.people, k.sound, k.sense, k.minutes], [[], 'voices', 'door', 1]);
    const s = flat();
    s.locations.find(l => l.id === 'kitchen').sound = 'pans clattering';
    s.locations.find(l => l.id === 'kitchen').soundTick = s.meta.tick;
    assert.equal(perceive(s, 'senses').around.find(a => a.id === 'kitchen').sound, 'pans clattering');
});

t('open neighbours are seen; walls give nothing; unknown places are not drawn', () => {
    const v = perceive(flat(), 'senses');
    assert.deepEqual(v.around.find(a => a.id === 'hall').people, ['a butler']);
    const g = v.around.find(a => a.id === 'garden');
    assert.deepEqual([g.people, g.sound], [[], '']);
    assert.ok(!v.around.some(a => a.id === 'attic'));
});

t('nearby and all modes widen the view', () => {
    assert.deepEqual(perceive(flat(), 'nearby').around.find(a => a.id === 'kitchen').people, ['a cook', 'a courier']);
    assert.equal(perceive(flat(), 'senses').around.find(a => a.id === 'garden').seen, false, 'a wall hides the garden');
    assert.equal(perceive(flat(), 'nearby').around.find(a => a.id === 'garden').seen, true, 'nearby mode sees into it');
    const all = perceive(flat(), 'all');
    assert.deepEqual(all.around.find(a => a.id === 'kitchen').people, ['Marta', 'Pip']);
    assert.deepEqual(all.people.find(p => p.id === 'fern').truth, ['she set this up']);
});

t('unnamed people are labelled by role, never by name, in senses mode', () => {
    const v = perceive(flat(), 'senses', { userName: 'Alex' });
    assert.deepEqual(v.people.map(p => p.label), ['Fern', 'Alex', 'a dock guard']);
    assert.ok(v.people[1].isYou);
    assert.deepEqual(v.left, [{ label: 'a gardener', toward: 'Garden' }]);
    assert.ok(!/\bHal\b|Old Sam/.test(JSON.stringify(v)), 'no unspoken names anywhere');
    assert.equal(labelOf({ name: 'X', role: '' }, 'senses'), 'a stranger');
    assert.equal(withArticle('envoy'), 'an envoy');
});

t('secrets only in all mode; state and items are shaped for the HUD', () => {
    const v = perceive(flat(), 'senses');
    const fern = v.people.find(p => p.id === 'fern');
    assert.equal(fern.secrets, undefined);
    assert.deepEqual(fern.body, [['Restraints', 'cuffed behind her back'], ['Wearing', 'a sheet']]);
    assert.deepEqual(fern.mind, [['Mood', 'flat-faced']]);
    assert.deepEqual(v.items.mine, [{ id: 'key', name: 'Cuff key', type: 'key', where: 'in your hand' }]);
    assert.deepEqual(v.items.here.map(i => [i.name, i.where]), [['Saddlebag', 'here'], ['Bow', 'with Fern']]);
    assert.deepEqual([v.scene.place, v.scene.kicker, v.scene.now], ['Living Room', 'Day 2 · Dawn', 'Fern is stuck.']);
});

t('markPerceived knows who is here and who is in plain sight', () => {
    const s = flat();
    markPerceived(s);
    const by = id => s.npcs.find(n => n.id === id);
    assert.ok(by('guard').known && !by('guard').nameKnown);
    assert.ok(by('butler').known, 'open hall');
    assert.ok(!by('cook').known, 'behind a door');
    assert.equal(by('guard').seenTick, s.meta.tick);
});

t('peek reveals a door room and costs a minute', () => {
    const s = flat();
    assert.equal(peek(s, 'garden'), '', 'a wall cannot be peeked through');
    assert.match(peek(s, 'kitchen'), /Kitchen/);
    assert.equal(s.clock.time, '07:45');
    assert.ok(s.npcs.find(n => n.id === 'cook').known);
    assert.deepEqual(perceive(s, 'senses').around.find(a => a.id === 'kitchen').people, ['a cook', 'a courier']);
    assert.match(s.scene.note, /peeks into Kitchen/);
});

t('a single-location world perceives without throwing', () => {
    const v = perceive(baseWorld({ name: 'Iris' }), 'senses', { userName: 'Alex' });
    assert.deepEqual(v.around, []);
    assert.deepEqual(v.people.map(p => p.label), ['Iris', 'Alex']);
});

// ---- prompts: facts for the narrator, sheets for the director ----
t('brief carries visible state, exits with minutes, sounds and the note', () => {
    const s = flat();
    s.locations.find(l => l.id === 'kitchen').sound = 'pans clattering';
    s.locations.find(l => l.id === 'kitchen').soundTick = s.meta.tick;
    s.player.body.wearing = 'a wet coat';
    s.scene.note = '{{user}} quietly peeks into Kitchen.';
    const b = sceneBrief(s);
    assert.match(b, /Here: Fern \(ranger\) — cuffed, humiliated/);
    assert.match(b, /Hal \(dock guard; name unknown to \{\{user\}\}\)/);
    assert.match(b, /\{\{user\}\}: wearing a wet coat; holding Cuff key/);
    assert.match(b, /Exits: Kitchen 1m, Hall 1m, Garden 2m/);
    assert.match(b, /Heard: Kitchen — pans clattering/);
    assert.match(b, /Note: \{\{user\}\} quietly peeks into Kitchen\./);
    assert.ok(!b.includes('she set this up'), 'secrets are behaviour, not facts to recite');
});

t('brief stays under 800 characters', () => {
    for (const s of [world(), flat()]) {
        const inj = buildInjection(s, { strictAgency: true });
        assert.ok(inj.length < 800, `injection is ${inj.length} chars`);
    }
});

t('director carries routes, state and sheets and stays under 3750', () => {
    const s = flat();
    const sheet = 'x'.repeat(400);
    const p = directorPrompt(s, 'Alex: I pick up the key.\nFern: Two clicks.', { detail: 'high' }, { fern: sheet, you: 'Alex, a nervous courier.' });
    for (const x of ['EXITS kitchen=Kitchen 1m door', 'hall=Hall 1m open', 'STATE fern: cuffed, humiliated | restraints cuffed behind her back', 'SHEETS', 'fern: xxx', 'you: Alex, a nervous courier.', '"sounds"', '"jump"', '"now"', '"you"', '"body"', 'only for people HERE', 'Sheets win']) assert.ok(p.includes(x), x);
    assert.ok(!p.includes('x'.repeat(241)), 'sheets are capped at 240 chars');
    assert.ok(p.length < 3750, `director prompt is ${p.length} chars`);
});


t('threads stay off the HUD until the story touches them', () => {
    const s = normalizeState({ version: 3, locations: [{ id: 'a', name: 'A' }], quests: [{ name: 'The ferryman stole the fund' }], events: [{ name: 'Smoke on the hill', known: true }] });
    assert.equal(s.quests[0].known, false);
    assert.deepEqual(perceive(s, 'senses').scene.threads, ['Smoke on the hill']);
    assert.deepEqual(perceive(s, 'all').scene.threads, ['Smoke on the hill', 'The ferryman stole the fund']);
    const n = applyPatch(s, { quests: [{ name: 'A new lead' }, { name: 'The ferryman stole the fund', status: 'active' }] });
    assert.deepEqual(perceive(n, 'senses').scene.threads, ['Smoke on the hill', 'The ferryman stole the fund', 'A new lead']);
    assert.ok(normalizeState({ quests: ['Old v2 quest'] }).quests[0].known, 'v2 threads were already shown');
});

// ---- 2.2: main vs background people, perception layer, agency over moves ----
t('card characters are main; everyone else is background', () => {
    const s = normalizeState({ version: 3, locations: [{ id: 'a', name: 'A' }], npcs: [{ name: 'Card', materializedAvatar: 'card.png' }, { name: 'Extra' }, { name: 'Flagged', main: true }] });
    assert.deepEqual(s.npcs.map(n => n.main), [true, false, true]);
    assert.equal(baseWorld({ name: 'Iris', avatar: 'iris.png' }).npcs[0].main, true);
});

t('background people take tags only; main people take state and a hidden truth', () => {
    const w = world();
    w.npcs.find(n => n.id === 'mara').main = true;
    w.npcs.push({ id: 'kid', name: 'Kid', role: 'urchin', locationId: 'market' });
    const s = applyPatch(normalizeState(w), { npcs: [
        { id: 'mara', tags: ['smiling'], body: { wearing: 'apron' }, mind: { wants: 'a sale?' }, hidden: 'is skimming the guild tithe' },
        { id: 'kid', tags: ['begging', 'barefoot'], body: { wearing: 'rags' }, mind: { mood: 'sly' }, holding: ['coin'], hidden: 'a pickpocket' },
    ] });
    const by = id => s.npcs.find(n => n.id === id);
    assert.deepEqual([by('mara').body.wearing, by('mara').mind.wants, by('mara').hidden], ['apron', 'a sale?', 'is skimming the guild tithe']);
    assert.deepEqual(by('kid').tags, ['begging', 'barefoot']);
    assert.deepEqual([by('kid').body.wearing, by('kid').mind.mood, by('kid').holding, by('kid').hidden], ['', '', [], '']);
});

t('the director cannot move the user right after they chose where to go', () => {
    const s = world();
    travel(s, 'Docks');
    assert.ok(s.scene.moved);
    const n = applyPatch(s, { move_to: 'market', minutes: 5 });
    assert.equal(n.currentLocationId, 'docks');
    assert.match(n.meta.rejected.join(' '), /chose/);
    assert.equal(n.scene.moved, false, 'the guard lasts one pass');
    assert.equal(applyPatch(n, { move_to: 'market' }).currentLocationId, 'market');
});

t('moving clears the user position that belonged to the old place', () => {
    const s = world();
    s.player.body.position = 'standing by the packs';
    travel(s, 'Docks');
    assert.equal(s.player.body.position, '');
    assert.match(s.scene.note, /has just walked to Docks .*and is now there/);
    const t2 = world();
    t2.player.body.position = 'by the stall';
    assert.equal(applyPatch(t2, { move_to: 'docks' }).player.body.position, '');
    assert.equal(applyPatch(world(), { move_to: 'docks', you: { position: 'on the pier' } }).player.body.position, 'on the pier');
});

t('movementHint spots places and comings and goings', () => {
    const s = world();
    assert.ok(movementHint(s, "I'll be at the docks. Ten minutes."));
    assert.ok(movementHint(s, 'She walks away without a word.'));
    assert.ok(movementHint(s, 'Old Tom arrives, dripping.'));
    assert.ok(!movementHint(s, 'She smiles and keeps working the stall.'));
    assert.ok(!movementHint(s, 'The market square is loud today.'), 'the current place is not a destination');
});

t('the HUD shows background people bare and keeps truth for the all mode', () => {
    const s = flat();
    s.npcs.find(n => n.id === 'fern').hidden = 'she set this up herself';
    const v = perceive(s, 'senses', { userName: 'Alex' });
    assert.deepEqual(v.people.map(p => [p.label, p.main]), [['Fern', true], ['Alex', true], ['a dock guard', false]]);
    const guard = v.people.find(p => p.id === 'guard');
    assert.deepEqual([guard.body, guard.mind, guard.holding, guard.avatar], [[], [], [], '']);
    assert.equal(v.people[0].truth, undefined);
    assert.deepEqual(perceive(s, 'all').people[0].truth, ['she set this up herself', 'she set this up']);
});

t('brief: main people carry their hidden truth, background people one compact line', () => {
    const s = flat();
    s.npcs.find(n => n.id === 'fern').hidden = 'still tied under the sheet';
    const b = sceneBrief(s);
    assert.match(b, /Here: Fern \(ranger\) — cuffed, humiliated \[unknown to \{\{user\}\}: still tied under the sheet\]/);
    assert.match(b, /Also here: Hal \(dock guard; name unknown to \{\{user\}\}\)/);
});

t('director: state lines only for main people; contract covers perception and agency', () => {
    const s = flat();
    s.npcs.find(n => n.id === 'guard').tags = ['yawning'];
    const p = directorPrompt(s, 'Alex: hi', {}, { fern: 'Fern sheet' });
    assert.ok(p.includes('STATE fern:'));
    assert.ok(!p.includes('STATE guard'), 'background people get no state line');
    for (const x of ['"hidden"', 'background', 'what {{user}} actually noticed', 'some time alone?', 'Animals and people are never items', "only when {{user}}'s own message"]) assert.ok(p.includes(x), x);
    assert.ok(p.length < 3600, `director prompt is ${p.length} chars`);
});

t('models: parseModels maps prices per million and skips bad rows', () => {
    const rows = parseModels({ data: [
        { id: 'a/b', name: 'A', context_length: 1000, pricing: { prompt: '0.0000001', completion: '0.000001' }, supported_parameters: ['reasoning'] },
        { name: 'no id' }, null, { id: 'c/d' },
    ] });
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], { id: 'a/b', name: 'A', ctx: 1000, inPerM: 0.1, outPerM: 1, reasoning: true });
    assert.deepEqual(parseModels({}), []);
});

t('models: modelOptions pins recommended ids, filters by query, caps', () => {
    const list = parseModels({ data: [
        { id: 'x/cheap', name: 'Cheap', pricing: { prompt: '0', completion: '0.0000001' } },
        { id: 'deepseek/deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash', pricing: { prompt: '0.00000004', completion: '0.00000063' } },
        { id: 'anthropic/claude-haiku-5.5', name: 'Haiku 5.5', pricing: { prompt: '0.000001', completion: '0.000005' } },
        { id: 'y/pricey', name: 'Pricey', pricing: { prompt: '0.00001', completion: '0.00005' } },
    ] });
    assert.deepEqual(modelOptions(list).map(m => m.id), ['deepseek/deepseek-v4.1-flash', 'anthropic/claude-haiku-5.5', 'x/cheap', 'y/pricey']);
    assert.deepEqual(modelOptions(list, 'HAIKU').map(m => m.id), ['anthropic/claude-haiku-5.5']);
    assert.equal(modelOptions(list, '', 2).length, 2);
    assert.ok(RECOMMENDED.includes('deepseek/deepseek-v4.1-flash'));
});

t('models: effort ladder steps down only on a reasoning rejection', async () => {
    const seen = [];
    const ok = await withLadder(async e => { seen.push(e); if (e !== '') throw new Error('Bad Request 400 reasoning.effort: Invalid option'); return 'fine'; });
    assert.equal(ok, 'fine');
    assert.deepEqual(seen, ['none', 'minimal', '']);
    let calls = 0;
    await assert.rejects(withLadder(async () => { calls++; throw new Error('network down'); }), /network down/);
    assert.equal(calls, 1);
    calls = 0;
    await assert.rejects(withLadder(async () => { calls++; throw new Error('400 Bad Request: model not found'); }), /model not found/);
    assert.equal(calls, 1, 'a 400 about the model is not retried');
    calls = 0;
    const ok2 = await withLadder(async e => { calls++; if (e !== 'minimal') throw new Error('Bad Request'); return 'fine'; });
    assert.deepEqual([ok2, calls], ['fine', 2], 'ST only reports "Bad Request": that still steps the effort down');
    calls = 0;
    await assert.rejects(withLadder(async () => { calls++; throw new Error('Response not OK'); }), /Response not OK/);
    assert.equal(calls, 3, 'a bare rejection tries every step, then gives up');
});

t('models: key errors read as an instruction; mode migration keeps profiles', () => {
    assert.match(friendlyOpenRouterError(new Error('401 Unauthorized')).message, /No usable OpenRouter API key/);
    assert.equal(friendlyOpenRouterError(new Error('boom')).message, 'boom');
    assert.match(friendlyOpenRouterError(new Error('Response not OK')).message, /did not accept the request/);
    assert.equal(migrateModelMode({ profileId: 'p1' }), 'profile');
    assert.equal(migrateModelMode({}), 'current');
    assert.equal(migrateModelMode({ modelMode: 'model', profileId: 'p1' }), 'model');
});

t('dossier: addLearned dedupes, coerces kinds, clamps, and caps by role', () => {
    const npc = { id: 'mara', main: true, learned: [] };
    const a = addLearned(npc, [{ k: 'like', t: 'Likes tea' }, { k: 'like', t: 'likes tea.' }, { k: 'weird', t: 'x'.repeat(300) }, { t: 'a' }, { t: 'b' }], 'D1 09:00');
    assert.equal(a.length, 3, 'three per call');
    assert.equal(npc.learned[1].k, 'other');
    assert.equal(npc.learned[1].t.length, 120);
    assert.equal(addLearned(npc, [{ k: 'like', t: 'LIKES TEA' }], 'D1 09:05').length, 0);
    const bg = { id: 'tom', main: false, learned: [] };
    for (let i = 0; i < 4; i++) addLearned(bg, [{ k: 'history', t: `fact ${i}a` }, { k: 'history', t: `fact ${i}b` }], 'D1');
    assert.equal(bg.learned.length, 6, 'background people keep 6');
    assert.equal(bg.learned.at(-1).t, 'fact 3b', 'newest kept');
    const big = { id: 'b', main: true, learned: [] };
    for (let i = 0; i < 8; i++) addLearned(big, [{ k: 'like', t: `thing ${i}a` }, { k: 'like', t: `thing ${i}b` }], 'D1');
    assert.equal(big.learned.length, 14);
});

t('dossier: weak kinds are dropped first when full', () => {
    const npc = { id: 'p', main: false, learned: [] };
    addLearned(npc, [{ k: 'trait', t: 'quiet' }, { k: 'bond', t: 'owes me' }, { k: 'promise', t: 'will help' }], 'D1');
    addLearned(npc, [{ k: 'like', t: 'cats' }, { k: 'like', t: 'dogs' }, { k: 'like', t: 'birds' }], 'D1');
    addLearned(npc, [{ k: 'like', t: 'fish' }], 'D1');
    assert.ok(!npc.learned.some(f => f.t === 'quiet'), 'the trait went first');
    assert.ok(npc.learned.some(f => f.t === 'owes me'));
});

t('dossier: a patch records facts for known people only, reports fresh ones, never repeats', () => {
    const s = world();
    const patch = { learned: [{ id: 'mara', k: 'like', t: 'Loves the smell of tar' }, { id: 'ghost', k: 'like', t: 'nothing' }, 'junk', null] };
    const next = applyPatch(s, patch);
    const mara = () => next.npcs.find(n => n.id === 'mara');
    assert.deepEqual(mara().learned.map(f => f.t), ['Loves the smell of tar']);
    assert.deepEqual(next.scene.fresh, [{ id: 'mara', t: 'Loves the smell of tar' }]);
    assert.ok(mara().learned[0].at.startsWith('D'), 'dated with the world clock');
    const again = applyPatch(next, patch);
    assert.equal(again.npcs.find(n => n.id === 'mara').learned.length, 1);
    assert.deepEqual(again.scene.fresh, []);
    assert.doesNotThrow(() => applyPatch(again, { learned: 'nope' }));
});

t('dossier: v3 worlds load with empty dossiers; the narrator note never carries them', () => {
    const v3 = normalizeState({ version: 3, locations: [{ id: 'a', name: 'A' }], npcs: [{ id: 'x', name: 'X', locationId: 'a', main: true }] });
    assert.equal(v3.version, 4);
    assert.deepEqual(v3.npcs[0].learned, []);
    const s = world();
    const before = sceneBrief(s);
    s.npcs[0].learned = [{ k: 'like', t: 'Secret recipe', at: 'D1' }];
    assert.equal(sceneBrief(s), before);
    assert.ok(!buildInjection(s).includes('Secret recipe'));
});

t('dossier: the director sees the contract and what is already recorded', () => {
    const s = world();
    s.npcs[0].learned = [{ k: 'like', t: 'Loves tar', at: 'D1' }];
    const p = directorPrompt(s, 'Alex: hi', {});
    assert.ok(p.includes('"learned"') && p.includes('never hidden facts'));
    assert.ok(p.includes('KNOWN mara: Loves tar'));
});

t('dossier: notes and deletions live outside the world and merge on top of it', () => {
    const npc = { id: 'mara', learned: [{ k: 'like', t: 'Loves tar', at: 'D1' }, { k: 'history', t: 'Left home at 12', at: 'D1' }] };
    const store = normNotes(null);
    assert.deepEqual(mergedFacts(npc, store).map(f => f.t), ['Loves tar', 'Left home at 12']);
    hideFact(store, factKey(npc, npc.learned[0]));
    const note = addNote(store, 'mara', 'Ask about the harbour', 'D1 10:00');
    assert.deepEqual(mergedFacts(npc, store).map(f => f.t), ['Left home at 12', 'Ask about the harbour']);
    assert.equal(mergedFacts(npc, store).at(-1).own, true);
    npc.learned.push({ k: 'like', t: 'LOVES TAR!', at: 'D2' });
    assert.equal(mergedFacts(npc, store).filter(f => /tar/i.test(f.t)).length, 0, 'a deleted fact stays deleted when the director repeats it');
    removeNote(store, 'mara', note.id);
    assert.equal(store.notes.mara, undefined);
    const roundTrip = normNotes(JSON.parse(JSON.stringify(store)));
    assert.deepEqual(roundTrip.hidden, store.hidden);
    assert.equal(addNote(store, 'mara', '   ', 'D1'), null);
});

t('HUD: what you learned shows on the person, fresh ones are flagged, notes ride along, truth stays out', () => {
    const s = world();
    const mara = s.npcs.find(n => n.id === 'mara');
    mara.hidden = 'she poisoned the well';
    mara.secrets = ['owes the smugglers'];
    const next = applyPatch(s, { learned: [{ id: 'mara', k: 'like', t: 'Loves the smell of tar' }] });
    const notes = normNotes(null);
    addNote(notes, 'mara', 'Ask about the harbour', 'D1');
    const view = perceive(next, 'senses', { notes });
    const row = view.people.find(p => p.id === 'mara');
    assert.deepEqual(row.learned.map(f => [f.t, f.own, f.fresh]), [['Loves the smell of tar', false, true], ['Ask about the harbour', true, false]]);
    assert.deepEqual(view.fresh, ['Mara']);
    assert.ok(!JSON.stringify(view).includes('poisoned') && !JSON.stringify(view).includes('smugglers'), 'no hidden truth in senses mode');
    assert.deepEqual(view.people.find(p => p.isYou).learned, []);
    const later = applyPatch(next, {});
    assert.deepEqual(perceive(later, 'senses', { notes }).fresh, [], 'only the last update is fresh');
    assert.deepEqual(perceive(later, 'senses').people.find(p => p.id === 'mara').learned.map(f => f.t), ['Loves the smell of tar'], 'works without a notes store');
});

t('HUD: a stranger keeps a description label in the dossier view, and open threads carry ids for hints', () => {
    const s = world();
    s.npcs.find(n => n.id === 'mara').nameKnown = false;
    const view = perceive(s, 'senses');
    assert.equal(view.people.find(p => p.id === 'mara').label, 'a fishmonger');
    s.events = [{ id: 'smoke', name: 'Smoke on the hill', status: 'active', known: true }];
    assert.ok(perceive(s, 'senses').scene.threadRefs.some(t => t.id === 'smoke' && t.name === 'Smoke on the hill'));
});

t('faces: monogram is stable, ignores articles, survives empty names', () => {
    assert.deepEqual(monogram('Fern').letter, 'F');
    assert.equal(monogram('fern').hue, monogram('FERN').hue);
    assert.equal(monogram('a fishmonger').letter, 'F');
    assert.equal(monogram('').letter, '?');
    assert.equal(monogram(null).letter, '?');
    assert.ok(monogram('Mara').hue >= 0 && monogram('Mara').hue < 360);
});

t('faces: pickSprite prefers the mood, then neutral, then anything', () => {
    const sprites = [{ label: 'joy', path: '/a.png' }, { label: 'neutral', path: '/b.png' }];
    assert.equal(pickSprite(sprites, 'joy'), '/a.png');
    assert.equal(pickSprite(sprites, 'anger'), '/b.png');
    assert.equal(pickSprite([{ label: 'sad', path: '/c.png' }], 'anger'), '/c.png');
    assert.equal(pickSprite([], 'joy'), '');
    assert.equal(pickSprite(null, 'joy'), '');
    assert.equal(spriteFolder({ name: 'Seraphina', avatar: 'default_Seraphina.png' }, []), 'Seraphina', 'folder is the card name, not the file name');
    assert.equal(spriteFolder({ name: 'Seraphina', avatar: 'default_Seraphina.png' }, [{ name: 'default_Seraphina', path: 'Sera/outfit' }]), 'Sera/outfit');
    assert.equal(spriteFolder(null), '');
});

function hintWorld() {
    const s = world();
    s.npcs.find(n => n.id === 'mara').hidden = 'she poisoned the well';
    s.npcs.find(n => n.id === 'mara').secrets = ['owes the smugglers'];
    s.npcs.find(n => n.id === 'mara').mind = { mood: 'wary?', wants: 'a quiet word?', toward: '' };
    s.npcs.find(n => n.id === 'mara').appearance = 'scar across the left palm nobody has seen';
    s.npcs.find(n => n.id === 'mara').tags = ['gutting fish'];
    s.npcs.find(n => n.id === 'tom').nameKnown = false;
    s.events = [{ id: 'smoke', name: 'Smoke on the hill', status: 'active', known: true }];
    return applyPatch(s, { learned: [{ id: 'mara', k: 'like', t: 'Loves the smell of tar' }] });
}

t('hints: the brief is built from the perceived view and never leaks hidden truth', () => {
    const s = hintWorld();
    const view = perceive(s, 'senses');
    const brief = hintBrief(view);
    assert.ok(brief.includes('mara=Mara') && brief.includes('Loves the smell of tar') && brief.includes('gutting fish') && brief.includes('smoke=Smoke on the hill'));
    for (const secret of ['poisoned', 'smugglers', 'scar across']) assert.ok(!brief.includes(secret), secret);
    assert.ok(brief.length <= 1200);
    const prompt = hintPrompt(view, 'options', 'Mara looks up.');
    assert.ok(prompt.includes('first person') && prompt.includes('Never speak, think or decide for {{user}}'));
    assert.ok(hintPrompt(view, 'nudge').includes('gentle nudge'));
});

t('hints: parse keeps ideas that rest on something known, clamps, dedupes, caps at four', () => {
    const view = perceive(hintWorld(), 'senses');
    const raw = '```json\n' + JSON.stringify({ hints: [
        { text: 'I ask Mara about the harbour.', src: 'mara' },
        { text: 'i ask mara about the harbour.', src: 'mara' },
        { text: 'I follow the stranger to the temple.', src: 'ghost' },
        { text: 'I pick up the key.', src: 'key' },
        { text: 'x'.repeat(200), src: 'docks' },
        { text: 'I look into the smoke.', src: 'smoke' },
        { text: 'I do one more thing.', src: 'mara' },
        null,
    ] }) + '\n```';
    const hints = parseHints(raw, view);
    assert.deepEqual(hints.map(h => h.src), ['mara', 'key', 'docks', 'smoke']);
    assert.equal(hints[2].text.length, 90);
    assert.deepEqual(parseHints('not json at all', view), []);
    assert.deepEqual(parseHints('{"hints":"nope"}', view), []);
});

t('dossier: a learned list nested inside an npc entry cannot wipe or bypass the dossier', () => {
    const s = world();
    const mara = s.npcs.find(n => n.id === 'mara');
    mara.learned = [{ k: 'like', t: 'Loves tar', at: 'D1' }, { k: 'history', t: 'Left home at 12', at: 'D1' }];
    const next = applyPatch(s, { npcs: [{ id: 'mara', learned: [{ k: 'like', t: 'Figs' }] }] });
    assert.deepEqual(next.npcs.find(n => n.id === 'mara').learned.map(f => f.t), ['Loves tar', 'Left home at 12', 'Figs'], 'added, not replaced');
    const wiped = applyPatch(next, { npcs: [{ id: 'mara', learned: [] }] });
    assert.equal(wiped.npcs.find(n => n.id === 'mara').learned.length, 3, 'an empty list does not wipe');
    const ghost = applyPatch(wiped, { npcs: [{ id: 'tom', learned: ['Hates the sea', 'a', 'b', 'c', 'd'] }] });
    assert.equal(ghost.npcs.find(n => n.id === 'tom').learned.length, 3, 'the three-per-update cap still applies');
});

t('dossier: a deleted fact stays deleted when the director files it under another kind', () => {
    const npc = { id: 'mara', learned: [{ k: 'trait', t: 'Hates the sea', at: 'D1' }] };
    const store = normNotes(null);
    hideFact(store, factKey(npc, npc.learned[0]));
    npc.learned = [{ k: 'dislike', t: 'hates the sea.', at: 'D1' }];
    assert.equal(mergedFacts(npc, store).length, 0);
});

t('scenery: placeKind picks a kind from free text and never throws', () => {
    assert.equal(placeKind('plaza', 'Market Square'), 'city');
    assert.equal(placeKind('harbor', 'Docks'), 'harbor');
    assert.equal(placeKind('', 'The Gilded Stag'), 'default');
    assert.equal(placeKind(null, undefined), 'default');
    assert.equal(placeKind('Taverne', ''), 'default', 'non-English is not guessed');
    assert.equal(placeKind('cellar', 'Old Cellar'), 'cave');
});

t('scenery: artSlot maps four slots to two pictures', () => {
    assert.deepEqual(['dawn', 'day', 'dusk', 'night', 'bogus'].map(artSlot), ['day', 'day', 'night', 'night', 'day']);
});

t('scenery: skyOf differs per slot and the grade is capped', () => {
    assert.ok(skyOf('night', 'clear').dim > skyOf('day', 'clear').dim);
    assert.ok(skyOf('night', 'storm').dim <= 0.55);
    assert.ok(skyOf('day', 'storm').dim > skyOf('day', 'clear').dim, 'bad weather darkens');
    assert.notEqual(skyOf('day', 'clear').top, skyOf('night', 'clear').top);
    assert.ok(skyOf('nonsense', 'nonsense').top, 'unknown input still gives a sky');
});

t('scenery: particleSpec follows the weather and respects reduced motion', () => {
    assert.equal(particleSpec('rainy', 'day').kind, 'rain');
    assert.equal(particleSpec('eldritch glow', 'day').kind, null);
    assert.equal(particleSpec('', 'day').kind, null);
    assert.ok(particleSpec('storm', 'day').count > particleSpec('rain', 'day').count);
    assert.equal(particleSpec('snowing', 'night').kind, 'snow');
    assert.equal(particleSpec('misty', 'dawn').kind, 'fog');
    assert.equal(particleSpec('hot', 'day').kind, 'dust');
    assert.deepEqual(particleSpec('snow', 'day', true), { kind: null, count: 0 });
});

t('backdrop: the old tint checkbox migrates to the new mode, an existing mode wins', () => {
    assert.equal(migrateBackdrop({ ambientEffects: false }), 'off');
    assert.equal(migrateBackdrop({ ambientEffects: true }), 'tint');
    assert.equal(migrateBackdrop({}), 'tint');
    assert.equal(migrateBackdrop({ backdrop: 'scene', ambientEffects: false }), 'scene');
    assert.equal(migrateBackdrop({ backdrop: 'bogus' }), 'tint', 'an unknown mode falls back');
});

t('backdrop: every place kind has a silhouette and unknown kinds fall back', () => {
    for (const k of PLACE_KINDS) assert.match(silhouetteSvg(k), /^<svg[\s\S]*<\/svg>$/, k);
    assert.equal(silhouetteSvg('bogus'), silhouetteSvg('default'));
    for (const k of PLACE_KINDS) assert.ok(silhouetteSvg(k).length <= 1100, `${k} stays small`);
});

t('backdrop: the settings screen offers the backdrop mode instead of the old tint checkbox', () => {
    const html = readFileSync(new URL('../settings.html', import.meta.url), 'utf8');
    assert.ok(html.includes('data-iw-setting="backdrop"'));
    assert.ok(html.includes('data-iw-setting="particles"'));
    assert.ok(!html.includes('data-iw-setting="ambientEffects"'));
});

t('particles: makeParticles fills the box and caps the count', () => {
    let n = 0;
    const seq = () => ((n = (n + 0.37) % 1));
    const list = makeParticles('rain', 10, 800, 600, seq);
    assert.equal(list.length, 10);
    assert.ok(list.every(p => p.x >= 0 && p.x <= 800 && p.y >= 0 && p.y <= 600));
    assert.equal(makeParticles('rain', 5000, 800, 600, seq).length, 300);
    assert.deepEqual(makeParticles(null, 10, 800, 600), []);
    assert.deepEqual(makeParticles('none', 10, 800, 600), []);
});

t('particles: rain falls and wraps, snow drifts sideways', () => {
    const rain = [{ x: 10, y: 590, vx: 40, vy: 600, r: 1, a: 1 }];
    stepParticles(rain, 'rain', 800, 600, 0.05);
    assert.ok(Math.abs(rain[0].y - 20) < 1e-9, '590 + 600 * 0.05 wraps to 20');
    const fall = [{ x: 10, y: 100, vx: 0, vy: 600, r: 1, a: 1 }];
    stepParticles(fall, 'rain', 800, 600, 0.05);
    assert.ok(fall[0].y > 100, 'rain moves down');
    const snow = makeParticles('snow', 5, 800, 600, () => 0.5);
    assert.ok(snow.every(p => p.vx !== 0), 'snow drifts');
    const wrap = [{ x: 799, y: 10, vx: 100, vy: 0, r: 1, a: 1 }];
    stepParticles(wrap, 'snow', 800, 600, 0.5);
    assert.ok(wrap[0].x >= 0 && wrap[0].x <= 800, 'wraps sideways');
});

t('hud strip: perceive hands the scene art kind, slot and weather and nothing from the description', () => {
    const w = world();
    w.locations.find(l => l.id === 'market').description = 'SECRET-DESCRIPTION trapdoor under the fishmonger';
    const art = perceive(w, 'senses').scene.art;
    assert.deepEqual(art, { kind: 'city', slot: 'dawn', weather: 'rain' });
    assert.ok(!JSON.stringify(art).includes('SECRET'));
    w.locations.find(l => l.id === 'market').type = '';
    w.locations.find(l => l.id === 'market').name = 'The Gilded Stag';
    assert.equal(perceive(w, 'senses').scene.art.kind, 'default');
});

t('scenery review: real director weather wording is understood', () => {
    for (const [text, kind] of [['light rain', 'rain'], ['Heavy rain', 'rain'], ['rain showers', 'rain'], ['heavy snow', 'snow'], ['thick fog', 'fog'], ['thunder and rain', 'storm'], ['partly cloudy', 'cloudy'], ['Clear skies', 'clear'], ['', 'clear'], ['eldritch glow', 'clear']]) {
        assert.equal(weatherKind(text), kind, text);
    }
    assert.equal(particleSpec('light rain', 'day').kind, 'rain');
    assert.equal(particleSpec('thick fog', 'day').kind, 'fog');
    assert.ok(skyOf('day', 'heavy rain').dim > skyOf('day', 'clear').dim);
    assert.deepEqual(skyOf('day', 'eldritch glow'), skyOf('day', 'clear'), 'unknown weather is clear');
    assert.equal(weatherClass({ clock: { weather: 'light rain' } }), 'rain', 'the engine and the scenery agree');
});

t('scenery review: the place type wins over words in its name, and names still work alone', () => {
    assert.equal(placeKind('tavern', 'The Street Cat'), 'tavern');
    assert.equal(placeKind('inn', 'The Gate House'), 'tavern');
    assert.equal(placeKind('shop', 'Old Town Bakery'), 'market');
    assert.equal(placeKind('', 'back alley'), 'city');
    assert.equal(placeKind('place', 'Old Cellar'), 'cave', 'a vague type falls through to the name');
});

t('backdrop review: weather changes the painted scene key and the grade; only windows use evenodd', () => {
    assert.notEqual(pictureKey('scene', 'city', 'day', 'clear'), pictureKey('scene', 'city', 'day', 'storm'));
    assert.equal(pictureKey('scene', 'city', 'night', 'clear'), pictureKey('scene', 'city', 'night', 'clear'));
    assert.equal(pictureKey('scene', 'city', 'night', 'clear'), pictureKey('scene', 'city', 'night', 'bogus-weather-twice'.replace('-twice', '')), 'unknown weather keys like clear');
    assert.equal(pictureKey('tint', 'city', 'day', 'clear'), '');
    assert.equal(pictureKey('art', 'city', 'day', 'clear', '/img/a.png'), 'art:/img/a.png');
    assert.ok(gradeOf('scene', 'day', 'storm') > gradeOf('scene', 'day', 'clear'), 'storms are darker in a painted scene');
    assert.ok(gradeOf('scene', 'night', 'clear') > gradeOf('scene', 'day', 'clear'));
    assert.ok(gradeOf('scene', 'night', 'storm') <= 0.55);
    assert.ok(!silhouetteSvg('market').includes('evenodd'), 'overlaps must not cut holes');
    assert.ok(silhouetteSvg('tavern').includes('evenodd') && silhouetteSvg('interior').includes('evenodd'));
    assert.ok(readFileSync(new URL('../settings.html', import.meta.url), 'utf8').includes('for="iw-backdrop-mode"'), 'label points at the select');
    assert.equal(sanitizeBackdrop({ backdrop: 'bogus', ambientEffects: false }), 'off');
    assert.equal(sanitizeBackdrop({ backdrop: 'scene' }), 'scene');
});

t('scenery review: the light slot is stable across midnight', () => {
    const at = time => timeSlot({ clock: { time } });
    assert.equal(at('23:59'), 'night');
    assert.equal(at('00:01'), 'night');
    assert.equal(artSlot(at('23:59')), artSlot(at('00:01')));
});

t('art: store normalises junk, keys are stable, counts and drops work', () => {
    assert.deepEqual(normArt('junk'), { v: 1, items: {} });
    assert.deepEqual(normArt({ v: 1, items: { a: { url: 'x'.repeat(600), at: 't' }, b: { url: '/img/b.png', at: 't' }, c: { url: '' }, d: 'str' } }).items, { b: { url: '/img/b.png', at: 't' } });
    assert.equal(artKey('place', 'docks', 'night'), 'place:docks:night');
    assert.equal(artKey('place', 'docks', 'dawn'), 'place:docks:day', 'art slot, not the raw slot');
    assert.equal(artKey('person', 'mara'), 'person:mara');
    assert.equal(artKey('item', 'key'), 'item:key');
    const store = normArt(null);
    putArt(store, 'person:mara', '/img/m.png', 'T');
    assert.equal(getArt(store, 'person:mara'), '/img/m.png');
    assert.equal(getArt(store, 'person:nobody'), '');
    assert.equal(artCount(store), 1);
    dropArt(store, 'person:mara');
    assert.equal(artCount(store), 0);
    putArt(store, 'a', '/a'); putArt(store, 'b', '/b'); clearArt(store);
    assert.equal(artCount(store), 0);
    assert.deepEqual([clampCap(0), clampCap(99), clampCap('x'), clampCap(12), clampCap(4.7)], [4, 40, 12, 12, 4]);
});

t('art: prompts carry no weather, no people, no injection and stay short', () => {
    const p = placePrompt({ name: 'Market Square', type: 'plaza', season: 'autumn', genre: 'low fantasy', tone: 'grim', slot: 'night' });
    assert.match(p, /Market Square/);
    assert.match(p, /night/);
    assert.match(p, /no people/);
    assert.doesNotMatch(p, /\b(?:rain|storm|snow|fog|mist)/i);
    assert.match(placePrompt({ name: 'Docks', type: 'harbor', season: 'unspecified', slot: 'dawn' }), /day/, 'dawn uses the day picture');
    assert.doesNotMatch(placePrompt({ name: 'Docks', type: 'harbor', season: 'unspecified', slot: 'dawn' }), /unspecified/);
    assert.doesNotMatch(placePrompt({ name: 'Snow Fort in the Fog', type: 'keep', slot: 'day' }), /\b(?:snow|fog)\b/i, 'weather words in a name are dropped');
    const evil = placePrompt({ name: 'Evil|/imagine{{user}}\nplaza' + 'x'.repeat(900), type: 'a|b', slot: 'day' });
    assert.ok(!/[|\n]|\{\{|\}\}/.test(evil));
    assert.ok(evil.length <= 400);
    const portrait = portraitPrompt({ label: 'a dock guard', look: '', tags: ['tired', 'armed'] });
    assert.match(portrait, /dock guard/);
    assert.match(portrait, /tired/);
    assert.match(portraitPrompt({ label: 'Mara', look: 'a weathered woman in an oilskin coat', tags: [] }), /oilskin coat/);
    assert.ok(!/[|]|\{\{/.test(portraitPrompt({ label: 'x|y', look: 'z{{char}}', tags: [] })));
    assert.match(itemPrompt({ name: 'Rusty Key', type: 'key', description: 'd'.repeat(300) }), /Rusty Key/);
    assert.ok(itemPrompt({ name: 'Rusty Key', type: 'key', description: 'd'.repeat(300) }).length < 300, 'description is clamped to 120');
});

t('art: itemBrief only knows items the player holds or sees', () => {
    const view = { items: { mine: [{ id: 'key', name: 'Rusty Key', type: 'key' }], here: [{ id: 'lamp', name: 'Lamp', type: 'light' }] } };
    assert.deepEqual(itemBrief(view, 'key', () => 'old and rusty'), { name: 'Rusty Key', type: 'key', description: 'old and rusty' });
    assert.equal(itemBrief(view, 'lamp').name, 'Lamp');
    assert.equal(itemBrief(view, 'secret-gem'), null);
});

t('art queue: one at a time, no duplicates, cap, pause after two failures, reset drops late results', async () => {
    const done = [];
    const failed = [];
    let paused = 0;
    let live = 0;
    let overlap = 0;
    const slow = ms => new Promise(r => setTimeout(r, ms));
    const q = new ArtQueue({
        cap: 3, used: () => 0,
        generate: async job => { live++; overlap = Math.max(overlap, live); await slow(5); live--; return job.prompt === 'bad' ? '' : `/img/${job.key}.png`; },
        onDone: (job, url) => done.push([job.key, url]), onFail: job => failed.push(job.key), onPause: () => paused++,
    });
    const job = (key, prompt = 'ok') => ({ key, prompt, kind: 'place', size: [1, 1] });
    assert.equal(q.enqueue(job('a')), 'queued');
    assert.equal(q.enqueue(job('a')), 'duplicate');
    assert.equal(q.enqueue(job('b')), 'queued');
    assert.equal(q.enqueue(job('c')), 'queued');
    assert.equal(q.enqueue(job('d')), 'capped', 'cap counts queued and running');
    await q.whenIdle();
    assert.deepEqual(done.map(d => d[0]), ['a', 'b', 'c']);
    assert.equal(overlap, 1, 'strictly one at a time');
    const capped = new ArtQueue({ cap: 2, used: () => 1, generate: async () => '/x' });
    assert.equal(capped.enqueue(job('p')), 'queued');
    assert.equal(capped.enqueue(job('q')), 'capped', 'what the store already holds counts');
    await capped.whenIdle();
    // Two failures in a row pause the queue until resume().
    const q2 = new ArtQueue({ cap: 10, generate: async j => (j.prompt === 'bad' ? '' : '/ok'), onFail: j => failed.push(j.key), onPause: () => paused++, onDone: () => {} });
    q2.enqueue(job('x1', 'bad')); q2.enqueue(job('x2', 'bad')); q2.enqueue(job('x3', 'bad'));
    await q2.whenIdle();
    assert.equal(paused, 1);
    assert.equal(q2.enqueue(job('x4')), 'paused');
    q2.resume();
    assert.equal(q2.enqueue(job('x5')), 'queued');
    await q2.whenIdle();
    // A throwing generator counts as a failure, never an unhandled rejection.
    const q3 = new ArtQueue({ cap: 10, generate: async () => { throw new Error('boom'); }, onFail: j => failed.push(j.key) });
    q3.enqueue(job('t1'));
    await q3.whenIdle();
    assert.ok(failed.includes('t1'));
    // reset() while a job runs: its late result is dropped and the queue is empty.
    const late = [];
    const q4 = new ArtQueue({ cap: 10, generate: async () => { await slow(15); return '/late'; }, onDone: (j, u) => late.push(u) });
    q4.enqueue(job('r1')); q4.enqueue(job('r2'));
    await slow(1);
    q4.reset();
    await slow(40);
    assert.deepEqual(late, [], 'nothing from the old epoch is stored');
    assert.equal(q4.pending, 0);
    assert.equal(q4.running, '');
});

t('art: the settings screen has the test button, the clear button, the cap and the generated option', () => {
    const html = readFileSync(new URL('../settings.html', import.meta.url), 'utf8');
    assert.ok(html.includes('id="iw-art-test"') && html.includes('id="iw-art-clear"'));
    assert.ok(html.includes('data-iw-setting="artCap"'));
    assert.ok(/<option value="art">/.test(html), 'the generated picture option is selectable');
    const index = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
    assert.ok(index.includes("`/imagine quiet=true"), 'pictures are drawn quietly: nothing is posted to the chat');
});

t('look: kept and trimmed, set once by the director, shown only for people you know', () => {
    const w = world();
    const mara = () => w.npcs.find(n => n.id === 'mara');
    assert.equal(normalizeState({ npcs: [{ name: 'X', look: 'l'.repeat(400) }] }).npcs[0].look.length, 200);
    assert.equal(mara().look, '', 'empty by default');
    const a = applyPatch(w, { npcs: [{ id: 'mara', look: 'a weathered woman in an oilskin coat' }] });
    assert.equal(a.npcs.find(n => n.id === 'mara').look, 'a weathered woman in an oilskin coat', 'set when empty');
    const b = applyPatch(a, { npcs: [{ id: 'mara', look: 'a different person entirely' }] });
    assert.equal(b.npcs.find(n => n.id === 'mara').look, 'a weathered woman in an oilskin coat', 'set once, then fixed');
    const fresh = applyPatch(b, { npcs: [{ id: 'newcomer', name: 'Newcomer', role: 'sailor', look: 'a tall sailor with a scarred chin', locationId: 'market' }] });
    assert.equal(fresh.npcs.find(n => n.id === 'newcomer').look, 'a tall sailor with a scarred chin', 'a new person arrives with one');
    const view = n => perceive(fresh, 'senses').people.find(p => p.id === n);
    const m = fresh.npcs.find(n => n.id === 'mara');
    m.known = false;
    assert.equal(view('mara')?.look ?? '', '', 'unknown people show no look');
    m.known = true;
    assert.equal(view('mara').look, 'a weathered woman in an oilskin coat');
    m.appearance = 'SECRET-APPEARANCE has a tattoo of the smugglers';
    assert.ok(!JSON.stringify(perceive(fresh, 'senses')).includes('SECRET-APPEARANCE'), 'appearance never reaches the view');
});

t('art queue: has() sees queued and running keys, and the settings offer item pictures', async () => {
    const slow = ms => new Promise(r => setTimeout(r, ms));
    const q = new ArtQueue({ cap: 5, generate: async () => { await slow(5); return '/x.png'; } });
    q.enqueue({ key: 'item:a', prompt: 'p', kind: 'item', size: [1, 1] });
    q.enqueue({ key: 'item:b', prompt: 'p', kind: 'item', size: [1, 1] });
    assert.ok(q.has('item:a') && q.has('item:b'), 'running and queued');
    assert.ok(!q.has('item:c'));
    await q.whenIdle();
    assert.ok(!q.has('item:a'), 'done keys are gone');
    assert.ok(readFileSync(new URL('../settings.html', import.meta.url), 'utf8').includes('data-iw-setting="artItems"'));
    const hud = readFileSync(new URL('../hud.js', import.meta.url), 'utf8');
    assert.ok(hud.includes('data-iw-art='), 'the item card has draw, redraw and remove buttons');
});

t('art review: real picture paths are accepted, junk is not', () => {
    for (const ok of ["/user/images/Seraphina's Tale/x_2026-10-13@12h00m.png", '/user/images/Élise/x.png', '/user/images/ミク/a.webp', 'user/images/Miyu (v2)/a.jpg', 'data:image/svg+xml;utf8,%3Csvg', 'https://x.test/y.png?x=1']) assert.ok(isImagePath(ok), ok);
    for (const bad of ['', 'undefined', 'Error: no backend', null, undefined, 42]) assert.ok(!isImagePath(bad), String(bad));
});

t('art review: nothing that could run as STscript, a macro or markup survives into a prompt', () => {
    const nasty = ['{: /echo hi :}()', '"unbalanced', '{}}{user}{{}', '&lt;img src=x onerror=alert(1)&gt;', '<b>x</b>', 'back\slash', '`tick`'];
    for (const n of nasty) {
        for (const out of [placePrompt({ name: n, type: n, season: n, genre: n, tone: n, slot: 'day' }), portraitPrompt({ label: n, look: n, tags: [n] }), itemPrompt({ name: n, type: n, description: n })]) {
            assert.ok(!/[{}"<>\`|]/.test(out), `${JSON.stringify(n)} -> ${out}`);
        }
    }
});

t('art review: reset() never lets two pictures draw at once, and the cap does not block the Test job', async () => {
    const slow = ms => new Promise(r => setTimeout(r, ms));
    let live = 0;
    let overlap = 0;
    const q = new ArtQueue({ cap: 10, generate: async () => { live++; overlap = Math.max(overlap, live); await slow(20); live--; return '/x.png'; } });
    const job = key => ({ key, prompt: 'p', kind: 'place', size: [1, 1] });
    q.enqueue(job('a'));
    await slow(2);
    q.reset();                      // a is still drawing
    assert.equal(q.enqueue(job('b')), 'queued');
    await q.whenIdle();
    await slow(30);
    assert.equal(overlap, 1, 'b waited for a to finish');
    const capped = new ArtQueue({ cap: 1, used: () => 5, generate: async () => '/t.png' });
    assert.equal(capped.enqueue(job('c')), 'capped');
    assert.equal(capped.enqueue({ ...job('test'), kind: 'test' }), 'queued', 'the Test button always runs');
    await capped.whenIdle();
    const index = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
    assert.ok(index.includes('extend=false') && index.includes('edit=false'), 'the user\'s own Image Generation prompt extending/editing must not apply');
});

let failed = 0;
for (const [name, fn] of tests) {
    try { await fn(); console.log(`  ok   ${name}`); } catch (e) { failed++; console.error(`FAIL  ${name}\n      ${e.message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
