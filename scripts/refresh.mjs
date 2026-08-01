// Refreshes the two committed artifacts:
//
//   data/speed.js  — latency + throughput, probed one request per model
//   index.html     — the FALLBACK snapshot inlined into the page
//
// The page fetches /api/models at runtime, so this snapshot only matters when that fetch
// fails or when someone opens index.html straight off disk. Run it whenever you want the
// offline copy to stop drifting:  node scripts/refresh.mjs
//
// Speed is refreshed here rather than in the edge function because it costs one request
// per model. See the note on fetchSpeed in lib/shape.js.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { fetchModels, fetchSpeed } from '../lib/shape.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const ids = (await fetchModels()).map((m) => m.id);
console.log(`fetched ${ids.length} models`);

const speed = await fetchSpeed(ids);
const live = ids.filter((id) => speed[id]?.lat != null || speed[id]?.tps != null).length;
console.log(`speed data for ${live}/${ids.length} models`);

await writeSpeed(speed);

// Re-shape with the speed map we just built, so the snapshot and the file agree.
const models = await fetchModels(speed);
await writeFallback(models);
console.log('wrote data/speed.js and index.html');

async function writeSpeed(map) {
  const rows = Object.entries(map)
    .map(([id, v]) => `  ${JSON.stringify(id)}: { lat: ${v.lat ?? null}, tps: ${v.tps ?? null} }`)
    .join(',\n');
  const header = await readFile(join(root, 'data/speed.header.txt'), 'utf8');
  await writeFile(join(root, 'data/speed.js'), `${header}export const SPEED = {\n${rows}\n};\n`);
}

// Swaps the array literal between the FALLBACK markers. Marker-delimited rather than a
// regex over the whole file so a stray "const FALLBACK" in a comment can't corrupt the page.
async function writeFallback(models) {
  const path = join(root, 'index.html');
  const html = await readFile(path, 'utf8');
  const open = '/* FALLBACK:start */';
  const close = '/* FALLBACK:end */';
  const a = html.indexOf(open);
  const b = html.indexOf(close);
  if (a === -1 || b === -1) throw new Error('FALLBACK markers missing from index.html');
  const next = `${open}${JSON.stringify(models)}${close}`;
  await writeFile(path, html.slice(0, a) + next + html.slice(b + close.length));
}
