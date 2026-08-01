// Refreshes data/speed.js — first-token latency and throughput, probed one request per
// model. Everything else the chart shows comes live from the edge function, so this is the
// only committed data left:  node scripts/refresh.mjs
//
// Speed is refreshed here rather than in the edge function because it costs one request per
// model. See the note on fetchSpeed in lib/shape.js.

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

// The prose header lives in its own file so regenerating the data can never mangle it.
const header = await readFile(join(root, 'data/speed.header.txt'), 'utf8');
const rows = Object.entries(speed)
  .map(([id, v]) => `  ${JSON.stringify(id)}: { lat: ${v.lat ?? null}, tps: ${v.tps ?? null} }`)
  .join(',\n');
await writeFile(join(root, 'data/speed.js'), `${header}export const SPEED = {\n${rows}\n};\n`);

console.log('wrote data/speed.js');
