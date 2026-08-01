# frontier-chart

Live at **https://frontier.josiahcoad.com**

Cost versus intelligence for the 100 highest-scoring models on OpenRouter, with the value
frontier drawn through them. One static page plus one edge function.

## How data gets in

```
OpenRouter /models
      │
      ├─ api/models.js  (edge)  ── cached 1h at the edge ──> the live page
      │
      └─ scripts/refresh.mjs    ── writes ──> data/speed.js
                                              index.html  (FALLBACK snapshot)
```

The page renders from the snapshot baked into `index.html` immediately, then replaces it
with whatever `/api/models` returns. If that fetch fails — OpenRouter is down, or you
opened the file straight off disk — the snapshot stays on screen and nothing looks broken.

**No database, no cron, no KV.** `Cache-Control: s-maxage=3600, stale-while-revalidate=86400`
does all the work: one origin fetch an hour globally regardless of traffic, and a cache miss
serves the previous copy instantly rather than making anyone wait.

## Refreshing the snapshot

```bash
node scripts/refresh.mjs
```

Rewrites `data/speed.js` and the `FALLBACK` block in `index.html`. Only affects the offline
copy — the live page is already current via the edge function. Worth running occasionally so
a first paint isn't visibly stale.

## Why speed data is committed

Every field except two refreshes live. First-token latency and throughput do not.

OpenRouter's `/models/{id}/endpoints` route exposes `latency_last_30m` and
`throughput_last_30m`, and they are the right numbers — but as of 2026-07-31 they return
`null` for every model probed (60 sampled, zero populated), while the sibling
`uptime_last_30m` returns fine. The values in `data/speed.js` were captured on 2026-07-25
when the route was populated.

`fetchSpeed()` in `lib/shape.js` still reads the route and prefers a live value over the
snapshot, so if OpenRouter repopulates the fields, re-running the refresh script picks them
up with no code change. It is called by the script and not the edge function because it
costs one request per model — a hundred extra round trips to collect a hundred nulls.

A model missing from the map renders in the chart's existing "no speed data" state: smallest
marker, gray, em dash in the table.

## Reading the chart

- **x** — blended price per million tokens, weighted 3 input : 1 output, log scale where
  every gridline is double the one before it.
- **y** — Artificial Analysis intelligence index (switchable to coding or agentic).
- **marker size** — time to first token, log-scaled.
- **marker colour** — throughput, three steps slow → fast.
- **× instead of a circle** — text-only model, no vision.
- **solid line** — the value frontier: no model is both cheaper and smarter than one on it.
- **dashed lines** — where that frontier sat every six months previously.

Prices include promotional discounts, so a model on promo can cost roughly double once the
promo ends. `oss` is derived from whether OpenRouter lists a Hugging Face repo, which tracks
downloadable weights rather than a specific licence.

## Local development

```bash
vercel dev          # or: node scripts/refresh.mjs && open index.html
```

Opening `index.html` directly works and exercises the fallback path — the `/api/models`
fetch just fails and is ignored.

## Credits

Scores are [Artificial Analysis](https://artificialanalysis.ai/)', surfaced through the
[OpenRouter](https://openrouter.ai/) API. Pricing, context, and open-weights status are
OpenRouter's.
