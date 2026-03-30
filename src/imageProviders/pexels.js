const axios = require("axios");

const PEXELS_API = "https://api.pexels.com/v1/search";

/**
 * Search Pexels for images (requires PEXELS_API_KEY env var).
 * All Pexels photos are free to use; no attribution required.
 * @param {string} query
 * @param {{ signal?, maxCandidates? }} opts
 * @returns {Promise<NormalizedImage[]>}
 */
async function searchImages(query, opts = {}) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return [];

  const { signal, maxCandidates = 20 } = opts;

  const response = await axios.get(PEXELS_API, {
    params: {
      query,
      per_page: Math.min(maxCandidates, 80),
      orientation: "portrait", // mobile-first preference
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
    // Pexels reports the original dimensions; portrait src is ~800×1200
    width: photo.src?.portrait ? 800 : photo.width || 0,
    height: photo.src?.portrait ? 1200 : photo.height || 0,
    title: photo.alt || "",
    tags: [],
    provider: "pexels",
    attributionRequired: false,
  }));
}

module.exports = { searchImages };
