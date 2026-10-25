// Guards the iOS 12 Safari ceiling: shipped JS must parse as ES2017,
// and CSS must avoid flexbox gap and aspect-ratio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function listJs(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return listJs(p);
    return e.name.endsWith('.js') ? [p] : [];
  });
}

for (const file of listJs(join(root, 'js'))) {
  test(`ES2017 syntax: ${file.slice(root.length + 1)}`, () => {
    const src = readFileSync(file, 'utf8');
    assert.doesNotThrow(() => parse(src, { ecmaVersion: 2017, sourceType: 'module' }));
  });
}

for (const name of readdirSync(root).filter((n) => n.endsWith('.css'))) {
  test(`Safari 12 CSS: ${name}`, () => {
    const css = readFileSync(join(root, name), 'utf8');
    assert.doesNotMatch(css, /(^|[^-])gap\s*:/m, 'flexbox gap is Safari 14.1+');
    assert.doesNotMatch(css, /aspect-ratio/, 'aspect-ratio is Safari 15+');
  });
}
