const axios = require("axios");

const PEXELS_API = "https://api.pexels.com/v1/search";

// Rate limiter: Pexels free tier allows 200 requests/hour.
// We stay under 180/hr (10% buffer) and enforce a minimum gap between requests.
const RATE = { maxPerHour: 180, minGapMs: 350 };
const _timestamps = []; // rolling window of request times (epoch ms)
let _lastRequestTime = 0;

async function _waitForRateLimit() {
  const now = Date.now();
  const oneHourAgo = now - 3_600_000;

  // Prune timestamps older than 1 hour
  while (_timestamps.length && _timestamps[0] < oneHourAgo) _timestamps.shift();

  // If hourly budget is full, wait until the oldest request rolls out
  if (_timestamps.length >= RATE.maxPerHour) {
    const waitUntil = _timestamps[0] + 3_600_000;
    const delay = waitUntil - Date.now();
    if (delay > 0) {
      console.warn(`  [pexels] Rate limit buffer reached (${_timestamps.length} req/hr), waiting ${Math.ceil(delay / 1000)}s`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  // Enforce minimum gap between consecutive requests
  const sinceLastReq = Date.now() - _lastRequestTime;
  if (sinceLastReq < RATE.minGapMs) {
    await new Promise(r => setTimeout(r, RATE.minGapMs - sinceLastReq));
  }

  _lastRequestTime = Date.now();
  _timestamps.push(_lastRequestTime);
}

/**
 * Search Pexels for images (requires PEXELS_API_KEY env var).
 * All Pexels photos are free to use; no attribution required.
 * Requests portrait orientation at the API level for mobile-first cards.
 *
 * @param {string} query
 * @param {{ signal?, maxCandidates? }} opts
 * @returns {Promise<NormalizedImage[]>}
 */
async function searchImages(query, opts = {}) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    console.warn("  [pexels] PEXELS_API_KEY not set — skipping");
    return [];
  }

  const { signal, maxCandidates = 20 } = opts;

  await _waitForRateLimit();

  const response = await axios.get(PEXELS_API, {
    params: {
      query,
      per_page: Math.min(maxCandidates, 80),
      orientation: "portrait", // mobile-first; request portrait at API level
    },
    signal,
    timeout: 8000,
    headers: { Authorization: apiKey },
  });

  const photos = response.data?.photos || [];
  return photos.map(photo => ({
    // Prefer portrait crop (800×1200), fall back to large, then original
    url: photo.src?.portrait || photo.src?.large || photo.src?.original,
    pageUrl: photo.url || null,
    license: "Pexels",
    author: photo.photographer || null,
    // Portrait src is always 800×1200; otherwise use reported dimensions
    width: photo.src?.portrait ? 800 : (photo.width || 0),
    height: photo.src?.portrait ? 1200 : (photo.height || 0),
    title: photo.alt || "",
    tags: [],
    provider: "pexels",
    attributionRequired: false,
  }));
}

module.exports = { searchImages };
