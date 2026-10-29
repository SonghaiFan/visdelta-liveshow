import { readdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
function scan(dir) { for (const entry of readdirSync(dir, { withFileTypes: true })) { const path = `${dir}/${entry.name}`; if (entry.isDirectory()) scan(path); else if (/\.(tsx?|mjs)$/.test(path)) { const text = readFileSync(path, 'utf8'); assert(!/visdelta\/(?:src|dist)|(?:\.\.\/)+visdelta\//.test(text), `Private dependency in ${path}`); } } }
for (const dir of ['app','components','examples','lib','server']) scan(dir);
console.log('Public VisDelta API boundary verified.');
