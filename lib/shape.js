// Turns OpenRouter's raw /models response into the compact rows the chart draws.
//
// This is the ONLY place the shape is defined. The edge function calls it on every cache
// miss; scripts/refresh-fallback.mjs calls it to regenerate the snapshot baked into
// index.html. Two copies of this logic would drift, and the drift would be silent.

import { SPEED } from '../data/speed.js';

const MODELS_URL = 'https://openrouter.ai/api/v1/models';
const ENDPOINTS_URL = (id) => `https://openrouter.ai/api/v1/models/${id}/endpoints`;

// How many models the chart shows, ranked by intelligence index.
const TOP_N = 100;

// The chart's x-axis is one blended price, not two. Most real workloads read far more
// than they write, so input is weighted 3:1 against output.
const blended = (pin, pout) => 0.75 * pin + 0.25 * pout;

// One request. The per-model speed probe is deliberately NOT done here — see fetchSpeed.
export async function fetchModels(speed = SPEED, fetchImpl = fetch) {
  const res = await fetchImpl(MODELS_URL);
  if (!res.ok) throw new Error(`OpenRouter returned ${res.status}`);

  const { data } = await res.json();
  return data
    .map((m) => toRow(m, speed))
    .filter((m) => m.i != null)
    .sort((a, b) => b.i - a.i)
    .slice(0, TOP_N);
}

// Reads first-token latency and throughput from the endpoints route, one request per
// model, and falls back to the committed snapshot wherever the API gives null.
//
// This is called by scripts/refresh-fallback.mjs, never by the edge function: a hundred
// extra requests would turn a ~300ms response into several seconds, and as of 2026-07-31
// every one of them comes back null anyway. Keeping it here rather than deleting it means
// that when OpenRouter repopulates the fields, re-running the script picks them up with no
// code change.
export async function fetchSpeed(ids, fetchImpl = fetch) {
  const out = { ...SPEED };
  await Promise.all(
    ids.map(async (id) => {
      try {
        const res = await fetchImpl(ENDPOINTS_URL(id));
        if (!res.ok) return;
        const { data } = await res.json();
        // Take the fastest endpoint that reports anything — that is the one a caller
        // hitting the model through OpenRouter's default routing would most likely land on.
        const live = (data?.endpoints ?? [])
          .filter((e) => e.latency_last_30m != null || e.throughput_last_30m != null)
          .sort((a, b) => (a.latency_last_30m ?? 1e9) - (b.latency_last_30m ?? 1e9))[0];
        if (!live) return;
        out[id] = {
          lat: live.latency_last_30m ?? out[id]?.lat ?? null,
          tps: live.throughput_last_30m != null ? Math.round(live.throughput_last_30m) : (out[id]?.tps ?? null),
        };
      } catch {
        // Leave the snapshot value in place; a probe failure must not blank real data.
      }
    }),
  );
  return out;
}

function toRow(m, speed) {
  // Scores come from Artificial Analysis, which OpenRouter embeds. A model without them
  // is dropped by the caller — there is no y-axis position for it.
  const aa = m.benchmarks?.artificial_analysis ?? {};

  // Prices arrive as dollars per single token, which is unreadable. Everything downstream
  // is per million.
  const pin = Number(m.pricing?.prompt ?? 0) * 1e6;
  const pout = Number(m.pricing?.completion ?? 0) * 1e6;

  // Speed comes from data/speed.js, refreshed by the script rather than per-request.
  // A model missing from it renders gray at the smallest size, which is already the
  // chart's existing "no speed data" state.
  const s = speed[m.id] ?? {};

  return {
    id: m.id,
    name: m.name,
    prov: m.id.split('/')[0],
    i: aa.intelligence_index ?? null,
    c: aa.coding_index ?? null,
    a: aa.agentic_index ?? null,
    pin: round(pin, 4),
    pout: round(pout, 4),
    b: round(blended(pin, pout), 4),
    ctx: m.context_length ?? null,
    t: m.created ?? null,
    vision: (m.architecture?.input_modalities ?? []).includes('image'),
    lat: s.lat ?? null,
    tps: s.tps ?? null,
    // A listed Hugging Face repo is the only machine-readable open-weights signal
    // OpenRouter gives. It tracks downloadable weights, not a specific licence.
    oss: Boolean(m.hugging_face_id),
  };
}

const round = (n, places) => Number(n.toFixed(places));
