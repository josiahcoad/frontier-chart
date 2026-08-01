// Edge function: the chart's data source.
//
// Caching is handled entirely by Vercel's edge cache — no database, no KV, no cron.
// `s-maxage=3600` means one origin fetch per hour globally no matter how much traffic the
// page gets, so OpenRouter sees ~24 requests a day. `stale-while-revalidate` means a cache
// miss never makes anyone wait: the visitor is served the previous copy instantly while
// the refresh happens behind them.

import { fetchModels } from '../lib/shape.js';

export const config = { runtime: 'edge' };

export default async function handler() {
  try {
    const models = await fetchModels();
    return Response.json(models, {
      headers: {
        'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (err) {
    // The page ships with a baked-in snapshot and ignores a failed fetch, so a bad
    // response here degrades to slightly stale data rather than an empty chart. Keep the
    // error uncached so a transient OpenRouter blip isn't pinned for an hour.
    return Response.json(
      { error: String(err) },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
