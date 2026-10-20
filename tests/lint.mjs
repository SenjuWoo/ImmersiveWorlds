// node tests/lint.mjs — every file the extension loads must at least parse.
// No dependencies, no config: this repo has no build step and should not grow one.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', '.git', 'docs', 'assets']);

const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (e.isDirectory()) return SKIP.has(e.name) ? [] : walk(join(dir, e.name));
    return e.name.endsWith('.js') ? [join(dir, e.name)] : [];
});

const files = walk(root).sort();
let bad = 0;
for (const f of files) {
    try {
        execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    } catch (e) {
        bad += 1;
        console.error(`FAIL ${f.slice(root.length + 1)}\n${(e.stderr ?? e.message).toString().trim()}`);
    }
}
console.log(`${files.length - bad}/${files.length} files parse`);
process.exit(bad ? 1 : 0);
